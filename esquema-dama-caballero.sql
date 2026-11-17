-- =====================================================================
-- #67  DAMA, CABALLERO O UNISEX
--
-- Depende de: esquema-ofertas-en-pantallas.sql (#66).
--
-- Por qué (pedido del dueño del 17/11/2026)
--   Llega un lote con joyería de caballero. El dueño quiere que cada
--   producto diga para quién es, y que el catálogo y la landing dejen
--   ver "Dama", "Caballero" o "Todas", mezcladas.
--
-- Qué hace
--   1. `modelos.para`: 'dama', 'caballero' o 'unisex' (null: sin marcar).
--      Es del PRODUCTO, como la categoría: lo llevan todas sus medidas.
--      Un disparador se lo copia a una medida nueva de un producto que ya
--      lo tiene.
--   2. Marca lo que ya está cargado, producto por producto, leyendo su
--      nombre, su categoría y sus notas (las reglas están abajo, en §2).
--      SOLO toca lo que no tiene marca: correrlo otra vez no deshace lo
--      que el dueño corrigió. Al final enseña cada producto con lo que se
--      le puso y por qué, para revisarlo.
--   3. `para`, AL FINAL, en v_catalogo_base, v_catalogo_admin,
--      v_catalogo_venta, v_disponible_publico y v_proximamente. Ninguna
--      columna de costo nueva; los mismos permisos.
--   4. `admin_fijar_para(modelos, para)`: el dueño cambia la marca de uno
--      o de varios productos de una vez (Inventario y el formulario). La
--      aplica a toda la familia. Con `if not es_admin() then raise`.
--
--   No cambia ninguna función que el navegador ya llame (regla 3): la
--   marca se guarda con su propia función, después de guardar el
--   producto. Sin este archivo el navegador nuevo funciona igual, salvo
--   el selector "Dama · Caballero", que necesita la columna.
--
-- Se puede correr las veces que haga falta.
--
-- Qué debería dar
--   - La última consulta lista cada producto activo con su marca y el
--     motivo ("nombre: hombre", "acabado negro", "sin señal: dama").
--     Ningún producto queda sin marca.
--   - select count(*) from v_disponible_publico where para is null;  -> 0
--   - Sin sesión, select para from v_proximamente responde (no da error).
--   - Como vendedora, rpc admin_fijar_para -> "Solo un administrador...".
-- =====================================================================


-- ---------------------------------------------------------------------
-- §1. LA COLUMNA
-- ---------------------------------------------------------------------

alter table modelos add column if not exists para text;

alter table modelos drop constraint if exists modelos_para_valido;
alter table modelos add constraint modelos_para_valido
  check (para is null or para in ('dama', 'caballero', 'unisex'));

comment on column modelos.para is
  'Para quién es el producto: dama, caballero o unisex (null: sin marcar). Lo llevan todas sus medidas.';

-- Una medida nueva de un producto marcado nace con su marca. Así
-- `guardar_variantes_de` no tiene que cambiar.
create or replace function modelo_hereda_para()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.para is null and new.familia_id is not null and new.familia_id <> coalesce(new.id, -1) then
    select para into new.para from modelos where id = new.familia_id;
  end if;
  return new;
end;
$fn$;

revoke all on function modelo_hereda_para() from public, anon, authenticated;

drop trigger if exists modelo_hereda_para on modelos;
create trigger modelo_hereda_para
  before insert on modelos
  for each row execute function modelo_hereda_para();


-- ---------------------------------------------------------------------
-- §2. LO QUE YA ESTÁ CARGADO
-- Por producto (la familia), con el nombre, la categoría, la nota y la
-- descripción de su cabeza, sin acentos y en minúsculas. En este orden,
-- la primera regla que encaja manda:
--   a. Lo dice el nombre: hombre, caballero, masculino  -> caballero
--   b. Lo dice el nombre: unisex                         -> unisex
--   c. Lo dice el nombre: mujer, dama, femenino, niña   -> dama
--   d. Zarcillos, aretes, tobilleras, chokers, piercing,
--      o lleva perla, corazón, flor, mariposa, lazo...   -> dama
--   e. Acabado negro (negro, black) o motivos de caballero
--      (anubis, calavera, ancla, brújula, vikingo, cruz
--      negra) en anillo, pulsera, cadena, collar o dije   -> caballero
--   f. Cadena sola de eslabón clásico (cubana, franco,
--      fígaro, cordón, rope, box)                        -> unisex
--   g. Sin señal                                         -> dama
--      (lo que había antes de este lote era joyería de dama)
-- El dueño corrige lo que no cuadre desde el Inventario.
-- ---------------------------------------------------------------------

drop table if exists pg_temp.para_sugerida;
create temp table para_sugerida as
with cabezas as (
  select
    coalesce(m.familia_id, m.id) as familia,
    m.nombre,
    m.categoria,
    lower(translate(
      concat_ws(' ', m.nombre, m.categoria, m.variantes_nota, m.descripcion),
      'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) as t,
    lower(translate(coalesce(m.categoria, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) as cat
  from modelos m
  where m.id = coalesce(m.familia_id, m.id)
),
sin_marca as (
  select c.*
    from cabezas c
   where not exists (select 1 from modelos x
                      where coalesce(x.familia_id, x.id) = c.familia and x.para is not null)
)
select
  familia, nombre, categoria,
  case
    when t ~ '\m(hombres?|caballeros?|masculin[oa]s?|varon(es)?)\M'                         then 'caballero'
    when t ~ '\munisex\M'                                                                   then 'unisex'
    when t ~ '\m(mujer(es)?|damas?|femenin[oa]s?|ninas?)\M'                                 then 'dama'
    when cat ~ '(arete|zarcillo|tobiller|choker|piercing|candonga|topito|broche)'
      or t ~ '\m(perlas?|corazon(es)?|flor(es)?|mariposas?|lazos?|monos?|trebol(es)?|conchas?|caracol(es)?|estrellas?|lunas?)\M'
                                                                                            then 'dama'
    when cat ~ '(anillo|pulsera|brazalete|esclava|cadena|collar|dije|medall)'
     and t ~ '\m(negr[oa]s?|black|anubis|calaveras?|craneo|skull|anclas?|brujulas?|vikingos?|dragon(es)?|lobos?)\M'
                                                                                            then 'caballero'
    when cat ~ '(cadena|collar)'
     and t ~ '\m(cubanas?|cuban|franco|figaro|cordon|rope|box|barbada)\M'                  then 'unisex'
    else 'dama'
  end as para,
  case
    when t ~ '\m(hombres?|caballeros?|masculin[oa]s?|varon(es)?)\M'                         then 'el nombre dice hombre o caballero'
    when t ~ '\munisex\M'                                                                   then 'el nombre dice unisex'
    when t ~ '\m(mujer(es)?|damas?|femenin[oa]s?|ninas?)\M'                                 then 'el nombre dice mujer o dama'
    when cat ~ '(arete|zarcillo|tobiller|choker|piercing|candonga|topito|broche)'
                                                                                            then 'por su tipo: ' || categoria
    when t ~ '\m(perlas?|corazon(es)?|flor(es)?|mariposas?|lazos?|monos?|trebol(es)?|conchas?|caracol(es)?|estrellas?|lunas?)\M'
                                                                                            then 'motivo de dama (perla, corazón, flor...)'
    when cat ~ '(anillo|pulsera|brazalete|esclava|cadena|collar|dije|medall)'
     and t ~ '\m(negr[oa]s?|black|anubis|calaveras?|craneo|skull|anclas?|brujulas?|vikingos?|dragon(es)?|lobos?)\M'
                                                                                            then 'acabado negro o motivo de caballero'
    when cat ~ '(cadena|collar)'
     and t ~ '\m(cubanas?|cuban|franco|figaro|cordon|rope|box|barbada)\M'                  then 'cadena de eslabón clásico'
    else 'sin señal: dama'
  end as motivo
from sin_marca;

update modelos m
   set para = s.para
  from para_sugerida s
 where coalesce(m.familia_id, m.id) = s.familia
   and m.para is null;


-- ---------------------------------------------------------------------
-- §3. LAS VISTAS, CON `para` AL FINAL
-- Las definiciones vigentes (esquema-dijes.sql y esquema-lote-en-camino.sql)
-- con una columna más al final de cada una. `create or replace` solo deja
-- añadir AL FINAL; los permisos se quedan.
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
  coalesce(lc.en_camino, false) as proximamente,
  coalesce((select sum(p.cantidad)
              from por_llegar p
              join lotes lp on lp.id = p.lote_id
             where p.modelo_id = m.id and lp.en_camino), 0)::int as por_llegar,
  (select string_agg(distinct lp.codigo, ' · ')
     from por_llegar p
     join lotes lp on lp.id = p.lote_id
    where p.modelo_id = m.id and lp.en_camino and p.cantidad > 0) as por_llegar_lotes,
  m.armado,
  -- Nueva (#67): dama, caballero o unisex.
  m.para
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
    v.proximamente,
    v.por_llegar,
    v.por_llegar_lotes,
    v.armado,
    -- Nueva (#67).
    v.para
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
  b.armado,
  -- Nueva (#67).
  b.para
from v_catalogo_base b
where not b.proximamente;

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
    c.armado,
    -- Nueva (#67).
    c.para
  from v_catalogo_venta c
  where c.existencia_total > 0
) x
where x.disponible > 0;

create or replace view v_proximamente
with (security_invoker = off) as
select
  b.id, b.sku, b.nombre, b.categoria, b.variantes_nota,
  b.foto_path, b.foto_thumb_path, b.precio_usd, b.precio_bs,
  b.familia, b.variante,
  -- Nueva (#67).
  b.para
from v_catalogo_base b
where b.proximamente and b.por_llegar > 0;

grant select on v_proximamente to anon, authenticated;


-- ---------------------------------------------------------------------
-- §4. EL DUEÑO CAMBIA LA MARCA
-- De uno o de varios productos a la vez; siempre la familia entera.
-- p_para null la deja sin marcar. Devuelve cuántas filas cambió.
-- ---------------------------------------------------------------------

create or replace function admin_fijar_para(
  p_modelos bigint[],
  p_para    text
) returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_n int;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede marcar para quién es una pieza.';
  end if;
  if p_para is not null and p_para not in ('dama', 'caballero', 'unisex') then
    raise exception 'Para quién: dama, caballero o unisex.';
  end if;
  if coalesce(cardinality(p_modelos), 0) > 2000 then
    raise exception 'Son demasiadas piezas de una vez: hazlo por partes.';
  end if;

  update modelos m
     set para = p_para, actualizado_en = now()
   where coalesce(m.familia_id, m.id) in (
           select coalesce(x.familia_id, x.id) from modelos x where x.id = any(coalesce(p_modelos, '{}'))
         )
     and m.para is distinct from p_para;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function admin_fijar_para(bigint[], text) from public, anon;
grant execute on function admin_fijar_para(bigint[], text) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- §5. PARA REVISAR
-- Cada producto activo con su marca y, si la puso este archivo, por qué.
-- Lo que no cuadre se corrige en el Inventario (o con
-- `select admin_fijar_para(array[<id>], 'caballero');` desde la app).
-- ---------------------------------------------------------------------

select
  coalesce(m.familia_id, m.id) as producto,
  m.nombre,
  m.categoria,
  m.para,
  coalesce(s.motivo, 'ya estaba marcado') as motivo,
  count(*) as medidas
from modelos m
left join para_sugerida s on s.familia = coalesce(m.familia_id, m.id)
where m.activo
group by coalesce(m.familia_id, m.id), m.nombre, m.categoria, m.para, s.motivo
order by m.para, m.categoria, m.nombre;
