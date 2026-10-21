-- =====================================================================
-- Lux by Emory — los dijes y las bases para armar
-- Ejecutar en el SQL Editor DESPUÉS de esquema-lote-en-camino.sql (#59)
--
-- QUÉ PIDIÓ EL DUEÑO (21/10/2026)
-- Trajo muchos dijes sueltos, y cadenas y pulseras sin dije para
-- colgárselos. Un dije de $0,88 salía en $9: el sistema le sumaba lo de
-- tienda de una pieza completa (el empaque y su parte del mes de alquiler
-- y sueldos, unos $3) y después el margen, y el grupo más barato que lo
-- cubría era G9. Cadena y dije juntos, unos $18. Lo que pidió: que la
-- clienta elija su cadena o pulsera y su dije, que se sumen los costos y
-- que el negocio se cobre UNA vez sobre esa suma.
--
-- LA CUENTA
-- El margen es un porcentaje: aplicarlo a la suma de los costos da lo
-- mismo que aplicarlo a cada parte. Lo único que no puede contarse dos
-- veces es lo de tienda. Entonces:
--
--   la base (cadena o pulsera) es una pieza como cualquiera: con lo de
--     tienda y su margen;
--   el dije lleva su mercancía (con brecha y merma) y el margen, SIN lo de
--     tienda, empaque incluido;
--   base + dije = ((base + dije) × brecha × merma + tienda) ÷ (1 − margen),
--     salvo el redondeo de las escaleras.
--
-- LO QUE DECIDIÓ EL DUEÑO
-- - El dije se vende solo (para una cadena suya o una que ya compró) o con
--   una base de la tienda: tiene UN precio, vaya como vaya.
-- - Solo, cuenta en las estadísticas de venta (lo vendido, la caja, la
--   ganancia, las piezas de Reportes), pero no para el descuento por
--   cantidad ni para la meta de la vendedora. Con una base, base y dije son
--   una joya: cuenta como una pieza (la base) y el tramo le llega también.
--
-- QUÉ HACE
--  1. Marcas: `modelos.armado` (dije, base o nada), `grupos_precio.escalera`
--     (la de las piezas o la de los dijes, que carga el dueño en Grupos;
--     aquí no se siembra ningún precio) y `venta_items.es_dije`.
--  2. Cada línea de venta congela si era un dije y, si lo era, lo de tienda
--     en cero: un disparador, así lo cubren `registrar_venta`,
--     `vender_congelado` (pedidos, apartados y revendedores) y la nota de
--     crédito sin reescribirlos. Una pieza que mañana deja de ser dije no
--     cambia el pasado.
--  3. El precio: `admin_sugerir_precio` gana `p_es_dije` al final (sin lo
--     de tienda y sobre la escalera de dijes); `piso_margen_de` y
--     `admin_reasignar_grupos` miden al dije igual. Por `piso_margen_de`
--     pasan solos el regateo, el tramo y el precio del revendedor.
--  4. El formulario: `admin_guardar_modelo` gana `p_armado` al final, y las
--     variantes lo heredan como la categoría.
--  5. El tramo, línea por línea, en UNA función (`tramo_de_carrito`) que
--     usan `registrar_venta`, `apartar_en_tienda`, `crear_reserva` y
--     `cotizar_pedido`: los dijes no cuentan; reciben el descuento solo los
--     que caben en las bases de la venta.
--  6. Las cuentas que cuentan piezas las cuentan sin dijes: el volumen del
--     mes (que reparte lo de tienda: si contara los dijes, abarataría todo
--     el catálogo sin un error), `plan_ventas` (las piezas; el dinero sí
--     con ellos), la meta y "Mi día" de la vendedora, y el empaque que
--     restan "Te dejaron", la mezcla por grupo y la recuperación.
--  7. Las vistas del catálogo dicen `armado`, al final. No es un costo.
--  8. El pedido del catálogo guarda qué dije va en qué base
--     (`reserva_armados`, por `crear_reserva(..., p_armados)`), para que
--     quien lo prepara no adivine. Lo lee la tienda en `v_pedido_armado`.
--
-- LAS FIRMAS
-- `admin_sugerir_precio`, `admin_guardar_modelo` y `crear_reserva` ganan un
-- parámetro al final con valor por omisión: el navegador viejo las sigue
-- llamando como siempre. La vieja se suelta antes de crear la nueva; con
-- las dos vivas, PostgREST no sabría cuál elegir.
--
-- Reejecutable.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LAS MARCAS
-- ---------------------------------------------------------------------

alter table modelos add column if not exists armado text;
alter table modelos drop constraint if exists modelos_armado_valido;
alter table modelos add constraint modelos_armado_valido
  check (armado is null or armado in ('dije', 'base'));

comment on column modelos.armado is
  'dije: se cuelga de una cadena o pulsera, sin lo de tienda en su precio. base: cadena o pulsera para colgarle un dije. Nulo: una pieza como cualquiera.';

alter table grupos_precio add column if not exists escalera text not null default 'pieza';
alter table grupos_precio drop constraint if exists grupos_precio_escalera_valida;
alter table grupos_precio add constraint grupos_precio_escalera_valida
  check (escalera in ('pieza', 'dije'));

comment on column grupos_precio.escalera is
  'pieza: la escalera de siempre (G9 a G30). dije: la de los dijes, que carga el dueño en Grupos.';

alter table venta_items add column if not exists es_dije boolean not null default false;

comment on column venta_items.es_dije is
  'La línea era un dije al venderse. Congelado por el disparador venta_items_dije: lo leen las cuentas de piezas y de empaque.';


-- ---------------------------------------------------------------------
-- 2. CADA LÍNEA CONGELA SI ERA UN DIJE
-- Antes del insert, en toda línea: la de una venta, la de un pedido que
-- se entrega, la de un revendedor que se aprueba y la de una nota de
-- crédito (que copia lo de la línea que devuelve). Si era un dije, lo de
-- tienda congelado es cero: es lo que su precio no lleva.
-- ---------------------------------------------------------------------

create or replace function venta_item_dije()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.devuelve_item_id is not null then
    -- Una nota de crédito devuelve lo que se vendió, como se vendió.
    select coalesce(i.es_dije, false) into new.es_dije
      from venta_items i where i.id = new.devuelve_item_id;
  else
    select coalesce(m.armado = 'dije', false) into new.es_dije
      from modelos m where m.id = new.modelo_id;
  end if;
  new.es_dije := coalesce(new.es_dije, false);
  if new.es_dije then
    new.costo_operativo_usd_snap := 0;
  end if;
  return new;
end;
$fn$;

revoke all on function venta_item_dije() from public, anon, authenticated;

drop trigger if exists venta_items_dije on venta_items;
create trigger venta_items_dije
  before insert on venta_items
  for each row execute function venta_item_dije();


-- ---------------------------------------------------------------------
-- 3. EL COSTO DE UNA PIEZA, SABIENDO SI ES UN DIJE
-- La de siempre (`costo_total_bcv`) para una pieza; para un dije, solo su
-- mercancía. Un sitio para las dos, y cerrada como su hermana.
-- ---------------------------------------------------------------------

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
  if not coalesce(p_es_dije, false) then
    return costo_total_bcv(p_costo_puesto_usd);
  end if;
  select tasa_venta / tasa_bcv into v_factor from tasas where vigente limit 1;
  v_factor := coalesce(v_factor, 1);
  return round(coalesce(p_costo_puesto_usd, 0) * v_factor * factor_merma(), 4);
end;
$fn$;

revoke all on function costo_bcv_pieza(numeric, boolean) from public, anon, authenticated;

-- El piso del TRAMO, la de esquema-variantes-y-mostrador.sql: misma firma,
-- y el costo del dije sin lo de tienda. De ella cuelgan el piso del
-- regateo (`precio_minimo_de`), el tramo y el precio del revendedor.
create or replace function piso_margen_de(p_modelo_id bigint)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_precio     numeric(12,4);
  v_costo      numeric(12,4);
  v_dije       boolean;
  v_margen_min numeric(12,4);
begin
  select coalesce(m.precio_override_usd, g.precio_usd), m.costo_puesto_usd,
         coalesce(m.armado = 'dije', false)
    into v_precio, v_costo, v_dije
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
   where m.id = p_modelo_id and m.activo;

  if v_precio is null then
    return null;
  end if;

  if not exists (select 1 from tasas where vigente) then
    return v_precio;
  end if;

  select valor into v_margen_min from configuracion where clave = 'margen_minimo_pct';
  v_margen_min := least(coalesce(v_margen_min, 0), 99);

  return round(least(v_precio, costo_bcv_pieza(v_costo, v_dije) / (1 - v_margen_min / 100)), 2);
end;
$fn$;

revoke all on function piso_margen_de(bigint) from public, anon;
grant execute on function piso_margen_de(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 4. EL PRECIO SUGERIDO, CON SU ESCALERA
-- La de esquema-piso-precio.sql, con `p_es_dije` al final: sin lo de
-- tienda y sobre la escalera de dijes. Sin escalera de dijes cargada no
-- hay grupo (`grupo_id` nulo) y el formulario lo dice: nunca le busca a un
-- dije un grupo de las piezas.
-- ---------------------------------------------------------------------

drop function if exists admin_sugerir_precio(bigint, numeric, numeric);

create or replace function admin_sugerir_precio(
  p_lote_id    bigint,
  p_costo_usd  numeric,
  p_margen_pct numeric default null,
  p_es_dije    boolean default false   -- nueva: sin lo de tienda y en la escalera de dijes
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
  v_escalera   text := case when coalesce(p_es_dije, false) then 'dije' else 'pieza' end;
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
  -- Un dije no lleva lo de tienda: se lo cobra la base en la que va.
  v_operativo := case when coalesce(p_es_dije, false) then 0
                      else coalesce(costo_operativo_por_pieza(), 0) end;
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
     and escalera = v_escalera
     and precio_usd > 0
     and (precio_usd - v_total_bcv) / precio_usd * 100 >= v_piso - 0.001
   order by precio_usd asc
   limit 1;

  if not found then
    select * into v_grupo from grupos_precio where activo and escalera = v_escalera order by precio_usd desc limit 1;
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
    'margen_resultante_pct', v_margen_real,
    'escalera',              v_escalera);
end;
$fn$;

revoke all on function admin_sugerir_precio(bigint, numeric, numeric, boolean) from public, anon;
grant execute on function admin_sugerir_precio(bigint, numeric, numeric, boolean) to authenticated;

-- La reasignación con la misma regla (esquema-piso-precio.sql): cada pieza
-- en su escalera y con su costo. Las de precio propio no se tocan, como
-- siempre. Un dije sin escalera de dijes cargada se queda donde está, y se
-- cuenta aparte para que la pantalla lo diga.
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

  with piezas as (
    select mo.id,
           case when mo.armado = 'dije' then 'dije' else 'pieza' end as escalera,
           costo_bcv_pieza(mo.costo_puesto_usd, mo.armado = 'dije') as costo
      from modelos mo
     where mo.activo and mo.precio_override_usd is null
  ),
  destino as (
    select
      p.id,
      coalesce(
        (select g.id from grupos_precio g
          where g.activo and g.escalera = p.escalera and g.precio_usd > 0
            and (g.precio_usd - p.costo) / g.precio_usd * 100 >= v_piso - 0.001
          order by g.precio_usd asc limit 1),
        (select g.id from grupos_precio g
          where g.activo and g.escalera = p.escalera
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
     and (g.precio_usd - costo_bcv_pieza(mo.costo_puesto_usd, mo.armado = 'dije')) / g.precio_usd * 100 < v_piso - 0.001;

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
-- 5. GUARDAR EL PRODUCTO, CON SU TIPO
-- Las de esquema-lote-en-camino.sql. `admin_guardar_modelo` gana
-- `p_armado` al final: null deja el tipo como estaba (el navegador de
-- antes no lo manda); 'pieza', 'dije' o 'base' lo fija. Es del producto:
-- lo llevan todas sus medidas, como la categoría. Una variante con costo
-- propio que cambia de tipo vuelve a buscar su grupo, en su escalera.
-- ---------------------------------------------------------------------

create or replace function guardar_variantes_de(
  p_modelo_id bigint,
  p_variantes jsonb,
  p_foto_vieja text
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  m          modelos%rowtype;
  v_familia  bigint;
  v_fila     jsonb;
  v_id       bigint;
  v_etiqueta text;
  v_costo    numeric(12,4);
  v_antes    modelos%rowtype;
  v_grupo    bigint;
  v_override numeric(12,4);
  v_sug      jsonb;
  v_vivas    int;
  v_nombres  text[] := '{}';
begin
  select * into m from modelos where id = p_modelo_id;
  if not found then
    raise exception 'El modelo % no existe.', p_modelo_id;
  end if;

  select count(*) into v_vivas
    from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
   where not coalesce((x->>'quitar')::boolean, false);

  v_familia := coalesce(m.familia_id, m.id);

  if v_vivas > 0 then
    -- Con hermanas, la principal tambien necesita su nombre de variante:
    -- dos opciones sin nombre en la hoja de elegir son dos botones iguales.
    if nullif(btrim(coalesce(m.variante, '')), '') is null then
      raise exception 'Ponle nombre de variante a esta también: por ejemplo 45 cm.';
    end if;
    v_nombres := array[lower(btrim(m.variante))];
    if m.familia_id is null then
      update modelos set familia_id = m.id where id = m.id;
    end if;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    v_id := nullif(v_fila->>'id', '')::bigint;

    -- Quitar: fuera del catalogo, con sus ventas intactas.
    if coalesce((v_fila->>'quitar')::boolean, false) then
      if v_id is not null then
        update modelos
           set activo = false, actualizado_en = now()
         where id = v_id and id <> m.id and coalesce(familia_id, id) = v_familia;
      end if;
      continue;
    end if;

    v_etiqueta := nullif(btrim(coalesce(v_fila->>'variante', '')), '');
    if v_etiqueta is null then
      raise exception 'Cada variante necesita su nombre: 45 cm, talla 7, dorada.';
    end if;
    if lower(v_etiqueta) = any(v_nombres) then
      raise exception 'Hay dos variantes que se llaman "%". Cámbiale el nombre a una.', v_etiqueta;
    end if;
    v_nombres := v_nombres || lower(v_etiqueta);

    v_costo := nullif(v_fila->>'costo_unitario_usd', '')::numeric;
    if v_costo is not null and v_costo < 0 then
      raise exception 'El costo de "%" no puede ser negativo.', v_etiqueta;
    end if;

    v_antes := null;
    if v_id is not null then
      select * into v_antes from modelos
       where id = v_id and id <> m.id and coalesce(familia_id, id) = v_familia;
      if not found then
        raise exception 'La variante "%" ya no pertenece a este producto. Recarga la pantalla.', v_etiqueta;
      end if;
    end if;

    if v_costo is null or v_costo = m.costo_unitario_usd then
      -- Cuesta lo mismo que el producto: vale lo mismo.
      v_costo    := m.costo_unitario_usd;
      v_grupo    := m.grupo_precio_id;
      v_override := m.precio_override_usd;
    elsif v_antes.id is not null and v_costo = v_antes.costo_unitario_usd
          and v_antes.armado is not distinct from m.armado then
      -- Su costo propio no cambio: se respeta su precio como estaba.
      v_grupo    := v_antes.grupo_precio_id;
      v_override := v_antes.precio_override_usd;
    else
      -- Costo nuevo: el grupo con la misma cuenta que el formulario.
      v_sug      := admin_sugerir_precio(m.lote_id, v_costo, null, coalesce(m.armado = 'dije', false));
      v_grupo    := nullif(v_sug->>'grupo_id', '')::bigint;
      v_override := null;
    end if;

    if v_id is null then
      insert into modelos (
        sku, nombre, categoria, descripcion, variantes_nota,
        lote_id, costo_unitario_usd, flete_unitario_usd,
        grupo_precio_id, precio_override_usd, foto_path, foto_thumb_path,
        variante, familia_id, armado
      ) values (
        generar_sku(m.categoria, v_grupo), m.nombre, m.categoria, m.descripcion, m.variantes_nota,
        m.lote_id, v_costo, m.flete_unitario_usd,
        v_grupo, v_override, m.foto_path, m.foto_thumb_path,
        v_etiqueta, v_familia, m.armado
      ) returning id into v_id;
    else
      update modelos set
        nombre              = m.nombre,
        categoria           = m.categoria,
        descripcion         = m.descripcion,
        variantes_nota      = m.variantes_nota,
        lote_id             = m.lote_id,
        flete_unitario_usd  = m.flete_unitario_usd,
        costo_unitario_usd  = v_costo,
        grupo_precio_id     = v_grupo,
        precio_override_usd = v_override,
        variante            = v_etiqueta,
        armado              = m.armado,
        -- La foto del producto, salvo que la variante tenga una propia.
        foto_path           = case when foto_path is null or foto_path is not distinct from p_foto_vieja
                                   then m.foto_path else foto_path end,
        foto_thumb_path     = case when foto_path is null or foto_path is not distinct from p_foto_vieja
                                   then m.foto_thumb_path else foto_thumb_path end,
        actualizado_en      = now()
      where id = v_id;
    end if;

    -- Lo nuevo: a `por_llegar` si el lote no ha llegado, a `existencias` si
    -- ya está aquí. El lote de antes es el de la variante antes de guardar.
    perform guardar_cantidades_de(v_id, v_fila->'existencias', v_antes.lote_id);
  end loop;
end;
$fn$;

revoke all on function guardar_variantes_de(bigint, jsonb, text) from public, anon, authenticated;

drop function if exists admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb, text, bigint, jsonb);

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
  p_existencias         jsonb default '[]'::jsonb,
  p_variante            text default null,
  p_variante_de         bigint default null,   -- se ignora desde la tabla de variantes; ver esquema-variantes-en-tabla.sql
  p_variantes           jsonb default null,
  p_armado              text default null    -- nueva: null deja el tipo como estaba
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id         bigint;
  v_sku        text;
  v_flete      numeric;
  v_familia    bigint;
  v_mia        bigint;
  v_foto_vieja text;
  v_lote_viejo bigint;
  v_armado     text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar modelos.';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'El modelo necesita un nombre.';
  end if;
  if p_armado is not null and p_armado not in ('pieza', 'dije', 'base') then
    raise exception 'El tipo de pieza tiene que ser pieza, dije o base.';
  end if;
  v_armado := nullif(p_armado, 'pieza');

  v_flete := calcular_flete_unitario(p_lote_id);
  v_sku   := nullif(trim(coalesce(p_sku, '')), '');

  if p_id is null then
    v_sku := coalesce(v_sku, generar_sku(p_categoria, p_grupo_precio_id));
    insert into modelos (
      sku, nombre, categoria, descripcion, variantes_nota,
      lote_id, costo_unitario_usd, flete_unitario_usd,
      grupo_precio_id, precio_override_usd, foto_path, foto_thumb_path,
      variante, armado
    ) values (
      v_sku, trim(p_nombre), lower(trim(p_categoria)), p_descripcion, p_variantes_nota,
      p_lote_id, coalesce(p_costo_unitario_usd, 0), v_flete,
      p_grupo_precio_id, p_precio_override_usd, p_foto_path, p_foto_thumb_path,
      nullif(trim(coalesce(p_variante, '')), ''), v_armado
    ) returning id into v_id;
  else
    v_id := p_id;
    -- La foto de antes: las variantes que la compartian se llevan la nueva.
    -- Y el lote de antes: si no habia llegado y cambia, lo que esperaba de
    -- el se escribe donde toca ahora.
    select foto_path, lote_id into v_foto_vieja, v_lote_viejo from modelos where id = v_id;

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
      foto_path           = coalesce(p_foto_path, foto_path),
      foto_thumb_path     = coalesce(p_foto_thumb_path, foto_thumb_path),
      variante            = case when p_variante is null then variante
                                 else nullif(trim(p_variante), '') end,
      armado              = case when p_armado is null then armado else v_armado end,
      actualizado_en      = now()
    where id = v_id;
    if not found then
      raise exception 'El modelo % no existe.', p_id;
    end if;
  end if;

  perform guardar_cantidades_de(v_id, p_existencias, v_lote_viejo);

  -- El camino viejo de "agregar otra variante", para el navegador que
  -- todavia lo mande mientras se publica.
  if p_variante_de is not null and p_variante_de <> v_id then
    select coalesce(familia_id, id) into v_familia from modelos where id = p_variante_de;
    if v_familia is null then
      raise exception 'La pieza de la que sale esta variante ya no existe.';
    end if;
    select coalesce(familia_id, id) into v_mia from modelos where id = v_id;
    if v_mia is distinct from v_familia then
      perform soltar_de_familia(v_id);
      update modelos set familia_id = v_familia where id in (v_id, v_familia);
    end if;
  end if;

  -- Las variantes, en la misma transaccion: si una falla, no queda nada a medias.
  if p_variantes is not null then
    perform guardar_variantes_de(v_id, p_variantes, v_foto_vieja);
  end if;

  -- El tipo es del producto: lo llevan todas sus medidas, también las que
  -- no vinieron en la tabla. Después de las variantes, para que una con
  -- costo propio que cambia de tipo busque su grupo de nuevo.
  if p_armado is not null then
    update modelos set armado = v_armado, actualizado_en = now()
     where coalesce(familia_id, id) = (select coalesce(familia_id, id) from modelos where id = v_id)
       and armado is distinct from v_armado;
  end if;

  return v_id;
end;
$fn$;

revoke all on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb, text, bigint, jsonb, text) from public, anon;
grant execute on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb, text, bigint, jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- 6. EL TRAMO, LÍNEA POR LÍNEA: UNA REGLA, UN SITIO
--
--   piezas del tramo = todo lo del carrito menos los dijes
--   el descuento     = el del tramo de esas piezas (descuento_para)
--   cada pieza que no es dije: ese descuento
--   cada dije: ese descuento si sus unidades caben enteras en las bases
--     que quedan, y entonces las gasta; si no, cero
--
-- Los dijes se recorren por su modelo, de menor a mayor id, para que la
-- base y el carrito del mostrador (`descuentosDeCarrito`, lib/dinero.ts)
-- digan lo mismo. Nunca recibe descuento un dije que no tiene su base.
--
-- Devuelve {"piezas": n, "descuento_pct": d, "por_modelo": {"id": d, ...}}.
-- Cerrada: la llaman las funciones que cobran y la que cotiza.
-- ---------------------------------------------------------------------

create or replace function tramo_de_carrito(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_lineas jsonb;
  v_piezas int := 0;
  v_bases  int := 0;
  v_desc   numeric := 0;
  v_mapa   jsonb := '{}'::jsonb;
  v_l      jsonb;
  v_cant   int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('piezas', 0, 'descuento_pct', 0, 'por_modelo', '{}'::jsonb);
  end if;

  -- Por modelo, de menor a mayor: la misma pieza en dos ubicaciones es una
  -- sola línea aquí. Solo lo que se puede cobrar: una pieza retirada o sin
  -- precio no cuenta para el tramo (la cotización la deja fuera, y el
  -- pedido no se hace con ella).
  select coalesce(jsonb_agg(jsonb_build_object('modelo', q.modelo, 'cant', q.cant,
                                               'armado', m.armado) order by q.modelo), '[]'::jsonb)
    into v_lineas
    from (select (x->>'modelo_id')::bigint as modelo,
                 sum(greatest(coalesce((x->>'cantidad')::int, 0), 0))::int as cant
            from jsonb_array_elements(p_items) x
           where x->>'modelo_id' is not null
           group by 1) q
    join modelos m on m.id = q.modelo and m.activo
    left join grupos_precio g on g.id = m.grupo_precio_id
   where coalesce(m.precio_override_usd, g.precio_usd) is not null;

  select coalesce(sum((l->>'cant')::int) filter (where coalesce(l->>'armado', '') <> 'dije'), 0),
         coalesce(sum((l->>'cant')::int) filter (where l->>'armado' = 'base'), 0)
    into v_piezas, v_bases
    from jsonb_array_elements(v_lineas) l;

  v_desc := coalesce(descuento_para(v_piezas), 0);

  for v_l in select e.l from jsonb_array_elements(v_lineas) with ordinality as e(l, n) order by e.n
  loop
    v_cant := (v_l->>'cant')::int;
    if v_l->>'armado' = 'dije' then
      if v_desc > 0 and v_cant <= v_bases then
        v_mapa  := v_mapa || jsonb_build_object(v_l->>'modelo', v_desc);
        v_bases := v_bases - v_cant;
      else
        v_mapa  := v_mapa || jsonb_build_object(v_l->>'modelo', 0);
      end if;
    else
      v_mapa := v_mapa || jsonb_build_object(v_l->>'modelo', v_desc);
    end if;
  end loop;

  return jsonb_build_object('piezas', v_piezas, 'descuento_pct', v_desc, 'por_modelo', v_mapa);
end;
$fn$;

revoke all on function tramo_de_carrito(jsonb) from public, anon, authenticated;

-- La venta del mostrador, la de esquema-fuera-de-catalogo.sql: misma
-- firma; el tramo sale de `tramo_de_carrito`, línea por línea.
create or replace function registrar_venta(
  p_tipo             text,
  p_metodo           text,
  p_items            jsonb,
  p_kit_id           bigint default null,   -- se ignora, ver esquema-tramos-en-mostrador.sql
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null,
  p_notas            text default null,
  p_cliente_id       bigint default null,
  p_cliente_cedula   text default null,
  p_cliente_apellido text default null,
  p_por_verificar    boolean default false,
  p_pago_referencia  text default null,
  p_extra_bs         numeric default null,
  p_extra_nota       text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_venta_id     bigint;
  v_cliente_id   bigint;
  v_cliente_nom  text;
  v_cliente_tel  text;
  v_tasa         tasas%rowtype;
  v_item         jsonb;
  v_modelo_id    bigint;
  v_ubicacion_id bigint;
  v_cantidad     int;
  v_disponible   int;
  v_libre        int;
  v_apartadas    int;
  v_pedido       numeric(12,4);
  v_precio_bs    numeric(14,2);
  v_operativo    numeric(12,4);
  v_ubi_nombre   text;
  p              record;
  v_piezas       int := 0;
  v_desc         numeric(5,2) := 0;
  v_tramo        jsonb;
  v_total_bs     numeric(14,2) := 0;
  v_extra_bs     numeric(14,2);
  v_extra_nota   text;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion para registrar una venta.';
  end if;
  if not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Tu usuario no tiene un perfil activo.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene piezas.';
  end if;

  -- Lo de fuera del catálogo, a céntimos, como todo bolívar de `ventas`.
  v_extra_bs   := round(coalesce(p_extra_bs, 0), 2);
  v_extra_nota := nullif(btrim(coalesce(p_extra_nota, '')), '');
  if v_extra_bs < 0 then
    raise exception 'Lo que sumas fuera del catálogo no puede ser negativo. Para rebajar, cambia el precio de la pieza.';
  end if;
  if v_extra_bs > 0 and v_extra_nota is null then
    raise exception 'Di qué es lo que sumas fuera del catálogo, por ejemplo "dije para la cadena".';
  end if;
  if length(v_extra_nota) > 120 then
    raise exception 'Lo que escribiste de lo que sumas es muy largo: con unas palabras basta.';
  end if;
  if v_extra_bs = 0 then
    v_extra_nota := null;
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fijala en la pantalla de Tasas antes de cobrar.';
  end if;

  v_cliente_id := resolver_cliente(p_cliente_id, p_cliente_cedula,
                                   p_cliente_nombre, p_cliente_apellido, p_cliente_telefono);

  v_cliente_nom := nullif(btrim(coalesce(p_cliente_nombre, '')), '');
  v_cliente_tel := nullif(btrim(coalesce(p_cliente_telefono, '')), '');
  if v_cliente_id is not null then
    select coalesce(v_cliente_nom, c.nombre_completo), coalesce(v_cliente_tel, c.telefono)
      into v_cliente_nom, v_cliente_tel
      from clientes c where c.id = v_cliente_id;
  end if;

  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  -- El tramo sale de las piezas del catálogo, línea por línea: lo de fuera
  -- no es una pieza, los dijes no cuentan y solo lo reciben los que van
  -- con una base (`tramo_de_carrito`, la misma de los pedidos).
  v_tramo  := tramo_de_carrito(p_items);
  v_piezas := (v_tramo->>'piezas')::int;

  -- El candado de cada modelo, en orden: el mismo que toman los pedidos.
  for v_modelo_id in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo_id);
  end loop;

  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      kit_id, cliente_id, cliente_nombre, cliente_telefono, notas,
                      por_verificar, pago_referencia, extra_bs, extra_nota)
  values (auth.uid(), p_tipo::tipo_venta, p_metodo::metodo_pago,
          v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_kit_id, v_cliente_id, v_cliente_nom, v_cliente_tel, p_notas,
          coalesce(p_por_verificar, false), nullif(btrim(coalesce(p_pago_referencia, '')), ''),
          v_extra_bs, v_extra_nota)
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo_id    := (v_item->>'modelo_id')::bigint;
    v_ubicacion_id := (v_item->>'ubicacion_id')::bigint;
    v_cantidad     := (v_item->>'cantidad')::int;
    v_pedido       := nullif(v_item->>'precio_unitario_usd', '')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    -- Se bloquea la fila, y despues se mira cuanto de ella esta libre.
    select e.cantidad into v_disponible
      from existencias e
     where e.modelo_id = v_modelo_id and e.ubicacion_id = v_ubicacion_id
     for update;

    select l.libre, l.apartadas into v_libre, v_apartadas
      from v_existencia_libre l
     where l.modelo_id = v_modelo_id and l.ubicacion_id = v_ubicacion_id;
    v_libre     := coalesce(v_libre, 0);
    v_apartadas := coalesce(v_apartadas, 0);

    -- El precio, el nombre y el costo: la regla de siempre, en su sitio.
    v_desc := coalesce((v_tramo->'por_modelo'->>v_modelo_id::text)::numeric, 0);
    select * into p from precio_de_linea(v_modelo_id, v_pedido, v_desc, v_tasa.tasa_bcv);

    select nombre into v_ubi_nombre from ubicaciones where id = v_ubicacion_id;

    if v_disponible is null or v_libre < v_cantidad then
      if v_apartadas > 0 then
        raise exception 'De "%" en % quedan % libres: % están apartadas para un pedido. Pides %.',
          p.nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), v_libre, v_apartadas, v_cantidad;
      end if;
      raise exception 'No hay suficiente "%" en %. Quedan %, y pides %.',
        p.nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), coalesce(v_disponible, 0), v_cantidad;
    end if;

    v_precio_bs := round(p.precio_usd * v_tasa.tasa_bcv, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs,
                             precio_lista_usd, costo_puesto_usd_snap,
                             costo_operativo_usd_snap, motivo_rebaja)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            p.precio_usd, v_precio_bs, p.precio_lista, p.costo, v_operativo, p.motivo);

    v_total_bs := v_total_bs + (v_precio_bs * v_cantidad);
  end loop;

  -- Las piezas y, encima, lo de fuera del catálogo: es lo que se cobró.
  v_total_bs := v_total_bs + v_extra_bs;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  return v_venta_id;
end;
$fn$;

-- El apartado del mostrador, el de esquema-abonos-y-apartados.sql: misma
-- firma y la misma regla del tramo.
create or replace function apartar_en_tienda(
  p_items            jsonb,
  p_pagos            jsonb,
  p_cliente_id       bigint  default null,
  p_cliente_cedula   text    default null,
  p_cliente_nombre   text    default null,
  p_cliente_apellido text    default null,
  p_cliente_telefono text    default null,
  p_verificado       boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tasa      tasas%rowtype;
  v_cliente   clientes%rowtype;
  v_cli_id    bigint;
  v_modelo    bigint;
  v_item      jsonb;
  v_pago      jsonb;
  v_cantidad  int;
  v_piezas    int := 0;
  v_desc      numeric(5,2);
  v_tramo     jsonb;
  v_disp      int;
  v_pedidas   int;
  p           record;
  v_lineas    jsonb := '[]'::jsonb;
  v_subtotal  numeric(12,4) := 0;
  v_total     numeric(12,4) := 0;
  v_id        bigint;
  v_token     uuid;
  v_falta     numeric;
  v_minimo    numeric;
  v_metodo    text;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El apartado no tiene piezas.';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Para apartar hace falta el primer pago.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fíjala en la pantalla de Tasas antes de cobrar.';
  end if;

  -- La clienta, con su cédula: un apartado es una deuda con nombre.
  v_cli_id := resolver_cliente(p_cliente_id, p_cliente_cedula, p_cliente_nombre,
                               p_cliente_apellido, p_cliente_telefono);
  if v_cli_id is null then
    raise exception 'Para apartar hace falta la clienta: búscala o escribe su cédula y su nombre.';
  end if;
  select * into v_cliente from clientes where id = v_cli_id;
  if v_cliente.cedula_digitos is null then
    raise exception 'Para apartar hace falta la cédula de la clienta.';
  end if;

  select coalesce(sum((x->>'cantidad')::int), 0) into v_piezas from jsonb_array_elements(p_items) x;
  -- El tramo, línea por línea (`tramo_de_carrito`): los dijes no cuentan y
  -- solo lo reciben los que van con una base.
  v_tramo := tramo_de_carrito(p_items);
  v_desc  := (v_tramo->>'descuento_pct')::numeric;

  -- Candados en orden y existencias bloqueadas, como `registrar_venta`.
  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
    perform 1 from existencias where modelo_id = v_modelo for update;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::int;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select * into p from precio_de_linea(v_modelo,
                                         nullif(v_item->>'precio_unitario_usd', '')::numeric,
                                         coalesce((v_tramo->'por_modelo'->>v_modelo::text)::numeric, 0), v_tasa.tasa_bcv);

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'modelo_id', v_modelo, 'cantidad', v_cantidad,
      'precio_usd', p.precio_usd, 'precio_lista_usd', p.precio_lista, 'motivo', p.motivo));
    v_subtotal := v_subtotal + p.precio_lista * v_cantidad;
    v_total    := v_total + p.precio_usd * v_cantidad;
  end loop;

  -- Lo libre, por modelo: todo lo que hay menos lo apartado.
  for v_modelo, v_pedidas in
    select (x->>'modelo_id')::bigint, sum((x->>'cantidad')::int)::int
      from jsonb_array_elements(p_items) x group by 1
  loop
    select coalesce((select sum(cantidad) from existencias where modelo_id = v_modelo), 0)
         - apartadas_de(v_modelo)
      into v_disp;
    if v_pedidas > v_disp then
      select nombre into p from precio_de_linea(v_modelo, null, 0, null);
      raise exception 'De "%" quedan % libres y quieres apartar %.', p.nombre, greatest(v_disp, 0), v_pedidas;
    end if;
  end loop;

  v_total := round(v_total, 4);

  insert into reservas (cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
                        entrega, piezas, subtotal_usd, descuento_pct, total_usd,
                        expira_en, cliente_id, datos_del_maestro, origen, creado_por, estado)
  values (v_cliente.nombre, v_cliente.apellido, v_cliente.cedula, v_cliente.telefono,
          'tienda', v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now(), v_cli_id, false, 'tienda', auth.uid(), 'abierta')
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad, precio_usd, precio_lista_usd, motivo_rebaja)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int,
         (x->>'precio_usd')::numeric, (x->>'precio_lista_usd')::numeric, x->>'motivo'
    from jsonb_array_elements(v_lineas) x;

  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    v_metodo := v_pago->>'metodo';
    v_falta  := saldo_padre_bcv(null, v_id, null);
    perform anotar_abono_en(null, v_id, null, 'tienda', v_metodo,
                            nullif(v_pago->>'monto', '')::numeric, v_pago->>'referencia',
                            coalesce(p_verificado, true) or v_metodo in ('efectivo_bs', 'efectivo_usd', 'punto'),
                            v_falta);
  end loop;

  v_minimo := v_total * config_requerida('apartado_inicial_pct') / 100;
  v_falta  := saldo_padre_bcv(null, v_id, null);
  if v_total - v_falta < v_minimo - 0.005 then
    raise exception 'Para apartar, lo que paga hoy tiene que ser al menos el % %%: $% BCV, hoy Bs %.',
      to_char(config_requerida('apartado_inicial_pct'), 'FM990'),
      to_char(v_minimo, 'FM999G999G990D00'),
      to_char(round(v_minimo * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
  end if;
  if v_falta < 0.005 then
    raise exception 'Con eso ya está pagado completo: cóbralo como venta, no como apartado.';
  end if;

  perform pedido_al_dia(v_id);

  return jsonb_build_object('id', v_id, 'token', v_token, 'falta_bcv', falta_pedido_bcv(v_id),
                            'vence_apartado_en', (select vence_apartado_en from reservas where id = v_id));
end;
$fn$;

-- El total del catálogo, la de esquema-conteo-y-cotizar.sql: misma firma y
-- la misma regla que `crear_reserva`. `piezas` son ahora las que cuentan
-- para el tramo (sin dijes).
create or replace function cotizar_pedido(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_item      jsonb;
  v_modelo    bigint;
  v_cantidad  int;
  v_piezas    int := 0;
  v_desc      numeric(5,2);
  v_tramo     jsonb;
  v_subtotal  numeric := 0;
  v_total     numeric := 0;
  v_lineas    jsonb := '[]'::jsonb;
  v_sin       jsonb := '[]'::jsonb;
  p           record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('piezas', 0, 'descuento_pct', 0, 'subtotal_usd', 0,
                              'total_usd', 0, 'lineas', '[]'::jsonb, 'sin_precio', '[]'::jsonb);
  end if;
  -- Un tope técnico, no de negocio: que nadie la use para recorrer el
  -- catálogo entero de un golpe.
  if jsonb_array_length(p_items) > 300 then
    raise exception 'Demasiadas piezas distintas en un solo pedido.';
  end if;

  -- El tramo, línea por línea (`tramo_de_carrito`), como `crear_reserva`.
  v_tramo  := tramo_de_carrito(p_items);
  v_piezas := (v_tramo->>'piezas')::int;
  v_desc   := (v_tramo->>'descuento_pct')::numeric;

  -- El tope: lo mismo que pediría `crear_reserva`, sumado por pieza (una
  -- pieza repetida en la lista no se cuela dos veces).
  if exists (
    select 1
      from (select (x->>'modelo_id')::bigint as modelo, sum(greatest(coalesce((x->>'cantidad')::int, 0), 0)) as pide
              from jsonb_array_elements(p_items) x
             group by 1) q
     where q.pide > coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = q.modelo), 0)
                    - apartadas_de(q.modelo)
  ) then
    raise exception 'Una de las piezas ya no tiene esa cantidad disponible.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 0);
    continue when v_modelo is null or v_cantidad <= 0;

    begin
      select * into p from precio_de_linea(v_modelo, null, coalesce((v_tramo->'por_modelo'->>v_modelo::text)::numeric, 0), null);
    exception when others then
      v_sin := v_sin || to_jsonb(v_modelo);
      continue;
    end;

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'modelo_id', v_modelo, 'cantidad', v_cantidad,
      'precio_usd', p.precio_usd, 'precio_lista_usd', p.precio_lista,
      'motivo', p.motivo));
    v_subtotal := v_subtotal + p.precio_lista * v_cantidad;
    v_total    := v_total + p.precio_usd * v_cantidad;
  end loop;

  return jsonb_build_object(
    'piezas',        v_piezas,
    'descuento_pct', v_desc,
    'subtotal_usd',  round(v_subtotal, 4),
    'total_usd',     round(v_total, 4),
    'lineas',        v_lineas,
    'sin_precio',    v_sin);
