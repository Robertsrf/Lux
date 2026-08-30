-- =====================================================================
-- YA NO SE CORRE. Reemplazado por esquema-flete-y-gastos.sql.
--
-- Este archivo definia volumen_mensual_estimado() y v_diagnostico con el modelo viejo: flete por peso, gastos
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
-- Lux by Emory — el sistema calcula el volumen y sugiere el margen
-- Ejecutar en el SQL Editor DESPUÉS de esquema-margen-real.sql
--
-- QUÉ CAMBIA Y POR QUÉ
-- `piezas_esperadas_mes` era una pregunta injusta: nadie sabe cuántas
-- piezas venderá, y sin embargo de ese número colgaba el costo por pieza,
-- el precio y el margen. Se sustituye por dos cosas que sí se saben:
--
--   piezas_inventario_objetivo : cuántas piezas maneja la tienda llena
--   meses_rotacion_objetivo    : en cuánto tiempo quieres venderlas
--
--   volumen al mes = objetivo / meses de rotación
--
-- Y el margen deja de teclearse: se DEDUCE de cuánto quieres ganar.
--
--   ganancia por pieza = costo total × margen / (1 − margen)
--   ganancia al mes    = volumen × esa ganancia
--   despejando:  margen = objetivo / (volumen × costo total + objetivo)
--
-- Así el número sale del negocio y no de la intuición de nadie.
-- =====================================================================

insert into configuracion (clave, valor, descripcion) values
  ('piezas_inventario_objetivo', 0, 'Cuántas piezas maneja la tienda cuando está surtida'),
  ('meses_rotacion_objetivo',    3, 'En cuántos meses quieres vender todo el inventario'),
  ('ganancia_mensual_objetivo_usd', 0, 'Cuánto quieres que te quede libre al mes, ya con todo pagado')
on conflict (clave) do nothing;

-- Si ya venía un estimado manual, se usa como objetivo de inventario
-- para no perder el dato.
update configuracion set valor = (
  select valor * 3 from configuracion where clave = 'piezas_esperadas_mes'
)
where clave = 'piezas_inventario_objetivo'
  and valor = 0
  and (select valor from configuracion where clave = 'piezas_esperadas_mes') > 0;

-- ---------------------------------------------------------------------
-- 1. EL VOLUMEN SE DEDUCE
-- Si no hay objetivo de inventario, se cae a las piezas realmente
-- cargadas: es peor estimación, pero nunca deja el cálculo sin base.
-- ---------------------------------------------------------------------

create or replace function volumen_mensual_estimado()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_objetivo numeric;
  v_meses    numeric;
  v_reales   numeric;
begin
  select valor into v_objetivo from configuracion where clave = 'piezas_inventario_objetivo';
  select valor into v_meses    from configuracion where clave = 'meses_rotacion_objetivo';
  select coalesce(sum(cantidad), 0) into v_reales from existencias;

  v_meses := greatest(coalesce(v_meses, 3), 1);
  if coalesce(v_objetivo, 0) <= 0 then
    v_objetivo := v_reales;
  end if;
  if v_objetivo <= 0 then
    return 0;
  end if;

  return round(v_objetivo / v_meses, 2);
end;
$$;

revoke all on function volumen_mensual_estimado() from public, anon;
grant execute on function volumen_mensual_estimado() to authenticated;

create or replace function costo_operativo_por_pieza()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fijos   numeric := 0;
  v_volumen numeric;
  v_empaque numeric;
  v_meses   numeric;
  v_capex   numeric := 0;
  v_manual  numeric := 0;
begin
  select coalesce(sum(valor), 0) into v_fijos
    from configuracion
   where clave in ('gasto_alquiler_mes_usd', 'gasto_sueldos_mes_usd',
                   'gasto_servicios_mes_usd', 'gasto_otros_mes_usd');

  select valor into v_empaque from configuracion where clave = 'empaque_por_pieza_usd';
  select valor into v_meses   from configuracion where clave = 'capex_amortizar_meses';

  select coalesce(sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd)), 0)
    into v_capex from lotes;
  if coalesce(v_meses, 0) > 0 then
    v_fijos := v_fijos + (v_capex / v_meses);
  end if;

  select coalesce(sum(monto_usd / amortizar_meses), 0) into v_manual
    from inversiones where activo and amortizar_meses is not null;
  v_fijos := v_fijos + v_manual;

  v_volumen := volumen_mensual_estimado();
  if coalesce(v_volumen, 0) <= 0 then
    return coalesce(v_empaque, 0);
  end if;

  return round((v_fijos / v_volumen) + coalesce(v_empaque, 0), 4);
end;
$$;

revoke all on function costo_operativo_por_pieza() from public, anon;
grant execute on function costo_operativo_por_pieza() to authenticated;

-- ---------------------------------------------------------------------
-- 2. EL DIAGNÓSTICO DEL NEGOCIO
-- Una sola fila con todo lo que hace falta para responder: ¿cuánto debo
-- vender, a qué margen, y me da o no me da?
-- ---------------------------------------------------------------------

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
    coalesce((select valor from configuracion where clave = 'ganancia_mensual_objetivo_usd'), 0) as objetivo,
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
    case when coalesce(b.factor, 0) > 0 then c.precio_bcv_prom / b.factor else 0 end as precio_real_prom
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
  objetivo                                              as ganancia_objetivo_mes_usd,

  -- El margen que hace falta para llegar al objetivo mensual.
  case when volumen > 0 and costo_total_prom > 0 and objetivo > 0
       then round((objetivo / (volumen * costo_total_prom + objetivo)) * 100, 1)
       end                                              as margen_sugerido_pct,

  -- A cuánto habría que vender la pieza promedio con ese margen.
  case when volumen > 0 and costo_total_prom > 0 and objetivo > 0 and factor > 0
       then round(costo_total_prom * factor
                  / (1 - (objetivo / (volumen * costo_total_prom + objetivo))), 2)
       end                                              as precio_sugerido_promedio_bcv,

  -- Lo que dejan los precios que ya tienes puestos.
  case when precio_real_prom > 0
       then round(((precio_real_prom - costo_total_prom) / precio_real_prom) * 100, 1)
       end                                              as margen_actual_pct,
  round(volumen * (precio_real_prom - costo_total_prom), 2) as ganancia_proyectada_mes_usd,

  -- Cuántas piezas tapan los gastos, con los precios actuales.
  case when (precio_real_prom - costo_merc_prom) > 0
       then ceil(gastos_mes / (precio_real_prom - costo_merc_prom))
       end                                              as piezas_equilibrio
from calc
where es_admin();

grant select on v_diagnostico to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select * from v_diagnostico;
-- =====================================================================
