-- =====================================================================
-- Lux by Emory — índices en las claves foráneas que no los tenían
-- Ejecutar en el SQL Editor DESPUÉS de esquema-costos-cerrados.sql
--
-- POR QUÉ
-- Postgres crea un índice solo para las claves primarias y las UNIQUE. Las
-- claves FORÁNEAS no lo llevan de regalo, y sin él pasan dos cosas:
--
--   1. Borrar o actualizar la fila padre obliga a recorrer la tabla hija
--      entera para comprobar que nadie la apunta. Con `ventas` llena, eso
--      es un recorrido completo por cada anulación.
--   2. Los cruces por esa columna van por lectura secuencial.
--
-- HOY NO SE NOTA, Y ESA ES LA GRACIA
-- Las seis tablas están vacías: cero ventas, cero reservas, cero conteos.
-- Es el momento barato de hacerlo. Cuando `venta_items` tenga un año de
-- ventas encima, crear un índice bloquea la tabla mientras se construye.
--
-- `if not exists` en todos: correr esto dos veces no rompe nada.
-- =====================================================================

create index if not exists conteo_detalle_conteo_idx on conteo_detalle (conteo_id);
create index if not exists conteo_detalle_modelo_idx on conteo_detalle (modelo_id);

create index if not exists conteos_ubicacion_idx on conteos (ubicacion_id);
create index if not exists conteos_usuario_idx   on conteos (usuario_id);

create index if not exists kit_items_modelo_idx on kit_items (modelo_id);

create index if not exists reserva_items_modelo_idx  on reserva_items (modelo_id);
create index if not exists reserva_items_reserva_idx on reserva_items (reserva_id);

create index if not exists tasas_registrado_por_idx on tasas (registrado_por);

create index if not exists venta_items_ubicacion_idx on venta_items (ubicacion_id);

create index if not exists ventas_kit_idx on ventas (kit_id);

-- =====================================================================
-- COMPROBACIÓN
--   select tablename, indexname from pg_indexes
--    where schemaname = 'public' and indexname like '%_idx'
--    order by tablename, indexname;
--     -> tienen que aparecer los diez de arriba.
--
-- Ninguna clave foránea queda sin índice después de esto. Si mañana
-- agregas una tabla con una FK nueva, acuérdate de traerle el suyo.
-- =====================================================================
