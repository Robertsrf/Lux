-- =====================================================================
-- Lux by Emory — cinco correcciones del dueño al modelo de costos
-- Ejecutar en el SQL Editor DESPUÉS de esquema-objetivo-bcv.sql
--
--   1. El flete se reparte POR PIEZA, no por peso ni por valor.
--   2. Alquiler, sueldos y demás gastos están en dólares BCV.
--   3. La rotación se ajusta sola con las ventas reales.
--   4. La merma deja de ser un 5 % inventado: son piezas contadas.
--   5. Las inversiones declaran en qué dólar se pagaron.
--
-- Se puede correr entero de una vez. No hay ventas registradas todavía,
-- así que ningún histórico cambia de significado por el camino.
-- =====================================================================


-- =====================================================================
-- 1. EL FLETE SE REPARTE POR PIEZA
--
-- Antes se repartía por peso, y como casi ningún modelo tenía peso
-- cargado, el sistema caía al reparto por VALOR. El resultado era que
-- el collar de $10,97 cargaba $0,89 de flete y el brazalete de $0,92
-- cargaba $0,07. Doce veces más por la misma caja en el mismo avión.
--
-- El flete no cobra por valor ni por gramo: cobra por bulto. Así que se
-- divide entre TODO lo que vino, y los exhibidores son bultos también.
--
--   flete por unidad = costo del flete / (piezas de joyería + exhibidores)
--
-- El peso desaparece del sistema entero: no se pregunta, no se guarda.
-- =====================================================================

drop view if exists v_catalogo_admin cascade;
drop view if exists v_lotes_admin    cascade;
drop view if exists v_capex_lote     cascade;
drop view if exists v_diagnostico    cascade;
drop view if exists v_recuperacion   cascade;
drop view if exists v_equilibrio     cascade;
drop view if exists v_margen_ventas  cascade;
drop view if exists v_ventas_por_dia cascade;
drop view if exists v_mezcla_grupo   cascade;
drop view if exists v_rotacion_modelo cascade;

-- El trigger nombra peso_mercancia_g y metodo en su condicion WHEN: depende
-- de esas columnas igual que una vista y bloquea el DROP COLUMN. Se recrea
-- mas abajo con la condicion nueva.
drop trigger if exists trg_recalcular_flete_de_lote on lotes;

drop function if exists admin_guardar_lote(bigint, text, date, numeric, numeric, numeric, numeric, numeric, numeric, text, text);
drop function if exists calcular_flete_unitario(bigint, numeric, numeric);
drop function if exists admin_previsualizar_flete(bigint, numeric, numeric);
drop function if exists admin_sugerir_precio(bigint, numeric, numeric, numeric);
drop function if exists admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, numeric, text, text, numeric, text, text, text, jsonb);

alter table lotes   drop column if exists flete_mercancia_usd;
alter table lotes   drop column if exists peso_mercancia_g;
alter table lotes   drop column if exists peso_exhibidores_g;
alter table lotes   drop column if exists metodo;
alter table modelos drop column if exists peso_unitario_g;

drop type if exists metodo_prorrateo;

alter table lotes
  add column if not exists piezas_mercancia     integer not null default 0,
  add column if not exists unidades_exhibidores integer not null default 0;

comment on column lotes.piezas_mercancia is
  'Cuántas piezas de joyería vinieron en el envío (no cuántas se han cargado)';
comment on column lotes.unidades_exhibidores is
  'Cuántos exhibidores vinieron en el mismo envío: también pagan flete';

-- El flete que le toca a la mercancía es su parte de los bultos.
alter table lotes add column flete_mercancia_usd numeric(12,4)
  generated always as (
    case when (piezas_mercancia + unidades_exhibidores) > 0
         then costo_flete_usd * piezas_mercancia
              / (piezas_mercancia + unidades_exhibidores)
         else 0 end
  ) stored;

create view v_capex_lote as
select
  id,
  codigo,
  fecha_llegada,
  unidades_exhibidores,
  costo_exhibidores_usd,
  (costo_flete_usd - flete_mercancia_usd) as flete_exhibidores_usd,
  costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd) as capex_total_usd
from lotes
where es_admin();   -- sin esto la vendedora lee el costo de los exhibidores

create view v_lotes_admin
with (security_invoker = off) as
select
  l.*,
  (l.costo_flete_usd - l.flete_mercancia_usd) as flete_exhibidores_usd,
  (l.costo_exhibidores_usd + (l.costo_flete_usd - l.flete_mercancia_usd)) as capex_total_usd,
  case when (l.piezas_mercancia + l.unidades_exhibidores) > 0
       then round(l.costo_flete_usd / (l.piezas_mercancia + l.unidades_exhibidores), 4)
       else null end                          as flete_por_unidad_usd,
  (select count(*) from modelos m where m.lote_id = l.id) as modelos_cargados
from lotes l
where es_admin();

grant select on v_lotes_admin to authenticated;

-- Ahora el flete de una pieza no depende de la pieza: depende del lote.
create or replace function calcular_flete_unitario(p_lote_id bigint)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lote lotes%rowtype;
begin
  if p_lote_id is null then return 0; end if;
  select * into v_lote from lotes where id = p_lote_id;
  if not found then return 0; end if;
  if (v_lote.piezas_mercancia + v_lote.unidades_exhibidores) <= 0 then return 0; end if;
  return round(v_lote.costo_flete_usd
               / (v_lote.piezas_mercancia + v_lote.unidades_exhibidores), 4);
end;
$$;

