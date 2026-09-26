-- =====================================================================
-- Lux by Emory — el mostrador descuenta lo apartado por los pedidos
-- Ejecutar en el SQL Editor DESPUÉS de esquema-pedidos-y-mover.sql
--
-- QUÉ FALTABA
-- Un pedido del catálogo apartaba sus piezas en el catálogo público, pero
-- el mostrador no se enteraba: la vendedora veía "Quedan 3" y podía
-- venderle a otra clienta la pieza que ya estaba apartada y hasta pagada.
--
-- CÓMO SE REPARTE LO APARTADO ENTRE UBICACIONES
-- Un pedido no dice de qué ubicación es: dice "2 de esta cadena". Así que
-- lo apartado se asigna a las ubicaciones en un orden fijo: primero donde
-- hay MÁS, y a igualdad, por el orden de la tienda. Es el mismo orden con
-- que `cobrar_pedido` toma las piezas al cobrar, así que lo que el
-- mostrador ve apartado es justo lo que después sale. Y como lo más suele
-- estar en la bodega, lo apartado sale de la bodega y la vitrina queda
-- libre para quien entra a la tienda.
--
-- Se calcula, no se guarda: si alguien mueve piezas, el reparto se rehace
-- solo en la siguiente consulta. Una cifra, un sitio: la regla de qué
-- aparta un pedido sigue siendo `apartadas_de`.
--
-- LO QUE CAMBIA
--   - `v_existencia_libre`: por pieza y ubicación, lo que hay, lo apartado
--     y lo libre.
--   - `v_venta_ubicacion.cantidad` pasa a ser lo LIBRE. Al final se añaden
--     `existencia` (lo que hay de verdad, para mover piezas) y `apartadas`.
--   - `registrar_venta` no deja vender lo apartado.
--   - `cobrar_pedido` saca de lo apartado su propio pedido antes de tomar
--     las piezas, y las toma de lo libre en el mismo orden.
--
-- Firmas: las mismas. El navegador viejo sigue funcionando.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. QUÉ APARTA UN PEDIDO
-- Igual que en esquema-pedidos-y-mover.sql, más una condición: un pedido
-- con `cerrada_en` ya no aparta. Es lo que usa `cobrar_pedido` para
-- soltar su propio pedido mientras lo cobra.
-- ---------------------------------------------------------------------

create or replace function apartadas_de(p_modelo_id bigint)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(sum(ri.cantidad), 0)::int
    from reserva_items ri
    join reservas r on r.id = ri.reserva_id
   where ri.modelo_id = p_modelo_id
     and r.venta_id is null
     and r.cerrada_en is null
     and ((r.estado = 'abierta' and r.expira_en > now()) or r.estado = 'confirmada');
$fn$;

revoke all on function apartadas_de(bigint) from public;
grant execute on function apartadas_de(bigint) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. LO LIBRE, UBICACIÓN POR UBICACIÓN
-- ---------------------------------------------------------------------

create or replace view v_existencia_libre
with (security_invoker = off) as
select
  x.modelo_id,
  x.ubicacion_id,
  x.cantidad,
  least(x.cantidad, greatest(0, x.apartadas_pieza - x.antes))::int              as apartadas,
  (x.cantidad - least(x.cantidad, greatest(0, x.apartadas_pieza - x.antes)))::int as libre
from (
  select
    e.modelo_id,
    e.ubicacion_id,
    e.cantidad,
    apartadas_de(e.modelo_id) as apartadas_pieza,
    -- Lo que ya cubrieron las ubicaciones que van antes en el orden.
    coalesce(sum(e.cantidad) over (
      partition by e.modelo_id
      order by e.cantidad desc, u.orden, u.id
      rows between unbounded preceding and 1 preceding), 0) as antes
  from existencias e
  join ubicaciones u on u.id = e.ubicacion_id
  where e.cantidad > 0
) x
where auth.uid() is not null;

revoke all on v_existencia_libre from anon;
grant select on v_existencia_libre to authenticated;


