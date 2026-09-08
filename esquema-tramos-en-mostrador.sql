-- =====================================================================
-- Lux by Emory — el descuento por cantidad lo aplica el mostrador solo
-- Ejecutar en el SQL Editor DESPUÉS de esquema-categorias-publicas.sql
--
-- QUÉ CAMBIA Y POR QUÉ
-- Había dos formas de vender al mayor y ninguna se llevaba bien con la otra:
--
--   1. Los KITS: un paquete armado a mano por el administrador, con su
--      propio porcentaje de descuento, y una pantalla aparte para venderlo.
--   2. Los TRAMOS: 6 piezas 5 %, 12 piezas 10 %, 20 piezas 15 %. Ya se
--      aplicaban en el catálogo público, y el administrador ya los
--      configura desde su pantalla.
--
-- Los tramos ganan. Son una regla, no una lista que hay que mantener a
-- mano: sirven para cualquier combinación de piezas, no hay que armar nada
-- de antemano, y la vendedora no tiene que acordarse de cambiar de pantalla
-- para que la clienta reciba lo que le toca.
--
-- Así que el mostrador pasa a aplicar el tramo SOLO, por la cantidad total
-- de piezas de la venta, y las dos pantallas de kits desaparecen.
--
-- EL PISO SE RESPETA
-- El tramo baja el precio, pero nunca por debajo de `precio_minimo_de`, que
-- es el que guarda el margen mínimo configurado. Si un 15 % dejara una
-- pieza por debajo de ese piso, esa pieza se cobra al piso y no más abajo.
-- No es una excepción incómoda: es la única forma de que un descuento por
-- volumen no termine vendiendo a pérdida sin que nadie se entere.
--
-- SI ELLA YA REGATEÓ, MANDA SU PRECIO
-- Cuando la vendedora escribe un precio a mano para cerrar un trato, ese
-- precio manda y el tramo NO se le suma encima. Sumar los dos sería
-- descontar dos veces sobre la misma pieza.
--
-- LO QUE NO SE BORRA
-- Las tablas `kits` y `kit_items` se quedan, y `ventas.kit_id` también. Las
-- ventas de kits que ya ocurrieron tienen que seguir contando igual en los
-- reportes. Lo que se va es la forma de hacer kits NUEVOS.
--
-- Y `registrar_venta_kit` tampoco se borra aquí, aunque ya no la llame
-- nadie. Borrar una función es instantáneo y el despliegue del navegador no
-- lo es: entre que corres esto y que GitHub Pages publica la versión nueva
-- hay unos minutos, y en esos minutos la tienda sigue abierta.
--
-- POR QUÉ `p_kit_id` SE QUEDA EN LA FIRMA
-- Por lo mismo. Quitar un parámetro obliga a soltar y recrear la función, y
-- durante esos minutos el sistema que está en vivo la llamaría con un
-- parámetro que ya no existe: PostgREST no encontraría ninguna función que
-- encaje y la vendedora no podría cobrar. Con una clienta delante.
--
-- Así que el parámetro se queda y se ignora. Es feo y es correcto: cuesta
-- una línea de comentario y no cuesta ni una venta. Se puede limpiar más
-- adelante, con la tienda cerrada y sin prisa.
-- =====================================================================

