-- =====================================================================
-- Lux by Emory — pedidos que se cierran, piezas que se mueven,
--                 el catálogo desde una pieza y la vitrina sin sesión
-- Ejecutar en el SQL Editor DESPUÉS de esquema-variantes-en-tabla.sql
--
-- QUÉ TRAE
--   1. El catálogo acepta pedidos desde UNA pieza. El descuento por
--      cantidad sigue igual: desde el primer tramo, baja solo.
--   2. `mover_existencia`: pasar piezas de una ubicación a otra en un
--      toque, desde el Inventario o desde el Mostrador. La vendedora
--      también. Queda escrito quién movió qué (`movimientos`).
--   3. Vender y dejarlo "por verificar": la venta se registra (la pieza sale
--      del inventario) y aparece en Pedidos con el nombre de quien vendió,
--      hasta que alguien comprueba el pago. Y los pedidos del catálogo, que
--      hasta ahora no tenían cómo terminar, se cobran o se cancelan desde
--      Pedidos. El administrador también vende.
--   4. La vitrina se abre sin sesión: sus frases de marca pasan a ser
--      públicas, como el catálogo.
--
-- ---------------------------------------------------------------------
-- 3. POR QUÉ "POR VERIFICAR" ES UNA VENTA Y NO UNA RESERVA
--
-- Se pensó guardarla como pedido sin descontar existencia hasta que se
-- apruebe. Tiene un problema de mostrador: mientras nadie lo aprueba, la
-- pieza sigue "disponible" y otra persona la puede vender. Así que la venta
-- se registra de una vez (la existencia baja en ese momento, como siempre)
-- con `ventas.por_verificar = true`. Verificar solo la marca como
-- comprobada; si el pago no llega, se anula y las piezas vuelven.
--
-- LOS PEDIDOS DEL CATÁLOGO AHORA TERMINAN
-- Antes, un pedido pagado se quedaba en la lista para siempre: no había
-- botón para darlo por cerrado. Y al pagarlo dejaba de apartar sus piezas
-- en el catálogo (solo apartaban los "abiertos"), así que otra clienta
-- podía pedir lo mismo. Ahora:
--   - un pedido pagado sigue apartando sus piezas hasta que se cierra;
--   - `cobrar_pedido` registra la venta con las piezas del pedido, desde las
--     ubicaciones donde hay existencia, y lo cierra;
--   - `cancelar_pedido` lo cierra sin venta y libera las piezas.
--
-- FIRMAS
-- `registrar_venta` gana dos parámetros AL FINAL y con valor por defecto
-- (`p_por_verificar`, `p_pago_referencia`): el navegador viejo la llama con
-- diez y sigue encajando. `crear_reserva` conserva la suya.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LAS COLUMNAS NUEVAS
-- ---------------------------------------------------------------------

alter table ventas add column if not exists por_verificar  boolean not null default false;
alter table ventas add column if not exists pago_referencia text;
alter table ventas add column if not exists verificada_por uuid references perfiles(id);
alter table ventas add column if not exists verificada_en  timestamptz;

create index if not exists ventas_por_verificar_idx on ventas (fecha) where por_verificar and not anulada;

comment on column ventas.por_verificar is
  'La venta se registró sin comprobar el pago. Aparece en Pedidos hasta que alguien la verifica o la anula.';

alter table reservas add column if not exists venta_id    bigint references ventas(id);
alter table reservas add column if not exists cerrada_en  timestamptz;
alter table reservas add column if not exists cerrada_por uuid references perfiles(id);

comment on column reservas.venta_id is
  'La venta con que se cobró el pedido. Con venta, el pedido está cerrado y deja de apartar piezas.';