-- ---------------------------------------------------------------------
-- 3. EL MOSTRADOR VE LO LIBRE
-- La de esquema-variantes-y-mostrador.sql: `cantidad` pasa a ser lo libre
-- (mismo nombre y mismo tipo, así que el navegador viejo ya ve bien), y
-- al final lo que hay de verdad y lo apartado.
-- ---------------------------------------------------------------------

create or replace view v_venta_ubicacion
with (security_invoker = off) as
select
  e.ubicacion_id, c.id as modelo_id, c.sku, c.nombre, c.categoria,
  c.variantes_nota, c.foto_thumb_path, c.foto_path, c.grupo,
  c.precio_usd, c.precio_bs,
  coalesce(l.libre, e.cantidad) as cantidad,
  c.precio_minimo_usd, c.precio_minimo_bs,
  c.familia, c.variante, c.piso_tramo_usd, c.piso_tramo_bs,
  -- Nuevas.
  e.cantidad                  as existencia,
  coalesce(l.apartadas, 0)    as apartadas
from existencias e
join v_catalogo_venta c on c.id = e.modelo_id
left join v_existencia_libre l on l.modelo_id = e.modelo_id and l.ubicacion_id = e.ubicacion_id;

grant select on v_venta_ubicacion to authenticated;


-- ---------------------------------------------------------------------
-- 4. NO SE VENDE LO APARTADO
-- La de esquema-pedidos-y-mover.sql, con una sola diferencia: lo que se
-- compara con lo pedido es lo LIBRE de esa ubicación, no lo que hay.
-- ---------------------------------------------------------------------

