-- =====================================================================
-- Lux by Emory — Fase 3: catalogo publico, armador de kits y reservas
-- Ejecutar en el SQL Editor DESPUES de la Fase 2.
--
-- LO PRIMERO QUE HACE ES CERRAR UNA FUGA
-- esquema.sql seccion 13 deja estas politicas:
--     reservas_leer_anon  ... for select to anon using (true)
--     ritems_leer_anon    ... for select to anon using (true)
-- Comprobado contra la base real: con solo abrir el enlace publico,
-- cualquiera podia leer el NOMBRE y el TELEFONO de todas las clientas que
-- hubieran reservado, y sus tokens. Ademas podia insertar reservas sin
-- limite ni control de existencia, es decir trabar el inventario entero.
--
-- La reserva pasa a ser una operacion de funcion: el publico no toca las
-- tablas. Ve su propia reserva por token y nada mas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. TRAMOS DE PRECIO AL MAYOR
-- El armador cobra "precio por tramo" segun cuantas piezas lleve.
-- Las cifras NO estan aqui: las carga el administrador. Sin tramos
-- definidos el armador se niega a cotizar, que es lo correcto.
-- ---------------------------------------------------------------------

create table if not exists tramos_mayoreo (
  id                   bigserial primary key,
  min_piezas           int not null check (min_piezas > 0),
  precio_por_pieza_usd numeric(12,4) not null check (precio_por_pieza_usd > 0),
  activo               boolean not null default true,
  creado_en            timestamptz not null default now(),
  unique (min_piezas)
);

alter table tramos_mayoreo enable row level security;

drop policy if exists tramos_leer  on tramos_mayoreo;
drop policy if exists tramos_admin on tramos_mayoreo;

create policy tramos_leer on tramos_mayoreo for select to anon, authenticated using (activo);
create policy tramos_admin on tramos_mayoreo for all to authenticated
  using (es_admin()) with check (es_admin());

grant select on tramos_mayoreo to anon, authenticated;

/** Precio por pieza del tramo mas alto que alcance esa cantidad. */
create or replace function precio_por_pieza_para(p_piezas int)
returns numeric
language sql
stable
as $$
  select precio_por_pieza_usd
    from tramos_mayoreo
   where activo and min_piezas <= p_piezas
   order by min_piezas desc
   limit 1;
$$;

-- La reserva congela lo que se cotizo: el tramo puede cambiar manana.
alter table reservas add column if not exists piezas               int;
alter table reservas add column if not exists precio_por_pieza_usd numeric(12,4);
alter table reservas add column if not exists total_usd            numeric(12,4);

-- ---------------------------------------------------------------------
-- B. EL PUBLICO YA NO TOCA LAS TABLAS DE RESERVA
-- ---------------------------------------------------------------------

drop policy if exists reservas_leer_anon  on reservas;
drop policy if exists reservas_crear_anon on reservas;
drop policy if exists ritems_leer_anon    on reserva_items;
drop policy if exists ritems_crear_anon   on reserva_items;

revoke all on reservas      from anon;
revoke all on reserva_items from anon;

-- ---------------------------------------------------------------------
-- C. CREAR UNA RESERVA (una sola transaccion)
--
-- Dos personas no pueden reservar la ultima unidad del mismo modelo: se
-- toma un bloqueo por modelo, en orden de id para no trabarse entre si,
-- antes de mirar la disponibilidad.
-- ---------------------------------------------------------------------

