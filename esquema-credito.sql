-- =====================================================================
-- #71 · esquema-credito.sql
-- El crédito de una clienta: se lleva las piezas hoy y paga en sus días
-- (fase 4, pedido del dueño del 18/11/2026; decidido el 23/11/2026).
-- Depende del #70 (esquema-descuento-clienta.sql). Se puede correr varias veces.
--
-- QUÉ HACE
-- 1. El crédito es un permiso de la clienta, no de la venta:
--    `clientes.credito_dias` (null: sin crédito) y `clientes.credito_tope_usd`
--    (lo máximo que puede deber a la vez, en $ BCV; null: sin tope). Los
--    escribe SOLO el administrador (`admin_fijar_credito`). Ninguna cifra
--    sale del código: el dueño escribe los días y el tope en la ficha.
-- 2. La venta a crédito (`vender_a_credito`, de las dos caras) ES una venta
--    por partes por verificar, con `ventas.credito_vence` (hoy en Venezuela
--    más sus días). Usa `registrar_venta` tal cual (el precio, el tramo, el
--    descuento de clienta y los códigos salen de ahí), la deja
--    `pago_parcial` y, si la clienta paga algo ese día, lo carga con
--    `abonar_venta`. Todo en una transacción. Desde ahí es el camino de
--    siempre: la caja cuenta cada abono el día que llega (no la venta),
--    Reportes y la meta la cuentan vendida ese día, lo que falta sale de
--    `falta_bcv_de` y se cierra con "Pago verificado" (`verificar_venta`).
--    Solo con SU ficha (`p_cliente_id`): escrita como ficha nueva, no.
--    Si tiene tope, lo que debe después de esta venta (todas sus ventas por
--    partes abiertas) no puede pasarlo. Con un crédito vencido SÍ puede
--    llevarse más (decisión del dueño): el mostrador solo avisa.
-- 3. En una venta a crédito, anular y quitar una pieza son del
--    administrador: la pieza ya salió con la clienta, y anular o quitar la
--    darían por vuelta a la vitrina. Lo cuidan dos disparadores
--    (`venta_credito_anular`, `venta_credito_quitar`), sin reescribir
--    `anular_venta_por_verificar` ni `quitar_de_venta`.
--    Con pagos, ni el administrador la anula a secas (la caja de esos días
--    perdería ese dinero): `admin_anular_credito` pide decir si se le
--    devuelve (sale de la caja hoy como "Devolución") o se queda, deja
--    `ventas.credito_cierre`, y `caja_flujo` (misma firma) sigue contando
--    sus abonos el día que llegaron, como `admin_cerrar_pedido`.
--    El tope cuenta solo los pagos comprobados (`deuda_comprobada_de`).
-- 4. `credito_de_clienta(cliente)`, de las dos caras: días, tope, lo que
--    debe, lo que le queda y sus vencidos (lo enseña el mostrador).
--    `v_credito` y `creditos_vencidos()`, solo del administrador (la
--    pantalla Crédito y el aviso del menú).
--    `v_ventas_por_verificar` gana al final `credito_vence` y
--    `precio_lista_bs`; `v_clientes`, `credito_dias` y `credito_tope_usd`.
--    `admin_fusionar_clientes` (misma firma) lleva también el crédito.
--
-- DEBERÍA DAR (SQL Editor, después de correrlo)
--   select admin_fijar_credito(<id de JaduJoyas>, 10, null);  -- como admin, desde la ficha
--   Una venta a crédito de una pieza de $20 BCV a una clienta del 20 %:
--   debe $16 BCV, vence en 10 días, la caja de hoy no la cuenta, Reportes sí.
--   Como vendedora, esto TIENE QUE FALLAR:
--     select admin_fijar_credito(1, 10, null);      -- "Solo un administrador..."
--     select * from v_credito;                      -- vacía
--
-- Probado en PGlite con la instalación entera (prueba-71).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL PERMISO, EN LA FICHA
-- ---------------------------------------------------------------------

