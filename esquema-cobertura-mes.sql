-- =====================================================================
-- Lux by Emory — cuánto del mes ya está cubierto
-- Ejecutar en el SQL Editor DESPUÉS de esquema-gastos-desglose.sql
--
-- LA IDEA
-- Los gastos del mes no se pagan de golpe: se van cubriendo venta a
-- venta. Cada pieza vendida deja, por encima de lo que costó reponerla,
-- una CONTRIBUCIÓN que va tapando el alquiler, el sueldo y lo demás.
-- Cuando la suma de esas contribuciones alcanza el total del mes, la
-- tienda ya se pagó sola: de ahí en adelante lo que entra es ganancia.
--
--   contribución de una pieza = lo cobrado − lo que costó reponerla
--   punto de equilibrio       = gastos del mes / contribución promedio
--
-- OJO CON NO CONTAR DOS VECES
-- A la contribución se le resta SOLO la mercancía, no el costo operativo
-- por pieza. Ese costo operativo ES el reparto de estos mismos gastos:
-- restarlo aquí sería cobrarlos dos veces y el mes no se cubriría nunca.
--
-- EL MES ES EL MES CALENDARIO
-- Del día 1 a hoy. El alquiler y el sueldo se pagan así, no en ventanas
-- de treinta días móviles, y la cuenta tiene que parecerse a la factura.
-- =====================================================================

create or replace view v_cobertura_mes
with (security_invoker = off) as
with gastos as (
  select coalesce(sum(monto_usd), 0) as total
  from v_gastos_desglose
),
vendido as (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    -- Todo en dólares BCV, con la brecha congelada el día de la venta.
    coalesce(sum(
      i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada
      - i.costo_puesto_usd_snap * i.cantidad * (v.tasa_venta_usada / v.tasa_bcv_usada)
    ), 0) as contribucion
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
  where v.fecha >= date_trunc('month', current_date)
)
select
  g.total                                          as gastos_mes_usd,
  d.piezas                                         as piezas_vendidas,
  round(d.contribucion, 2)                         as contribucion_usd,
  -- Lo cubierto nunca pasa del total: por encima ya no es cobertura,
  -- es ganancia, y son dos cosas distintas.
  round(least(d.contribucion, g.total), 2)         as cubierto_usd,
  round(greatest(g.total - d.contribucion, 0), 2)  as por_cubrir_usd,
  round(greatest(d.contribucion - g.total, 0), 2)  as ganancia_usd,
  case when g.total > 0
       then round(least(d.contribucion / g.total, 1) * 100, 1)
       else 100 end                                as cubierto_pct,
  case when d.piezas > 0
       then round(d.contribucion / d.piezas, 2)
       end                                         as contribucion_por_pieza_usd,
  -- Cuántas piezas más hacen falta, al ritmo que se está vendiendo.
  case when g.total > d.contribucion and d.piezas > 0 and d.contribucion > 0
       then ceil((g.total - d.contribucion) / (d.contribucion / d.piezas))
       end                                         as piezas_faltantes,
  date_trunc('month', current_date)::date          as desde
from gastos g
cross join vendido d
where es_admin();

grant select on v_cobertura_mes to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select * from v_cobertura_mes;
--
--   Sin ventas este mes:
--     piezas_vendidas 0 · cubierto_usd 0 · cubierto_pct 0
--     por_cubrir_usd = el total de v_gastos_desglose
--     piezas_faltantes null, porque todavía no hay con qué estimarlo
--
--   Con sesión de vendedora: 0 filas. Esto lleva la nómina dentro.
-- =====================================================================
