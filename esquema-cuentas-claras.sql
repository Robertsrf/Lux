-- =====================================================================
-- Lux by Emory — cuentas claras: una sola fórmula para cada cifra
-- Ejecutar en el SQL Editor DESPUÉS de esquema-ubicacion-en-publico.sql
--
-- POR QUÉ EXISTE
-- La auditoría de septiembre de 2026 encontró que el sistema contestaba
-- la misma pregunta con números distintos según la pantalla:
--
--   "¿Cuánto cuesta el mes?"          Costos decía una cifra y Reportes otra.
--                                     Reportes metía el empaque —que se paga
--                                     por pieza— como si fuera alquiler.
--
--   "¿Cuántas piezas para no perder?" Tres respuestas: Costos, Inversiones y
--                                     Reportes, cada una con su fórmula.
--                                     Ninguna restaba el empaque.
--
--   "¿Cuánto he recuperado?"          Inversiones restaba la amortización de
--                                     los muebles como gasto y luego medía
--                                     contra el total de los muebles: la
--                                     contaba dos veces.
--
--   "¿Cuánta mercancía queda?"        Restaba lo invertido a la tasa de HOY
--                                     menos lo vendido a la tasa de CADA
--                                     VENTA. Dos tasas en una resta.
--
-- La causa de fondo era la misma en todos: la fórmula de los gastos estaba
-- copiada en tres sitios, y la de "lo que deja cada pieza" en otros tres.
-- Cada copia fue derivando por su lado.
--
-- LO QUE HACE
-- Deja una fórmula por cifra y hace que todas las pantallas lean de ella:
--
--   gastos_fijos_partidas()   los gastos fijos del mes, partida por partida
--   plan_ventas()             lo que deja cada pieza y cuántas hay que vender
--
-- Todo lo demás (Costos, Reportes, Inversiones, la meta de la vendedora)
-- sale de esas dos.
--
-- LAS DOS PALABRAS QUE ORDENAN TODO
--
--   GASTO FIJO     se paga igual venda o no venda: alquiler, sueldos,
--                  servicios, la parte del mes de los muebles y exhibidores.
--
--   GASTO VARIABLE se paga por cada pieza que sale: la mercancía y el
--                  empaque. Si no vendes, no lo pagas.
--
--   Lo que deja cada pieza = precio − mercancía − empaque.
--   Piezas para no perder  = gastos fijos ÷ lo que deja cada pieza.
--
-- Es la fórmula del punto de equilibrio de cualquier comercio, y es la
-- única cifra que el dueño necesita ver primero.
--
-- LO QUE NO CAMBIA
-- `gastos_fijos_mes_bcv()` da exactamente el mismo número que antes: el
-- costo por pieza que congela cada venta y el precio sugerido no se
-- mueven. Lo que cambia es que ahora las pantallas cuentan con él, y no
-- con copias que habían dejado de coincidir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. UN DATO NUEVO: CUÁNTOS DÍAS ABRE LA TIENDA
--
-- Con eso "vende 104 piezas al mes" pasa a ser "vende 4 cada día que
-- abres", que es como se trabaja. No se supone: arranca en 0 y, mientras
-- sea 0, las pantallas dicen la meta por mes y piden el dato.
-- ---------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion) values
  ('dias_abiertos_mes', 0, 'Cuántos días abre la tienda en un mes normal')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 1. LOS GASTOS FIJOS, PARTIDA POR PARTIDA, EN DÓLARES BCV
--
-- La ÚNICA fórmula de gastos del sistema. Lo que se compró en Binance
-- (muebles importados, exhibidores de los lotes) se lleva a BCV con la
-- brecha de hoy, porque es lo que costaría reponerlo.
--
-- El empaque NO está aquí: se paga por pieza, no por mes. Va restado en
-- lo que deja cada pieza.
--
-- Si `capex_amortizar_meses` es 0, los exhibidores no se reparten: así lo
-- hacía ya la función que fija los precios. Las vistas en cambio dividían
-- entre 1 y cargaban todos los exhibidores de golpe en un solo mes.
-- ---------------------------------------------------------------------

