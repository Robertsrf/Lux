-- =====================================================================
-- Lux by Emory — el maestro de clientas
-- Ejecutar en el SQL Editor DESPUÉS de esquema-ubicacion-en-catalogo.sql
--
-- QUÉ TRAE
-- Hasta ahora la venta guardaba un nombre y un teléfono sueltos, escritos a
-- mano cada vez. Con eso no se puede responder lo único que importa cuando
-- una clienta vuelve: ¿qué se llevó, y cuándo?
--
-- De esa pregunta cuelgan dos cosas del negocio:
--
--   1. LA GARANTÍA. Se aplica viendo que la pieza salió de aquí y en qué
--      fecha. Sin histórico, es la palabra de una contra la de otra.
--   2. EL LAVADO Y ABRILLANTADO. Cada compra trae unos meses de ese
--      servicio. Para ofrecerlo hay que saber si todavía le toca.
--
-- Ahora cada venta puede quedar a nombre de una clienta del maestro, que se
-- busca por CÉDULA o por NOMBRE. La vendedora y el administrador ven lo
-- mismo: el maestro no es información de costo, es información de tienda.
--
-- POR QUÉ LA CÉDULA NO ES OBLIGATORIA
-- Mucha gente compra un par de zarcillos y no da su cédula, y una venta que
-- se traba pidiendo datos es una venta perdida. La cédula es la llave
-- cuando está, y el nombre es lo mínimo. Dos clientas con el mismo nombre y
-- sin cédula son dos filas: para eso está `admin_fusionar_clientes`.
--
-- POR QUÉ EL MAESTRO NO SE ALIMENTA DEL CATÁLOGO PÚBLICO
-- `crear_reserva` la llama cualquiera sin sesión. Si un pedido creara una
-- clienta, el maestro se llenaría de nombres inventados en una tarde. Una
-- clienta nace cuando alguien le cobra: la vendedora la registra al cobrar
-- el pedido, con la persona delante.
--
-- LA CIFRA DE "CUÁNTO HA COMPRADO" VA EN DÓLARES
-- Sumar bolívares de marzo con bolívares de septiembre no dice nada: la
-- inflación vuelve la suma ilegible en semanas. Cada venta guarda su
-- `total_usd` congelado con la tasa de ese día, así que la suma de dólares
-- sí significa algo. Los bolívares se muestran compra por compra, que es
-- donde son un hecho y no un promedio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LA TABLA
--
-- `cedula_digitos` y `nombre_completo` son columnas generadas: la cédula
-- se escribe hoy "V-12.345.678" y mañana "12345678", y tienen que ser la
-- misma persona. La unicidad y la búsqueda se hacen contra los dígitos; lo
-- que se muestra es lo que ella escribió.
-- ---------------------------------------------------------------------

