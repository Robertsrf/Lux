-- =====================================================================
-- Lux by Emory — el costo operativo entra en el precio
-- Ejecutar en el SQL Editor DESPUÉS de esquema-guia.sql
--
-- QUÉ ARREGLA
-- Hasta ahora `costo_puesto` era mercancía + flete, y nada más. Ni el
-- alquiler, ni el sueldo, ni el empaque, ni los exhibidores. El margen
-- terminaba siendo un colchón que tapaba costos que el sistema no veía,
-- y por eso hacía falta un número absurdo como 65 % para que cuadrara.
--
-- A partir de aquí:
--
--   costo total = costo puesto + operativo por pieza
--   precio BCV  = costo total × (tasa compra / tasa BCV) ÷ (1 − margen)
--
-- Y el margen pasa a significar lo que uno cree que significa: ganancia.
--
-- EL REPARTO ES IGUAL POR PIEZA
-- Atender, empacar y despachar un anillo cuesta el mismo tiempo y el
-- mismo empaque que una cadena. Repartir los gastos por valor cargaría a
-- las piezas caras un trabajo que no causan.
--
-- LOS EXHIBIDORES SE AMORTIZAN
-- El sistema ya los aparta del costo de las joyas, que es correcto. Pero
-- apartarlos no es recuperarlos: entran aquí como gasto mensual repartido
-- en los meses que dure la inversión.
-- =====================================================================

insert into configuracion (clave, valor, descripcion) values
  ('gasto_alquiler_mes_usd',  0, 'Alquiler del local al mes, en dólares'),
  ('gasto_sueldos_mes_usd',   0, 'Sueldos al mes, en dólares'),
  ('gasto_servicios_mes_usd', 0, 'Luz, internet, agua y demás servicios al mes'),
  ('gasto_otros_mes_usd',     0, 'Cualquier otro gasto fijo mensual'),
  ('empaque_por_pieza_usd',   0, 'Caja, bolsita y paño de cada pieza vendida'),
  ('piezas_esperadas_mes',    0, 'Cuántas piezas se espera vender al mes'),
  ('capex_amortizar_meses',  24, 'En cuántos meses se recupera la inversión en exhibidores'),
  ('merma_pct',               0, 'Porcentaje de piezas que se pierden, dañan o nunca se venden')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 1. CUÁNTO CARGA CADA PIEZA DE GASTOS
-- Se calcula, no se guarda: así no puede quedar desfasado cuando suba el
-- alquiler o entre un lote nuevo de exhibidores.
-- ---------------------------------------------------------------------

create or replace function costo_operativo_por_pieza()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fijos    numeric := 0;
  v_piezas   numeric;
  v_empaque  numeric;
  v_meses    numeric;
  v_capex    numeric := 0;
begin
  select coalesce(sum(valor), 0) into v_fijos
    from configuracion
   where clave in ('gasto_alquiler_mes_usd', 'gasto_sueldos_mes_usd',
                   'gasto_servicios_mes_usd', 'gasto_otros_mes_usd');

  select valor into v_piezas  from configuracion where clave = 'piezas_esperadas_mes';
  select valor into v_empaque from configuracion where clave = 'empaque_por_pieza_usd';
  select valor into v_meses   from configuracion where clave = 'capex_amortizar_meses';

  -- Exhibidores de todos los lotes: su costo mas la parte del flete que
  -- les toco. Es exactamente lo que el sistema ya aparta como CAPEX.
  select coalesce(sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd)), 0)
    into v_capex
    from lotes;

  if coalesce(v_meses, 0) > 0 then
    v_fijos := v_fijos + (v_capex / v_meses);
  end if;

  if coalesce(v_piezas, 0) <= 0 then
    -- Sin una estimacion de volumen no se puede repartir nada.
    return coalesce(v_empaque, 0);
  end if;

  return round((v_fijos / v_piezas) + coalesce(v_empaque, 0), 4);
end;
$$;

revoke all on function costo_operativo_por_pieza() from public, anon;
grant execute on function costo_operativo_por_pieza() to authenticated;

-- ---------------------------------------------------------------------
-- 2. EL PRECIO SUGERIDO PARTE DEL COSTO DE VERDAD
-- Devuelve todos los pasos para que el formulario muestre el porqué y no
-- solo el resultado.
-- ---------------------------------------------------------------------