create or replace function crear_reserva(
  p_items            jsonb,
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modelo     bigint;
  v_item       jsonb;
  v_cantidad   int;
  v_disponible int;
  v_nombre     text;
  v_piezas     int := 0;
  v_precio     numeric(12,4);
  v_total      numeric(12,4);
  v_min_p      numeric(12,4);
  v_min_u      numeric(12,4);
  v_minutos    numeric(12,4);
  v_id         bigint;
  v_token      uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No elegiste ninguna pieza.';
  end if;

  perform limpiar_reservas();

  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select m.nombre into v_nombre from modelos m where m.id = v_modelo and m.activo;
    if not found then
      raise exception 'Una de las piezas que elegiste ya no esta disponible.';
    end if;

    select coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = v_modelo), 0)
         - coalesce((select sum(ri.cantidad)
                       from reserva_items ri
                       join reservas r on r.id = ri.reserva_id
                      where ri.modelo_id = v_modelo
                        and r.estado = 'abierta'
                        and r.expira_en > now()), 0)
      into v_disponible;

    if v_cantidad > v_disponible then
      raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, v_disponible, v_cantidad;
    end if;

    v_piezas := v_piezas + v_cantidad;
  end loop;

  v_precio := precio_por_pieza_para(v_piezas);
  if v_precio is null then
    raise exception 'Todavia no hay precios de mayor cargados para % piezas. Escribenos y te cotizamos.', v_piezas;
  end if;
  v_total := round(v_precio * v_piezas, 4);

  select valor into v_min_p from configuracion where clave = 'mayoreo_min_piezas';
  select valor into v_min_u from configuracion where clave = 'mayoreo_min_usd';

  -- Minimo: 6 piezas O $30, lo que se cumpla primero.
  if v_piezas < v_min_p and v_total < v_min_u then
    raise exception 'El pedido al mayor requiere % piezas o $%. Llevas % piezas y $%.',
      trunc(v_min_p)::int, to_char(v_min_u, 'FM999999990.00'),
      v_piezas, to_char(v_total, 'FM999999990.00');
  end if;

  select valor into v_minutos from configuracion where clave = 'reserva_minutos';

  insert into reservas (cliente_nombre, cliente_telefono, piezas, precio_por_pieza_usd, total_usd, expira_en)
  values (nullif(trim(p_cliente_nombre), ''), nullif(trim(p_cliente_telefono), ''),
          v_piezas, v_precio, v_total,
          now() + (coalesce(v_minutos, 60) || ' minutes')::interval)
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int
    from jsonb_array_elements(p_items) x;

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------
-- D. VER, CONFIRMAR Y CANCELAR LA PROPIA RESERVA
-- El publico llega por su token y solo ve lo suyo. Ninguna cifra de costo
-- y ningun dato de otra clienta.
-- ---------------------------------------------------------------------

create or replace function ver_reserva(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     reservas%rowtype;
  v_items jsonb;
begin
  perform limpiar_reservas();

  select * into v_r from reservas where token = p_token;
  if not found then
    raise exception 'Esa reserva no existe o el enlace esta mal copiado.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'modelo_id',       ri.modelo_id,
           'cantidad',        ri.cantidad,
           'sku',             c.sku,
           'nombre',          c.nombre,
           'variantes_nota',  c.variantes_nota,
           'foto_thumb_path', c.foto_thumb_path
         ) order by c.nombre), '[]'::jsonb)
    into v_items
    from reserva_items ri
    join v_catalogo_venta c on c.id = ri.modelo_id
   where ri.reserva_id = v_r.id;

  return jsonb_build_object(
    'estado',               v_r.estado,
    'creado_en',            v_r.creado_en,
    'expira_en',            v_r.expira_en,
    'cliente_nombre',       v_r.cliente_nombre,
    'piezas',               v_r.piezas,
    'precio_por_pieza_usd', v_r.precio_por_pieza_usd,
    'total_usd',            v_r.total_usd,
    'items',                v_items);
end;
$$;