revoke all on function calcular_flete_unitario(bigint) from public, anon;
grant execute on function calcular_flete_unitario(bigint) to authenticated;

create or replace function admin_previsualizar_flete(p_lote_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $$ select case when es_admin() then calcular_flete_unitario(p_lote_id) else null end; $$;

revoke all on function admin_previsualizar_flete(bigint) from public, anon;
grant execute on function admin_previsualizar_flete(bigint) to authenticated;

-- El trigger vuelve a repartir cuando cambian los bultos o el flete.
create or replace function recalcular_flete_de_lote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update modelos m
     set flete_unitario_usd = calcular_flete_unitario(new.id),
         actualizado_en     = now()
   where m.lote_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_recalcular_flete_de_lote on lotes;
create trigger trg_recalcular_flete_de_lote
  after update on lotes
  for each row
  when (
    old.costo_flete_usd      is distinct from new.costo_flete_usd or
    old.piezas_mercancia     is distinct from new.piezas_mercancia or
    old.unidades_exhibidores is distinct from new.unidades_exhibidores
  )
  execute function recalcular_flete_de_lote();

create or replace function admin_guardar_lote(
  p_id                    bigint,
  p_codigo                text,
  p_fecha_llegada         date,
  p_tasa_binance_compra   numeric,
  p_costo_mercancia_usd   numeric,
  p_costo_exhibidores_usd numeric,
  p_costo_flete_usd       numeric,
  p_piezas_mercancia      integer,
  p_unidades_exhibidores  integer,
  p_notas                 text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     bigint;
  v_codigo text;
  v_tasa   numeric;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede registrar lotes.';
  end if;

  v_codigo := nullif(trim(p_codigo), '');
  if v_codigo is null then
    v_codigo := 'L' || to_char(coalesce(p_fecha_llegada, current_date), 'YYMM')
                || '-' || lpad(((select count(*) from lotes) + 1)::text, 2, '0');
  end if;

  if p_id is null then
    insert into lotes (
      codigo, fecha_llegada, tasa_binance_compra,
      costo_mercancia_usd, costo_exhibidores_usd, costo_flete_usd,
      piezas_mercancia, unidades_exhibidores, notas
    ) values (
      v_codigo, p_fecha_llegada, p_tasa_binance_compra,
      coalesce(p_costo_mercancia_usd, 0), coalesce(p_costo_exhibidores_usd, 0),
      coalesce(p_costo_flete_usd, 0),
      greatest(coalesce(p_piezas_mercancia, 0), 0),
      greatest(coalesce(p_unidades_exhibidores, 0), 0),
      p_notas
    ) returning id into v_id;
    return v_id;
  end if;

  -- La tasa Binance de un lote es un hecho historico: no se toca jamas.
  select tasa_binance_compra into v_tasa from lotes where id = p_id;
  if not found then
    raise exception 'El lote % no existe.', p_id;
  end if;
  if p_tasa_binance_compra is not null and p_tasa_binance_compra <> v_tasa then
    raise exception 'La tasa Binance del lote % ya esta sellada en %. No se puede cambiar.', p_id, v_tasa;
  end if;

  update lotes set
    codigo                = v_codigo,
    fecha_llegada         = p_fecha_llegada,
    costo_mercancia_usd   = coalesce(p_costo_mercancia_usd, 0),
    costo_exhibidores_usd = coalesce(p_costo_exhibidores_usd, 0),
    costo_flete_usd       = coalesce(p_costo_flete_usd, 0),
    piezas_mercancia      = greatest(coalesce(p_piezas_mercancia, 0), 0),
    unidades_exhibidores  = greatest(coalesce(p_unidades_exhibidores, 0), 0),
    notas                 = p_notas
  where id = p_id;

  return p_id;
end;
$$;

revoke all on function admin_guardar_lote(bigint, text, date, numeric, numeric, numeric, numeric, integer, integer, text) from public, anon;
grant execute on function admin_guardar_lote(bigint, text, date, numeric, numeric, numeric, numeric, integer, integer, text) to authenticated;

-- El modelo ya no lleva peso: el flete sale del lote y nada más.
create or replace function admin_guardar_modelo(
  p_id                  bigint,
  p_nombre              text,
  p_categoria           text,
  p_grupo_precio_id     bigint,
  p_lote_id             bigint default null,
  p_costo_unitario_usd  numeric default 0,
  p_descripcion         text default null,
  p_variantes_nota      text default null,
  p_precio_override_usd numeric default null,
  p_foto_path           text default null,
  p_foto_thumb_path     text default null,
  p_sku                 text default null,
  p_existencias         jsonb default '[]'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    bigint;
  v_sku   text;
  v_flete numeric;
  v_fila  jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar modelos.';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'El modelo necesita un nombre.';
  end if;

  v_flete := calcular_flete_unitario(p_lote_id);
  v_sku   := nullif(trim(coalesce(p_sku, '')), '');

  if p_id is null then
    v_sku := coalesce(v_sku, generar_sku(p_categoria, p_grupo_precio_id));
    insert into modelos (
      sku, nombre, categoria, descripcion, variantes_nota,
      lote_id, costo_unitario_usd, flete_unitario_usd,
      grupo_precio_id, precio_override_usd, foto_path, foto_thumb_path
    ) values (
      v_sku, trim(p_nombre), lower(trim(p_categoria)), p_descripcion, p_variantes_nota,
      p_lote_id, coalesce(p_costo_unitario_usd, 0), v_flete,
      p_grupo_precio_id, p_precio_override_usd, p_foto_path, p_foto_thumb_path
    ) returning id into v_id;
  else
    v_id := p_id;
    update modelos set
      sku                 = coalesce(v_sku, sku),
      nombre              = trim(p_nombre),
      categoria           = lower(trim(p_categoria)),
      descripcion         = p_descripcion,
      variantes_nota      = p_variantes_nota,
      lote_id             = p_lote_id,
      costo_unitario_usd  = coalesce(p_costo_unitario_usd, 0),
      flete_unitario_usd  = v_flete,
      grupo_precio_id     = p_grupo_precio_id,
      precio_override_usd = p_precio_override_usd,
      -- si no llega foto nueva, se conserva la que ya tenia
      foto_path           = coalesce(p_foto_path, foto_path),
      foto_thumb_path     = coalesce(p_foto_thumb_path, foto_thumb_path),
      actualizado_en      = now()
    where id = v_id;
    if not found then
      raise exception 'El modelo % no existe.', p_id;
    end if;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_existencias, '[]'::jsonb))
  loop
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_id, (v_fila->>'ubicacion_id')::bigint, greatest((v_fila->>'cantidad')::int, 0))
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = excluded.cantidad, actualizado_en = now();
  end loop;

  return v_id;
