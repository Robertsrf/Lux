-- =====================================================================
-- Lux by Emory — parche del piso de regateo
-- Ejecutar en el SQL Editor. Es corto.
--
-- ARREGLA DOS COSAS
--
-- 1. LA VISTA DEL CATALOGO ESTABA CAIDA
--    v_catalogo_venta llama a precio_minimo_de(), y yo revoque esa
--    funcion a todo el mundo pensando que bastaba con que la vista fuera
--    de definidor. No basta: Postgres comprueba el permiso de EJECUTAR
--    una funcion contra quien llama, no contra el dueno de la vista. El
--    resultado era "permission denied for function precio_minimo_de" para
--    admin y vendedora por igual, o sea catalogo y mostrador caidos.
--
--    Otorgarla es seguro: devuelve UN numero, el piso, que es justo lo
--    que la vendedora tiene que ver. No devuelve costo ni margen.
--
-- 2. UNA FUGA INDIRECTA DE COSTO
--    Con el piso a la vista y `configuracion` legible por cualquiera con
--    sesion, la vendedora podia despejar el costo: si el tope que manda
--    es el del margen minimo, entonces costo = piso x (1 - margen/100),
--    y de ahi a dolares reales con las tasas, que tambien lee.
--
--    Se cierra por donde toca: ella deja de leer las claves que solo le
--    importan al dueno. Las suyas —minimos de mayoreo, metas del dia,
--    minutos de reserva— las sigue leyendo.
-- =====================================================================

grant execute on function precio_minimo_de(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Las claves de configuracion que NO son del mostrador
-- ---------------------------------------------------------------------

drop policy if exists config_leer on configuracion;

create policy config_leer on configuracion for select to authenticated
using (
  es_admin()
  or clave in (
    'mayoreo_min_piezas',
    'mayoreo_min_usd',
    'meta_piezas_dia',
    'meta_premium_dia',
    'premium_min_usd',
    'reserva_minutos'
  )
);

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACION
--
-- Con sesion de VENDEDORA:
--   select nombre, precio_bs, precio_minimo_bs from v_venta_ubicacion;
--     -> funciona, y sin ninguna columna de costo
--
--   select clave from configuracion;
--     -> solo las seis del mostrador; NO margen_minimo_pct
-- =====================================================================
