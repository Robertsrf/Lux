-- =====================================================================
-- Lux by Emory — parche: v_valor_inventario devolvía una fila a la vendedora
-- Ejecutar en el SQL Editor. Es corto.
--
-- EL FALLO
-- La vista lleva `where es_admin()`, y en las demás vistas eso basta para
-- que la vendedora reciba cero filas. Aquí no.
--
-- El motivo es fino: el select de afuera es una AGREGACIÓN sin group by.
-- Postgres, sobre cero filas de entrada, igual devuelve una fila de
-- salida —count 0, sum nulo— porque una agregación sin agrupar siempre
-- produce exactamente un resultado. El `where` filtró las filas de
-- entrada, pero no la fila que la agregación fabrica después.
--
-- No se escapó ningún dato: con todo filtrado los coalesce dan cero. Pero
-- la vendedora veía un panel de inventario en ceros donde no debía haber
-- nada, y sobre todo: el patrón es el que SÍ filtraría si mañana alguien
-- le agrega una columna que no sea agregada.
--
-- `having` es lo que faltaba: se aplica DESPUÉS de agregar, así que
-- elimina esa fila fabricada. El `where` se queda porque evita recorrer
-- la tabla entera para nada.
--
-- Las demás vistas no tienen el problema: o agrupan -y sin grupos no hay
-- filas- o su select de afuera no agrega nada. Comprobado una por una
-- contra la base con sesión de vendedora.
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
  round(coalesce(sum(p.cantidad * p.costo_puesto_usd * f.factor * f.merma), 0), 2) as costo_bcv,
  round(coalesce(sum(p.cantidad * p.costo_puesto_usd), 0), 2) as costo_real_usd,
  round(coalesce(sum(p.cantidad * p.precio_usd), 0), 2)      as precio_bcv,
  round(coalesce(sum(p.cantidad * (p.precio_usd - p.costo_puesto_usd * f.factor * f.merma)), 0), 2) as margen_bruto_bcv,
  case when coalesce(sum(p.cantidad * p.precio_usd), 0) > 0
       then round(coalesce(sum(p.cantidad * (p.precio_usd - p.costo_puesto_usd * f.factor * f.merma)), 0)
                  / sum(p.cantidad * p.precio_usd) * 100, 1)
       end                                                  as margen_bruto_pct,
  coalesce(sum(p.cantidad) filter (where p.precio_usd is null), 0) as piezas_sin_precio
from piezas p
cross join f
where es_admin()
-- Y aquí está el arreglo: el where filtra filas de entrada, el having
-- filtra la fila que la agregación fabrica aunque no entre ninguna.
having es_admin();

grant select on v_valor_inventario to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   Con sesión de admin:      1 fila con los totales.
--   Con sesión de vendedora:  0 filas. Antes devolvía una en ceros.
-- =====================================================================
