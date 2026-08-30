-- =====================================================================
-- YA NO SE CORRE. Reemplazado por esquema-flete-y-gastos.sql.
--
-- Este archivo definia v_diagnostico con el modelo viejo: flete por peso, gastos
-- multiplicados por la brecha y una merma fija de 5 %. Todo eso se corrigio.
--
-- Volver a correrlo no falla de frente: revierte esas formulas a la version
-- vieja EN SILENCIO, porque la clave `merma_pct` ya no existe y coalesce la
-- vuelve 0 sin avisar. Los margenes volverian a estar mal y nada lo diria.
--
-- Se queda en el repo como historia de por que el modelo es como es.
-- =====================================================================

do $guarda$
begin
  raise exception
    'Este archivo quedo obsoleto: corre esquema-flete-y-gastos.sql en su lugar.';
end
$guarda$;

-- =====================================================================
-- Lux by Emory — el objetivo de ganancia se fija en DÓLARES BCV
-- Ejecutar en el SQL Editor DESPUÉS de esquema-diagnostico.sql
--
-- EL ERROR QUE CORRIGE
-- El objetivo mensual se estaba tratando como dólares reales, los de
-- recomprar a tasa Binance. Pero el dueño piensa en dólares BCV, que es
-- como habla con la clienta y como están todos los precios.
--
-- No es un detalle de nombres: son cantidades de dinero distintas.
--   $500 reales = Bs 472.500
--   $500 BCV    = Bs 397.495
-- Y por eso exigían márgenes distintos: 36,4 % contra 32,5 %.
--
-- OJO CON LO QUE NO CAMBIA
-- El margen POR PIEZA es el mismo en las dos monedas: 45 % sobre un costo
-- de $5,14 BCV y 45 % sobre $4,32 reales dan el mismo porcentaje, porque
-- dividir numerador y denominador por la brecha no altera una razón. Lo
-- que cambia es solo la conversión del objetivo mensual.
-- =====================================================================

update configuracion
   set descripcion = 'Cuánto quieres que te quede libre al mes, en dólares BCV'
 where clave = 'ganancia_mensual_objetivo_usd';

create or replace view v_diagnostico
with (security_invoker = off) as
with base as (
  select
    coalesce((select sum(valor) from configuracion
               where clave in ('gasto_alquiler_mes_usd', 'gasto_sueldos_mes_usd',
                               'gasto_servicios_mes_usd', 'gasto_otros_mes_usd')), 0)
    + coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                 where activo and amortizar_meses is not null), 0)
    + coalesce((select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd)) from lotes), 0)
      / greatest(coalesce((select valor from configuracion where clave = 'capex_amortizar_meses'), 24), 1)
                                                                        as gastos_mes,
    volumen_mensual_estimado()                                          as volumen,
    coalesce(costo_operativo_por_pieza(), 0)                            as operativo,
    least(coalesce((select valor from configuracion where clave = 'merma_pct'), 0), 90) as merma,
    coalesce((select valor from configuracion where clave = 'ganancia_mensual_objetivo_usd'), 0) as objetivo_bcv,
    coalesce((select valor from configuracion where clave = 'piezas_inventario_objetivo'), 0) as piezas_objetivo,
    greatest(coalesce((select valor from configuracion where clave = 'meses_rotacion_objetivo'), 3), 1) as meses_rot,
    coalesce((select sum(cantidad) from existencias), 0)                 as piezas_cargadas,
    (select tasa_venta / tasa_bcv from tasas where vigente limit 1)      as factor
),
catalogo as (
  select
    count(*)                                                as modelos,
    coalesce(avg(m.costo_puesto_usd), 0)                    as costo_merc_prom,
    coalesce(avg(coalesce(m.precio_override_usd, g.precio_usd)), 0) as precio_bcv_prom
  from modelos m
  left join grupos_precio g on g.id = m.grupo_precio_id
  where m.activo
),
calc as (
  select
    b.*, c.modelos, c.costo_merc_prom, c.precio_bcv_prom,
    round((c.costo_merc_prom + b.operativo) / (1 - b.merma / 100), 4) as costo_total_prom,
    case when coalesce(b.factor, 0) > 0 then c.precio_bcv_prom / b.factor else 0 end as precio_real_prom,
    -- El objetivo llega en dólares BCV y el costo está en reales: se
    -- traen a la misma moneda antes de despejar el margen.
    case when coalesce(b.factor, 0) > 0 then b.objetivo_bcv / b.factor else 0 end as objetivo_real
  from base b cross join catalogo c
)
select
  gastos_mes                                            as gastos_mes_usd,
  piezas_cargadas,
  piezas_objetivo,
  meses_rot                                             as meses_rotacion,
  volumen                                               as volumen_mes,
  operativo                                             as costo_operativo_pieza_usd,
  merma                                                 as merma_pct,
  modelos,
  round(costo_merc_prom, 4)                             as costo_mercancia_promedio_usd,
  costo_total_prom                                      as costo_total_promedio_usd,
  round(precio_real_prom, 4)                            as precio_real_promedio_usd,
  round(precio_bcv_prom, 2)                             as precio_bcv_promedio,
  objetivo_bcv                                          as ganancia_objetivo_mes_usd,

  case when volumen > 0 and costo_total_prom > 0 and objetivo_real > 0
       then round((objetivo_real / (volumen * costo_total_prom + objetivo_real)) * 100, 1)
       end                                              as margen_sugerido_pct,

  case when volumen > 0 and costo_total_prom > 0 and objetivo_real > 0 and factor > 0
       then round(costo_total_prom * factor
                  / (1 - (objetivo_real / (volumen * costo_total_prom + objetivo_real))), 2)
       end                                              as precio_sugerido_promedio_bcv,

  case when precio_real_prom > 0
       then round(((precio_real_prom - costo_total_prom) / precio_real_prom) * 100, 1)
       end                                              as margen_actual_pct,

  -- La ganancia proyectada también se reporta en dólares BCV, para que
  -- se pueda comparar de frente con el objetivo.
  round(volumen * (precio_real_prom - costo_total_prom) * coalesce(factor, 1), 2) as ganancia_proyectada_mes_usd,

  case when (precio_real_prom - costo_merc_prom) > 0
       then ceil(gastos_mes / (precio_real_prom - costo_merc_prom))
       end                                              as piezas_equilibrio
from calc
where es_admin();

grant select on v_diagnostico to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   Con objetivo de $500 BCV, 117 piezas/mes y costo total de $7,50:
--   margen_sugerido_pct debe dar 32,5 % (no 36,4 %).
-- =====================================================================