end;
$$;

revoke all on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb) from public, anon;
grant execute on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb) to authenticated;


-- =====================================================================
-- 2. LOS GASTOS DE LA TIENDA ESTÁN EN DÓLARES BCV
--
-- El alquiler, los sueldos, la luz y el empaque se pagan aquí, en
-- bolívares, y se piensan en dólares BCV. La mercancía no: esa se compra
-- afuera con dólares Binance. Son dos monedas distintas y el sistema las
-- estaba sumando como si fueran la misma.
--
-- Multiplicar los gastos por la brecha inflaba cada pieza unos $0,57.
-- La fórmula correcta convierte SOLO la mercancía:
--
--   costo BCV = costo puesto (real) × brecha + gastos (ya en BCV)
--   precio    = costo BCV / (1 − margen)
--
-- Los exhibidores importados sí se convierten: se compraron en Binance.
-- =====================================================================

alter table inversiones
  add column if not exists moneda text not null default 'bcv'
  check (moneda in ('bcv', 'real'));

comment on column inversiones.moneda is
  'bcv = se pagó aquí en bolívares. real = se compró afuera a tasa Binance.';

update configuracion set descripcion = 'Alquiler del local al mes, en dólares BCV'      where clave = 'gasto_alquiler_mes_usd';
update configuracion set descripcion = 'Sueldos al mes, en dólares BCV'                 where clave = 'gasto_sueldos_mes_usd';
update configuracion set descripcion = 'Luz, internet, agua y demás, en dólares BCV'     where clave = 'gasto_servicios_mes_usd';
update configuracion set descripcion = 'Cualquier otro gasto fijo mensual, en BCV'       where clave = 'gasto_otros_mes_usd';
update configuracion set descripcion = 'Caja, bolsita y paño de cada pieza, en BCV'      where clave = 'empaque_por_pieza_usd';

-- Los gastos fijos del mes, todos llevados a dólares BCV.
create or replace function gastos_fijos_mes_bcv()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_factor numeric;
  v_bcv    numeric := 0;
  v_real   numeric := 0;
  v_meses  numeric;
begin
  select tasa_venta / tasa_bcv into v_factor from tasas where vigente limit 1;
  v_factor := coalesce(v_factor, 1);

  -- Alquiler, sueldos, servicios y otros: se pagan aqui, ya son BCV.
  select coalesce(sum(valor), 0) into v_bcv
    from configuracion
   where clave in ('gasto_alquiler_mes_usd', 'gasto_sueldos_mes_usd',
                   'gasto_servicios_mes_usd', 'gasto_otros_mes_usd');

  -- Inversiones que se amortizan, cada una en su moneda.
  v_bcv := v_bcv + coalesce((
    select sum(monto_usd / amortizar_meses) from inversiones
     where activo and amortizar_meses > 0 and moneda = 'bcv'), 0);

  v_real := coalesce((
    select sum(monto_usd / amortizar_meses) from inversiones
     where activo and amortizar_meses > 0 and moneda = 'real'), 0);

  -- Exhibidores importados: se compraron en Binance, se convierten.
  select valor into v_meses from configuracion where clave = 'capex_amortizar_meses';
  if coalesce(v_meses, 0) > 0 then
    v_real := v_real + coalesce((
      select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd))
        from lotes), 0) / v_meses;
  end if;

  return round(v_bcv + v_real * v_factor, 4);
end;
$$;

-- NO se otorga a authenticated a proposito: devuelve la nomina y el alquiler.
-- Solo la llaman funciones SECURITY DEFINER, donde el permiso se comprueba
-- contra el dueno de la funcion y no contra quien la invoca. Las vistas que
-- necesitan la cifra la calculan por dentro, leyendo las tablas.
revoke all on function gastos_fijos_mes_bcv() from public, anon, authenticated;


-- =====================================================================
-- 3. LA ROTACIÓN SE AJUSTA SOLA CON LAS VENTAS REALES
--
-- "360 piezas en 3 meses" es una intención, no un dato. Sirve para
-- arrancar, pero en cuanto haya un mes cumplido desde la PRIMERA venta,
-- el sistema deja de suponer y usa lo que de verdad se vendió.
--
-- De ese número cuelga el costo por pieza, y de ahí el precio: si se
-- vende menos de lo previsto, cada pieza carga más tienda y el sistema
-- lo refleja solo, sin que nadie tenga que acordarse de corregirlo.
-- =====================================================================

