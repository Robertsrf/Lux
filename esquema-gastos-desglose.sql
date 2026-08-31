-- =====================================================================
-- Lux by Emory — los gastos del mes, partida por partida
-- Ejecutar en el SQL Editor DESPUÉS de esquema-pedido-completo.sql
--
-- POR QUÉ
-- `v_diagnostico` da el total de gastos del mes en una sola cifra. Para
-- dibujarlo hace falta el desglose: cuánto es alquiler, cuánto sueldos,
-- cuánto se está amortizando de exhibidores. Un total no dice dónde
-- apretar.
--
-- TODO EN DÓLARES BCV
-- Alquiler, sueldos, servicios, otros y empaque se pagan aquí. Los
-- exhibidores y las inversiones traídas de afuera se compraron en
-- Binance, así que se convierten con la brecha antes de sumarlas. Es la
-- misma cuenta de `gastos_fijos_mes_bcv()`, abierta en filas.
--
-- SEGURIDAD
-- Esto es la nómina. La vista filtra con es_admin() por dentro, como
-- v_diagnostico: la vendedora recibe cero filas, no un error.
-- =====================================================================

create or replace view v_gastos_desglose
with (security_invoker = off) as
with f as (
  select coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1) as factor,
         greatest(coalesce((select valor from configuracion
                             where clave = 'capex_amortizar_meses'), 24), 1) as meses,
         greatest(volumen_mensual_estimado(), 0) as volumen
),
partidas as (
  -- Se pagan aquí: ya son dólares BCV, no se convierten.
  select 'Alquiler' as partida, 1 as orden,
         coalesce((select valor from configuracion where clave = 'gasto_alquiler_mes_usd'), 0) as monto
  union all
  select 'Sueldos', 2,
         coalesce((select valor from configuracion where clave = 'gasto_sueldos_mes_usd'), 0)
  union all
  select 'Servicios', 3,
         coalesce((select valor from configuracion where clave = 'gasto_servicios_mes_usd'), 0)
  union all
  select 'Otros fijos', 4,
         coalesce((select valor from configuracion where clave = 'gasto_otros_mes_usd'), 0)
  union all
  -- El empaque depende de cuántas piezas se vendan, no del calendario.
  select 'Empaque', 5,
         coalesce((select valor from configuracion where clave = 'empaque_por_pieza_usd'), 0)
         * (select volumen from f)
  union all
  select 'Muebles', 6,
         coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                    where activo and amortizar_meses > 0 and moneda = 'bcv'), 0)
  union all
  -- Vino de afuera: se compró en Binance y se trae a BCV.
  select 'Muebles importados', 7,
         coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                    where activo and amortizar_meses > 0 and moneda = 'real'), 0)
         * (select factor from f)
  union all
  select 'Exhibidores', 8,
         coalesce((select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd))
                     from lotes), 0)
         / (select meses from f) * (select factor from f)
)
select
  p.partida,
  p.orden,
  round(p.monto, 2) as monto_usd,
  case when (select sum(monto) from partidas) > 0
       then round(p.monto / (select sum(monto) from partidas) * 100, 1)
       end as porcentaje
from partidas p
-- Una partida en cero no se dibuja: ensucia el gráfico sin decir nada.
where p.monto > 0
  and es_admin()
order by p.monto desc;

grant select on v_gastos_desglose to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select * from v_gastos_desglose;
--     -> la suma de monto_usd debe dar el mismo gastos_mes_usd que
--        muestra v_diagnostico, salvo el empaque: el diagnóstico lo
--        cuenta por pieza y aquí se multiplica por el volumen del mes.
--
--   Con sesión de vendedora: 0 filas.
-- =====================================================================
