-- =====================================================================
-- Lux by Emory — Fase 2: punto de venta y cuadre
-- Ejecutar en el SQL Editor DESPUES de esquema.sql y esquema-complemento.sql
--
-- Por que casi todo esto es SECURITY DEFINER:
-- la vendedora no puede leer `modelos`, pero una venta tiene que congelar
-- el costo puesto de cada pieza. Ese dato lo lee la funcion por dentro y
-- lo guarda en venta_items; la vendedora nunca lo ve de vuelta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REGISTRAR UNA VENTA (una sola transaccion)
--
-- Si esto fueran tres llamadas desde React y fallara la segunda, el
-- inventario quedaria corrupto. Por eso venta + items + descuento de
-- existencia viven en una sola funcion.
-- ---------------------------------------------------------------------

create or replace function registrar_venta(
  p_tipo             text,
  p_metodo           text,
  p_items            jsonb,
  p_kit_id           bigint default null,
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null,
  p_notas            text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta_id     bigint;
  v_tasa         tasas%rowtype;
  v_item         jsonb;
  v_modelo_id    bigint;
  v_ubicacion_id bigint;
  v_cantidad     int;
  v_disponible   int;
  v_precio_usd   numeric(12,4);
  v_precio_bs    numeric(14,2);
  v_costo        numeric(12,4);
  v_nombre       text;
  v_ubi_nombre   text;
  v_kit_precio   numeric(12,4);
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

  -- El precio de un kit se fija en dolares POR PIEZA, nunca como
  -- porcentaje del detal: con porcentaje, mover la tasa lo descuadra.
  if p_kit_id is not null then
    select precio_por_pieza_usd into v_kit_precio from kits where id = p_kit_id and activo;
    if not found then
      raise exception 'Ese kit no existe o esta inactivo.';
    end if;
  end if;

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

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    -- Bloquea la fila de existencia: dos ventas simultaneas no pueden
    -- llevarse la misma ultima pieza.
    select e.cantidad into v_disponible
      from existencias e
     where e.modelo_id = v_modelo_id and e.ubicacion_id = v_ubicacion_id
     for update;

    select m.nombre,
           coalesce(m.precio_override_usd, g.precio_usd),
           m.costo_puesto_usd
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

    if p_kit_id is not null then
      v_precio_usd := v_kit_precio;
    end if;
    if v_precio_usd is null then
      raise exception 'El modelo "%" no tiene precio: falta asignarle un grupo.', v_nombre;
    end if;

    v_precio_bs := round(v_precio_usd * v_tasa.tasa_venta, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs, costo_puesto_usd_snap)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            v_precio_usd, v_precio_bs, v_costo);

    v_total_bs := v_total_bs + (v_precio_bs * v_cantidad);
  end loop;

  -- El margen se mide en dolares: total_usd sale de deshacer la tasa usada.
  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  return v_venta_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. VENDER UN KIT FIJO DE UN SOLO MOVIMIENTO
-- La mayorista no puede costar 50 toques. Se elige el kit y ya.
-- ---------------------------------------------------------------------

create or replace function registrar_venta_kit(
  p_kit_id           bigint,
  p_metodo           text,
  p_ubicacion_id     bigint default null,
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null,
  p_notas            text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  if not exists (select 1 from kits where id = p_kit_id and activo) then
    raise exception 'Ese kit no existe o esta inactivo.';
  end if;

  -- Para cada modelo del kit se toma la ubicacion indicada; si no se
  -- indica ninguna, la que mas piezas tenga.
  select jsonb_agg(jsonb_build_object(
           'modelo_id',    ki.modelo_id,
           'ubicacion_id', coalesce(p_ubicacion_id, mejor.ubicacion_id),
           'cantidad',     ki.cantidad))
    into v_items
    from kit_items ki
    left join lateral (
      select e.ubicacion_id
        from existencias e
       where e.modelo_id = ki.modelo_id and e.cantidad >= ki.cantidad
       order by e.cantidad desc, e.ubicacion_id
       limit 1
    ) mejor on true
   where ki.kit_id = p_kit_id;

  if v_items is null then
    raise exception 'El kit no tiene piezas cargadas.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_items) x where x->>'ubicacion_id' is null) then
    raise exception 'Alguna pieza del kit no tiene existencia suficiente en ninguna ubicacion.';
  end if;

  return registrar_venta('mayor', p_metodo, v_items, p_kit_id,
                         p_cliente_nombre, p_cliente_telefono, p_notas);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. ANULAR UNA VENTA (solo admin) — devuelve las piezas al inventario
-- ---------------------------------------------------------------------

create or replace function admin_anular_venta(p_venta_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item venta_items%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular una venta.';
  end if;
  if (select anulada from ventas where id = p_venta_id) then
    raise exception 'Esa venta ya estaba anulada.';
  end if;

  for v_item in select * from venta_items where venta_id = p_venta_id
  loop
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_item.modelo_id, v_item.ubicacion_id, v_item.cantidad)
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();
  end loop;

  update ventas
     set anulada = true,
         notas = coalesce(notas || ' | ', '') || 'Anulada: ' || coalesce(p_motivo, 'sin motivo')
   where id = p_venta_id;
end;
$$;
