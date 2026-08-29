-- =====================================================================
-- Lux by Emory — cierre de la Fase 2
-- Un solo pegado. Hace dos cosas:
--   1. Deja legible el mensaje del minimo de mayoreo.
--   2. Borra todos los datos que use para verificar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MENSAJE DEL MINIMO DE MAYOREO
-- Decia "requiere 6.0000 piezas o $30.0000": el numeric arrastra sus
-- cuatro decimales. La vendedora lee esto en el mostrador, con la clienta
-- delante, asi que tiene que decir 6 piezas y $30 y nada mas.
-- ---------------------------------------------------------------------

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
      trunc(v_min_p)::int,
      to_char(v_min_u, 'FM999999990.00'),
      v_piezas,
      to_char(v_usd, 'FM999999990.00');
  end if;

  return new;
end;
$$;

revoke all on function validar_minimo_mayoreo() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. BORRAR LOS DATOS DE VERIFICACION
-- Todo lo que cree lleva el prefijo F2 o el codigo F2-PRUEBA.
-- El orden importa por las claves foraneas.
-- ---------------------------------------------------------------------

delete from ventas
 where id in (select distinct venta_id from venta_items
               where modelo_id in (select id from modelos where nombre like 'F2 %'));

delete from conteo_detalle
 where modelo_id in (select id from modelos where nombre like 'F2 %');

delete from conteos where notas = 'prueba de descuadre';

delete from kit_items where kit_id in (select id from kits where nombre like 'F2 %');
delete from kits where nombre like 'F2 %';

delete from existencias where modelo_id in (select id from modelos where nombre like 'F2 %');
delete from modelos where nombre like 'F2 %';
delete from lotes  where codigo = 'F2-PRUEBA';

notify pgrst, 'reload schema';

-- =====================================================================
-- Despues de esto la base queda limpia y lista para el inventario real.
-- Lo unico que sigue siendo inventado es la TASA: esta en 500 / 250.
-- Cambiala por la real en la pantalla de Tasas antes de cargar nada.
-- =====================================================================
