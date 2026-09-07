-- =====================================================================
-- Lux by Emory — el grupo se elige por el margen que deja, no por el precio
-- Ejecutar en el SQL Editor DESPUÉS de esquema-reasignar-grupos.sql
--
-- EL PROBLEMA
-- La regla era "el grupo más barato que llegue al precio ideal", o sea
-- redondear siempre hacia arriba. Suena inofensivo y no lo es: medido
-- sobre las 84 piezas cargadas, el margen promedio salía en 50,7 %
-- cuando el objetivo son 45. La escalera inflaba casi seis puntos.
--
-- Y en casos concretos era peor. Una pieza cuyo precio ideal es $14,66
-- se iba a $16, y una de $26 se iba a $30: cinco dólares de más por no
-- aceptar bajar dos puntos de margen.
--
-- LA REGLA NUEVA
--
--   el grupo más barato cuyo margen RESULTANTE llegue al piso
--
-- Un solo número, y contesta las dos preguntas a la vez: no infla el
-- precio, y no deja que el margen se caiga.
--
--   ideal $14,66  ->  antes $16 (49,6 %)   ahora $14 (42,4 %)
--   ideal $26,00  ->  antes $30 (52,3 %)   ahora $25 (42,8 %)
--
-- Con piso 40 % bajan de escalón 33 de las 84 piezas, el precio promedio
-- cae de $14,54 a $13,39 y el margen promedio queda en 46,1 %: por encima
-- del objetivo, porque las que no bajan compensan a las que sí.
--
-- SI EL PISO SE IGUALA AL OBJETIVO, VUELVE A SER LO DE ANTES.
-- No hay nada que deshacer: es un número.
--
-- LO QUE LE QUEDA A LA VENDEDORA
-- El piso de precio y el piso de regateo son cosas distintas y no se
-- pisan. El de aquí decide en qué grupo entra la pieza; el de regateo
-- -`precio_minimo_de`- decide hasta dónde puede bajar ella para cerrar.
-- Bajar el piso de precio a 40 % le deja MÁS espacio, no menos: se
-- negocia dentro de un margen más holgado.
-- =====================================================================

insert into configuracion (clave, valor, descripcion) values
  ('margen_piso_pct', 40,
   'Lo mínimo que puede dejar una pieza al caer en su grupo. Debajo del objetivo, nunca de esto.')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 1. EL PRECIO SUGERIDO ELIGE POR MARGEN
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
as $fn$
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
  v_piso        numeric;
  v_precio_bcv  numeric(12,4);
  v_grupo       grupos_precio%rowtype;
  v_margen_real numeric;
  v_desc_max    numeric;
  v_margen_min  numeric;
  v_piso_venta  numeric;
  v_margen_piso numeric;
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

  v_merc_bcv  := round(v_puesto * v_factor * v_merma, 4);
  v_operativo := coalesce(costo_operativo_por_pieza(), 0);
  v_total_bcv := round(v_merc_bcv + v_operativo, 4);

  select coalesce(p_margen_pct, valor) / 100 into v_margen
    from configuracion where clave = 'margen_objetivo_pct';
  v_margen := coalesce(v_margen, coalesce(p_margen_pct, 0) / 100);

  if v_margen >= 1 then
    raise exception 'El margen tiene que ser menor que 100 %%.';
  end if;

  -- El precio ideal sigue siendo el del objetivo: es la referencia de a
  -- dónde se apunta. Lo que cambia es cómo se elige el grupo.
  v_precio_bcv := round(v_total_bcv / (1 - v_margen), 2);

  select least(coalesce(valor, 40), v_margen * 100) into v_piso
    from configuracion where clave = 'margen_piso_pct';
  -- Sin piso cargado se usa el objetivo, que es el comportamiento viejo.
  v_piso := coalesce(v_piso, v_margen * 100);

  -- AQUÍ ESTÁ TODO EL CAMBIO: el más barato que llegue al piso, en vez del
  -- más barato que llegue al precio ideal.
  select * into v_grupo
    from grupos_precio
   where activo
     and precio_usd > 0
     and (precio_usd - v_total_bcv) / precio_usd * 100 >= v_piso - 0.001
   order by precio_usd asc
   limit 1;

  if not found then
    select * into v_grupo from grupos_precio where activo order by precio_usd desc limit 1;
  end if;

  if v_grupo.id is not null and v_grupo.precio_usd > 0 then
    v_margen_real := round(((v_grupo.precio_usd - v_total_bcv) / v_grupo.precio_usd) * 100, 2);
  end if;

  -- Hasta donde puede bajar la vendedora sin pedir permiso, con el mismo
  -- calculo de precio_minimo_de(): el mayor entre el descuento maximo de
  -- mostrador y lo que exige el margen minimo. Se devuelve aqui para que el
  -- formulario no tenga que repetir la formula y desviarse de ella.
  select valor into v_desc_max   from configuracion where clave = 'descuento_max_mostrador_pct';
  select valor into v_margen_min from configuracion where clave = 'margen_minimo_pct';
  v_desc_max   := least(coalesce(v_desc_max, 0), 99);
  v_margen_min := least(coalesce(v_margen_min, 0), 99);

  if v_grupo.precio_usd is not null then
    v_piso_venta := round(least(
      v_grupo.precio_usd,
      greatest(v_grupo.precio_usd * (1 - v_desc_max / 100),
               v_total_bcv / (1 - v_margen_min / 100))), 2);
    if v_piso_venta > 0 then
      v_margen_piso := round(((v_piso_venta - v_total_bcv) / v_piso_venta) * 100, 2);
    end if;
  end if;

  return jsonb_build_object(
    'flete_unitario_usd',    v_flete,
    'precio_minimo_bcv',     v_piso_venta,
    'margen_en_el_piso_pct', v_margen_piso,
    'costo_puesto_usd',      v_puesto,
    'factor_brecha',         round(v_factor, 4),
    'costo_mercancia_bcv',   v_merc_bcv,
    'costo_operativo_usd',   v_operativo,
    'factor_merma',          v_merma,
    'costo_total_usd',       v_total_bcv,
    'costo_en_bcv',          v_total_bcv,
    'margen_objetivo_pct',   round(v_margen * 100, 2),
    'margen_piso_pct',       round(v_piso, 2),
    'precio_sugerido_bcv',   v_precio_bcv,
    'grupo_id',              v_grupo.id,
    'grupo_nombre',          v_grupo.nombre,
    'grupo_precio_bcv',      v_grupo.precio_usd,
    -- Ahora significa "hay un grupo que llega al piso", que es la pregunta
    -- que de verdad importa.
    'grupo_alcanza',         coalesce(v_margen_real >= v_piso - 0.001, false),
    'precio_grupo_real',     case when v_factor > 0 then round(v_grupo.precio_usd / v_factor, 4) end,
    'margen_resultante_pct', v_margen_real);
