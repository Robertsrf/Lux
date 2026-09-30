-- =====================================================================
-- Lux by Emory — el pedido del revendedor, en dos plazos
-- Ejecutar en el SQL Editor DESPUÉS de esquema-abonos-y-apartados.sql
--
-- LO QUE DECIDIÓ EL DUEÑO (30/09/2026)
--
--   1. Su clienta pide por el catálogo de él y las piezas se apartan
--      2 horas (`revendedor_horas_pago`) mientras le paga A ÉL, a su
--      pago móvil, que él pone en su panel.
--   2. Cuando ella reporta su pago, las piezas siguen apartadas hasta que
--      él lo confirme (sin límite: el dueño lo eligió así, para que la
--      clienta que ya pagó no pierda sus piezas; el tope de él limita
--      cuánto puede tener así).
--   3. Al confirmar, el pedido llega a la tienda con la etiqueta del
--      revendedor, lo que él le debe a Lux y los datos de su clienta, y él
--      tiene 1 día (`revendedor_horas_para_pagar`) para pagarle a Lux,
--      en uno o varios pagos, con su referencia.
--   4. La tienda comprueba el pago y lo APRUEBA: ahí se registra la venta
--      (a nombre de su clienta, que entra al maestro de la tienda), la
--      pieza sale del inventario y queda por entregar al revendedor.
--   5. Apartado para su clienta: paga al menos el 40 % (la misma cifra de
--      la tienda) y él le da el plazo que él fije en su panel
--      (`revendedores.dias_credito`). Es su crédito: a Lux le paga todo en
--      el día igual.
--
-- CÓMO SE LLEVA EL RELOJ
-- `apartados.expira_en` sigue siendo "hasta cuándo aparta", así las
-- quince comprobaciones que ya lo miraban (el tope, lo apartado, Pedidos)
-- siguen bien sin tocarlas. Solo cambia quién lo mueve, `apartado_al_dia`:
--
--   esperando pago   creado + 2 h                   (`plazo_pago_en`)
--   por confirmar    infinito, hasta que él confirme o diga que no llegó
--   por pagar a Lux  confirmado + 24 h              (`plazo_lux_en`)
--   en revisión      infinito, si lo que reportó cubre todo, hasta que
--                    la tienda apruebe o diga que no llegó
--
-- Si se le pasa el día con un pago parcial, el pedido vence y las piezas
-- vuelven: lo que pagó queda en Pedidos para que el administrador decida
-- si se devuelve. Pagar un centavo no aparta para siempre.
--
-- Lo que reportan sin sesión (su clienta, y él a Lux) es un aviso hasta
-- que alguien lo confirma: no entra a la caja de la tienda sin verificar.
--
-- Firmas de lo que ya existía: las mismas. `cobrar_apartado` sigue viva
-- para el navegador viejo y pasa por la misma aprobación.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LAS CIFRAS DEL DUEÑO
-- ---------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion) values
  ('revendedor_horas_pago',       2,  'Horas que espera el pedido de su catálogo a que su clienta le pague'),
  ('revendedor_horas_para_pagar', 24, 'Horas que tiene el revendedor, desde que confirma, para pagarle a Lux')
on conflict (clave) do nothing;

update configuracion
   set descripcion = 'Ya no se usa: ver revendedor_horas_pago y revendedor_horas_para_pagar'
 where clave = 'revendedor_dias_apartado';


-- ---------------------------------------------------------------------
-- 2. LAS COLUMNAS NUEVAS
-- ---------------------------------------------------------------------

alter table revendedores add column if not exists pago_movil_cedula   text;
alter table revendedores add column if not exists pago_movil_telefono text;
alter table revendedores add column if not exists pago_movil_banco    text;
alter table revendedores add column if not exists dias_credito        int;

do $bloque$
begin
  if not exists (select 1 from pg_constraint where conname = 'revendedores_dias_credito') then
    alter table revendedores add constraint revendedores_dias_credito check (dias_credito is null or dias_credito > 0);
  end if;
end
$bloque$;

comment on column revendedores.dias_credito is 'Días que él le da a su clienta para terminar de pagarle un apartado. Sin valor: no ofrece apartado.';

alter table apartados add column if not exists origen             text not null default 'catalogo';
alter table apartados add column if not exists plazo_pago_en      timestamptz;
alter table apartados add column if not exists reportado_en       timestamptz;
alter table apartados add column if not exists confirmado_en      timestamptz;
alter table apartados add column if not exists plazo_lux_en       timestamptz;
alter table apartados add column if not exists vence_clienta_en   timestamptz;
alter table apartados add column if not exists cliente_maestro_id bigint references clientes(id) on delete set null;
alter table apartados add column if not exists entregado_en       timestamptz;
alter table apartados add column if not exists entregado_por      uuid references perfiles(id);

do $bloque$
begin
  if not exists (select 1 from pg_constraint where conname = 'apartados_origen_valido') then
    alter table apartados add constraint apartados_origen_valido check (origen in ('catalogo', 'panel'));
  end if;
end
$bloque$;

comment on column apartados.expira_en is
  'Hasta cuándo aparta, según la fase: lo mueve apartado_al_dia(). Infinito mientras espera que alguien confirme un pago.';

alter table apartado_abonos add column if not exists origen         text not null default 'revendedor';
alter table apartado_abonos add column if not exists confirmado_en  timestamptz;
alter table apartado_abonos add column if not exists anulado_en     timestamptz;
alter table apartado_abonos add column if not exists anulado_motivo text;
alter table apartado_abonos add column if not exists pago_fecha     date;
alter table apartado_abonos add column if not exists pago_cedula    text;
alter table apartado_abonos add column if not exists pago_telefono  text;

do $bloque$
begin
  if not exists (select 1 from pg_constraint where conname = 'apartado_abonos_origen_valido') then
    alter table apartado_abonos add constraint apartado_abonos_origen_valido check (origen in ('revendedor', 'clienta'));
  end if;
end
$bloque$;

-- Los de antes los cargó él: confirmados.
update apartado_abonos set confirmado_en = fecha where confirmado_en is null and origen = 'revendedor';

alter table clientes add column if not exists revendedor_id bigint references revendedores(id);
comment on column clientes.revendedor_id is 'Llegó como clienta de este revendedor. Null: clienta de la tienda.';

-- Los apartados de antes (sin `plazo_pago_en`) ya eran pedidos que él
-- retiraba pagando: quedan confirmados, con el plazo que tenían para
-- pagarle a Lux. Los retirados, entregados el día que se retiraron. Una
-- sola vez: los nuevos siempre traen `plazo_pago_en`.
update apartados
   set plazo_pago_en = creado_en,
       confirmado_en = coalesce(confirmado_en, creado_en),
       plazo_lux_en  = coalesce(plazo_lux_en, expira_en),
       entregado_en  = case when estado = 'retirado' then coalesce(entregado_en, retirado_en) end
 where plazo_pago_en is null;

create index if not exists apartados_confirmados_idx on apartados (confirmado_en) where estado = 'abierto';


-- ---------------------------------------------------------------------
-- 3. LAS CUENTAS Y LA FASE
-- ---------------------------------------------------------------------