create or replace function gastos_fijos_partidas()
returns table (partida text, orden int, monto_bcv numeric, moneda text)
language sql
stable
security definer
set search_path = public
as $fn$
  with f as (
    select
      coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as brecha,
      coalesce((select valor from configuracion where clave = 'capex_amortizar_meses'), 0) as meses_capex
  ),
  p as (
    select 'Alquiler'::text as partida, 1 as orden,
           coalesce((select valor from configuracion where clave = 'gasto_alquiler_mes_usd'), 0) as monto_bcv,
           'bcv'::text as moneda
    union all
    select 'Sueldos', 2,
           coalesce((select valor from configuracion where clave = 'gasto_sueldos_mes_usd'), 0), 'bcv'
    union all
    select 'Servicios', 3,
           coalesce((select valor from configuracion where clave = 'gasto_servicios_mes_usd'), 0), 'bcv'
    union all
    select 'Otros fijos', 4,
           coalesce((select valor from configuracion where clave = 'gasto_otros_mes_usd'), 0), 'bcv'
    union all
    select 'Muebles', 5,
           coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                      where activo and amortizar_meses > 0 and moneda = 'bcv'), 0), 'bcv'
    union all
    select 'Muebles importados', 6,
           coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                      where activo and amortizar_meses > 0 and moneda = 'real'), 0)
           * (select brecha from f), 'binance'
    union all
    select 'Exhibidores', 7,
           case when (select meses_capex from f) > 0
                then coalesce((select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd))
                                 from lotes), 0)
                     / (select meses_capex from f) * (select brecha from f)
                else 0 end,
           'binance'
  )
  -- Sin redondear aquí: la suma se redondea una sola vez, igual que antes.
  select partida, orden, monto_bcv, moneda
    from p
   where monto_bcv > 0
   order by orden;
$fn$;

-- Devuelve el alquiler y la nómina: no se otorga a nadie. La llaman
-- funciones de definidor, donde el permiso se mira contra el dueño.
revoke all on function gastos_fijos_partidas() from public, anon, authenticated;

-- La suma. Misma firma y mismo resultado que antes: el costo por pieza que
-- congela cada venta sigue saliendo de aquí, y no se mueve.
create or replace function gastos_fijos_mes_bcv()
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select round(coalesce(sum(monto_bcv), 0), 4) from gastos_fijos_partidas();
$fn$;

revoke all on function gastos_fijos_mes_bcv() from public, anon, authenticated;

-- Las envolturas para las vistas del administrador. Una vista no presta su
-- permiso para ejecutar funciones: Postgres lo comprueba contra quien
-- consulta, que también es `authenticated`. Así que la vista llama a la
-- envoltura (otorgada), y la envoltura a la cruda (revocada).
-- Para cualquiera que no sea administrador, devuelven nada.

create or replace function gastos_fijos_admin()
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case when es_admin() then gastos_fijos_mes_bcv() end;
$fn$;

revoke all on function gastos_fijos_admin() from public, anon;
grant execute on function gastos_fijos_admin() to authenticated;

create or replace function gastos_fijos_partidas_admin()
returns table (partida text, orden int, monto_bcv numeric, moneda text)
language sql
stable
security definer
set search_path = public
as $fn$
  select * from gastos_fijos_partidas() where es_admin();
$fn$;

revoke all on function gastos_fijos_partidas_admin() from public, anon;
grant execute on function gastos_fijos_partidas_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 2. EL PLAN DE VENTAS: LO QUE DEJA CADA PIEZA Y CUÁNTAS HAY QUE VENDER
--
-- De aquí sale la cifra principal de la pantalla de Costos. Todo en
-- dólares BCV, que es la moneda de la etiqueta.
--
-- ¿PROMEDIO DE QUÉ?
-- De lo que de verdad se vendió en los últimos 90 días, si fueron al menos
-- 20 piezas: ese precio ya trae los descuentos por cantidad y los
-- regateos, que es lo que entra a caja. Con menos de 20, dos o tres
-- ventas raras moverían el promedio, así que se usa lo que hay en
-- vitrina, pesando cada modelo por cuántas piezas tiene (no es lo mismo
-- un modelo con 1 pieza que uno con 40).
--
-- LA MERCANCÍA, A LA BRECHA DE HOY
-- Esta cuenta mira hacia adelante: "cuántas tengo que vender de aquí en
-- adelante". Cada pieza que salga hay que reponerla a la tasa de hoy, así
-- que su costo se lleva a BCV con la brecha de hoy, y con la merma.
--
-- ESTE MES
-- Lo vendido en el mes calendario, y el ritmo: si llevas 40 piezas en 10
-- días, a ese paso cierras en 40 ÷ 10 × 30. Se cuenta por día de
-- calendario, cerrado o no, así que el ritmo ya trae los domingos dentro.
-- ---------------------------------------------------------------------

