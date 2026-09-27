-- =====================================================================
-- Lux by Emory — las vendedoras del local, cada una con su código
-- Ejecutar en el SQL Editor DESPUÉS de esquema-revendedores.sql
--
-- QUÉ ES
-- Hasta ahora la tienda tenía UNA cuenta de vendedora
-- (vendedora@lux.local) y se creaba a mano en el panel de Supabase. El
-- dueño decidió (27/09/2026):
--
--   - Cada vendedora del local tiene su propio código, para saber quién
--     vendió qué. Hace lo mismo que la vendedora de siempre, nada más.
--   - Se crean, se pausan y se les cambia el PIN desde la pantalla
--     Vendedoras del administrador.
--   - Vendedoras del local y revendedores son dos cosas aparte. Lo que un
--     revendedor retira y paga en la tienda NO cuenta como venta de la
--     vendedora: ni en su meta ni en "Tu día". Para el dueño sí es dinero
--     de la tienda, y sigue en Reportes y en Costos.
--
-- SU CÓDIGO
-- Ocho dígitos: los dos primeros son su número (01, 02...) y los seis
-- últimos su PIN. En Supabase es la cuenta vendedora03@lux.local con la
-- contraseña de siempre armada con el PIN (src/lib/auth.ts). La vendedora
-- de antes sigue entrando con sus cuatro dígitos hasta que el dueño le dé
-- su código propio desde la pantalla.
--
-- Seis dígitos de PIN y no cuatro: con varias vendedoras hay varias
-- puertas, y una sesión de vendedora puede tocar existencias y leer el
-- maestro de clientas. Cien veces más combinaciones cuestan dos teclas,
-- una vez al mes (la sesión dura).
--
-- LO QUE NO ESTÁ AQUÍ
-- Crear la cuenta de Supabase necesita la llave maestra (service_role),
-- que nunca va en el navegador. Lo hace la función de servidor
-- supabase/functions/vendedoras, que comprueba que quien llama es
-- administrador. INSTALACION.md dice cómo publicarla.
--
-- Firmas de lo que ya existía: las mismas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. SU NÚMERO
-- Lo pone la función de servidor al crearla. Null en la vendedora de
-- antes, que entra con cuatro dígitos, y en los administradores.
-- ---------------------------------------------------------------------

alter table perfiles add column if not exists numero_vendedora int;

alter table perfiles drop constraint if exists perfiles_numero_vendedora_rango;
alter table perfiles add constraint perfiles_numero_vendedora_rango
  check (numero_vendedora is null or numero_vendedora between 1 and 99);

create unique index if not exists perfiles_numero_vendedora_idx
  on perfiles (numero_vendedora) where numero_vendedora is not null;


-- ---------------------------------------------------------------------
-- 2. "TU DÍA" ES DEL LOCAL
-- La de esquema-meta-vendedora.sql con una condición más: fuera las
-- ventas a revendedores. Mismas columnas en el mismo orden.
-- ---------------------------------------------------------------------

create or replace view v_tablero_dia
with (security_invoker = off) as
select
  v.usuario_id,
  count(*)                                   as ventas,
  coalesce(sum(v.total_bs), 0)               as total_bs,
  coalesce(sum(p.piezas), 0)                 as piezas,
  coalesce(sum(p.premium), 0)                as piezas_premium,
  case when count(*) > 0
       then round(sum(v.total_bs) / count(*), 2)
       else 0 end                            as ticket_promedio_bs,
  round(coalesce(sum(v.total_bs / v.tasa_bcv_usada), 0), 2) as total_bcv,
  case when count(*) > 0
       then round(sum(v.total_bs / v.tasa_bcv_usada) / count(*), 2)
       else 0 end                            as ticket_promedio_bcv
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum(i.cantidad) filter (
      where i.precio_unitario_usd >= (select valor from configuracion where clave = 'premium_min_usd')
    ), 0) as premium
  from venta_items i
  where i.venta_id = v.id
) p on true
where not v.anulada
  and v.revendedor_id is null
  and v.fecha::date = current_date
  and (es_admin() or v.usuario_id = auth.uid())
group by v.usuario_id;

grant select on v_tablero_dia to authenticated;


