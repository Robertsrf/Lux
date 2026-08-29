creoq-- =====================================================================
-- Lux by Emory — el mayoreo se cobra por PORCENTAJE DE DESCUENTO
-- Ejecutar en el SQL Editor DESPUES de esquema-precios-bcv.sql
--
-- QUE CAMBIA
-- Kits y tramos dejan de fijar un "precio por pieza" y pasan a aplicar un
-- descuento sobre lo que ya valen las piezas elegidas:
--
--   subtotal = suma(precio de etiqueta x cantidad)     dolares BCV
--   total    = subtotal x (1 - descuento / 100)
--
-- POR QUE AHORA SI SE PUEDE
-- El PLAN prohibia el porcentaje porque "al mover la tasa el descuento se
-- descuadra solo". Eso era cierto cuando el precio se anclaba en dolares
-- reales y se convertia con la tasa de venta. Con el precio anclado en
-- dolares BCV, el porcentaje se aplica sobre numeros que NO se mueven al
-- cambiar la tasa: el subtotal en BCV es el mismo hoy y manana, y los
-- bolivares escalan igual que en el detal. El descuadre ya no existe.
--
-- Y ADEMAS ES MEJOR PARA EL NEGOCIO
-- Con un precio plano por pieza, una mayorista podia llenar el kit solo
-- con las piezas mas caras y pagar lo mismo. Con porcentaje, quien se
-- lleva lo caro paga proporcionalmente mas.
--
-- LO QUE HAY QUE VIGILAR
-- Un porcentaje no conoce el costo. Un descuento grande sobre una pieza
-- de margen fino puede dejarla por debajo del costo, y la base no lo va a
-- impedir. La pantalla de Tramos calcula el peor caso del catalogo y avisa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TRAMOS: descuento, no precio
-- ---------------------------------------------------------------------

alter table tramos_mayoreo drop column if exists precio_por_pieza_usd;
alter table tramos_mayoreo add column if not exists descuento_pct numeric(5,2);

update tramos_mayoreo set descuento_pct = 0 where descuento_pct is null;

alter table tramos_mayoreo alter column descuento_pct set not null;
alter table tramos_mayoreo drop constraint if exists tramos_mayoreo_descuento_pct_check;
alter table tramos_mayoreo add constraint tramos_mayoreo_descuento_pct_check
  check (descuento_pct >= 0 and descuento_pct < 100);

drop function if exists precio_por_pieza_para(int);

/** Descuento del tramo mas alto que alcance esa cantidad de piezas. */
create or replace function descuento_para(p_piezas int)
returns numeric
language sql
stable
as $$
  select descuento_pct
    from tramos_mayoreo
   where activo and min_piezas <= p_piezas
   order by min_piezas desc
   limit 1;
$$;

revoke all on function descuento_para(int) from public;
grant execute on function descuento_para(int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. KITS: descuento, no precio por pieza
-- Las piezas y sus cantidades se eligen del catalogo; n_piezas se calcula
-- de ellas. Lo unico que se teclea es el descuento.
-- ---------------------------------------------------------------------

alter table kits drop column if exists precio_por_pieza_usd;
-- n_piezas se calcula de kit_items en v_kits_resumen: guardarlo aparte solo
-- daba una cifra que podia quedar desfasada.
alter table kits drop column if exists n_piezas;
alter table kits add column if not exists descuento_pct numeric(5,2);

update kits set descuento_pct = 0 where descuento_pct is null;

alter table kits alter column descuento_pct set not null;
alter table kits drop constraint if exists kits_descuento_pct_check;
alter table kits add constraint kits_descuento_pct_check
  check (descuento_pct >= 0 and descuento_pct < 100);

-- ---------------------------------------------------------------------
-- 3. LA RESERVA GUARDA EL DESGLOSE
-- ---------------------------------------------------------------------

alter table reservas drop column if exists precio_por_pieza_usd;
alter table reservas add column if not exists subtotal_usd  numeric(12,4);
alter table reservas add column if not exists descuento_pct numeric(5,2);

-- ---------------------------------------------------------------------
-- 4. COBRAR UN KIT: el descuento se aplica pieza por pieza
-- Cada linea guarda su precio ya rebajado, asi el reporte de margen sigue
-- siendo exacto sin tener que recordar que kit era.
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
  v_kit_desc     numeric(5,2) := 0;
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

  if p_kit_id is not null then
    select descuento_pct into v_kit_desc from kits where id = p_kit_id and activo;
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

    if v_precio_usd is null then
      raise exception 'El modelo "%" no tiene precio: falta asignarle un grupo.', v_nombre;
    end if;

    -- El kit no impone un precio: rebaja el que la pieza ya tenia.
    if p_kit_id is not null and coalesce(v_kit_desc, 0) > 0 then
      v_precio_usd := round(v_precio_usd * (1 - v_kit_desc / 100), 4);
    end if;

    -- El precio esta en dolares BCV: se cobra a la tasa del BCV.
    v_precio_bs := round(v_precio_usd * v_tasa.tasa_bcv, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs, costo_puesto_usd_snap)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            v_precio_usd, v_precio_bs, v_costo);

    v_total_bs := v_total_bs + (v_precio_bs * v_cantidad);
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  return v_venta_id;
end;
$$;

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text) from public, anon;
grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. LA RESERVA COTIZA POR SUBTOTAL Y DESCUENTO
-- ---------------------------------------------------------------------