create or replace function volumen_mensual_estimado()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_primera  date;
  v_dias     numeric;
  v_meses    numeric;
  v_vendidas numeric;
  v_objetivo numeric;
  v_rot      numeric;
  v_reales   numeric;
begin
  -- ¿Ya hay un mes cumplido desde la primera venta?
  select min(fecha)::date into v_primera from ventas where not anulada;

  if v_primera is not null then
    v_dias := current_date - v_primera;
    if v_dias >= 30 then
      select coalesce(sum(i.cantidad), 0) into v_vendidas
        from venta_items i
        join ventas v on v.id = i.venta_id and not v.anulada;
      v_meses := v_dias / 30.0;
      if v_vendidas > 0 and v_meses > 0 then
        return round(v_vendidas / v_meses, 2);
      end if;
    end if;
  end if;

  -- Todavia no hay historia suficiente: vale la intencion del dueno.
  select valor into v_objetivo from configuracion where clave = 'piezas_inventario_objetivo';
  select valor into v_rot      from configuracion where clave = 'meses_rotacion_objetivo';
  v_rot := greatest(coalesce(v_rot, 3), 1);

  if coalesce(v_objetivo, 0) > 0 then
    return round(v_objetivo / v_rot, 2);
  end if;

  -- Ni eso: se reparte lo que hay cargado.
  select coalesce(sum(cantidad), 0) into v_reales from existencias;
  if v_reales > 0 then
    return round(v_reales / v_rot, 2);
  end if;

  return 0;
end;
$$;

revoke all on function volumen_mensual_estimado() from public, anon;
grant execute on function volumen_mensual_estimado() to authenticated;

-- De dónde salió el número, para poder decirlo en pantalla.
create or replace view v_volumen
with (security_invoker = off) as
select
  volumen_mensual_estimado()                                   as piezas_mes,
  (select min(fecha)::date from ventas where not anulada)      as primera_venta,
  (select coalesce(sum(i.cantidad), 0)
     from venta_items i join ventas v on v.id = i.venta_id and not v.anulada) as piezas_vendidas,
  case
    when (select min(fecha)::date from ventas where not anulada) is not null
     and current_date - (select min(fecha)::date from ventas where not anulada) >= 30
     and (select coalesce(sum(i.cantidad), 0)
            from venta_items i join ventas v on v.id = i.venta_id and not v.anulada) > 0
    then 'ventas' else 'estimado'
  end                                                          as origen,
  case
    when (select min(fecha)::date from ventas where not anulada) is not null
    then round((current_date - (select min(fecha)::date from ventas where not anulada)) / 30.0, 1)
  end                                                          as meses_observados
where es_admin();

grant select on v_volumen to authenticated;


-- =====================================================================
-- 4. LA MERMA SE CUENTA, NO SE SUPONE
--
-- El 5 % era un número inventado y encarecía TODAS las piezas todos los
-- meses, se dañara algo o no. Ahora se anota cuántas piezas salieron
-- dañadas o defectuosas al mes, y si son cero, no encarece nada.
--
-- Si de 120 vendidas se perdieron 3, compraste 123 para vender 120:
--
--   factor = 1 + 3/120 = 1,025   ->  cada pieza vendida paga 2,5 % más
--
-- Y solo sobre la MERCANCÍA: una pieza dañada te cuesta lo que pagaste
-- por ella, no el alquiler del mes, que se paga igual.
-- =====================================================================

-- Estas tres las creaba esquema-diagnostico.sql, que quedo sellado. Se
-- repiten aqui para que la cadena viva se baste sola en una instalacion
-- desde cero. Con `do nothing` no pisan lo que ya haya cargado.
insert into configuracion (clave, valor, descripcion) values
  ('piezas_inventario_objetivo', 0, 'Cuántas piezas maneja la tienda cuando está surtida'),
  ('meses_rotacion_objetivo',    3, 'En cuántos meses quieres vender todo el inventario'),
  ('ganancia_mensual_objetivo_usd', 0, 'Cuánto quieres que te quede libre al mes, en dólares BCV')
on conflict (clave) do nothing;

insert into configuracion (clave, valor, descripcion) values
  ('piezas_danadas_mes', 0, 'Cuántas piezas salieron dañadas o defectuosas al mes (0 si ninguna)')
on conflict (clave) do nothing;

delete from configuracion where clave in ('merma_pct', 'piezas_esperadas_mes');

create or replace function factor_merma()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_danadas numeric;
  v_volumen numeric;
begin
  select valor into v_danadas from configuracion where clave = 'piezas_danadas_mes';
  if coalesce(v_danadas, 0) <= 0 then
    return 1;
  end if;

  v_volumen := volumen_mensual_estimado();
  if coalesce(v_volumen, 0) <= 0 then
    return 1;
  end if;

  -- Tope de seguridad: por encima de esto el dato esta mal cargado.
  return round(1 + least(v_danadas / v_volumen, 1), 6);
end;
$$;

revoke all on function factor_merma() from public, anon;
grant execute on function factor_merma() to authenticated;

-- ---------------------------------------------------------------------
-- EL COSTO OPERATIVO POR PIEZA, YA EN DÓLARES BCV
-- ---------------------------------------------------------------------

create or replace function costo_operativo_por_pieza()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fijos   numeric;
  v_volumen numeric;
  v_empaque numeric;
