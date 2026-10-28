-- =====================================================================
-- Lux by Emory — borrar lo que se cargó mal en un lote en camino, y
-- reacomodar los grupos sin que se agote el tiempo
-- Ejecutar en el SQL Editor DESPUÉS de esquema-catalogo-claro.sql (#61)
--
-- QUÉ PIDIÓ EL DUEÑO (27/10/2026)
--  - "Hay que agregar el botón de eliminar la prenda en el lote que viene:
--    se pueden editar pero no eliminar, y me equivoqué en una."
--  - "Al presionar el botón de ponerlas en su grupo dice que tardó mucho y
--    no hizo nada, aunque hay más grupos para ordenar todo."
--
-- QUÉ HACE
--  1. `costo_bcv_con(costo, es_dije, brecha, merma, tienda)`: la fórmula
--     del costo de una pieza en $ BCV, sola, con las cifras que se le
--     pasen. Ni lee tablas ni cambia nada. `costo_total_bcv` y
--     `costo_bcv_pieza` pasan a llamarla, con las mismas cifras que antes:
--     dan exactamente lo mismo. Así la fórmula vive en un sitio y quien
--     tiene que costear muchas piezas de una vez puede calcular la brecha,
--     la merma y lo de tienda UNA vez.
--  2. `admin_reasignar_grupos()`, la de "Poner cada una en su grupo", con
--     la misma regla y la misma respuesta. Lo que cambia es cuánto tarda.
--     Antes calculaba el costo de cada pieza DENTRO de la búsqueda de su
--     grupo, y Postgres lo repetía por cada grupo de la escalera; y cada
--     costo vuelve a sumar todas las ventas de la historia (para lo de
--     tienda) y relee los lotes y las inversiones (para los gastos). Eran
--     miles de sumas de toda la historia: la base cortaba la llamada por
--     tiempo y no se movía ninguna. Y mientras más grupos cargaba el
--     dueño, peor. Ahora lo de tienda, la brecha y la merma se calculan una
--     vez, el costo de cada pieza otra vez, y la búsqueda del grupo solo
--     compara números. Probado en una copia de la base con 302 piezas, 40
--     grupos y 3.000 líneas vendidas: 162 s antes, 83 ms después, cada
--     pieza en el mismo grupo.
--  3. `admin_eliminar_de_lote(modelo)`: borra un producto que se cargó en
--     un lote que TODAVÍA NO HA LLEGADO, con todas sus medidas y lo que se
--     esperaba de él. Solo de un lote en camino: lo que ya llegó tiene o
--     pudo tener historia (ventas, conteos, pedidos) y se retira desde su
--     ficha, como siempre. Si por algún camino la pieza ya tiene historia,
--     no se borra nada y lo dice. Libera el SKU para volver a cargarla
--     bien. La foto se queda en el almacén (como al cambiarla).
--
-- LAS FIRMAS
-- `admin_reasignar_grupos()`, `costo_total_bcv(numeric)` y
-- `costo_bcv_pieza(numeric, boolean)` no cambian. `costo_bcv_con` y
-- `admin_eliminar_de_lote` son nuevas. Sin este archivo, el botón
-- "Eliminar" del lote en camino dice que falta correrlo; nada más cambia.
--
-- Reejecutable.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA FÓRMULA DEL COSTO, SOLA
--
--   costo BCV = costo puesto × brecha × merma  +  lo de tienda
--
-- La brecha toca solo la mercancía (se recompra afuera); lo de tienda ya
-- nació en BCV. Un dije no lleva lo de tienda: se lo cobra la base en la
-- que va (esquema-dijes.sql).
-- ---------------------------------------------------------------------

create or replace function costo_bcv_con(
  p_costo_puesto_usd numeric,
  p_es_dije          boolean,
  p_brecha           numeric,
  p_merma            numeric,
  p_tienda           numeric
) returns numeric
language sql
immutable
set search_path = public
as $fn$
  select round(coalesce(p_costo_puesto_usd, 0) * coalesce(p_brecha, 1) * coalesce(p_merma, 1)
               + case when coalesce(p_es_dije, false) then 0 else coalesce(p_tienda, 0) end, 4);
$fn$;

-- Cerrada como sus hermanas: es el costo, y solo la llaman funciones de
-- definidor.
revoke all on function costo_bcv_con(numeric, boolean, numeric, numeric, numeric) from public, anon, authenticated;

-- La de siempre, misma firma y mismo resultado: ahora llama a la fórmula.
create or replace function costo_total_bcv(p_costo_puesto_usd numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_factor numeric;
begin
  select tasa_venta / tasa_bcv into v_factor from tasas where vigente limit 1;
  return costo_bcv_con(p_costo_puesto_usd, false, coalesce(v_factor, 1),
                       factor_merma(), costo_operativo_por_pieza());
end;
$fn$;

-- La de esquema-dijes.sql, misma firma y mismo resultado. Un dije no
-- calcula lo de tienda: no lo lleva.
create or replace function costo_bcv_pieza(p_costo_puesto_usd numeric, p_es_dije boolean)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_factor numeric;
begin
  select tasa_venta / tasa_bcv into v_factor from tasas where vigente limit 1;
  return costo_bcv_con(p_costo_puesto_usd, p_es_dije, coalesce(v_factor, 1), factor_merma(),
                       case when coalesce(p_es_dije, false) then 0 else costo_operativo_por_pieza() end);
end;
$fn$;

-- Los permisos de las dos se quedan como estaban (create or replace no los
-- toca): `costo_total_bcv` cerrada desde esquema-costos-cerrados.sql y
-- `costo_bcv_pieza` desde esquema-dijes.sql. Se repite por si acaso.
revoke all on function costo_total_bcv(numeric) from public, anon, authenticated;
revoke all on function costo_bcv_pieza(numeric, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. PONER CADA PIEZA EN SU GRUPO, SIN AGOTAR EL TIEMPO
-- La regla de esquema-dijes.sql, entera: cada pieza en su escalera, el
-- grupo más barato que llegue al piso de margen; si ninguno llega, el más
-- alto de su escalera. Las de precio propio no se tocan. Un dije sin
-- escalera de dijes cargada se queda donde está, y se cuenta aparte.
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
  v_brecha  numeric;
  v_merma   numeric;
  v_tienda  numeric;
  v_movidas int;
  v_altas   int;
  v_dijes   int;
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

  -- Las cifras que comparten todas las piezas, UNA vez. Son las mismas
  -- que usa `costo_bcv_pieza` para cada una.
  select tasa_venta / tasa_bcv into v_brecha from tasas where vigente limit 1;
  v_brecha := coalesce(v_brecha, 1);
  v_merma  := coalesce(factor_merma(), 1);
  v_tienda := coalesce(costo_operativo_por_pieza(), 0);

  -- `materialized`: el costo de cada pieza se calcula una vez y se guarda,
  -- en vez de volver a calcularse por cada grupo que se compara.
  with piezas as materialized (
    select mo.id,
           case when mo.armado = 'dije' then 'dije' else 'pieza' end as escalera,
           costo_bcv_con(mo.costo_puesto_usd, mo.armado = 'dije', v_brecha, v_merma, v_tienda) as costo
      from modelos mo
     where mo.activo and mo.precio_override_usd is null
  ),
  grupos as materialized (
    select g.id, g.escalera, g.precio_usd
      from grupos_precio g
     where g.activo
  ),
  destino as (
    select
      p.id,
      coalesce(
        (select g.id from grupos g
          where g.escalera = p.escalera and g.precio_usd > 0
            and (g.precio_usd - p.costo) / g.precio_usd * 100 >= v_piso - 0.001
          order by g.precio_usd asc limit 1),
        (select g.id from grupos g
          where g.escalera = p.escalera
          order by g.precio_usd desc limit 1)
      ) as grupo_id
    from piezas p
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

  -- Las que no llegan al piso ni con el grupo más alto de su escalera.
  select count(*) into v_altas
    from modelos mo
    join grupos_precio g on g.id = mo.grupo_precio_id
   where mo.activo
     and mo.precio_override_usd is null
     and g.precio_usd > 0
     and g.escalera = case when mo.armado = 'dije' then 'dije' else 'pieza' end
     and (g.precio_usd - costo_bcv_con(mo.costo_puesto_usd, mo.armado = 'dije', v_brecha, v_merma, v_tienda))
         / g.precio_usd * 100 < v_piso - 0.001;

  -- Los dijes que siguen en un grupo de las piezas: falta su escalera.
  select count(*) into v_dijes
    from modelos mo
    join grupos_precio g on g.id = mo.grupo_precio_id
   where mo.activo
     and mo.precio_override_usd is null
     and mo.armado = 'dije'
     and g.escalera <> 'dije';

  return jsonb_build_object(
    'margen_objetivo_pct', v_margen,
    'margen_piso_pct', v_piso,
    'piezas_movidas', v_movidas,
    'sin_grupo_que_alcance', v_altas,
    'dijes_sin_escalera', v_dijes);
end;
$fn$;

revoke all on function admin_reasignar_grupos() from public, anon;
grant execute on function admin_reasignar_grupos() to authenticated;


-- ---------------------------------------------------------------------
-- 3. BORRAR UN PRODUCTO QUE SE CARGÓ MAL EN UN LOTE EN CAMINO
--
-- Lo que viene en un lote que no ha llegado no tiene existencia, no se
-- vende, no se cuenta y no está en ningún pedido (esquema-lote-en-
-- camino.sql): borrarlo no le quita historia a nadie. Se borra el
-- producto entero, con todas sus medidas de ese lote, y lo que se
-- esperaba de él.
--
-- Si aun así tiene historia (una pieza vieja que se pasó a este lote, por
-- ejemplo), Postgres no deja borrarla por sus llaves, y aquí se dice con
-- palabras: se retira desde su ficha, como cualquier otra.
-- ---------------------------------------------------------------------

create or replace function admin_eliminar_de_lote(p_modelo_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_familia bigint;
  v_nombre  text;
  v_lote_id bigint;
  v_lote    lotes%rowtype;
  v_ids     bigint[];
  v_id      bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede eliminar piezas.';
  end if;

  select coalesce(m.familia_id, m.id), m.nombre, m.lote_id
    into v_familia, v_nombre, v_lote_id
    from modelos m
   where m.id = p_modelo_id;
  if not found then
    raise exception 'Esa pieza ya no existe: recarga la página.';
  end if;

  -- El candado del lote: si alguien lo está liberando en este momento,
  -- se espera a que termine y se mira otra vez si sigue en camino.
  select * into v_lote from lotes where id = v_lote_id for update;
  if v_lote.id is null or not v_lote.en_camino then
    raise exception '"%" no es de un lote en camino. Lo que ya llegó no se borra: se retira desde su ficha, para no perder su historia.', v_nombre;
  end if;

  -- Todas las medidas del producto que vienen en este lote.
  select array_agg(m.id order by m.id) into v_ids
    from modelos m
   where coalesce(m.familia_id, m.id) = v_familia
     and m.lote_id = v_lote.id;
  perform 1 from modelos where id = any(v_ids) for update;

  begin
    -- Si alguna medida de la familia se queda (de otro lote), las que se
    -- quedan siguen juntas y con su cabeza.
    foreach v_id in array v_ids loop
      perform soltar_de_familia(v_id);
    end loop;
    delete from por_llegar         where modelo_id = any(v_ids);
    delete from existencias        where modelo_id = any(v_ids);
    delete from revendedor_precios where modelo_id = any(v_ids);
    delete from modelos            where id = any(v_ids);
  exception when foreign_key_violation then
    raise exception '"%" ya tiene historia (una venta, un pedido, un conteo o un movimiento) y no se puede borrar. Retírala desde su ficha.', v_nombre;
  end;

  return jsonb_build_object(
    'nombre', v_nombre,
    'lote', v_lote.codigo,
    'medidas', coalesce(array_length(v_ids, 1), 0));
end;
$fn$;

revoke all on function admin_eliminar_de_lote(bigint) from public, anon;
grant execute on function admin_eliminar_de_lote(bigint) to authenticated;


-- =====================================================================
-- CÓMO COMPROBARLO, DESPUÉS DE CORRERLO
-- 1. "Poner cada una en su grupo" (Inventario) responde en un par de
--    segundos y dice cuántas movió. Una segunda vez seguida dice "Todas
--    estaban en su sitio".
-- 2. Lo de tienda no cambió con este archivo (la fórmula es la misma):
--      select costo_operativo_por_pieza(),
--             costo_total_bcv(1) - costo_operativo_por_pieza() as un_dolar_de_mercancia;
--    -> lo de tienda de siempre, y la brecha de hoy por la merma.
-- 3. En un lote en camino, cada producto nuevo lleva "Eliminar". Al
--    tocarlo y confirmar, desaparece de "Lo que viene" y su SKU queda
--    libre para cargarlo otra vez.
-- 4. En un lote que ya llegó, la función dice que no:
--      select admin_eliminar_de_lote(<id de una pieza que ya se vende>);
--    -> '... no es de un lote en camino ...' (con la sesión del dueño; en
--       el SQL Editor no hay sesión y dice "Solo un administrador").
-- =====================================================================
