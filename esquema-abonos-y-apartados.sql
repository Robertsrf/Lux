-- =====================================================================
-- Lux by Emory — el apartado: 40 % y 15 días, y abonos que se editan
-- Ejecutar en el SQL Editor DESPUÉS de esquema-caja.sql
--
-- LO QUE DECIDIÓ EL DUEÑO (30/09/2026)
--
--   - Toda clienta puede APARTAR: paga al menos el 40 % de su pedido
--     (`apartado_inicial_pct`) y tiene 15 días (`apartado_dias`) para
--     pagar lo demás, abono por abono, cada uno con su referencia. Si no
--     termina a tiempo, lo abonado NO se devuelve y las piezas vuelven a
--     la venta solas.
--   - Vale para el catálogo y para el mostrador. En el mostrador REEMPLAZA
--     a "Pagó una parte" (la clienta se llevaba la pieza debiendo): ahora
--     la pieza se queda en la tienda hasta que termine de pagar.
--   - Todo pedido acepta abonos, cada abono dice cuánto quedaba después, y
--     un abono se puede corregir: la tienda mientras el pedido siga abierto
--     y el abono no se haya verificado; después, solo el administrador.
--     Cada cambio queda escrito: quién, cuándo, qué decía antes y por qué.
--
-- LA IDEA: EL PEDIDO APARTA, LOS ABONOS LO PAGAN, LA VENTA NACE AL FINAL
-- Un pedido no descuenta existencia: la aparta (`apartadas_de`, la regla
-- de siempre), y vencer no se guarda, se calcula. Los abonos cuelgan del
-- pedido. Cuando está pagado y verificado, "Entregar" registra la venta
-- con los precios que se CONGELARON al apartar, marcada `pago_parcial` y
-- con sus abonos enlazados: la caja cuenta cada abono el día que llegó y
-- nunca el total otra vez.
--
-- LO QUE NO SE HACE, A PROPÓSITO
--   - Un pago que reporta la clienta sin sesión es un AVISO, no dinero:
--     no entra a la caja hasta que alguien de la tienda lo verifica. El
--     efectivo no se reporta: lo carga la tienda, en persona.
--   - Cancelar un pedido con dinero no es de la vendedora: el
--     administrador decide si se devuelve (sale de la caja como
--     "Devolución") o se queda.
--   - Un pedido se entrega solo con todo su dinero verificado.
--   - `reservas` y `reserva_items` dejan de poder escribirse con una sesión
--     cualquiera: ahí viven ahora los precios congelados. Todo pasa por
--     estas funciones.
--
-- Firmas de lo que ya existía: las mismas. `cobrar_pedido`,
-- `cobrar_con_abono`, `reportar_pago` y `cancelar_pedido` siguen vivas
-- para el navegador viejo; la pantalla nueva ya no llama a las tres
-- primeras para lo que es un apartado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LAS CIFRAS DEL DUEÑO
-- `on conflict do nothing`: correr el archivo otra vez no pisa lo que él
-- haya cambiado desde Costos.
-- ---------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion) values
  ('apartado_inicial_pct', 40, 'Lo mínimo que se paga para apartar, en % del pedido'),
  ('apartado_dias',        15, 'Días que tiene la clienta para terminar de pagar un apartado de la tienda')
on conflict (clave) do nothing;

-- La vendedora las ve: el mostrador le dice cuánto es el mínimo y hasta
-- cuándo. Las demás claves, las mismas de esquema-meta-vendedora.sql.
drop policy if exists config_leer on configuracion;
create policy config_leer on configuracion for select to authenticated
using (
  es_admin()
  or clave in (
    'mayoreo_min_piezas',
    'mayoreo_min_usd',
    'meta_premium_dia',
    'premium_min_usd',
    'reserva_minutos',
    'meses_servicio',
    'descuento_max_mostrador_pct',
    'apartado_inicial_pct',
    'apartado_dias'
  )
);

