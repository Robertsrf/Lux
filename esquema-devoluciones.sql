-- =====================================================================
-- Lux by Emory — quitar una pieza de un pedido, y devolver una pieza
-- que ya se entregó
-- Ejecutar en el SQL Editor DESPUÉS de esquema-conteo-y-cotizar.sql
-- Se puede volver a correr entero.
--
-- LO QUE PIDIÓ EL DUEÑO (14/10/2026)
-- "En pedidos hechos o ya pagados, poder editar el pedido y devolver al
-- inventario la pieza que ya no quieren." Salió de un caso real: un
-- cliente devolvió un anillo de su pedido.
--
-- SON DOS CASOS, Y NO SE PARECEN
--
-- 1. EL PEDIDO NO SE HA ENTREGADO. La pieza nunca salió de la tienda: el
--    pedido la APARTA (`apartadas_de`) sin descontarla. Quitarla es bajar
--    esa línea del pedido: queda libre en el acto, en el mostrador y en el
--    catálogo. El total del pedido baja con su precio congelado.
--      - Las demás piezas conservan el precio que se les congeló al
--        apartar, aunque el pedido baje de un tramo de mayoreo: los
--        precios se congelan al apartar (regla del 30/09/2026). La pantalla
--        lo avisa antes de quitar.
--      - Si lo pagado pasa del total nuevo, el administrador decide: se le
--        devuelve (sale de la caja como "Devolución", el día de hoy, como en
--        `admin_cerrar_pedido`) o se queda a su favor en el pedido. Sin
--        dinero de por medio, lo hacen las dos caras, como cancelar.
--      - La línea no se borra (`historico_no_se_borra`): queda en cero, y
--        cada cambio queda escrito en `pedido_cambios`, con quién y por qué.
--
-- 2. LA PIEZA YA SE ENTREGÓ (la venta existe). Salió de la tienda y
--    vuelve. Solo el administrador.
--      - La pieza vuelve a la existencia, en la ubicación que él elija.
--      - Se registra una NOTA DE CRÉDITO: una venta nueva que dice de cuál
--        es (`ventas.devolucion_de`), con las MISMAS tasas de la venta
--        original y la pieza en cantidad negativa. Así cada reporte, la
--        meta, la ficha de la clienta y la ganancia del mes se compensan
--        solos, el día de la devolución, por la cifra exacta que esa pieza
--        sumó. No se reescribe el día en que se vendió: si el reporte de
--        enero cambiara por algo de octubre, el sistema estaría mintiendo.
--      - El dinero va aparte: si se le devuelve, sale de la caja como
--        "Devolución" con su forma de pago (la nota de crédito no cuenta en
--        la caja, para no restarlo dos veces). Nunca más de lo que valía.
--      - Una venta con devoluciones no se anula entera, y una nota de
--        crédito no se anula: se deshace con una venta nueva.
--
-- LO QUE CAMBIA DE LO QUE YA EXISTÍA (firmas iguales)
--   - `venta_items.cantidad` acepta negativos, SOLO en una nota de
--     crédito (lo vigila un disparador). `reserva_items.cantidad` acepta
--     cero: una línea quitada.
--   - `caja_flujo` no cuenta las notas de crédito (el dinero va por la
--     caja). `admin_anular_venta` no anula una venta con devoluciones.
--   - Las vistas que CUENTAN ventas (no las que suman dinero, que ya se
--     compensan solas) no cuentan una devolución como una venta más:
--     `v_ventas_por_dia`, `v_tablero_dia`, `v_clientes` (y una devolución
--     no le renueva el servicio de lavado a la clienta). `v_rebajas` no
--     lista la nota de crédito como rebaja. `v_rotacion_modelo` no la
--     cuenta como última venta. `v_cliente_compras` deja de listarla como
--     compra y dice, en cada línea, cuántas se devolvieron. `v_pedido_
--     vendedora` no enseña líneas quitadas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LAS COLUMNAS Y LAS REGLAS DE LAS TABLAS
-- ---------------------------------------------------------------------

alter table ventas add column if not exists devolucion_de bigint references ventas(id);
comment on column ventas.devolucion_de is
  'Nota de crédito: la venta cuyas piezas devuelve. Sus líneas van en negativo, con las tasas de esa venta.';
create index if not exists ventas_devolucion_de_idx on ventas (devolucion_de) where devolucion_de is not null;

alter table venta_items add column if not exists devuelve_item_id bigint references venta_items(id);
comment on column venta_items.devuelve_item_id is 'En una nota de crédito: la línea de la venta original que devuelve.';
create index if not exists venta_items_devuelve_idx on venta_items (devuelve_item_id) where devuelve_item_id is not null;