begin
  select valor into v_empaque from configuracion where clave = 'empaque_por_pieza_usd';
  v_empaque := coalesce(v_empaque, 0);

  v_volumen := volumen_mensual_estimado();
  if coalesce(v_volumen, 0) <= 0 then
    -- Sin volumen no hay entre qué repartir: solo el empaque es cierto.
    return v_empaque;
  end if;

  v_fijos := gastos_fijos_mes_bcv();
  return round((v_fijos / v_volumen) + v_empaque, 4);
end;
$$;

revoke all on function costo_operativo_por_pieza() from public, anon;
grant execute on function costo_operativo_por_pieza() to authenticated;

-- ---------------------------------------------------------------------
-- EL COSTO COMPLETO DE UNA PIEZA, EN DÓLARES BCV
-- Un solo lugar donde vive la fórmula. Todo lo demás la llama.
--
--   costo BCV = costo puesto × brecha × merma  +  gastos de tienda
--
-- La brecha toca únicamente la mercancía, que es lo que se recompra
-- afuera. Los gastos ya nacieron en BCV.
-- ---------------------------------------------------------------------

create or replace function costo_total_bcv(p_costo_puesto_usd numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_factor numeric;
begin
  select tasa_venta / tasa_bcv into v_factor from tasas where vigente limit 1;
  v_factor := coalesce(v_factor, 1);
  return round(coalesce(p_costo_puesto_usd, 0) * v_factor * factor_merma()
               + coalesce(costo_operativo_por_pieza(), 0), 4);
end;
$$;

revoke all on function costo_total_bcv(numeric) from public, anon;
grant execute on function costo_total_bcv(numeric) to authenticated;


-- =====================================================================
-- 5. TODO LO QUE REPORTA MÁRGENES PASA A DÓLARES BCV
--
-- Antes el margen se medía en dólares reales y daba igual, porque costo
-- y precio estaban en la misma moneda y el porcentaje no cambia al
-- dividir arriba y abajo por lo mismo.
--
-- Ahora el costo es MIXTO: mercancía en Binance y tienda en BCV. Ya no
-- da igual. Se reporta todo en BCV, que es la moneda de la etiqueta y
-- la que el dueño usa para hablar. Aparte se muestra cuántos dólares
-- reales quedan, que es lo que se puede cambiar y reinvertir.
-- =====================================================================

drop view if exists v_catalogo_admin cascade;

create view v_catalogo_admin
with (security_invoker = off) as
select
  v.*,
  m.costo_unitario_usd,
  m.flete_unitario_usd,
  m.costo_puesto_usd,
  m.lote_id,
  o.operativo                                    as costo_operativo_usd,
  o.merma                                        as factor_merma,
  round(m.costo_puesto_usd * o.factor * o.merma, 4) as costo_mercancia_bcv,
  round(m.costo_puesto_usd * o.factor * o.merma + o.operativo, 4) as costo_total_usd,
  round(v.precio_usd - (m.costo_puesto_usd * o.factor * o.merma + o.operativo), 4) as margen_usd,
  case when v.precio_usd > 0
       then round(((v.precio_usd - (m.costo_puesto_usd * o.factor * o.merma + o.operativo))
                   / v.precio_usd) * 100, 2)
       else 0 end                                as margen_pct,
  case when o.factor > 0
       then round((v.precio_usd - (m.costo_puesto_usd * o.factor * o.merma + o.operativo))
                  / o.factor, 4)
       end                                       as ganancia_real_usd,
  m.grupo_precio_id,
  m.precio_override_usd,
  l.codigo as lote_codigo
from v_catalogo_venta v
join modelos m on m.id = v.id
left join lotes l on l.id = m.lote_id
cross join lateral (
  select
    coalesce(costo_operativo_por_pieza(), 0) as operativo,
    coalesce(factor_merma(), 1)              as merma,
    coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as factor
) o
where es_admin();

grant select on v_catalogo_admin to authenticated;

-- ---------------------------------------------------------------------
-- EL PRECIO SUGERIDO, CON LA FÓRMULA NUEVA
-- ---------------------------------------------------------------------

create or replace function admin_sugerir_precio(
  p_lote_id    bigint,
  p_costo_usd  numeric,
  p_margen_pct numeric default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tasa        tasas%rowtype;
  v_flete       numeric(12,4);
  v_puesto      numeric(12,4);
  v_operativo   numeric(12,4);
  v_merma       numeric;
  v_factor      numeric;
  v_merc_bcv    numeric(12,4);
  v_total_bcv   numeric(12,4);
  v_margen      numeric;
  v_precio_bcv  numeric(12,4);
  v_grupo       grupos_precio%rowtype;
  v_margen_real numeric;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede calcular precios.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fijala antes de calcular precios.';
  end if;

  v_flete  := calcular_flete_unitario(p_lote_id);
  v_puesto := coalesce(p_costo_usd, 0) + coalesce(v_flete, 0);
  v_factor := v_tasa.tasa_venta / v_tasa.tasa_bcv;
  v_merma  := coalesce(factor_merma(), 1);

  -- La mercancia se compro afuera: se trae a BCV con la brecha.
  v_merc_bcv := round(v_puesto * v_factor * v_merma, 4);

  -- La tienda se paga aqui: ya esta en BCV, no se convierte.
  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  v_total_bcv := round(v_merc_bcv + v_operativo, 4);

  select coalesce(p_margen_pct, valor) / 100 into v_margen
    from configuracion where clave = 'margen_objetivo_pct';
  v_margen := coalesce(v_margen, coalesce(p_margen_pct, 0) / 100);

  if v_margen >= 1 then
    raise exception 'El margen tiene que ser menor que 100 %%.';
  end if;

  v_precio_bcv := round(v_total_bcv / (1 - v_margen), 2);

  select * into v_grupo
    from grupos_precio
   where activo and precio_usd >= v_precio_bcv
   order by precio_usd asc
   limit 1;

  if not found then
    select * into v_grupo from grupos_precio where activo order by precio_usd desc limit 1;
  end if;

  if v_grupo.id is not null and v_grupo.precio_usd > 0 then
    v_margen_real := round(((v_grupo.precio_usd - v_total_bcv) / v_grupo.precio_usd) * 100, 2);
  end if;

  return jsonb_build_object(
    'flete_unitario_usd',    v_flete,
    'costo_puesto_usd',      v_puesto,
    'factor_brecha',         round(v_factor, 4),
    'costo_mercancia_bcv',   v_merc_bcv,
    'costo_operativo_usd',   v_operativo,
    'factor_merma',          v_merma,
    'costo_total_usd',       v_total_bcv,
    'costo_en_bcv',          v_total_bcv,
    'margen_objetivo_pct',   round(v_margen * 100, 2),
    'precio_sugerido_bcv',   v_precio_bcv,
    'grupo_id',              v_grupo.id,
    'grupo_nombre',          v_grupo.nombre,
    'grupo_precio_bcv',      v_grupo.precio_usd,
    'grupo_alcanza',         coalesce(v_grupo.precio_usd >= v_precio_bcv, false),
    'precio_grupo_real',     case when v_factor > 0 then round(v_grupo.precio_usd / v_factor, 4) end,
    'margen_resultante_pct', v_margen_real);
end;
$$;

revoke all on function admin_sugerir_precio(bigint, numeric, numeric) from public, anon;
grant execute on function admin_sugerir_precio(bigint, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- EL PISO DE REGATEO USA EL MISMO COSTO
-- ---------------------------------------------------------------------

create or replace function precio_minimo_de(p_modelo_id bigint)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_precio     numeric(12,4);
  v_costo      numeric(12,4);
  v_total_bcv  numeric(12,4);
  v_desc_max   numeric(12,4);
  v_margen_min numeric(12,4);
  v_piso_desc  numeric(12,4);
  v_piso_marg  numeric(12,4);
begin
  select coalesce(m.precio_override_usd, g.precio_usd), m.costo_puesto_usd
    into v_precio, v_costo
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
   where m.id = p_modelo_id and m.activo;

  if v_precio is null then
    return null;
  end if;

  if not exists (select 1 from tasas where vigente) then
    return v_precio;
  end if;

  v_total_bcv := costo_total_bcv(v_costo);

  select valor into v_desc_max   from configuracion where clave = 'descuento_max_mostrador_pct';
  select valor into v_margen_min from configuracion where clave = 'margen_minimo_pct';
  v_desc_max   := least(coalesce(v_desc_max, 0), 99);
  v_margen_min := least(coalesce(v_margen_min, 0), 99);

  v_piso_desc := v_precio * (1 - v_desc_max / 100);
  v_piso_marg := v_total_bcv / (1 - v_margen_min / 100);

  return round(least(v_precio, greatest(v_piso_desc, v_piso_marg)), 2);
end;
$$;

revoke all on function precio_minimo_de(bigint) from public, anon;
grant execute on function precio_minimo_de(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- LOS REPORTES, EN DÓLARES BCV
--
-- El ingreso sale de los bolívares cobrados divididos entre la tasa BCV
-- congelada en la venta. El costo, de la mercancía congelada llevada a
-- BCV con la brecha de ESE día, más los gastos, que ya se guardaron en
-- BCV. Nada se recalcula con las tasas de hoy.
--
-- La merma no entra aquí: en una venta ya hecha el costo de la pieza es
-- el que se pagó por ella. La merma es una provisión para fijar precios,
-- no un gasto de esa línea.
-- ---------------------------------------------------------------------

create view v_ventas_por_dia
with (security_invoker = off) as
select
  v.fecha::date                                as dia,
  count(*)                                     as ventas,
  coalesce(sum(m.piezas), 0)                   as piezas,
  coalesce(sum(v.total_bs), 0)                 as total_bs,
  coalesce(sum(v.total_bs / v.tasa_bcv_usada), 0) as total_usd,
  coalesce(sum(m.costo_usd), 0)                as costo_usd,
  coalesce(sum(v.total_bs / v.tasa_bcv_usada - m.costo_usd), 0) as ganancia_usd
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum((i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                  + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad), 0) as costo_usd
  from venta_items i where i.venta_id = v.id
) m on true
where not v.anulada
  and es_admin()
group by v.fecha::date;

create view v_mezcla_grupo
with (security_invoker = off) as
select
  coalesce(g.nombre, 'Sin grupo') as grupo,
  coalesce(g.orden, 999)          as orden,
  sum(i.cantidad)                 as piezas,
  sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada) as ingreso_usd,
  sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada
      - (i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
         + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad) as ganancia_usd
from venta_items i
join ventas v   on v.id = i.venta_id and not v.anulada
join modelos mo on mo.id = i.modelo_id
left join grupos_precio g on g.id = mo.grupo_precio_id
where es_admin()
group by coalesce(g.nombre, 'Sin grupo'), coalesce(g.orden, 999);

create view v_rotacion_modelo
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
    max(v.fecha)    as ultima_venta,
    sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada
        - (i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
           + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad) as ganancia_usd
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
  where i.modelo_id = mo.id
) x on true
where mo.activo and es_admin();

-- ---------------------------------------------------------------------
-- EL DIAGNÓSTICO, TODO EN LA MISMA MONEDA
--
-- Ya no hace falta convertir el objetivo: los costos nacen en BCV y el
-- objetivo estaba en BCV. La conversión que metió esquema-objetivo-bcv
-- deja de ser necesaria porque el problema se arregló en la raíz.
-- ---------------------------------------------------------------------

create view v_diagnostico
with (security_invoker = off) as
with gastos as (
  select
    coalesce((select sum(valor) from configuracion
               where clave in ('gasto_alquiler_mes_usd', 'gasto_sueldos_mes_usd',
                               'gasto_servicios_mes_usd', 'gasto_otros_mes_usd')), 0)
    + coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                 where activo and amortizar_meses > 0 and moneda = 'bcv'), 0)
    + (coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                  where activo and amortizar_meses > 0 and moneda = 'real'), 0)
       + coalesce((select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd))
                     from lotes), 0)
         / greatest(coalesce((select valor from configuracion where clave = 'capex_amortizar_meses'), 24), 1)
      ) * coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1)
    as gastos_mes
),
base as (
  select
    (select gastos_mes from gastos)                         as gastos_mes,
    volumen_mensual_estimado()                              as volumen,
    coalesce(costo_operativo_por_pieza(), 0)                as operativo,
    coalesce(factor_merma(), 1)                             as merma,
    coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as factor,
    coalesce((select valor from configuracion where clave = 'ganancia_mensual_objetivo_usd'), 0) as objetivo,
    coalesce((select valor from configuracion where clave = 'piezas_danadas_mes'), 0) as danadas,
    coalesce((select valor from configuracion where clave = 'piezas_inventario_objetivo'), 0) as piezas_objetivo,
    greatest(coalesce((select valor from configuracion where clave = 'meses_rotacion_objetivo'), 3), 1) as meses_rot,
    coalesce((select sum(cantidad) from existencias), 0)     as piezas_cargadas,
    (select origen from v_volumen)                          as volumen_origen
),
catalogo as (
  select
    count(*)                                                as modelos,
    coalesce(avg(m.costo_puesto_usd), 0)                    as costo_merc_real,
    coalesce(avg(coalesce(m.precio_override_usd, g.precio_usd)), 0) as precio_bcv_prom
  from modelos m
  left join grupos_precio g on g.id = m.grupo_precio_id
  where m.activo
),
calc as (
  select
    b.*, c.modelos, c.costo_merc_real, c.precio_bcv_prom,
    round(c.costo_merc_real * b.factor * b.merma, 4)                        as costo_merc_bcv,
    round(c.costo_merc_real * b.factor * b.merma + b.operativo, 4)          as costo_total_bcv
  from base b cross join catalogo c
)
select
  gastos_mes                                            as gastos_mes_usd,
  piezas_cargadas,
  piezas_objetivo,
  meses_rot                                             as meses_rotacion,
  volumen                                               as volumen_mes,
  volumen_origen,
  operativo                                             as costo_operativo_pieza_usd,
  danadas                                               as piezas_danadas_mes,
  round((merma - 1) * 100, 2)                           as merma_pct,
  modelos,
  round(costo_merc_real, 4)                             as costo_mercancia_real_usd,
  costo_merc_bcv                                        as costo_mercancia_promedio_usd,
  costo_total_bcv                                       as costo_total_promedio_usd,
  round(precio_bcv_prom, 2)                             as precio_bcv_promedio,
  objetivo                                              as ganancia_objetivo_mes_usd,

  -- margen = objetivo / (volumen x costo + objetivo). Todo en BCV.
  case when volumen > 0 and costo_total_bcv > 0 and objetivo > 0
       then round((objetivo / (volumen * costo_total_bcv + objetivo)) * 100, 1)
       end                                              as margen_sugerido_pct,

  case when volumen > 0 and costo_total_bcv > 0 and objetivo > 0
       then round(costo_total_bcv
                  / (1 - (objetivo / (volumen * costo_total_bcv + objetivo))), 2)
       end                                              as precio_sugerido_promedio_bcv,

  case when precio_bcv_prom > 0
       then round(((precio_bcv_prom - costo_total_bcv) / precio_bcv_prom) * 100, 1)
       end                                              as margen_actual_pct,

  round(volumen * (precio_bcv_prom - costo_total_bcv), 2) as ganancia_proyectada_mes_usd,

  -- Cuántas piezas hay que vender para pagar la tienda: cada una aporta
  -- su precio menos lo que costó reponerla.
  case when (precio_bcv_prom - costo_merc_bcv) > 0
       then ceil(gastos_mes / (precio_bcv_prom - costo_merc_bcv))
       end                                              as piezas_equilibrio
