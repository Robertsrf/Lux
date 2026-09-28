-- =====================================================================
-- Lux by Emory — la caja: lo que entra y lo que sale de la tienda
-- Ejecutar en el SQL Editor DESPUÉS de esquema-vendedoras.sql
--
-- QUÉ ES
-- El dueño pidió (27/09/2026) poder ir anotando los gastos diarios de la
-- tienda para llevar el control de lo que entra y lo que sale. Hasta hoy
-- el sistema sabía lo que ENTRA (cada venta y cada abono, con su forma de
-- pago), pero no lo que SALE: el agua, el delivery, la luz, el pago a una
-- vendedora. La pantalla Caja junta las dos cosas, día por día y mes por
-- mes, y dice cuánto quedó en cada forma de pago.
--
-- LO QUE ENTRA NO SE ANOTA: ENTRA SOLO
-- Las ventas y los abonos ya están en la base con su forma de pago, sus
-- bolívares y sus tasas. Anotarlos otra vez a mano sería contarlos dos
-- veces. Lo único que se anota como entrada es lo que no es una venta:
-- que el dueño metió dinero a la caja, o algún otro ingreso.
--
--   - Una venta cobrada completa entra el día de la venta, por su total.
--   - Una venta por partes entra abono por abono, el día que llega cada
--     uno. Su total no se cuenta: se contaría dos veces.
--   - Una venta anulada no entra, ni sus abonos: es lo mismo que hace
--     Reportes. Si la tienda se quedó con el dinero de algún abono, se
--     anota como "Otro ingreso".
--   - Una venta por verificar SÍ entra, pero se dice aparte cuánto de lo
--     que entró falta comprobar en el banco.
--   - Un pedido del catálogo entra cuando se cobra en Pedidos, que es
--     cuando se vuelve venta. Lo que retira un revendedor, igual.
--
-- CADA MOVIMIENTO SE GUARDA COMO UN ABONO
-- El dólar es la unidad ancla, y un gasto es un hecho histórico, como una
-- venta: se congela. Se guarda lo que se pagó en su moneda (bolívares, o
-- dólares si fue en efectivo $ o Binance), su equivalente en bolívares a
-- la tasa Binance y en dólares BCV, con las dos tasas de ese día. Es la
-- misma receta de `anotar_abono` (esquema-abonos.sql), para que un dólar
-- que sale valga lo mismo que un dólar que entra.
--
-- Si el gasto es de un día pasado, se usa la tasa que regía ese día, no
-- la de hoy. Un gasto de la semana pasada no cambia de valor porque hoy
-- se movió la tasa.
--
-- LA CAJA NO ES LA GANANCIA
-- Lo que entró menos lo que salió es dinero que se movió, no ganancia. La
-- ganancia de verdad sigue en Reportes (`v_cobertura_mes`): lo que dejan
-- las ventas del mes contra los gastos del mes entero. Y Costos sigue
-- calculando precios con los gastos fijos que el dueño escribe allí; lo
-- que se anota aquí no los toca. Uno es el plan, el otro es lo que pasó.
--
-- NADA SE BORRA
-- Un movimiento equivocado se anula (queda quién y cuándo) y deja de
-- contar. Es la regla de las ventas y los abonos: la caja es un registro
-- de dinero, y un registro que se puede borrar no controla nada.
--
-- SOLO EL ADMINISTRADOR
-- La caja enseña cuánto vende la tienda y en qué gasta, y el sueldo de
-- cada una. La vendedora no la lee ni la escribe: la tabla está revocada
-- para todos, la vista filtra con es_admin() y cada función lo comprueba
-- antes de nada.
--
-- Firmas de lo que ya existía: ninguna cambia. Solo hay cosas nuevas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LAS CATEGORÍAS: UNA LISTA, UN SITIO
-- La tabla y la función que anota leen esta. La pantalla tiene los
-- nombres para leer en CATEGORIAS_CAJA (src/lib/tipos.ts): si cambia una,
-- cambia la otra.
-- ---------------------------------------------------------------------

