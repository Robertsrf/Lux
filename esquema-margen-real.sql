-- =====================================================================
-- Lux by Emory — el margen que se reporta es el margen de verdad
-- Ejecutar en el SQL Editor DESPUÉS de esquema-inversiones.sql
--
-- EL ERROR QUE CORRIGE
-- Cuando los gastos operativos entraron al precio sugerido, se quedaron
-- fuera del margen que muestra el inventario y de la ganancia de los
-- reportes. Esas pantallas seguían restando solo la mercancía.
--
-- Con datos reales: un brazalete de $0,99 de costo a $9 de etiqueta
-- aparecía con 86,87 % de margen. El margen de verdad, contando los
-- $3,03 que carga de alquiler, sueldo y empaque, es 44,0 %.
--
-- Casi el doble. Y como el catálogo son piezas baratas, el error es
-- mayor cuanto más barata la pieza: es justo donde más engaña.
-- =====================================================================

drop view if exists v_catalogo_admin cascade;

create view v_catalogo_admin
with (security_invoker = off) as
select
  v.*,
  m.costo_unitario_usd,
  m.flete_unitario_usd,
  m.costo_puesto_usd,
  m.peso_unitario_g,
  m.lote_id,
  o.operativo                                as costo_operativo_usd,
  round((m.costo_puesto_usd + o.operativo) / (1 - o.merma / 100), 4) as costo_total_usd,
  round(v.precio_usd_real
        - (m.costo_puesto_usd + o.operativo) / (1 - o.merma / 100), 4) as margen_usd,
  case when v.precio_usd_real > 0
       then round(((v.precio_usd_real
                    - (m.costo_puesto_usd + o.operativo) / (1 - o.merma / 100))
                   / v.precio_usd_real) * 100, 2)
       else 0 end                            as margen_pct,
  m.grupo_precio_id,
  m.precio_override_usd,
  l.codigo as lote_codigo
from v_catalogo_venta v
join modelos m on m.id = v.id
left join lotes l on l.id = m.lote_id
cross join lateral (
  select
    coalesce(costo_operativo_por_pieza(), 0) as operativo,
    least(coalesce((select valor from configuracion where clave = 'merma_pct'), 0), 90) as merma
) o
where es_admin();

grant select on v_catalogo_admin to authenticated;

-- ---------------------------------------------------------------------
-- LOS REPORTES TAMBIÉN RESTAN LOS GASTOS
-- Se usa el valor congelado en cada línea, no el de hoy: la ganancia de
-- enero no se reescribe porque en marzo suba el alquiler.
-- ---------------------------------------------------------------------

create or replace view v_ventas_por_dia
with (security_invoker = off) as
select
  v.fecha::date                                as dia,
  count(*)                                     as ventas,
  coalesce(sum(m.piezas), 0)                   as piezas,
  coalesce(sum(v.total_bs), 0)                 as total_bs,
  coalesce(sum(v.total_usd), 0)                as total_usd,
  coalesce(sum(m.costo_usd), 0)                as costo_usd,
  coalesce(sum(v.total_usd - m.costo_usd), 0)  as ganancia_usd
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum((i.costo_puesto_usd_snap + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad), 0) as costo_usd
  from venta_items i where i.venta_id = v.id
) m on true
where not v.anulada
  and es_admin()
group by v.fecha::date;

create or replace view v_mezcla_grupo
with (security_invoker = off) as
select
  coalesce(g.nombre, 'Sin grupo') as grupo,
  coalesce(g.orden, 999)          as orden,
  sum(i.cantidad)                 as piezas,
  sum(i.precio_unitario_bs * i.cantidad / v.tasa_venta_usada) as ingreso_usd,
  sum(i.precio_unitario_bs * i.cantidad / v.tasa_venta_usada
      - (i.costo_puesto_usd_snap + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad) as ganancia_usd
from venta_items i
join ventas v   on v.id = i.venta_id and not v.anulada
join modelos mo on mo.id = i.modelo_id
left join grupos_precio g on g.id = mo.grupo_precio_id
where es_admin()
group by coalesce(g.nombre, 'Sin grupo'), coalesce(g.orden, 999);

create or replace view v_rotacion_modelo
with (security_invoker = off) as
select
  mo.id, mo.sku, mo.nombre, mo.categoria,
  coalesce(g.nombre, 'Sin grupo') as grupo,
  coalesce(x.piezas, 0)           as piezas_vendidas,
  x.ultima_venta,
  case when x.ultima_venta is not null then (current_date - x.ultima_venta::date) end as dias_sin_vender,
  (current_date - mo.creado_en::date) as dias_en_inventario,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = mo.id), 0) as existencia,
  mo.costo_puesto_usd,
  coalesce(x.ganancia_usd, 0) as ganancia_usd
from modelos mo
left join grupos_precio g on g.id = mo.grupo_precio_id
left join lateral (
  select
    sum(i.cantidad) as piezas,
    max(v.fecha)    as ultima_venta,
    sum(i.precio_unitario_bs * i.cantidad / v.tasa_venta_usada
        - (i.costo_puesto_usd_snap + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad) as ganancia_usd
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
  where i.modelo_id = mo.id
) x on true
where mo.activo and es_admin();

grant select on v_ventas_por_dia   to authenticated;
grant select on v_mezcla_grupo     to authenticated;
grant select on v_rotacion_modelo  to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select sku, costo_puesto_usd, costo_operativo_usd, costo_total_usd,
--          precio_usd_real, margen_pct
--     from v_catalogo_admin order by margen_pct;
-- =====================================================================