from calc
where es_admin();

grant select on v_diagnostico to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- LAS BARRAS DE RECUPERACIÓN, TAMBIÉN EN BCV
--
-- La mercancía se sigue midiendo en dólares reales contra dólares
-- reales: se compró en Binance y se recupera al precio que se pagó, así
-- que el porcentaje es exacto sin convertir nada.
--
-- Los activos no: los exhibidores vinieron de afuera y los muebles se
-- compraron aquí. Se llevan todos a BCV, que es la moneda en la que
-- entra la ganancia que los va a pagar.
-- ---------------------------------------------------------------------

-- El margen por venta tambien pasa a BCV, como los demas reportes.
create view v_margen_ventas
with (security_invoker = off) as
select
  v.id,
  v.fecha,
  v.tipo,
  v.metodo,
  round(v.total_bs / v.tasa_bcv_usada, 4) as total_usd,
  round(coalesce(sum((i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                      + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad), 0), 4) as costo_total_usd,
  round(v.total_bs / v.tasa_bcv_usada
        - coalesce(sum((i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                        + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad), 0), 4) as ganancia_usd
from ventas v
left join venta_items i on i.venta_id = v.id
where not v.anulada
  and es_admin()
group by v.id, v.fecha, v.tipo, v.metodo, v.total_bs, v.tasa_bcv_usada, v.tasa_venta_usada;

grant select on v_margen_ventas to authenticated;

create view v_recuperacion
with (security_invoker = off) as
with f as (
  select coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as factor
),
vendido as (
  select
    coalesce(sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada), 0)  as ingreso_bcv,
    coalesce(sum(i.costo_puesto_usd_snap * i.cantidad), 0)                  as costo_mercancia_real,
    coalesce(sum(i.costo_puesto_usd_snap * i.cantidad
                 * (v.tasa_venta_usada / v.tasa_bcv_usada)), 0)             as costo_mercancia_bcv,
    coalesce(sum(coalesce(i.costo_operativo_usd_snap, 0) * i.cantidad), 0)  as costo_gastos_bcv,
    coalesce(sum(i.cantidad), 0)                                            as piezas
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
),
invertido as (
  select
    coalesce((select sum(costo_mercancia_usd + flete_mercancia_usd) from lotes), 0) as mercancia_real,
    coalesce((select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd)) from lotes), 0) as exhibidores_real,
    coalesce((select sum(monto_usd) from inversiones where activo and moneda = 'bcv'), 0)  as mobiliario_bcv,
    coalesce((select sum(monto_usd) from inversiones where activo and moneda = 'real'), 0) as mobiliario_real
)
select
  i.mercancia_real                                       as invertido_mercancia_usd,
  round(i.exhibidores_real * f.factor, 2)                as invertido_exhibidores_usd,
  round(i.mobiliario_bcv + i.mobiliario_real * f.factor, 2) as invertido_mobiliario_usd,
  round((i.exhibidores_real + i.mobiliario_real) * f.factor + i.mobiliario_bcv, 2) as invertido_activos_usd,
  round(i.mercancia_real * f.factor
        + (i.exhibidores_real + i.mobiliario_real) * f.factor
        + i.mobiliario_bcv, 2)                           as invertido_total_usd,

  d.costo_mercancia_real                                 as mercancia_recuperada_usd,
  greatest(i.mercancia_real - d.costo_mercancia_real, 0) as mercancia_en_vitrina_usd,

  round(d.ingreso_bcv - d.costo_mercancia_bcv - d.costo_gastos_bcv, 4) as ganancia_acumulada_usd,
  round(d.ingreso_bcv, 4)                                as ingreso_acumulado_usd,
  d.piezas                                               as piezas_vendidas,

  case when ((i.exhibidores_real + i.mobiliario_real) * f.factor + i.mobiliario_bcv) > 0
       then least(round(((d.ingreso_bcv - d.costo_mercancia_bcv - d.costo_gastos_bcv)
                         / ((i.exhibidores_real + i.mobiliario_real) * f.factor + i.mobiliario_bcv)) * 100, 1), 999)
       end                                               as activos_recuperado_pct,
  case when i.mercancia_real > 0
       then least(round((d.costo_mercancia_real / i.mercancia_real) * 100, 1), 100)
       end                                               as mercancia_recuperada_pct