create or replace function crear_reserva(
  p_items            jsonb,
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modelo     bigint;
  v_item       jsonb;
  v_cantidad   int;
  v_disponible int;
  v_nombre     text;
  v_precio     numeric(12,4);
  v_piezas     int := 0;
  v_subtotal   numeric(12,4) := 0;
  v_desc       numeric(5,2);
  v_total      numeric(12,4);
  v_min_p      numeric(12,4);
  v_min_u      numeric(12,4);
  v_minutos    numeric(12,4);
  v_id         bigint;
  v_token      uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No elegiste ninguna pieza.';
  end if;

  perform limpiar_reservas();

  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select m.nombre, coalesce(m.precio_override_usd, g.precio_usd)
      into v_nombre, v_precio
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo and m.activo;
    if not found then
      raise exception 'Una de las piezas que elegiste ya no esta disponible.';
    end if;
    if v_precio is null then
      raise exception 'La pieza "%" todavia no tiene precio. Escribenos y te cotizamos.', v_nombre;
    end if;

    select coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = v_modelo), 0)
         - coalesce((select sum(ri.cantidad)
                       from reserva_items ri
                       join reservas r on r.id = ri.reserva_id
                      where ri.modelo_id = v_modelo
                        and r.estado = 'abierta'
                        and r.expira_en > now()), 0)
      into v_disponible;

    if v_cantidad > v_disponible then
      raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, v_disponible, v_cantidad;
    end if;

    v_piezas   := v_piezas + v_cantidad;
    v_subtotal := v_subtotal + (v_precio * v_cantidad);
  end loop;

  -- El descuento sale del tramo que alcance esa cantidad de piezas.
  v_desc  := coalesce(descuento_para(v_piezas), 0);
  v_total := round(v_subtotal * (1 - v_desc / 100), 4);

  select valor into v_min_p from configuracion where clave = 'mayoreo_min_piezas';
  select valor into v_min_u from configuracion where clave = 'mayoreo_min_usd';

  -- Minimo: 6 piezas O $30, lo que se cumpla primero.
  if v_piezas < v_min_p and v_total < v_min_u then
    raise exception 'El pedido al mayor requiere % piezas o $%. Llevas % piezas y $%.',
      trunc(v_min_p)::int, to_char(v_min_u, 'FM999999990.00'),
      v_piezas, to_char(v_total, 'FM999999990.00');
  end if;

  select valor into v_minutos from configuracion where clave = 'reserva_minutos';

  insert into reservas (cliente_nombre, cliente_telefono, piezas,
                        subtotal_usd, descuento_pct, total_usd, expira_en)
  values (nullif(trim(p_cliente_nombre), ''), nullif(trim(p_cliente_telefono), ''),
          v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now() + (coalesce(v_minutos, 60) || ' minutes')::interval)
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int
    from jsonb_array_elements(p_items) x;

  return v_token;
end;
$$;

revoke all on function crear_reserva(jsonb, text, text) from public;
grant execute on function crear_reserva(jsonb, text, text) to anon, authenticated;

-- ver_reserva ahora devuelve el desglose completo.
create or replace function ver_reserva(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     reservas%rowtype;
  v_items jsonb;
begin
  perform limpiar_reservas();

  select * into v_r from reservas where token = p_token;
  if not found then
    raise exception 'Esa reserva no existe o el enlace esta mal copiado.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'modelo_id', ri.modelo_id, 'cantidad', ri.cantidad,
           'sku', c.sku, 'nombre', c.nombre,
           'variantes_nota', c.variantes_nota,
           'foto_thumb_path', c.foto_thumb_path,
           'precio_usd', c.precio_usd
         ) order by c.nombre), '[]'::jsonb)
    into v_items
    from reserva_items ri
    join v_catalogo_venta c on c.id = ri.modelo_id
   where ri.reserva_id = v_r.id;

  return jsonb_build_object(
    'estado',        v_r.estado,
    'creado_en',     v_r.creado_en,
    'expira_en',     v_r.expira_en,
    'cliente_nombre', v_r.cliente_nombre,
    'piezas',        v_r.piezas,
    'subtotal_usd',  v_r.subtotal_usd,
    'descuento_pct', v_r.descuento_pct,
    'total_usd',     v_r.total_usd,
    'items',         v_items);
end;
$$;

revoke all on function ver_reserva(uuid) from public;
grant execute on function ver_reserva(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. RESUMEN DE CADA KIT
-- Piezas, subtotal y total con el descuento ya aplicado, calculado en un
-- solo sitio para que el mostrador y la administracion no lo repitan.
-- Sin una sola columna de costo: la vendedora tambien la lee.
-- ---------------------------------------------------------------------

create or replace view v_kits_resumen
with (security_invoker = off) as
select
  k.id,
  k.nombre,
  k.descripcion,
  k.activo,
  k.descuento_pct,
  coalesce(sum(ki.cantidad), 0) as piezas,
  round(coalesce(sum(coalesce(m.precio_override_usd, g.precio_usd) * ki.cantidad), 0), 4) as subtotal_usd,
  round(coalesce(sum(coalesce(m.precio_override_usd, g.precio_usd) * ki.cantidad), 0)
        * (1 - k.descuento_pct / 100), 4) as total_usd
from kits k
left join kit_items ki on ki.kit_id = k.id
left join modelos m on m.id = ki.modelo_id
left join grupos_precio g on g.id = m.grupo_precio_id
group by k.id;

grant select on v_kits_resumen to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACION
--   select descuento_para(10);        -- el tramo que alcance 10 piezas
--   select * from tramos_mayoreo;     -- columna descuento_pct, no precio
--   select * from kits;               -- idem
-- =====================================================================