create or replace function admin_sugerir_precio(
  p_lote_id    bigint,
  p_peso_g     numeric,
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
  v_merma       numeric(12,4);
  v_total       numeric(12,4);
  v_factor      numeric;
  v_total_bcv   numeric(12,4);
  v_margen      numeric;
  v_precio_bcv  numeric(12,4);
  v_grupo       grupos_precio%rowtype;
  v_grupo_real  numeric(12,4);
  v_margen_real numeric;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede calcular precios.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fijala antes de calcular precios.';
  end if;

  v_flete  := calcular_flete_unitario(p_lote_id, p_peso_g, p_costo_usd);
  v_puesto := coalesce(p_costo_usd, 0) + coalesce(v_flete, 0);

  -- Lo que la pieza carga de alquiler, sueldo, servicios, empaque y
  -- exhibidores amortizados.
  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  -- Las piezas que se venden pagan tambien por las que se pierden.
  select coalesce(valor, 0) into v_merma from configuracion where clave = 'merma_pct';
  v_merma := least(coalesce(v_merma, 0), 90);
  v_total := round((v_puesto + v_operativo) / (1 - v_merma / 100), 4);

  v_factor    := v_tasa.tasa_venta / v_tasa.tasa_bcv;
  v_total_bcv := round(v_total * v_factor, 4);

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

  if v_grupo.id is not null then
    v_grupo_real  := round(v_grupo.precio_usd / v_factor, 4);
    v_margen_real := case when v_grupo_real > 0
                          then round(((v_grupo_real - v_total) / v_grupo_real) * 100, 2)
                          else null end;
  end if;

  return jsonb_build_object(
    'flete_unitario_usd',    v_flete,
    'costo_puesto_usd',      v_puesto,
    'costo_operativo_usd',   v_operativo,
    'merma_pct',             v_merma,
    'costo_total_usd',       v_total,
    'factor_brecha',         round(v_factor, 4),
    'costo_en_bcv',          v_total_bcv,
    'margen_objetivo_pct',   round(v_margen * 100, 2),
    'precio_sugerido_bcv',   v_precio_bcv,
    'grupo_id',              v_grupo.id,
    'grupo_nombre',          v_grupo.nombre,
    'grupo_precio_bcv',      v_grupo.precio_usd,
    'grupo_alcanza',         coalesce(v_grupo.precio_usd >= v_precio_bcv, false),
    'precio_grupo_real',     v_grupo_real,
    'margen_resultante_pct', v_margen_real);
end;
$$;

revoke all on function admin_sugerir_precio(bigint, numeric, numeric, numeric) from public, anon;
grant execute on function admin_sugerir_precio(bigint, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 3. EL PISO DE REGATEO TAMBIÉN CUENTA LOS GASTOS
-- Si no, protegería un margen que no existe: la vendedora podría bajar
-- hasta un precio que cubre la mercancía pero no el alquiler.
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
  v_total      numeric(12,4);
  v_merma      numeric(12,4);
  v_tasa       tasas%rowtype;
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

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    return v_precio;
  end if;

  select coalesce(valor, 0) into v_merma from configuracion where clave = 'merma_pct';
  v_merma := least(coalesce(v_merma, 0), 90);
  v_total := (coalesce(v_costo, 0) + coalesce(costo_operativo_por_pieza(), 0)) / (1 - v_merma / 100);

  select valor into v_desc_max   from configuracion where clave = 'descuento_max_mostrador_pct';
  select valor into v_margen_min from configuracion where clave = 'margen_minimo_pct';
  v_desc_max   := least(coalesce(v_desc_max, 0), 99);
  v_margen_min := least(coalesce(v_margen_min, 0), 99);

  v_piso_desc := v_precio * (1 - v_desc_max / 100);
  v_piso_marg := (v_total * (v_tasa.tasa_venta / v_tasa.tasa_bcv)) / (1 - v_margen_min / 100);

  return round(least(v_precio, greatest(v_piso_desc, v_piso_marg)), 2);
end;
$$;

revoke all on function precio_minimo_de(bigint) from public, anon;
grant execute on function precio_minimo_de(bigint) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select costo_operativo_por_pieza();
--   select admin_sugerir_precio(null, 0, 11.8566);
-- =====================================================================