-- Por dentro: una clave que tiene que estar. Sin ella no se inventa nada.
create or replace function config_requerida(p_clave text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v numeric;
begin
  select valor into v from configuracion where clave = p_clave;
  if v is null then
    raise exception 'Falta la cifra "%" en la configuración. Pídesela al administrador.', p_clave;
  end if;
  return v;
end;
$fn$;

revoke all on function config_requerida(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. EL PEDIDO GUARDA SU PRECIO, Y NADIE LO REESCRIBE A MANO
-- ---------------------------------------------------------------------

alter table reservas add column if not exists origen text not null default 'catalogo';
alter table reservas add column if not exists creado_por uuid references perfiles(id);
alter table reservas add column if not exists vence_apartado_en timestamptz;
alter table reservas add column if not exists pagado_en timestamptz;
alter table reservas add column if not exists cierre text;
alter table reservas add column if not exists cierre_motivo text;

do $bloque$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservas_origen_valido') then
    alter table reservas add constraint reservas_origen_valido check (origen in ('catalogo', 'tienda'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservas_cierre_valido') then
    alter table reservas add constraint reservas_cierre_valido check (cierre is null or cierre in ('devuelto', 'se_queda'));
  end if;
end
$bloque$;

comment on column reservas.origen is 'catalogo = lo armó la clienta; tienda = lo apartó la vendedora en el mostrador';
comment on column reservas.vence_apartado_en is 'Hasta cuándo aparta si no se ha pagado todo. Null en los de antes del apartado.';
comment on column reservas.pagado_en is 'Cuándo quedó pagado con dinero VERIFICADO. Desde ahí aparta hasta que se entrega.';

alter table reserva_items add column if not exists precio_usd       numeric(12,4);
alter table reserva_items add column if not exists precio_lista_usd numeric(12,4);
alter table reserva_items add column if not exists motivo_rebaja    text;

comment on column reserva_items.precio_usd is 'Precio de la pieza en $ BCV, congelado al apartar. Null en los pedidos de antes.';

-- Ninguna sesión escribe estas dos tablas en crudo: las escriben las
-- funciones de definidor. Se siguen pudiendo leer.
drop policy if exists reservas_auth on reservas;
drop policy if exists ritems_auth   on reserva_items;
drop policy if exists reservas_leer_personal on reservas;
drop policy if exists ritems_leer_personal   on reserva_items;
create policy reservas_leer_personal on reservas      for select to authenticated using (true);
create policy ritems_leer_personal   on reserva_items for select to authenticated using (true);
revoke insert, update, delete, truncate on reservas      from authenticated;
revoke insert, update, delete, truncate on reserva_items from authenticated;
revoke all on sequence reservas_id_seq      from anon, authenticated;
revoke all on sequence reserva_items_id_seq from anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. LOS ABONOS CUELGAN DE UN PEDIDO, DE UN APARTADO O DE UNA VENTA
-- ---------------------------------------------------------------------

alter table abonos alter column venta_id       drop not null;
alter table abonos alter column registrado_por drop not null;
alter table abonos add column if not exists reserva_id     bigint references reservas(id);
alter table abonos add column if not exists apartado_id    bigint references apartados(id);
alter table abonos add column if not exists origen         text not null default 'tienda';
alter table abonos add column if not exists pago_fecha     date;
alter table abonos add column if not exists pago_cedula    text;
alter table abonos add column if not exists pago_telefono  text;
alter table abonos add column if not exists verificado_en  timestamptz;
alter table abonos add column if not exists verificado_por uuid references perfiles(id);
alter table abonos add column if not exists anulado_en     timestamptz;
alter table abonos add column if not exists anulado_por    uuid references perfiles(id);
alter table abonos add column if not exists anulado_motivo text;
alter table abonos add column if not exists editado_en     timestamptz;
alter table abonos add column if not exists editado_por    uuid references perfiles(id);

do $bloque$
begin
  if not exists (select 1 from pg_constraint where conname = 'abonos_tiene_padre') then
    alter table abonos add constraint abonos_tiene_padre
      check (venta_id is not null or reserva_id is not null or apartado_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'abonos_origen_valido') then
    alter table abonos add constraint abonos_origen_valido
      check (origen in ('tienda', 'clienta', 'revendedor'));
  end if;
end
$bloque$;

comment on column abonos.origen is
  'tienda = lo cargó alguien de la tienda; clienta / revendedor = lo reportó alguien sin sesión, '
  'y hasta que se verifica es un aviso: no entra a la caja.';
comment on column abonos.anulado_en is 'El pago no llegó (o su venta se anuló). No cuenta en nada; no se borra.';

create index if not exists abonos_reserva_idx  on abonos (reserva_id)  where reserva_id  is not null;
create index if not exists abonos_apartado_idx on abonos (apartado_id) where apartado_id is not null;

-- Relleno, una sola vez (los `is null` lo hacen reejecutable):
--   - los abonos de una venta anulada quedan anulados el mismo día que
--     ella: la caja ya los dejaba fuera, y así los días pasados no cambian;
--   - los de una venta ya verificada quedan verificados con ella.
update abonos a
   set anulado_en     = coalesce(v.verificada_en, v.fecha),
       anulado_por    = v.verificada_por,
       anulado_motivo = 'venta anulada'
  from ventas v
 where v.id = a.venta_id
   and v.anulada
   and a.anulado_en is null;

update abonos a
   set verificado_en  = v.verificada_en,
       verificado_por = v.verificada_por
  from ventas v
 where v.id = a.venta_id
   and not v.anulada
   and not v.por_verificar
   and v.verificada_en is not null
   and a.verificado_en is null
   and a.anulado_en is null;

-- Una venta con abonos es una venta por partes, siempre: si no, la caja
-- contaría su total y además sus abonos.
create or replace function abono_exige_venta_por_partes()
returns trigger
language plpgsql
as $fn$
begin
  if new.venta_id is not null
     and not exists (select 1 from ventas where id = new.venta_id and pago_parcial) then
    raise exception 'Un abono solo cuelga de una venta cobrada por partes (venta %).', new.venta_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists abonos_de_venta_por_partes on abonos;
create trigger abonos_de_venta_por_partes
  before insert or update of venta_id on abonos
  for each row execute function abono_exige_venta_por_partes();

-- Lo que decía cada abono antes de cada cambio.
create table if not exists abono_cambios (
  id           bigserial primary key,
  abono_id     bigint not null references abonos(id),
  cambiado_en  timestamptz not null default now(),
  cambiado_por uuid references perfiles(id),
  que          text not null check (que in ('editado', 'anulado')),
  antes        jsonb not null,
  despues      jsonb,
  motivo       text
);

create index if not exists abono_cambios_abono_idx on abono_cambios (abono_id);

alter table abono_cambios enable row level security;
revoke all on abono_cambios from anon, authenticated;
revoke all on sequence abono_cambios_id_seq from anon, authenticated;

drop trigger if exists abono_cambios_no_se_borran on abono_cambios;
drop trigger if exists abono_cambios_no_se_vacian on abono_cambios;
create trigger abono_cambios_no_se_borran before delete   on abono_cambios for each row       execute function historico_no_se_borra();
create trigger abono_cambios_no_se_vacian before truncate on abono_cambios for each statement execute function historico_no_se_borra();


-- ---------------------------------------------------------------------
-- 4. LAS CUENTAS: UNA CIFRA, UN SITIO
-- ---------------------------------------------------------------------

-- La receta de un abono: en dólares, a bolívares por la tasa Binance y
-- redondeado a céntimos; de bolívares, a dólares BCV. Es la misma de
-- siempre (esquema-abonos.sql), ahora en un solo sitio, y con las tasas
-- que se le pasen: las de hoy para uno nuevo, las suyas para corregirlo.
create or replace function montos_de_abono(
  p_metodo     metodo_pago,
  p_monto      numeric,
  p_tasa_venta numeric,
  p_tasa_bcv   numeric,
  out bs  numeric,
  out usd numeric,
  out bcv numeric
)
language plpgsql
immutable
as $fn$
begin
  if metodo_en_dolares(p_metodo) then
    usd := round(p_monto, 2);
    bs  := round(usd * p_tasa_venta, 2);
  else
    usd := null;
    bs  := round(p_monto, 2);
  end if;
  bcv := bs / p_tasa_bcv;
end;
$fn$;

-- Cuánto se puede pasar de lo que falta sin que sea un error: medio
-- centavo de dólar BCV, o un centavo de la moneda si paga en dólares.
create or replace function margen_de_abono(p_metodo metodo_pago, p_tasa_venta numeric, p_tasa_bcv numeric)
returns numeric
language sql
immutable
as $fn$
  select case when metodo_en_dolares(p_metodo)
              then greatest(0.005, 0.01 * p_tasa_venta / p_tasa_bcv)
              else 0.005 end;
$fn$;

-- Lo que vale lo que un abono paga, en dólares BCV: el pedido congelado,
-- lo que el revendedor le paga a Lux, o la venta.
create or replace function total_padre_bcv(p_venta_id bigint, p_reserva_id bigint, p_apartado_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when p_reserva_id is not null then
             (select total_usd from reservas where id = p_reserva_id)
           when p_apartado_id is not null then
             (select coalesce(sum(precio_lux_usd * cantidad), 0) from apartado_items where apartado_id = p_apartado_id)
           else
             (select total_bs / nullif(tasa_bcv_usada, 0) from ventas where id = p_venta_id)
         end;
$fn$;

-- Abierta a la tienda: las vistas de Pedidos la usan, y una vista no
-- presta su permiso para ejecutar funciones. No lleva ningún costo.
revoke all on function total_padre_bcv(bigint, bigint, bigint) from public, anon;
grant execute on function total_padre_bcv(bigint, bigint, bigint) to authenticated;

-- Lo que falta, sin redondear ni recortar: lo que vale menos lo abonado
-- que no se anuló (menos uno, si se está corrigiendo ese). Con
-- `p_solo_verificado`, cuenta solo el dinero verificado. Un pedido y su
-- venta comparten abonos: se cuentan por el pedido, que es el que manda.
create or replace function saldo_padre_bcv(
  p_venta_id        bigint,
  p_reserva_id      bigint,
  p_apartado_id     bigint,
  p_sin_abono       bigint  default null,
  p_solo_verificado boolean default false
) returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select total_padre_bcv(p_venta_id, p_reserva_id, p_apartado_id)
       - coalesce((
           select sum(a.monto_bcv)
             from abonos a
            where a.anulado_en is null
              and (p_sin_abono is null or a.id <> p_sin_abono)
              and (not p_solo_verificado or a.verificado_en is not null)
              and case
                    when p_reserva_id  is not null then a.reserva_id  = p_reserva_id
                    when p_apartado_id is not null then a.apartado_id = p_apartado_id
                    else a.venta_id = p_venta_id
                  end
         ), 0);
$fn$;

revoke all on function saldo_padre_bcv(bigint, bigint, bigint, bigint, boolean) from public, anon;
grant execute on function saldo_padre_bcv(bigint, bigint, bigint, bigint, boolean) to authenticated;

-- Lo que falta de una venta por partes. Misma firma y mismo resultado que
-- en esquema-abonos.sql, menos los abonos anulados.
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
    cross join lateral (select saldo_padre_bcv(v.id, null, null) as falta) x
   where v.id = p_venta_id;
$fn$;

revoke all on function falta_bcv_de(bigint) from public, anon;
grant execute on function falta_bcv_de(bigint) to authenticated;

-- Lo que falta de un pedido, en dólares BCV. Cero si ya está pagado.
create or replace function falta_pedido_bcv(p_reserva_id bigint, p_solo_verificado boolean default false)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case when x.falta < 0.005 then 0 else round(x.falta, 4) end
    from (select saldo_padre_bcv(null, p_reserva_id, null, null, p_solo_verificado) as falta) x;
$fn$;

revoke all on function falta_pedido_bcv(bigint, boolean) from public, anon;
grant execute on function falta_pedido_bcv(bigint, boolean) to authenticated;

-- ¿Tiene cada pieza su precio congelado? Los pedidos de antes del
-- apartado no: esos se siguen cobrando completos, como siempre.
create or replace function pedido_con_precio(p_reserva_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from reserva_items where reserva_id = p_reserva_id)
     and not exists (select 1 from reserva_items where reserva_id = p_reserva_id and precio_usd is null);
$fn$;

revoke all on function pedido_con_precio(bigint) from public, anon;
grant execute on function pedido_con_precio(bigint) to authenticated;

-- En qué va un pedido. Una sola regla; las vistas y las funciones la leen.
--   esperando_pago  recién hecho, dentro de sus minutos
--   reportado       pedido de antes con el pago reportado sin monto
--   apartado        pagó al menos el mínimo; corre su plazo
--   pagado          pagado entero con dinero verificado; espera entregarse
--   vencido         se le pasó el plazo sin pagar
--   entregado / cancelado / cerrado
create or replace function fase_pedido(p_reserva_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when r.venta_id is not null    then 'entregado'
           when r.estado = 'cancelada'    then 'cancelado'
           when r.cerrada_en is not null  then 'cerrado'
           when r.pagado_en is not null   then 'pagado'
           when r.estado = 'vencida'
             or (r.estado = 'abierta' and r.expira_en <= now())
             or (r.estado = 'confirmada' and r.vence_apartado_en is not null and r.vence_apartado_en <= now())
                                          then 'vencido'
           when r.estado = 'confirmada' and r.vence_apartado_en is null then 'reportado'
           when r.estado = 'confirmada'   then 'apartado'
           else 'esperando_pago'
         end
    from reservas r
   where r.id = p_reserva_id;
$fn$;

revoke all on function fase_pedido(bigint) from public, anon;
grant execute on function fase_pedido(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 5. ANOTAR UN ABONO
-- Por dentro. Quien llama ya bloqueó el padre, miró quién es y calculó lo
-- que falta; aquí se convierte y se guarda.
-- ---------------------------------------------------------------------

create or replace function anotar_abono_en(
  p_venta_id      bigint,
  p_reserva_id    bigint,
  p_apartado_id   bigint,
  p_origen        text,
  p_metodo        text,
  p_monto         numeric,
  p_referencia    text,
  p_verificado    boolean,
  p_falta         numeric,
  p_pago_fecha    date default null,
  p_pago_cedula   text default null,
  p_pago_telefono text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tasa   tasas%rowtype;
  v_metodo metodo_pago;
  m        record;
  v_id     bigint;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono tiene que ser mayor que cero.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fíjala en la pantalla de Tasas antes de cobrar.';
  end if;

  begin
    v_metodo := nullif(btrim(coalesce(p_metodo, '')), '')::metodo_pago;
  exception when others then
    raise exception 'Esa forma de pago no existe.';
  end;
  if v_metodo is null then
    raise exception 'Falta la forma de pago.';
  end if;

  select * into m from montos_de_abono(v_metodo, p_monto, v_tasa.tasa_venta, v_tasa.tasa_bcv);
  if m.bs <= 0 then
    raise exception 'El abono es demasiado chico: no llega a un céntimo.';
  end if;

  if m.bcv > p_falta + margen_de_abono(v_metodo, v_tasa.tasa_venta, v_tasa.tasa_bcv) then
    raise exception 'El abono pasa lo que falta. Faltan $% BCV: hoy son Bs %.',
      to_char(greatest(p_falta, 0), 'FM999G999G990D00'),
      to_char(round(greatest(p_falta, 0) * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
  end if;

  insert into abonos (venta_id, reserva_id, apartado_id, origen, metodo,
                      monto_bs, monto_usd, monto_bcv, tasa_bcv, tasa_venta,
                      referencia, registrado_por,
                      pago_fecha, pago_cedula, pago_telefono,
                      verificado_en, verificado_por)
  values (p_venta_id, p_reserva_id, p_apartado_id, p_origen, v_metodo,
          m.bs, m.usd, m.bcv, v_tasa.tasa_bcv, v_tasa.tasa_venta,
          nullif(btrim(coalesce(p_referencia, '')), ''), auth.uid(),
          p_pago_fecha, nullif(btrim(coalesce(p_pago_cedula, '')), ''), nullif(btrim(coalesce(p_pago_telefono, '')), ''),
          case when p_verificado then now() end,
          case when p_verificado then auth.uid() end)
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function anotar_abono_en(bigint, bigint, bigint, text, text, numeric, text, boolean, numeric, date, text, text)
  from public, anon, authenticated;

-- El pedido al día: si ya llegó al mínimo pasa a apartado y le corre su
-- plazo desde el primer pago; si todo lo que tiene está verificado y
-- cubre el total, queda pagado. Se llama después de cada abono, cambio o
-- verificación.
create or replace function pedido_al_dia(p_reserva_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r         reservas%rowtype;
  v_pagado  numeric;
  v_primero timestamptz;
  v_minimo  numeric;
begin
  select * into r from reservas where id = p_reserva_id;
  if not found or r.venta_id is not null or r.cerrada_en is not null or r.estado = 'cancelada' then
    return;
  end if;

  select coalesce(sum(monto_bcv), 0), min(fecha)
    into v_pagado, v_primero
    from abonos
   where reserva_id = r.id and anulado_en is null;

  v_minimo := r.total_usd * config_requerida('apartado_inicial_pct') / 100;

  if r.vence_apartado_en is null and v_primero is not null and v_pagado >= v_minimo - 0.005
     and r.estado in ('abierta', 'confirmada') then
    update reservas
       set estado            = 'confirmada',
           vence_apartado_en = v_primero + make_interval(days => config_requerida('apartado_dias')::int),
           pago_reportado_en = coalesce(pago_reportado_en, now())
     where id = r.id;
  end if;

  update reservas
     set pagado_en = case
                       when saldo_padre_bcv(null, r.id, null, null, true) < 0.005 then coalesce(pagado_en, now())
                       else null
                     end
   where id = r.id;
end;
$fn$;

revoke all on function pedido_al_dia(bigint) from public, anon, authenticated;

-- Después de tocar un abono, su padre al día. Una venta a la que vuelve a
-- faltarle dinero vuelve a estar por verificar: si no, esa deuda no se
-- vería en ninguna parte. (esquema-revendedores-plazos.sql añade el
-- apartado del revendedor.)
create or replace function refrescar_padre(p_abono_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a abonos%rowtype;
begin
  select * into a from abonos where id = p_abono_id;
  if a.reserva_id is not null and a.venta_id is null then
    perform pedido_al_dia(a.reserva_id);
  end if;
  if a.venta_id is not null and falta_bcv_de(a.venta_id) > 0 then
    update ventas
       set por_verificar = true, verificada_en = null, verificada_por = null
     where id = a.venta_id and not por_verificar and not anulada;
  end if;
end;
$fn$;

revoke all on function refrescar_padre(bigint) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. EL PRECIO DE CADA PIEZA: UNA REGLA, UN SITIO
-- Lo que `registrar_venta` hacía en línea (esquema-apartadas-en-mostrador
-- .sql). Con tramo manda el tramo, que nunca baja del piso de margen; sin
-- tramo, el precio a mano (regateo) entre el piso de regateo y la etiqueta.
-- La usan `registrar_venta`, `crear_reserva` y `apartar_en_tienda`.
-- ---------------------------------------------------------------------

create or replace function precio_de_linea(
  p_modelo_id bigint,
  p_pedido    numeric,
  p_desc      numeric,
  p_tasa_bcv  numeric,
  out nombre       text,
  out precio_lista numeric,
  out precio_usd   numeric,
  out motivo       text,
  out costo        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_piso numeric(12,4);
begin
  select m.nombre || coalesce(' · ' || m.variante, ''),
         coalesce(m.precio_override_usd, g.precio_usd),
         m.costo_puesto_usd
    into nombre, precio_lista, costo
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
   where m.id = p_modelo_id and m.activo;

  if not found then
    raise exception 'El modelo % no existe o esta retirado.', p_modelo_id;
  end if;
  if precio_lista is null then
    raise exception 'El modelo "%" no tiene precio: falta asignarle un grupo.', nombre;
  end if;

  precio_usd := precio_lista;
  motivo     := null;

  if coalesce(p_desc, 0) > 0 then
    v_piso := coalesce(piso_margen_de(p_modelo_id), precio_lista);
    precio_usd := least(precio_lista,
                        greatest(round(precio_lista * (1 - p_desc / 100), 4), v_piso));
    if precio_usd < precio_lista then
      motivo := 'tramo';
    end if;

  elsif p_pedido is not null then
    v_piso := coalesce(precio_minimo_de(p_modelo_id), precio_lista);
    if round(p_pedido * p_tasa_bcv, 2) < round(v_piso * p_tasa_bcv, 2) then
      raise exception 'No puedes vender "%" por menos de Bs %. Ese es el minimo.',
        nombre, to_char(round(v_piso * p_tasa_bcv, 2), 'FM999G999G990D00');
    end if;
    if round(p_pedido * p_tasa_bcv, 2) > round(precio_lista * p_tasa_bcv, 2) then
      raise exception 'El precio de "%" no puede pasar de su precio de lista.', nombre;
    end if;
    precio_usd := least(greatest(p_pedido, v_piso), precio_lista);
    if precio_usd < precio_lista then
      motivo := 'regateo';
    end if;
  end if;
end;
$fn$;

revoke all on function precio_de_linea(bigint, numeric, numeric, numeric) from public, anon, authenticated;

-- La de esquema-apartadas-en-mostrador.sql, misma firma y mismo resultado.
-- Dos cambios: el precio sale de `precio_de_linea`, y antes de mirar lo
-- libre toma el candado de cada modelo que toman `crear_reserva` y
-- `apartar_en_tienda` (sin él, un pedido y una venta podían llevarse la
-- última pieza a la vez).
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
  v_pedido       numeric(12,4);
  v_precio_bs    numeric(14,2);
  v_operativo    numeric(12,4);
  v_ubi_nombre   text;
  p              record;
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

  -- El candado de cada modelo, en orden: el mismo que toman los pedidos.
  for v_modelo_id in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo_id);
  end loop;

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

    -- El precio, el nombre y el costo: la regla de siempre, en su sitio.
    select * into p from precio_de_linea(v_modelo_id, v_pedido, v_desc, v_tasa.tasa_bcv);

    select nombre into v_ubi_nombre from ubicaciones where id = v_ubicacion_id;

    if v_disponible is null or v_libre < v_cantidad then
      if v_apartadas > 0 then
        raise exception 'De "%" en % quedan % libres: % están apartadas para un pedido. Pides %.',
          p.nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), v_libre, v_apartadas, v_cantidad;
      end if;
      raise exception 'No hay suficiente "%" en %. Quedan %, y pides %.',
        p.nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), coalesce(v_disponible, 0), v_cantidad;
    end if;

    v_precio_bs := round(p.precio_usd * v_tasa.tasa_bcv, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs,
                             precio_lista_usd, costo_puesto_usd_snap,
                             costo_operativo_usd_snap, motivo_rebaja)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            p.precio_usd, v_precio_bs, p.precio_lista, p.costo, v_operativo, p.motivo);

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
-- 7. EL PEDIDO DEL CATÁLOGO CONGELA SU PRECIO
-- La de esquema-pedidos-y-mover.sql, misma firma. Lo único nuevo: cada
-- línea guarda su precio, su etiqueta y por qué salió más barata.
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
  p            record;
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
  v_lineas     jsonb := '[]'::jsonb;
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

    -- Con los mensajes de la clienta, antes de pedir el precio.
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
         - apartadas_de(v_modelo)
      into v_disponible;

    if v_cantidad > v_disponible then
      raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, greatest(v_disponible, 0), v_cantidad;
    end if;

    select * into p from precio_de_linea(v_modelo, null, v_desc, null);

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'modelo_id', v_modelo, 'cantidad', v_cantidad,
      'precio_usd', p.precio_usd, 'precio_lista_usd', p.precio_lista, 'motivo', p.motivo));

    v_piezas   := v_piezas + v_cantidad;
    v_subtotal := v_subtotal + (p.precio_lista * v_cantidad);
    v_total    := v_total + (p.precio_usd * v_cantidad);
  end loop;

  v_total := round(v_total, 4);

  select valor into v_minutos from configuracion where clave = 'reserva_minutos';

  insert into reservas (cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
                        entrega, envio_empresa, envio_agencia, envio_direccion,
                        piezas, subtotal_usd, descuento_pct, total_usd, expira_en,
                        cliente_id, datos_del_maestro, origen)
  values (v_nom, v_ape, v_ced, v_tel,
          v_entrega, v_empresa, v_agencia, v_direccion,
          v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now() + (coalesce(v_minutos, 60) || ' minutes')::interval,
          v_cliente_id, v_maestro, 'catalogo')
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad, precio_usd, precio_lista_usd, motivo_rebaja)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int,
         (x->>'precio_usd')::numeric, (x->>'precio_lista_usd')::numeric, x->>'motivo'
    from jsonb_array_elements(v_lineas) x;

  return v_token;
end;
$fn$;

revoke all on function crear_reserva(jsonb, text, text, text, text, text, text, text, text) from public;
grant execute on function crear_reserva(jsonb, text, text, text, text, text, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. QUÉ APARTA UN PEDIDO
-- La de esquema-revendedores.sql. Cambia la parte de los pedidos de la
-- tienda: uno confirmado aparta mientras esté pagado, mientras le corra el
-- plazo del apartado, o si es de antes del apartado (sin plazo, como
-- siempre). La parte de los revendedores, igual.
-- ---------------------------------------------------------------------

create or replace function apartadas_de(p_modelo_id bigint)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select (
    coalesce((select sum(ri.cantidad)
                from reserva_items ri
                join reservas r on r.id = ri.reserva_id
               where ri.modelo_id = p_modelo_id
                 and r.venta_id is null
                 and r.cerrada_en is null
                 and (   (r.estado = 'abierta' and r.expira_en > now())
                      or (r.estado = 'confirmada'
                          and (r.pagado_en is not null
                               or r.vence_apartado_en is null
                               or r.vence_apartado_en > now())))), 0)
  + coalesce((select sum(ai.cantidad)
                from apartado_items ai
                join apartados a on a.id = ai.apartado_id
               where ai.modelo_id = p_modelo_id
                 and a.estado = 'abierto'
                 and a.cerrado_en is null
                 and a.expira_en > now()), 0)
  )::int;
$fn$;

revoke all on function apartadas_de(bigint) from public;
grant execute on function apartadas_de(bigint) to anon, authenticated;

-- Marca vencidos los que se pasaron: los abiertos de siempre y, ahora,
-- los apartados cuyo plazo terminó sin estar pagados. No toca su dinero.
create or replace function limpiar_reservas()
returns void
language sql
security definer
set search_path = public
as $fn$
  update reservas set estado = 'vencida'
   where estado = 'abierta' and expira_en < now()
     and venta_id is null and cerrada_en is null;
  update reservas set estado = 'vencida'
   where estado = 'confirmada' and venta_id is null and cerrada_en is null
     and pagado_en is null and vence_apartado_en is not null and vence_apartado_en < now();
$fn$;

revoke all on function limpiar_reservas() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 9. LA CLIENTA REPORTA UN PAGO DESDE SU ENLACE
-- Sin sesión, con el token de su pedido. Es un aviso: la tienda lo
-- comprueba en su banco y lo verifica (o dice que no llegó). Puede
-- reportar varios —el pago móvil tiene límite por operación—, y el pedido
-- queda apartado cuando lo reportado llega al mínimo.
-- ---------------------------------------------------------------------

create or replace function reportar_abono(
  p_token      uuid,
  p_metodo     text,
  p_monto      numeric,
  p_referencia text,
  p_fecha      date,
  p_cedula     text default null,
  p_telefono   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r        reservas%rowtype;
  v_metodo metodo_pago;
  v_ref    text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_ced    text := nullif(btrim(coalesce(p_cedula, '')), '');
  v_tel    text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_fase   text;
  v_falta  numeric;
begin
  perform limpiar_reservas();

  select * into r from reservas where token = p_token for update;
  if not found then
    raise exception 'Ese pedido no existe o el enlace está mal copiado.';
  end if;

  v_fase := fase_pedido(r.id);
  if v_fase = 'vencido' then
    raise exception 'Ese pedido ya venció. Si ya pagaste algo, escríbenos por WhatsApp.';
  end if;
  if v_fase not in ('esperando_pago', 'apartado') then
    raise exception 'Ese pedido ya no recibe pagos por aquí. Escríbenos por WhatsApp.';
  end if;
  if not pedido_con_precio(r.id) then
    raise exception 'Ese pedido es de antes: reporta tu pago con el formulario de siempre.';
  end if;

  begin
    v_metodo := nullif(btrim(coalesce(p_metodo, '')), '')::metodo_pago;
  exception when others then
    raise exception 'Esa forma de pago no existe.';
  end;
  if v_metodo is null then raise exception 'Dinos cómo pagaste.'; end if;
  if v_metodo in ('efectivo_bs', 'efectivo_usd', 'punto') then
    raise exception 'El efectivo y el punto se pagan en la tienda: ahí lo anotan.';
  end if;

  if v_ref is null then raise exception 'Falta el número de referencia del pago.'; end if;
  if p_fecha is null then raise exception 'Falta la fecha del pago.'; end if;
  if p_fecha > current_date then raise exception 'Esa fecha de pago es de mañana. Revísala.'; end if;
  if p_fecha < current_date - 30 then raise exception 'Esa fecha de pago tiene más de un mes. Revísala.'; end if;
  if v_metodo in ('pago_movil', 'transferencia') then
    if v_ced is null then raise exception 'Falta la cédula de quien transfirió.'; end if;
    if v_tel is null then raise exception 'Falta el teléfono de quien transfirió.'; end if;
    if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
      raise exception 'Esa cédula está incompleta.';
    end if;
    if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
      raise exception 'Ese teléfono está incompleto.';
    end if;
  end if;

  -- Un freno técnico, no una cifra del negocio: un enlace no puede
  -- apilar avisos sin fin mientras nadie de la tienda los revisa.
  if (select count(*) from abonos
       where reserva_id = r.id and anulado_en is null and verificado_en is null) >= 5 then
    raise exception 'Ya reportaste varios pagos que la tienda todavía no revisa. Escríbenos por WhatsApp.';
  end if;

  v_falta := falta_pedido_bcv(r.id);
  if v_falta <= 0 then
    raise exception 'Ese pedido ya está pagado completo.';
  end if;

  perform anotar_abono_en(null, r.id, null, 'clienta', v_metodo::text, p_monto, v_ref,
                          false, v_falta, p_fecha, v_ced, v_tel);

  -- Lo último que reportó, donde lo miraba la pantalla de antes.
  update reservas
     set pago_metodo = v_metodo, pago_referencia = v_ref, pago_fecha = p_fecha,
         pago_cedula = v_ced, pago_telefono = v_tel, pago_reportado_en = now()
   where id = r.id;

  perform pedido_al_dia(r.id);

  return jsonb_build_object('fase', fase_pedido(r.id), 'falta_bcv', falta_pedido_bcv(r.id));
end;
$fn$;

revoke all on function reportar_abono(uuid, text, numeric, text, date, text, text) from public;
grant execute on function reportar_abono(uuid, text, numeric, text, date, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 10. LA TIENDA CARGA UN ABONO A UN PEDIDO
-- De las dos caras. En efectivo o punto queda verificado de una vez: el
-- dinero está en la mano. Por pago móvil, quien lo carga dice si ya lo vio
-- en el banco.
-- ---------------------------------------------------------------------

create or replace function abonar_pedido(
  p_reserva_id bigint,
  p_metodo     text,
  p_monto      numeric,
  p_referencia text    default null,
  p_verificado boolean default true
) returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r       reservas%rowtype;
  v_fase  text;
  v_falta numeric;
  v_verif boolean;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;

  select * into r from reservas where id = p_reserva_id for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;

  v_fase := fase_pedido(r.id);
  if v_fase = 'vencido' then
    raise exception 'Ese apartado venció el %: ya no recibe abonos.',
      to_char(coalesce(r.vence_apartado_en, r.expira_en) at time zone 'America/Caracas', 'DD/MM/YYYY');
  end if;
  if v_fase not in ('esperando_pago', 'apartado', 'reportado') then
    raise exception 'Ese pedido ya está cerrado.';
  end if;
  if not pedido_con_precio(r.id) then
    raise exception 'Ese pedido es de antes del apartado: cóbralo completo con "Cobrar y entregar".';
  end if;

  v_falta := falta_pedido_bcv(r.id);
  if v_falta <= 0 then
    raise exception 'Ese pedido ya está pagado completo: solo falta entregarlo.';
  end if;

  v_verif := coalesce(p_verificado, true) or p_metodo in ('efectivo_bs', 'efectivo_usd', 'punto');

  perform anotar_abono_en(null, r.id, null, 'tienda', p_metodo, p_monto, p_referencia, v_verif, v_falta);
  perform pedido_al_dia(r.id);

  return falta_pedido_bcv(r.id);
end;
$fn$;

revoke all on function abonar_pedido(bigint, text, numeric, text, boolean) from public, anon;
grant execute on function abonar_pedido(bigint, text, numeric, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 11. APARTAR EN EL MOSTRADOR
-- Reemplaza a "Pagó una parte". La clienta con su cédula, las piezas al
-- precio de siempre (tramo o regateo, `precio_de_linea`), y lo que paga
-- ahora: al menos el mínimo, menos que el total. Puede pagar con dos
-- formas (parte en efectivo, parte por pago móvil).
-- ---------------------------------------------------------------------

create or replace function apartar_en_tienda(
  p_items            jsonb,
  p_pagos            jsonb,
  p_cliente_id       bigint  default null,
  p_cliente_cedula   text    default null,
  p_cliente_nombre   text    default null,
  p_cliente_apellido text    default null,
  p_cliente_telefono text    default null,
  p_verificado       boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tasa      tasas%rowtype;
  v_cliente   clientes%rowtype;
  v_cli_id    bigint;
  v_modelo    bigint;
  v_item      jsonb;
  v_pago      jsonb;
  v_cantidad  int;
  v_piezas    int := 0;
  v_desc      numeric(5,2);
  v_disp      int;
  v_pedidas   int;
  p           record;
  v_lineas    jsonb := '[]'::jsonb;
  v_subtotal  numeric(12,4) := 0;
  v_total     numeric(12,4) := 0;
  v_id        bigint;
  v_token     uuid;
  v_falta     numeric;
  v_minimo    numeric;
  v_metodo    text;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El apartado no tiene piezas.';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Para apartar hace falta el primer pago.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fíjala en la pantalla de Tasas antes de cobrar.';
  end if;

  -- La clienta, con su cédula: un apartado es una deuda con nombre.
  v_cli_id := resolver_cliente(p_cliente_id, p_cliente_cedula, p_cliente_nombre,
                               p_cliente_apellido, p_cliente_telefono);
  if v_cli_id is null then
    raise exception 'Para apartar hace falta la clienta: búscala o escribe su cédula y su nombre.';
  end if;
  select * into v_cliente from clientes where id = v_cli_id;
  if v_cliente.cedula_digitos is null then
    raise exception 'Para apartar hace falta la cédula de la clienta.';
  end if;

  select coalesce(sum((x->>'cantidad')::int), 0) into v_piezas from jsonb_array_elements(p_items) x;
  v_desc := coalesce(descuento_para(v_piezas), 0);

  -- Candados en orden y existencias bloqueadas, como `registrar_venta`.
  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
    perform 1 from existencias where modelo_id = v_modelo for update;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::int;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select * into p from precio_de_linea(v_modelo,
                                         nullif(v_item->>'precio_unitario_usd', '')::numeric,
                                         v_desc, v_tasa.tasa_bcv);

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'modelo_id', v_modelo, 'cantidad', v_cantidad,
      'precio_usd', p.precio_usd, 'precio_lista_usd', p.precio_lista, 'motivo', p.motivo));
    v_subtotal := v_subtotal + p.precio_lista * v_cantidad;
    v_total    := v_total + p.precio_usd * v_cantidad;
  end loop;

  -- Lo libre, por modelo: todo lo que hay menos lo apartado.
  for v_modelo, v_pedidas in
    select (x->>'modelo_id')::bigint, sum((x->>'cantidad')::int)::int
      from jsonb_array_elements(p_items) x group by 1
  loop
    select coalesce((select sum(cantidad) from existencias where modelo_id = v_modelo), 0)
         - apartadas_de(v_modelo)
      into v_disp;
    if v_pedidas > v_disp then
      select nombre into p from precio_de_linea(v_modelo, null, 0, null);
      raise exception 'De "%" quedan % libres y quieres apartar %.', p.nombre, greatest(v_disp, 0), v_pedidas;
    end if;
  end loop;

  v_total := round(v_total, 4);

  insert into reservas (cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
                        entrega, piezas, subtotal_usd, descuento_pct, total_usd,
                        expira_en, cliente_id, datos_del_maestro, origen, creado_por, estado)
  values (v_cliente.nombre, v_cliente.apellido, v_cliente.cedula, v_cliente.telefono,
          'tienda', v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now(), v_cli_id, false, 'tienda', auth.uid(), 'abierta')
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad, precio_usd, precio_lista_usd, motivo_rebaja)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int,
         (x->>'precio_usd')::numeric, (x->>'precio_lista_usd')::numeric, x->>'motivo'
    from jsonb_array_elements(v_lineas) x;

  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    v_metodo := v_pago->>'metodo';
    v_falta  := saldo_padre_bcv(null, v_id, null);
    perform anotar_abono_en(null, v_id, null, 'tienda', v_metodo,
                            nullif(v_pago->>'monto', '')::numeric, v_pago->>'referencia',
                            coalesce(p_verificado, true) or v_metodo in ('efectivo_bs', 'efectivo_usd', 'punto'),
                            v_falta);
  end loop;

  v_minimo := v_total * config_requerida('apartado_inicial_pct') / 100;
  v_falta  := saldo_padre_bcv(null, v_id, null);
  if v_total - v_falta < v_minimo - 0.005 then
    raise exception 'Para apartar, lo que paga hoy tiene que ser al menos el % %%: $% BCV, hoy Bs %.',
      to_char(config_requerida('apartado_inicial_pct'), 'FM990'),
      to_char(v_minimo, 'FM999G999G990D00'),
      to_char(round(v_minimo * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
  end if;
  if v_falta < 0.005 then
    raise exception 'Con eso ya está pagado completo: cóbralo como venta, no como apartado.';
  end if;

  perform pedido_al_dia(v_id);

  return jsonb_build_object('id', v_id, 'token', v_token, 'falta_bcv', falta_pedido_bcv(v_id),
                            'vence_apartado_en', (select vence_apartado_en from reservas where id = v_id));
end;
$fn$;

revoke all on function apartar_en_tienda(jsonb, jsonb, bigint, text, text, text, text, boolean) from public, anon;
grant execute on function apartar_en_tienda(jsonb, jsonb, bigint, text, text, text, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 12. ENTREGAR: LA VENTA NACE CON LOS PRECIOS CONGELADOS
-- Por dentro, `vender_congelado` es la única que registra una venta con
-- precios que no son los de hoy: la usan el pedido que se entrega y el
-- apartado del revendedor que se aprueba. Toma las piezas de lo LIBRE,
-- en el orden de siempre, así que quien llama suelta antes su pedido.
-- ---------------------------------------------------------------------

create or replace function vender_congelado(
  p_tipo             text,
  p_metodo           metodo_pago,
  p_lineas           jsonb,
  p_cliente_id       bigint,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_notas            text,
  p_usuario          uuid,
  p_revendedor_id    bigint,
  p_pago_referencia  text
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tasa      tasas%rowtype;
  v_venta     bigint;
  v_operativo numeric(12,4);
  v_linea     jsonb;
  v_ex        record;
  v_modelo    bigint;
  v_falta     int;
  v_toma      int;
  v_precio    numeric(12,4);
  v_bs        numeric(14,2);
  v_costo     numeric(12,4);
  v_nombre    text;
  v_total_bs  numeric(14,2) := 0;
begin
  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fíjala en la pantalla de Tasas antes de cobrar.';
  end if;

  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  -- Nace como una venta cobrada, no "por verificar": lo que se verificó fue
  -- cada abono. (`verificada_en` es de las ventas que QUEDARON por verificar:
  -- la ficha de la clienta lo lee como "se comprobó N días después".)
  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      cliente_id, cliente_nombre, cliente_telefono, notas,
                      por_verificar, pago_referencia, pago_parcial, revendedor_id)
  values (p_usuario, p_tipo::tipo_venta, p_metodo, v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_cliente_id, p_cliente_nombre, p_cliente_telefono, p_notas,
          false, nullif(btrim(coalesce(p_pago_referencia, '')), ''), true, p_revendedor_id)
  returning id into v_venta;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_modelo := (v_linea->>'modelo_id')::bigint;
    v_falta  := (v_linea->>'cantidad')::int;
    v_precio := (v_linea->>'precio_usd')::numeric;
    v_bs     := round(v_precio * v_tasa.tasa_bcv, 2);

    select m.costo_puesto_usd, m.nombre || coalesce(' · ' || m.variante, '')
      into v_costo, v_nombre
      from modelos m where m.id = v_modelo;

    perform 1 from existencias where modelo_id = v_modelo for update;

    for v_ex in
      select l.ubicacion_id, l.libre
        from v_existencia_libre l
        join ubicaciones u on u.id = l.ubicacion_id
       where l.modelo_id = v_modelo and l.libre > 0
       order by l.cantidad desc, u.orden, u.id
    loop
      exit when v_falta = 0;
      v_toma := least(v_falta, v_ex.libre);

      update existencias
         set cantidad = cantidad - v_toma, actualizado_en = now()
       where modelo_id = v_modelo and ubicacion_id = v_ex.ubicacion_id and cantidad >= v_toma;
      if not found then
        raise exception 'La existencia de "%" cambió mientras se entregaba. Inténtalo otra vez.', v_nombre;
      end if;

      insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                               precio_unitario_usd, precio_unitario_bs,
                               precio_lista_usd, costo_puesto_usd_snap,
                               costo_operativo_usd_snap, motivo_rebaja)
      values (v_venta, v_modelo, v_ex.ubicacion_id, v_toma,
              v_precio, v_bs, (v_linea->>'precio_lista_usd')::numeric, v_costo, v_operativo,
              nullif(v_linea->>'motivo', ''));

      v_total_bs := v_total_bs + v_bs * v_toma;
      v_falta    := v_falta - v_toma;
    end loop;

    if v_falta > 0 then
      raise exception 'De "%" faltan % en la tienda para completar la entrega.', v_nombre, v_falta;
    end if;
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta;

  return v_venta;
end;
$fn$;

revoke all on function vender_congelado(text, metodo_pago, jsonb, bigint, text, text, text, uuid, bigint, text)
  from public, anon, authenticated;

-- Entregar un pedido pagado. Si llega con lo que falta en la mano, se
-- carga primero (verificado) y se entrega en la misma transacción.
create or replace function entregar_pedido(
  p_reserva_id bigint,
  p_metodo     text    default null,
  p_monto      numeric default null,
  p_referencia text    default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r          reservas%rowtype;
  v_fase     text;
  v_falta    numeric;
  v_pend     int;
  v_tasa     numeric;
  v_modelo   bigint;
  v_metodo   metodo_pago;
  v_ref      text;
  v_cliente  bigint;
  v_lineas   jsonb;
  v_venta    bigint;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;

  select * into r from reservas where id = p_reserva_id for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;

  v_fase := fase_pedido(r.id);
  if v_fase = 'entregado' then raise exception 'Ese pedido ya se entregó.'; end if;
  if v_fase in ('cancelado', 'cerrado') then raise exception 'Ese pedido está cerrado.'; end if;
  if v_fase = 'vencido' then
    raise exception 'Ese apartado venció el %: sus piezas ya están libres.',
      to_char(coalesce(r.vence_apartado_en, r.expira_en) at time zone 'America/Caracas', 'DD/MM/YYYY');
  end if;
  if not pedido_con_precio(r.id) then
    raise exception 'Ese pedido es de antes del apartado: cóbralo con "Cobrar y entregar".';
  end if;

  if coalesce(p_monto, 0) > 0 then
    v_falta := falta_pedido_bcv(r.id);
    perform anotar_abono_en(null, r.id, null, 'tienda', p_metodo, p_monto, p_referencia, true, v_falta);
  end if;

  select count(*) into v_pend
    from abonos where reserva_id = r.id and anulado_en is null and verificado_en is null;
  if v_pend > 0 then
    raise exception 'Hay % pago(s) sin verificar. Revisa en el banco si llegaron antes de entregar.', v_pend;
  end if;

  v_falta := falta_pedido_bcv(r.id, true);
  if v_falta > 0 then
    select tasa_bcv into v_tasa from tasas where vigente limit 1;
    raise exception 'Todavía faltan $% BCV (hoy Bs %). Carga lo que falta y después entrega.',
      to_char(v_falta, 'FM999G999G990D00'),
      coalesce(to_char(round(v_falta * v_tasa, 2), 'FM999G999G990D00'), '?');
  end if;

  for v_modelo in
    select distinct modelo_id from reserva_items where reserva_id = r.id order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  -- Se suelta: desde aquí sus piezas cuentan como libres y se toman.
  update reservas set cerrada_en = now(), cerrada_por = auth.uid() where id = r.id;

  select a.metodo into v_metodo
    from abonos a where a.reserva_id = r.id and a.anulado_en is null
   order by a.monto_bcv desc, a.fecha desc limit 1;
  select a.referencia into v_ref
    from abonos a where a.reserva_id = r.id and a.anulado_en is null and a.referencia is not null
   order by a.fecha desc limit 1;

  v_cliente := resolver_cliente(r.cliente_id, r.cliente_cedula, r.cliente_nombre,
                                r.cliente_apellido, r.cliente_telefono);

  select jsonb_agg(jsonb_build_object(
           'modelo_id', ri.modelo_id, 'cantidad', ri.cantidad,
           'precio_usd', ri.precio_usd, 'precio_lista_usd', ri.precio_lista_usd,
           'motivo', ri.motivo_rebaja) order by ri.id)
    into v_lineas
    from reserva_items ri where ri.reserva_id = r.id;

  v_venta := vender_congelado(
    'detal', v_metodo, v_lineas, v_cliente,
    btrim(coalesce(r.cliente_nombre, '') || ' ' || coalesce(r.cliente_apellido, '')),
    r.cliente_telefono,
    case r.origen when 'tienda' then 'Apartado #' else 'Pedido del catálogo #' end || r.id,
    coalesce(r.creado_por, auth.uid()), null, v_ref);

  update abonos set venta_id = v_venta where reserva_id = r.id;

  update reservas
     set venta_id = v_venta, estado = 'confirmada', pagado_en = coalesce(pagado_en, now())
   where id = r.id;

  return v_venta;
end;
$fn$;

revoke all on function entregar_pedido(bigint, text, numeric, text) from public, anon;
grant execute on function entregar_pedido(bigint, text, numeric, text) to authenticated;

-- La de esquema-apartadas-en-mostrador.sql, misma firma, para el
-- navegador viejo. Un pedido de antes del apartado sin abonos se cobra
-- como siempre. Uno con precio congelado pasa por `entregar_pedido`, para
-- que haya UNA sola forma de que un pedido se vuelva venta y la caja no
-- cuente dos veces: si no tiene abonos, "Cobrar" es que pagó todo ahora.
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
  r        reservas%rowtype;
  v_ri     record;
  v_ex     record;
  v_items  jsonb := '[]'::jsonb;
  v_falta  int;
  v_toma   int;
  v_venta  bigint;
  v_con    boolean;
  v_dinero numeric;
  v_tasa   tasas%rowtype;
  v_monto  numeric;
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
  if r.estado in ('cancelada', 'vencida') or r.cerrada_en is not null then
    raise exception 'Ese pedido está %: ya no se puede cobrar.', r.estado;
  end if;

  v_con := exists (select 1 from abonos where reserva_id = r.id and anulado_en is null);

  if v_con or pedido_con_precio(r.id) then
    if v_con then
      v_dinero := falta_pedido_bcv(r.id);
      if v_dinero > 0 then
        raise exception 'Este pedido se paga por abonos y le faltan $% BCV. Actualiza la página para cargar lo que falta.',
          to_char(v_dinero, 'FM999G999G990D00');
      end if;
      -- "Cobrar" en la pantalla vieja es que ya se comprobó el pago.
      update abonos
         set verificado_en = now(), verificado_por = auth.uid()
       where reserva_id = r.id and anulado_en is null and verificado_en is null;
      perform pedido_al_dia(r.id);
      return entregar_pedido(r.id);
    end if;

    -- Sin abonos: lo pagó todo ahora, en la forma que dice.
    select * into v_tasa from tasas where vigente limit 1;
    v_dinero := falta_pedido_bcv(r.id);
    if metodo_en_dolares(p_metodo::metodo_pago) then
      v_monto := ceil(v_dinero * v_tasa.tasa_bcv / v_tasa.tasa_venta * 100) / 100;
    else
      v_monto := round(v_dinero * v_tasa.tasa_bcv, 2);
    end if;
    return entregar_pedido(r.id, p_metodo, v_monto, coalesce(nullif(btrim(p_pago_referencia), ''), r.pago_referencia));
  end if;

  -- Pedido de antes del apartado: como siempre, al precio de hoy.
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


-- ---------------------------------------------------------------------
-- 13. CORREGIR, ANULAR Y VERIFICAR UN ABONO
-- La tienda corrige un abono mientras su pedido o su venta siga abierto y
-- el abono no se haya verificado; el administrador, cuando sea. Tres
-- frenos más para la vendedora, porque el historial solo ayuda si alguien
-- lo lee: no pasa un abono de efectivo a otra forma de pago (ni al revés)
-- y no anula uno en efectivo. Se recalcula con las tasas del PROPIO abono:
-- corregir un error no es cambiarle el día.
-- ---------------------------------------------------------------------

create or replace function abono_se_puede_tocar(p_abono_id bigint, p_accion text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a        abonos%rowtype;
  v_abierto boolean;
begin
  select * into a from abonos where id = p_abono_id;
  if not found then
    raise exception 'Ese abono no existe.';
  end if;
  if a.anulado_en is not null then
    raise exception 'Ese abono está anulado: ya no se cambia.';
  end if;

  if es_admin() then
    return;
  end if;
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;

  if a.venta_id is not null then
    v_abierto := exists (select 1 from ventas where id = a.venta_id and por_verificar and not anulada);
  elsif a.reserva_id is not null then
    v_abierto := fase_pedido(a.reserva_id) in ('esperando_pago', 'apartado', 'reportado', 'pagado');
  else
    v_abierto := exists (select 1 from apartados where id = a.apartado_id and estado = 'abierto' and cerrado_en is null);
  end if;

  if not v_abierto then
    raise exception 'Ese pedido ya se cerró: sus abonos los cambia solo el administrador.';
  end if;
  if p_accion in ('editar', 'anular') and a.verificado_en is not null then
    raise exception 'Ese abono ya se verificó: lo cambia solo el administrador.';
  end if;
  if p_accion = 'anular' and a.metodo in ('efectivo_bs', 'efectivo_usd') then
    raise exception 'Un abono en efectivo lo anula solo el administrador.';
  end if;
end;
$fn$;

revoke all on function abono_se_puede_tocar(bigint, text) from public, anon, authenticated;

-- Bloquea el padre de un abono, para que dos cambios a la vez no se pasen
-- de lo que falta.
create or replace function bloquear_padre_de(p_abono_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a abonos%rowtype;
begin
  select * into a from abonos where id = p_abono_id;
  if a.reserva_id is not null then
    perform 1 from reservas where id = a.reserva_id for update;
  elsif a.apartado_id is not null then
    perform 1 from apartados where id = a.apartado_id for update;
  end if;
  if a.venta_id is not null then
    perform 1 from ventas where id = a.venta_id for update;
  end if;
end;
$fn$;

revoke all on function bloquear_padre_de(bigint) from public, anon, authenticated;

create or replace function editar_abono(
  p_abono_id   bigint,
  p_metodo     text,
  p_monto      numeric,
  p_referencia text,
  p_motivo     text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a        abonos%rowtype;
  v_metodo metodo_pago;
  m        record;
  v_saldo  numeric;
  v_ref    text := nullif(btrim(coalesce(p_referencia, '')), '');
begin
  perform bloquear_padre_de(p_abono_id);
  select * into a from abonos where id = p_abono_id for update;
  perform abono_se_puede_tocar(p_abono_id, 'editar');

  begin
    v_metodo := coalesce(nullif(btrim(coalesce(p_metodo, '')), ''), a.metodo::text)::metodo_pago;
  exception when others then
    raise exception 'Esa forma de pago no existe.';
  end;

  if not es_admin()
     and (a.metodo in ('efectivo_bs', 'efectivo_usd')) <> (v_metodo in ('efectivo_bs', 'efectivo_usd')) then
    raise exception 'Pasar un abono de efectivo a otra forma de pago (o al revés) lo hace solo el administrador.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono tiene que ser mayor que cero.';
  end if;

  select * into m from montos_de_abono(v_metodo, p_monto, a.tasa_venta, a.tasa_bcv);
  if m.bs <= 0 then
    raise exception 'El abono es demasiado chico: no llega a un céntimo.';
  end if;

  v_saldo := saldo_padre_bcv(a.venta_id, a.reserva_id, a.apartado_id, a.id);
  if m.bcv > v_saldo + margen_de_abono(v_metodo, a.tasa_venta, a.tasa_bcv) then
    raise exception 'Con ese monto el abono pasa lo que falta: como mucho $% BCV.',
      to_char(greatest(v_saldo, 0), 'FM999G999G990D00');
  end if;

  if v_metodo = a.metodo and m.bs = a.monto_bs and coalesce(v_ref, '') = coalesce(a.referencia, '') then
    return saldo_padre_bcv(a.venta_id, a.reserva_id, a.apartado_id);
  end if;

  insert into abono_cambios (abono_id, cambiado_por, que, antes, despues, motivo)
  values (a.id, auth.uid(), 'editado',
          jsonb_build_object('metodo', a.metodo, 'monto_bs', a.monto_bs, 'monto_usd', a.monto_usd,
                             'monto_bcv', round(a.monto_bcv, 4), 'referencia', a.referencia),
          jsonb_build_object('metodo', v_metodo, 'monto_bs', m.bs, 'monto_usd', m.usd,
                             'monto_bcv', round(m.bcv, 4), 'referencia', v_ref),
          nullif(btrim(coalesce(p_motivo, '')), ''));

  update abonos
     set metodo = v_metodo, monto_bs = m.bs, monto_usd = m.usd, monto_bcv = m.bcv,
         referencia = v_ref, editado_en = now(), editado_por = auth.uid()
   where id = a.id;

  perform refrescar_padre(a.id);

  return greatest(round(saldo_padre_bcv(a.venta_id, a.reserva_id, a.apartado_id), 4), 0);
end;
$fn$;

revoke all on function editar_abono(bigint, text, numeric, text, text) from public, anon;
grant execute on function editar_abono(bigint, text, numeric, text, text) to authenticated;

create or replace function anular_abono(p_abono_id bigint, p_motivo text default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a abonos%rowtype;
  v_motivo text := coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'el pago no llegó');
begin
  perform bloquear_padre_de(p_abono_id);
  select * into a from abonos where id = p_abono_id for update;
  perform abono_se_puede_tocar(p_abono_id, 'anular');

  insert into abono_cambios (abono_id, cambiado_por, que, antes, despues, motivo)
  values (a.id, auth.uid(), 'anulado',
          jsonb_build_object('metodo', a.metodo, 'monto_bs', a.monto_bs, 'monto_usd', a.monto_usd,
                             'monto_bcv', round(a.monto_bcv, 4), 'referencia', a.referencia),
          null, v_motivo);

  update abonos
     set anulado_en = now(), anulado_por = auth.uid(), anulado_motivo = v_motivo
   where id = a.id;

  perform refrescar_padre(a.id);

  return greatest(round(saldo_padre_bcv(a.venta_id, a.reserva_id, a.apartado_id), 4), 0);
end;
$fn$;

revoke all on function anular_abono(bigint, text) from public, anon;
grant execute on function anular_abono(bigint, text) to authenticated;

create or replace function verificar_abono(p_abono_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a abonos%rowtype;
begin
  perform bloquear_padre_de(p_abono_id);
  select * into a from abonos where id = p_abono_id for update;
  perform abono_se_puede_tocar(p_abono_id, 'verificar');
  if a.verificado_en is not null then
    return;
  end if;

  update abonos set verificado_en = now(), verificado_por = auth.uid() where id = a.id;
  perform refrescar_padre(a.id);
end;
$fn$;

revoke all on function verificar_abono(bigint) from public, anon;
grant execute on function verificar_abono(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 14. CERRAR UN PEDIDO CON DINERO
-- Lo que ya tiene dinero no lo cancela la vendedora: el administrador
-- decide si se devuelve (sale de la caja como "Devolución", el día que se
-- devuelve) o se queda. Un apartado que venció se queda con lo abonado:
-- es la regla, y lo archiva cualquiera de la tienda.
-- ---------------------------------------------------------------------

-- La lista de categorías de esquema-caja.sql, más la devolución. Si
-- cambia una, cambia CATEGORIAS_CAJA en src/lib/tipos.ts.
create or replace function caja_categoria_valida(p_tipo text, p_categoria text)
returns boolean
language sql
immutable
as $fn$
  select case p_tipo
    when 'salida' then p_categoria in (
      'alquiler', 'sueldos', 'servicios', 'empaque', 'mercancia', 'transporte',
      'publicidad', 'mantenimiento', 'comisiones', 'retiro', 'otro_gasto', 'devolucion')
    when 'entrada' then p_categoria in ('aporte', 'otro_ingreso')
    else false
  end;
$fn$;

-- La de esquema-pedidos-y-mover.sql, misma firma: si tiene dinero, no.
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
  perform 1 from reservas where id = p_reserva_id for update;
  if exists (select 1 from abonos where reserva_id = p_reserva_id and anulado_en is null) then
    raise exception 'Ese pedido ya tiene pagos: lo cierra el administrador, que decide si el dinero se devuelve o se queda.';
  end if;
  update reservas
     set estado = 'cancelada', cerrada_en = now(), cerrada_por = auth.uid()
   where id = p_reserva_id and venta_id is null and cerrada_en is null and estado in ('abierta', 'confirmada');
  if not found then
    raise exception 'Ese pedido ya estaba cerrado.';
  end if;
end;
$fn$;

revoke all on function cancelar_pedido(bigint) from public, anon;
grant execute on function cancelar_pedido(bigint) to authenticated;

create or replace function admin_cerrar_pedido(
  p_reserva_id bigint,
  p_devolver   boolean,
  p_metodo     text    default null,
  p_monto      numeric default null,
  p_motivo     text    default null
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r      reservas%rowtype;
  v_fase text;
begin
  if not es_admin() then
    raise exception 'Solo el administrador cierra un pedido con dinero.';
  end if;

  select * into r from reservas where id = p_reserva_id for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;
  v_fase := fase_pedido(r.id);
  if v_fase in ('entregado', 'cancelado', 'cerrado') then
    raise exception 'Ese pedido ya está cerrado.';
  end if;
  if exists (select 1 from abonos where reserva_id = r.id and anulado_en is null and verificado_en is null) then
    raise exception 'Hay pagos sin revisar: márcalos como que llegaron o que no llegaron antes de cerrar.';
  end if;

  if coalesce(p_devolver, false) then
    if coalesce(p_monto, 0) <= 0 then
      raise exception 'Escribe cuánto se le devuelve.';
    end if;
    perform admin_anotar_caja('salida', (now() at time zone 'America/Caracas')::date, 'devolucion',
                              'Devolución del pedido #' || r.id || ' · ' ||
                              btrim(coalesce(r.cliente_nombre, '') || ' ' || coalesce(r.cliente_apellido, '')),
                              p_metodo, p_monto, null);
  end if;

  update reservas
     set estado        = case when v_fase = 'vencido' then 'vencida'::estado_reserva else 'cancelada'::estado_reserva end,
         cerrada_en    = now(),
         cerrada_por   = auth.uid(),
         cierre        = case when coalesce(p_devolver, false) then 'devuelto' else 'se_queda' end,
         cierre_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = r.id;
end;
$fn$;

revoke all on function admin_cerrar_pedido(bigint, boolean, text, numeric, text) from public, anon;
grant execute on function admin_cerrar_pedido(bigint, boolean, text, numeric, text) to authenticated;

-- Archivar un apartado vencido: el dinero se queda, como dice la regla.
-- Uno que venció sin llegar nunca al mínimo no era un apartado: ese lo
-- decide el administrador.
create or replace function cerrar_pedido_vencido(p_reserva_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r reservas%rowtype;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  select * into r from reservas where id = p_reserva_id for update;
  if not found or fase_pedido(r.id) <> 'vencido' then
    raise exception 'Ese pedido no está vencido.';
  end if;
  if r.vence_apartado_en is null and exists (select 1 from abonos where reserva_id = r.id and anulado_en is null) then
    raise exception 'Ese pedido venció sin llegar al mínimo del apartado: lo cierra el administrador.';
  end if;
  update reservas
     set estado = 'vencida', cerrada_en = now(), cerrada_por = auth.uid(), cierre = 'se_queda'
   where id = r.id;
end;
$fn$;

revoke all on function cerrar_pedido_vencido(bigint) from public, anon;
grant execute on function cerrar_pedido_vencido(bigint) to authenticated;

-- Desde el enlace, la clienta cancela solo lo que no ha pagado.
create or replace function cancelar_reserva(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r reservas%rowtype;
begin
  select * into r from reservas where token = p_token for update;
  if not found then
    return;
  end if;
  if exists (select 1 from abonos where reserva_id = r.id and anulado_en is null) then
    raise exception 'Ya reportaste un pago: para cancelar, escríbenos por WhatsApp.';
  end if;
  update reservas set estado = 'cancelada'
   where id = r.id and estado in ('abierta', 'confirmada') and venta_id is null and cerrada_en is null;
end;
$fn$;

-- Confirmar sin pagar apartaba para siempre, y la podía llamar cualquiera
-- con el enlace. Ya no la llama ninguna pantalla: se queda, y no aparta.
create or replace function confirmar_reserva(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'Para confirmar tu pedido, reporta tu pago.';
end;
$fn$;


-- ---------------------------------------------------------------------
-- 15. LAS VENTAS POR PARTES DE ANTES
-- "Pagó una parte" ya no se ofrece en el mostrador, pero las ventas que
-- quedaron así siguen recibiendo abonos hasta pagarse. Mismas firmas.
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
  v_falta   numeric;
begin
  if auth.uid() is null or not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Hay que iniciar sesion.';
  end if;

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
  v_falta := falta_bcv_de(p_venta_id);
  if v_falta <= 0 then
    raise exception 'Esa venta ya está pagada completa: solo falta verificarla.';
  end if;

  perform anotar_abono_en(p_venta_id, null, null, 'tienda', p_metodo, p_monto, p_referencia, false, v_falta);
  return falta_bcv_de(p_venta_id);
end;
$fn$;

revoke all on function registrar_abono(bigint, text, numeric, text) from public, anon;
grant execute on function registrar_abono(bigint, text, numeric, text) to authenticated;

-- Ya no la llama la pantalla (el apartado la reemplazó): se queda viva
-- para el navegador viejo mientras se publica el nuevo. Se retira con la
-- tienda cerrada; ver ESTADO.md.
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
begin
  v_venta := registrar_venta(
    p_tipo, p_metodo, p_items, null,
    p_cliente_nombre, p_cliente_telefono, null,
    p_cliente_id, p_cliente_cedula, p_cliente_apellido,
    true, p_pago_referencia);

  update ventas set pago_parcial = true where id = v_venta;

  perform anotar_abono_en(v_venta, null, null, 'tienda', p_metodo, p_abono, p_pago_referencia,
                          false, falta_bcv_de(v_venta));
  if falta_bcv_de(v_venta) <= 0 then
    raise exception 'Con ese abono ya está pagada completa: no es un pago por partes. Cóbrala con "Registrar venta" o "Dejar por verificar".';
  end if;

  return v_venta;
end;
$fn$;

revoke all on function cobrar_con_abono(text, text, jsonb, numeric, text, text, text, bigint, text, text) from public, anon;
grant execute on function cobrar_con_abono(text, text, jsonb, numeric, text, text, text, bigint, text, text) to authenticated;

-- La receta vive ahora en `anotar_abono_en`; la de antes no la llama nadie.
drop function if exists anotar_abono(bigint, text, numeric, text);

-- Verificar la venta verifica sus abonos: si no, la venta diría
-- "comprobada" y sus abonos "por verificar".
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

  update abonos
     set verificado_en = now(), verificado_por = auth.uid()
   where venta_id = p_venta_id and anulado_en is null and verificado_en is null;
end;
$fn$;

revoke all on function verificar_venta(bigint) from public, anon;
grant execute on function verificar_venta(bigint) to authenticated;

-- La de esquema-pedidos-y-mover.sql, misma firma. Dos cosas nuevas: una
-- venta que nació de un pedido pagado por abonos no la anula la vendedora
-- (se llevaría 15 días de dinero cobrado y devolvería piezas que ya
-- salieron), y los abonos de la que sí se anula quedan anulados con ella.
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
  if exists (select 1 from reservas where venta_id = p_venta_id)
     or exists (select 1 from apartados where venta_id = p_venta_id) then
    raise exception 'Esa venta salió de un pedido pagado por abonos: la anula solo el administrador.';
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

  update abonos
     set anulado_en = now(), anulado_por = auth.uid(), anulado_motivo = 'venta anulada'
   where venta_id = p_venta_id and anulado_en is null;
end;
$fn$;

revoke all on function anular_venta_por_verificar(bigint, text) from public, anon;
grant execute on function anular_venta_por_verificar(bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- 16. LA CAJA
-- La de esquema-caja.sql. Cambia el tramo de los abonos: entra cada abono
-- no anulado cuya venta, si ya la tiene, no se anuló; los de pedidos y
-- apartados entran antes de ser venta (el dinero ya llegó). Lo que
-- reportó alguien sin sesión entra solo cuando se verifica. Cada abono
-- dice si está verificado.
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
-- 17. LO QUE SE LEE
-- ---------------------------------------------------------------------

-- Por dentro: cada abono con lo que valía su pedido y lo que faltaba
-- después de él. Es el ÚNICO sitio de esa cuenta: la leen la vista de la
-- tienda, el enlace de la clienta y el panel del revendedor.
create or replace view abonos_saldo
with (security_invoker = off) as
select
  x.id,
  x.total_bcv,
  case when x.anulado_en is null
       then greatest(round(x.total_bcv - x.acumulado, 4), 0)
  end as falta_despues_bcv
from (
  select
    a.id,
    a.anulado_en,
    total_padre_bcv(a.venta_id, a.reserva_id, a.apartado_id) as total_bcv,
    sum(case when a.anulado_en is null then a.monto_bcv else 0 end) over (
      partition by coalesce('r' || a.reserva_id, 'a' || a.apartado_id, 'v' || a.venta_id)
      order by a.fecha, a.id
      rows between unbounded preceding and current row) as acumulado
  from abonos a
) x;

revoke all on abonos_saldo from public, anon, authenticated;

-- La de esquema-abonos.sql: mismas columnas y mismas filas que leía el
-- navegador viejo (los abonos de ventas), menos los anulados.
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
where auth.uid() is not null
  and a.anulado_en is null;

revoke all on v_abonos from anon;
grant select on v_abonos to authenticated;

-- Todos los abonos, con su historia: quién, verificado, anulado, si se
-- corrigió y cuánto faltaba después de cada uno. Sin una cifra de costo.
create or replace view v_abonos_detalle
with (security_invoker = off) as
select
  a.id,
  a.venta_id,
  a.reserva_id,
  a.apartado_id,
  a.fecha,
  a.origen,
  a.metodo,
  a.monto_bs,
  a.monto_usd,
  round(a.monto_bcv, 4)  as monto_bcv,
  a.tasa_bcv,
  a.tasa_venta,
  a.referencia,
  a.pago_fecha,
  a.pago_cedula,
  a.pago_telefono,
  pr.nombre              as registrado_por,
  a.verificado_en,
  pv.nombre              as verificado_por,
  a.anulado_en,
  pa.nombre              as anulado_por,
  a.anulado_motivo,
  a.editado_en,
  pe.nombre              as editado_por,
  (select count(*) from abono_cambios c where c.abono_id = a.id)::int as cambios,
  round(s.total_bcv, 4)  as total_bcv,
  s.falta_despues_bcv,
  coalesce(v.cliente_id, r.cliente_id) as cliente_id
from abonos a
join abonos_saldo s     on s.id = a.id
left join ventas v      on v.id = a.venta_id
left join reservas r    on r.id = a.reserva_id
left join perfiles pr   on pr.id = a.registrado_por
left join perfiles pv   on pv.id = a.verificado_por
left join perfiles pa   on pa.id = a.anulado_por
left join perfiles pe   on pe.id = a.editado_por
where auth.uid() is not null;

revoke all on v_abonos_detalle from anon;
grant select on v_abonos_detalle to authenticated;

-- Lo que decía cada abono antes de cada cambio, y quién lo cambió.
create or replace view v_abono_cambios
with (security_invoker = off) as
select
  c.id,
  c.abono_id,
  c.cambiado_en,
  p.nombre as cambiado_por,
  c.que,
  c.antes,
  c.despues,
  c.motivo
from abono_cambios c
left join perfiles p on p.id = c.cambiado_por
where auth.uid() is not null;

revoke all on v_abono_cambios from anon;
grant select on v_abono_cambios to authenticated;

-- Pedidos: la de esquema-pedidos-y-mover.sql, mismas columnas y al final
-- lo del apartado. Entran también los vencidos que tienen dinero, para
-- archivarlos o decidir qué se hace con él.
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
  -- Nuevas.
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
join reserva_items ri on ri.reserva_id = r.id
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

revoke all on v_pedido_vendedora from anon;
grant select on v_pedido_vendedora to authenticated;

-- El enlace de la clienta: las mismas claves de esquema-cedula-en-catalogo
-- .sql, el precio congelado de cada pieza, y al final lo del apartado y
-- sus pagos (de la referencia, solo los cuatro últimos).
create or replace function ver_reserva(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r        reservas%rowtype;
  v_items    jsonb;
  v_abonos   jsonb;
  v_nombre   text;
  v_apellido text;
  v_telefono text;
  v_palabras text[];
  v_pct      numeric;
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
           'precio_usd', coalesce(ri.precio_usd, c.precio_usd),
           'variante', c.variante
         ) order by c.nombre, c.variante), '[]'::jsonb)
    into v_items
    from reserva_items ri
    join v_catalogo_venta c on c.id = ri.modelo_id
   where ri.reserva_id = v_r.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha', a.fecha,
           'metodo', a.metodo,
           'monto_bs', a.monto_bs,
           'monto_usd', a.monto_usd,
           'monto_bcv', round(a.monto_bcv, 4),
           'referencia_final', right(a.referencia, 4),
           'estado', case when a.anulado_en is not null then 'no_llego'
                          when a.verificado_en is not null then 'recibido'
                          else 'por_revisar' end,
           'falta_despues_bcv', s.falta_despues_bcv
         ) order by a.fecha, a.id), '[]'::jsonb)
    into v_abonos
    from abonos a
    join abonos_saldo s on s.id = a.id
   where a.reserva_id = v_r.id;

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

  select valor into v_pct from configuracion where clave = 'apartado_inicial_pct';

  return jsonb_build_object(
    'estado',            v_r.estado,
    'creado_en',         v_r.creado_en,
    'expira_en',         v_r.expira_en,
    'cliente_nombre',    v_nombre,
    'cliente_apellido',  v_apellido,
    'cliente_telefono',  v_telefono,
    'entrega',           v_r.entrega,
    'envio_empresa',     v_r.envio_empresa,
    'envio_agencia',     v_r.envio_agencia,
    'envio_direccion',   v_r.envio_direccion,
    'pago_metodo',       v_r.pago_metodo,
    'pago_referencia',   v_r.pago_referencia,
    'pago_fecha',        v_r.pago_fecha,
    'pago_reportado_en', v_r.pago_reportado_en,
    'piezas',            v_r.piezas,
    'subtotal_usd',      v_r.subtotal_usd,
    'descuento_pct',     v_r.descuento_pct,
    'total_usd',         v_r.total_usd,
    'items',             v_items,
    -- Nuevas.
    'fase',              fase_pedido(v_r.id),
    'con_precio',        pedido_con_precio(v_r.id),
    'vence_apartado_en', v_r.vence_apartado_en,
    'falta_bcv',         falta_pedido_bcv(v_r.id),
    'inicial_pct',       v_pct,
    'minimo_bcv',        round(v_r.total_usd * v_pct / 100, 4),
    'apartado_dias',     (select valor from configuracion where clave = 'apartado_dias'),
    'abonos',            v_abonos);
end;
$fn$;

revoke all on function ver_reserva(uuid) from public;
grant execute on function ver_reserva(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 18. EL RESPALDO LLEVA LO QUE FALTABA
-- La de esquema-respaldo.sql. Las tablas de dinero que no se leen en
-- crudo (abonos, la caja, los revendedores) se respaldaban por ninguna
-- parte. Sigue siendo una lista escrita a mano, y sin las sesiones de los
-- revendedores, que son llaves.
-- ---------------------------------------------------------------------

create or replace function admin_respaldo(p_tabla text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_filas jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede sacar un respaldo.';
  end if;
  if p_tabla not in ('modelos', 'lotes', 'venta_items',
                     'abonos', 'abono_cambios', 'caja_movimientos',
                     'revendedores', 'revendedor_precios', 'revendedor_clientes',
                     'apartados', 'apartado_items', 'apartado_abonos') then
    raise exception 'Esa tabla no esta en la lista del respaldo: %', p_tabla;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %I t', p_tabla)
     into v_filas;
  return v_filas;
end;
$fn$;

revoke all on function admin_respaldo(text) from public, anon;
grant execute on function admin_respaldo(text) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN (en el SQL Editor, después de correrlo)
--
-- 1. Las dos cifras nuevas:
--      select clave, valor from configuracion where clave like 'apartado_%';
--      -> apartado_dias 15, apartado_inicial_pct 40
--
-- 2. Ningún abono de antes cambió lo que suma la caja. Compara con lo que
--    decía la pantalla Caja del mes antes de correr el archivo:
--      select sum(bcv) from caja_flujo(date_trunc('month', now())::date, current_date);
--      (con sesión de administrador, por admin_caja_por_metodo)
--
-- 3. Un pedido de $10 BCV desde el catálogo: la clienta reporta $4 por
--    pago móvil -> "apartado", vence en 15 días; en Pedidos sale con
--    "Faltan $6,00 BCV". Verifica ese pago, carga $6 en efectivo y
--    entrega: la venta sale por $10 BCV y la caja cuenta $4 el día del
--    reporte y $6 el día de la entrega, no $20.
--
-- 4. Esto TIENE QUE FALLAR con sesión de vendedora (en la consola):
--      supabase.from('reserva_items').update({precio_usd: 0.01}).eq('id', 1)
-- =====================================================================