create table if not exists clientes (
  id              bigserial primary key,
  cedula          text,
  cedula_digitos  text generated always as
                    (nullif(regexp_replace(coalesce(cedula, ''), '[^0-9]', '', 'g'), '')) stored,
  nombre          text not null,
  apellido        text,
  nombre_completo text generated always as
                    (btrim(nombre || ' ' || coalesce(apellido, ''))) stored,
  telefono        text,
  notas           text,
  creado_por      uuid references perfiles(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

comment on table clientes is
  'Maestro de clientas. De aquí salen el histórico, la garantía y los meses de lavado y abrillantado.';
comment on column clientes.cedula_digitos is
  'Solo los dígitos: con esto se busca y con esto se comprueba que no haya dos filas de la misma persona.';

-- Única cuando hay cédula; las que no la dieron no chocan entre sí.
create unique index if not exists clientes_cedula_idx
  on clientes (cedula_digitos) where cedula_digitos is not null;
create index if not exists clientes_nombre_idx on clientes (lower(nombre_completo));

alter table clientes enable row level security;

drop policy if exists clientes_leer  on clientes;
drop policy if exists clientes_admin on clientes;

-- Las dos caras leen el maestro: la vendedora lo necesita con la clienta
-- delante. Escribir es otra cosa: ella entra por `guardar_cliente`, que
-- valida; el administrador puede corregir la tabla directo.
create policy clientes_leer  on clientes for select to authenticated using (true);
create policy clientes_admin on clientes for all    to authenticated
  using (es_admin()) with check (es_admin());

revoke all on clientes from anon;
grant select on clientes to authenticated;

-- ---------------------------------------------------------------------
-- 2. LA VENTA QUEDA A NOMBRE DE ALGUIEN
--
-- `cliente_nombre` y `cliente_telefono` se quedan: son la foto del momento
-- de la venta. Si mañana ella corrige el apellido en el maestro, el
-- recibo de ayer sigue diciendo lo que decía.
-- ---------------------------------------------------------------------

alter table ventas add column if not exists cliente_id bigint references clientes(id);
create index if not exists ventas_cliente_idx on ventas (cliente_id);

-- ---------------------------------------------------------------------
-- 3. CUÁNTOS MESES DE SERVICIO DA UNA COMPRA
--
-- El número lo pone el dueño, aquí solo vive. Para cambiarlo:
--   update configuracion set valor = 6 where clave = 'meses_servicio';
--
-- Y cambia para TODAS las compras, también las viejas: es una política de
-- la casa, no un hecho congelado de aquella venta. Si algún día tuviera
-- que congelarse por venta, sería una columna en `ventas`, no esto.
-- ---------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion) values
  ('meses_servicio', 3, 'Meses de lavado y abrillantado gratis que da cada compra')
on conflict (clave) do nothing;

create or replace function meses_servicio()
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select valor::int from configuracion where clave = 'meses_servicio'), 3);
$fn$;

revoke all on function meses_servicio() from public, anon;
grant execute on function meses_servicio() to authenticated;

-- La vendedora también lee la clave suelta: la pantalla de clientas dice
-- "cada compra trae N meses" y ese N no puede estar escrito en el código.
drop policy if exists config_leer on configuracion;

create policy config_leer on configuracion for select to authenticated
using (
  es_admin()
  or clave in (
    'mayoreo_min_piezas',
    'mayoreo_min_usd',
    'meta_piezas_dia',
    'meta_premium_dia',
    'premium_min_usd',
    'reserva_minutos',
    'meses_servicio'
  )
);

-- ---------------------------------------------------------------------
-- 4. RESOLVER UNA CLIENTA AL VUELO
--
-- La usa `registrar_venta` por dentro, en la misma transacción: si la
-- venta falla, la clienta no queda creada. Por eso está revocada a todo el
-- mundo — dentro de una función de definidor el permiso se comprueba
-- contra el dueño, no contra quien llama.
--
-- No renombra a nadie. Si la cédula ya existe, esa es la clienta y su
-- nombre se respeta; lo único que rellena son los huecos (un teléfono que
-- faltaba, un apellido que no estaba).
-- ---------------------------------------------------------------------

