-- =====================================================================
-- #68  DAMA O CABALLERO EN EL CATÁLOGO DE CADA REVENDEDOR
--
-- Depende de: esquema-dama-caballero.sql (#67).
--
-- Por qué (pedido del dueño del 17/11/2026)
--   El catálogo de la tienda ya deja ver "Todas · Dama · Caballero". El de
--   cada revendedor (/#/r/<usuario>) sale de `rv_catalogo_publico`, que no
--   traía para quién es la pieza: su clienta no podía filtrar.
--
-- Qué hace
--   `rv_catalogo_publico(p_usuario)` gana `para` AL FINAL de lo que
--   devuelve. Todo lo demás, igual: la misma regla de qué piezas salen
--   (solo las que le dejan algo), los mismos precios (los de SU clienta) y
--   ninguna columna de costo, piso ni de lo que él le paga a Lux.
--
--   Cambiar lo que devuelve una función obliga a borrarla y crearla otra
--   vez (`create or replace` no puede). Va dentro de una transacción: el
--   catálogo nunca se queda sin ella. Los permisos se vuelven a dar.
--   La firma no cambia (sigue recibiendo solo el usuario), así que el
--   navegador de antes, que pide sus columnas por nombre, sigue igual.
--
-- Se puede correr las veces que haga falta.
--
-- Qué debería dar
--   - select id, para from rv_catalogo_publico('<un usuario>') limit 5;
--     -> cada pieza con dama, caballero o unisex.
--   - Sin sesión responde; precio_lux_usd, costo_puesto_usd y
--     piso_tramo_usd siguen sin existir en lo que devuelve.
-- =====================================================================

begin;

drop function if exists rv_catalogo_publico(text);

-- La de esquema-revendedores.sql, con `para` al final.
create function rv_catalogo_publico(p_usuario text)
returns table (
  id              bigint,
  sku             text,
  nombre          text,
  categoria       text,
  variantes_nota  text,
  foto_path       text,
  foto_thumb_path text,
  precio_usd      numeric,
  precio_bs       numeric,
  disponible      int,
  familia         bigint,
  variante        text,
  -- Nueva (#68): dama, caballero o unisex.
  para            text
)
language sql
stable
security definer
set search_path = public
as $fn$
  with r as (
    select rv.id, rv_descuento_de(rv.id) as descuento
      from revendedores rv
     where rv.usuario = lower(btrim(coalesce(p_usuario, ''))) and rv.activo
  )
  select p.id, p.sku, p.nombre, p.categoria, p.variantes_nota, p.foto_path, p.foto_thumb_path,
         x.precio,
         round(x.precio * t.tasa_bcv, 2),
         p.disponible::int,
         p.familia,
         p.variante,
         p.para
    from v_disponible_publico p
   cross join r
    left join revendedor_precios rp on rp.revendedor_id = r.id and rp.modelo_id = p.id
    left join lateral (select tasa_bcv from tasas where vigente limit 1) t on true
   cross join lateral (
     select rv_precio_lux(p.id, r.descuento)                 as lux,
            rv_precio_clienta(rp.precio_usd, p.precio_usd)   as precio
   ) x
   where x.lux < p.precio_usd;
$fn$;

revoke all on function rv_catalogo_publico(text) from public;
grant execute on function rv_catalogo_publico(text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