end;
$fn$;


-- ---------------------------------------------------------------------
-- 7. QUÉ DIJE VA EN QUÉ BASE, EN EL PEDIDO DEL CATÁLOGO
-- Solo información para quien prepara el pedido: el precio ya lo decidió
-- el tramo. Una fila por pareja, con cuántas: la letra A en la cadena y
-- otra A en la pulsera son dos filas. Cerrada a todos; la tienda la lee
-- por `v_pedido_armado`. No se borra, como el pedido.
-- ---------------------------------------------------------------------

create table if not exists reserva_armados (
  id         bigserial primary key,
  reserva_id bigint not null references reservas(id),
  dije_id    bigint not null references modelos(id),
  base_id    bigint not null references modelos(id),
  cantidad   int not null check (cantidad > 0),
  creado_en  timestamptz not null default now()
);

create index if not exists reserva_armados_reserva_idx on reserva_armados (reserva_id);
create index if not exists reserva_armados_dije_idx on reserva_armados (dije_id);
create index if not exists reserva_armados_base_idx on reserva_armados (base_id);

alter table reserva_armados enable row level security;
revoke all on reserva_armados from anon, authenticated;
revoke all on sequence reserva_armados_id_seq from anon, authenticated;

-- Guarda las parejas que el navegador manda, si cuadran con el pedido: el
-- dije es un dije del pedido, la base es una base del pedido, y nunca más
-- de las que hay de cada uno. Lo que no cuadra se deja fuera sin tumbar el
-- pedido de la clienta: es una ayuda para armar, no un precio.
create or replace function guardar_armados(p_reserva_id bigint, p_armados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_par    jsonb;
  v_dije   bigint;
  v_base   bigint;
  v_cant   int;
  v_libres int;
begin
  if p_armados is null or jsonb_typeof(p_armados) <> 'array' then
    return;
  end if;
  -- Un tope técnico. Más que esto no es un pedido de verdad: se ignora, sin
  -- tumbar el pedido, como todo lo que aquí no cuadra.
  if jsonb_array_length(p_armados) > 100 then
    return;
  end if;

  for v_par in select * from jsonb_array_elements(p_armados)
  loop
    continue when jsonb_typeof(v_par) <> 'object';
    continue when coalesce(v_par->>'dije_id', '') !~ '^[0-9]{1,18}$'
               or coalesce(v_par->>'base_id', '') !~ '^[0-9]{1,18}$'
               or coalesce(v_par->>'cantidad', '1') !~ '^[0-9]{1,6}$';
    v_dije := (v_par->>'dije_id')::bigint;
    v_base := (v_par->>'base_id')::bigint;
    v_cant := coalesce((v_par->>'cantidad')::int, 1);
    continue when v_cant <= 0;

    -- Los dos están en el pedido, y cada uno es lo que dice ser.
    continue when not exists (select 1 from reserva_items ri join modelos m on m.id = ri.modelo_id
                               where ri.reserva_id = p_reserva_id and ri.modelo_id = v_dije and m.armado = 'dije');
    continue when not exists (select 1 from reserva_items ri join modelos m on m.id = ri.modelo_id
                               where ri.reserva_id = p_reserva_id and ri.modelo_id = v_base and m.armado = 'base');

    -- Nunca más parejas que piezas de cada uno.
    select coalesce(sum(ri.cantidad), 0)
           - coalesce((select sum(a.cantidad) from reserva_armados a
                        where a.reserva_id = p_reserva_id and a.dije_id = v_dije), 0)
      into v_libres
      from reserva_items ri where ri.reserva_id = p_reserva_id and ri.modelo_id = v_dije;
    v_cant := least(v_cant, v_libres);
    select least(v_cant, coalesce(sum(ri.cantidad), 0)
                         - coalesce((select sum(a.cantidad) from reserva_armados a
                                      where a.reserva_id = p_reserva_id and a.base_id = v_base), 0))
      into v_cant
      from reserva_items ri where ri.reserva_id = p_reserva_id and ri.modelo_id = v_base;
    continue when coalesce(v_cant, 0) <= 0;

    insert into reserva_armados (reserva_id, dije_id, base_id, cantidad)
    values (p_reserva_id, v_dije, v_base, v_cant);
  end loop;
end;
$fn$;

revoke all on function guardar_armados(bigint, jsonb) from public, anon, authenticated;

-- El pedido del catálogo, la de esquema-abonos-y-apartados.sql, con
-- `p_armados` al final y la regla del tramo línea por línea. Y un hueco que
-- ya estaba y que el tramo por línea agrandaba (revisión de seguridad del
-- 21/10/2026): lo libre se miraba línea por línea, así que veinte líneas de
-- "1 cadena" con una sola en la tienda pasaban, llegaban al tramo del 15 %
-- (y, con los dijes, le daban base a veinte dijes) y el pedido congelaba esos
-- precios. Ahora se mira sumado por pieza, como ya lo hacía
-- `cotizar_pedido`, con su mismo tope técnico de líneas.
drop function if exists crear_reserva(jsonb, text, text, text, text, text, text, text, text);

create or replace function crear_reserva(
  p_items            jsonb,
  p_cliente_nombre   text,
  p_cliente_apellido text,
  p_cliente_cedula   text,
  p_cliente_telefono text,
  p_entrega          text default 'tienda',
  p_envio_empresa    text default null,
  p_envio_agencia    text default null,
  p_envio_direccion  text default null,
  p_armados          jsonb default null   -- nueva: qué dije va en qué base
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_modelo     bigint;
  v_item       jsonb;
  v_cantidad   int;
  v_disponible int;
  v_nombre     text;
  v_precio     numeric(12,4);
  p            record;
  v_piezas     int := 0;
  v_previas    int := 0;
  v_subtotal   numeric(12,4) := 0;
  v_desc       numeric(5,2);
  v_tramo      jsonb;
  v_total      numeric(12,4) := 0;
  v_minutos    numeric(12,4);
  v_id         bigint;
  v_token      uuid;
  v_entrega    forma_entrega;
  v_empresa    empresa_envio;
  v_cliente    clientes%rowtype;
  v_cliente_id bigint;
  v_maestro    boolean := false;
  v_lineas     jsonb := '[]'::jsonb;
  v_nom        text := nullif(trim(p_cliente_nombre), '');
  v_ape        text := nullif(trim(p_cliente_apellido), '');
  v_ced        text := nullif(trim(p_cliente_cedula), '');
  v_tel        text := nullif(trim(p_cliente_telefono), '');
  v_agencia    text := nullif(trim(p_envio_agencia), '');
  v_direccion  text := nullif(trim(p_envio_direccion), '');
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No elegiste ninguna pieza.';
  end if;

  if v_ced is null then raise exception 'Falta tu cedula.'; end if;
  if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cedula esta incompleta.';
  end if;

  select * into v_cliente
    from clientes
   where cedula_digitos = regexp_replace(v_ced, '[^0-9]', '', 'g');
  if found then
    v_cliente_id := v_cliente.id;
    if v_nom is null then
      v_nom := nullif(btrim(v_cliente.nombre), '');
      v_maestro := v_nom is not null;
    end if;
    if v_ape is null and nullif(btrim(coalesce(v_cliente.apellido, '')), '') is not null then
      v_ape := btrim(v_cliente.apellido);
      v_maestro := true;
    end if;
    if v_tel is null and length(regexp_replace(coalesce(v_cliente.telefono, ''), '[^0-9]', '', 'g')) >= 10 then
      v_tel := btrim(v_cliente.telefono);
      v_maestro := true;
    end if;
  end if;

  if v_nom is null then raise exception 'Falta tu nombre.'; end if;
  if v_ape is null then raise exception 'Falta tu apellido.'; end if;
  if v_tel is null then raise exception 'Falta tu numero de telefono.'; end if;
  if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
    raise exception 'Ese telefono esta incompleto. Escribelo con el codigo, por ejemplo 0412 1234567.';
  end if;

  begin
    v_entrega := coalesce(nullif(trim(p_entrega), ''), 'tienda')::forma_entrega;
  exception when others then
    raise exception 'La forma de entrega tiene que ser tienda o envio.';
  end;

  if v_entrega = 'envio' then
    begin
      v_empresa := nullif(trim(p_envio_empresa), '')::empresa_envio;
    exception when others then
      raise exception 'La empresa de envio tiene que ser Domesa o MRW.';
    end;
    if v_empresa is null then raise exception 'Dinos por cual empresa lo enviamos: Domesa o MRW.'; end if;
    if v_agencia is null then raise exception 'Falta a que agencia lo enviamos.'; end if;
    if v_direccion is null then raise exception 'Falta la direccion de la agencia.'; end if;
  else
    v_empresa   := null;
    v_agencia   := null;
    v_direccion := null;
  end if;

  -- El tope técnico de `cotizar_pedido`, no de negocio.
  if jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 300 then
    raise exception 'Demasiadas piezas distintas en un solo pedido.';
  end if;

  perform limpiar_reservas();

  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  -- El tramo, línea por línea (`tramo_de_carrito`): los dijes no cuentan y
  -- solo lo reciben los que van con una base.
  v_tramo   := tramo_de_carrito(p_items);
  v_previas := (v_tramo->>'piezas')::int;
  v_desc    := (v_tramo->>'descuento_pct')::numeric;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    -- Con los mensajes de la clienta, antes de pedir el precio.
    select m.nombre || coalesce(' · ' || m.variante, ''),
           coalesce(m.precio_override_usd, g.precio_usd)
      into v_nombre, v_precio
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo and m.activo;
    if not found then
      raise exception 'Una de las piezas que elegiste ya no esta disponible.';
    end if;
    if v_precio is null then
      raise exception 'La pieza "%" todavia no tiene precio. Escribenos y te cotizamos.', v_nombre;
    end if;

    select coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = v_modelo), 0)
         - apartadas_de(v_modelo)
      into v_disponible;

    if v_cantidad > v_disponible then
      raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, greatest(v_disponible, 0), v_cantidad;
    end if;

    select * into p from precio_de_linea(v_modelo, null, coalesce((v_tramo->'por_modelo'->>v_modelo::text)::numeric, 0), null);

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'modelo_id', v_modelo, 'cantidad', v_cantidad,
      'precio_usd', p.precio_usd, 'precio_lista_usd', p.precio_lista, 'motivo', p.motivo));

    v_piezas   := v_piezas + v_cantidad;
    v_subtotal := v_subtotal + (p.precio_lista * v_cantidad);
    v_total    := v_total + (p.precio_usd * v_cantidad);
  end loop;

  -- Lo libre, sumado por pieza: la misma pieza en varias líneas no se
  -- cuela dos veces, ni llega así a un tramo (como `cotizar_pedido`).
  if exists (
    select 1
      from (select (x->>'modelo_id')::bigint as modelo, sum(greatest(coalesce((x->>'cantidad')::int, 0), 0)) as pide
              from jsonb_array_elements(p_items) x
             group by 1) q
     where q.pide > coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = q.modelo), 0)
                    - apartadas_de(q.modelo)
  ) then
    raise exception 'De una de las piezas que elegiste no quedan tantas disponibles.';
  end if;

  v_total := round(v_total, 4);

  select valor into v_minutos from configuracion where clave = 'reserva_minutos';

  insert into reservas (cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
                        entrega, envio_empresa, envio_agencia, envio_direccion,
                        piezas, subtotal_usd, descuento_pct, total_usd, expira_en,
                        cliente_id, datos_del_maestro, origen)
  values (v_nom, v_ape, v_ced, v_tel,
          v_entrega, v_empresa, v_agencia, v_direccion,
          v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now() + (coalesce(v_minutos, 60) || ' minutes')::interval,
          v_cliente_id, v_maestro, 'catalogo')
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad, precio_usd, precio_lista_usd, motivo_rebaja)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int,
         (x->>'precio_usd')::numeric, (x->>'precio_lista_usd')::numeric, x->>'motivo'
    from jsonb_array_elements(v_lineas) x;

  -- Qué dije va en qué base, si el navegador lo dice y cuadra.
  perform guardar_armados(v_id, p_armados);

  return v_token;