create or replace function resolver_cliente(
  p_cliente_id bigint,
  p_cedula     text,
  p_nombre     text,
  p_apellido   text,
  p_telefono   text
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id   bigint;
  v_ced  text := nullif(regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g'), '');
  v_nom  text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_ape  text := nullif(btrim(coalesce(p_apellido, '')), '');
  v_tel  text := nullif(btrim(coalesce(p_telefono, '')), '');
begin
  -- Sin nada que resolver, la venta sigue sin clienta. Es válido: alguien
  -- entra, compra y se va sin dar un dato.
  if p_cliente_id is null and v_ced is null and v_nom is null then
    return null;
  end if;

  if p_cliente_id is not null then
    select id into v_id from clientes where id = p_cliente_id;
    if not found then
      raise exception 'Esa clienta ya no existe. Búscala otra vez.';
    end if;
  elsif v_ced is not null then
    select id into v_id from clientes where cedula_digitos = v_ced;
  end if;

  if v_id is null then
    if v_nom is null then
      raise exception 'Para registrar una clienta nueva hace falta su nombre.';
    end if;
    insert into clientes (cedula, nombre, apellido, telefono, creado_por)
    values (nullif(btrim(coalesce(p_cedula, '')), ''), v_nom, v_ape, v_tel, auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  -- Rellena huecos, nunca pisa lo que ya estaba.
  update clientes
     set cedula   = coalesce(cedula, nullif(btrim(coalesce(p_cedula, '')), '')),
         apellido = coalesce(apellido, v_ape),
         telefono = coalesce(telefono, v_tel),
         actualizado_en = now()
   where id = v_id;

  return v_id;
end;
$fn$;

revoke all on function resolver_cliente(bigint, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. CREAR O CORREGIR UNA CLIENTA DESDE LA PANTALLA
--
-- Esta sí la llama el navegador, y las dos caras. A diferencia de la de
-- arriba, aquí una cédula repetida es un error que se dice con nombre y
-- apellido: es lo único que evita dos fichas de la misma persona.
-- ---------------------------------------------------------------------

create or replace function guardar_cliente(
  p_id       bigint default null,
  p_cedula   text   default null,
  p_nombre   text   default null,
  p_apellido text   default null,
  p_telefono text   default null,
  p_notas    text   default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id    bigint;
  v_ced   text := nullif(regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g'), '');
  v_nom   text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_dueno text;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion.';
  end if;
  if not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Tu usuario no tiene un perfil activo.';
  end if;
  if v_nom is null then
    raise exception 'Falta el nombre de la clienta.';
  end if;

  if v_ced is not null then
    select nombre_completo into v_dueno
      from clientes
     where cedula_digitos = v_ced
       and (p_id is null or id <> p_id);
    if found then
      raise exception 'Esa cedula ya esta registrada a nombre de %. Buscala y edita su ficha.', v_dueno;
    end if;
  end if;

  if p_id is null then
    insert into clientes (cedula, nombre, apellido, telefono, notas, creado_por)
    values (nullif(btrim(coalesce(p_cedula, '')), ''), v_nom,
            nullif(btrim(coalesce(p_apellido, '')), ''),
            nullif(btrim(coalesce(p_telefono, '')), ''),
            nullif(btrim(coalesce(p_notas, '')), ''),
            auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  update clientes
     set cedula   = nullif(btrim(coalesce(p_cedula, '')), ''),
         nombre   = v_nom,
         apellido = nullif(btrim(coalesce(p_apellido, '')), ''),
         telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
         notas    = nullif(btrim(coalesce(p_notas, '')), ''),
         actualizado_en = now()
   where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Esa clienta ya no existe.';
  end if;

  return v_id;
end;
$fn$;

revoke all on function guardar_cliente(bigint, text, text, text, text, text) from public, anon;
grant execute on function guardar_cliente(bigint, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. JUNTAR DOS FICHAS DE LA MISMA PERSONA
--
-- Va a pasar: hoy compró sin dar cédula y el mes que viene la dio. Las
-- compras se mudan a la ficha que se queda y la otra desaparece, así el
-- histórico no queda partido en dos.
--
-- Solo administrador. No es una corrección de mostrador: borra una fila y
-- reescribe ventas ya registradas.
-- ---------------------------------------------------------------------

create or replace function admin_fusionar_clientes(
  p_se_va    bigint,
  p_se_queda bigint
) returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_movidas int;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede juntar dos fichas.';
  end if;
  if p_se_va is null or p_se_queda is null or p_se_va = p_se_queda then
    raise exception 'Hacen falta dos fichas distintas.';
  end if;
  if not exists (select 1 from clientes where id = p_se_va)
     or not exists (select 1 from clientes where id = p_se_queda) then
    raise exception 'Alguna de las dos fichas ya no existe.';
  end if;

  update ventas set cliente_id = p_se_queda where cliente_id = p_se_va;
  get diagnostics v_movidas = row_count;

  -- Lo que le faltaba a la que se queda se lo presta la que se va.
  update clientes q
     set cedula   = coalesce(q.cedula, v.cedula),
         apellido = coalesce(q.apellido, v.apellido),
         telefono = coalesce(q.telefono, v.telefono),
         notas    = coalesce(q.notas, v.notas),
         actualizado_en = now()
    from clientes v
   where q.id = p_se_queda and v.id = p_se_va;

  delete from clientes where id = p_se_va;

  return v_movidas;
end;
$fn$;

revoke all on function admin_fusionar_clientes(bigint, bigint) from public, anon;
grant execute on function admin_fusionar_clientes(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 7. EL MAESTRO, CON SU RESUMEN
--
-- Es vista de DEFINIDOR a propósito. La política de `ventas` deja a la
-- vendedora ver solo las suyas de hoy, que es lo correcto para la caja y
-- lo inútil para esto: el histórico de una clienta son justo las ventas de
-- los meses anteriores. Aquí no se asoma ni una columna de costo, así que
-- no hay nada que filtrar.
-- ---------------------------------------------------------------------

create or replace view v_clientes
with (security_invoker = off) as
select
  c.id,
  c.cedula,
  c.cedula_digitos,
  c.nombre,
  c.apellido,
  c.nombre_completo,
  c.telefono,
  c.notas,
  c.creado_en,
  coalesce(r.compras, 0)   as compras,
  coalesce(r.piezas, 0)    as piezas,
  coalesce(r.total_usd, 0) as total_usd,
  r.primera_compra,
  r.ultima_compra,
  -- El servicio corre desde la ÚLTIMA compra: es la que le da derecho hoy.
  (r.ultima_compra + make_interval(months => meses_servicio())) as servicio_hasta,
  (r.ultima_compra is not null
   and now() < r.ultima_compra + make_interval(months => meses_servicio())) as servicio_vigente
from clientes c
left join lateral (
  select
    count(*)                 as compras,
    sum(v.total_usd)         as total_usd,
    min(v.fecha)             as primera_compra,
    max(v.fecha)             as ultima_compra,
    coalesce(sum(p.piezas), 0) as piezas
  from ventas v
  -- Las piezas se cuentan por venta y despues se suman. Sumarlas en el
  -- mismo join que los totales multiplicaria el total por el numero de
  -- lineas de cada venta, que es el error clasico de estos resumenes.
  left join lateral (
    select coalesce(sum(i.cantidad), 0) as piezas
      from venta_items i where i.venta_id = v.id
  ) p on true
  where v.cliente_id = c.id and not v.anulada
) r on true
where auth.uid() is not null;

grant select on v_clientes to authenticated;

-- ---------------------------------------------------------------------
-- 8. QUÉ SE LLEVÓ Y CUÁNDO
--
-- Una fila por pieza comprada. Lee `modelos` y `venta_items`, las dos
-- revocadas para el cliente, y saca de ellas SOLO lo que no es costo:
-- nombre, foto, cantidad y lo que pagó. Las ventas anuladas no salen —
-- una venta anulada no da garantía ni servicio.
-- ---------------------------------------------------------------------

create or replace view v_cliente_compras
with (security_invoker = off) as
select
  v.cliente_id,
  v.id            as venta_id,
  v.fecha,
  v.tipo,
  v.metodo,
  v.total_bs,
  v.total_usd,
  i.modelo_id,
  m.sku,
  m.nombre,
  m.categoria,
  m.variantes_nota,
  m.foto_thumb_path,
  i.cantidad,
  i.precio_unitario_bs,
  (v.fecha + make_interval(months => meses_servicio()))        as servicio_hasta,
  (now() < v.fecha + make_interval(months => meses_servicio())) as servicio_vigente
from ventas v
join venta_items i on i.venta_id = v.id
join modelos m     on m.id = i.modelo_id
where v.cliente_id is not null
  and not v.anulada
  and auth.uid() is not null;

grant select on v_cliente_compras to authenticated;

-- ---------------------------------------------------------------------
-- 9. COBRAR A NOMBRE DE ALGUIEN
--
-- Se suelta y se vuelve a crear porque hay que AÑADIR parámetros, y eso no
-- lo hace `create or replace`. Los tres nuevos van al FINAL y con valor por
-- defecto: mientras GitHub Pages publica, el navegador viejo la sigue
-- llamando con sus siete argumentos y encaja igual. Al revés —quitando o
-- moviendo uno— la vendedora no podría cobrar durante esos minutos.
--
-- Lo único que cambia del cuerpo es que antes de insertar la venta se
-- resuelve la clienta. Todo lo demás (el tramo por piezas, el piso, el
-- regateo que manda sobre el tramo) sigue exactamente igual.
-- ---------------------------------------------------------------------

drop function if exists registrar_venta(text, text, jsonb, bigint, text, text, text);

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
  p_cliente_apellido text default null
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

  -- La clienta, si la hay. Va dentro de la misma transaccion: si la venta
  -- se cae por existencia, no queda una ficha huerfana de una venta que
  -- nunca ocurrio.
  v_cliente_id := resolver_cliente(p_cliente_id, p_cliente_cedula,
                                   p_cliente_nombre, p_cliente_apellido, p_cliente_telefono);

  -- El nombre y el telefono de la venta son la foto del momento. Si ella
  -- eligio una clienta del maestro sin escribir nada, se copian de alli.
  v_cliente_nom := nullif(btrim(coalesce(p_cliente_nombre, '')), '');
  v_cliente_tel := nullif(btrim(coalesce(p_cliente_telefono, '')), '');
  if v_cliente_id is not null then
    select coalesce(v_cliente_nom, c.nombre_completo), coalesce(v_cliente_tel, c.telefono)
      into v_cliente_nom, v_cliente_tel
      from clientes c where c.id = v_cliente_id;
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
                      kit_id, cliente_id, cliente_nombre, cliente_telefono, notas)
  values (auth.uid(), p_tipo::tipo_venta, p_metodo::metodo_pago,
          v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_kit_id, v_cliente_id, v_cliente_nom, v_cliente_tel, p_notas)
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

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text)
  from public, anon;
grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text)
  to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Con sesión de VENDEDORA, que es la que importa:
--
--      select id, nombre_completo, compras, servicio_vigente from v_clientes;
--        -> funciona y no trae ninguna columna de costo.
--
--      select * from clientes;
--        -> funciona (el maestro es de las dos caras).
--
--      select costo_puesto_usd from v_cliente_compras;
--        -> tiene que FALLAR con "column does not exist".
--
-- 2. Crear una de prueba y borrarla, con sesión de administrador:
--
--      select guardar_cliente(null, 'V-00000000', 'Prueba', 'Borrar', '0414-0000000', null);
--      select guardar_cliente(null, '00.000.000', 'Otra', null, null, null);
--        -> la segunda tiene que FALLAR diciendo "ya esta registrada a
--           nombre de Prueba Borrar". Si pasa, la llave de la cédula no
--           está cerrando y el maestro se va a llenar de duplicados.
--      delete from clientes where nombre = 'Prueba';
--
-- 3. Que no hayan quedado DOS registrar_venta:
--
--      select count(*) from pg_proc where proname = 'registrar_venta';
--        -> tiene que dar 1. Si da 2, PostgREST no sabe cual elegir,
--           responde "could not choose the best candidate function" y la
--           vendedora no puede cobrar. Se suelta la que sobre por su firma.
--
-- 4. Una venta a nombre de alguien, desde el mostrador de verdad:
--      -> al cobrar, la clienta aparece en `v_clientes` con 1 compra,
--         y en `v_cliente_compras` con la pieza que se llevó y su
--         `servicio_hasta` a tres meses de hoy.
-- =====================================================================
