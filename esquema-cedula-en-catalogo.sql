-- =====================================================================
-- Lux by Emory — el pedido del catálogo empieza por la cédula
-- Ejecutar en el SQL Editor DESPUÉS de esquema-variantes-y-mostrador.sql
--
-- QUÉ CAMBIA
-- Al pedir por el catálogo, la clienta escribe primero su cédula. Si ya
-- compró en la tienda (está en el maestro de clientas), la reconoce y le
-- pide confirmar que es ella; no vuelve a escribir nada. Si no está, llena
-- sus datos como siempre.
--
-- LO QUE NO SE PUEDE HACER, Y POR QUÉ
-- El catálogo lo abre cualquiera, sin sesión. Las cédulas venezolanas son
-- números correlativos. Una búsqueda que devolviera nombre y teléfono
-- completos dejaría a cualquiera probar cédula tras cédula y llevarse la
-- lista entera de clientas con sus teléfonos. Por eso:
--
--   1. `buscar_cliente_publico` devuelve la clienta ENMASCARADA: el primer
--      nombre, la inicial del apellido y los dos últimos dígitos del
--      teléfono. "María G., al número que termina en 67". Basta para que
--      ella se reconozca y no le sirve a nadie para armar una lista.
--
--   2. Los datos completos nunca pasan por el navegador. Al apartar, la
--      clienta que confirmó manda solo su cédula, y `crear_reserva` rellena
--      nombre, apellido y teléfono desde el maestro, por dentro.
--
--   3. `ver_reserva`, que también es pública (con el enlace), devuelve
--      enmascarados los datos que salieron del maestro. Si no, bastaría con
--      apartar una pieza con la cédula de otra persona y abrir el enlace
--      para leer su nombre y su teléfono.
--
-- LO QUE SE QUEDA COMO ESTABA
-- El catálogo sigue sin CREAR clientas (esquema-clientes.sql): una clienta
-- nace cuando alguien le cobra, con la persona delante. Si es nueva, sus
-- datos van en el pedido y la vendedora la registra al cobrar.
--
-- Si la clienta registrada quiere cambiar su teléfono, lo escribe y ese va
-- en el pedido; el maestro NO se toca desde aquí. Si se tocara, cualquiera
-- con la cédula de otra podría cambiarle el teléfono.
--
-- `crear_reserva` y `ver_reserva` conservan su firma: el navegador viejo
-- las sigue llamando igual mientras GitHub Pages publica.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA RESERVA SABE SI ES DE UNA CLIENTA, Y DE DÓNDE SALIERON SUS DATOS
-- ---------------------------------------------------------------------

alter table reservas add column if not exists cliente_id bigint references clientes(id) on delete set null;
alter table reservas add column if not exists datos_del_maestro boolean not null default false;

create index if not exists reservas_cliente_idx on reservas (cliente_id) where cliente_id is not null;

comment on column reservas.cliente_id is
  'La clienta del maestro con esa cédula, si ya existía al apartar. El catálogo no crea clientas.';
comment on column reservas.datos_del_maestro is
  'true si nombre, apellido o teléfono salieron del maestro y no los escribió quien apartó: ver_reserva los devuelve enmascarados.';


-- ---------------------------------------------------------------------
-- 2. ¿YA ES CLIENTA?
--
-- Pública (anon), enmascarada. `faltan` dice qué tiene que escribir ella
-- aunque esté registrada: el maestro puede no tener su apellido o tener un
-- teléfono incompleto, y el pedido los necesita para el envío.
-- ---------------------------------------------------------------------