-- Una línea de venta puede ser negativa, y solo en una nota de crédito.
alter table venta_items drop constraint if exists venta_items_cantidad_check;
alter table venta_items drop constraint if exists venta_items_cantidad_valida;
alter table venta_items add constraint venta_items_cantidad_valida check (cantidad <> 0);

create or replace function venta_item_signo()
returns trigger
language plpgsql
as $fn$
declare
  v_es_devolucion boolean;
begin
  select devolucion_de is not null into v_es_devolucion from ventas where id = new.venta_id;
  if coalesce(v_es_devolucion, false) and (new.cantidad > 0 or new.devuelve_item_id is null) then
    raise exception 'Una nota de crédito lleva sus piezas en negativo y dice qué línea devuelve.';
  end if;
  if not coalesce(v_es_devolucion, false) and new.cantidad < 0 then
    raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists venta_items_signo on venta_items;
create trigger venta_items_signo
  before insert or update of cantidad, venta_id on venta_items
  for each row execute function venta_item_signo();

-- Una línea de pedido puede quedar en cero: es una pieza que se quitó.
alter table reserva_items drop constraint if exists reserva_items_cantidad_check;
alter table reserva_items drop constraint if exists reserva_items_cantidad_valida;
alter table reserva_items add constraint reserva_items_cantidad_valida check (cantidad >= 0);

-- Lo que se le quitó a cada pedido, quién y por qué. No se borra.
create table if not exists pedido_cambios (
  id             bigserial primary key,
  reserva_id     bigint not null references reservas(id),
  modelo_id      bigint not null references modelos(id),
  antes          int not null,
  despues        int not null,
  total_antes    numeric(12,4) not null,
  total_despues  numeric(12,4) not null,
  dinero         text check (dinero is null or dinero in ('devuelto', 'a_favor')),
  devuelto_bs    numeric(14,2),
  devuelto_metodo metodo_pago,
  motivo         text,
  cambiado_por   uuid references perfiles(id),
  cambiado_en    timestamptz not null default now()
);

create index if not exists pedido_cambios_reserva_idx on pedido_cambios (reserva_id);
alter table pedido_cambios enable row level security;
revoke all on pedido_cambios from anon, authenticated;
revoke all on sequence pedido_cambios_id_seq from anon, authenticated;
drop trigger if exists pedido_cambios_no_se_borran on pedido_cambios;
drop trigger if exists pedido_cambios_no_se_vacian on pedido_cambios;
create trigger pedido_cambios_no_se_borran before delete   on pedido_cambios for each row       execute function historico_no_se_borra();
create trigger pedido_cambios_no_se_vacian before truncate on pedido_cambios for each statement execute function historico_no_se_borra();


-- ---------------------------------------------------------------------
-- 2. QUITAR UNA PIEZA DE UN PEDIDO QUE NO SE HA ENTREGADO
--
-- p_devolver: null si no hay dinero de más; true = se le devuelve lo que
-- sobra (p_metodo y p_monto, en la moneda de esa forma de pago); false =
-- se queda a su favor en el pedido.
-- ---------------------------------------------------------------------