end;
$fn$;

revoke all on function crear_reserva(jsonb, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function crear_reserva(jsonb, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;

-- Lo que lee Pedidos: qué dije va en qué base. Solo el personal. Cada
-- pareja, topada con lo que queda en el pedido: si se quita el dije o la
-- cadena ("Quitar", que deja la línea en cero), la pareja deja de decirse.
-- Las parejas de un mismo dije (o de una misma base) se topan en el orden
-- en que se armaron, como en el navegador.
create or replace view v_pedido_armado
with (security_invoker = off) as
with parejas as (
  select a.*,
         coalesce(sum(a.cantidad) over (partition by a.reserva_id, a.dije_id order by a.id
                                        rows between unbounded preceding and 1 preceding), 0) as antes_dije,
         coalesce(sum(a.cantidad) over (partition by a.reserva_id, a.base_id order by a.id
                                        rows between unbounded preceding and 1 preceding), 0) as antes_base,
         coalesce((select sum(ri.cantidad) from reserva_items ri
                    where ri.reserva_id = a.reserva_id and ri.modelo_id = a.dije_id), 0) as quedan_dije,
         coalesce((select sum(ri.cantidad) from reserva_items ri
                    where ri.reserva_id = a.reserva_id and ri.modelo_id = a.base_id), 0) as quedan_base
    from reserva_armados a
)
select
  p.reserva_id,
  p.dije_id,
  d.nombre || coalesce(' · ' || d.variante, '') as dije_nombre,
  p.base_id,
  b.nombre || coalesce(' · ' || b.variante, '') as base_nombre,
  least(p.cantidad, p.quedan_dije - p.antes_dije, p.quedan_base - p.antes_base)::int as cantidad
from parejas p
join modelos d on d.id = p.dije_id
join modelos b on b.id = p.base_id
where es_personal()
  and least(p.cantidad, p.quedan_dije - p.antes_dije, p.quedan_base - p.antes_base) > 0;

revoke all on v_pedido_armado from anon;
grant select on v_pedido_armado to authenticated;


-- ---------------------------------------------------------------------
-- 8. LAS CUENTAS QUE CUENTAN PIEZAS, SIN DIJES
-- Mismas columnas y en el mismo orden. Lo que cambia es qué se cuenta:
-- las piezas (y el empaque que se resta por pieza) sin las líneas de dije;
-- el dinero, con ellas.
-- ---------------------------------------------------------------------

-- El volumen del mes reparte lo de tienda entre piezas. El dije no lo
-- carga: si contara, lo de tienda por pieza bajaría en todo el catálogo.
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
        join ventas v on v.id = i.venta_id and not v.anulada
       where not i.es_dije;
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
  select coalesce(sum(e.cantidad), 0) into v_reales
    from existencias e join modelos m on m.id = e.modelo_id
   where m.armado is distinct from 'dije';
  if v_reales > 0 then
    return round(v_reales / v_rot, 2);
  end if;

  return 0;
end;
$$;

create or replace view v_volumen
with (security_invoker = off) as
select
  volumen_mensual_estimado()                                   as piezas_mes,
  (select min(fecha)::date from ventas where not anulada)      as primera_venta,
  (select coalesce(sum(i.cantidad), 0)
     from venta_items i join ventas v on v.id = i.venta_id and not v.anulada where not i.es_dije) as piezas_vendidas,
  case
    when (select min(fecha)::date from ventas where not anulada) is not null
     and current_date - (select min(fecha)::date from ventas where not anulada) >= 30
     and (select coalesce(sum(i.cantidad), 0)
            from venta_items i join ventas v on v.id = i.venta_id and not v.anulada where not i.es_dije) > 0
    then 'ventas' else 'estimado'
  end                                                          as origen,
  case
    when (select min(fecha)::date from ventas where not anulada) is not null
    then round((current_date - (select min(fecha)::date from ventas where not anulada)) / 30.0, 1)
  end                                                          as meses_observados
where es_admin();

-- La cuenta del dueño: las piezas sin dijes, el dinero con ellos. Así lo
-- que deja cada pieza es lo que deja una joya (base + dije), y de aquí
-- salen solos `v_cobertura_mes`, `v_diagnostico` y la meta de la vendedora.
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
      coalesce(sum(i.cantidad) filter (where not i.es_dije), 0) as piezas,
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
      and m.armado is distinct from 'dije'
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
      coalesce(sum(i.cantidad) filter (where not i.es_dije), 0) as piezas,
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

-- La meta de la vendedora y su día: las piezas sin dijes.
create or replace function meta_vendedora()
returns table (
  meta_hoy      int,
  meta_mes      int,
  para          text,
  vendidas_hoy  int,
  vendidas_mes  int,
  dia_del_mes   int,
  dias_del_mes  int,
  ritmo_mes     int,
  dias_abiertos int
)
language sql
stable
security definer
set search_path = public
as $fn$
  with local as (
    select
      coalesce(sum(i.cantidad) filter (where v.fecha::date = current_date and not i.es_dije), 0) as hoy,
      coalesce(sum(i.cantidad) filter (where not i.es_dije), 0)                                             as mes
    from venta_items i
    join ventas v on v.id = i.venta_id and not v.anulada
    where v.revendedor_id is null
      and v.fecha >= date_trunc('month', now())
  )
  select
    coalesce(p.piezas_meta_dia, p.piezas_equilibrio_dia)::int,
    coalesce(p.piezas_meta_mes, p.piezas_equilibrio_mes)::int,
    case when p.piezas_meta_mes is not null then 'meta'
         when p.piezas_equilibrio_mes is not null then 'equilibrio' end,
    l.hoy::int,
    l.mes::int,
    p.dia_del_mes,
    p.dias_del_mes,
    (case when p.dia_del_mes > 0 then round(l.mes::numeric / p.dia_del_mes * p.dias_del_mes, 0) end)::int,
    p.dias_abiertos_mes::int
  from plan_ventas() p
  cross join local l
  where auth.uid() is not null;
$fn$;

create or replace view v_vendedoras
with (security_invoker = off) as
select
  p.id,
  p.nombre,
  p.activo,
  p.numero_vendedora,
  p.creado_en,
  coalesce(s.piezas_hoy, 0)    as piezas_hoy,
  coalesce(s.piezas_mes, 0)    as piezas_mes,
  coalesce(s.ventas_mes, 0)    as ventas_mes,
  coalesce(s.total_mes_bcv, 0) as total_mes_bcv,
  (select max(v.fecha) from ventas v
    where v.usuario_id = p.id and not v.anulada and v.revendedor_id is null) as ultima_venta
from perfiles p
left join lateral (
  select
    sum(x.piezas) filter (where v.fecha::date = current_date)::int as piezas_hoy,
    sum(x.piezas)::int                                              as piezas_mes,
    count(*)::int                                                   as ventas_mes,
    round(sum(v.total_bs / v.tasa_bcv_usada), 2)                    as total_mes_bcv
  from ventas v
  cross join lateral (select coalesce(sum(i.cantidad), 0) as piezas
                        from venta_items i where i.venta_id = v.id and not i.es_dije) x
  where v.usuario_id = p.id
    and not v.anulada
    and v.revendedor_id is null
    and v.fecha >= date_trunc('month', now())
) s on true
where p.rol = 'vendedora'
  and es_admin();

create or replace view v_tablero_dia
with (security_invoker = off) as
select
  v.usuario_id,
  count(*) filter (where v.devolucion_de is null) as ventas,
  coalesce(sum(v.total_bs), 0)               as total_bs,
  coalesce(sum(p.piezas), 0)                 as piezas,
  coalesce(sum(p.premium), 0)                as piezas_premium,
  case when count(*) filter (where v.devolucion_de is null) > 0
       then round(sum(v.total_bs) filter (where v.devolucion_de is null)
                  / count(*) filter (where v.devolucion_de is null), 2)
       else 0 end                            as ticket_promedio_bs,
  round(coalesce(sum(v.total_bs / v.tasa_bcv_usada), 0), 2) as total_bcv,
  case when count(*) filter (where v.devolucion_de is null) > 0
       then round(sum(v.total_bs / v.tasa_bcv_usada) filter (where v.devolucion_de is null)
                  / count(*) filter (where v.devolucion_de is null), 2)
       else 0 end                            as ticket_promedio_bcv
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad) filter (where not i.es_dije), 0) as piezas,
    coalesce(sum(i.cantidad) filter (
      where not i.es_dije and i.precio_unitario_usd >= (select valor from configuracion where clave = 'premium_min_usd')
    ), 0) as premium
  from venta_items i
  where i.venta_id = v.id
) p on true
where not v.anulada
  and v.revendedor_id is null
  and v.fecha::date = current_date
  and (es_admin() or v.usuario_id = auth.uid())
