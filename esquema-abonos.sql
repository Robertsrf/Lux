-- =====================================================================
-- Lux by Emory — pagar por partes: abonos con su referencia
-- Ejecutar en el SQL Editor DESPUÉS de esquema-datos-pago-e-historico.sql
--
-- QUÉ HACE
-- Una clienta se lleva sus piezas y paga una parte hoy. La vendedora (o el
-- administrador) marca "Pagó solo una parte", escribe cuánto pagó y la
-- referencia, y la venta queda en Pedidos, por verificar, diciendo cuánto
-- falta. Cuando la clienta paga lo demás, se carga el otro abono con su
-- referencia ahí mismo, las veces que haga falta. Solo cuando no falta
-- nada se puede marcar "Pago verificado".
--
-- LO QUE FALTA SE CUENTA EN DÓLARES BCV
-- El dólar es la unidad ancla. Una venta de Bs 1.000 a tasa 100 son
-- $10 BCV; si hoy abona Bs 400, pagó $4 y faltan $6. Si paga lo demás
-- cuando la tasa está en 110, lo que falta son Bs 660, no Bs 600: son los
-- mismos $6, y la tienda no pierde lo que se movió la tasa mientras tanto.
-- La pantalla lo dice en las dos monedas: "Faltan $6,00 BCV, hoy Bs 660,00".
--
-- Un abono en dólares (efectivo o Binance) se pasa a bolívares a la tasa
-- Binance del día, la misma cuenta con que la base guarda
-- `ventas.total_usd`, y de ahí a dólares BCV.
--
-- LO QUE CAMBIA
--   - `ventas.pago_parcial`: la venta se cobró por partes.
--   - `abonos`: cada pago, con su forma de pago, monto, referencia, tasa y
--     quién lo cargó. No se borra, como las ventas.
--   - `falta_bcv_de(venta)`: la única cuenta de cuánto falta.
--   - `cobrar_con_abono`: registra la venta por verificar y su primer abono,
--     en una transacción.
--   - `registrar_abono`: los abonos siguientes. De las dos caras.
--   - `verificar_venta`: no verifica mientras falte algo.
--   - `v_abonos`, y `falta_bcv` al final de `v_ventas_por_verificar` y de
--     `v_cliente_compras`.
--
-- Firmas: las de siempre siguen iguales. El navegador viejo sigue
-- cobrando como antes; solo no ofrece el pago por partes.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA VENTA POR PARTES Y SUS ABONOS
-- ---------------------------------------------------------------------

alter table ventas add column if not exists pago_parcial boolean not null default false;

comment on column ventas.pago_parcial is
  'Se cobró por partes: lo que falta sale de sus abonos (falta_bcv_de). '
  'Una venta por verificar sin esta marca se cobró completa y solo espera '
  'que alguien compruebe el pago.';

create table if not exists abonos (
  id             bigserial primary key,
  venta_id       bigint not null references ventas(id),
  fecha          timestamptz not null default now(),
  metodo         metodo_pago not null,
  monto_bs       numeric(14,2) not null check (monto_bs > 0),
  -- Lo que se recibió en dólares, si fue en dólares. Si no, null.
  monto_usd      numeric(12,2) check (monto_usd is null or monto_usd > 0),
  -- En dólares BCV a la tasa del día del abono: es lo que se resta.
  monto_bcv      numeric(16,6) not null check (monto_bcv > 0),
  tasa_bcv       numeric(12,4) not null,
  tasa_venta     numeric(12,4) not null,
  referencia     text,
  registrado_por uuid not null references perfiles(id)
);

create index if not exists abonos_venta_idx on abonos (venta_id);

-- Nadie la lee ni la escribe en crudo: se escribe por sus funciones y se
-- lee por `v_abonos`.
alter table abonos enable row level security;
revoke all on abonos from anon, authenticated;
revoke all on sequence abonos_id_seq from anon, authenticated;

-- Un abono es el histórico de crédito de una clienta: no se borra.
drop trigger if exists abonos_no_se_borran on abonos;
drop trigger if exists abonos_no_se_vacian on abonos;
create trigger abonos_no_se_borran before delete   on abonos for each row       execute function historico_no_se_borra();
create trigger abonos_no_se_vacian before truncate on abonos for each statement execute function historico_no_se_borra();


-- ---------------------------------------------------------------------
-- 2. CUÁNTO FALTA: UNA CUENTA, UN SITIO
-- ---------------------------------------------------------------------

-- Las formas de pago en dólares. Es la misma lista que METODOS_EN_DOLARES
-- en src/lib/tipos.ts: si una cambia, cambia la otra.
create or replace function metodo_en_dolares(p_metodo metodo_pago)
returns boolean
language sql
immutable
as $fn$
  select p_metodo in ('efectivo_usd', 'binance');
$fn$;