do $bloque$
begin
  if not exists (select 1 from pg_type where typname = 'plan_ventas_fila') then
    create type plan_ventas_fila as (
      gastos_fijos_bcv            numeric,
      empaque_bcv                 numeric,
      promedio_de                 text,
      piezas_promedio             numeric,
      precio_promedio_bcv         numeric,
      costo_promedio_binance      numeric,
      costo_promedio_bcv          numeric,
      brecha                      numeric,
      merma_pct                   numeric,
      contribucion_pieza_bcv      numeric,
      contribucion_pct            numeric,
      piezas_equilibrio_mes       numeric,
      meta_ganancia_bcv           numeric,
      piezas_meta_mes             numeric,
      dias_abiertos_mes           numeric,
      piezas_equilibrio_dia       numeric,
      piezas_meta_dia             numeric,
      vendidas_mes                numeric,
      contribucion_mes_bcv        numeric,
      dia_del_mes                 int,
      dias_del_mes                int,
      ritmo_piezas_mes            numeric,
      resultado_mes_bcv           numeric,
      resultado_proyectado_bcv    numeric,
      resultado_proyectado_binance numeric
    );
  end if;
end
$bloque$;

create or replace function plan_ventas()
returns setof plan_ventas_fila
language sql
stable
security definer
set search_path = public
as $fn$
  with t as (
    select coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as brecha
  ),
  cfg as (
    select
      coalesce(gastos_fijos_mes_bcv(), 0) as gastos,
      coalesce((select valor from configuracion where clave = 'empaque_por_pieza_usd'), 0) as empaque,
      coalesce((select valor from configuracion where clave = 'ganancia_mensual_objetivo_usd'), 0) as meta,
      coalesce((select valor from configuracion where clave = 'dias_abiertos_mes'), 0) as dias,
      coalesce(factor_merma(), 1) as merma
  ),
  vendido as (
    select
      coalesce(sum(i.cantidad), 0) as piezas,
      coalesce(sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada), 0) as ingreso_bcv,
      coalesce(sum(i.costo_puesto_usd_snap * i.cantidad), 0) as costo_binance
    from venta_items i
    join ventas v on v.id = i.venta_id and not v.anulada
    where v.fecha >= now() - interval '90 days'
  ),
  vitrina as (
    select
      coalesce(sum(e.cantidad), 0) as piezas,
      coalesce(sum(e.cantidad * coalesce(m.precio_override_usd, g.precio_usd)), 0) as precio_bcv,
      coalesce(sum(e.cantidad * m.costo_puesto_usd), 0) as costo_binance
    from existencias e
    join modelos m on m.id = e.modelo_id and m.activo
    left join grupos_precio g on g.id = m.grupo_precio_id
    where e.cantidad > 0
      and coalesce(m.precio_override_usd, g.precio_usd) is not null
  ),
  base as (
    select
      case when d.piezas >= 20 then 'ventas'
           when w.piezas > 0  then 'vitrina'
           else 'nada' end as origen,
      case when d.piezas >= 20 then d.piezas else w.piezas end as piezas,
      case when d.piezas >= 20 then d.ingreso_bcv / d.piezas
           when w.piezas > 0  then w.precio_bcv / w.piezas end as precio_bcv,
      case when d.piezas >= 20 then d.costo_binance / d.piezas
           when w.piezas > 0  then w.costo_binance / w.piezas end as costo_binance
    from vendido d cross join vitrina w
  ),
  mes as (
    select
      coalesce(sum(i.cantidad), 0) as piezas,
      coalesce(sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada
                   - i.costo_puesto_usd_snap * i.cantidad * (v.tasa_venta_usada / v.tasa_bcv_usada)), 0)
        as sin_empaque
    from venta_items i
    join ventas v on v.id = i.venta_id and not v.anulada
    where v.fecha >= date_trunc('month', now())
  ),
  cal as (
    select
      extract(day from now())::int as dia,
      extract(day from date_trunc('month', now()) + interval '1 month' - interval '1 day')::int as dias
  ),
  -- Dos "días" distintos, con nombres distintos: los que abre la tienda
  -- (para la meta diaria) y los que tiene el mes (para el ritmo).
  c as (
    select
      b.origen, b.piezas, b.precio_bcv, b.costo_binance,
      cfg.gastos, cfg.empaque, cfg.meta, cfg.dias as dias_abiertos, cfg.merma, t.brecha,
      b.costo_binance * t.brecha * cfg.merma as costo_bcv,
      b.precio_bcv - b.costo_binance * t.brecha * cfg.merma - cfg.empaque as contrib,
      mes.piezas as vendidas_mes,
      mes.sin_empaque - cfg.empaque * mes.piezas as contrib_mes,
      cal.dia, cal.dias as dias_mes
    from base b cross join cfg cross join t cross join mes cross join cal
  )
  select
    round(gastos, 2)::numeric,
    round(empaque, 4)::numeric,
    origen::text,
    piezas::numeric,
    round(precio_bcv, 2)::numeric,
    round(costo_binance, 4)::numeric,
    round(costo_bcv, 4)::numeric,
    round(brecha, 4)::numeric,
    round((merma - 1) * 100, 2)::numeric,
    round(contrib, 4)::numeric,
    (case when precio_bcv > 0 then round(contrib / precio_bcv * 100, 1) end)::numeric,
    (case when contrib > 0 then ceil(gastos / contrib) end)::numeric,
    round(meta, 2)::numeric,
    (case when contrib > 0 and meta > 0 then ceil((gastos + meta) / contrib) end)::numeric,
    dias_abiertos::numeric,
    (case when contrib > 0 and dias_abiertos > 0 then ceil(gastos / contrib / dias_abiertos) end)::numeric,
    (case when contrib > 0 and meta > 0 and dias_abiertos > 0
          then ceil((gastos + meta) / contrib / dias_abiertos) end)::numeric,
    vendidas_mes::numeric,
    round(contrib_mes, 2)::numeric,
    dia::int,
    dias_mes::int,
    (case when dia > 0 then round(vendidas_mes::numeric / dia * dias_mes, 0) end)::numeric,
    round(contrib_mes - gastos, 2)::numeric,
    (case when dia > 0 then round(contrib_mes / dia * dias_mes - gastos, 2) end)::numeric,
    (case when dia > 0 and brecha > 0
          then round((contrib_mes / dia * dias_mes - gastos) / brecha, 2) end)::numeric
  from c;