-- El rastro de cada movimiento entre ubicaciones.
create table if not exists movimientos (
  id           bigserial primary key,
  modelo_id    bigint not null references modelos(id),
  desde_id     bigint not null references ubicaciones(id),
  hacia_id     bigint not null references ubicaciones(id),
  cantidad     int not null check (cantidad > 0),
  usuario_id   uuid references perfiles(id),
  creado_en    timestamptz not null default now()
);
create index if not exists movimientos_modelo_idx on movimientos (modelo_id, creado_en desc);

alter table movimientos enable row level security;
drop policy if exists movimientos_leer on movimientos;
-- Se escriben solo desde `mover_existencia`; leerlos, el administrador.
create policy movimientos_leer on movimientos for select to authenticated using (es_admin());
revoke all on movimientos from anon;
grant select on movimientos to authenticated;


-- ---------------------------------------------------------------------
-- 2. QUÉ PIEZAS APARTA UN PEDIDO
--
-- Una sola regla para las tres que la necesitan (el catálogo público,
-- `crear_reserva` y `cobrar_pedido`): aparta el pedido abierto que no ha
-- vencido, y el pagado que todavía no se cobró ni se canceló.
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
     and ((r.estado = 'abierta' and r.expira_en > now()) or r.estado = 'confirmada');
$fn$;

-- La llama la vista pública, así que la puede ejecutar cualquiera. Devuelve
-- un número de piezas apartadas, nada más.
revoke all on function apartadas_de(bigint) from public;
grant execute on function apartadas_de(bigint) to anon, authenticated;

create or replace view v_disponible_publico
with (security_invoker = off) as
select * from (
  select
    c.id, c.sku, c.nombre, c.categoria, c.variantes_nota,
    c.foto_path, c.foto_thumb_path, c.precio_usd, c.precio_bs,
    c.existencia_total - apartadas_de(c.id) as disponible,
    c.ubicaciones_codigo,
    c.familia,
    c.variante
  from v_catalogo_venta c
  where c.existencia_total > 0
) x
where x.disponible > 0;

grant select on v_disponible_publico to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. EL CATÁLOGO, DESDE UNA PIEZA
--
-- La de esquema-cedula-en-catalogo.sql sin el mínimo de mayoreo, y con la
-- regla nueva de lo apartado. El descuento por cantidad no cambia.
-- ---------------------------------------------------------------------

