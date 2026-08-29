-- =====================================================================
-- Lux by Emory — parche del disparador de mayoreo
-- Ejecutar en el SQL Editor. Es corto.
--
-- QUE ARREGLA
-- El disparador validar_minimo_mayoreo() de esquema.sql lee venta_items
-- para sumar piezas y dolares. Se creo sin SECURITY DEFINER, asi que corre
-- con los permisos de quien vende. Cuando el parche de seguridad 01 revoco
-- venta_items a `authenticated` para que la vendedora no viera el costo
-- congelado, el disparador se quedo sin poder leer esa tabla.
--
-- Efecto real, comprobado contra la base: TODA venta al mayor fallaba con
-- "permission denied for table venta_items", incluidas las que cumplian el
-- minimo de sobra. La venta al detal no se vio afectada porque el
-- disparador sale antes de tocar venta_items cuando el tipo no es 'mayor'.
--
-- La correccion es que el disparador lea como dueno. Sigue siendo solo
-- lectura de agregados para validar, y su unica salida es una excepcion.
-- =====================================================================

create or replace function validar_minimo_mayoreo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piezas int;
  v_usd    numeric(12,4);
  v_min_p  numeric(12,4);
  v_min_u  numeric(12,4);
begin
  if (select tipo from ventas where id = new.venta_id) <> 'mayor' then
    return new;
  end if;

  select coalesce(sum(cantidad), 0),
         coalesce(sum(precio_unitario_usd * cantidad), 0)
    into v_piezas, v_usd
    from venta_items where venta_id = new.venta_id;

  select valor into v_min_p from configuracion where clave = 'mayoreo_min_piezas';
  select valor into v_min_u from configuracion where clave = 'mayoreo_min_usd';

  -- Minimo: 6 piezas O $30, lo que se cumpla primero. Solo se rechaza
  -- cuando la venta queda por debajo de LOS DOS.
  if v_piezas < v_min_p and v_usd < v_min_u then
    raise exception
      'La venta al mayor requiere % piezas o $%. Llevas % piezas y $%.',
      v_min_p, v_min_u, v_piezas, v_usd;
  end if;

  return new;
end;
$$;

revoke all on function validar_minimo_mayoreo() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACION
--   Mayoreo de 4 piezas por $18  -> debe fallar diciendo el minimo.
--   Mayoreo de 8 piezas por $36  -> debe pasar.
-- =====================================================================