alter table clientes add column if not exists credito_dias int;
alter table clientes add column if not exists credito_tope_usd numeric(12,2);
alter table clientes drop constraint if exists clientes_credito_dias_check;
alter table clientes add constraint clientes_credito_dias_check
  check (credito_dias is null or credito_dias between 1 and 365);
alter table clientes drop constraint if exists clientes_credito_tope_check;
alter table clientes add constraint clientes_credito_tope_check
  check (credito_tope_usd is null or credito_tope_usd > 0);
comment on column clientes.credito_dias is
  'Días que tiene para pagar una venta a crédito. Null: sin crédito. Solo lo escribe admin_fijar_credito.';
comment on column clientes.credito_tope_usd is
  'Lo máximo que puede deber a la vez, en $ BCV. Null: sin tope. Solo lo escribe admin_fijar_credito.';

-- Nadie con sesión escribe la tabla en crudo (así desde el #70).
revoke insert, update, delete, truncate on clientes from anon, authenticated;

alter table ventas add column if not exists credito_vence date;
comment on column ventas.credito_vence is
  'Venta a crédito: el último día para pagarla (día de Venezuela). Null: no es a crédito.';

create or replace function admin_fijar_credito(p_cliente_id bigint, p_dias int, p_tope_usd numeric)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_dias int     := nullif(coalesce(p_dias, 0), 0);
  v_tope numeric := nullif(round(coalesce(p_tope_usd, 0), 2), 0);
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede dar crédito a una clienta.';
  end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then
    raise exception 'Esa ficha ya no existe.';
  end if;
  if v_dias is not null and (v_dias < 1 or v_dias > 365) then
    raise exception 'Los días de crédito van de 1 a 365. Para quitarlo, déjalo vacío.';
  end if;
  if v_tope is not null and v_tope < 0 then
    raise exception 'El tope no puede ser negativo. Para no tener tope, déjalo vacío.';
  end if;
  -- Sin días no hay crédito, y tampoco tope.
  if v_dias is null then
    v_tope := null;
  end if;
  update clientes
     set credito_dias = v_dias, credito_tope_usd = v_tope, actualizado_en = now()
   where id = p_cliente_id;
end;
$fn$;
revoke all on function admin_fijar_credito(bigint, int, numeric) from public, anon;
grant execute on function admin_fijar_credito(bigint, int, numeric) to authenticated;


-- ---------------------------------------------------------------------
-- 2. LO QUE DEBE UNA CLIENTA
-- Todas sus ventas por partes abiertas: las de crédito y las de antes.
-- ---------------------------------------------------------------------

create or replace function deuda_de_clienta(p_cliente_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(sum(falta_bcv_de(v.id)), 0)
    from ventas v
   where v.cliente_id = p_cliente_id
     and v.pago_parcial and v.por_verificar and not v.anulada
     and v.devolucion_de is null;
$fn$;
revoke all on function deuda_de_clienta(bigint) from public, anon, authenticated;

-- La misma deuda, contando solo los pagos COMPROBADOS: es la que mide el
-- tope. Si contara un pago móvil sin comprobar, un "ya te transferí" que
-- nunca llega haría sitio para llevarse más de lo que el dueño permite.
create or replace function deuda_comprobada_de(p_cliente_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(sum(greatest(saldo_padre_bcv(v.id, null, null, null, true), 0)), 0)
    from ventas v
   where v.cliente_id = p_cliente_id
     and v.pago_parcial and v.por_verificar and not v.anulada
     and v.devolucion_de is null;
$fn$;
revoke all on function deuda_comprobada_de(bigint) from public, anon, authenticated;

-- Lo que enseña el mostrador al elegir su ficha. Ninguna cifra de costo.
create or replace function credito_de_clienta(p_cliente_id bigint)
returns table (dias int, tope_usd numeric, debe_bcv numeric, queda_bcv numeric,
               vencidas int, vencida_desde date)
language sql
stable
security definer
set search_path = public
as $fn$
  with c as (
    select c.credito_dias, c.credito_tope_usd, deuda_de_clienta(c.id) as debe,
           deuda_comprobada_de(c.id) as debe_comprobado
      from clientes c
     where c.id = p_cliente_id and es_personal()
  ), venc as (
    select count(*)::int as n, min(v.credito_vence) as desde
      from ventas v
     where v.cliente_id = p_cliente_id
       and v.credito_vence < (now() at time zone 'America/Caracas')::date
       and v.pago_parcial and v.por_verificar and not v.anulada
       and falta_bcv_de(v.id) > 0
  )
  select c.credito_dias, c.credito_tope_usd, round(c.debe, 4),
         case when c.credito_tope_usd is null then null
              else round(greatest(c.credito_tope_usd - c.debe_comprobado, 0), 4) end,
         venc.n, venc.desde
    from c cross join venc;
$fn$;
revoke all on function credito_de_clienta(bigint) from public, anon;
grant execute on function credito_de_clienta(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 3. LA VENTA A CRÉDITO
-- ---------------------------------------------------------------------

create or replace function vender_a_credito(
  p_items           jsonb,
  p_cliente_id      bigint,
  p_metodo          text,
  p_pago_monto      numeric default null,
  p_pago_referencia text    default null,
  p_pago_verificado boolean default false,
  p_extra_bs        numeric default null,
  p_extra_nota      text    default null,
  p_codigos         text[]  default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_dias  int;
  v_tope  numeric;
  v_antes numeric;
  v_debe  numeric;
  v_id    bigint;
  v_vence date;
  v_falta numeric;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  if p_cliente_id is null then
    raise exception 'Para vender a crédito, elige la ficha de la clienta: el crédito es suyo.';
  end if;

  -- Su fila, bloqueada: dos ventas a crédito a la vez no se saltan el tope.
  select credito_dias, credito_tope_usd into v_dias, v_tope
    from clientes where id = p_cliente_id for update;
  if not found then
    raise exception 'Esa ficha ya no existe.';
  end if;
  if v_dias is null then
    raise exception 'Esta clienta no tiene crédito: lo habilita el administrador en su ficha.';
  end if;
  v_antes := deuda_comprobada_de(p_cliente_id);

  -- La venta de siempre, por verificar: el precio sale de ahí.
  v_id := registrar_venta(
    p_tipo            => 'detal',
    p_metodo          => p_metodo,
    p_items           => p_items,
    p_cliente_id      => p_cliente_id,
    p_por_verificar   => true,
    p_pago_referencia => p_pago_referencia,
    p_extra_bs        => p_extra_bs,
    p_extra_nota      => p_extra_nota,
    p_codigos         => p_codigos);

  -- Por partes antes del abono: el disparador de `abonos` no deja colgar
  -- uno de una venta cobrada completa.
  v_vence := (now() at time zone 'America/Caracas')::date + v_dias;
  update ventas set pago_parcial = true, credito_vence = v_vence where id = v_id;

  if coalesce(p_pago_monto, 0) > 0 then
    perform abonar_venta(v_id, p_metodo, p_pago_monto, p_pago_referencia, coalesce(p_pago_verificado, false));
  end if;

  v_falta := falta_bcv_de(v_id);
  if v_falta <= 0 then
    raise exception 'Con eso ya está pagado: cóbralo como venta, no a crédito.';
  end if;

  if v_tope is not null then
    -- Solo con lo comprobado: un pago sin comprobar no hace sitio.
    v_debe := deuda_comprobada_de(p_cliente_id);
    if v_debe > v_tope + 0.005 then
      raise exception 'Con esta venta debería $% BCV (sin contar pagos sin comprobar) y su tope es $% BCV: antes de esta venta le quedaban $% BCV.',
        to_char(v_debe, 'FM999G999G990D00'), to_char(v_tope, 'FM999G999G990D00'),
        to_char(greatest(v_tope - v_antes, 0), 'FM999G999G990D00');
    end if;
  end if;

  return jsonb_build_object('venta_id', v_id, 'falta_bcv', v_falta, 'credito_vence', v_vence);
end;
$fn$;
revoke all on function vender_a_credito(jsonb, bigint, text, numeric, text, boolean, numeric, text, text[]) from public, anon;
grant execute on function vender_a_credito(jsonb, bigint, text, numeric, text, boolean, numeric, text, text[]) to authenticated;


-- ---------------------------------------------------------------------
-- 4. ANULAR Y QUITAR, SOLO EL ADMINISTRADOR
-- Con sesión y sin ser administrador, no. Sin sesión (el SQL Editor), sí.
-- ---------------------------------------------------------------------

-- Cuando una venta a crédito con pagos se anula, qué se hizo con el dinero.
-- Con él, sus abonos siguen contando en la caja el día que llegaron
-- (`caja_flujo`): el dinero entró de verdad. Lo pone `admin_anular_credito`.
alter table ventas add column if not exists credito_cierre text;
alter table ventas drop constraint if exists ventas_credito_cierre_check;
alter table ventas add constraint ventas_credito_cierre_check
  check (credito_cierre is null or credito_cierre in ('devuelto', 'se_queda'));

create or replace function venta_credito_solo_admin()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if auth.uid() is not null and not es_admin() then
    raise exception 'Esa venta es a crédito: la pieza ya se la llevó la clienta. Si la devolvió, lo hace el administrador.';
  end if;
  -- Con pagos vivos, anular a secas sacaría ese dinero de la caja de los
  -- días en que llegó. Se anula diciendo qué pasa con él.
  if auth.uid() is not null and new.credito_cierre is null
     and exists (select 1 from abonos where venta_id = new.id and anulado_en is null) then
    raise exception 'Esa venta a crédito ya tiene pagos: anúlala desde Pedidos diciendo si el dinero se le devuelve o se queda.';
  end if;
  return new;
end;
$fn$;
revoke all on function venta_credito_solo_admin() from public, anon, authenticated;

drop trigger if exists venta_credito_anular on ventas;
create trigger venta_credito_anular
  before update of anulada on ventas
  for each row
  when (new.anulada and not old.anulada and new.credito_vence is not null)
  execute function venta_credito_solo_admin();

-- En una línea: quitar (o cambiar la cantidad) de una venta a crédito.
create or replace function venta_item_credito_solo_admin()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if exists (select 1 from ventas where id = new.venta_id and credito_vence is not null)
     and auth.uid() is not null and not es_admin() then
    raise exception 'Esa venta es a crédito: la pieza ya se la llevó la clienta. Si la devolvió, lo hace el administrador.';
  end if;
  return new;
end;
$fn$;
revoke all on function venta_item_credito_solo_admin() from public, anon, authenticated;

-- Anular una venta a crédito que la clienta devolvió entera. Como
-- `admin_cerrar_pedido`: con pagos, se dice si el dinero se le devuelve
-- (sale de la caja hoy, como "Devolución") o se queda; en los dos casos sus
-- abonos siguen en la caja el día que llegaron. Las piezas vuelven por
-- `admin_anular_venta`, la de siempre.
create or replace function admin_anular_credito(
  p_venta_id bigint,
  p_devolver boolean,
  p_metodo   text    default null,
  p_monto    numeric default null,
  p_motivo   text    default null
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v ventas%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo el administrador anula una venta a crédito.';
  end if;
  select * into v from ventas where id = p_venta_id for update;
  if not found or v.credito_vence is null then
    raise exception 'Esa venta no es a crédito.';
  end if;
  if v.anulada then
    raise exception 'Esa venta ya estaba anulada.';
  end if;

  if exists (select 1 from abonos where venta_id = v.id and anulado_en is null) then
    if exists (select 1 from abonos where venta_id = v.id and anulado_en is null and verificado_en is null) then
      raise exception 'Hay pagos sin revisar: márcalos como que llegaron o que no llegaron antes de anular.';
    end if;
    if p_devolver is null then
      raise exception 'Di si lo que pagó se le devuelve o se queda.';
    end if;
    if p_devolver then
      if coalesce(p_monto, 0) <= 0 then
        raise exception 'Escribe cuánto se le devuelve.';
      end if;
      perform admin_anotar_caja('salida', (now() at time zone 'America/Caracas')::date, 'devolucion',
                                'Devolución de la venta a crédito #' || v.id || coalesce(' · ' || v.cliente_nombre, ''),
                                p_metodo, p_monto, null);
    end if;
    update ventas set credito_cierre = case when p_devolver then 'devuelto' else 'se_queda' end where id = v.id;
  end if;

  perform admin_anular_venta(v.id, coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'la clienta devolvió las piezas'));
end;
$fn$;
revoke all on function admin_anular_credito(bigint, boolean, text, numeric, text) from public, anon;
grant execute on function admin_anular_credito(bigint, boolean, text, numeric, text) to authenticated;

drop trigger if exists venta_credito_quitar on venta_items;
create trigger venta_credito_quitar
  before update of cantidad on venta_items
  for each row
  when (new.cantidad is distinct from old.cantidad)
  execute function venta_item_credito_solo_admin();


-- ---------------------------------------------------------------------
-- 5. LO QUE VE EL ADMINISTRADOR
-- ---------------------------------------------------------------------

-- Una fila por venta por partes abierta con clienta: las de crédito y las
-- de antes (sin `credito_vence`).
create or replace view v_credito
with (security_invoker = off) as
select
  v.id                                              as venta_id,
  v.fecha,
  v.cliente_id,
  coalesce(c.nombre_completo, v.cliente_nombre)     as cliente,
  c.cedula,
  coalesce(c.telefono, v.cliente_telefono)          as telefono,
  c.descuento_pct,
  c.credito_dias,
  c.credito_tope_usd,
  v.total_bs,
  round(v.total_bs / nullif(v.tasa_bcv_usada, 0), 4)              as total_bcv,
  round(v.total_bs / nullif(v.tasa_bcv_usada, 0) - f.falta, 4)    as pagado_bcv,
  f.falta                                           as falta_bcv,
  v.credito_vence,
  (v.credito_vence is not null and f.falta > 0
   and v.credito_vence < (now() at time zone 'America/Caracas')::date) as vencida,
  v.metodo
from ventas v
join clientes c on c.id = v.cliente_id
cross join lateral (select falta_bcv_de(v.id) as falta) f
where v.pago_parcial and v.por_verificar and not v.anulada
  and v.devolucion_de is null
  and es_admin();

revoke all on v_credito from anon;
grant select on v_credito to authenticated;

create or replace function creditos_vencidos()
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select case when es_admin() then
    (select count(*)::int from ventas v
      where v.credito_vence < (now() at time zone 'America/Caracas')::date
        and v.pago_parcial and v.por_verificar and not v.anulada
        and falta_bcv_de(v.id) > 0)
  else 0 end;
$fn$;
revoke all on function creditos_vencidos() from public, anon;
grant execute on function creditos_vencidos() to authenticated;


-- ---------------------------------------------------------------------
-- 5b. LA CAJA (la de esquema-devoluciones.sql, misma firma)
-- Lo único nuevo: los abonos de una venta a crédito anulada con
-- `credito_cierre` siguen contando el día que llegaron. Si se le devolvió
-- el dinero, `admin_anular_credito` anotó la salida de hoy.
-- ---------------------------------------------------------------------

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
     -- #71: los de una venta a crédito anulada diciendo qué pasó con el
     -- dinero siguen en su día: llegaron de verdad.
     and (v.id is null or not v.anulada or v.credito_cierre is not null)
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
-- 6. LAS VISTAS DE SIEMPRE (columnas nuevas al final)
-- ---------------------------------------------------------------------

-- La de esquema-ofertas-en-pantallas.sql, con el vencimiento del crédito y
-- la etiqueta de cada línea en bolívares (la pantalla Crédito la compara
-- con lo que se cobró).
create or replace view v_ventas_por_verificar
with (security_invoker = off) as
select v.id as venta_id,
       v.fecha,
       v.usuario_id,
       p.nombre as vendedora,
       v.metodo,
       v.pago_referencia,
       v.cliente_id,
       v.cliente_nombre,
       v.cliente_telefono,
       cl.cedula as cliente_cedula,
       v.total_bs,
       round(v.total_bs / nullif(v.tasa_bcv_usada, 0::numeric), 2) as total_bcv,
       v.total_usd as total_binance,
       i.modelo_id,
       m.sku,
       m.nombre,
       m.variante,
       m.foto_thumb_path,
       i.cantidad,
       i.precio_unitario_bs,
       ub.nombre as ubicacion,
       v.pago_parcial,
       falta_bcv_de(v.id) as falta_bcv,
       v.extra_bs,
       v.extra_nota,
       oc.codigo as oferta_codigo,
       oc.pct as oferta_pct,
       i.precio_sin_oferta_bs,
       -- #71
       v.credito_vence,
       round(i.precio_lista_usd * v.tasa_bcv_usada, 2) as precio_lista_bs
  from ventas v
  join venta_items i on i.venta_id = v.id and i.cantidad > 0
  join modelos m on m.id = i.modelo_id
  left join ubicaciones ub on ub.id = i.ubicacion_id
  left join perfiles p on p.id = v.usuario_id
  left join clientes cl on cl.id = v.cliente_id
  left join ofertas_codigos oc on oc.id = i.oferta_codigo_id
 where v.por_verificar and not v.anulada and auth.uid() is not null;

grant select on v_ventas_por_verificar to authenticated;

-- La del #70, con el crédito (la vendedora lo ve: el mostrador lo ofrece).
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
  rv.nombre                as revendedor,
  c.descuento_pct,
  (select x.nombre from revendedores x where x.cliente_id = c.id) as es_revendedor,
  c.credito_dias,
  c.credito_tope_usd
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

revoke all on v_clientes from anon;
grant select on v_clientes to authenticated;


-- ---------------------------------------------------------------------
-- 7. JUNTAR DOS FICHAS (la del #70, y el crédito)
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
  if exists (select 1 from revendedores where cliente_id = p_se_va)
     and exists (select 1 from revendedores where cliente_id = p_se_queda) then
    raise exception 'Las dos fichas son de revendedores distintos: no se pueden juntar.';
  end if;

  update ventas set cliente_id = p_se_queda where cliente_id = p_se_va;
  get diagnostics v_movidas = row_count;

  update reservas     set cliente_id = p_se_queda         where cliente_id = p_se_va;
  update apartados    set cliente_maestro_id = p_se_queda where cliente_maestro_id = p_se_va;
  update revendedores set cliente_id = p_se_queda         where cliente_id = p_se_va;

  -- El crédito va junto: días y tope de la misma ficha, no uno de cada.
  update clientes q
     set cedula   = coalesce(q.cedula, v.cedula),
         apellido = coalesce(q.apellido, v.apellido),
         telefono = coalesce(q.telefono, v.telefono),
         notas    = coalesce(q.notas, v.notas),
         revendedor_id = coalesce(q.revendedor_id, v.revendedor_id),
         descuento_pct = coalesce(q.descuento_pct, v.descuento_pct),
         credito_dias     = case when q.credito_dias is null then v.credito_dias     else q.credito_dias     end,
         credito_tope_usd = case when q.credito_dias is null then v.credito_tope_usd else q.credito_tope_usd end,
         actualizado_en = now()
    from clientes v
   where q.id = p_se_queda and v.id = p_se_va;

  delete from clientes where id = p_se_va;

  return v_movidas;
end;
$fn$;

revoke all on function admin_fusionar_clientes(bigint, bigint) from public, anon;
grant execute on function admin_fusionar_clientes(bigint, bigint) to authenticated;

notify pgrst, 'reload schema';