create or replace function confirmar_reserva(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_r reservas%rowtype;
begin
  perform limpiar_reservas();
  select * into v_r from reservas where token = p_token for update;
  if not found then raise exception 'Esa reserva no existe.'; end if;
  if v_r.estado = 'confirmada' then return; end if;
  if v_r.estado <> 'abierta' then
    raise exception 'Esa reserva ya no esta abierta.';
  end if;
  if v_r.expira_en <= now() then
    raise exception 'La reserva vencio. Arma el pedido otra vez.';
  end if;
  update reservas set estado = 'confirmada' where id = v_r.id;
end;
$$;

create or replace function cancelar_reserva(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update reservas set estado = 'cancelada'
   where token = p_token and estado in ('abierta', 'confirmada');
end;
$$;

-- ---------------------------------------------------------------------
-- E. EL PEDIDO QUE VE LA VENDEDORA
-- Con la UBICACION de cada pieza, para armarlo en orden y sin errores.
-- ---------------------------------------------------------------------

create or replace view v_pedido_vendedora
with (security_invoker = off) as
select
  r.id            as reserva_id,
  r.token,
  r.estado,
  r.creado_en,
  r.expira_en,
  r.cliente_nombre,
  r.cliente_telefono,
  r.piezas        as piezas_total,
  r.total_usd,
  ri.modelo_id,
  c.sku,
  c.nombre,
  c.variantes_nota,
  c.foto_thumb_path,
  ri.cantidad,
  coalesce(u.nombre, 'Sin existencia suficiente') as ubicacion
from reservas r
join reserva_items ri on ri.reserva_id = r.id
join v_catalogo_venta c on c.id = ri.modelo_id
left join lateral (
  select ub.nombre
    from existencias e
    join ubicaciones ub on ub.id = e.ubicacion_id
   where e.modelo_id = ri.modelo_id and e.cantidad >= ri.cantidad
   order by e.cantidad desc, ub.orden
   limit 1
) u on true
where r.estado in ('abierta', 'confirmada')
  and auth.uid() is not null;

grant select on v_pedido_vendedora to authenticated;

-- ---------------------------------------------------------------------
-- F. LO QUE VE EL PUBLICO
-- Disponible = existencia - reservado vigente. Un modelo enteramente
-- reservado desaparece del catalogo publico en vez de prometer algo que
-- no hay. Mismas columnas que el original.
-- ---------------------------------------------------------------------

create or replace view v_disponible_publico
with (security_invoker = off) as
select * from (
  select
    c.id,
    c.sku,
    c.nombre,
    c.categoria,
    c.variantes_nota,
    c.foto_path,
    c.foto_thumb_path,
    c.precio_usd,
    c.precio_bs,
    c.existencia_total - coalesce((
      select sum(ri.cantidad)
        from reserva_items ri
        join reservas r on r.id = ri.reserva_id
       where ri.modelo_id = c.id
         and r.estado = 'abierta'
         and r.expira_en > now()
    ), 0) as disponible
  from v_catalogo_venta c
  where c.existencia_total > 0
) x
where x.disponible > 0;

grant select on v_disponible_publico to anon, authenticated;


-- ---------------------------------------------------------------------
-- F2. LA TASA VIGENTE ES PUBLICA
-- El catalogo publico muestra precios en bolivares, asi que quien abre el
-- enlace sin sesion necesita leer la tasa vigente. No es un secreto: es
-- exactamente el numero con el que se le cobra. Solo la vigente, y solo
-- lectura; el historico sigue siendo de la casa.
-- ---------------------------------------------------------------------

drop policy if exists tasas_leer_anon on tasas;
create policy tasas_leer_anon on tasas for select to anon using (vigente);
grant select on tasas to anon;

-- ---------------------------------------------------------------------
-- G. PERMISOS DE EJECUCION
-- ---------------------------------------------------------------------

revoke all on function limpiar_reservas()                     from public, anon, authenticated;

revoke all on function crear_reserva(jsonb, text, text)       from public;
revoke all on function ver_reserva(uuid)                      from public;
revoke all on function confirmar_reserva(uuid)                from public;
revoke all on function cancelar_reserva(uuid)                 from public;
revoke all on function precio_por_pieza_para(int)             from public;

grant execute on function crear_reserva(jsonb, text, text)    to anon, authenticated;
grant execute on function ver_reserva(uuid)                   to anon, authenticated;
grant execute on function confirmar_reserva(uuid)             to anon, authenticated;
grant execute on function cancelar_reserva(uuid)              to anon, authenticated;
grant execute on function precio_por_pieza_para(int)          to anon, authenticated;

-- ---------------------------------------------------------------------
-- H. LIMPIEZA DE LA PRUEBA DE FUGA
-- Las dos reservas que cree para comprobar que el publico leia los datos
-- de las clientas.
-- ---------------------------------------------------------------------

delete from reserva_items where reserva_id in (select id from reservas where cliente_nombre in ('Clienta A', 'Clienta B'));
delete from reservas where cliente_nombre in ('Clienta A', 'Clienta B');

notify pgrst, 'reload schema';

-- =====================================================================
-- I. VERIFICACION (Fase 3)
--
-- SIN NINGUNA SESION (rol anon), esto debe fallar:
--   select * from reservas;
--   select * from reserva_items;
--   select * from v_pedido_vendedora;
--
-- Y esto debe funcionar:
--   select * from v_disponible_publico;
--   select * from tramos_mayoreo;
--
-- Ninguna de las dos que funcionan trae columnas de costo.
--
-- Reserva: crear_reserva() respeta la disponibilidad y los minimos, y
-- devuelve un token. ver_reserva(token) solo muestra esa reserva.
-- =====================================================================