$fn$;

-- Lleva gastos y costos: no se otorga a nadie.
revoke all on function plan_ventas() from public, anon, authenticated;

create or replace function plan_ventas_admin()
returns setof plan_ventas_fila
language sql
stable
security definer
set search_path = public
as $fn$
  select * from plan_ventas() where es_admin();
$fn$;

revoke all on function plan_ventas_admin() from public, anon;
grant execute on function plan_ventas_admin() to authenticated;

create or replace view v_plan_ventas
with (security_invoker = off) as
select * from plan_ventas_admin();

grant select on v_plan_ventas to authenticated;

-- ---------------------------------------------------------------------
-- 3. LA META DEL DÍA DE LA VENDEDORA, SACADA DE LAS CUENTAS
--
-- Hasta ahora era un 4 escrito en la base al instalar, sin pantalla que lo
-- cambiara y sin relación con lo que cuesta el mes. Ahora sale del plan:
-- las piezas para la meta de ganancia, repartidas entre los días que abre
-- la tienda. Sin meta de ganancia, las piezas para no perder.
--
-- Devuelve UN número de piezas. No deja deducir ni el alquiler ni el costo
-- de nada: para despejarlos haría falta conocer otras dos cifras.
-- Mientras falte el dato de días, devuelve null y la pantalla de ella
-- sigue usando la meta que ya tenía.
-- ---------------------------------------------------------------------

create or replace function meta_del_dia()
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(piezas_meta_dia, piezas_equilibrio_dia)::int from plan_ventas();
$fn$;

revoke all on function meta_del_dia() from public, anon;
grant execute on function meta_del_dia() to authenticated;

-- ---------------------------------------------------------------------
-- 4. LAS VISTAS QUE YA EXISTÍAN, AHORA LEYENDO DE LA MISMA FUENTE
-- Mismas columnas, en el mismo orden: `create or replace` no deja
-- quitar ni mover ninguna. Lo nuevo va al final.
-- ---------------------------------------------------------------------