create or replace function quitar_de_pedido(
  p_reserva_id bigint,
  p_modelo_id  bigint,
  p_cantidad   int,
  p_motivo     text,
  p_devolver   boolean default null,
  p_metodo     text    default null,
  p_monto      numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r            reservas%rowtype;
  v_fase       text;
  v_tiene      int;
  v_quedan     int;
  v_falta      int;
  v_linea      record;
  v_toma       int;
  v_total_ant  numeric(12,4);
  v_total      numeric(12,4);
  v_pagado     numeric;
  v_verif      numeric;
  v_sobra      numeric;
  v_tasa       tasas%rowtype;
  v_metodo     metodo_pago;
  m            record;
  v_nombre     text;
  v_dinero     text;
  v_dev_bs     numeric(14,2);
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe por qué se quita: queda en la historia del pedido.';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Di cuántas piezas se quitan.';
  end if;

  select * into r from reservas where id = p_reserva_id for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;
  v_fase := fase_pedido(r.id);
  if v_fase = 'entregado' then
    raise exception 'Ese pedido ya se entregó: la pieza se devuelve desde la ficha de la clienta.';
  end if;
  if v_fase not in ('esperando_pago', 'reportado', 'apartado', 'pagado') then
    raise exception 'Ese pedido está cerrado o vencido: sus piezas ya están libres.';
  end if;
  if not pedido_con_precio(r.id) then
    raise exception 'Es un pedido de antes del apartado, sin precio por pieza: cancélalo y haz uno nuevo con lo que sí quiere.';
  end if;

  perform pg_advisory_xact_lock(p_modelo_id);

  select coalesce(sum(cantidad), 0) into v_tiene
    from reserva_items where reserva_id = r.id and modelo_id = p_modelo_id;
  if v_tiene < p_cantidad then
    raise exception 'El pedido tiene % de esa pieza y quieres quitar %.', v_tiene, p_cantidad;
  end if;
  select coalesce(sum(cantidad), 0) - p_cantidad into v_quedan from reserva_items where reserva_id = r.id;
  if v_quedan <= 0 then
    raise exception 'Esa es la última pieza del pedido: para quitarlas todas, cancela el pedido.';
  end if;

  select m2.nombre || coalesce(' · ' || m2.variante, '') into v_nombre from modelos m2 where m2.id = p_modelo_id;
  v_total_ant := r.total_usd;

  -- Se baja la línea (la última primero). Cero es "quitada".
  v_falta := p_cantidad;
  for v_linea in
    select id, cantidad from reserva_items
     where reserva_id = r.id and modelo_id = p_modelo_id and cantidad > 0
     order by id desc
  loop
    exit when v_falta = 0;
    v_toma := least(v_falta, v_linea.cantidad);
    update reserva_items set cantidad = cantidad - v_toma where id = v_linea.id;
    v_falta := v_falta - v_toma;
  end loop;

  -- El pedido con lo que queda, a sus precios congelados.
  select round(coalesce(sum(precio_usd * cantidad), 0), 4) into v_total from reserva_items where reserva_id = r.id;
  update reservas
     set total_usd    = v_total,
         subtotal_usd = (select round(coalesce(sum(coalesce(precio_lista_usd, precio_usd) * cantidad), 0), 4)
                           from reserva_items where reserva_id = r.id),
         piezas       = (select coalesce(sum(cantidad), 0) from reserva_items where reserva_id = r.id)
   where id = r.id;

  -- Lo pagado contra el total nuevo.
  select coalesce(sum(monto_bcv), 0),
         coalesce(sum(monto_bcv) filter (where verificado_en is not null), 0)
    into v_pagado, v_verif
    from abonos where reserva_id = r.id and anulado_en is null;

  if v_pagado > v_total + 0.005 and v_pagado > v_verif + 0.005 then
    raise exception 'Hay pagos sin revisar y con ellos pasa del total nuevo: márcalos como que llegaron o que no llegaron antes de quitar la pieza.';
  end if;

  v_sobra := round(v_verif - v_total, 4);
  if v_sobra > 0.005 then
    if not es_admin() then
      raise exception 'Con esa pieza fuera, lo pagado pasa del total en $% BCV. Lo hace el administrador, que decide si se le devuelve.',
        to_char(v_sobra, 'FM999G990D00');
    end if;
    if p_devolver is null then
      raise exception 'Sobran $% BCV de lo pagado: di si se le devuelven o se quedan a su favor.', to_char(v_sobra, 'FM999G990D00');
    end if;
    if p_devolver then
      if coalesce(p_monto, 0) <= 0 then
        raise exception 'Escribe cuánto se le devuelve.';
      end if;
      begin
        v_metodo := nullif(btrim(coalesce(p_metodo, '')), '')::metodo_pago;
      exception when others then
        raise exception 'Esa forma de pago no existe.';
      end;
      if v_metodo is null then raise exception 'Falta cómo se le devuelve.'; end if;
      select * into v_tasa from tasas where vigente limit 1;
      select * into m from montos_de_abono(v_metodo, p_monto, v_tasa.tasa_venta, v_tasa.tasa_bcv);
      if m.bcv > v_sobra + margen_de_abono(v_metodo, v_tasa.tasa_venta, v_tasa.tasa_bcv) then
        raise exception 'Se le devolvería más de lo que sobra: sobran $% BCV, hoy Bs %.',
          to_char(v_sobra, 'FM999G990D00'), to_char(round(v_sobra * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
      end if;
      perform admin_anotar_caja('salida', (now() at time zone 'America/Caracas')::date, 'devolucion',
                                'Devolución del pedido #' || r.id || ' · ' ||
                                btrim(coalesce(r.cliente_nombre, '') || ' ' || coalesce(r.cliente_apellido, '')) ||
                                ' · quitó ' || v_nombre,
                                v_metodo::text, p_monto, null);
      v_dinero := 'devuelto';
      v_dev_bs := m.bs;
    else
      v_dinero := 'a_favor';
    end if;
  end if;

  insert into pedido_cambios (reserva_id, modelo_id, antes, despues, total_antes, total_despues,
                              dinero, devuelto_bs, devuelto_metodo, motivo, cambiado_por)
  values (r.id, p_modelo_id, v_tiene, v_tiene - p_cantidad, v_total_ant, v_total,
          v_dinero, v_dev_bs,
          case when v_dinero = 'devuelto' then v_metodo end,
          btrim(p_motivo), auth.uid());

  perform pedido_al_dia(r.id);

  return jsonb_build_object(
    'total_usd', v_total,
    'falta_bcv', falta_pedido_bcv(r.id),
    'sobraba_bcv', greatest(v_sobra, 0),
    'dinero', v_dinero);
end;
$fn$;

revoke all on function quitar_de_pedido(bigint, bigint, int, text, boolean, text, numeric) from public, anon;
grant execute on function quitar_de_pedido(bigint, bigint, int, text, boolean, text, numeric) to authenticated;

-- Lo que se le ha quitado a un pedido, para enseñarlo en su tarjeta.
create or replace view v_pedido_cambios
with (security_invoker = off) as
select
  c.id, c.reserva_id, c.modelo_id,
  m.sku, m.nombre, m.variante,
  c.antes, c.despues, c.total_antes, c.total_despues,
  c.dinero, c.devuelto_bs, c.devuelto_metodo, c.motivo,
  p.nombre as quien,
  c.cambiado_en
from pedido_cambios c
join modelos m on m.id = c.modelo_id
left join perfiles p on p.id = c.cambiado_por
where auth.uid() is not null;

revoke all on v_pedido_cambios from anon;
grant select on v_pedido_cambios to authenticated;


-- ---------------------------------------------------------------------
-- 3. DEVOLVER UNA PIEZA QUE YA SE ENTREGÓ
-- Devuelve el id de la nota de crédito.
-- ---------------------------------------------------------------------

create or replace function admin_devolver_pieza(
  p_venta_id     bigint,
  p_modelo_id    bigint,
  p_cantidad     int,
  p_ubicacion_id bigint,
  p_devolver     boolean,
  p_metodo       text    default null,
  p_monto        numeric default null,
  p_motivo       text    default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v          ventas%rowtype;
  v_linea    record;
  v_puede    int;
  v_falta    int;
  v_toma     int;
  v_destino  bigint;
  v_nota     bigint;
  v_total_bs numeric(14,2) := 0;
  v_valor    numeric(12,4) := 0;
  v_metodo   metodo_pago;
  v_tasa     tasas%rowtype;
  m          record;
  v_nombre   text;
begin
  if not es_admin() then
    raise exception 'Solo el administrador devuelve piezas de una venta.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe por qué la devuelve: queda en la nota de crédito.';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Di cuántas piezas devuelve.';
  end if;
  if p_devolver is null then
    raise exception 'Di si se le devuelve el dinero o no.';
  end if;

  select * into v from ventas where id = p_venta_id for update;
  if not found then raise exception 'Esa venta no existe.'; end if;
  if v.anulada then raise exception 'Esa venta está anulada: sus piezas ya volvieron.'; end if;
  if v.devolucion_de is not null then raise exception 'Eso es una nota de crédito, no una venta.'; end if;
  if v.por_verificar then
    raise exception 'Esa venta está por verificar: verifícala o anúlala en Pedidos antes de devolver una pieza.';
  end if;

  perform pg_advisory_xact_lock(p_modelo_id);

  -- Cuántas de esa pieza se pueden devolver todavía.
  select coalesce(sum(i.cantidad - coalesce(d.devueltas, 0)), 0) into v_puede
    from venta_items i
    left join lateral (
      select -sum(r.cantidad) as devueltas
        from venta_items r join ventas rv on rv.id = r.venta_id and not rv.anulada
       where r.devuelve_item_id = i.id
    ) d on true
   where i.venta_id = v.id and i.modelo_id = p_modelo_id and i.cantidad > 0;
  if v_puede < p_cantidad then
    raise exception 'De esa pieza se pueden devolver % y pides %.', v_puede, p_cantidad;
  end if;

  select m2.nombre || coalesce(' · ' || m2.variante, '') into v_nombre from modelos m2 where m2.id = p_modelo_id;

  -- A dónde vuelve: la que él diga, o de donde salió.
  if p_ubicacion_id is not null then
    if not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo) then
      raise exception 'Esa ubicación no existe o está desactivada.';
    end if;
    v_destino := p_ubicacion_id;
  else
    select ubicacion_id into v_destino from venta_items
     where venta_id = v.id and modelo_id = p_modelo_id order by id limit 1;
  end if;

  -- La nota de crédito: con las tasas de la venta original, para que lo
  -- que reste sea exactamente lo que esa pieza sumó.
  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      cliente_id, cliente_nombre, cliente_telefono, notas,
                      por_verificar, pago_parcial, revendedor_id, devolucion_de)
  values (auth.uid(), v.tipo,
          coalesce(nullif(btrim(coalesce(p_metodo, '')), '')::metodo_pago, v.metodo),
          v.tasa_venta_usada, v.tasa_bcv_usada,
          v.cliente_id, v.cliente_nombre, v.cliente_telefono,
          'Devolución de la venta #' || v.id || ': ' || btrim(p_motivo),
          false, false, v.revendedor_id, v.id)
  returning id into v_nota;

  v_falta := p_cantidad;
  for v_linea in
    select i.*, i.cantidad - coalesce(d.devueltas, 0) as libre
      from venta_items i
      left join lateral (
        select -sum(r.cantidad) as devueltas
          from venta_items r join ventas rv on rv.id = r.venta_id and not rv.anulada
         where r.devuelve_item_id = i.id
      ) d on true
     where i.venta_id = v.id and i.modelo_id = p_modelo_id and i.cantidad > 0
     order by i.id
  loop
    exit when v_falta = 0;
    continue when v_linea.libre <= 0;
    v_toma := least(v_falta, v_linea.libre);
    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs, precio_lista_usd,
                             costo_puesto_usd_snap, costo_operativo_usd_snap, motivo_rebaja,
                             devuelve_item_id)
    values (v_nota, p_modelo_id, v_destino, -v_toma,
            v_linea.precio_unitario_usd, v_linea.precio_unitario_bs, v_linea.precio_lista_usd,
            v_linea.costo_puesto_usd_snap, v_linea.costo_operativo_usd_snap, v_linea.motivo_rebaja,
            v_linea.id);
    v_total_bs := v_total_bs - v_linea.precio_unitario_bs * v_toma;
    v_valor    := v_valor + v_linea.precio_unitario_usd * v_toma;
    v_falta    := v_falta - v_toma;
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v.tasa_venta_usada, 4)
   where id = v_nota;

  -- La pieza vuelve.
  insert into existencias (modelo_id, ubicacion_id, cantidad)
  values (p_modelo_id, v_destino, p_cantidad)
  on conflict (modelo_id, ubicacion_id)
  do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();

  -- El dinero, por la caja. Nunca más de lo que valía la pieza.
  if p_devolver then
    if coalesce(p_monto, 0) <= 0 then
      raise exception 'Escribe cuánto se le devuelve.';
    end if;
    begin
      v_metodo := nullif(btrim(coalesce(p_metodo, '')), '')::metodo_pago;
    exception when others then
      raise exception 'Esa forma de pago no existe.';
    end;
    if v_metodo is null then raise exception 'Falta cómo se le devuelve.'; end if;
    select * into v_tasa from tasas where vigente limit 1;
    select * into m from montos_de_abono(v_metodo, p_monto, v_tasa.tasa_venta, v_tasa.tasa_bcv);
    if m.bcv > v_valor + margen_de_abono(v_metodo, v_tasa.tasa_venta, v_tasa.tasa_bcv) then
      raise exception 'Se le devolvería más de lo que valía: $% BCV, hoy Bs %.',
        to_char(v_valor, 'FM999G990D00'), to_char(round(v_valor * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
    end if;
    perform admin_anotar_caja('salida', (now() at time zone 'America/Caracas')::date, 'devolucion',
                              'Devolución de la venta #' || v.id || ' · ' ||
                              coalesce(v.cliente_nombre, 'sin nombre') || ' · ' || v_nombre,
                              v_metodo::text, p_monto, null);
  end if;

  return v_nota;
end;
$fn$;

revoke all on function admin_devolver_pieza(bigint, bigint, int, bigint, boolean, text, numeric, text) from public, anon;
grant execute on function admin_devolver_pieza(bigint, bigint, int, bigint, boolean, text, numeric, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. LO QUE YA EXISTÍA, CON LA NOTA DE CRÉDITO EN CUENTA (firmas iguales)
-- ---------------------------------------------------------------------

-- Una venta con devoluciones no se anula entera (devolvería otra vez lo
-- devuelto), y una nota de crédito no se anula.
create or replace function admin_anular_venta(p_venta_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item venta_items%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular una venta.';
  end if;
  if (select anulada from ventas where id = p_venta_id) then
    raise exception 'Esa venta ya estaba anulada.';
  end if;
  if (select devolucion_de from ventas where id = p_venta_id) is not null then
    raise exception 'Eso es una nota de crédito: no se anula.';
  end if;
  if exists (select 1 from ventas where devolucion_de = p_venta_id and not anulada) then
    raise exception 'Esa venta tiene piezas devueltas: no se puede anular entera.';
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
$fn$;

revoke all on function admin_anular_venta(bigint, text) from public, anon;
grant execute on function admin_anular_venta(bigint, text) to authenticated;

-- El mínimo del mayoreo no aplica a una nota de crédito.
create or replace function validar_minimo_mayoreo()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_piezas int;
  v_usd    numeric(12,4);
  v_min_p  numeric(12,4);
  v_min_u  numeric(12,4);
begin
  if (select tipo from ventas where id = new.venta_id) <> 'mayor'
     or (select devolucion_de from ventas where id = new.venta_id) is not null then
    return new;
  end if;

  select coalesce(sum(cantidad), 0),
         coalesce(sum(precio_unitario_usd * cantidad), 0)
    into v_piezas, v_usd
    from venta_items where venta_id = new.venta_id;

  select valor into v_min_p from configuracion where clave = 'mayoreo_min_piezas';
  select valor into v_min_u from configuracion where clave = 'mayoreo_min_usd';

  if v_piezas < v_min_p and v_usd < v_min_u then
    raise exception
      'La venta al mayor requiere % piezas o $%. Llevas % piezas y $%.',
      v_min_p, v_min_u, v_piezas, v_usd;
  end if;

  return new;
end;
$fn$;

revoke all on function validar_minimo_mayoreo() from public, anon, authenticated;

-- La caja: la de esquema-abonos-y-apartados.sql, sin las notas de crédito
-- (su dinero sale como "Devolución", anotado aparte).
create or replace function caja_flujo(p_desde date, p_hasta date)
returns table (
  fecha         date,
  metodo        metodo_pago,
  tipo          text,
  origen        text,
  categoria     text,
  bs            numeric,
  usd           numeric,
  bcv           numeric,
  por_verificar boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  with r as (
    select (p_desde::timestamp at time zone 'America/Caracas')       as desde,
           ((p_hasta + 1)::timestamp at time zone 'America/Caracas') as hasta
  )
  select (v.fecha at time zone 'America/Caracas')::date,
         v.metodo,
         'entrada',
         'venta',
         null::text,
         v.total_bs,
         case when metodo_en_dolares(v.metodo) then v.total_usd end,
         v.total_bs / nullif(v.tasa_bcv_usada, 0),
         v.por_verificar
    from ventas v, r
   where not v.anulada
     and not v.pago_parcial
     and v.devolucion_de is null
     and v.fecha >= r.desde and v.fecha < r.hasta
  union all
  select (a.fecha at time zone 'America/Caracas')::date,
         a.metodo,
         'entrada',
         'abono',
         null::text,
         a.monto_bs,
         a.monto_usd,
         a.monto_bcv,
         a.verificado_en is null
    from abonos a
    left join ventas v on v.id = a.venta_id
    cross join r
   where a.anulado_en is null
     and (v.id is null or not v.anulada)
     and (a.origen = 'tienda' or a.verificado_en is not null)
     and a.fecha >= r.desde and a.fecha < r.hasta
  union all
  select c.fecha,
         c.metodo,
         c.tipo,
         'anotado',
         c.categoria,
         c.monto_bs,
         c.monto_usd,
         c.monto_bcv,
         false
    from caja_movimientos c
   where c.anulado_en is null
     and c.fecha between p_desde and p_hasta;
$fn$;

revoke all on function caja_flujo(date, date) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. LAS VISTAS QUE CUENTAN VENTAS
-- Mismas columnas y en el mismo orden; las que ganan una, al final.
-- ---------------------------------------------------------------------

create or replace view v_ventas_por_dia
with (security_invoker = off) as
select
  v.fecha::date                                as dia,
  count(*) filter (where v.devolucion_de is null) as ventas,
  coalesce(sum(m.piezas), 0)                   as piezas,
  coalesce(sum(v.total_bs), 0)                 as total_bs,
  coalesce(sum(v.total_bs / v.tasa_bcv_usada), 0) as total_usd,
  coalesce(sum(m.costo_usd), 0)                as costo_usd,
  coalesce(sum((v.total_bs - v.extra_bs) / v.tasa_bcv_usada - m.costo_usd), 0) as ganancia_usd,
  coalesce(sum(m.mercancia_usd), 0)            as mercancia_usd,
  coalesce(sum((v.total_bs - v.extra_bs) / v.tasa_bcv_usada - m.mercancia_usd
               - m.piezas * (select coalesce((select valor from configuracion
                                               where clave = 'empaque_por_pieza_usd'), 0))), 0)
                                               as contribucion_usd,
  coalesce(sum(v.extra_bs / v.tasa_bcv_usada), 0) as extra_bcv
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum((i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                  + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad), 0) as costo_usd,
    coalesce(sum(i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                 * i.cantidad), 0) as mercancia_usd
  from venta_items i where i.venta_id = v.id
) m on true
where not v.anulada
  and es_admin()
group by v.fecha::date;

create or replace view v_tablero_dia
with (security_invoker = off) as
select
  v.usuario_id,
  count(*) filter (where v.devolucion_de is null) as ventas,
  coalesce(sum(v.total_bs), 0)               as total_bs,
  coalesce(sum(p.piezas), 0)                 as piezas,
  coalesce(sum(p.premium), 0)                as piezas_premium,
  case when count(*) filter (where v.devolucion_de is null) > 0
       then round(sum(v.total_bs) filter (where v.devolucion_de is null)
                  / count(*) filter (where v.devolucion_de is null), 2)
       else 0 end                            as ticket_promedio_bs,
  round(coalesce(sum(v.total_bs / v.tasa_bcv_usada), 0), 2) as total_bcv,
  case when count(*) filter (where v.devolucion_de is null) > 0
       then round(sum(v.total_bs / v.tasa_bcv_usada) filter (where v.devolucion_de is null)
                  / count(*) filter (where v.devolucion_de is null), 2)
       else 0 end                            as ticket_promedio_bcv
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum(i.cantidad) filter (
      where i.precio_unitario_usd >= (select valor from configuracion where clave = 'premium_min_usd')
    ), 0) as premium
  from venta_items i
  where i.venta_id = v.id
) p on true
where not v.anulada
  and v.revendedor_id is null
  and v.fecha::date = current_date
  and (es_admin() or v.usuario_id = auth.uid())
group by v.usuario_id;

-- Una devolución no es una compra más, ni le renueva el servicio de lavado.
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
  (r.ultima_compra + make_interval(months => meses_servicio())) as servicio_hasta,
  (r.ultima_compra is not null
   and now() < r.ultima_compra + make_interval(months => meses_servicio())) as servicio_vigente,
  coalesce(r.total_bcv, 0) as total_bcv,
  rv.nombre                as revendedor
from clientes c
left join revendedores rv on rv.id = c.revendedor_id
left join lateral (
  select
    count(*) filter (where v.devolucion_de is null)        as compras,
    sum(v.total_usd)                                       as total_usd,
    sum(v.total_bs / v.tasa_bcv_usada)                     as total_bcv,
    min(v.fecha) filter (where v.devolucion_de is null)    as primera_compra,
    max(v.fecha) filter (where v.devolucion_de is null)    as ultima_compra,
    coalesce(sum(p.piezas), 0)                             as piezas
  from ventas v
  left join lateral (
    select coalesce(sum(i.cantidad), 0) as piezas
      from venta_items i where i.venta_id = v.id
  ) p on true
  where v.cliente_id = c.id and not v.anulada
) r on true
where auth.uid() is not null;

-- La ficha: sin la nota de crédito como compra; cada línea dice cuántas
-- se devolvieron (al final, columnas nuevas).
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
  (now() < v.fecha + make_interval(months => meses_servicio())) as servicio_vigente,
  m.variante,
  v.por_verificar,
  v.verificada_en,
  v.anulada       as anulada_sin_pago,
  v.pago_referencia,
  v.pago_parcial,
  falta_bcv_de(v.id) as falta_bcv,
  rv.nombre       as revendedor,
  v.extra_bs,
  v.extra_nota,
  -- Nuevas.
  coalesce((select -sum(r.cantidad)::int
              from venta_items r join ventas rv2 on rv2.id = r.venta_id and not rv2.anulada
             where r.devuelve_item_id = i.id), 0) as devueltas,
  i.ubicacion_id,
  i.precio_unitario_usd,
  m.foto_path
from ventas v
join venta_items i on i.venta_id = v.id
join modelos m     on m.id = i.modelo_id
left join revendedores rv on rv.id = v.revendedor_id
where v.cliente_id is not null
  and v.devolucion_de is null
  and (not v.anulada or v.notas like '%Anulada sin pago:%')
  and auth.uid() is not null;

-- Una rebaja es de una venta, no de su nota de crédito.
create or replace view v_rebajas
with (security_invoker = off) as
select
  v.id                                  as venta_id,
  v.fecha,
  v.usuario_id,
  p.nombre                              as vendedora,
  i.modelo_id,
  m.sku,
  m.nombre,
  m.variante,
  i.cantidad,
  i.precio_lista_usd,
  i.precio_unitario_usd,
  round(i.precio_lista_usd * v.tasa_bcv_usada, 2)                       as precio_lista_bs,
  i.precio_unitario_bs,
  round((i.precio_lista_usd - i.precio_unitario_usd) * i.cantidad, 4)   as rebaja_usd,
  round((1 - i.precio_unitario_usd / i.precio_lista_usd) * 100, 2)      as rebaja_pct,
  i.motivo_rebaja
from venta_items i
join ventas v   on v.id = i.venta_id
join modelos m  on m.id = i.modelo_id
left join perfiles p on p.id = v.usuario_id
where not v.anulada
  and v.devolucion_de is null
  and i.precio_lista_usd > 0
  and i.precio_unitario_usd < i.precio_lista_usd
  and es_admin();

-- Una devolución no es "la última vez que se vendió".
create or replace view v_rotacion_modelo
with (security_invoker = off) as
select
  mo.id, mo.sku, mo.nombre, mo.categoria,
  coalesce(g.nombre, 'Sin grupo') as grupo,
  coalesce(x.piezas, 0)           as piezas_vendidas,
  x.ultima_venta,
  case when x.ultima_venta is not null then (current_date - x.ultima_venta::date) end as dias_sin_vender,
  (current_date - mo.creado_en::date) as dias_en_inventario,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = mo.id), 0) as existencia,
  mo.costo_puesto_usd,
  coalesce(x.ganancia_usd, 0) as ganancia_usd