end;
$fn$;

revoke all on function admin_sugerir_precio(bigint, numeric, numeric) from public, anon;
grant execute on function admin_sugerir_precio(bigint, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 2. LA REASIGNACIÓN USA LA MISMA REGLA
-- Si usara otra, el botón de Inventario movería las piezas a un sitio
-- distinto del que sugiere el formulario, y no habría forma de saber
-- cuál de los dos tiene razón.
-- ---------------------------------------------------------------------

create or replace function admin_reasignar_grupos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_margen  numeric;
  v_piso    numeric;
  v_movidas int;
  v_altas   int;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede reasignar precios.';
  end if;

  select least(coalesce(valor, 45), 99) into v_margen
    from configuracion where clave = 'margen_objetivo_pct';
  v_margen := coalesce(v_margen, 45);

  select least(coalesce(valor, 40), v_margen) into v_piso
    from configuracion where clave = 'margen_piso_pct';
  v_piso := coalesce(v_piso, v_margen);

  with destino as (
    select
      mo.id,
      coalesce(
        (select g.id from grupos_precio g
          where g.activo and g.precio_usd > 0
            and (g.precio_usd - costo_total_bcv(mo.costo_puesto_usd)) / g.precio_usd * 100 >= v_piso - 0.001
          order by g.precio_usd asc limit 1),
        (select g.id from grupos_precio g where g.activo order by g.precio_usd desc limit 1)
      ) as grupo_id
    from modelos mo
    where mo.activo and mo.precio_override_usd is null
  ),
  movidas as (
    update modelos m
       set grupo_precio_id = d.grupo_id,
           actualizado_en  = now()
      from destino d
     where d.id = m.id
       and d.grupo_id is not null
       and m.grupo_precio_id is distinct from d.grupo_id
    returning 1
  )
  select count(*) into v_movidas from movidas;

  -- Las que no llegan al piso ni con el grupo más alto: esas piden un
  -- grupo nuevo, no una reasignación.
  select count(*) into v_altas
    from modelos mo
    join grupos_precio g on g.id = mo.grupo_precio_id
   where mo.activo
     and mo.precio_override_usd is null
     and g.precio_usd > 0
     and (g.precio_usd - costo_total_bcv(mo.costo_puesto_usd)) / g.precio_usd * 100 < v_piso - 0.001;

  return jsonb_build_object(
    'margen_objetivo_pct', v_margen,
    'margen_piso_pct', v_piso,
    'piezas_movidas', v_movidas,
    'sin_grupo_que_alcance', v_altas);
end;
$fn$;

revoke all on function admin_reasignar_grupos() from public, anon;
grant execute on function admin_reasignar_grupos() to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select admin_sugerir_precio(null, 5.00);
--     -> margen_piso_pct 40 y un grupo cuyo margen_resultante_pct >= 40
--
--   select admin_reasignar_grupos();
--     -> con las 84 piezas de hoy deberia mover unas 33
--
--   Despues, en Inventario: el margen promedio baja de 50,7 % a unos
--   46,1 %, que sigue por encima del objetivo de 45.
-- =====================================================================