-- Los gastos, partida por partida. Ya no trae el empaque: no es un gasto
-- del mes, es de cada pieza.
create or replace view v_gastos_desglose
with (security_invoker = off) as
with p as (select * from gastos_fijos_partidas_admin())
select
  p.partida,
  p.orden,
  round(p.monto_bcv, 2) as monto_usd,
  case when (select sum(monto_bcv) from p) > 0
       then round(p.monto_bcv / (select sum(monto_bcv) from p) * 100, 1)
       end as porcentaje
from p
order by p.monto_bcv desc;

grant select on v_gastos_desglose to authenticated;

-- El mes, cubriéndose. Los mismos gastos que Costos y lo que dejó cada
-- venta ya sin mercancía NI empaque.
create or replace view v_cobertura_mes
with (security_invoker = off) as
select
  p.gastos_fijos_bcv                                             as gastos_mes_usd,
  -- bigint, como en la versión anterior: una vista no deja cambiar el tipo.
  p.vendidas_mes::bigint                                         as piezas_vendidas,
  p.contribucion_mes_bcv                                         as contribucion_usd,
  round(least(greatest(p.contribucion_mes_bcv, 0), p.gastos_fijos_bcv), 2) as cubierto_usd,
  round(greatest(p.gastos_fijos_bcv - p.contribucion_mes_bcv, 0), 2)       as por_cubrir_usd,
  round(greatest(p.contribucion_mes_bcv - p.gastos_fijos_bcv, 0), 2)       as ganancia_usd,
  case when p.gastos_fijos_bcv > 0
       then round(least(greatest(p.contribucion_mes_bcv, 0) / p.gastos_fijos_bcv, 1) * 100, 1)
       else 100 end                                              as cubierto_pct,
  p.contribucion_pieza_bcv                                       as contribucion_por_pieza_usd,
  case when p.gastos_fijos_bcv > p.contribucion_mes_bcv and p.contribucion_pieza_bcv > 0
       then ceil((p.gastos_fijos_bcv - p.contribucion_mes_bcv) / p.contribucion_pieza_bcv)
       end                                                       as piezas_faltantes,
  date_trunc('month', current_date)::date                        as desde
from plan_ventas_admin() p;

grant select on v_cobertura_mes to authenticated;

-- El equilibrio: ahora es el mismo número que dice Costos.
create or replace view v_equilibrio
with (security_invoker = off) as
select
  p.gastos_fijos_bcv       as gastos_mes_usd,
  (select coalesce(sum(i.cantidad), 0)
     from venta_items i join ventas v on v.id = i.venta_id and not v.anulada) as piezas_vendidas,
  p.contribucion_pieza_bcv as contribucion_por_pieza_usd,
  p.piezas_equilibrio_mes  as piezas_para_equilibrio
from plan_ventas_admin() p;

grant select on v_equilibrio to authenticated;

-- ---------------------------------------------------------------------
-- 5. LA RECUPERACIÓN DE LO INVERTIDO
--
-- Dos arreglos:
--
-- LA MERCANCÍA, EN UNA SOLA TASA. Antes se restaba lo invertido a la tasa
-- de hoy menos lo vendido a la tasa de cada venta. Ahora las dos partes se
-- cuentan en Binance —la moneda en que se compró— y se llevan juntas a BCV
-- con la brecha de hoy. Así "recuperado" y "en vitrina" suman lo invertido.
--
-- LOS MUEBLES, SIN CONTAR DOS VECES. Antes la ganancia ya traía restada
-- la parte del mes de los muebles, y después se medía contra el total de
-- los muebles: se pagaban dos veces. Ahora lo que va devolviendo la
-- inversión es lo que dejaron las ventas (sin mercancía ni empaque) menos
-- los gastos del día a día —alquiler, sueldos, servicios, otros— de los
-- meses que lleva abierta la tienda. Sin amortizaciones: esas son,
-- justamente, lo que se está devolviendo.
--
-- Los gastos de cada mes se toman con las cifras de hoy: el sistema no
-- guarda cuánto era el alquiler en marzo. La pantalla lo dice.
-- ---------------------------------------------------------------------

