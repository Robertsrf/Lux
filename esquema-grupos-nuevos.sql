-- =====================================================================
-- Lux by Emory — la escalera de precios pasa a siete grupos
-- Ejecutar en el SQL Editor DESPUÉS de esquema-flete-y-gastos.sql
--
-- POR QUÉ SIETE Y POR QUÉ ESTOS
-- Salió de ordenar las 21 piezas cargadas por lo que deberían costar al
-- 45 % y mirar dónde quedan los huecos:
--
--   $8,02 → $10,72   seis piezas        (bloque de entrada)
--     hueco de 14 %
--   $12,21 → $15,99  doce piezas        (el grueso, 57 % del catálogo)
--     hueco de 25 %
--   $19,92 · $24,12 · $29,74            (tres sueltas)
--
-- Los grupos van en los huecos. Con seis, dos piezas no caben en ningún
-- grupo. Con siete, el peor sobreprecio cae de 26 % a 15 % y el precio
-- promedio sube solo 6,5 %. Con once apenas se gana 2 puntos más y deja
-- de ser una escalera: es poner precio pieza por pieza.
--
--   G9 · G11 · G14 · G16 · G20 · G25 · G30
--
-- PISO ESTRUCTURAL
-- Con $3,04 de tienda por pieza, ni una pieza regalada baja de $5,52 al
-- 45 %. No puede existir un grupo por debajo de G9 mientras no bajen los
-- gastos. No es decisión de precios: es aritmética.
--
-- LOS SKU NO SE TOCAN
-- ARE-G12-001 se va a G14 y su SKU sigue diciendo G12. Es correcto: un
-- SKU es un identificador histórico, no una etiqueta de precio. Cambiarlo
-- rompería cualquier marbete ya impreso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. REPARA admin_previsualizar_flete
--
-- Al quitarle el peso la reescribí devolviendo null para quien no es
-- admin. La original lanzaba excepción, y eso es lo correcto: null no
-- distingue "no hay lote" de "no tienes permiso", y todas las demás
-- funciones admin_* rechazan de frente. La pantalla de Verificación lo
-- detectó.
-- ---------------------------------------------------------------------

drop function if exists admin_previsualizar_flete(bigint);

create or replace function admin_previsualizar_flete(p_lote_id bigint)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede consultar costos.';
  end if;
  return calcular_flete_unitario(p_lote_id);
end;
$$;

revoke all on function admin_previsualizar_flete(bigint) from public, anon;
grant execute on function admin_previsualizar_flete(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 1. LOS GRUPOS QUE FALTAN
-- ---------------------------------------------------------------------

insert into grupos_precio (nombre, precio_usd, orden, activo) values
  ('G11', 11, 20, true),
  ('G20', 20, 20, true),
  ('G25', 25, 20, true),
  ('G30', 30, 20, true)
on conflict (nombre) do update
  set precio_usd = excluded.precio_usd,
      activo     = true;

-- ---------------------------------------------------------------------
-- 2. LOS PRECIOS PROPIOS QUE SOLO REPETÍAN EL GRUPO
--
-- Tres piezas llevan precio propio de $9, exactamente el de su grupo. No
-- aportan nada y sí estorban: con el precio propio puesto, cambiar de
-- grupo no cambia el precio. Se quitan solo esos, los que repiten. Un
-- precio propio que difiera del grupo es una decisión y se respeta.
-- ---------------------------------------------------------------------

update modelos m
   set precio_override_usd = null,
       actualizado_en      = now()
  from grupos_precio g
 where g.id = m.grupo_precio_id
   and m.precio_override_usd is not null
   and m.precio_override_usd = g.precio_usd;

-- ---------------------------------------------------------------------
-- 3. CADA PIEZA AL GRUPO QUE LE TOCA
--
-- No se asigna a mano pieza por pieza: se calcula con la misma fórmula
-- que usa `admin_sugerir_precio`, para que no haya dos verdades. Cada
-- modelo cae en el grupo más barato que cubra su precio ideal, que es
-- redondear hacia arriba.
--
--   precio ideal = costo_total_bcv(costo puesto) / (1 − margen)
--
-- El margen sale de `margen_objetivo_pct`, no de un número escrito aquí.
-- Las piezas con precio propio distinto del grupo no se tocan: quien lo
-- puso lo puso por algo.
-- ---------------------------------------------------------------------

with objetivo as (
  select least(coalesce((select valor from configuracion
                          where clave = 'margen_objetivo_pct'), 45), 99) / 100 as m
),
ideal as (
  select
    mo.id,
    round(costo_total_bcv(mo.costo_puesto_usd) / (1 - o.m), 4) as precio_ideal
  from modelos mo cross join objetivo o
  where mo.activo and mo.precio_override_usd is null
),
destino as (
  select
    i.id,
    coalesce(
      (select g.id from grupos_precio g
        where g.activo and g.precio_usd >= i.precio_ideal
        order by g.precio_usd asc limit 1),
      -- Si ninguno llega, va al más alto y el inventario lo delatará con
      -- un margen bajo. Mejor eso que dejarlo sin grupo y sin precio.
      (select g.id from grupos_precio g where g.activo order by g.precio_usd desc limit 1)
    ) as grupo_id
  from ideal i
)
update modelos m
   set grupo_precio_id = d.grupo_id,
       actualizado_en  = now()
  from destino d
 where d.id = m.id
   and d.grupo_id is not null
   and m.grupo_precio_id is distinct from d.grupo_id;

-- ---------------------------------------------------------------------
-- 4. LOS QUE QUEDARON VACÍOS SE APAGAN
--
-- No se borran: un grupo borrado se lleva por delante el histórico de
-- cualquier venta que lo mencione. Apagado deja de ofrecerse al cargar
-- una pieza y no rompe nada de lo ya registrado.
-- ---------------------------------------------------------------------

update grupos_precio g
   set activo = false
 where g.activo
   and not exists (select 1 from modelos m where m.grupo_precio_id = g.id and m.activo);

-- ---------------------------------------------------------------------
-- 5. LA ESCALERA SE NUMERA SOLA, DE BARATO A CARO
-- ---------------------------------------------------------------------

with orden_nuevo as (
  select id, row_number() over (order by precio_usd asc) as n
  from grupos_precio where activo
)
update grupos_precio g
   set orden = o.n
  from orden_nuevo o
 where o.id = g.id;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
--   select nombre, precio_usd, orden, activo from grupos_precio
--    order by activo desc, precio_usd;
--     -> activos: G9 G11 G14 G16 G20 G25 G30
--     -> apagados: G12 G19 G22
--
--   select sku, grupo, precio_usd, margen_pct from v_catalogo_admin
--    order by precio_usd, sku;
--     -> ninguna pieza por debajo de 45 %
--
--   select * from v_diagnostico;
--     precio_bcv_promedio          -> 14,81   (hoy 13,90)
--     margen_actual_pct            -> 47,8 % (hoy 44,4 %)
--     ganancia_proyectada_mes_usd  -> 849,67 (hoy 741,10)
--
--   El promedio queda POR ENCIMA del 45 % a proposito: redondear hacia
--   arriba solo puede dejar la pieza por encima de su ideal, nunca debajo.
-- =====================================================================