-- ---------------------------------------------------------------------
-- 3. SU META SE MIDE CON LO QUE VENDIÓ EL LOCAL
--
-- La meta (piezas del mes y del día) sigue saliendo de `plan_ventas()`,
-- la cuenta del dueño. Lo que cambia es contra qué se mide: las piezas
-- vendidas hoy, en el mes y el ritmo cuentan solo las ventas del local.
--
-- El ritmo es la misma cuenta de `plan_ventas` (lo vendido entre el día
-- del mes, por los días del mes), hecha sobre esas piezas. No se copia
-- nada más.
-- ---------------------------------------------------------------------

create or replace function meta_vendedora()
returns table (
  meta_hoy      int,
  meta_mes      int,
  para          text,
  vendidas_hoy  int,
  vendidas_mes  int,
  dia_del_mes   int,
  dias_del_mes  int,
  ritmo_mes     int,
  dias_abiertos int
)
language sql
stable
security definer
set search_path = public
as $fn$
  with local as (
    select
      coalesce(sum(i.cantidad) filter (where v.fecha::date = current_date), 0) as hoy,
      coalesce(sum(i.cantidad), 0)                                             as mes
    from venta_items i
    join ventas v on v.id = i.venta_id and not v.anulada
    where v.revendedor_id is null
      and v.fecha >= date_trunc('month', now())
  )
  select
    coalesce(p.piezas_meta_dia, p.piezas_equilibrio_dia)::int,
    coalesce(p.piezas_meta_mes, p.piezas_equilibrio_mes)::int,
    case when p.piezas_meta_mes is not null then 'meta'
         when p.piezas_equilibrio_mes is not null then 'equilibrio' end,
    l.hoy::int,
    l.mes::int,
    p.dia_del_mes,
    p.dias_del_mes,
    (case when p.dia_del_mes > 0 then round(l.mes::numeric / p.dia_del_mes * p.dias_del_mes, 0) end)::int,
    p.dias_abiertos_mes::int
  from plan_ventas() p
  cross join local l
  where auth.uid() is not null;
$fn$;

revoke all on function meta_vendedora() from public, anon;
grant execute on function meta_vendedora() to authenticated;


-- ---------------------------------------------------------------------
-- 4. CÓMO VA CADA VENDEDORA. SOLO EL DUEÑO.
-- Sus ventas del local, hoy y en el mes, y cuándo vendió por última vez.
-- ---------------------------------------------------------------------

create or replace view v_vendedoras
with (security_invoker = off) as
select
  p.id,
  p.nombre,
  p.activo,
  p.numero_vendedora,
  p.creado_en,
  coalesce(s.piezas_hoy, 0)    as piezas_hoy,
  coalesce(s.piezas_mes, 0)    as piezas_mes,
  coalesce(s.ventas_mes, 0)    as ventas_mes,
  coalesce(s.total_mes_bcv, 0) as total_mes_bcv,
  (select max(v.fecha) from ventas v
    where v.usuario_id = p.id and not v.anulada and v.revendedor_id is null) as ultima_venta
from perfiles p
left join lateral (
  select
    sum(x.piezas) filter (where v.fecha::date = current_date)::int as piezas_hoy,
    sum(x.piezas)::int                                              as piezas_mes,
    count(*)::int                                                   as ventas_mes,
    round(sum(v.total_bs / v.tasa_bcv_usada), 2)                    as total_mes_bcv
  from ventas v
  cross join lateral (select coalesce(sum(i.cantidad), 0) as piezas
                        from venta_items i where i.venta_id = v.id) x
  where v.usuario_id = p.id
    and not v.anulada
    and v.revendedor_id is null
    and v.fecha >= date_trunc('month', now())
) s on true
where p.rol = 'vendedora'
  and es_admin();

revoke all on v_vendedoras from anon;
grant select on v_vendedoras to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Sin nada más, la vendedora de siempre sale en la vista con número
--    vacío:
--
--      select nombre, numero_vendedora, activo from v_vendedoras;
--      -- (con sesión de administrador desde la app; en el SQL Editor
--      --  es_admin() da falso y la vista sale vacía, a propósito)
--
-- 2. Con un revendedor que retiró hoy 3 piezas y la vendedora que vendió
--    2 en el mostrador: su "Tu día" dice 2, no 5, y su meta cuenta 2.
--    Reportes y Costos siguen contando las 5.
--
-- 3. Publica la función supabase/functions/vendedoras (INSTALACION.md) y
--    crea una vendedora desde la pantalla Vendedoras: da un código de
--    ocho dígitos que empieza por 01.
-- =====================================================================