create or replace view v_recuperacion
with (security_invoker = off) as
with f as (
  select coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as factor,
         coalesce((select valor from configuracion where clave = 'empaque_por_pieza_usd'), 0) as empaque
),
vendido as (
  select
    coalesce(sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada), 0)  as ingreso_bcv,
    coalesce(sum(i.costo_puesto_usd_snap * i.cantidad), 0)                  as costo_mercancia_real,
    coalesce(sum(i.costo_puesto_usd_snap * i.cantidad
                 * (v.tasa_venta_usada / v.tasa_bcv_usada)), 0)             as costo_mercancia_bcv,
    coalesce(sum(i.cantidad), 0)                                            as piezas,
    min(v.fecha)                                                            as primera
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
),
invertido as (
  select
    coalesce((select sum(costo_mercancia_usd + flete_mercancia_usd) from lotes), 0) as mercancia_real,
    coalesce((select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd)) from lotes), 0) as exhibidores_real,
    coalesce((select sum(monto_usd) from inversiones where activo and moneda = 'bcv'), 0)  as mobiliario_bcv,
    coalesce((select sum(monto_usd) from inversiones where activo and moneda = 'real'), 0) as mobiliario_real
),
op as (
  select coalesce(sum(monto_bcv), 0) as mes
    from gastos_fijos_partidas_admin()
   where orden <= 4                    -- alquiler, sueldos, servicios, otros
),
x as (
  select
    i.*, d.*, f.factor, f.empaque, op.mes as gastos_operativos_mes,
    (i.exhibidores_real + i.mobiliario_real) * f.factor + i.mobiliario_bcv as activos_bcv,
    d.ingreso_bcv - d.costo_mercancia_bcv - f.empaque * d.piezas            as contribucion,
    case when d.primera is not null
         then greatest(extract(epoch from now() - d.primera)::numeric / 86400 / 30.44, 0)
         else 0 end                                                         as meses
  from invertido i cross join vendido d cross join f cross join op
)
select
  round(mercancia_real * factor, 2)                                   as invertido_mercancia_usd,
  round(exhibidores_real * factor, 2)                                 as invertido_exhibidores_usd,
  round(mobiliario_bcv + mobiliario_real * factor, 2)                 as invertido_mobiliario_usd,
  round(activos_bcv, 2)                                               as invertido_activos_usd,
  round(mercancia_real * factor + activos_bcv, 2)                     as invertido_total_usd,

  round(least(costo_mercancia_real, mercancia_real) * factor, 2)      as mercancia_recuperada_usd,
  round(greatest(mercancia_real - costo_mercancia_real, 0) * factor, 2) as mercancia_en_vitrina_usd,

  round(contribucion - gastos_operativos_mes * meses, 2)              as ganancia_acumulada_usd,
  round(ingreso_bcv, 2)                                               as ingreso_acumulado_usd,
  piezas                                                              as piezas_vendidas,

  case when activos_bcv > 0
       then least(round((contribucion - gastos_operativos_mes * meses) / activos_bcv * 100, 1), 999)
       end                                                            as activos_recuperado_pct,
  case when mercancia_real > 0
       then least(round(costo_mercancia_real / mercancia_real * 100, 1), 100)
       end                                                            as mercancia_recuperada_pct,
  round(mercancia_real, 2)                                            as invertido_mercancia_real_usd,

  -- Nuevas, al final.
  round(least(costo_mercancia_real, mercancia_real), 2)               as mercancia_vendida_real_usd,
  round(greatest(mercancia_real - costo_mercancia_real, 0), 2)        as mercancia_en_vitrina_real_usd,
  round(contribucion, 2)                                              as contribucion_acumulada_usd,
  round(gastos_operativos_mes * meses, 2)                             as gastos_operativos_acumulados_usd,
  round(meses, 1)                                                     as meses_abierta,
  round(gastos_operativos_mes, 2)                                     as gastos_operativos_mes_usd
from x
where es_admin();

grant select on v_recuperacion to authenticated;

-- ---------------------------------------------------------------------
-- 6. EL DIAGNÓSTICO, SOBRE LA MISMA BASE
--
-- Mismas columnas. Cambian tres cosas:
--   - los gastos salen de la fórmula única;
--   - el precio y el costo promedio son los del plan (pesados por lo que
--     se vende o por lo que hay en vitrina), no un promedio simple del
--     catálogo donde un modelo con 1 pieza pesaba igual que uno con 40;
--   - las piezas de equilibrio son las del plan, ya con el empaque restado.
-- ---------------------------------------------------------------------