create or replace function crear_reserva(
  p_items            jsonb,
  p_cliente_nombre   text,
  p_cliente_apellido text,
  p_cliente_cedula   text,
  p_cliente_telefono text,
  p_entrega          text default 'tienda',
  p_envio_empresa    text default null,
  p_envio_agencia    text default null,
  p_envio_direccion  text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_modelo     bigint;
  v_item       jsonb;
  v_cantidad   int;
  v_disponible int;
  v_nombre     text;
  v_precio     numeric(12,4);
  v_linea      numeric(12,4);
  v_piezas     int := 0;
  v_previas    int := 0;
  v_subtotal   numeric(12,4) := 0;
  v_desc       numeric(5,2);
  v_total      numeric(12,4) := 0;
  v_minutos    numeric(12,4);
  v_id         bigint;
  v_token      uuid;
  v_entrega    forma_entrega;
  v_empresa    empresa_envio;
  v_cliente    clientes%rowtype;
  v_cliente_id bigint;
  v_maestro    boolean := false;
  v_nom        text := nullif(trim(p_cliente_nombre), '');
  v_ape        text := nullif(trim(p_cliente_apellido), '');
  v_ced        text := nullif(trim(p_cliente_cedula), '');
  v_tel        text := nullif(trim(p_cliente_telefono), '');
  v_agencia    text := nullif(trim(p_envio_agencia), '');
  v_direccion  text := nullif(trim(p_envio_direccion), '');
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No elegiste ninguna pieza.';
  end if;

  if v_ced is null then raise exception 'Falta tu cedula.'; end if;
  if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cedula esta incompleta.';
  end if;

  select * into v_cliente
    from clientes
   where cedula_digitos = regexp_replace(v_ced, '[^0-9]', '', 'g');
  if found then
    v_cliente_id := v_cliente.id;
    if v_nom is null then
      v_nom := nullif(btrim(v_cliente.nombre), '');
      v_maestro := v_nom is not null;
    end if;
    if v_ape is null and nullif(btrim(coalesce(v_cliente.apellido, '')), '') is not null then
      v_ape := btrim(v_cliente.apellido);
      v_maestro := true;
    end if;
    if v_tel is null and length(regexp_replace(coalesce(v_cliente.telefono, ''), '[^0-9]', '', 'g')) >= 10 then
      v_tel := btrim(v_cliente.telefono);
      v_maestro := true;
    end if;
  end if;

  if v_nom is null then raise exception 'Falta tu nombre.'; end if;
  if v_ape is null then raise exception 'Falta tu apellido.'; end if;
  if v_tel is null then raise exception 'Falta tu numero de telefono.'; end if;
  if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
    raise exception 'Ese telefono esta incompleto. Escribelo con el codigo, por ejemplo 0412 1234567.';
  end if;

  begin
    v_entrega := coalesce(nullif(trim(p_entrega), ''), 'tienda')::forma_entrega;
  exception when others then
    raise exception 'La forma de entrega tiene que ser tienda o envio.';
  end;

  if v_entrega = 'envio' then
    begin
      v_empresa := nullif(trim(p_envio_empresa), '')::empresa_envio;
    exception when others then
      raise exception 'La empresa de envio tiene que ser Domesa o MRW.';
    end;
    if v_empresa is null then raise exception 'Dinos por cual empresa lo enviamos: Domesa o MRW.'; end if;
    if v_agencia is null then raise exception 'Falta a que agencia lo enviamos.'; end if;
    if v_direccion is null then raise exception 'Falta la direccion de la agencia.'; end if;
  else
    v_empresa   := null;
    v_agencia   := null;
    v_direccion := null;
  end if;

  perform limpiar_reservas();

  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  select coalesce(sum(greatest((x->>'cantidad')::int, 0)), 0)
    into v_previas
    from jsonb_array_elements(p_items) x;
  v_desc := coalesce(descuento_para(v_previas), 0);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select m.nombre || coalesce(' · ' || m.variante, ''),
           coalesce(m.precio_override_usd, g.precio_usd)
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

    -- Lo apartado cuenta los pedidos pagados que no se han cobrado: antes
    -- solo contaba los abiertos, y dos clientas podían pedir lo mismo.
    select coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = v_modelo), 0)
         - apartadas_de(v_modelo)
      into v_disponible;

    if v_cantidad > v_disponible then
      raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, greatest(v_disponible, 0), v_cantidad;
    end if;

    v_linea := v_precio;
    if v_desc > 0 then
      v_linea := least(v_precio,
                       greatest(round(v_precio * (1 - v_desc / 100), 4),
                                coalesce(piso_margen_de(v_modelo), v_precio)));
    end if;

    v_piezas   := v_piezas + v_cantidad;
    v_subtotal := v_subtotal + (v_precio * v_cantidad);
    v_total    := v_total + (v_linea * v_cantidad);
  end loop;

  v_total := round(v_total, 4);

  -- Ya no hay pedido mínimo: desde una pieza. El mayoreo es el descuento
  -- por cantidad, que se aplicó arriba pieza por pieza.

  select valor into v_minutos from configuracion where clave = 'reserva_minutos';

  insert into reservas (cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
                        entrega, envio_empresa, envio_agencia, envio_direccion,
                        piezas, subtotal_usd, descuento_pct, total_usd, expira_en,
                        cliente_id, datos_del_maestro)
  values (v_nom, v_ape, v_ced, v_tel,
          v_entrega, v_empresa, v_agencia, v_direccion,
          v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now() + (coalesce(v_minutos, 60) || ' minutes')::interval,
          v_cliente_id, v_maestro)
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int
    from jsonb_array_elements(p_items) x;

  return v_token;
