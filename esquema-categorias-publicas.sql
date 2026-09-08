-- =====================================================================
-- Lux by Emory — las categorías del catálogo, sin traerse el catálogo
-- Ejecutar en el SQL Editor DESPUÉS de esquema-correcciones-datos.sql
--
-- QUÉ ARREGLA
-- Al abrir el catálogo público, la clienta dispara DOS consultas:
--
--   1. Las piezas que va a ver (hasta 400 filas, con sus columnas).
--   2. Hasta 1000 filas de una sola columna, `categoria`, nada más que
--      para saber qué opciones poner en el desplegable del filtro.
--
-- La segunda trae 1000 valores para quedarse con unos quince. Y no se
-- puede sacar de la primera: si las categorías salieran de lo que ya está
-- en pantalla, elegir una haría desaparecer a todas las demás del filtro,
-- que es justo el bug que ya arreglamos una vez. Por eso la consulta
-- existe y por eso va sin filtrar.
--
-- La solución no es quitarla sino que la base haga el trabajo: que
-- devuelva las quince, no las mil.
--
-- POR QUÉ NO ES `security definer`
-- No hace falta. `v_disponible_publico` ya la puede leer cualquiera sin
-- sesión: eso es el catálogo. Una función de definidor de más es una
-- puerta de más que vigilar, y esta no tiene nada que vigilar.
--
-- POR QUÉ LEE DE LA MISMA VISTA
-- Sale de `v_disponible_publico`, no de `modelos`. Así el desplegable no
-- puede ofrecer una categoría que no tenga ninguna pieza a la vista: si la
-- vista cambia de criterio mañana, el filtro cambia con ella y no hay dos
-- reglas que mantener de acuerdo.
-- =====================================================================

create or replace function categorias_publicas()
returns table (categoria text)
language sql
stable
set search_path = public
as $fn$
  select distinct p.categoria
    from v_disponible_publico p
   where p.categoria is not null
     and p.categoria <> ''
   order by 1;
$fn$;

revoke all on function categorias_publicas() from public;
grant execute on function categorias_publicas() to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
--   select * from categorias_publicas();
--     -> la lista de categorías, en orden alfabético, sin repetir y sin
--        nulos. Tienen que ser las mismas que salen hoy en el filtro.
--
--   select count(*) from categorias_publicas();
--     -> alrededor de quince, no mil.
--
-- Comparación contra lo que hace hoy el navegador, tiene que dar igual:
--   select count(distinct categoria) from v_disponible_publico
--    where categoria is not null and categoria <> '';
--
-- OJO CON EL ORDEN DE LOS PASOS
-- Esto va PRIMERO y el cambio del navegador después. Al revés, el
-- catálogo pediría una función que todavía no existe y el filtro
-- quedaría vacío — el mismo síntoma que ya viste una vez.
-- =====================================================================