create or replace view v_diagnostico
with (security_invoker = off) as
with plan as (select * from plan_ventas_admin()),
base as (
  select
    coalesce(gastos_fijos_admin(), 0)                 as gastos_mes,
    volumen_mensual_estimado()                        as volumen,
    coalesce(costo_operativo_admin(), 0)              as operativo,
    coalesce(factor_merma(), 1)                       as merma,
    coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as factor,
    coalesce((select valor from configuracion where clave = 'ganancia_mensual_objetivo_usd'), 0) as objetivo,
    coalesce((select valor from configuracion where clave = 'piezas_danadas_mes'), 0)          as danadas,
    coalesce((select valor from configuracion where clave = 'piezas_inventario_objetivo'), 0)  as piezas_objetivo,
    greatest(coalesce((select valor from configuracion where clave = 'meses_rotacion_objetivo'), 3), 1) as meses_rot,
    coalesce((select sum(cantidad) from existencias), 0::bigint) as piezas_cargadas,
    (select origen from v_volumen)                    as volumen_origen
),
catalogo as (
  select
    (select count(*) from modelos where activo)            as modelos,
    coalesce((select costo_promedio_binance from plan), 0) as costo_merc_real,
    coalesce((select precio_promedio_bcv from plan), 0)    as precio_bcv_prom
),
calc as (
  select b.*, c.*,
    round(c.costo_merc_real * b.factor * b.merma, 4)              as costo_merc_bcv,
    round(c.costo_merc_real * b.factor * b.merma + b.operativo, 4) as costo_total_bcv
  from base b cross join catalogo c
)
select
  gastos_mes                                        as gastos_mes_usd,
  piezas_cargadas,
  piezas_objetivo,
  meses_rot                                         as meses_rotacion,
  volumen                                           as volumen_mes,
  volumen_origen,
  operativo                                         as costo_operativo_pieza_usd,
  danadas                                           as piezas_danadas_mes,
  round((merma - 1) * 100, 2)                       as merma_pct,
  modelos,
  round(costo_merc_real, 4)                         as costo_mercancia_real_usd,
  costo_merc_bcv                                    as costo_mercancia_promedio_usd,
  costo_total_bcv                                   as costo_total_promedio_usd,
  round(precio_bcv_prom, 2)                         as precio_bcv_promedio,
  objetivo                                          as ganancia_objetivo_mes_usd,
  case when volumen > 0 and costo_total_bcv > 0 and objetivo > 0
       then round(objetivo / (volumen * costo_total_bcv + objetivo) * 100, 1) end as margen_sugerido_pct,
  case when volumen > 0 and costo_total_bcv > 0 and objetivo > 0
       then round(costo_total_bcv / (1 - objetivo / (volumen * costo_total_bcv + objetivo)), 2) end as precio_sugerido_promedio_bcv,
  case when precio_bcv_prom > 0
       then round((precio_bcv_prom - costo_total_bcv) / precio_bcv_prom * 100, 1) end as margen_actual_pct,
  round(volumen * (precio_bcv_prom - costo_total_bcv), 2) as ganancia_proyectada_mes_usd,
  (select piezas_equilibrio_mes from plan)          as piezas_equilibrio
from calc
where es_admin();

grant select on v_diagnostico to authenticated;

-- ---------------------------------------------------------------------
-- 7. LOS REPORTES DE VENTAS: LO QUE DEJÓ CADA DÍA, SIN SUPOSICIONES
--
-- La "ganancia" de estas vistas resta a cada pieza su parte del alquiler,
-- calculada con las piezas que se ESPERABA vender. Si el mes se vende
-- menos, cada pieza cargó menos alquiler del que en verdad costó, y el
-- reporte enseña una ganancia que no existe.
--
-- Por eso se añade al final `contribucion_usd`: lo que dejó cada venta
-- después de la mercancía y el empaque, y nada más. Es un hecho, no una
-- estimación. La ganancia de verdad sale de restarle los gastos del mes,
-- y eso lo hace v_cobertura_mes con el mes completo.
--
-- El empaque se toma con la cifra de hoy: el sistema no lo guardó aparte
-- en cada venta.
-- ---------------------------------------------------------------------