create or replace function caja_categoria_valida(p_tipo text, p_categoria text)
returns boolean
language sql
immutable
as $fn$
  select case p_tipo
    when 'salida' then p_categoria in (
      'alquiler', 'sueldos', 'servicios', 'empaque', 'mercancia', 'transporte',
      'publicidad', 'mantenimiento', 'comisiones', 'retiro', 'otro_gasto')
    when 'entrada' then p_categoria in ('aporte', 'otro_ingreso')
    else false
  end;
$fn$;


-- ---------------------------------------------------------------------
-- 2. LA TABLA
-- ---------------------------------------------------------------------

create table if not exists caja_movimientos (
  id              bigserial primary key,
  tipo            text not null check (tipo in ('salida', 'entrada')),
  -- El día al que pertenece, en la hora de Venezuela. No es cuándo se
  -- anotó: el gasto del sábado se puede anotar el lunes.
  fecha           date not null,
  categoria       text not null,
  concepto        text not null check (length(btrim(concepto)) between 2 and 120),
  metodo          metodo_pago not null,
  monto_bs        numeric(14,2) not null check (monto_bs > 0),
  -- Lo que se pagó en dólares, si fue en dólares. Si no, null.
  monto_usd       numeric(12,2) check (monto_usd is null or monto_usd > 0),
  monto_bcv       numeric(16,6) not null check (monto_bcv > 0),
  tasa_bcv        numeric(12,4) not null,
  tasa_venta      numeric(12,4) not null,
  referencia      text,
  registrado_por  uuid not null references perfiles(id),
  registrado_en   timestamptz not null default now(),
  anulado_en      timestamptz,
  anulado_por     uuid references perfiles(id),
  anulado_motivo  text,
  constraint caja_categoria_de_su_tipo check (caja_categoria_valida(tipo, categoria))
);

create index if not exists caja_movimientos_fecha_idx on caja_movimientos (fecha);

comment on table caja_movimientos is
  'Lo que sale de la tienda (y lo que entra sin ser venta), anotado a mano '
  'por el administrador. Las ventas y los abonos no se anotan aquí: la caja '
  'los lee de sus tablas (caja_flujo). No se borra: se anula.';

-- Nadie la lee ni la escribe en crudo: se escribe por sus funciones y se
-- lee por `v_caja`.
alter table caja_movimientos enable row level security;
revoke all on caja_movimientos from anon, authenticated;
revoke all on sequence caja_movimientos_id_seq from anon, authenticated;

drop trigger if exists caja_no_se_borra on caja_movimientos;
drop trigger if exists caja_no_se_vacia on caja_movimientos;
create trigger caja_no_se_borra before delete   on caja_movimientos for each row       execute function historico_no_se_borra();
create trigger caja_no_se_vacia before truncate on caja_movimientos for each statement execute function historico_no_se_borra();


-- ---------------------------------------------------------------------
-- 3. ANOTAR Y ANULAR
-- ---------------------------------------------------------------------

