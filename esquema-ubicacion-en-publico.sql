-- =====================================================================
-- Lux by Emory — el catálogo público también dice dónde está la pieza
-- Ejecutar en el SQL Editor DESPUÉS de esquema-limpieza-kits.sql
--
-- QUÉ FALTABA
-- `esquema-ubicacion-en-catalogo.sql` le puso la ubicación al catálogo PDF
-- y a la vitrina del televisor, y dejó fuera el catálogo público a
-- propósito: es el enlace que se manda por WhatsApp y cualquiera lo abre.
--
-- Esa decisión estaba a medias. La idea del código corto es justamente
-- esa: que la vendedora lo lea de un vistazo y que quien pase por delante
-- vea dos letras sin significado. Si vale para un televisor encendido de
-- cara a la calle, vale para un enlace.
--
-- Así que aquí va el CÓDIGO, nunca el nombre. "V1", no "Vitrina 1".
--
-- LO QUE SE ESTÁ ENSEÑANDO, DICHO CLARO
-- Con esto, quien tenga el enlace ve qué códigos existen y cuántas piezas
-- hay en cada uno. No ve dónde queda cada código, ni un precio de costo,
-- ni un margen. Es lo mismo que ya ve quien entra a la tienda y mira las
-- vitrinas, y bastante menos de lo que ve quien recibe el PDF, que todavía
-- lleva los nombres completos porque el dueño lo pidió así.
--
-- POR QUÉ LA COLUMNA VA AL FINAL
-- `create or replace view` solo sabe añadir columnas al final. Meterla en
-- medio obligaría a soltar la vista, y de ella cuelga `categorias_publicas`.
-- =====================================================================

create or replace view v_disponible_publico
with (security_invoker = off) as
select * from (
  select
    c.id, c.sku, c.nombre, c.categoria, c.variantes_nota,
    c.foto_path, c.foto_thumb_path, c.precio_usd, c.precio_bs,
    c.existencia_total - coalesce((
      select sum(ri.cantidad)
        from reserva_items ri
        join reservas r on r.id = ri.reserva_id
       where ri.modelo_id = c.id and r.estado = 'abierta' and r.expira_en > now()
    ), 0) as disponible,
    -- En clave, y solo en clave. El nombre completo se queda para dentro.
    c.ubicaciones_codigo
  from v_catalogo_venta c
  where c.existencia_total > 0
) x
where x.disponible > 0;

grant select on v_disponible_publico to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Sin sesión, como una clienta cualquiera:
--
--      select sku, disponible, ubicaciones_codigo from v_disponible_publico limit 5;
--        -> cada fila con su "V1" o su "V1 · BG".
--
--      select ubicaciones from v_disponible_publico limit 1;
--        -> tiene que FALLAR con "column does not exist". El nombre
--           completo no sale de la tienda por aquí.
--
--      select costo_puesto_usd from v_disponible_publico limit 1;
--        -> tiene que FALLAR igual. Es la de siempre y sigue valiendo.
--
-- 2. Que el filtro de categorías no se haya caído con la vista:
--
--      select * from categorias_publicas();
--        -> la misma lista de antes. Si falla, se perdió el grant al
--           recrear y hay que devolvérselo.
-- =====================================================================
