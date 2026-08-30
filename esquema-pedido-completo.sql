-- =====================================================================
-- Lux by Emory — el pedido en línea pide todo lo que hace falta
-- Ejecutar en el SQL Editor DESPUÉS de esquema-mensaje-catalogo.sql
--
-- QUÉ FALTABA
-- La reserva guardaba nombre y teléfono, y nada más. Con eso no se puede
-- despachar: falta apellido, cédula, a qué agencia va y quién pagó.
--
-- DOS PASOS, NO UNO — Y ES A PROPÓSITO
-- La clienta primero APARTA y después PAGA:
--
--   1. Da sus datos y dice cómo lo recibe  ->  las piezas quedan suyas
--   2. Ya apartadas, paga y pega la referencia
--
-- Al revés sería peligroso. Si pagara antes de apartar, otra clienta
-- podría llevarse la última pieza mientras ella transfiere, y el pedido
-- fallaría con el dinero ya enviado. Apartar primero no cuesta nada y
-- quita ese riesgo entero.
--
-- Al reportar el pago la reserva deja de correr contra el reloj: se le
-- estira el vencimiento tres días. Nadie que ya pagó debe ver cómo su
-- reserva se vence sola mientras la vendedora la revisa.
--
-- LO QUE SE VALIDA AQUÍ Y NO EN EL NAVEGADOR
-- `crear_reserva` y `reportar_pago` están otorgadas a anon: cualquiera
-- puede llamarlas sin pasar por el formulario. Así que los obligatorios
-- se comprueban aquí dentro. El formulario ayuda; esto es lo que manda.
--
-- DATOS PERSONALES
-- Aquí entran cédula, teléfono y dirección de gente real. La tabla
-- `reservas` sigue cerrada a anon: se escribe por estas funciones y se
-- lee por `ver_reserva`, que exige el token de la propia reserva.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CÓMO LO RECIBE
-- ---------------------------------------------------------------------

do $bloque$
begin
  if not exists (select 1 from pg_type where typname = 'forma_entrega') then
    create type forma_entrega as enum ('tienda', 'envio');
  end if;
  if not exists (select 1 from pg_type where typname = 'empresa_envio') then
    -- Las dos que trabajan cobro a destino.
    create type empresa_envio as enum ('domesa', 'mrw');
  end if;
end
$bloque$;

alter table reservas
  add column if not exists cliente_apellido   text,
  add column if not exists cliente_cedula     text,
  add column if not exists entrega            forma_entrega not null default 'tienda',
  add column if not exists envio_empresa      empresa_envio,
  add column if not exists envio_agencia      text,
  add column if not exists envio_direccion    text,
  add column if not exists pago_metodo        metodo_pago,
  add column if not exists pago_referencia    text,
  add column if not exists pago_fecha         date,
  add column if not exists pago_cedula        text,
  add column if not exists pago_telefono      text,
  add column if not exists pago_reportado_en  timestamptz;

comment on column reservas.entrega is 'tienda = retira ella; envio = va por Domesa o MRW, cobro a destino';
comment on column reservas.pago_reportado_en is 'Cuándo pegó la referencia. Mientras sea null, no ha reportado pago.';

-- ---------------------------------------------------------------------
-- 2. APARTAR: SUS DATOS Y CÓMO LO RECIBE
-- ---------------------------------------------------------------------