group by v.usuario_id;

-- Lo que dejó cada día, la mezcla por grupo y la recuperación: el empaque
-- se resta por cada pieza que no es un dije.
create or replace view v_ventas_por_dia
with (security_invoker = off) as
select
  v.fecha::date                                as dia,
  count(*) filter (where v.devolucion_de is null) as ventas,
  coalesce(sum(m.piezas), 0)                   as piezas,
  coalesce(sum(v.total_bs), 0)                 as total_bs,
  coalesce(sum(v.total_bs / v.tasa_bcv_usada), 0) as total_usd,
  coalesce(sum(m.costo_usd), 0)                as costo_usd,
  coalesce(sum((v.total_bs - v.extra_bs) / v.tasa_bcv_usada - m.costo_usd), 0) as ganancia_usd,
  coalesce(sum(m.mercancia_usd), 0)            as mercancia_usd,
  coalesce(sum((v.total_bs - v.extra_bs) / v.tasa_bcv_usada - m.mercancia_usd
               - m.piezas_empaque * (select coalesce((select valor from configuracion
                                               where clave = 'empaque_por_pieza_usd'), 0))), 0)
                                               as contribucion_usd,
  coalesce(sum(v.extra_bs / v.tasa_bcv_usada), 0) as extra_bcv
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum(i.cantidad) filter (where not i.es_dije), 0) as piezas_empaque,
    coalesce(sum((i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                  + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad), 0) as costo_usd,
    coalesce(sum(i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                 * i.cantidad), 0) as mercancia_usd
  from venta_items i where i.venta_id = v.id
) m on true
where not v.anulada
  and es_admin()
