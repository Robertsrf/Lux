-- =====================================================================
-- Lux by Emory — cuántas personas abren el catálogo
-- Ejecutar en el SQL Editor DESPUÉS de esquema-abonos-ventas-por-verificar.sql
-- (usa es_personal() de esquema-revendedores.sql y reservas.origen de
-- esquema-abonos-y-apartados.sql)
--
-- QUÉ PIDIÓ EL DUEÑO (30/09/2026)
-- Un contador de visitas del catálogo en línea, a la vista en la pantalla
-- Catálogo de la administración y de la vendedora.
--
-- QUÉ ES UNA VISITA
-- Un teléfono que abre el catálogo, una vez por día. El navegador guarda un
-- número al azar la primera vez (no es un dato de nadie: ni nombre, ni
-- teléfono, ni cédula) y lo manda cada vez que abre el catálogo. Así:
--   - la clienta que recarga diez veces cuenta una visita, y aparte se
--     sabe cuántas veces lo abrió (`veces`);
--   - la que vuelve mañana cuenta otra, que es lo que interesa: volvió.
-- Quien tiene sesión es de la tienda y no cuenta: la vendedora que abre el
-- catálogo para mandarlo o para ver cómo se ve no infla la cifra.
--
-- LO QUE NO ES
-- No es una cifra de dinero ni sirve para cobrar nada: es para saber si el
-- enlace que se manda por WhatsApp se abre. Cualquiera sin sesión puede
-- llamar a `registrar_visita`, así que alguien con ganas podría inflarla;
-- no puede leer nada ni tocar otra cosa, y hay un tope por día.
-- No entra al respaldo: si se perdiera, no se pierde nada del negocio.
--
-- Reejecutable.
-- =====================================================================

create table if not exists catalogo_visitas (
  -- El día de Venezuela, como en la caja.
  dia        date        not null,
  visitante  uuid        not null,
  veces      integer     not null default 1,
  primera_en timestamptz not null default now(),
  ultima_en  timestamptz not null default now(),
  primary key (dia, visitante)
);

-- Nadie la lee ni la escribe en crudo: se escribe por `registrar_visita`
-- y se lee por `visitas_catalogo`.
alter table catalogo_visitas enable row level security;
revoke all on table catalogo_visitas from public, anon, authenticated;


-- Sin sesión: el catálogo público la llama al abrirse.
create or replace function registrar_visita(p_visitante uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_dia date := (now() at time zone 'America/Caracas')::date;
begin
  -- Con sesión es alguien de la tienda: no cuenta.
  if p_visitante is null or auth.uid() is not null then
    return;
  end if;
  -- Un día con más de veinte mil teléfonos distintos no es la clientela de
  -- una joyería: es alguien llamando a esta función en bucle.
  if (select count(*) from catalogo_visitas where dia = v_dia) >= 20000 then
    return;
  end if;

  insert into catalogo_visitas (dia, visitante)
  values (v_dia, p_visitante)
  on conflict (dia, visitante) do update
     set veces     = least(catalogo_visitas.veces + 1, 1000),
         ultima_en = now();
end;
$fn$;

revoke all on function registrar_visita(uuid) from public;
grant execute on function registrar_visita(uuid) to anon, authenticated;


-- La tienda (vendedora y administrador): un renglón por día, de hoy hacia
-- atrás, con los días sin visitas en cero. Solo cuentas: ni quién, ni el
-- número de su teléfono. `pedidos` son los que entraron por el catálogo ese
-- día, para ver cuántas visitas terminan en pedido.
create or replace function visitas_catalogo(p_dias integer default 30)
returns table (dia date, visitantes integer, veces integer, pedidos integer)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_hoy  date    := (now() at time zone 'America/Caracas')::date;
  v_dias integer := least(greatest(coalesce(p_dias, 30), 1), 366);
begin
  if not es_personal() then
    return;
  end if;

  return query
  select d.dia::date,
         coalesce(v.visitantes, 0)::integer,
         coalesce(v.veces, 0)::integer,
         coalesce(p.pedidos, 0)::integer
    from generate_series(v_hoy - (v_dias - 1), v_hoy, interval '1 day') as d(dia)
    left join (
      select cv.dia, count(*) as visitantes, sum(cv.veces) as veces
        from catalogo_visitas cv
       where cv.dia >= v_hoy - (v_dias - 1)
       group by cv.dia
    ) v on v.dia = d.dia::date
    left join (
      select (r.creado_en at time zone 'America/Caracas')::date as dia, count(*) as pedidos
        from reservas r
       where r.origen = 'catalogo'
         and r.creado_en >= ((v_hoy - (v_dias - 1))::timestamp at time zone 'America/Caracas')
       group by 1
    ) p on p.dia = d.dia::date
   order by d.dia desc;
end;
$fn$;

revoke all on function visitas_catalogo(integer) from public, anon;
grant execute on function visitas_catalogo(integer) to authenticated;