create or replace function registrar_venta(
  p_tipo             text,
  p_metodo           text,
  p_items            jsonb,
  p_kit_id           bigint default null,   -- se ignora, ver arriba
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null,
  p_notas            text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_venta_id     bigint;
  v_tasa         tasas%rowtype;
  v_item         jsonb;
  v_modelo_id    bigint;
  v_ubicacion_id bigint;
  v_cantidad     int;
  v_disponible   int;
  v_precio_usd   numeric(12,4);
  v_precio_lista numeric(12,4);
  v_pedido       numeric(12,4);
  v_piso         numeric(12,4);
  v_precio_bs    numeric(14,2);
  v_costo        numeric(12,4);
  v_operativo    numeric(12,4);
  v_nombre       text;
  v_ubi_nombre   text;
  v_piezas       int := 0;
  v_desc         numeric(5,2) := 0;
  v_total_bs     numeric(14,2) := 0;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion para registrar una venta.';
  end if;
  if not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Tu usuario no tiene un perfil activo.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene piezas.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Un administrador tiene que fijarla antes de cobrar.';
  end if;

  -- Se calcula una vez y se congela en cada linea: si manana sube el
  -- alquiler, la ganancia de hoy no se reescribe.
  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  -- EL TRAMO SE DECIDE ANTES DE RECORRER NADA. Depende del total de piezas
  -- de la venta entera, asi que no se puede saber linea por linea.
  select coalesce(sum((x->>'cantidad')::int), 0)
    into v_piezas
    from jsonb_array_elements(p_items) x;

  v_desc := coalesce(descuento_para(v_piezas), 0);

  -- kit_id se sigue guardando por si llega de una version vieja del
  -- navegador: la columna existe y el historico se respeta.
  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      kit_id, cliente_nombre, cliente_telefono, notas)
  values (auth.uid(), p_tipo::tipo_venta, p_metodo::metodo_pago,
          v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_kit_id, p_cliente_nombre, p_cliente_telefono, p_notas)
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo_id    := (v_item->>'modelo_id')::bigint;
    v_ubicacion_id := (v_item->>'ubicacion_id')::bigint;
    v_cantidad     := (v_item->>'cantidad')::int;
    v_pedido       := nullif(v_item->>'precio_unitario_usd', '')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select e.cantidad into v_disponible
      from existencias e
     where e.modelo_id = v_modelo_id and e.ubicacion_id = v_ubicacion_id
     for update;

    select m.nombre, coalesce(m.precio_override_usd, g.precio_usd), m.costo_puesto_usd
      into v_nombre, v_precio_usd, v_costo
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo_id and m.activo;

    if not found then
      raise exception 'El modelo % no existe o esta retirado.', v_modelo_id;
    end if;

    select nombre into v_ubi_nombre from ubicaciones where id = v_ubicacion_id;

    if v_disponible is null or v_disponible < v_cantidad then
      raise exception 'No hay suficiente "%" en %. Quedan %, y pides %.',
        v_nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), coalesce(v_disponible, 0), v_cantidad;
    end if;

    if v_precio_usd is null then
      raise exception 'El modelo "%" no tiene precio: falta asignarle un grupo.', v_nombre;
    end if;

    v_precio_lista := v_precio_usd;
    v_piso := coalesce(precio_minimo_de(v_modelo_id), v_precio_lista);

    if v_pedido is not null then
      -- Ella escribio un precio para cerrar el trato. Ese manda, y el tramo
      -- NO se le suma encima: seria descontar dos veces la misma pieza.
      if v_pedido < v_piso then
        raise exception 'No puedes vender "%" por menos de Bs %. Ese es el minimo.',
          v_nombre, to_char(round(v_piso * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
      end if;
      if v_pedido > v_precio_lista then
        raise exception 'El precio de "%" no puede pasar de su precio de lista.', v_nombre;
      end if;
      v_precio_usd := v_pedido;

    elsif v_desc > 0 then
      -- El tramo, sin bajar del piso. `greatest` no es un detalle: sin el,
      -- un 15 % sobre una pieza justa se comeria el margen minimo y la
      -- venta saldria a perdida sin que nadie lo viera.
      v_precio_usd := greatest(round(v_precio_lista * (1 - v_desc / 100), 4), v_piso);
    end if;

    v_precio_bs := round(v_precio_usd * v_tasa.tasa_bcv, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs,
                             precio_lista_usd, costo_puesto_usd_snap,
                             costo_operativo_usd_snap)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            v_precio_usd, v_precio_bs, v_precio_lista, v_costo, v_operativo);

    v_total_bs := v_total_bs + (v_precio_bs * v_cantidad);
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  return v_venta_id;
end;
$fn$;

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text) from public, anon;
grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- La escalera que hay hoy:
--   select * from tramos_mayoreo where activo order by min_piezas;
--     -> 6 piezas 5 % · 12 piezas 10 % · 20 piezas 15 %
--
--   select descuento_para(5), descuento_para(6), descuento_para(12), descuento_para(20);
--     -> null · 5 · 10 · 15
--
-- CON SESIÓN DE VENDEDORA, y esto sí escribe: hazlo con piezas de verdad y
-- anula la venta después.
--
--   1. Cobra 5 piezas. El total tiene que ser el de lista, sin rebaja.
--   2. Cobra 6 piezas. Tiene que bajar un 5 %.
--   3. Mira que ninguna linea haya quedado por debajo de su piso:
--
--      select i.precio_unitario_usd, i.precio_lista_usd,
--             precio_minimo_de(i.modelo_id) as piso
--        from venta_items i where i.venta_id = <la venta>;
--
--      precio_unitario_usd nunca puede ser menor que piso.
--
-- Y lo que NO puede pasar: que deje de poder cobrar. Si `registrar_venta`
-- falla, lo mas probable es que algo siga llamandola con `p_kit_id`.
-- =====================================================================