from invertido i
cross join vendido d
cross join f
where es_admin();

grant select on v_recuperacion to authenticated;

create view v_equilibrio
with (security_invoker = off) as
with gastos as (
  select
    coalesce((select sum(valor) from configuracion
               where clave in ('gasto_alquiler_mes_usd', 'gasto_sueldos_mes_usd',
                               'gasto_servicios_mes_usd', 'gasto_otros_mes_usd')), 0)
    + coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                 where activo and amortizar_meses > 0 and moneda = 'bcv'), 0)
    + (coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                  where activo and amortizar_meses > 0 and moneda = 'real'), 0)
       + coalesce((select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd))
                     from lotes), 0)
         / greatest(coalesce((select valor from configuracion where clave = 'capex_amortizar_meses'), 24), 1)
      ) * coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1)
    as gastos_mes
),
promedio as (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada)
             - sum(i.costo_puesto_usd_snap * i.cantidad
                   * (v.tasa_venta_usada / v.tasa_bcv_usada)), 0) as contribucion_bcv
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
)
select
  round(g.gastos_mes, 4)                                          as gastos_mes_usd,
  p.piezas                                                        as piezas_vendidas,
  case when p.piezas > 0 then round(p.contribucion_bcv / p.piezas, 4) end as contribucion_por_pieza_usd,
  case when p.piezas > 0 and p.contribucion_bcv > 0
       then ceil(g.gastos_mes / (p.contribucion_bcv / p.piezas))
       end                                                        as piezas_para_equilibrio
from promedio p
cross join gastos g
where es_admin();

grant select on v_equilibrio to authenticated;

grant select on v_ventas_por_dia   to authenticated;
grant select on v_mezcla_grupo     to authenticated;
grant select on v_rotacion_modelo  to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select * from v_lotes_admin;    -> flete_por_unidad_usd = flete / bultos
--   select * from v_volumen;        -> origen 'estimado' hasta la 1a venta
--   select * from v_diagnostico;    -> todo en BCV, merma 0 si no hay dañadas
--   select sku, costo_puesto_usd, costo_total_usd, margen_pct
--     from v_catalogo_admin order by sku;
-- =====================================================================