group by v.fecha::date;

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
      - (case when i.es_dije then 0 else i.cantidad end) * (select coalesce((select valor from configuracion
                                        where clave = 'empaque_por_pieza_usd'), 0))) as contribucion_usd
from venta_items i
join ventas v   on v.id = i.venta_id and not v.anulada
join modelos mo on mo.id = i.modelo_id
left join grupos_precio g on g.id = mo.grupo_precio_id
where es_admin()
group by coalesce(g.nombre, 'Sin grupo'), coalesce(g.orden, 999);

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
    coalesce(sum(i.cantidad) filter (where not i.es_dije), 0)               as piezas_empaque,
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
    d.ingreso_bcv - d.costo_mercancia_bcv - f.empaque * d.piezas_empaque            as contribucion,
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


-- ---------------------------------------------------------------------
-- 9. LAS VISTAS DEL CATÁLOGO DICEN QUÉ ES CADA PIEZA
-- `armado` al final de cada una. En la del dueño, lo de tienda de un dije
-- es cero, así su margen se mide como su precio.
-- ---------------------------------------------------------------------

create or replace view v_catalogo_base
with (security_invoker = off) as
select
  m.id, m.sku, m.nombre, m.categoria, m.descripcion, m.variantes_nota,
  m.foto_path, m.foto_thumb_path,
  g.nombre as grupo,
  coalesce(m.precio_override_usd, g.precio_usd) as precio_usd,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv, 2) as precio_bs,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv / t.tasa_venta, 4) as precio_usd_real,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0) as existencia_total,
  m.activo,
  precio_minimo_de(m.id) as precio_minimo_usd,
  round(precio_minimo_de(m.id) * t.tasa_bcv, 2) as precio_minimo_bs,
  (select string_agg(u.nombre, ' · ' order by u.orden, u.nombre)
     from existencias e
     join ubicaciones u on u.id = e.ubicacion_id
    where e.modelo_id = m.id and e.cantidad > 0) as ubicaciones,
  (select string_agg(coalesce(u.codigo, upper(left(u.nombre, 2))), ' · ' order by u.orden, u.nombre)
     from existencias e
     join ubicaciones u on u.id = e.ubicacion_id
    where e.modelo_id = m.id and e.cantidad > 0) as ubicaciones_codigo,
  coalesce(m.familia_id, m.id) as familia,
  m.variante,
  piso_margen_de(m.id) as piso_tramo_usd,
  round(piso_margen_de(m.id) * t.tasa_bcv, 2) as piso_tramo_bs,
  -- Nuevas. Su lote no ha llegado: es nueva y no se vende todavía.
  coalesce(lc.en_camino, false) as proximamente,
  -- Lo que viene de ella en lotes que no han llegado (nueva o reposición).
  coalesce((select sum(p.cantidad)
              from por_llegar p
              join lotes lp on lp.id = p.lote_id
             where p.modelo_id = m.id and lp.en_camino), 0)::int as por_llegar,
  (select string_agg(distinct lp.codigo, ' · ')
     from por_llegar p
     join lotes lp on lp.id = p.lote_id
    where p.modelo_id = m.id and lp.en_camino and p.cantidad > 0) as por_llegar_lotes,
  -- Nueva: dije, base o nada.
  m.armado
