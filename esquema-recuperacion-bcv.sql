-- =====================================================================
-- Lux by Emory — la recuperación, toda en la misma moneda
-- Ejecutar en el SQL Editor DESPUÉS de esquema-piso-precio.sql
--
-- EL FALLO
-- La pantalla mostraba dos cifras juntas, en monedas distintas, sin
-- decirlo:
--
--   Mercancía   $854,31    <- dólares Binance
--   Muebles   $1.842,72    <- dólares BCV
--
-- Y el total de la vista sí las convertía, así que las partes no
-- cuadraban con el total: $854 + $1.843 no da los $2.856 que salían.
-- Cualquiera que intente comprobar la suma se vuelve loco.
--
-- Lo escribí así a propósito y me equivoqué. El razonamiento era que la
-- mercancía se compra y se recupera en Binance, así que el porcentaje
-- sale exacto sin convertir. Y es cierto para el PORCENTAJE. Pero las
-- cifras absolutas se leen juntas, y ahí la moneda tiene que ser una
-- sola.
--
-- CÓMO QUEDA
-- Todo en dólares BCV, como el resto del sistema. La mercancía sale
-- además en Binance, en su propia columna y con su propio nombre, porque
-- esa es la cifra que hace falta para saber cuánto juntar y reponer.
--
-- Los porcentajes no cambian: dividir arriba y abajo por la misma brecha
-- da lo mismo.
-- =====================================================================

create or replace view v_recuperacion
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
  -- Todo lo que se muestra junto va en BCV. Ahora las partes suman el total.
  round(i.mercancia_real * f.factor, 2)                  as invertido_mercancia_usd,
  round(i.exhibidores_real * f.factor, 2)                as invertido_exhibidores_usd,
  round(i.mobiliario_bcv + i.mobiliario_real * f.factor, 2) as invertido_mobiliario_usd,
  round((i.exhibidores_real + i.mobiliario_real) * f.factor + i.mobiliario_bcv, 2) as invertido_activos_usd,
  round(i.mercancia_real * f.factor
        + (i.exhibidores_real + i.mobiliario_real) * f.factor
        + i.mobiliario_bcv, 2)                           as invertido_total_usd,

  -- Y aparte, con su propio nombre: lo que hace falta juntar en Binance
  -- para volver a comprar toda la mercancía. Es otra pregunta.
  round(i.mercancia_real, 2)                             as invertido_mercancia_real_usd,

  round(d.costo_mercancia_bcv, 2)                        as mercancia_recuperada_usd,
  round(greatest(i.mercancia_real * f.factor - d.costo_mercancia_bcv, 0), 2) as mercancia_en_vitrina_usd,

  round(d.ingreso_bcv - d.costo_mercancia_bcv - d.costo_gastos_bcv, 2) as ganancia_acumulada_usd,
  round(d.ingreso_bcv, 2)                                as ingreso_acumulado_usd,
  d.piezas                                               as piezas_vendidas,

  case when ((i.exhibidores_real + i.mobiliario_real) * f.factor + i.mobiliario_bcv) > 0
       then least(round(((d.ingreso_bcv - d.costo_mercancia_bcv - d.costo_gastos_bcv)
                         / ((i.exhibidores_real + i.mobiliario_real) * f.factor + i.mobiliario_bcv)) * 100, 1), 999)
       end                                               as activos_recuperado_pct,
  -- El porcentaje no cambia: arriba y abajo llevan la misma brecha.
  case when i.mercancia_real > 0
       then least(round((d.costo_mercancia_real / i.mercancia_real) * 100, 1), 100)
       end                                               as mercancia_recuperada_pct
from invertido i
cross join vendido d
cross join f
where es_admin();

grant select on v_recuperacion to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select invertido_mercancia_usd, invertido_activos_usd, invertido_total_usd
--     from v_recuperacion;
--     -> las dos primeras tienen que sumar EXACTAMENTE la tercera.
--        Antes daban $854 + $1.843 = $2.697 contra un total de $2.856.
--
--   invertido_mercancia_real_usd sigue siendo $854,31: es lo que hay que
--   juntar en Binance, y esa cifra no se convierte porque no es para
--   comparar, es para comprar.
-- =====================================================================