-- Lo que falta de una venta por partes, en dólares BCV. Cero si se cobró
-- completa o si ya está pagada. Medio centavo de dólar de tolerancia: los
-- bolívares se redondean a céntimos y la vuelta a dólares no da exacto.
create or replace function falta_bcv_de(p_venta_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when not v.pago_parcial then 0
           when x.falta < 0.005     then 0
           else round(x.falta, 4)
         end
    from ventas v
    cross join lateral (
      select v.total_bs / nullif(v.tasa_bcv_usada, 0)
             - coalesce((select sum(a.monto_bcv) from abonos a where a.venta_id = v.id), 0) as falta
    ) x
   where v.id = p_venta_id;
$fn$;

revoke all on function falta_bcv_de(bigint) from public, anon;
grant execute on function falta_bcv_de(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 3. ANOTAR UN ABONO
-- Por dentro: la usan `cobrar_con_abono` y `registrar_abono`, que son las
-- que miran quién llama y en qué estado está la venta.
-- ---------------------------------------------------------------------

create or replace function anotar_abono(
  p_venta_id   bigint,
  p_metodo     text,
  p_monto      numeric,
  p_referencia text
) returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tasa   tasas%rowtype;
  v_metodo metodo_pago;
  v_bs     numeric(14,2);
  v_usd    numeric(12,2);
  v_bcv    numeric;
  v_falta  numeric;
  v_margen numeric;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono tiene que ser mayor que cero.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fijala en la pantalla de Tasas antes de cobrar.';
  end if;

  v_metodo := p_metodo::metodo_pago;
  if metodo_en_dolares(v_metodo) then
    v_usd := round(p_monto, 2);
    v_bs  := round(v_usd * v_tasa.tasa_venta, 2);
  else
    v_bs  := round(p_monto, 2);
  end if;
  v_bcv := v_bs / v_tasa.tasa_bcv;

  -- Cuánto se puede pasar de lo que falta sin que sea un error: medio
  -- centavo de dólar BCV, o un centavo de la moneda en que paga si paga en
  -- dólares. Un dólar no se parte en milésimas: quien paga en efectivo lo
  -- que falta lo redondea al centavo, y eso no puede rechazarse.
  v_margen := case when metodo_en_dolares(v_metodo)
                   then greatest(0.005, 0.01 * v_tasa.tasa_venta / v_tasa.tasa_bcv)
                   else 0.005 end;

  v_falta := falta_bcv_de(p_venta_id);
  if v_bcv > v_falta + v_margen then
    raise exception 'El abono pasa lo que falta. Faltan $% BCV: hoy son Bs %.',
      to_char(v_falta, 'FM999G999G990D00'),
      to_char(round(v_falta * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
  end if;

  insert into abonos (venta_id, metodo, monto_bs, monto_usd, monto_bcv,
                      tasa_bcv, tasa_venta, referencia, registrado_por)
  values (p_venta_id, v_metodo, v_bs, v_usd, v_bcv,
          v_tasa.tasa_bcv, v_tasa.tasa_venta,
          nullif(btrim(coalesce(p_referencia, '')), ''), auth.uid());

  return falta_bcv_de(p_venta_id);
end;
$fn$;

revoke all on function anotar_abono(bigint, text, numeric, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. COBRAR UNA PARTE
-- La venta se registra igual que "Dejar por verificar" (la pieza sale del
-- inventario, nadie más la vende), se marca por partes y se anota el
-- primer abono. Todo o nada: si el abono no vale, la venta no queda.
-- ---------------------------------------------------------------------

create or replace function cobrar_con_abono(
  p_tipo             text,
  p_metodo           text,
  p_items            jsonb,
  p_abono            numeric,
  p_pago_referencia  text   default null,
  p_cliente_nombre   text   default null,
  p_cliente_telefono text   default null,
  p_cliente_id       bigint default null,
  p_cliente_cedula   text   default null,
  p_cliente_apellido text   default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_venta bigint;
  v_falta numeric;
begin
  v_venta := registrar_venta(
    p_tipo, p_metodo, p_items, null,
    p_cliente_nombre, p_cliente_telefono, null,
    p_cliente_id, p_cliente_cedula, p_cliente_apellido,
    true, p_pago_referencia);

  update ventas set pago_parcial = true where id = v_venta;

  v_falta := anotar_abono(v_venta, p_metodo, p_abono, p_pago_referencia);
  if v_falta <= 0 then
    raise exception 'Con ese abono ya está pagada completa: no es un pago por partes. Cóbrala con "Registrar venta" o "Dejar por verificar".';
  end if;

  return v_venta;
end;
$fn$;

revoke all on function cobrar_con_abono(text, text, jsonb, numeric, text, text, text, bigint, text, text) from public, anon;
grant execute on function cobrar_con_abono(text, text, jsonb, numeric, text, text, text, bigint, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5. EL ABONO SIGUIENTE
-- De las dos caras: lo carga quien esté cuando la clienta paga.
-- ---------------------------------------------------------------------

create or replace function registrar_abono(
  p_venta_id   bigint,
  p_metodo     text,
  p_monto      numeric,
  p_referencia text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_parcial boolean;
begin
  if auth.uid() is null or not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Hay que iniciar sesion.';
  end if;

  -- Se bloquea la venta: dos abonos a la vez no pueden pasarse de lo que
  -- falta, ni verificarse mientras entra uno.
  select pago_parcial into v_parcial
    from ventas
   where id = p_venta_id and por_verificar and not anulada
     for update;
  if not found then
    raise exception 'Esa venta ya no está por verificar.';
  end if;
  if not v_parcial then
    raise exception 'Esa venta se cobró completa: no lleva abonos.';
  end if;
  if falta_bcv_de(p_venta_id) <= 0 then
    raise exception 'Esa venta ya está pagada completa: solo falta verificarla.';
  end if;

  return anotar_abono(p_venta_id, p_metodo, p_monto, p_referencia);
end;
$fn$;

revoke all on function registrar_abono(bigint, text, numeric, text) from public, anon;
grant execute on function registrar_abono(bigint, text, numeric, text) to authenticated;


-- ---------------------------------------------------------------------
-- 6. VERIFICAR: SOLO CUANDO NO FALTA NADA
-- Igual que en esquema-pedidos-y-mover.sql, más el bloqueo de la fila y
-- la cuenta de lo que falta.
-- ---------------------------------------------------------------------

create or replace function verificar_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_falta numeric;
  v_tasa  numeric;
begin
  if auth.uid() is null or not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Hay que iniciar sesion.';
  end if;

  perform 1 from ventas where id = p_venta_id and por_verificar and not anulada for update;
  if not found then
    raise exception 'Esa venta ya no está por verificar.';
  end if;

  v_falta := coalesce(falta_bcv_de(p_venta_id), 0);
  if v_falta > 0 then
    select tasa_bcv into v_tasa from tasas where vigente limit 1;
    raise exception 'Todavía faltan $% BCV (hoy Bs %). Carga el abono que falta y después verifícala.',
      to_char(v_falta, 'FM999G999G990D00'),
      coalesce(to_char(round(v_falta * v_tasa, 2), 'FM999G999G990D00'), '?');
  end if;

  update ventas
     set por_verificar = false, verificada_por = auth.uid(), verificada_en = now()
   where id = p_venta_id;
end;
$fn$;

revoke all on function verificar_venta(bigint) from public, anon;
grant execute on function verificar_venta(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 7. LO QUE SE LEE
-- ---------------------------------------------------------------------

-- Cada abono, con quién lo cargó. Sin una sola cifra de costo.
create or replace view v_abonos
with (security_invoker = off) as
select
  a.id,
  a.venta_id,
  a.fecha,
  a.metodo,
  a.monto_bs,
  a.monto_usd,
  round(a.monto_bcv, 4) as monto_bcv,
  a.referencia,
  p.nombre              as registrado_por,
  v.cliente_id
from abonos a
join ventas v        on v.id = a.venta_id
left join perfiles p on p.id = a.registrado_por
where auth.uid() is not null;

revoke all on v_abonos from anon;
grant select on v_abonos to authenticated;

-- Las ventas por verificar: las mismas columnas que en
-- esquema-pedidos-y-mover.sql, y al final si es por partes y cuánto falta.
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
  ub.nombre           as ubicacion,
  v.pago_parcial,
  falta_bcv_de(v.id)  as falta_bcv
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

-- La ficha: las columnas de esquema-datos-pago-e-historico.sql, y al final
-- si es por partes y cuánto falta.
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
  falta_bcv_de(v.id) as falta_bcv
from ventas v
join venta_items i on i.venta_id = v.id
join modelos m     on m.id = i.modelo_id
where v.cliente_id is not null
  and (not v.anulada or v.notas like '%Anulada sin pago:%')
  and auth.uid() is not null;

grant select on v_cliente_compras to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. En el mostrador, cobra una pieza por pago móvil, marca "Pagó solo una
--    parte" y escribe la mitad. Tiene que decir cuánto falta en $ BCV y en
--    Bs, y la venta aparece en Pedidos con su abono y "Faltan ...".
--    "Pago verificado" no deja: dice cuánto falta.
--
-- 2. En Pedidos, carga el otro abono por lo que falta, con su referencia.
--    La tarjeta dice "Pagada completa" y ya se puede verificar.
--
--      select venta_id, monto_bs, monto_bcv, referencia from v_abonos
--       order by id desc limit 5;
--        -> los dos abonos. La suma de monto_bcv da el total de la venta
--           en $ BCV (total_bs / tasa_bcv_usada), con medio centavo de
--           diferencia como mucho.
--
-- 3. Esto TIENE QUE FALLAR (no se borran):
--      begin;
--      delete from abonos where id = (select min(id) from abonos);
--      rollback;
-- =====================================================================
