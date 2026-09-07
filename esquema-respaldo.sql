-- =====================================================================
-- Lux by Emory — poder sacar un respaldo completo por HTTPS
-- Ejecutar en el SQL Editor DESPUÉS de esquema-recuperacion-bcv.sql
--
-- POR QUÉ HACE FALTA
-- El plan gratuito de Supabase no deja descargar respaldos, y `pg_dump`
-- necesita el puerto 5432, que esta red bloquea. La única vía que queda
-- es HTTPS, por donde ya habla la aplicación.
--
-- Pero tres tablas están revocadas incluso para el administrador —
-- `modelos`, `lotes` y `venta_items`— porque llevan costos dentro. Se
-- leen por sus vistas, y ahí está la trampa: `v_catalogo_admin` filtra
-- por `activo`, así que un respaldo hecho con ella perdería en silencio
-- todos los modelos retirados.
--
-- Un respaldo que pierde filas sin avisar es peor que no tener respaldo:
-- da confianza y no la merece.
--
-- LA LISTA BLANCA NO ES DECORACIÓN
-- La función acepta EXACTAMENTE tres nombres y ninguno más. Podría
-- escribirse genérica —"devuélveme cualquier tabla"— y sería más corta,
-- pero entonces una sola función de definidor abriría la base entera.
-- Tres nombres escritos a mano no se pueden torcer.
-- =====================================================================

create or replace function admin_respaldo(p_tabla text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_filas jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede sacar un respaldo.';
  end if;

  -- Solo estas tres. Las demás se leen directo y no necesitan pasar por
  -- aquí; ampliar esta lista es ampliar lo que una sola función expone.
  if p_tabla not in ('modelos', 'lotes', 'venta_items') then
    raise exception 'Esa tabla no esta en la lista del respaldo: %', p_tabla;
  end if;

  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.id), ''[]''::jsonb) from %I t', p_tabla)
     into v_filas;

  return v_filas;
end;
$fn$;

revoke all on function admin_respaldo(text) from public, anon;
grant execute on function admin_respaldo(text) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select jsonb_array_length(admin_respaldo('modelos'));
--     -> TODOS los modelos, incluidos los retirados. Con v_catalogo_admin
--        salían solo los activos.
--
--   select admin_respaldo('perfiles');
--     -> ERROR: esa tabla no esta en la lista del respaldo
--
--   Con sesión de vendedora: rechazada de entrada.
-- =====================================================================
