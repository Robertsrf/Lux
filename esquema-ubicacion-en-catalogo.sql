-- =====================================================================
-- Lux by Emory — dónde está cada pieza, en el catálogo y en la vitrina
-- Ejecutar en el SQL Editor DESPUÉS de esquema-tramos-en-mostrador.sql
--
-- QUÉ TRAE
-- El catálogo PDF y la vitrina del televisor enseñan la pieza y el precio,
-- pero no dónde está. Cuando una clienta señala una, la vendedora tiene
-- que ir a buscarla al mostrador del sistema. Ahora cada ficha dice en qué
-- ubicación hay existencia.
--
-- DOS FORMAS DE DECIRLO
--   1. `ubicaciones`        → "Vitrina 1 · Bodega". Para el catálogo.
--   2. `ubicaciones_codigo` → "V1 · BG". Para la vitrina del televisor,
--      que se mira de cara al público: la vendedora lo entiende de un
--      vistazo y quien lo lee desde afuera ve dos letras sin significado.
--
-- Salen solo las ubicaciones con cantidad mayor que cero, en el orden de
-- la tienda (vitrinas primero, bodega al final), así que lo primero que se
-- lee es donde conviene ir a buscar.
--
-- EL CÓDIGO ES UNA COLUMNA, NO UNA REGLA ESCONDIDA
-- Se guarda en `ubicaciones.codigo` y se puede cambiar con un update. Aquí
-- se rellena una sola vez: los cinco nombres de la instalación reciben el
-- suyo a mano, y cualquier otro sale de las iniciales más el número
-- ("Caja 2" → C2). Si una ubicación nueva se crea sin código, la vista
-- usa las dos primeras letras del nombre para no dejar el hueco.
--
-- Para cambiar uno:
--   update ubicaciones set codigo = 'V3' where nombre = 'Vitrina 3';
--
-- POR QUÉ VAN AL FINAL DE LA VISTA
-- `create or replace view` solo sabe añadir columnas al final. Ponerlas
-- junto a `existencia_total` obligaría a soltar la vista con todo lo que
-- cuelga de ella, y de ella cuelgan el mostrador, el catálogo público y
-- los pedidos. No hace falta: van al final y ya.
--
-- QUIÉN LAS VE
-- `v_catalogo_venta` es de sesión (vendedora y administrador). El catálogo
-- público lee `v_disponible_publico`, que nombra sus columnas una a una y
-- no incluye estas: la clienta que abre el enlace sigue sin ver dónde
-- guarda la tienda sus piezas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EL CÓDIGO CORTO DE CADA UBICACIÓN
-- ---------------------------------------------------------------------

alter table ubicaciones add column if not exists codigo text;

-- Los de la instalación, con el código que se lee de un vistazo.
update ubicaciones set codigo = 'BG' where codigo is null and nombre ilike 'bodega%';
update ubicaciones set codigo = 'MO' where codigo is null and nombre ilike 'mostrador%';
update ubicaciones set codigo = 'EA' where codigo is null and nombre ilike 'exhibidor%';

-- Cualquier otra: la inicial de cada palabra y el número entero si lo hay.
-- "Vitrina 1" → V1, "Vitrina 2" → V2, "Caja 12" → C12.
update ubicaciones u
   set codigo = sub.codigo
  from (
    select id,
           upper((
             select string_agg(case when w ~ '^[0-9]+$' then w else left(w, 1) end, '' order by n)
               from regexp_split_to_table(nombre, ' +') with ordinality as t(w, n)
              where w <> ''
           )) as codigo
      from ubicaciones
  ) sub
 where sub.id = u.id
   and u.codigo is null;

-- ---------------------------------------------------------------------
-- 2. LA VISTA DE VENTA DICE DÓNDE ESTÁ CADA PIEZA
-- Misma definición que esquema-regateo.sql, con dos columnas al final.
-- ---------------------------------------------------------------------

create or replace view v_catalogo_venta
with (security_invoker = off) as
select
  m.id, m.sku, m.nombre, m.categoria, m.descripcion, m.variantes_nota,
  m.foto_path, m.foto_thumb_path,
  g.nombre as grupo,
  coalesce(m.precio_override_usd, g.precio_usd) as precio_usd,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv, 2) as precio_bs,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv / t.tasa_venta, 4) as precio_usd_real,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0) as existencia_total,
  m.activo,
  precio_minimo_de(m.id) as precio_minimo_usd,
  round(precio_minimo_de(m.id) * t.tasa_bcv, 2) as precio_minimo_bs,
  -- Dónde hay existencia, en el orden de la tienda. Null si no hay en ninguna.
  (select string_agg(u.nombre, ' · ' order by u.orden, u.nombre)
     from existencias e
     join ubicaciones u on u.id = e.ubicacion_id
    where e.modelo_id = m.id and e.cantidad > 0) as ubicaciones,
  (select string_agg(coalesce(u.codigo, upper(left(u.nombre, 2))), ' · ' order by u.orden, u.nombre)
     from existencias e
     join ubicaciones u on u.id = e.ubicacion_id
    where e.modelo_id = m.id and e.cantidad > 0) as ubicaciones_codigo
from modelos m
left join grupos_precio g on g.id = m.grupo_precio_id
left join lateral (select * from tasas where vigente limit 1) t on true
where m.activo;

grant select on v_catalogo_venta to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
--   select nombre, codigo from ubicaciones order by orden;
--     -> Vitrina 1 V1 · Vitrina 2 V2 · Exhibidor aéreo EA · Mostrador MO
--        · Bodega BG. Si hay alguna ubicación más, su código son las
--        iniciales; si no te gusta, el update de arriba lo cambia.
--
--   select sku, ubicaciones, ubicaciones_codigo
--     from v_catalogo_venta where existencia_total > 0 limit 5;
--     -> cada fila con algo como "Vitrina 1 · Bodega" y "V1 · BG".
--        Una pieza que solo está en bodega dice "Bodega" y "BG".
--
--   Con el enlace del catálogo público, sin sesión:
--   select ubicaciones from v_disponible_publico limit 1;
--     -> tiene que fallar con "column does not exist". Si devuelve algo,
--        la clienta está viendo dónde guardas las piezas: para y avisa.
-- =====================================================================
