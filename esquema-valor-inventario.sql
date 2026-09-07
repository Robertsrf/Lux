-- =====================================================================
-- Lux by Emory — cuánto vale lo que hay en vitrina
-- Ejecutar en el SQL Editor DESPUÉS de esquema-cobertura-mes.sql
--
-- LA PREGUNTA QUE CONTESTA
-- Cuántas piezas hay contando las cantidades, cuánto costó traerlas, y
-- cuánto suman a precio de etiqueta. La diferencia es lo que dejaría el
-- inventario entero si se vendiera completo.
--
-- LO QUE NO SE HACE, Y POR QUÉ
-- No se le carga a cada pieza su parte de alquiler y sueldo. Ese costo
-- operativo es un gasto MENSUAL repartido entre las piezas que se venden
-- en el mes; meterlo en el valor de lo que está guardado sería contar un
-- gasto que todavía no ocurrió, y encima cambiaría el valor del
-- inventario cada vez que suba el alquiler, sin que la vitrina cambie.
--
-- Por eso la diferencia se llama MARGEN BRUTO y no ganancia: de ahí
-- salen después los gastos del mes. `v_cobertura_mes` es la que dice
-- cuánto de esos gastos va cubierto.
--
-- TODO EN DÓLARES BCV
-- El costo se compró en Binance y se convierte con la brecha; el precio
-- ya nace en BCV. Es la misma regla de siempre.
-- =====================================================================

create or replace view v_valor_inventario
with (security_invoker = off) as
with f as (
  select
    coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as factor,
    coalesce(factor_merma(), 1) as merma
),
piezas as (
  select
    m.id,
    m.categoria,
    coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0) as cantidad,
    m.costo_puesto_usd,
    coalesce(m.precio_override_usd, g.precio_usd) as precio_usd
  from modelos m
  left join grupos_precio g on g.id = m.grupo_precio_id
  where m.activo
)
select
  count(*) filter (where p.cantidad > 0)                    as modelos_con_existencia,
  count(*)                                                  as modelos_activos,
  coalesce(sum(p.cantidad), 0)                              as piezas,
  -- Lo que costó traerlas, ya en BCV y con la merma dentro.
  round(coalesce(sum(p.cantidad * p.costo_puesto_usd * f.factor * f.merma), 0), 2) as costo_bcv,
  -- Lo mismo en dólares de los que se recompran: útil para saber cuánto
  -- hay que juntar en Binance para reponer todo.
  round(coalesce(sum(p.cantidad * p.costo_puesto_usd), 0), 2) as costo_real_usd,
  round(coalesce(sum(p.cantidad * p.precio_usd), 0), 2)      as precio_bcv,
  round(coalesce(sum(p.cantidad * (p.precio_usd - p.costo_puesto_usd * f.factor * f.merma)), 0), 2) as margen_bruto_bcv,
  case when coalesce(sum(p.cantidad * p.precio_usd), 0) > 0
       then round(coalesce(sum(p.cantidad * (p.precio_usd - p.costo_puesto_usd * f.factor * f.merma)), 0)
                  / sum(p.cantidad * p.precio_usd) * 100, 1)
       end                                                  as margen_bruto_pct,
  -- Piezas sin precio: no entran en el valor y hay que saberlo, porque si
  -- no el total miente por lo bajo sin decir nada.
  coalesce(sum(p.cantidad) filter (where p.precio_usd is null), 0) as piezas_sin_precio
from piezas p
cross join f
where es_admin();

grant select on v_valor_inventario to authenticated;

-- ---------------------------------------------------------------------
-- EL MISMO VALOR, ABIERTO POR CATEGORÍA
-- Para saber en qué está metido el dinero: si hay diez mil en collares y
-- nada en aretes, eso no se ve en un total.
-- ---------------------------------------------------------------------

create or replace view v_valor_por_categoria
with (security_invoker = off) as
with f as (
  select
    coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as factor,
    coalesce(factor_merma(), 1) as merma
)
select
  m.categoria,
  sum(coalesce(e.cantidad, 0))                                  as piezas,
  round(sum(coalesce(e.cantidad, 0) * m.costo_puesto_usd * f.factor * f.merma), 2) as costo_bcv,
  round(sum(coalesce(e.cantidad, 0)
            * (coalesce(m.precio_override_usd, g.precio_usd)
               - m.costo_puesto_usd * f.factor * f.merma)), 2)  as margen_bruto_bcv,
  round(sum(coalesce(e.cantidad, 0) * coalesce(m.precio_override_usd, g.precio_usd)), 2) as precio_bcv
from modelos m
left join grupos_precio g on g.id = m.grupo_precio_id
left join lateral (
  select sum(ex.cantidad) as cantidad from existencias ex where ex.modelo_id = m.id
) e on true
cross join f
where m.activo
  and coalesce(e.cantidad, 0) > 0
  and es_admin()
group by m.categoria
order by sum(coalesce(e.cantidad, 0) * coalesce(m.precio_override_usd, g.precio_usd)) desc;

grant select on v_valor_por_categoria to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select * from v_valor_inventario;
--     -> piezas debe coincidir con: select sum(cantidad) from existencias
--     -> costo_bcv + margen_bruto_bcv debe dar exactamente precio_bcv
--
--   select * from v_valor_por_categoria;
--     -> la suma de sus piezas debe dar el mismo total
--
--   Con sesión de vendedora: 0 filas en las dos.
-- =====================================================================
