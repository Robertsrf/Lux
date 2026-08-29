-- =====================================================================
-- Lux by Emory — parche de seguridad 01
-- Ejecutar en el SQL Editor. Tarda un segundo.
--
-- QUE ARREGLA
-- El REVOKE sobre `modelos` y `lotes` protege esas tablas, pero tres
-- caminos laterales seguian dejando pasar cifras de costo a la vendedora:
--
--   1. v_capex_lote  -> vista sobre `lotes` sin filtro. Una vista corre con
--      los privilegios de su dueno, asi que se salta el REVOKE. Comprobado
--      contra la base real: la vendedora leia costo de exhibidores, flete
--      y CAPEX de cada lote.
--   2. v_margen_ventas -> expone ganancia_usd de TODAS las ventas, no solo
--      las suyas del dia, por el mismo motivo.
--   3. venta_items -> tiene costo_puesto_usd_snap, y la politica le deja
--      leer las lineas de sus propias ventas. En cuanto venda, ve el costo.
--
-- Regla general: una vista que toca una tabla revocada tiene que filtrar
-- con es_admin() por dentro, o no debe estar otorgada.
-- =====================================================================

-- 1. CAPEX de lote: solo admin. Mismas columnas que el original.
create or replace view v_capex_lote as
select
  id,
  codigo,
  fecha_llegada,
  costo_exhibidores_usd,
  (costo_flete_usd - flete_mercancia_usd) as flete_exhibidores_usd,
  costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd) as capex_total_usd
from lotes
where es_admin();

-- 2. Margen por venta: solo admin.
create or replace view v_margen_ventas as
select
  v.id,
  v.fecha,
  v.tipo,
  v.metodo,
  v.total_usd,
  coalesce(sum(i.costo_puesto_usd_snap * i.cantidad), 0) as costo_total_usd,
  v.total_usd - coalesce(sum(i.costo_puesto_usd_snap * i.cantidad), 0) as ganancia_usd,
  coalesce(sum(i.cantidad), 0) as piezas
from ventas v
left join venta_items i on i.venta_id = v.id
where not v.anulada
  and es_admin()
group by v.id;

-- 3. Lineas de venta: se cierra la tabla y se abre una vista sin costo.
revoke all on venta_items from authenticated, anon;

create or replace view v_venta_items_venta
with (security_invoker = off) as
select
  i.id,
  i.venta_id,
  i.modelo_id,
  i.ubicacion_id,
  i.cantidad,
  i.precio_unitario_usd,
  i.precio_unitario_bs
from venta_items i
join ventas v on v.id = i.venta_id
where es_admin()
   or (v.usuario_id = auth.uid() and v.fecha::date = current_date);

grant select on v_venta_items_venta to authenticated;

-- Limpieza del lote que use para comprobar la fuga.
delete from lotes where codigo = 'FUGA-TEST';

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACION (con sesion de vendedora, las tres deben dar 0 filas
-- o permiso denegado):
--   select * from v_capex_lote;
--   select * from v_margen_ventas;
--   select * from venta_items;
-- =====================================================================