from modelos m
left join grupos_precio g on g.id = m.grupo_precio_id
left join lotes lc on lc.id = m.lote_id
left join lateral (select * from tasas where vigente limit 1) t on true
where m.activo;

create or replace view v_catalogo_admin
with (security_invoker = off) as
 SELECT v.id,
    v.sku,
    v.nombre,
    v.categoria,
    v.descripcion,
    v.variantes_nota,
    v.foto_path,
    v.foto_thumb_path,
    v.grupo,
    v.precio_usd,
    v.precio_bs,
    v.precio_usd_real,
    v.existencia_total,
    v.activo,
    v.precio_minimo_usd,
    v.precio_minimo_bs,
    m.costo_unitario_usd,
    m.flete_unitario_usd,
    m.costo_puesto_usd,
    m.lote_id,
    o.operativo AS costo_operativo_usd,
    o.merma AS factor_merma,
    round(m.costo_puesto_usd * o.factor * o.merma, 4) AS costo_mercancia_bcv,
    round(m.costo_puesto_usd * o.factor * o.merma + o.operativo, 4) AS costo_total_usd,
    round(v.precio_usd - (m.costo_puesto_usd * o.factor * o.merma + o.operativo), 4) AS margen_usd,
        CASE
            WHEN v.precio_usd > 0::numeric THEN round((v.precio_usd - (m.costo_puesto_usd * o.factor * o.merma + o.operativo)) / v.precio_usd * 100::numeric, 2)
            ELSE 0::numeric
        END AS margen_pct,
        CASE
            WHEN o.factor > 0::numeric THEN round((v.precio_usd - (m.costo_puesto_usd * o.factor * o.merma + o.operativo)) / o.factor, 4)
            ELSE NULL::numeric
        END AS ganancia_real_usd,
    m.grupo_precio_id,
    m.precio_override_usd,
    l.codigo AS lote_codigo,
    v.familia,
    v.variante,
    -- Nuevas.
    v.proximamente,
    v.por_llegar,
    v.por_llegar_lotes,
    -- Nueva.
    v.armado
   FROM v_catalogo_base v
     JOIN modelos m ON m.id = v.id
     LEFT JOIN lotes l ON l.id = m.lote_id
     CROSS JOIN LATERAL ( SELECT CASE WHEN m.armado = 'dije' THEN 0::numeric
                                 ELSE COALESCE(costo_operativo_admin(), 0::numeric) END AS operativo,
            COALESCE(factor_merma(), 1::numeric) AS merma,
            COALESCE(( SELECT tasas.tasa_venta / tasas.tasa_bcv
                   FROM tasas
                  WHERE tasas.vigente
                 LIMIT 1), 1::numeric) AS factor) o
  WHERE es_admin();