end;
$fn$;

revoke all on function crear_reserva(jsonb, text, text, text, text, text, text, text, text) from public;
grant execute on function crear_reserva(jsonb, text, text, text, text, text, text, text, text) to anon, authenticated;

-- El mínimo ya no existe: se borran sus dos claves para que nadie crea que
-- siguen mandando.
delete from configuracion where clave in ('mayoreo_min_piezas', 'mayoreo_min_usd');


-- ---------------------------------------------------------------------
-- 4. MOVER PIEZAS DE UNA UBICACIÓN A OTRA
--
-- De las dos caras: la vendedora es la que acomoda la vitrina. En una sola
-- transacción, con la fila de origen bloqueada: dos movimientos al mismo
-- tiempo no pueden sacar más de lo que hay.
-- ---------------------------------------------------------------------

create or replace function mover_existencia(
  p_modelo_id bigint,
  p_desde_id  bigint,
  p_hacia_id  bigint,
  p_cantidad  int
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_hay    int;
  v_nombre text;
  v_desde  text;
  v_hacia  text;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion para mover piezas.';
  end if;
  if not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Tu usuario no tiene un perfil activo.';
  end if;
  if p_desde_id is null or p_hacia_id is null or p_desde_id = p_hacia_id then
    raise exception 'Elige a qué otra ubicación la llevas.';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad a mover tiene que ser mayor que cero.';
  end if;

  select m.nombre || coalesce(' · ' || m.variante, '') into v_nombre
    from modelos m where m.id = p_modelo_id and m.activo;
  if v_nombre is null then
    raise exception 'Esa pieza no existe o está retirada.';
  end if;
  select nombre into v_desde from ubicaciones where id = p_desde_id;
  select nombre into v_hacia from ubicaciones where id = p_hacia_id and activo;
  if v_hacia is null then
    raise exception 'La ubicación de destino no existe.';
  end if;

  select cantidad into v_hay
    from existencias
   where modelo_id = p_modelo_id and ubicacion_id = p_desde_id
   for update;
  if coalesce(v_hay, 0) < p_cantidad then
    raise exception 'En % hay % de "%", y quieres mover %.', coalesce(v_desde, 'esa ubicación'), coalesce(v_hay, 0), v_nombre, p_cantidad;
  end if;

  update existencias
     set cantidad = cantidad - p_cantidad, actualizado_en = now()
   where modelo_id = p_modelo_id and ubicacion_id = p_desde_id;

  insert into existencias (modelo_id, ubicacion_id, cantidad)
  values (p_modelo_id, p_hacia_id, p_cantidad)
  on conflict (modelo_id, ubicacion_id)
  do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();

  insert into movimientos (modelo_id, desde_id, hacia_id, cantidad, usuario_id)
  values (p_modelo_id, p_desde_id, p_hacia_id, p_cantidad, auth.uid());
end;
$fn$;

revoke all on function mover_existencia(bigint, bigint, bigint, int) from public, anon;
grant execute on function mover_existencia(bigint, bigint, bigint, int) to authenticated;


-- ---------------------------------------------------------------------
-- 5. COBRAR, O DEJARLO POR VERIFICAR
--
-- La de esquema-variantes-y-mostrador.sql con dos parámetros más al final.
-- Lo único que cambia del cuerpo es que la venta guarda si quedó por
-- verificar y la referencia del pago.
-- ---------------------------------------------------------------------

drop function if exists registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text);

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

    select e.cantidad into v_disponible
      from existencias e
     where e.modelo_id = v_modelo_id and e.ubicacion_id = v_ubicacion_id
     for update;

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

    if v_disponible is null or v_disponible < v_cantidad then
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