drop function if exists crear_reserva(jsonb, text, text);

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
  v_piezas     int := 0;
  v_subtotal   numeric(12,4) := 0;
  v_desc       numeric(5,2);
  v_total      numeric(12,4);
  v_min_p      numeric(12,4);
  v_min_u      numeric(12,4);
  v_minutos    numeric(12,4);
  v_id         bigint;
  v_token      uuid;
  v_entrega    forma_entrega;
  v_empresa    empresa_envio;
  -- Los datos de la clienta, ya limpios de espacios sobrantes.
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

  -- Sin estos cuatro no se puede despachar ni cobrar.
  if v_nom is null then raise exception 'Falta tu nombre.'; end if;
  if v_ape is null then raise exception 'Falta tu apellido.'; end if;
  if v_ced is null then raise exception 'Falta tu cedula.'; end if;
  if v_tel is null then raise exception 'Falta tu numero de telefono.'; end if;

  -- Se miran los dígitos, no el formato: la gente escribe la cédula y el
  -- teléfono de diez maneras distintas y ninguna está mal.
  if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cedula esta incompleta.';
  end if;
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
    -- Si retira en tienda, no se guardan datos de envío a medias.
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

  insert into reservas (cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
                        entrega, envio_empresa, envio_agencia, envio_direccion,
                        piezas, subtotal_usd, descuento_pct, total_usd, expira_en)
  values (v_nom, v_ape, v_ced, v_tel,
          v_entrega, v_empresa, v_agencia, v_direccion,
          v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now() + (coalesce(v_minutos, 60) || ' minutes')::interval)
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int
    from jsonb_array_elements(p_items) x;

  return v_token;
end;
$fn$;