create or replace view v_catalogo_venta
with (security_invoker = off) as
select
  b.id, b.sku, b.nombre, b.categoria, b.descripcion, b.variantes_nota,
  b.foto_path, b.foto_thumb_path, b.grupo,
  b.precio_usd, b.precio_bs, b.precio_usd_real, b.existencia_total, b.activo,
  b.precio_minimo_usd, b.precio_minimo_bs,
  b.ubicaciones, b.ubicaciones_codigo,
  b.familia, b.variante, b.piso_tramo_usd, b.piso_tramo_bs,
  b.armado
from v_catalogo_base b
where not b.proximamente;

create or replace view v_venta_ubicacion
with (security_invoker = off) as
select
  e.ubicacion_id, c.id as modelo_id, c.sku, c.nombre, c.categoria,
  c.variantes_nota, c.foto_thumb_path, c.foto_path, c.grupo,
  c.precio_usd, c.precio_bs,
  coalesce(l.libre, e.cantidad) as cantidad,
  c.precio_minimo_usd, c.precio_minimo_bs,
  c.familia, c.variante, c.piso_tramo_usd, c.piso_tramo_bs,
  -- Nuevas.
  e.cantidad                  as existencia,
  coalesce(l.apartadas, 0)    as apartadas,
  c.armado