-- Comprobar el pago de una venta que quedó por verificar. De las dos caras:
-- lo comprueba quien tenga el banco a mano.
create or replace function verificar_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null or not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Hay que iniciar sesion.';
  end if;
  update ventas
     set por_verificar = false, verificada_por = auth.uid(), verificada_en = now()
   where id = p_venta_id and por_verificar and not anulada;
  if not found then
    raise exception 'Esa venta ya no está por verificar.';
  end if;
end;
$fn$;

revoke all on function verificar_venta(bigint) from public, anon;
grant execute on function verificar_venta(bigint) to authenticated;

-- El pago no llegó: la venta se anula y las piezas vuelven a su ubicación.
-- De las dos caras, pero SOLO para ventas por verificar. Anular una venta
-- comprobada sigue siendo del administrador (`admin_anular_venta`).
create or replace function anular_venta_por_verificar(p_venta_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item venta_items%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Hay que iniciar sesion.';
  end if;
  perform 1 from ventas where id = p_venta_id and por_verificar and not anulada for update;
  if not found then
    raise exception 'Esa venta ya no está por verificar: pídele al administrador que la anule.';
  end if;

  for v_item in select * from venta_items where venta_id = p_venta_id
  loop
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_item.modelo_id, v_item.ubicacion_id, v_item.cantidad)
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();
  end loop;

  update ventas
     set anulada = true, por_verificar = false,
         verificada_por = auth.uid(), verificada_en = now(),
         notas = coalesce(notas || ' | ', '') || 'Anulada sin pago: ' || coalesce(nullif(btrim(p_motivo), ''), 'el pago no llegó')
   where id = p_venta_id;
end;
$fn$;

