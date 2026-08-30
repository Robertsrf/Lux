-- =====================================================================
-- YA NO SE CORRE. BORRA TODOS LOS DATOS.
--
-- Su parte 3 vacia modelos, lotes, existencias, ventas y reservas. Se
-- escribio para limpiar los datos de prueba de las tres fases, y eso ya
-- se hizo. Hoy hay inventario real cargado: correrlo otra vez se lleva
-- el negocio por delante.
--
-- Sus partes 1 y 2 -el mensaje del minimo de mayoreo y las reservas
-- vencidas- son arreglos permanentes que ya estan aplicados.
--
-- Si algun dia hace falta vaciar la base a proposito, se copia la parte
-- 3 a un archivo nuevo y se corre a conciencia, no desde aqui.
-- =====================================================================

do $guarda$
begin
  raise exception
    'Este archivo BORRA TODOS LOS DATOS y ya se ejecuto. No se vuelve a correr.';
end
$guarda$;

-- =====================================================================
-- Lux by Emory — cierre de las tres fases
-- UN SOLO PEGADO. Hace tres cosas:
--   1. Deja legible el mensaje del minimo de mayoreo.
--   2. Saca del pedido de la vendedora las reservas ya vencidas.
--   3. Borra TODOS los datos que use para verificar las tres fases.
-- Despues de esto la base queda limpia para el inventario real.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MENSAJE DEL MINIMO DE MAYOREO
-- Decia "requiere 6.0000 piezas o $30.0000": el numeric arrastra sus
-- cuatro decimales. La vendedora lee esto en el mostrador con la clienta
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
-- 2. UNA RESERVA VENCIDA NO ES UN PEDIDO PENDIENTE
-- Sus piezas ya volvieron al catalogo en el instante en que expiro, pero
-- la fila seguia diciendo 'abierta' hasta que limpiar_reservas() corriera,
-- asi que la vendedora veia un pedido muerto en su lista. Ahora la vista
-- mira la hora, no solo el estado.
-- ---------------------------------------------------------------------

create or replace view v_pedido_vendedora
with (security_invoker = off) as
select
  r.id as reserva_id, r.token, r.estado, r.creado_en, r.expira_en,
  r.cliente_nombre, r.cliente_telefono, r.piezas as piezas_total, r.total_usd,
  ri.modelo_id, c.sku, c.nombre, c.variantes_nota, c.foto_thumb_path, ri.cantidad,
  coalesce(u.nombre, 'Sin existencia suficiente') as ubicacion
from reservas r
join reserva_items ri on ri.reserva_id = r.id
join v_catalogo_venta c on c.id = ri.modelo_id
left join lateral (
  select ub.nombre from existencias e join ubicaciones ub on ub.id = e.ubicacion_id
   where e.modelo_id = ri.modelo_id and e.cantidad >= ri.cantidad
   order by e.cantidad desc, ub.orden limit 1
) u on true
where auth.uid() is not null
  and (r.estado = 'confirmada'
       or (r.estado = 'abierta' and r.expira_en > now()));

grant select on v_pedido_vendedora to authenticated;

-- ---------------------------------------------------------------------
-- 3. BORRAR TODO LO QUE CREE PARA VERIFICAR
-- Lleva prefijo F2 (fase 2) o ZZ (precios BCV y fase 3), o el codigo
-- F2-PRUEBA. El orden importa por las claves foraneas.
-- ---------------------------------------------------------------------

-- Ventas de prueba (venta_items cae por cascade)
delete from ventas
 where id in (select distinct venta_id from venta_items
               where modelo_id in (select id from modelos
                                    where nombre like 'F2 %' or nombre like 'ZZ %'));

-- Reservas de prueba
delete from reserva_items
 where reserva_id in (select id from reservas where cliente_nombre like 'ZZ %')
    or modelo_id in (select id from modelos where nombre like 'F2 %' or nombre like 'ZZ %');
delete from reservas where cliente_nombre like 'ZZ %';

-- Conteos de prueba
delete from conteo_detalle
 where modelo_id in (select id from modelos where nombre like 'F2 %' or nombre like 'ZZ %');
delete from conteos where notas = 'prueba de descuadre';

-- Kits de prueba
delete from kit_items where kit_id in (select id from kits where nombre like 'F2 %');
delete from kits where nombre like 'F2 %';

-- Modelos y su existencia
delete from existencias
 where modelo_id in (select id from modelos where nombre like 'F2 %' or nombre like 'ZZ %');
delete from modelos where nombre like 'F2 %' or nombre like 'ZZ %';

-- Lote, grupos y tramo de prueba
delete from lotes          where codigo = 'F2-PRUEBA';
delete from grupos_precio  where nombre like 'ZZ%';
delete from tramos_mayoreo where min_piezas = 1 and precio_por_pieza_usd = 12;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACION: las cinco lineas deben dar 0
--   select count(*) from modelos        where nombre like 'F2 %' or nombre like 'ZZ %';
--   select count(*) from lotes          where codigo = 'F2-PRUEBA';
--   select count(*) from grupos_precio  where nombre like 'ZZ%';
--   select count(*) from reservas       where cliente_nombre like 'ZZ %';
--   select count(*) from ventas;
--
-- LO UNICO QUE QUEDA INVENTADO ES LA TASA: esta en 500 / 250, que son
-- valores mios de prueba con una brecha del 100 %. Cambiala por la real
-- en la pantalla de Tasas ANTES de cargar el primer modelo: de ella sale
-- cada precio en bolivares y cada precio sugerido.
-- =====================================================================