create or replace function buscar_cliente_publico(p_cedula text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_ced     text := nullif(regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g'), '');
  v_c       clientes%rowtype;
  v_palabras text[];
  v_tel     text;
  v_faltan  text[] := '{}';
begin
  -- Una cédula a medio escribir no se busca: "123456" puede ser el
  -- principio de la de otra persona.
  if v_ced is null or length(v_ced) < 6 then
    return jsonb_build_object('encontrada', false);
  end if;

  select * into v_c from clientes where cedula_digitos = v_ced;
  if not found then
    return jsonb_build_object('encontrada', false);
  end if;

  v_palabras := regexp_split_to_array(btrim(v_c.nombre), '\s+');
  v_tel := regexp_replace(coalesce(v_c.telefono, ''), '[^0-9]', '', 'g');

  if nullif(btrim(coalesce(v_c.apellido, '')), '') is null then
    v_faltan := v_faltan || 'apellido';
  end if;
  if length(v_tel) < 10 then
    v_faltan := v_faltan || 'telefono';
  end if;

  return jsonb_build_object(
    'encontrada',     true,
    'nombre',         v_palabras[1],
    -- La inicial del apellido; si la vendedora escribió el nombre
    -- completo en un solo campo, la de la segunda palabra.
    'inicial',        upper(left(coalesce(nullif(btrim(v_c.apellido), ''), v_palabras[2], ''), 1)),
    'telefono_final', case when length(v_tel) >= 10 then right(v_tel, 2) end,
    'faltan',         to_jsonb(v_faltan));
end;
$fn$;

revoke all on function buscar_cliente_publico(text) from public;
grant execute on function buscar_cliente_publico(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. APARTAR: LO QUE NO ESCRIBIÓ, SALE DEL MAESTRO
--
-- Igual que en esquema-variantes-y-mostrador.sql (el tramo pieza por
-- pieza, sin bajar del piso de margen) con un cambio al principio: la
-- cédula va primero y, si es de una clienta, rellena lo que venga vacío.
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
  v_min_p      numeric(12,4);
  v_min_u      numeric(12,4);
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

  -- La cédula primero: de ella depende todo lo demás.
  if v_ced is null then raise exception 'Falta tu cedula.'; end if;
  if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cedula esta incompleta.';
  end if;

  -- ¿Ya es clienta? Lo que no escribió sale de su ficha. Lo que sí
  -- escribió manda: puede haber cambiado de teléfono.
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

  -- El tramo se decide antes de recorrer, igual que en el mostrador.
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

  select valor into v_min_p from configuracion where clave = 'mayoreo_min_piezas';
  select valor into v_min_u from configuracion where clave = 'mayoreo_min_usd';

  if v_piezas < v_min_p and v_total < v_min_u then
    raise exception 'El pedido al mayor requiere % piezas o $%. Llevas % piezas y $%.',
      trunc(v_min_p)::int, to_char(v_min_u, 'FM999999990.00'),
      v_piezas, to_char(v_total, 'FM999999990.00');
  end if;

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


-- ---------------------------------------------------------------------
-- 4. EL ENLACE DE LA RESERVA NO DEVUELVE LO QUE ELLA NO ESCRIBIÓ
--
-- Misma firma y mismas claves. Lo único nuevo: si algún dato salió del
-- maestro, sale enmascarado igual que en la búsqueda. La vendedora ve los
-- datos completos en Pedidos, con su sesión.
-- ---------------------------------------------------------------------

create or replace function ver_reserva(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r        reservas%rowtype;
  v_items    jsonb;
  v_nombre   text;
  v_apellido text;
  v_telefono text;
  v_palabras text[];
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
           'precio_usd', c.precio_usd,
           'variante', c.variante
         ) order by c.nombre, c.variante), '[]'::jsonb)
    into v_items
    from reserva_items ri
    join v_catalogo_venta c on c.id = ri.modelo_id
   where ri.reserva_id = v_r.id;

  v_nombre   := v_r.cliente_nombre;
  v_apellido := v_r.cliente_apellido;
  v_telefono := v_r.cliente_telefono;

  if v_r.datos_del_maestro then
    v_palabras := regexp_split_to_array(btrim(coalesce(v_r.cliente_nombre, '')), '\s+');
    v_nombre   := btrim(v_palabras[1] || ' ' ||
                        coalesce(upper(left(coalesce(nullif(btrim(v_r.cliente_apellido), ''), v_palabras[2]), 1)) || '.', ''));
    v_apellido := null;
    v_telefono := case
                    when length(regexp_replace(coalesce(v_r.cliente_telefono, ''), '[^0-9]', '', 'g')) >= 2
                      then 'termina en ' || right(regexp_replace(v_r.cliente_telefono, '[^0-9]', '', 'g'), 2)
                  end;
  end if;

  return jsonb_build_object(
    'estado',           v_r.estado,
    'creado_en',        v_r.creado_en,
    'expira_en',        v_r.expira_en,
    'cliente_nombre',   v_nombre,
    'cliente_apellido', v_apellido,
    'cliente_telefono', v_telefono,
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
-- 5. EN PEDIDOS, LA VENDEDORA VE SI YA ES CLIENTA
-- La misma vista de esquema-variantes-y-mostrador.sql, con una columna
-- más al final.
-- ---------------------------------------------------------------------

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
  and (r.estado = 'confirmada' or (r.estado = 'abierta' and r.expira_en > now()));

revoke all on v_pedido_vendedora from anon;
grant select on v_pedido_vendedora to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Sin sesión, con la cédula de una clienta que sepas que está:
--
--      select buscar_cliente_publico('V-12.345.678');
--        -> {"encontrada": true, "nombre": "María", "inicial": "G",
--            "telefono_final": "67", "faltan": []}
--           Solo el primer nombre, una letra y dos dígitos. Si sale el
--           apellido entero o el teléfono completo, para y avisa.
--
--      select buscar_cliente_publico('1');
--        -> {"encontrada": false}. Menos de seis dígitos no se busca.
--
-- 2. Un pedido de prueba desde el catálogo con esa cédula, sin escribir
--    nada más: la reserva sale a su nombre, y en Pedidos la vendedora ve
--    el nombre completo y el teléfono. El enlace de la reserva dice
--    "A nombre de María G.". Si no la pagas, se vence sola a los minutos
--    de `reserva_minutos` y las piezas vuelven al catálogo.
-- =====================================================================