revoke all on function anular_venta_por_verificar(bigint, text) from public, anon;
grant execute on function anular_venta_por_verificar(bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- 6. COBRAR O CANCELAR UN PEDIDO DEL CATÁLOGO
-- ---------------------------------------------------------------------

-- Registra la venta con las piezas del pedido, tomándolas de donde haya
-- existencia (primero donde hay más, como dice "Dónde está" en Pedidos), y
-- cierra el pedido. La clienta, si es nueva, nace aquí: es cuando alguien
-- le cobra.
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
      select e.ubicacion_id, e.cantidad
        from existencias e
        join ubicaciones u on u.id = e.ubicacion_id
       where e.modelo_id = v_ri.modelo_id and e.cantidad > 0
       order by e.cantidad desc, u.orden
    loop
      v_toma := least(v_falta, v_ex.cantidad);
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
     set venta_id = v_venta, estado = 'confirmada',
         cerrada_en = now(), cerrada_por = auth.uid()
   where id = r.id;

  return v_venta;
end;
$fn$;

revoke all on function cobrar_pedido(bigint, text, text) from public, anon;
grant execute on function cobrar_pedido(bigint, text, text) to authenticated;

create or replace function cancelar_pedido(p_reserva_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null or not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Hay que iniciar sesion.';
  end if;
  update reservas
     set estado = 'cancelada', cerrada_en = now(), cerrada_por = auth.uid()
   where id = p_reserva_id and venta_id is null and estado in ('abierta', 'confirmada');
  if not found then
    raise exception 'Ese pedido ya estaba cerrado.';
  end if;
end;
$fn$;

revoke all on function cancelar_pedido(bigint) from public, anon;
grant execute on function cancelar_pedido(bigint) to authenticated;

-- Pedidos: los del catálogo que siguen abiertos. Uno cobrado o cancelado
-- sale de la lista. Mismas columnas que esquema-cedula-en-catalogo.sql.
create or replace view v_pedido_vendedora
with (security_invoker = off) as
select
  r.id as reserva_id,
  r.token,
  r.estado,
  r.creado_en,
  r.expira_en,
  r.cliente_nombre,
  r.cliente_apellido,
  r.cliente_cedula,
  r.cliente_telefono,
  r.entrega,
  r.envio_empresa,
  r.envio_agencia,
  r.envio_direccion,
  r.pago_metodo,
  r.pago_referencia,
  r.pago_fecha,
  r.pago_cedula,
  r.pago_telefono,
  r.pago_reportado_en,
  r.piezas as piezas_total,
  r.total_usd,
  ri.modelo_id,
  c.sku,
  c.nombre,
  c.variantes_nota,
  c.foto_thumb_path,
  ri.cantidad,
  coalesce(u.nombre, 'Sin existencia suficiente') as ubicacion,
  c.variante,
  r.cliente_id
from reservas r
join reserva_items ri on ri.reserva_id = r.id
join v_catalogo_venta c on c.id = ri.modelo_id
left join lateral (
  select ub.nombre
    from existencias e
    join ubicaciones ub on ub.id = e.ubicacion_id
   where e.modelo_id = ri.modelo_id and e.cantidad >= ri.cantidad
   order by e.cantidad desc, ub.orden
   limit 1
) u on true
where auth.uid() is not null
  and r.venta_id is null
  and (r.estado = 'confirmada' or (r.estado = 'abierta' and r.expira_en > now()));

revoke all on v_pedido_vendedora from anon;
grant select on v_pedido_vendedora to authenticated;

-- Las ventas por verificar, una fila por pieza. Sin una sola columna de
-- costo: lo que se vendió, a cuánto, quién y cómo pagó.
create or replace view v_ventas_por_verificar
with (security_invoker = off) as
select
  v.id                as venta_id,
  v.fecha,
  v.usuario_id,
  p.nombre            as vendedora,
  v.metodo,
  v.pago_referencia,
  v.cliente_id,
  v.cliente_nombre,
  v.cliente_telefono,
  cl.cedula           as cliente_cedula,
  v.total_bs,
  round(v.total_bs / nullif(v.tasa_bcv_usada, 0), 2) as total_bcv,
  v.total_usd         as total_binance,
  i.modelo_id,
  m.sku,
  m.nombre,
  m.variante,
  m.foto_thumb_path,
  i.cantidad,
  i.precio_unitario_bs,
  ub.nombre           as ubicacion
from ventas v
join venta_items i on i.venta_id = v.id
join modelos m     on m.id = i.modelo_id
left join ubicaciones ub on ub.id = i.ubicacion_id
left join perfiles p     on p.id = v.usuario_id
left join clientes cl    on cl.id = v.cliente_id
where v.por_verificar
  and not v.anulada
  and auth.uid() is not null;

revoke all on v_ventas_por_verificar from anon;
grant select on v_ventas_por_verificar to authenticated;


-- ---------------------------------------------------------------------
-- 7. LA VITRINA, SIN SESIÓN
--
-- Lee `v_disponible_publico`, que ya es pública. Lo único que le faltaba
-- eran sus frases de marca: las de la superficie 'TV' pasan a leerse sin
-- sesión. Son las mismas que la vitrina enseña de cara a la calle.
-- ---------------------------------------------------------------------

drop policy if exists frases_leer_tv on frases;
create policy frases_leer_tv on frases for select to anon
  using (activo and 'TV' = any(superficie));
grant select on frases to anon;

drop policy if exists frases_cat_leer_anon on frases_categorias;
create policy frases_cat_leer_anon on frases_categorias for select to anon using (true);
grant select on frases_categorias to anon;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Que no hayan quedado DOS registrar_venta:
--      select count(*) from pg_proc where proname = 'registrar_venta';   -> 1
--
-- 2. Sin sesión (como una clienta):
--      select count(*) from frases;                  -> solo las de TV activas
--      select count(*) from v_ventas_por_verificar;  -> tiene que FALLAR
--
-- 3. Desde el catálogo, un pedido de UNA pieza: se aparta sin quejarse.
--
-- 4. En el Mostrador, una venta "por verificar": aparece en Pedidos con tu
--    nombre; al verificarla desaparece de ahí y sigue contando en los
--    reportes. Anula otra de prueba: la pieza vuelve a su ubicación.
-- =====================================================================