from modelos mo
left join grupos_precio g on g.id = mo.grupo_precio_id
left join lateral (
  select
    sum(i.cantidad) as piezas,
    max(v.fecha) filter (where v.devolucion_de is null) as ultima_venta,
    sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada
        - (i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
           + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad) as ganancia_usd
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
  where i.modelo_id = mo.id
) x on true
where mo.activo and es_admin();

-- Pedidos: sin las líneas quitadas.
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
  r.cliente_id,
  r.origen,
  f.fase,
  r.vence_apartado_en,
  r.pagado_en,
  round(r.total_usd - greatest(saldo_padre_bcv(null, r.id, null), 0), 4)             as pagado_bcv,
  round(r.total_usd - greatest(saldo_padre_bcv(null, r.id, null, null, true), 0), 4) as verificado_bcv,
  falta_pedido_bcv(r.id)                                                               as falta_bcv,
  (select count(*) from abonos a
    where a.reserva_id = r.id and a.anulado_en is null and a.verificado_en is null)::int as por_revisar,
  pedido_con_precio(r.id)                                                              as con_precio,
  ri.precio_usd                                                                        as precio_linea_usd,
  r.subtotal_usd,
  r.descuento_pct,
  round(r.total_usd * (select valor from configuracion where clave = 'apartado_inicial_pct') / 100, 4) as minimo_bcv,
  pc.nombre                                                                            as creado_por