-- Lo que le falta a su clienta por pagarle a ÉL. La de
-- esquema-revendedores.sql, menos lo anulado ("no llegó").
create or replace function rv_falta_de(p_apartado_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case when x.falta < 0.005 then 0 else round(x.falta, 4) end
    from (
      select coalesce((select sum(i.precio_clienta_usd * i.cantidad)
                         from apartado_items i where i.apartado_id = p_apartado_id), 0)
           - coalesce((select sum(b.monto_bcv)
                         from apartado_abonos b
                        where b.apartado_id = p_apartado_id and b.anulado_en is null), 0) as falta
    ) x;
$fn$;

revoke all on function rv_falta_de(bigint) from public, anon, authenticated;

-- En qué va un pedido de revendedor. Una sola regla.
create or replace function rv_fase_de(p_apartado_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when a.estado = 'cancelado'                      then 'cancelado'
           when a.estado = 'retirado' and a.entregado_en is not null then 'entregado'
           when a.estado = 'retirado'                       then 'vendido'
           when a.expira_en <= now()                        then 'vencido'
           when a.confirmado_en is null and a.expira_en = 'infinity' then 'por_confirmar'
           when a.confirmado_en is null                     then 'esperando_pago'
           when a.expira_en = 'infinity'                    then 'en_revision'
           else 'por_pagar_lux'
         end
    from apartados a
   where a.id = p_apartado_id;
$fn$;

revoke all on function rv_fase_de(bigint) from public, anon;
grant execute on function rv_fase_de(bigint) to authenticated;

-- El reloj al día, según la fase. Se llama después de cada pago,
-- confirmación o anulación.
create or replace function apartado_al_dia(p_apartado_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a apartados%rowtype;
begin
  select * into a from apartados where id = p_apartado_id;
  if not found or a.estado <> 'abierto' or a.cerrado_en is not null then
    return;
  end if;

  if a.confirmado_en is null then
    update apartados
       set expira_en = case
                         when exists (select 1 from apartado_abonos b
                                       where b.apartado_id = a.id and b.anulado_en is null and b.confirmado_en is null)
                           then 'infinity'::timestamptz
                         else a.plazo_pago_en
                       end
     where id = a.id;
  else
    update apartados
       set expira_en = case
                         when saldo_padre_bcv(null, null, a.id) < 0.005 then 'infinity'::timestamptz
                         else a.plazo_lux_en
                       end
     where id = a.id;
  end if;
end;
$fn$;

revoke all on function apartado_al_dia(bigint) from public, anon, authenticated;

-- La de esquema-abonos-y-apartados.sql, más el apartado del revendedor.
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
  if a.apartado_id is not null and a.venta_id is null then
    perform apartado_al_dia(a.apartado_id);
  end if;
  if a.venta_id is not null and falta_bcv_de(a.venta_id) > 0 then
    update ventas
       set por_verificar = true, verificada_en = null, verificada_por = null
     where id = a.venta_id and not por_verificar and not anulada;
  end if;
end;
$fn$;

revoke all on function refrescar_padre(bigint) from public, anon, authenticated;

-- Por dentro: lo que su clienta le pagó a él, con cuánto le faltaba
-- después de cada pago. El único sitio de esa cuenta.
create or replace view apartado_abonos_saldo
with (security_invoker = off) as
select
  b.id,
  case when b.anulado_en is null
       then greatest(round(t.total - sum(case when b.anulado_en is null then b.monto_bcv else 0 end)
                       over (partition by b.apartado_id order by b.fecha, b.id
                             rows between unbounded preceding and current row), 4), 0)
  end as falta_despues_bcv
from apartado_abonos b
cross join lateral (
  select coalesce(sum(i.precio_clienta_usd * i.cantidad), 0) as total
    from apartado_items i where i.apartado_id = b.apartado_id
) t;

revoke all on apartado_abonos_saldo from public, anon, authenticated;

-- Por dentro: anota un pago de su clienta a él. Lo usan su panel (lo
-- carga él: confirmado), el enlace de ella (lo reporta ella: aviso) y la
-- venta desde su panel.
create or replace function rv_anotar_de_clienta(
  p_apartado_id   bigint,
  p_origen        text,
  p_metodo        text,
  p_monto         numeric,
  p_referencia    text,
  p_confirmado    boolean,
  p_pago_fecha    date default null,
  p_pago_cedula   text default null,
  p_pago_telefono text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tasa   tasas%rowtype;
  v_metodo metodo_pago;
  m        record;
  v_falta  numeric;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El pago tiene que ser mayor que cero.';
  end if;
  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'La tienda no tiene la tasa del día. Intenta más tarde.';
  end if;
  begin
    v_metodo := nullif(btrim(coalesce(p_metodo, '')), '')::metodo_pago;
  exception when others then
    raise exception 'Esa forma de pago no existe.';
  end;
  if v_metodo is null then
    raise exception 'Falta la forma de pago.';
  end if;

  v_falta := rv_falta_de(p_apartado_id);
  if v_falta <= 0 then
    raise exception 'Ese pedido ya está pagado completo.';
  end if;

  select * into m from montos_de_abono(v_metodo, p_monto, v_tasa.tasa_venta, v_tasa.tasa_bcv);
  if m.bs <= 0 then
    raise exception 'El pago es demasiado chico: no llega a un céntimo.';
  end if;
  if m.bcv > v_falta + margen_de_abono(v_metodo, v_tasa.tasa_venta, v_tasa.tasa_bcv) then
    raise exception 'Ese pago pasa lo que falta. Faltan $% BCV: hoy son Bs %.',
      to_char(v_falta, 'FM999G999G990D00'),
      to_char(round(v_falta * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
  end if;

  insert into apartado_abonos (apartado_id, origen, metodo, monto_bs, monto_usd, monto_bcv,
                               tasa_bcv, tasa_venta, referencia, confirmado_en,
                               pago_fecha, pago_cedula, pago_telefono)
  values (p_apartado_id, p_origen, v_metodo, m.bs, m.usd, m.bcv,
          v_tasa.tasa_bcv, v_tasa.tasa_venta, nullif(btrim(coalesce(p_referencia, '')), ''),
          case when p_confirmado then now() end,
          p_pago_fecha, nullif(btrim(coalesce(p_pago_cedula, '')), ''), nullif(btrim(coalesce(p_pago_telefono, '')), ''));

  return rv_falta_de(p_apartado_id);
end;
$fn$;

revoke all on function rv_anotar_de_clienta(bigint, text, text, numeric, text, boolean, date, text, text)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. APARTAR: DESDE SU CATÁLOGO O DESDE SU PANEL
-- Lo de `rv_apartar` de esquema-revendedores.sql, por dentro y con el
-- reloj de las 2 horas. `rv_apartar` sigue con su firma.
-- ---------------------------------------------------------------------

create or replace function rv_crear_apartado(
  p_revendedor_id bigint,
  p_items         jsonb,
  p_cedula        text,
  p_nombre        text,
  p_apellido      text,
  p_telefono      text,
  p_origen        text
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r           revendedores%rowtype;
  v_cli       revendedor_clientes%rowtype;
  v_ced       text := nullif(btrim(coalesce(p_cedula, '')), '');
  v_nom       text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_ape       text := nullif(btrim(coalesce(p_apellido, '')), '');
  v_tel       text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_desc      numeric;
  v_horas     numeric;
  v_linea     record;
  v_lista     numeric;
  v_lux       numeric;
  v_precio    numeric;
  v_nombre    text;
  v_hay       int;
  v_lineas    jsonb := '[]'::jsonb;
  v_nuevo     numeric := 0;
  v_tope      record;
  v_id        bigint;
begin
  select * into r from revendedores where id = p_revendedor_id for update;   -- el tope, de a uno
  if not found or not r.activo then
    raise exception 'Este catálogo no está disponible.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No elegiste ninguna pieza.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
              where coalesce((x->>'cantidad')::int, 0) <= 0) then
    raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
  end if;

  if v_ced is null then raise exception 'Falta la cédula.'; end if;
  if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cédula está incompleta.';
  end if;

  select * into v_cli
    from revendedor_clientes
   where revendedor_id = r.id
     and cedula_digitos = regexp_replace(v_ced, '[^0-9]', '', 'g');

  if found then
    v_nom := coalesce(v_nom, nullif(btrim(v_cli.nombre), ''));
    v_ape := coalesce(v_ape, nullif(btrim(coalesce(v_cli.apellido, '')), ''));
    if v_tel is null and length(regexp_replace(coalesce(v_cli.telefono, ''), '[^0-9]', '', 'g')) >= 10 then
      v_tel := btrim(v_cli.telefono);
    end if;
  end if;

  if v_nom is null then raise exception 'Falta el nombre.'; end if;
  if v_ape is null then raise exception 'Falta el apellido.'; end if;
  if v_tel is null then raise exception 'Falta el número de teléfono.'; end if;
  if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
    raise exception 'Ese teléfono está incompleto. Escríbelo con el código, por ejemplo 0412 1234567.';
  end if;

  if v_cli.id is null then
    insert into revendedor_clientes (revendedor_id, nombre, apellido, cedula, telefono)
    values (r.id, v_nom, v_ape, v_ced, v_tel)
    returning * into v_cli;
  else
    update revendedor_clientes
       set apellido = coalesce(nullif(btrim(coalesce(apellido, '')), ''), v_ape),
           telefono = case when length(regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g')) >= 10
                           then telefono else v_tel end
     where id = v_cli.id;
  end if;

  v_horas := config_requerida('revendedor_horas_pago');
  v_desc  := rv_descuento_de(r.id);

  for v_linea in
    select (x->>'modelo_id')::bigint as modelo_id
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    perform pg_advisory_xact_lock(v_linea.modelo_id);
    perform 1 from existencias where modelo_id = v_linea.modelo_id for update;
  end loop;

  for v_linea in
    select (x->>'modelo_id')::bigint as modelo_id, sum((x->>'cantidad')::int)::int as cantidad
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    select m.nombre || coalesce(' · ' || m.variante, ''), coalesce(m.precio_override_usd, g.precio_usd)
      into v_nombre, v_lista
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_linea.modelo_id and m.activo;
    if not found or v_lista is null then
      raise exception 'Una de las piezas que elegiste ya no está disponible.';
    end if;

    v_lux := rv_precio_lux(v_linea.modelo_id, v_desc);
    if v_lux is null or v_lux >= v_lista then
      raise exception '"%" no está en este catálogo.', v_nombre;
    end if;

    select coalesce(sum(e.cantidad), 0) - apartadas_de(v_linea.modelo_id)
      into v_hay
      from existencias e
     where e.modelo_id = v_linea.modelo_id;
    if v_linea.cantidad > v_hay then
      raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, greatest(v_hay, 0), v_linea.cantidad;
    end if;

    select rv_precio_clienta(rp.precio_usd, v_lista)
      into v_precio
      from (select 1) uno
      left join revendedor_precios rp on rp.revendedor_id = r.id and rp.modelo_id = v_linea.modelo_id;

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'modelo_id', v_linea.modelo_id, 'cantidad', v_linea.cantidad,
      'lista', v_lista, 'lux', v_lux, 'precio', v_precio));
    v_nuevo := v_nuevo + v_lux * v_linea.cantidad;
  end loop;

  select * into v_tope from rv_tope(r.id);
  if v_tope.usado_usd + v_nuevo > v_tope.tope_usd + 0.005 then
    raise exception 'Por ahora no se pueden apartar más piezas en este catálogo. Escríbele a % para apartarlas.',
      split_part(btrim(r.nombre), ' ', 1);
  end if;

  insert into apartados (revendedor_id, cliente_id, expira_en, plazo_pago_en, origen)
  values (r.id, v_cli.id, now() + make_interval(hours => v_horas::int),
          now() + make_interval(hours => v_horas::int), p_origen)
  returning id into v_id;

  insert into apartado_items (apartado_id, modelo_id, cantidad, precio_lista_usd, precio_lux_usd, precio_clienta_usd)
  select v_id, l.modelo_id, l.cantidad, l.lista, l.lux, l.precio
    from jsonb_to_recordset(v_lineas)
      as l(modelo_id bigint, cantidad int, lista numeric, lux numeric, precio numeric);

  return v_id;
end;
$fn$;

revoke all on function rv_crear_apartado(bigint, jsonb, text, text, text, text, text) from public, anon, authenticated;

-- Su clienta, desde el catálogo. Misma firma de siempre.
create or replace function rv_apartar(
  p_usuario  text,
  p_items    jsonb,
  p_cedula   text,
  p_nombre   text default null,
  p_apellido text default null,
  p_telefono text default null
) returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_rv bigint;
  v_id bigint;
begin
  select id into v_rv from revendedores where usuario = lower(btrim(coalesce(p_usuario, ''))) and activo;
  if not found then
    raise exception 'Este catálogo no está disponible.';
  end if;
  v_id := rv_crear_apartado(v_rv, p_items, p_cedula, p_nombre, p_apellido, p_telefono, 'catalogo');
  return (select token from apartados where id = v_id);
end;
$fn$;

revoke all on function rv_apartar(text, jsonb, text, text, text, text) from public;
grant execute on function rv_apartar(text, jsonb, text, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. LO QUE VE SU CLIENTA, SIN SESIÓN
-- ---------------------------------------------------------------------

-- La de esquema-revendedores.sql, y al final su pago móvil y las reglas
-- del pedido. `dias_apartado` se queda para el navegador viejo, en cero:
-- los 15 días ya no existen, y cero le hace decir "unos días".
create or replace function rv_perfil_publico(p_usuario text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'usuario',             r.usuario,
    'nombre',              r.nombre,
    'catalogo_nombre',     coalesce(r.catalogo_nombre, r.nombre),
    'telefono',            r.telefono,
    'paleta',              r.paleta,
    'logo_path',           r.logo_path,
    'dias_apartado',       0,
    'pago_movil_cedula',   r.pago_movil_cedula,
    'pago_movil_telefono', r.pago_movil_telefono,
    'pago_movil_banco',    r.pago_movil_banco,
    'dias_credito',        r.dias_credito,
    'horas_pago',          (select valor from configuracion where clave = 'revendedor_horas_pago'),
    'inicial_pct',         (select valor from configuracion where clave = 'apartado_inicial_pct'))
    from revendedores r
   where r.usuario = lower(btrim(coalesce(p_usuario, ''))) and r.activo;
$fn$;

revoke all on function rv_perfil_publico(text) from public;
grant execute on function rv_perfil_publico(text) to anon, authenticated;

-- La página de su pedido: la de esquema-revendedores.sql, y al final la
-- fase, su pago móvil, lo que ha pagado (de la referencia, los cuatro
-- últimos) y el apartado. Nada de lo que él le paga a Lux.
create or replace function rv_ver_apartado(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  a   apartados%rowtype;
  r   revendedores%rowtype;
  c   revendedor_clientes%rowtype;
  v_total numeric;
  v_pct   numeric;
begin
  select * into a from apartados where token = p_token;
  if not found then
    return null;
  end if;
  select * into r from revendedores where id = a.revendedor_id;
  select * into c from revendedor_clientes where id = a.cliente_id;
  select coalesce(sum(i.precio_clienta_usd * i.cantidad), 0) into v_total
    from apartado_items i where i.apartado_id = a.id;
  select valor into v_pct from configuracion where clave = 'apartado_inicial_pct';

  return jsonb_build_object(
    'usuario',         r.usuario,
    'catalogo_nombre', coalesce(r.catalogo_nombre, r.nombre),
    'revendedor',      split_part(btrim(r.nombre), ' ', 1),
    'telefono',        r.telefono,
    'paleta',          r.paleta,
    'logo_path',       r.logo_path,
    'estado',          case when a.estado = 'abierto' and a.expira_en <= now() then 'vencido' else a.estado end,
    'creado_en',       a.creado_en,
    'expira_en',       case when a.expira_en = 'infinity' then null else a.expira_en end,
    'clienta',         split_part(btrim(c.nombre), ' ', 1),
    'items',           (select jsonb_agg(jsonb_build_object(
                                 'nombre', m.nombre, 'variante', m.variante,
                                 'foto_thumb_path', m.foto_thumb_path,
                                 'cantidad', i.cantidad, 'precio_usd', i.precio_clienta_usd)
                               order by m.nombre)
                          from apartado_items i join modelos m on m.id = i.modelo_id
                         where i.apartado_id = a.id),
    'total_usd',       v_total,
    'falta_usd',       rv_falta_de(a.id),
    -- Nuevas.
    'fase',            rv_fase_de(a.id),
    'confirmado_en',   a.confirmado_en,
    'vence_clienta_en', a.vence_clienta_en,
    'pago_movil_cedula',   r.pago_movil_cedula,
    'pago_movil_telefono', r.pago_movil_telefono,
    'pago_movil_banco',    r.pago_movil_banco,
    'dias_credito',    r.dias_credito,
    'inicial_pct',     v_pct,
    'minimo_usd',      round(v_total * v_pct / 100, 4),
    'abonos',          coalesce((select jsonb_agg(jsonb_build_object(
                                   'fecha', b.fecha, 'metodo', b.metodo,
                                   'monto_bs', b.monto_bs, 'monto_usd', b.monto_usd,
                                   'monto_bcv', round(b.monto_bcv, 4),
                                   'referencia_final', right(b.referencia, 4),
                                   'estado', case when b.anulado_en is not null then 'no_llego'
                                                  when b.confirmado_en is not null then 'recibido'
                                                  else 'por_revisar' end,
                                   'falta_despues_bcv', s.falta_despues_bcv) order by b.fecha, b.id)
                                  from apartado_abonos b
                                  join apartado_abonos_saldo s on s.id = b.id
                                 where b.apartado_id = a.id), '[]'::jsonb));
end;
$fn$;

revoke all on function rv_ver_apartado(uuid) from public;
grant execute on function rv_ver_apartado(uuid) to anon, authenticated;

-- Ella reporta que le pagó. Mientras él no lo confirme, es un aviso: las
-- piezas siguen apartadas (así lo decidió el dueño) y él decide si llegó.
create or replace function rv_reportar_pago(
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
  a        apartados%rowtype;
  v_ref    text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_ced    text := nullif(btrim(coalesce(p_cedula, '')), '');
  v_tel    text := nullif(btrim(coalesce(p_telefono, '')), '');
begin
  select * into a from apartados where token = p_token for update;
  if not found then
    raise exception 'Ese pedido no existe o el enlace está mal copiado.';
  end if;
  if not exists (select 1 from revendedores where id = a.revendedor_id and activo) then
    raise exception 'Este catálogo no está disponible.';
  end if;
  if a.estado = 'cancelado' then
    raise exception 'Ese pedido está cancelado.';
  end if;
  if a.estado = 'abierto' and a.expira_en <= now() then
    raise exception 'Ese pedido ya venció. Si ya pagaste, escríbele por WhatsApp.';
  end if;

  if p_metodo in ('efectivo_bs', 'efectivo_usd', 'punto') then
    raise exception 'El efectivo se lo das en persona: él lo anota.';
  end if;
  if v_ref is null then raise exception 'Falta el número de referencia del pago.'; end if;
  if p_fecha is null then raise exception 'Falta la fecha del pago.'; end if;
  if p_fecha > current_date then raise exception 'Esa fecha de pago es de mañana. Revísala.'; end if;
  if p_fecha < current_date - 30 then raise exception 'Esa fecha de pago tiene más de un mes. Revísala.'; end if;
  if p_metodo in ('pago_movil', 'transferencia') then
    if v_ced is null or length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
      raise exception 'Falta la cédula completa de quien pagó.';
    end if;
    if v_tel is null or length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
      raise exception 'Falta el teléfono completo de quien pagó.';
    end if;
  end if;

  -- Un freno técnico, no una cifra del negocio.
  if (select count(*) from apartado_abonos
       where apartado_id = a.id and anulado_en is null and confirmado_en is null) >= 5 then
    raise exception 'Ya reportaste varios pagos que todavía no se revisan. Escríbele por WhatsApp.';
  end if;

  perform rv_anotar_de_clienta(a.id, 'clienta', p_metodo, p_monto, v_ref, false, p_fecha, v_ced, v_tel);

  if a.confirmado_en is null then
    update apartados set reportado_en = coalesce(reportado_en, now()) where id = a.id;
  end if;
  perform apartado_al_dia(a.id);

  return jsonb_build_object('fase', rv_fase_de(a.id), 'falta_usd', rv_falta_de(a.id));
end;
$fn$;

revoke all on function rv_reportar_pago(uuid, text, numeric, text, date, text, text) from public;
grant execute on function rv_reportar_pago(uuid, text, numeric, text, date, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. SU PANEL: CONFIRMAR, PAGARLE A LUX, VENDER
-- Todas empiezan por `rv_de_sesion(p_sesion)`.
-- ---------------------------------------------------------------------

-- Por dentro: confirmar el pago de su clienta. Confirma lo que ella
-- reportó, exige el mínimo, y le corre su día para pagarle a Lux.
create or replace function rv_confirmar_de(p_revendedor_id bigint, p_apartado_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a        apartados%rowtype;
  r        revendedores%rowtype;
  v_total  numeric;
  v_pagado numeric;
  v_minimo numeric;
  v_horas  numeric;
begin
  select * into a from apartados where id = p_apartado_id and revendedor_id = p_revendedor_id for update;
  if not found then
    raise exception 'No encuentro ese pedido.';
  end if;
  if a.estado <> 'abierto' or a.cerrado_en is not null then
    raise exception 'Ese pedido ya no está abierto.';
  end if;
  if a.confirmado_en is not null then
    raise exception 'Ese pedido ya está confirmado.';
  end if;
  if a.expira_en <= now() then
    raise exception 'Ese pedido ya venció: las piezas volvieron a la tienda.';
  end if;
  select * into r from revendedores where id = p_revendedor_id;

  update apartado_abonos
     set confirmado_en = now()
   where apartado_id = a.id and anulado_en is null and confirmado_en is null;

  select coalesce(sum(i.precio_clienta_usd * i.cantidad), 0) into v_total
    from apartado_items i where i.apartado_id = a.id;
  select coalesce(sum(b.monto_bcv), 0) into v_pagado
    from apartado_abonos b where b.apartado_id = a.id and b.anulado_en is null;
  v_minimo := v_total * config_requerida('apartado_inicial_pct') / 100;

  if v_pagado < v_minimo - 0.005 then
    raise exception 'Para confirmar, tu clienta tiene que haberte pagado al menos el % %%: $% BCV. Lleva $% BCV.',
      to_char(config_requerida('apartado_inicial_pct'), 'FM990'),
      to_char(v_minimo, 'FM999G999G990D00'), to_char(v_pagado, 'FM999G999G990D00');
  end if;
  if v_pagado < v_total - 0.005 and r.dias_credito is null then
    raise exception 'Tu clienta no te pagó completo. Para darle crédito, pon tus días de crédito en "Mi catálogo".';
  end if;

  v_horas := config_requerida('revendedor_horas_para_pagar');
  update apartados
     set confirmado_en    = now(),
         plazo_lux_en     = now() + make_interval(hours => v_horas::int),
         vence_clienta_en = case when v_pagado < v_total - 0.005
                                 then now() + make_interval(days => r.dias_credito) end
   where id = a.id;

  perform apartado_al_dia(a.id);
end;
$fn$;

revoke all on function rv_confirmar_de(bigint, bigint) from public, anon, authenticated;

create or replace function rv_confirmar(p_sesion text, p_apartado_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
begin
  perform rv_confirmar_de(v_id, p_apartado_id);
  return jsonb_build_object('fase', rv_fase_de(p_apartado_id));
end;
$fn$;

revoke all on function rv_confirmar(text, bigint) from public;
grant execute on function rv_confirmar(text, bigint) to anon, authenticated;

-- Un pago que ella reportó, uno por uno: le llegó, o no le llegó.
create or replace function rv_revisar_pago(p_sesion text, p_abono_id bigint, p_llego boolean, p_motivo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
  b    apartado_abonos%rowtype;
begin
  select b2.* into b
    from apartado_abonos b2
    join apartados a on a.id = b2.apartado_id
   where b2.id = p_abono_id and a.revendedor_id = v_id
     for update of b2;
  if not found then
    raise exception 'No encuentro ese pago.';
  end if;
  if b.anulado_en is not null then
    raise exception 'Ese pago ya está marcado como que no llegó.';
  end if;
  perform 1 from apartados where id = b.apartado_id for update;

  if coalesce(p_llego, false) then
    update apartado_abonos set confirmado_en = coalesce(confirmado_en, now()) where id = b.id;
  else
    update apartado_abonos
       set anulado_en = now(),
           anulado_motivo = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'no llegó')
     where id = b.id;
  end if;

  perform apartado_al_dia(b.apartado_id);
  return jsonb_build_object('fase', rv_fase_de(b.apartado_id), 'falta_usd', rv_falta_de(b.apartado_id));
end;
$fn$;

revoke all on function rv_revisar_pago(text, bigint, boolean, text) from public;
grant execute on function rv_revisar_pago(text, bigint, boolean, text) to anon, authenticated;

-- Un pago de su clienta que carga él (ya lo tiene en la mano o en su
-- banco): confirmado de una vez. La de esquema-revendedores.sql, misma
-- firma: en un pedido abierto, o en uno ya vendido si le fió la pieza.
create or replace function rv_abonar(
  p_sesion      text,
  p_apartado_id bigint,
  p_metodo      text,
  p_monto       numeric,
  p_referencia  text default null
) returns numeric
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id    bigint := rv_de_sesion(p_sesion);
  a       apartados%rowtype;
  v_falta numeric;
begin
  select * into a from apartados where id = p_apartado_id and revendedor_id = v_id for update;
  if not found then
    raise exception 'No encuentro ese pedido.';
  end if;
  if a.estado = 'cancelado' then
    raise exception 'Ese pedido está cancelado: ya no lleva pagos.';
  end if;
  if a.estado = 'abierto' and a.expira_en <= now() then
    raise exception 'Ese pedido venció: las piezas volvieron a la tienda.';
  end if;

  v_falta := rv_anotar_de_clienta(a.id, 'revendedor', p_metodo, p_monto, p_referencia, true);
  perform apartado_al_dia(a.id);
  return v_falta;
end;
$fn$;

revoke all on function rv_abonar(text, bigint, text, numeric, text) from public;
grant execute on function rv_abonar(text, bigint, text, numeric, text) to anon, authenticated;

-- Él le paga a Lux: un aviso con su referencia, que la tienda comprueba.
-- Puede ser en varios pagos (el pago móvil tiene límite). Si lo que
-- reportó cubre todo, el pedido espera la aprobación sin vencer.
create or replace function rv_pagar_lux(
  p_sesion      text,
  p_apartado_id bigint,
  p_metodo      text,
  p_monto       numeric,
  p_referencia  text,
  p_fecha       date
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id    bigint := rv_de_sesion(p_sesion);
  a       apartados%rowtype;
  v_falta numeric;
begin
  select * into a from apartados where id = p_apartado_id and revendedor_id = v_id for update;
  if not found then
    raise exception 'No encuentro ese pedido.';
  end if;
  if a.estado <> 'abierto' or a.cerrado_en is not null then
    raise exception 'Ese pedido ya no está abierto.';
  end if;
  if a.confirmado_en is null then
    raise exception 'Primero confirma el pago de tu clienta.';
  end if;
  if a.expira_en <= now() then
    raise exception 'Se te pasó el plazo para pagarle a Lux: escríbele a la tienda.';
  end if;
  if p_metodo in ('efectivo_bs', 'efectivo_usd', 'punto') then
    raise exception 'Si pagas en efectivo o con punto, lo anotan en la tienda.';
  end if;
  if nullif(btrim(coalesce(p_referencia, '')), '') is null then
    raise exception 'Falta el número de referencia del pago.';
  end if;
  if p_fecha is null or p_fecha > current_date or p_fecha < current_date - 30 then
    raise exception 'Revisa la fecha del pago.';
  end if;
  if (select count(*) from abonos
       where apartado_id = a.id and anulado_en is null and verificado_en is null) >= 5 then
    raise exception 'Ya reportaste varios pagos que la tienda todavía no revisa.';
  end if;

  v_falta := saldo_padre_bcv(null, null, a.id);
  if v_falta < 0.005 then
    raise exception 'Ya le reportaste a Lux todo lo de este pedido: falta que la tienda lo apruebe.';
  end if;

  perform anotar_abono_en(null, null, a.id, 'revendedor', p_metodo, p_monto, p_referencia,
                          false, v_falta, p_fecha);
  perform apartado_al_dia(a.id);

  return jsonb_build_object('fase', rv_fase_de(a.id),
                            'falta_lux_usd', greatest(round(saldo_padre_bcv(null, null, a.id), 4), 0));
end;
$fn$;

revoke all on function rv_pagar_lux(text, bigint, text, numeric, text, date) from public;
grant execute on function rv_pagar_lux(text, bigint, text, numeric, text, date) to anon, authenticated;

-- Vender desde su panel: arma el pedido él, para una clienta suya. Si ya
-- le pagó, lo anota y lo confirma en el mismo paso; si no, espera las
-- 2 horas como uno del catálogo, y él le manda el enlace.
create or replace function rv_vender(
  p_sesion   text,
  p_items    jsonb,
  p_cedula   text,
  p_nombre   text  default null,
  p_apellido text  default null,
  p_telefono text  default null,
  p_pago     jsonb default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id  bigint := rv_de_sesion(p_sesion);
  v_ap  bigint;
begin
  v_ap := rv_crear_apartado(v_id, p_items, p_cedula, p_nombre, p_apellido, p_telefono, 'panel');

  if p_pago is not null and jsonb_typeof(p_pago) = 'object' then
    perform rv_anotar_de_clienta(v_ap, 'revendedor', p_pago->>'metodo',
                                 nullif(p_pago->>'monto', '')::numeric, p_pago->>'referencia', true);
    perform rv_confirmar_de(v_id, v_ap);
  end if;

  return jsonb_build_object('id', v_ap,
                            'token', (select token from apartados where id = v_ap),
                            'fase', rv_fase_de(v_ap));
end;
$fn$;

revoke all on function rv_vender(text, jsonb, text, text, text, text, jsonb) from public;
grant execute on function rv_vender(text, jsonb, text, text, text, text, jsonb) to anon, authenticated;

-- Soltar un pedido antes de que venza: la de esquema-revendedores.sql,
-- misma firma. Si ya le pagó algo a Lux, eso lo resuelve la tienda.
create or replace function rv_cancelar_apartado(p_sesion text, p_apartado_id bigint, p_motivo text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
  a    apartados%rowtype;
begin
  select * into a from apartados where id = p_apartado_id and revendedor_id = v_id for update;
  if not found then
    raise exception 'No encuentro ese pedido.';
  end if;
  if a.estado <> 'abierto' or a.cerrado_en is not null then
    raise exception 'Ese pedido ya no está abierto.';
  end if;
  if a.expira_en <= now() then
    raise exception 'Ese pedido ya venció: las piezas volvieron solas a la tienda.';
  end if;
  if exists (select 1 from abonos where apartado_id = a.id and anulado_en is null) then
    raise exception 'Ya le pagaste algo a Lux por este pedido: para soltarlo, escríbele a la tienda.';
  end if;

  update apartados
     set estado = 'cancelado', cancelado_en = now(), cancelado_por = 'revendedor',
         motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = a.id;
end;
$fn$;

revoke all on function rv_cancelar_apartado(text, bigint, text) from public;
grant execute on function rv_cancelar_apartado(text, bigint, text) to anon, authenticated;

-- Su pago móvil y sus días de crédito. Aparte de `rv_ajustes`, para que
-- el navegador viejo, que no los manda, no los borre al guardar.
create or replace function rv_datos_pago(
  p_sesion       text,
  p_cedula       text,
  p_telefono     text,
  p_banco        text,
  p_dias_credito int
) returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id  bigint := rv_de_sesion(p_sesion);
  v_ced text := nullif(btrim(coalesce(p_cedula, '')), '');
  v_tel text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_ban text := nullif(btrim(coalesce(p_banco, '')), '');
begin
  if v_ced is not null and length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cédula está incompleta.';
  end if;
  if v_tel is not null and length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
    raise exception 'Ese teléfono está incompleto. Escríbelo con el código, por ejemplo 0412 1234567.';
  end if;
  if v_ban is not null and length(v_ban) > 60 then
    raise exception 'El nombre del banco es muy largo.';
  end if;
  if p_dias_credito is not null and p_dias_credito <= 0 then
    raise exception 'Los días de crédito tienen que ser más de cero, o déjalos vacíos si no das crédito.';
  end if;

  update revendedores
     set pago_movil_cedula = v_ced, pago_movil_telefono = v_tel,
         pago_movil_banco = v_ban, dias_credito = p_dias_credito
   where id = v_id;
end;
$fn$;

revoke all on function rv_datos_pago(text, text, text, text, int) from public;
grant execute on function rv_datos_pago(text, text, text, text, int) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. EL TOPE: CUENTAN LOS QUE ÉL DEJÓ VENCER
-- La de esquema-revendedores.sql, misma firma. Lo único distinto: para
-- bajar de nivel cuentan solo los pedidos que él confirmó y no le pagó a
-- Lux a tiempo. Los que su clienta no pagó en 2 horas no son culpa suya.
-- ---------------------------------------------------------------------

create or replace function rv_tope(p_revendedor_id bigint)
returns table (
  nivel                int,
  niveles              int,
  tope_usd             numeric,
  usado_usd            numeric,
  libre_usd            numeric,
  retirado_usd         numeric,
  siguiente_tope_usd   numeric,
  falta_para_subir_usd numeric,
  vencidos_recientes   int,
  bajado               boolean,
  manual               boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_bajar     numeric;
  v_ventana   numeric;
  v_manual    numeric;
  v_retirado  numeric;
  v_usado     numeric;
  v_vencidos  int;
  v_ganado    int;
  v_nivel     int;
  v_siguiente record;
begin
  select valor into v_bajar   from configuracion where clave = 'revendedor_vencidos_para_bajar';
  select valor into v_ventana from configuracion where clave = 'revendedor_dias_ventana';
  v_bajar   := coalesce(v_bajar, 0);
  v_ventana := greatest(coalesce(v_ventana, 0), 0);

  select r.tope_manual_usd into v_manual from revendedores r where r.id = p_revendedor_id;

  select coalesce(sum(i.precio_lux_usd * i.cantidad), 0)
    into v_retirado
    from apartados a
    join apartado_items i on i.apartado_id = a.id
   where a.revendedor_id = p_revendedor_id and a.estado = 'retirado';

  select coalesce(sum(i.precio_lux_usd * i.cantidad), 0)
    into v_usado
    from apartados a
    join apartado_items i on i.apartado_id = a.id
   where a.revendedor_id = p_revendedor_id
     and a.estado = 'abierto' and a.cerrado_en is null and a.expira_en > now();

  select count(*)::int
    into v_vencidos
    from apartados a
   where a.revendedor_id = p_revendedor_id
     and a.estado = 'abierto'
     and a.confirmado_en is not null
     and a.expira_en <= now()
     and a.expira_en > now() - make_interval(days => v_ventana::int);

  select coalesce(max(e.nivel), 1) into v_ganado from rv_escalera() e where e.desde_usd <= v_retirado;
  select count(*)::int into niveles from rv_escalera();

  bajado  := v_bajar > 0 and v_vencidos >= v_bajar and v_ganado > 1;
  v_nivel := case when bajado then v_ganado - 1 else v_ganado end;

  manual             := v_manual is not null;
  usado_usd          := round(v_usado, 2);
  retirado_usd       := round(v_retirado, 2);
  vencidos_recientes := v_vencidos;

  if manual then
    nivel := null;
    tope_usd := v_manual;
    siguiente_tope_usd := null;
    falta_para_subir_usd := null;
  else
    nivel := v_nivel;
    select e.tope_usd into tope_usd from rv_escalera() e where e.nivel = v_nivel;
    select e.tope_usd, e.desde_usd into v_siguiente from rv_escalera() e where e.nivel = v_ganado + 1;
    if v_siguiente.tope_usd is not null and not bajado then
      siguiente_tope_usd := v_siguiente.tope_usd;
      falta_para_subir_usd := round(greatest(v_siguiente.desde_usd - v_retirado, 0), 2);
    else
      siguiente_tope_usd := null;
      falta_para_subir_usd := null;
    end if;
  end if;

  libre_usd := round(greatest(tope_usd - v_usado, 0), 2);
  return next;
end;
$fn$;

revoke all on function rv_tope(bigint) from public, anon;
grant execute on function rv_tope(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 8. LO QUE VE EN SU PANEL
-- ---------------------------------------------------------------------

-- La de esquema-revendedores.sql, mismas claves, y al final lo que tiene
-- en cada fase, sus reglas y su pago móvil. `vencidos` usa la ventana de
-- la configuración (antes decía 30 fijo) y solo los que él dejó vencer.
create or replace function rv_resumen(p_sesion text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id    bigint := rv_de_sesion(p_sesion);
  r       revendedores%rowtype;
  v_tope  record;
  v_mes   jsonb;
  v_meses jsonb;
  v_cred  numeric;
  v_fases jsonb;
  v_vent  numeric;
  v_venc  int;
begin
  select * into r from revendedores where id = v_id;
  select * into v_tope from rv_tope(v_id);
  select valor into v_vent from configuracion where clave = 'revendedor_dias_ventana';

  select jsonb_build_object(
           'piezas',    coalesce(sum(i.cantidad), 0),
           'vendido_usd', coalesce(sum(i.precio_clienta_usd * i.cantidad), 0),
           'pagado_usd',  coalesce(sum(i.precio_lux_usd * i.cantidad), 0),
           'ganancia_usd', coalesce(sum((i.precio_clienta_usd - i.precio_lux_usd) * i.cantidad), 0))
    into v_mes
    from apartados a
    join apartado_items i on i.apartado_id = a.id
   where a.revendedor_id = v_id and a.estado = 'retirado'
     and a.retirado_en >= date_trunc('month', now());

  select jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'piezas', coalesce(x.piezas, 0),
           'vendido_usd', coalesce(x.vendido, 0),
           'ganancia_usd', coalesce(x.ganancia, 0)) order by m.mes)
    into v_meses
    from generate_series(date_trunc('month', now()) - interval '5 months',
                         date_trunc('month', now()), interval '1 month') m(mes)
    left join (
      select date_trunc('month', a.retirado_en) as mes,
             sum(i.cantidad) as piezas,
             sum(i.precio_clienta_usd * i.cantidad) as vendido,
             sum((i.precio_clienta_usd - i.precio_lux_usd) * i.cantidad) as ganancia
        from apartados a
        join apartado_items i on i.apartado_id = a.id
       where a.revendedor_id = v_id and a.estado = 'retirado'
         and a.retirado_en >= date_trunc('month', now()) - interval '5 months'
       group by 1
    ) x on x.mes = m.mes;

  -- Lo que sus clientas le deben: pedidos confirmados vigentes y vendidos.
  select coalesce(sum(rv_falta_de(a.id)), 0)
    into v_cred
    from apartados a
   where a.revendedor_id = v_id
     and (a.estado = 'retirado'
          or (a.estado = 'abierto' and a.confirmado_en is not null and a.expira_en > now()));

  select jsonb_object_agg(f.fase, f.n)
    into v_fases
    from (select rv_fase_de(a.id) as fase, count(*)::int as n
            from apartados a
           where a.revendedor_id = v_id
             and (a.estado = 'abierto' or (a.estado = 'retirado' and a.entregado_en is null))
           group by 1) f;

  select count(*)::int into v_venc
    from apartados a
   where a.revendedor_id = v_id and a.estado = 'abierto' and a.confirmado_en is not null
     and a.expira_en <= now()
     and a.expira_en > now() - make_interval(days => greatest(coalesce(v_vent, 0), 0)::int);

  return jsonb_build_object(
    'usuario',          r.usuario,
    'nombre',           r.nombre,
    'catalogo_nombre',  coalesce(r.catalogo_nombre, r.nombre),
    'catalogo_propio',  r.catalogo_nombre,
    'telefono',         r.telefono,
    'paleta',           r.paleta,
    'logo_path',        r.logo_path,
    'descuento_pct',    rv_descuento_de(v_id),
    'sobre_etiqueta_usd', coalesce((select valor from configuracion where clave = 'revendedor_sobre_etiqueta_usd'), 0),
    'dias_apartado',    0,
    'vencidos_para_bajar', coalesce((select valor from configuracion where clave = 'revendedor_vencidos_para_bajar'), 0),
    'dias_ventana',     coalesce(v_vent, 0),
    'tope',             to_jsonb(v_tope),
    'mes',              v_mes,
    'meses',            v_meses,
    'credito_usd',      round(v_cred, 2),
    'abiertos',         (select count(*)::int from apartados a
                          where a.revendedor_id = v_id and a.estado = 'abierto' and a.expira_en > now()),
    'por_vencer',       coalesce((v_fases->>'por_pagar_lux')::int, 0),
    'vencidos',         v_venc,
    -- Nuevas.
    'fases',            coalesce(v_fases, '{}'::jsonb),
    'horas_pago',       (select valor from configuracion where clave = 'revendedor_horas_pago'),
    'horas_para_pagar', (select valor from configuracion where clave = 'revendedor_horas_para_pagar'),
    'inicial_pct',      (select valor from configuracion where clave = 'apartado_inicial_pct'),
    'dias_credito',     r.dias_credito,
    'pago_movil_cedula',   r.pago_movil_cedula,
    'pago_movil_telefono', r.pago_movil_telefono,
    'pago_movil_banco',    r.pago_movil_banco);
end;
$fn$;

revoke all on function rv_resumen(text) from public;
grant execute on function rv_resumen(text) to anon, authenticated;

-- Sus pedidos. La de esquema-revendedores.sql, mismas claves, y al final
-- la fase, los plazos, los pagos de su clienta con su estado y lo que le
-- ha pagado a Lux. Los cancelados y vencidos ya no se quedan para
-- siempre: solo los que se venden y todavía le deben.
create or replace function rv_apartados(p_sesion text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
begin
  return coalesce((
    select jsonb_agg(fila order by orden, clave)
      from (
        select case when a.estado = 'abierto' and a.expira_en > now() then 0
                    when a.estado = 'retirado' and (a.entregado_en is null or rv_falta_de(a.id) > 0) then 1
                    else 2 end as orden,
               -- Lo que espera que alguien confirme (plazo infinito) va arriba:
               -- es lo que pide atención.
               case when a.estado = 'abierto' and a.expira_en > now()
                    then extract(epoch from case when a.expira_en = 'infinity' then a.creado_en else a.expira_en end)
                    else -extract(epoch from coalesce(a.retirado_en, a.cancelado_en, least(a.expira_en, now()))) end as clave,
               jsonb_build_object(
                 'id',          a.id,
                 'token',       a.token,
                 'estado',      case when a.estado = 'abierto' and a.expira_en <= now() then 'vencido' else a.estado end,
                 'creado_en',   a.creado_en,
                 'expira_en',   case when a.expira_en = 'infinity' then null else a.expira_en end,
                 'retirado_en', a.retirado_en,
                 'cancelado_en', a.cancelado_en,
                 'motivo',      a.motivo,
                 'cliente',     jsonb_build_object('id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
                                                   'telefono', c.telefono, 'cedula', c.cedula),
                 'items',       (select jsonb_agg(jsonb_build_object(
                                          'modelo_id', i.modelo_id, 'sku', m.sku, 'nombre', m.nombre,
                                          'variante', m.variante, 'foto_thumb_path', m.foto_thumb_path,
                                          'cantidad', i.cantidad,
                                          'precio_usd', i.precio_clienta_usd,
                                          'precio_lux_usd', i.precio_lux_usd) order by m.nombre)
                                   from apartado_items i join modelos m on m.id = i.modelo_id
                                  where i.apartado_id = a.id),
                 'total_usd',   t.cliente,
                 'lux_usd',     t.lux,
                 'abonado_usd', coalesce((select sum(b.monto_bcv) from apartado_abonos b
                                           where b.apartado_id = a.id and b.anulado_en is null), 0),
                 'falta_usd',   rv_falta_de(a.id),
                 'abonos',      coalesce((select jsonb_agg(jsonb_build_object(
                                          'id', b.id, 'fecha', b.fecha, 'metodo', b.metodo, 'monto_bs', b.monto_bs,
                                          'monto_usd', b.monto_usd, 'monto_bcv', round(b.monto_bcv, 4),
                                          'referencia', b.referencia, 'origen', b.origen,
                                          'pago_cedula', b.pago_cedula, 'pago_telefono', b.pago_telefono,
                                          'estado', case when b.anulado_en is not null then 'no_llego'
                                                         when b.confirmado_en is not null then 'recibido'
                                                         else 'por_revisar' end,
                                          'falta_despues_bcv', s.falta_despues_bcv) order by b.fecha, b.id)
                                            from apartado_abonos b
                                            join apartado_abonos_saldo s on s.id = b.id
                                           where b.apartado_id = a.id), '[]'::jsonb),
                 -- Nuevas.
                 'fase',          rv_fase_de(a.id),
                 'origen',        a.origen,
                 'reportado_en',  a.reportado_en,
                 'confirmado_en', a.confirmado_en,
                 'plazo_lux_en',  a.plazo_lux_en,
                 'vence_clienta_en', a.vence_clienta_en,
                 'entregado_en',  a.entregado_en,
                 'minimo_usd',    round(t.cliente * (select valor from configuracion where clave = 'apartado_inicial_pct') / 100, 4),
                 'lux_pagado_usd',    round(t.lux - greatest(saldo_padre_bcv(null, null, a.id), 0), 4),
                 'lux_verificado_usd', round(t.lux - greatest(saldo_padre_bcv(null, null, a.id, null, true), 0), 4),
                 'lux_falta_usd',     greatest(round(saldo_padre_bcv(null, null, a.id), 4), 0),
                 'pagos_lux',     coalesce((select jsonb_agg(jsonb_build_object(
                                          'id', x.id, 'fecha', x.fecha, 'metodo', x.metodo,
                                          'monto_bs', x.monto_bs, 'monto_usd', x.monto_usd,
                                          'monto_bcv', round(x.monto_bcv, 4), 'referencia', x.referencia,
                                          'estado', case when x.anulado_en is not null then 'no_llego'
                                                         when x.verificado_en is not null then 'recibido'
                                                         else 'por_revisar' end,
                                          'falta_despues_bcv', xs.falta_despues_bcv) order by x.fecha, x.id)
                                            from abonos x
                                            join abonos_saldo xs on xs.id = x.id
                                           where x.apartado_id = a.id), '[]'::jsonb)
               ) as fila
          from apartados a
          join revendedor_clientes c on c.id = a.cliente_id
          cross join lateral (
            select coalesce(sum(i.precio_clienta_usd * i.cantidad), 0) as cliente,
                   coalesce(sum(i.precio_lux_usd * i.cantidad), 0)     as lux
              from apartado_items i where i.apartado_id = a.id
          ) t
         where a.revendedor_id = v_id
           and ((a.estado = 'abierto' and a.expira_en > now())
                or (a.estado = 'retirado' and (a.entregado_en is null or rv_falta_de(a.id) > 0))
                or coalesce(a.retirado_en, a.cancelado_en, least(a.expira_en, now())) > now() - interval '120 days')
         order by 1, 2
         limit 300
      ) x
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function rv_apartados(text) from public;
grant execute on function rv_apartados(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 9. EN LA TIENDA: LLEGA CONFIRMADO, SE APRUEBA Y SE ENTREGA
-- ---------------------------------------------------------------------

-- Por dentro: la clienta de él, en el maestro de la tienda. Si su cédula
-- ya está, esa es: no se le toca nada (los datos vienen de alguien sin
-- sesión). Si no, nace ahora, con de qué revendedor vino. Lo llama la
-- aprobación, que es cuando alguien de la tienda le cobra.
create or replace function cliente_de_revendedor(p_apartado_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a     apartados%rowtype;
  c     revendedor_clientes%rowtype;
  v_id  bigint;
begin
  select * into a from apartados where id = p_apartado_id;
  if a.cliente_maestro_id is not null then
    return a.cliente_maestro_id;
  end if;
  select * into c from revendedor_clientes where id = a.cliente_id;

  if c.cedula_digitos is not null then
    select id into v_id from clientes where cedula_digitos = c.cedula_digitos;
    if found then
      return v_id;
    end if;
  end if;

  insert into clientes (cedula, nombre, apellido, telefono, creado_por, revendedor_id)
  values (c.cedula, c.nombre, c.apellido, c.telefono, auth.uid(), a.revendedor_id)
  returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function cliente_de_revendedor(bigint) from public, anon, authenticated;

-- Lo que la tienda ve de cada pedido de revendedor. La de
-- esquema-revendedores.sql, mismas columnas y al final lo nuevo. Llega
-- cuando él confirma; se queda mientras se paga, se aprueba y se entrega,
-- y si vence con dinero pagado, hasta que el administrador lo cierre.
create or replace view v_apartados_revendedor
with (security_invoker = off) as
select
  a.id,
  a.creado_en,
  a.expira_en,
  a.revendedor_id,
  r.nombre   as revendedor,
  r.telefono as revendedor_telefono,
  btrim(c.nombre || ' ' || coalesce(c.apellido, '')) as clienta,
  x.piezas,
  x.total_usd,
  x.lista_usd,
  x.items,
  -- Nuevas.
  rv_fase_de(a.id)                                                           as fase,
  a.confirmado_en,
  a.plazo_lux_en,
  c.cedula                                                                   as clienta_cedula,
  c.telefono                                                                 as clienta_telefono,
  round(x.total_usd - greatest(saldo_padre_bcv(null, null, a.id), 0), 4)             as lux_pagado_bcv,
  round(x.total_usd - greatest(saldo_padre_bcv(null, null, a.id, null, true), 0), 4) as lux_verificado_bcv,
  greatest(round(saldo_padre_bcv(null, null, a.id), 4), 0)                   as lux_falta_bcv,
  (select count(*) from abonos b
    where b.apartado_id = a.id and b.anulado_en is null and b.verificado_en is null)::int as por_revisar,
  a.venta_id,
  a.entregado_en,
  (a.cliente_maestro_id is not null
   or exists (select 1 from clientes cl where cl.cedula_digitos = c.cedula_digitos)) as ya_es_clienta
from apartados a
join revendedores r on r.id = a.revendedor_id
join revendedor_clientes c on c.id = a.cliente_id
cross join lateral (
  select sum(i.cantidad)::int                    as piezas,
         sum(i.precio_lux_usd * i.cantidad)      as total_usd,
         sum(i.precio_lista_usd * i.cantidad)    as lista_usd,
         jsonb_agg(jsonb_build_object(
           'modelo_id', i.modelo_id, 'sku', m.sku, 'nombre', m.nombre, 'variante', m.variante,
           'foto_thumb_path', m.foto_thumb_path, 'cantidad', i.cantidad,
           'precio_usd', i.precio_lux_usd,
           'donde', (select string_agg(u.nombre, ' · ' order by e.cantidad desc, u.orden, u.id)
                       from existencias e join ubicaciones u on u.id = e.ubicacion_id
                      where e.modelo_id = i.modelo_id and e.cantidad > 0)
         ) order by m.nombre) as items
    from apartado_items i
    join modelos m on m.id = i.modelo_id
   where i.apartado_id = a.id
) x
where es_personal()
  and (   (a.estado = 'abierto' and a.cerrado_en is null and a.confirmado_en is not null
           and (a.expira_en > now()
                or exists (select 1 from abonos b where b.apartado_id = a.id and b.anulado_en is null)))
       or (a.estado = 'retirado' and a.entregado_en is null and a.venta_id is not null));

revoke all on v_apartados_revendedor from anon;
grant select on v_apartados_revendedor to authenticated;

-- La tienda carga un pago del revendedor (vino a pagar en persona).
create or replace function abonar_apartado(
  p_apartado_id bigint,
  p_metodo      text,
  p_monto       numeric,
  p_referencia  text    default null,
  p_verificado  boolean default true
) returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a       apartados%rowtype;
  v_falta numeric;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  select * into a from apartados where id = p_apartado_id for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;
  if a.estado <> 'abierto' or a.cerrado_en is not null or a.confirmado_en is null then
    raise exception 'Ese pedido no está esperando el pago del revendedor.';
  end if;
  if a.expira_en <= now() and not es_admin() then
    raise exception 'Ese pedido venció: lo resuelve el administrador.';
  end if;

  v_falta := saldo_padre_bcv(null, null, a.id);
  if v_falta < 0.005 then
    raise exception 'Ya está pagado completo: solo falta aprobarlo.';
  end if;

  perform anotar_abono_en(null, null, a.id, 'tienda', p_metodo, p_monto, p_referencia,
                          coalesce(p_verificado, true) or p_metodo in ('efectivo_bs', 'efectivo_usd', 'punto'),
                          v_falta);
  perform apartado_al_dia(a.id);
  return greatest(round(saldo_padre_bcv(null, null, a.id), 4), 0);
end;
$fn$;

revoke all on function abonar_apartado(bigint, text, numeric, text, boolean) from public, anon;
grant execute on function abonar_apartado(bigint, text, numeric, text, boolean) to authenticated;

-- Aprobar: la tienda comprobó que llegó todo. Se registra la venta a su
-- precio (tipo mayor, con el revendedor y a nombre de su clienta), la
-- pieza sale del inventario y queda por entregar.
create or replace function aprobar_apartado(p_apartado_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a        apartados%rowtype;
  r        revendedores%rowtype;
  c        revendedor_clientes%rowtype;
  v_falta  numeric;
  v_modelo bigint;
  v_metodo metodo_pago;
  v_ref    text;
  v_cli    bigint;
  v_lineas jsonb;
  v_venta  bigint;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;

  select * into a from apartados where id = p_apartado_id for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;
  if a.estado <> 'abierto' or a.cerrado_en is not null then
    raise exception 'Ese pedido ya no está abierto.';
  end if;
  if a.confirmado_en is null then
    raise exception 'El revendedor todavía no confirmó el pago de su clienta.';
  end if;

  -- Lo que queda por revisar lo da por bueno quien aprueba: aprobar es
  -- decir "lo vi en el banco".
  update abonos
     set verificado_en = now(), verificado_por = auth.uid()
   where apartado_id = a.id and anulado_en is null and verificado_en is null;

  v_falta := saldo_padre_bcv(null, null, a.id, null, true);
  if v_falta >= 0.005 then
    raise exception 'Todavía faltan $% BCV de lo que él le paga a Lux. Carga lo que falta y después aprueba.',
      to_char(v_falta, 'FM999G999G990D00');
  end if;

  select * into r from revendedores where id = a.revendedor_id;
  select * into c from revendedor_clientes where id = a.cliente_id;

  for v_modelo in
    select distinct modelo_id from apartado_items where apartado_id = a.id order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  -- Se suelta: sus piezas cuentan como libres y se toman.
  update apartados set cerrado_en = now() where id = a.id;

  select b.metodo into v_metodo
    from abonos b where b.apartado_id = a.id and b.anulado_en is null
   order by b.monto_bcv desc, b.fecha desc limit 1;
  select b.referencia into v_ref
    from abonos b where b.apartado_id = a.id and b.anulado_en is null and b.referencia is not null
   order by b.fecha desc limit 1;

  v_cli := cliente_de_revendedor(a.id);

  select jsonb_agg(jsonb_build_object(
           'modelo_id', i.modelo_id, 'cantidad', i.cantidad,
           'precio_usd', i.precio_lux_usd, 'precio_lista_usd', i.precio_lista_usd,
           'motivo', case when i.precio_lux_usd < i.precio_lista_usd then 'revendedor' end) order by i.id)
    into v_lineas
    from apartado_items i where i.apartado_id = a.id;

  v_venta := vender_congelado(
    'mayor', v_metodo, v_lineas, v_cli,
    btrim(c.nombre || ' ' || coalesce(c.apellido, '')), c.telefono,
    'Pedido #' || a.id || ' de ' || r.nombre,
    auth.uid(), r.id, v_ref);

  update abonos set venta_id = v_venta where apartado_id = a.id;

  update apartados
     set estado = 'retirado', retirado_en = now(), retirado_por = auth.uid(),
         venta_id = v_venta, cliente_maestro_id = v_cli
   where id = a.id;

  return v_venta;
end;
$fn$;

revoke all on function aprobar_apartado(bigint) from public, anon;
grant execute on function aprobar_apartado(bigint) to authenticated;

-- Se lo llevó: el revendedor retiró sus piezas.
create or replace function marcar_entregado(p_apartado_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  update apartados
     set entregado_en = now(), entregado_por = auth.uid()
   where id = p_apartado_id and estado = 'retirado' and entregado_en is null;
  if not found then
    raise exception 'Ese pedido no está por entregar.';
  end if;
end;
$fn$;

revoke all on function marcar_entregado(bigint) from public, anon;
grant execute on function marcar_entregado(bigint) to authenticated;

-- La de esquema-revendedores.sql, misma firma, para el navegador viejo:
-- pasa por la aprobación, que es la única forma de que un pedido de
-- revendedor se vuelva venta. Sin pagos, "Cobrar y entregar" es que pagó
-- todo ahora; y como la pantalla vieja no marcaba la entrega, queda
-- entregado de una vez.
create or replace function cobrar_apartado(
  p_apartado_id     bigint,
  p_metodo          text,
  p_pago_referencia text    default null,
  p_por_verificar   boolean default false
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a       apartados%rowtype;
  v_falta numeric;
  v_tasa  tasas%rowtype;
  v_monto numeric;
  v_venta bigint;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesion.';
  end if;
  if coalesce(p_por_verificar, false) then
    raise exception 'Actualiza la página: ahora el pago del revendedor se aprueba antes de entregar.';
  end if;

  select * into a from apartados where id = p_apartado_id for update;
  if not found then
    raise exception 'Ese apartado no existe.';
  end if;

  v_falta := saldo_padre_bcv(null, null, a.id);
  if exists (select 1 from abonos where apartado_id = a.id and anulado_en is null) then
    if v_falta >= 0.005 then
      raise exception 'Este pedido ya tiene pagos y le faltan $% BCV. Actualiza la página para cargar lo que falta.',
        to_char(v_falta, 'FM999G999G990D00');
    end if;
  else
    select * into v_tasa from tasas where vigente limit 1;
    if metodo_en_dolares(p_metodo::metodo_pago) then
      v_monto := ceil(v_falta * v_tasa.tasa_bcv / v_tasa.tasa_venta * 100) / 100;
    else
      v_monto := round(v_falta * v_tasa.tasa_bcv, 2);
    end if;
    perform abonar_apartado(a.id, p_metodo, v_monto, p_pago_referencia, true);
  end if;

  v_venta := aprobar_apartado(a.id);
  update apartados set entregado_en = now(), entregado_por = auth.uid() where id = a.id;
  return v_venta;
end;
$fn$;

revoke all on function cobrar_apartado(bigint, text, text, boolean) from public, anon;
grant execute on function cobrar_apartado(bigint, text, text, boolean) to authenticated;

-- La de esquema-revendedores.sql, misma firma: si ya le pagó algo a Lux,
-- no se suelta a secas.
create or replace function admin_cancelar_apartado(p_apartado_id bigint, p_motivo text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede soltar el pedido de un revendedor.';
  end if;
  if exists (select 1 from abonos where apartado_id = p_apartado_id and anulado_en is null) then
    raise exception 'Ese pedido ya tiene pagos a Lux: ciérralo diciendo si el dinero se devuelve o se queda.';
  end if;
  update apartados
     set estado = 'cancelado', cancelado_en = now(), cancelado_por = 'tienda',
         motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_apartado_id and estado = 'abierto' and cerrado_en is null;
  if not found then
    raise exception 'Ese pedido ya no está abierto.';
  end if;
end;
$fn$;

revoke all on function admin_cancelar_apartado(bigint, text) from public, anon;
grant execute on function admin_cancelar_apartado(bigint, text) to authenticated;

-- Cerrar un pedido de revendedor que tiene pagos a Lux sin aprobarlo
-- (se echó para atrás, o se le pasó el día): el administrador decide si
-- se le devuelve (sale de la caja) o se queda.
create or replace function admin_cerrar_apartado(
  p_apartado_id bigint,
  p_devolver    boolean,
  p_metodo      text    default null,
  p_monto       numeric default null,
  p_motivo      text    default null
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a apartados%rowtype;
  r revendedores%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo el administrador cierra un pedido con dinero.';
  end if;
  select * into a from apartados where id = p_apartado_id for update;
  if not found or a.estado <> 'abierto' or a.cerrado_en is not null then
    raise exception 'Ese pedido ya no está abierto.';
  end if;
  if exists (select 1 from abonos where apartado_id = a.id and anulado_en is null and verificado_en is null) then
    raise exception 'Hay pagos sin revisar: márcalos como que llegaron o que no llegaron antes de cerrar.';
  end if;
  select * into r from revendedores where id = a.revendedor_id;

  if coalesce(p_devolver, false) then
    if coalesce(p_monto, 0) <= 0 then
      raise exception 'Escribe cuánto se le devuelve.';
    end if;
    perform admin_anotar_caja('salida', (now() at time zone 'America/Caracas')::date, 'devolucion',
                              'Devolución a ' || r.nombre || ' · pedido #' || a.id,
                              p_metodo, p_monto, null);
  end if;

  update apartados
     set estado = 'cancelado', cancelado_en = now(), cancelado_por = 'tienda',
         motivo = btrim(coalesce(nullif(btrim(coalesce(p_motivo, '')), '') || ' · ', '')
                        || case when coalesce(p_devolver, false) then 'se le devolvió' else 'el dinero se quedó' end)
   where id = a.id;
end;
$fn$;

revoke all on function admin_cerrar_apartado(bigint, boolean, text, numeric, text) from public, anon;
grant execute on function admin_cerrar_apartado(bigint, boolean, text, numeric, text) to authenticated;


-- ---------------------------------------------------------------------
-- 10. LA FICHA DE LA CLIENTA DICE DE QUÉ REVENDEDOR VINO
-- ---------------------------------------------------------------------

-- La de esquema-cuentas-claras.sql, y al final de quién es clienta.
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
    count(*)                   as compras,
    sum(v.total_usd)           as total_usd,
    sum(v.total_bs / v.tasa_bcv_usada) as total_bcv,
    min(v.fecha)               as primera_compra,
    max(v.fecha)               as ultima_compra,
    coalesce(sum(p.piezas), 0) as piezas
  from ventas v
  left join lateral (
    select coalesce(sum(i.cantidad), 0) as piezas
      from venta_items i where i.venta_id = v.id
  ) p on true
  where v.cliente_id = c.id and not v.anulada
) r on true
where auth.uid() is not null;

grant select on v_clientes to authenticated;

-- La de esquema-abonos.sql, y al final por qué revendedor fue la venta.
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
  rv.nombre       as revendedor
from ventas v
join venta_items i on i.venta_id = v.id
join modelos m     on m.id = i.modelo_id
left join revendedores rv on rv.id = v.revendedor_id
where v.cliente_id is not null
  and (not v.anulada or v.notas like '%Anulada sin pago:%')
  and auth.uid() is not null;

grant select on v_cliente_compras to authenticated;

-- Juntar dos fichas: la de esquema-datos-pago-e-historico.sql, y los
-- pedidos de revendedor también pasan a la que se queda (si no, borrar la
-- que se va los dejaba sin clienta).
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

  update reservas  set cliente_id = p_se_queda         where cliente_id = p_se_va;
  update apartados set cliente_maestro_id = p_se_queda where cliente_maestro_id = p_se_va;

  update clientes q
     set cedula   = coalesce(q.cedula, v.cedula),
         apellido = coalesce(q.apellido, v.apellido),
         telefono = coalesce(q.telefono, v.telefono),
         notas    = coalesce(q.notas, v.notas),
         revendedor_id = coalesce(q.revendedor_id, v.revendedor_id),
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

-- =====================================================================
-- COMPROBACIÓN (en el SQL Editor, después de correrlo)
--
-- 1. Las dos cifras nuevas:
--      select clave, valor from configuracion where clave like 'revendedor_horas%';
--      -> revendedor_horas_pago 2, revendedor_horas_para_pagar 24
--
-- 2. Una pieza de etiqueta $20 BCV, a un revendedor del 25 %: le sale en
--    $15 y su clienta paga al menos $20,10. Aparta desde /#/r/<usuario>:
--    el pedido vence en 2 horas. Reporta un pago de $8,04 (el 40 %) y
--    deja de vencer hasta que él lo confirme. Al confirmar, en Pedidos
--    sale "De revendedores" con $15 por pagar y 24 horas. Él reporta $15;
--    al aprobar, la venta es de $15 BCV, tipo mayor, a nombre de la
--    clienta, y en Reportes sale una rebaja de $5 "revendedor".
--
-- 3. Sin sesión, esto TIENE QUE FALLAR:
--      select rv_confirmar('no-es-un-testigo', 1);     -- error 28000
--      select aprobar_apartado(1);                     -- hay que iniciar sesión
-- =====================================================================