revoke all on function crear_reserva(jsonb, text, text, text, text, text, text, text, text) from public;
grant execute on function crear_reserva(jsonb, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. REPORTAR EL PAGO
--
-- Segundo paso, con las piezas ya apartadas. Solo lo puede hacer quien
-- tenga el token de esa reserva, que es la propia clienta.
-- ---------------------------------------------------------------------

create or replace function reportar_pago(
  p_token      uuid,
  p_metodo     text,
  p_referencia text default null,
  p_fecha      date default null,
  p_cedula     text default null,
  p_telefono   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r      reservas%rowtype;
  v_metodo metodo_pago;
  v_ref    text := nullif(trim(p_referencia), '');
  v_ced    text := nullif(trim(p_cedula), '');
  v_tel    text := nullif(trim(p_telefono), '');
begin
  perform limpiar_reservas();

  select * into v_r from reservas where token = p_token;
  if not found then
    raise exception 'Esa reserva no existe o el enlace esta mal copiado.';
  end if;
  if v_r.estado = 'cancelada' then
    raise exception 'Esa reserva fue cancelada.';
  end if;
  if v_r.estado = 'vencida' then
    raise exception 'Esa reserva ya vencio. Vuelve al catalogo y aparta de nuevo; no se te cobro nada.';
  end if;

  begin
    v_metodo := nullif(trim(p_metodo), '')::metodo_pago;
  exception when others then
    raise exception 'Esa forma de pago no existe.';
  end;
  if v_metodo is null then raise exception 'Dinos como pagaste.'; end if;

  if v_metodo in ('efectivo_bs', 'efectivo_usd') then
    -- Pagar al retirar solo tiene sentido si viene a la tienda.
    if v_r.entrega <> 'tienda' then
      raise exception 'El efectivo es solo para retirar en tienda. Si es envio, paga por movil o transferencia.';
    end if;
  else
    -- Pago móvil y transferencia: los cuatro datos con los que la tienda
    -- comprueba la transferencia en su banco. Sin uno no se comprueba.
    if v_ref is null then raise exception 'Falta el numero de referencia del pago.'; end if;
    if p_fecha is null then raise exception 'Falta la fecha del pago.'; end if;
    if v_ced is null then raise exception 'Falta la cedula de quien transfirio.'; end if;
    if v_tel is null then raise exception 'Falta el telefono de quien transfirio.'; end if;
    if p_fecha > current_date then raise exception 'Esa fecha de pago es de manana. Revisala.'; end if;
    if p_fecha < current_date - 30 then raise exception 'Esa fecha de pago tiene mas de un mes. Revisala.'; end if;
    if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
      raise exception 'Esa cedula esta incompleta.';
    end if;
    if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
      raise exception 'Ese telefono esta incompleto.';
    end if;
  end if;

  -- Reportar el pago confirma el pedido: quien pagó ya dijo que sí, y
  -- pedirle además un botón de "confirmar" es pedirle lo mismo dos veces.
  --
  -- Y deja de correr contra el reloj. Tres días le sobran a la vendedora
  -- para comprobar la referencia en su banco.
  update reservas set
    estado            = 'confirmada',
    pago_metodo       = v_metodo,
    pago_referencia   = v_ref,
    pago_fecha        = p_fecha,
    pago_cedula       = v_ced,
    pago_telefono     = v_tel,
    pago_reportado_en = now(),
    expira_en         = greatest(expira_en, now() + interval '3 days')
  where id = v_r.id;

  return jsonb_build_object('estado', 'confirmada', 'metodo', v_metodo);
end;
$fn$;

revoke all on function reportar_pago(uuid, text, text, date, text, text) from public;
grant execute on function reportar_pago(uuid, text, text, date, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. LA CLIENTA VE SU PROPIA RESERVA
-- Con el token, y solo con el token. Se le devuelven sus propios datos
-- para que compruebe que no se equivocó al escribirlos.
-- ---------------------------------------------------------------------

create or replace function ver_reserva(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
    'estado',           v_r.estado,
    'creado_en',        v_r.creado_en,
    'expira_en',        v_r.expira_en,
    'cliente_nombre',   v_r.cliente_nombre,
    'cliente_apellido', v_r.cliente_apellido,
    'cliente_telefono', v_r.cliente_telefono,
    'entrega',          v_r.entrega,
    'envio_empresa',    v_r.envio_empresa,
    'envio_agencia',    v_r.envio_agencia,
    'envio_direccion',  v_r.envio_direccion,
    'pago_metodo',      v_r.pago_metodo,
    'pago_referencia',  v_r.pago_referencia,
    'pago_fecha',       v_r.pago_fecha,
    'pago_reportado_en', v_r.pago_reportado_en,
    'piezas',           v_r.piezas,
    'subtotal_usd',     v_r.subtotal_usd,
    'descuento_pct',    v_r.descuento_pct,
    'total_usd',        v_r.total_usd,
    'items',            v_items);
end;
$fn$;

revoke all on function ver_reserva(uuid) from public;
grant execute on function ver_reserva(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. LA VENDEDORA VE TODO LO QUE NECESITA PARA DESPACHAR
-- ---------------------------------------------------------------------

drop view if exists v_pedido_vendedora;

create view v_pedido_vendedora
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
  coalesce(u.nombre, 'Sin existencia suficiente') as ubicacion
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
  and (r.estado = 'confirmada' or (r.estado = 'abierta' and r.expira_en > now()));

grant select on v_pedido_vendedora to authenticated;

-- ---------------------------------------------------------------------
-- 6. A DÓNDE PAGA LA CLIENTA
--
-- El teléfono del pago móvil, el RIF y el banco. Van en `textos` para que
-- se cambien desde la pantalla sin desplegar: si mañana cambia el banco,
-- no se toca código. Se deja vacío a propósito, para que lo llene el
-- dueño con sus datos reales. Mientras esté vacío, la pantalla del pago
-- le dice a la clienta que escriba a la tienda.
-- ---------------------------------------------------------------------

insert into textos (clave, valor) values ('datos_pago', '')
on conflict (clave) do nothing;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select column_name from information_schema.columns
--    where table_name = 'reservas' order by ordinal_position;
--     -> aparecen cliente_apellido, cliente_cedula, entrega,
--        envio_empresa, envio_agencia, envio_direccion, pago_metodo,
--        pago_referencia, pago_fecha, pago_cedula, pago_telefono,
--        pago_reportado_en
--
--   Una reserva sin apellido debe ser rechazada por la base, no solo por
--   el formulario:
--     select crear_reserva('[{"modelo_id":1,"cantidad":1}]'::jsonb,
--                          'Ana', '', '12345678', '04121234567');
--     -> ERROR: Falta tu apellido.
-- =====================================================================