from reservas r
cross join lateral (select fase_pedido(r.id) as fase) f
join reserva_items ri on ri.reserva_id = r.id and ri.cantidad > 0
join v_catalogo_venta c on c.id = ri.modelo_id
left join perfiles pc on pc.id = r.creado_por
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
  and r.cerrada_en is null
  and (   f.fase in ('esperando_pago', 'reportado', 'apartado', 'pagado')
       or (f.fase = 'vencido'
           and exists (select 1 from abonos a where a.reserva_id = r.id and a.anulado_en is null)));

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Un pedido abierto con 3 piezas: en Pedidos, "Quitar" en una. Queda
--    con 2, el total baja con el precio de esa pieza, y la pieza sale
--    libre en el mostrador. En la tarjeta del pedido se lee qué se quitó,
--    quién y por qué.
-- 2. Un pedido pagado completo al que se le quita una pieza: la vendedora
--    no puede (sobra dinero); el administrador elige "Se le devuelve"
--    (sale de la caja hoy, como Devolución) o "A su favor".
-- 3. En la ficha de la clienta, una pieza que ya se llevó: "Devolver". La
--    pieza vuelve a la ubicación elegida, la línea dice "Devuelta", y en
--    Reportes el día de hoy pierde exactamente lo que esa pieza sumó el
--    día que se vendió (ventas, piezas y contribución).
--
--      select id, devolucion_de, total_bs from ventas where devolucion_de is not null;
-- =====================================================================