create or replace function registrar_venta(
  p_tipo             text,
  p_metodo           text,
  p_items            jsonb,
  p_kit_id           bigint default null,   -- se ignora, ver esquema-tramos-en-mostrador.sql
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null,
  p_notas            text default null,
  p_cliente_id       bigint default null,
  p_cliente_cedula   text default null,
  p_cliente_apellido text default null,
  p_por_verificar    boolean default false,
  p_pago_referencia  text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_venta_id     bigint;
  v_cliente_id   bigint;
  v_cliente_nom  text;
  v_cliente_tel  text;
  v_tasa         tasas%rowtype;
  v_item         jsonb;
  v_modelo_id    bigint;
  v_ubicacion_id bigint;
  v_cantidad     int;
  v_disponible   int;
  v_libre        int;
  v_apartadas    int;
  v_precio_usd   numeric(12,4);
  v_precio_lista numeric(12,4);
  v_pedido       numeric(12,4);
  v_piso         numeric(12,4);
  v_piso_tramo   numeric(12,4);
  v_precio_bs    numeric(14,2);
  v_costo        numeric(12,4);
  v_operativo    numeric(12,4);
  v_nombre       text;
  v_ubi_nombre   text;
  v_motivo       text;
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
    raise exception 'No hay tasa vigente. Fijala en la pantalla de Tasas antes de cobrar.';
  end if;

  v_cliente_id := resolver_cliente(p_cliente_id, p_cliente_cedula,
                                   p_cliente_nombre, p_cliente_apellido, p_cliente_telefono);

  v_cliente_nom := nullif(btrim(coalesce(p_cliente_nombre, '')), '');
  v_cliente_tel := nullif(btrim(coalesce(p_cliente_telefono, '')), '');
  if v_cliente_id is not null then
    select coalesce(v_cliente_nom, c.nombre_completo), coalesce(v_cliente_tel, c.telefono)
      into v_cliente_nom, v_cliente_tel
      from clientes c where c.id = v_cliente_id;
  end if;

  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  select coalesce(sum((x->>'cantidad')::int), 0)
    into v_piezas
    from jsonb_array_elements(p_items) x;

  v_desc := coalesce(descuento_para(v_piezas), 0);

  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      kit_id, cliente_id, cliente_nombre, cliente_telefono, notas,
                      por_verificar, pago_referencia)
  values (auth.uid(), p_tipo::tipo_venta, p_metodo::metodo_pago,
          v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_kit_id, v_cliente_id, v_cliente_nom, v_cliente_tel, p_notas,
          coalesce(p_por_verificar, false), nullif(btrim(coalesce(p_pago_referencia, '')), ''))
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo_id    := (v_item->>'modelo_id')::bigint;
    v_ubicacion_id := (v_item->>'ubicacion_id')::bigint;
    v_cantidad     := (v_item->>'cantidad')::int;
    v_pedido       := nullif(v_item->>'precio_unitario_usd', '')::numeric;
    v_motivo       := null;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    -- Se bloquea la fila, y despues se mira cuanto de ella esta libre.
    select e.cantidad into v_disponible
      from existencias e
     where e.modelo_id = v_modelo_id and e.ubicacion_id = v_ubicacion_id
     for update;

    select l.libre, l.apartadas into v_libre, v_apartadas
      from v_existencia_libre l
     where l.modelo_id = v_modelo_id and l.ubicacion_id = v_ubicacion_id;
    v_libre     := coalesce(v_libre, 0);
    v_apartadas := coalesce(v_apartadas, 0);

    select m.nombre || coalesce(' · ' || m.variante, ''),
           coalesce(m.precio_override_usd, g.precio_usd), m.costo_puesto_usd
      into v_nombre, v_precio_usd, v_costo
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo_id and m.activo;

    if not found then
      raise exception 'El modelo % no existe o esta retirado.', v_modelo_id;
    end if;

    select nombre into v_ubi_nombre from ubicaciones where id = v_ubicacion_id;

    if v_disponible is null or v_libre < v_cantidad then
      if v_apartadas > 0 then
        raise exception 'De "%" en % quedan % libres: % están apartadas para un pedido. Pides %.',
          v_nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), v_libre, v_apartadas, v_cantidad;
      end if;
      raise exception 'No hay suficiente "%" en %. Quedan %, y pides %.',
        v_nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), coalesce(v_disponible, 0), v_cantidad;
    end if;

    if v_precio_usd is null then
      raise exception 'El modelo "%" no tiene precio: falta asignarle un grupo.', v_nombre;
    end if;

    v_precio_lista := v_precio_usd;

    if v_desc > 0 then
      v_piso_tramo := coalesce(piso_margen_de(v_modelo_id), v_precio_lista);
      v_precio_usd := least(v_precio_lista,
                            greatest(round(v_precio_lista * (1 - v_desc / 100), 4), v_piso_tramo));
      if v_precio_usd < v_precio_lista then
        v_motivo := 'tramo';
      end if;

    elsif v_pedido is not null then
      v_piso := coalesce(precio_minimo_de(v_modelo_id), v_precio_lista);
      if round(v_pedido * v_tasa.tasa_bcv, 2) < round(v_piso * v_tasa.tasa_bcv, 2) then
        raise exception 'No puedes vender "%" por menos de Bs %. Ese es el minimo.',
          v_nombre, to_char(round(v_piso * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
      end if;
      if round(v_pedido * v_tasa.tasa_bcv, 2) > round(v_precio_lista * v_tasa.tasa_bcv, 2) then
        raise exception 'El precio de "%" no puede pasar de su precio de lista.', v_nombre;
      end if;
      v_precio_usd := least(greatest(v_pedido, v_piso), v_precio_lista);
      if v_precio_usd < v_precio_lista then
        v_motivo := 'regateo';
      end if;
    end if;

    v_precio_bs := round(v_precio_usd * v_tasa.tasa_bcv, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs,
                             precio_lista_usd, costo_puesto_usd_snap,
                             costo_operativo_usd_snap, motivo_rebaja)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            v_precio_usd, v_precio_bs, v_precio_lista, v_costo, v_operativo, v_motivo);

    v_total_bs := v_total_bs + (v_precio_bs * v_cantidad);
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  return v_venta_id;
end;
$fn$;

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text, boolean, text)
  from public, anon;
grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text, boolean, text)
  to authenticated;


-- ---------------------------------------------------------------------
-- 5. COBRAR UN PEDIDO: PRIMERO SE SUELTA, DESPUÉS SE TOMA
--
-- Si no se soltara, sus propias piezas figurarían como apartadas y la
-- venta se negaría a sí misma. Se marca `cerrada_en` al empezar (dentro de
-- la misma transacción: si algo falla, se deshace) y se toman las piezas
-- de lo LIBRE, en el mismo orden en que el mostrador las ve apartadas.
-- ---------------------------------------------------------------------

create or replace function cobrar_pedido(
  p_reserva_id      bigint,
  p_metodo          text,
  p_pago_referencia text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r       reservas%rowtype;
  v_ri    record;
  v_ex    record;
  v_items jsonb := '[]'::jsonb;
  v_falta int;
  v_toma  int;
  v_venta bigint;
begin
  if auth.uid() is null or not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Hay que iniciar sesion.';
  end if;

  select * into r from reservas where id = p_reserva_id for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;
  if r.venta_id is not null then
    raise exception 'Ese pedido ya se cobró.';
  end if;
  if r.estado in ('cancelada', 'vencida') then
    raise exception 'Ese pedido está %: ya no se puede cobrar.', r.estado;
  end if;

  -- Se suelta: desde aqui sus piezas cuentan como libres.
  update reservas set cerrada_en = now(), cerrada_por = auth.uid() where id = r.id;

  for v_ri in
    select ri.modelo_id, sum(ri.cantidad)::int as cantidad,
           min(m.nombre || coalesce(' · ' || m.variante, '')) as nombre
      from reserva_items ri
      join modelos m on m.id = ri.modelo_id
     where ri.reserva_id = r.id
     group by ri.modelo_id
  loop
    v_falta := v_ri.cantidad;
    for v_ex in
      select l.ubicacion_id, l.libre
        from v_existencia_libre l
        join ubicaciones u on u.id = l.ubicacion_id
       where l.modelo_id = v_ri.modelo_id and l.libre > 0
       order by l.cantidad desc, u.orden, u.id
    loop
      v_toma := least(v_falta, v_ex.libre);
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_ri.modelo_id, 'ubicacion_id', v_ex.ubicacion_id, 'cantidad', v_toma));
      v_falta := v_falta - v_toma;
      exit when v_falta = 0;
    end loop;
    if v_falta > 0 then
      raise exception 'De "%" faltan % en la tienda para completar el pedido.', v_ri.nombre, v_falta;
    end if;
  end loop;

  v_venta := registrar_venta(
    'detal', p_metodo, v_items, null,
    r.cliente_nombre, r.cliente_telefono, 'Pedido del catálogo #' || r.id,
    r.cliente_id, r.cliente_cedula, r.cliente_apellido,
    false, coalesce(nullif(btrim(p_pago_referencia), ''), r.pago_referencia));

  update reservas
     set venta_id = v_venta, estado = 'confirmada'
   where id = r.id;

  return v_venta;
end;
$fn$;

revoke all on function cobrar_pedido(bigint, text, text) from public, anon;
grant execute on function cobrar_pedido(bigint, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Aparta 2 piezas de algo desde el catálogo. En el mostrador, la
--    ubicación donde más hay de esa pieza muestra 2 menos, y la tarjeta
--    dice "2 apartadas". Las demás ubicaciones, igual que antes.
--
-- 2. Intenta venderlas en el mostrador: no deja, y dice cuántas hay libres
--    y cuántas apartadas.
--
-- 3. Cóbralas desde Pedidos: la venta sale, y el mostrador vuelve a
--    mostrar lo que quedó.
--
--      select * from v_existencia_libre where apartadas > 0;
--        -> una fila por ubicación con algo apartado. libre + apartadas
--           siempre suma cantidad.
-- =====================================================================