create or replace function admin_anotar_caja(
  p_tipo       text,
  p_fecha      date,
  p_categoria  text,
  p_concepto   text,
  p_metodo     text,
  p_monto      numeric,
  p_referencia text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_tasa   tasas%rowtype;
  v_metodo metodo_pago;
  v_bs     numeric(14,2);
  v_usd    numeric(12,2);
  v_id     bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador anota en la caja.';
  end if;

  if p_tipo is null or p_tipo not in ('salida', 'entrada') then
    raise exception 'El movimiento tiene que ser una salida o una entrada.';
  end if;
  if not caja_categoria_valida(p_tipo, p_categoria) then
    raise exception 'Esa categoría no es de %: elige una de la lista.',
      case p_tipo when 'salida' then 'lo que sale' else 'lo que entra' end;
  end if;
  if length(btrim(coalesce(p_concepto, ''))) < 2 then
    raise exception 'Escribe qué fue: el concepto no puede quedar vacío.';
  end if;
  if length(btrim(p_concepto)) > 120 then
    raise exception 'El concepto es muy largo: 120 letras como máximo.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.';
  end if;
  if v_fecha > v_hoy then
    raise exception 'Esa fecha todavía no llega: el movimiento tiene que ser de hoy o de un día pasado.';
  end if;

  -- La tasa que regía ese día: la última fijada antes de que terminara,
  -- en la hora de Venezuela. Para hoy, es la vigente.
  select * into v_tasa
    from tasas
   where creado_en < ((v_fecha + 1)::timestamp at time zone 'America/Caracas')
   order by creado_en desc
   limit 1;
  if not found then
    raise exception 'No había ninguna tasa fijada el %: la caja la necesita para pasar a dólares BCV.',
      to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  -- La receta de `anotar_abono`: en dólares, a bolívares por la tasa
  -- Binance y redondeado a céntimos; de bolívares, a dólares BCV.
  v_metodo := p_metodo::metodo_pago;
  if metodo_en_dolares(v_metodo) then
    v_usd := round(p_monto, 2);
    v_bs  := round(v_usd * v_tasa.tasa_venta, 2);
  else
    v_bs  := round(p_monto, 2);
  end if;
  if v_bs <= 0 then
    raise exception 'El monto es demasiado chico: no llega a un céntimo.';
  end if;

  insert into caja_movimientos (tipo, fecha, categoria, concepto, metodo,
                                monto_bs, monto_usd, monto_bcv, tasa_bcv, tasa_venta,
                                referencia, registrado_por)
  values (p_tipo, v_fecha, p_categoria, btrim(p_concepto), v_metodo,
          v_bs, v_usd, v_bs / v_tasa.tasa_bcv, v_tasa.tasa_bcv, v_tasa.tasa_venta,
          nullif(btrim(coalesce(p_referencia, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function admin_anotar_caja(text, date, text, text, text, numeric, text) from public, anon;
grant execute on function admin_anotar_caja(text, date, text, text, text, numeric, text) to authenticated;


create or replace function admin_anular_caja(p_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'Solo un administrador anula en la caja.';
  end if;

  update caja_movimientos
     set anulado_en     = now(),
         anulado_por    = auth.uid(),
         anulado_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_id
     and anulado_en is null;

  if not found then
    raise exception 'Ese movimiento no existe o ya estaba anulado.';
  end if;
end;
$fn$;

revoke all on function admin_anular_caja(bigint, text) from public, anon;
grant execute on function admin_anular_caja(bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. EL FLUJO: LA ÚNICA CUENTA DE LO QUE ENTRÓ Y LO QUE SALIÓ
--
-- Una fila por cada dinero que se movió entre dos fechas (las dos
-- incluidas, en la hora de Venezuela): las ventas cobradas completas, los
-- abonos y lo anotado a mano. Las tres funciones de la pantalla la
-- agrupan de distinta manera; ninguna repite la regla de qué entra.
--
-- Los días se cortan en la hora de Venezuela a propósito. `ventas.fecha`
-- guarda el instante, y la base puede estar en otra zona horaria: una
-- venta de las nueve de la noche sería del día siguiente.
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
  -- Cobrada completa: entra su total el día de la venta. En dólares, lo
  -- que se cobró en dólares (`total_usd`, bolívares entre la tasa Binance).
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
  -- Por partes: entra cada abono el día que llegó.
  select (a.fecha at time zone 'America/Caracas')::date,
         a.metodo,
         'entrada',
         'abono',
         null::text,
         a.monto_bs,
         a.monto_usd,
         a.monto_bcv,
         v.por_verificar
    from abonos a
    join ventas v on v.id = a.venta_id
    cross join r
   where not v.anulada
     and a.fecha >= r.desde and a.fecha < r.hasta
  union all
  -- Lo anotado a mano, menos lo anulado.
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

-- Lee ventas y abonos enteros: no se otorga a nadie. La llaman las tres
-- de abajo, que son de definidor y miran antes quién llama.
revoke all on function caja_flujo(date, date) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. LO QUE LEE LA PANTALLA
-- Las tres rechazan a quien no sea administrador. Un período de más de
-- 370 días se rechaza también: la pantalla pide un día o un mes.
-- ---------------------------------------------------------------------

-- Por forma de pago: cuánto entró y cuánto salió en cada una, en su
-- moneda. Con esto se cuadra la gaveta: "en efectivo $ entraron 40 y
-- salieron 10". En las formas de pago en bolívares, las columnas en
-- dólares van null.
create or replace function admin_caja_por_metodo(p_desde date, p_hasta date)
returns table (
  metodo            metodo_pago,
  en_dolares        boolean,
  cobros            int,
  entro_bs          numeric,
  entro_usd         numeric,
  entro_bcv         numeric,
  salio_bs          numeric,
  salio_usd         numeric,
  salio_bcv         numeric,
  por_verificar_bs  numeric,
  por_verificar_usd numeric,
  por_verificar_bcv numeric
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
begin
  if not es_admin() then
    raise exception 'Solo un administrador ve la caja.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 370 then
    raise exception 'El período de la caja no es válido: pide un día o un mes.';
  end if;

  return query
  select f.metodo,
         metodo_en_dolares(f.metodo),
         (count(*) filter (where f.origen <> 'anotado'))::int,
         coalesce(sum(f.bs) filter (where f.tipo = 'entrada'), 0),
         round(sum(f.usd) filter (where f.tipo = 'entrada'), 2),
         round(coalesce(sum(f.bcv) filter (where f.tipo = 'entrada'), 0), 4),
         coalesce(sum(f.bs) filter (where f.tipo = 'salida'), 0),
         round(sum(f.usd) filter (where f.tipo = 'salida'), 2),
         round(coalesce(sum(f.bcv) filter (where f.tipo = 'salida'), 0), 4),
         coalesce(sum(f.bs) filter (where f.por_verificar), 0),
         round(sum(f.usd) filter (where f.por_verificar), 2),
         round(coalesce(sum(f.bcv) filter (where f.por_verificar), 0), 4)
    from caja_flujo(p_desde, p_hasta) f
   group by f.metodo
   order by f.metodo;
end;
$fn$;

revoke all on function admin_caja_por_metodo(date, date) from public, anon;
grant execute on function admin_caja_por_metodo(date, date) to authenticated;


-- Día por día: solo los días en que algo se movió. En dólares BCV y en
-- bolívares, cada movimiento a la tasa de su día.
create or replace function admin_caja_por_dia(p_desde date, p_hasta date)
returns table (
  fecha     date,
  cobros    int,
  anotados  int,
  entro_bs  numeric,
  entro_bcv numeric,
  salio_bs  numeric,
  salio_bcv numeric
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
begin
  if not es_admin() then
    raise exception 'Solo un administrador ve la caja.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 370 then
    raise exception 'El período de la caja no es válido: pide un día o un mes.';
  end if;

  return query
  select f.fecha,
         (count(*) filter (where f.origen <> 'anotado'))::int,
         (count(*) filter (where f.origen = 'anotado'))::int,
         coalesce(sum(f.bs) filter (where f.tipo = 'entrada'), 0),
         round(coalesce(sum(f.bcv) filter (where f.tipo = 'entrada'), 0), 4),
         coalesce(sum(f.bs) filter (where f.tipo = 'salida'), 0),
         round(coalesce(sum(f.bcv) filter (where f.tipo = 'salida'), 0), 4)
    from caja_flujo(p_desde, p_hasta) f
   group by f.fecha
   order by f.fecha;
end;
$fn$;

revoke all on function admin_caja_por_dia(date, date) from public, anon;
grant execute on function admin_caja_por_dia(date, date) to authenticated;


-- Por categoría: en qué se fue el dinero (y de dónde vino lo que no es
-- venta). Solo lo anotado: las ventas no tienen categoría.
create or replace function admin_caja_por_categoria(p_desde date, p_hasta date)
returns table (
  tipo        text,
  categoria   text,
  movimientos int,
  bs          numeric,
  bcv         numeric
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
begin
  if not es_admin() then
    raise exception 'Solo un administrador ve la caja.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 370 then
    raise exception 'El período de la caja no es válido: pide un día o un mes.';
  end if;

  return query
  select f.tipo,
         f.categoria,
         count(*)::int,
         sum(f.bs),
         round(sum(f.bcv), 4)
    from caja_flujo(p_desde, p_hasta) f
   where f.origen = 'anotado'
   group by f.tipo, f.categoria
   order by f.tipo desc, sum(f.bcv) desc;
end;
$fn$;

revoke all on function admin_caja_por_categoria(date, date) from public, anon;
grant execute on function admin_caja_por_categoria(date, date) to authenticated;


-- Cada movimiento anotado, con quién lo anotó y, si se anuló, quién y
-- por qué. Los anulados se quedan en la lista: no cuentan, pero se ven.
create or replace view v_caja
with (security_invoker = off) as
select
  c.id,
  c.tipo,
  c.fecha,
  c.categoria,
  c.concepto,
  c.metodo,
  c.monto_bs,
  c.monto_usd,
  round(c.monto_bcv, 4) as monto_bcv,
  c.referencia,
  p.nombre              as registrado_por,
  c.registrado_en,
  c.anulado_en,
  pa.nombre             as anulado_por,
  c.anulado_motivo
from caja_movimientos c
left join perfiles p  on p.id  = c.registrado_por
left join perfiles pa on pa.id = c.anulado_por
where es_admin();

revoke all on v_caja from anon;
grant select on v_caja to authenticated;

notify pgrst, 'reload schema';


-- =====================================================================
-- COMPROBACIÓN (con la sesión del administrador en el SQL Editor no se
-- puede: allí no hay auth.uid() y es_admin() da falso. Estas se miran
-- desde la pantalla Caja o con `npm run verificar`.)
--
-- En el SQL Editor sí:
--
--   select count(*) from caja_movimientos;
--     -> 0. La tabla nace vacía.
--
--   select * from caja_flujo(current_date - 1, current_date) limit 20;
--     -> las ventas y abonos de ayer y hoy, cada uno con su forma de
--        pago. Compara la suma de `bs` de las ventas de hoy con lo que
--        dice Reportes para hoy: tiene que ser la misma cifra, salvo las
--        ventas por partes, que aquí cuentan solo lo abonado.
--
--   delete from caja_movimientos where id = -1;
--     -> ERROR: no se borran (el disparador).
--
--   show timezone;
--     -> si dice UTC, "Mi día" de la vendedora cambia de día a las ocho
--        de la noche (usa current_date). La caja no: corta el día en la
--        hora de Venezuela.
--
-- En la pantalla Caja, como administrador:
--   1. Anota una salida de Bs 10,00, "Prueba", en Efectivo Bs.
--      -> "Salió" sube Bs 10,00; en dólares BCV, 10 entre la tasa BCV.
--   2. Anúlala.
--      -> vuelve a su cifra de antes y la prueba queda tachada en la
--         lista, con quién la anuló.
--
-- Con la sesión de la vendedora (npm run verificar lo hace solo):
--   v_caja -> 0 filas. admin_caja_por_metodo -> "Solo un administrador".
--   caja_movimientos en crudo -> permiso denegado.
-- =====================================================================