from existencias e
join v_catalogo_venta c on c.id = e.modelo_id
left join v_existencia_libre l on l.modelo_id = e.modelo_id and l.ubicacion_id = e.ubicacion_id;

create or replace view v_disponible_publico
with (security_invoker = off) as
select * from (
  select
    c.id, c.sku, c.nombre, c.categoria, c.variantes_nota,
    c.foto_path, c.foto_thumb_path, c.precio_usd, c.precio_bs,
    c.existencia_total - apartadas_de(c.id) as disponible,
    c.ubicaciones_codigo,
    c.familia,
    c.variante,
    c.armado
  from v_catalogo_venta c
  where c.existencia_total > 0
) x
where x.disponible > 0;


-- ---------------------------------------------------------------------
-- 10. EL RESPALDO SE LLEVA LAS PAREJAS
-- ---------------------------------------------------------------------

create or replace function admin_respaldo(p_tabla text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_filas jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede sacar un respaldo.';
  end if;
  if p_tabla not in ('modelos', 'lotes', 'venta_items',
                     'abonos', 'abono_cambios', 'caja_movimientos',
                     'revendedores', 'revendedor_precios', 'revendedor_clientes',
                     'apartados', 'apartado_items', 'apartado_abonos',
                     'por_llegar', 'reserva_armados') then
    raise exception 'Esa tabla no esta en la lista del respaldo: %', p_tabla;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %I t', p_tabla)
     into v_filas;
  return v_filas;
end;
$fn$;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Nada cambió para lo que ya existe (ninguna pieza es dije todavía):
--
--      select count(*) from modelos where armado is not null;     -> 0
--      select count(*) from grupos_precio where escalera = 'dije'; -> 0
--
-- 2. En Grupos, carga la escalera de los dijes (los precios los decides
--    tú). Abre "Dije de letra burbuja mini", ponle "Dije" en "Tipo de
--    pieza": "Sale en" dice un grupo de los dijes, sin lo de tienda. Guarda:
--    sus 26 letras quedan como dijes, con ese precio.
--
-- 3. Una cadena "Base para armar" y un dije en el mostrador: el total es el
--    de la cadena más el del dije. Con 6 cadenas base y 6 dijes, el 5 % le
--    llega a los doce; con 5 piezas y 3 dijes no hay tramo.
--
-- 4. `npm run verificar` (la sección "LOS DIJES").
-- =====================================================================