create or replace view v_ventas_por_dia
with (security_invoker = off) as
select
  v.fecha::date                                as dia,
  count(*)                                     as ventas,
  coalesce(sum(m.piezas), 0)                   as piezas,
  coalesce(sum(v.total_bs), 0)                 as total_bs,
  coalesce(sum(v.total_bs / v.tasa_bcv_usada), 0) as total_usd,
  coalesce(sum(m.costo_usd), 0)                as costo_usd,
  coalesce(sum(v.total_bs / v.tasa_bcv_usada - m.costo_usd), 0) as ganancia_usd,
  coalesce(sum(m.mercancia_usd), 0)            as mercancia_usd,
  coalesce(sum(v.total_bs / v.tasa_bcv_usada - m.mercancia_usd
               - m.piezas * (select coalesce((select valor from configuracion
                                               where clave = 'empaque_por_pieza_usd'), 0))), 0)
                                               as contribucion_usd
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

grant select on v_ventas_por_dia to authenticated;

create or replace view v_mezcla_grupo
with (security_invoker = off) as
select
  coalesce(g.nombre, 'Sin grupo') as grupo,
  coalesce(g.orden, 999)          as orden,
  sum(i.cantidad)                 as piezas,
  sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada) as ingreso_usd,
  sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada
      - (i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
         + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad) as ganancia_usd,
  sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada
      - i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada) * i.cantidad
      - i.cantidad * (select coalesce((select valor from configuracion
                                        where clave = 'empaque_por_pieza_usd'), 0))) as contribucion_usd
from venta_items i
join ventas v   on v.id = i.venta_id and not v.anulada
join modelos mo on mo.id = i.modelo_id
left join grupos_precio g on g.id = mo.grupo_precio_id
where es_admin()
group by coalesce(g.nombre, 'Sin grupo'), coalesce(g.orden, 999);

grant select on v_mezcla_grupo to authenticated;

-- ---------------------------------------------------------------------
-- 8. LO QUE HA COMPRADO UNA CLIENTA, EN DÓLARES BCV
--
-- `ventas.total_usd` son dólares BINANCE (bolívares ÷ tasa de venta). La
-- ficha los sumaba como "ha comprado $X", y la clienta vio etiquetas en
-- dólares BCV: el número no se parecía a nada que ella hubiera pagado.
-- `total_bcv` es la misma suma en la moneda de la etiqueta.
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
  (r.ultima_compra + make_interval(months => meses_servicio())) as servicio_hasta,
  (r.ultima_compra is not null
   and now() < r.ultima_compra + make_interval(months => meses_servicio())) as servicio_vigente,
  coalesce(r.total_bcv, 0) as total_bcv
from clientes c
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

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN, con tu sesión de administrador
--
-- 1. Que los gastos del mes sean UNA sola cifra en todo el sistema:
--
--      select gastos_mes_usd from v_diagnostico;
--      select sum(monto_usd) from v_gastos_desglose;
--      select gastos_mes_usd from v_cobertura_mes;
--      select gastos_fijos_bcv from v_plan_ventas;
--        -> las cuatro tienen que dar LO MISMO. Antes Reportes daba más,
--           porque sumaba el empaque de las piezas que se esperaba vender.
--
-- 2. Que el punto de equilibrio sea uno solo:
--
--      select piezas_equilibrio from v_diagnostico;
--      select piezas_para_equilibrio from v_equilibrio;
--      select piezas_equilibrio_mes from v_plan_ventas;
--        -> las tres iguales.
--
-- 3. Que la cuenta cuadre a mano. Con lo que devuelve:
--
--      select gastos_fijos_bcv, precio_promedio_bcv, costo_promedio_bcv,
--             empaque_bcv, contribucion_pieza_bcv, piezas_equilibrio_mes
--        from v_plan_ventas;
--
--    tiene que cumplirse:
--      contribucion = precio − costo − empaque
--      piezas       = gastos ÷ contribucion, redondeado hacia arriba
--
-- 4. Que la mercancía de Inversiones sume:
--
--      select invertido_mercancia_usd,
--             mercancia_recuperada_usd + mercancia_en_vitrina_usd
--        from v_recuperacion;
--        -> las dos columnas iguales (salvo un centavo de redondeo).
--
-- 5. Con la sesión de la VENDEDORA:
--
--      select * from v_plan_ventas;        -> 0 filas
--      select meta_del_dia();              -> un número, o null si
--                                             todavía no pusiste los días
--      select gastos_fijos_admin();        -> null
-- =====================================================================
