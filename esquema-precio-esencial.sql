-- =====================================================================
-- Lux by Emory — el precio lleva lo esencial: la mercancía y la operación
-- Ejecutar en el SQL Editor DESPUÉS de esquema-lote-y-grupos.sql (#62)
--
-- QUÉ PIDIÓ EL DUEÑO (27 y 28/10/2026)
-- Vio que lo de tienda de cada pieza pasó de unos $3 a $6,13 y creyó que
-- algo se sumaba dos veces. El diagnóstico, con sus datos, dijo que no:
--   (alquiler 120 + sueldos 200 + exhibidores 13,43) ÷ 55,31 piezas al mes
--   + 0,10 de empaque = 6,13.
-- El salto del 26/10 fue entre cuántas piezas se reparte: sin estimado en
-- Costos se repartía entre lo que había en la tienda (~$3, que no cubría
-- el mes), y al mes de la primera venta pasó a lo que de verdad se vende.
-- Y aparecieron dos fallos: los exhibidores y los muebles se sumaban cada
-- mes para siempre, también los de un lote que todavía no llega.
--
-- Lo decidió como dueño, después de verlo con números ("no quiero sumarle
-- tanto a la pieza sino lo esencial para tener buenos precios"):
--  1. Los muebles y los exhibidores NO van en el precio. Son inversión del
--     local: se pagan con la ganancia, y la pantalla Inversiones lleva la
--     cuenta de cuánto ha vuelto (`v_recuperacion`, que ya los medía contra
--     lo que sobra después del alquiler, los sueldos y los servicios).
--  2. El alquiler, los sueldos y los servicios se reparten entre una META de
--     piezas al mes que él escribe en Costos (`piezas_mes_meta`). Sin meta
--     (0), entre las que de verdad vende, como hasta hoy. Costos le sigue
--     diciendo cuántas vende de verdad y cuántas necesita para cubrir el mes.
--
-- QUÉ HACE
--  1. `gastos_fijos_partidas()`, la única fórmula de los gastos del mes,
--     misma firma y mismas columnas: alquiler, sueldos, servicios y otros
--     fijos. Sin muebles, muebles importados ni exhibidores. De ella cuelgan
--     solos lo de tienda por pieza, el precio sugerido, los pisos, Costos,
--     Reportes y la meta de la vendedora.
--  2. La clave `piezas_mes_meta` en `configuracion`, en 0: el dueño la
--     escribe en Costos. No se siembra ninguna cifra.
--  3. `volumen_real()`: las piezas al mes medidas como siempre (las
--     vendidas desde un mes después de la primera venta; antes, el estimado
--     de Costos o lo que hay en la tienda). Es la de antes, con otro nombre.
--  4. `volumen_mensual_estimado()`, la que reparte lo de tienda (misma
--     firma): la meta del dueño si la puso; si no, `volumen_real()`.
--  5. `v_volumen` dice de dónde sale ('meta', 'ventas' o 'estimado') y, al
--     final, `piezas_mes_reales`, para que Costos enseñe las dos.
--
-- LO QUE NO CAMBIA
-- La mercancía con su flete a la brecha de hoy, la merma, el empaque y el
-- margen. Las ventas ya hechas guardan lo de tienda de su día. Lo invertido
-- en muebles y exhibidores sigue en Inversiones, con su barra.
--
-- LAS FIRMAS
-- Ninguna cambia; `volumen_real` es nueva y `v_volumen` gana una columna al
-- final. El navegador de antes funciona igual con este archivo; el nuevo,
-- sin él, no enseña el campo de la meta.
--
-- Reejecutable.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LOS GASTOS DEL MES: SOLO LA OPERACIÓN
-- Lo que se paga se venda o no. Los muebles y los exhibidores se
-- recuperan de la ganancia (Inversiones), no del precio.
-- ---------------------------------------------------------------------

create or replace function gastos_fijos_partidas()
returns table (partida text, orden int, monto_bcv numeric, moneda text)
language sql
stable
security definer
set search_path = public
as $fn$
  with p as (
    select 'Alquiler'::text as partida, 1 as orden,
           coalesce((select valor from configuracion where clave = 'gasto_alquiler_mes_usd'), 0) as monto_bcv,
           'bcv'::text as moneda
    union all
    select 'Sueldos', 2,
           coalesce((select valor from configuracion where clave = 'gasto_sueldos_mes_usd'), 0), 'bcv'
    union all
    select 'Servicios', 3,
           coalesce((select valor from configuracion where clave = 'gasto_servicios_mes_usd'), 0), 'bcv'
    union all
    select 'Otros fijos', 4,
           coalesce((select valor from configuracion where clave = 'gasto_otros_mes_usd'), 0), 'bcv'
  )
  -- Sin redondear aquí: la suma se redondea una sola vez, igual que antes.
  select partida, orden, monto_bcv, moneda
    from p
   where monto_bcv > 0
   order by orden;
$fn$;

-- Devuelve el alquiler y la nómina: no se otorga a nadie (como siempre). La
-- llaman funciones de definidor, donde el permiso se mira contra el dueño.
revoke all on function gastos_fijos_partidas() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. LA META DE PIEZAS AL MES
-- La escribe el dueño en Costos. En 0, no hay meta: se usa lo vendido.
-- ---------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion) values
  ('piezas_mes_meta', 0,
   'Piezas que esperas vender al mes: con ellas se reparten el alquiler, los sueldos y los servicios en el precio (0 = las que de verdad vendes)')
on conflict (clave) do nothing;


-- ---------------------------------------------------------------------
-- 3. LAS PIEZAS AL MES DE VERDAD
-- La de esquema-dijes.sql, entera, con su nombre propio: lo vendido desde
-- un mes después de la primera venta (sin dijes); antes, el estimado de
-- Costos; sin estimado, lo que hay en la tienda entre los meses de
-- rotación.
-- ---------------------------------------------------------------------

create or replace function volumen_real()
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

-- Como su hermana: sola no revela gastos (son piezas, no dinero).
revoke all on function volumen_real() from public, anon;
grant execute on function volumen_real() to authenticated;


-- ---------------------------------------------------------------------
-- 4. ENTRE CUÁNTAS PIEZAS SE REPARTE LO DE TIENDA
-- La meta del dueño, si la puso; si no, las de verdad. Misma firma: la
-- llaman lo de tienda por pieza, la merma, Costos y el diagnóstico.
-- ---------------------------------------------------------------------

create or replace function volumen_mensual_estimado()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_meta numeric;
begin
  select valor into v_meta from configuracion where clave = 'piezas_mes_meta';
  if coalesce(v_meta, 0) > 0 then
    return round(v_meta, 2);
  end if;
  return volumen_real();
end;
$$;

revoke all on function volumen_mensual_estimado() from public, anon;
grant execute on function volumen_mensual_estimado() to authenticated;


-- ---------------------------------------------------------------------
-- 5. DE DÓNDE SALE, DICHO
-- La de esquema-dijes.sql, mismas columnas y en el mismo orden; `origen`
-- dice 'meta' cuando manda la del dueño, y al final las piezas de verdad.
-- ---------------------------------------------------------------------

create or replace view v_volumen
with (security_invoker = off) as
select
  volumen_mensual_estimado()                                   as piezas_mes,
  (select min(fecha)::date from ventas where not anulada)      as primera_venta,
  (select coalesce(sum(i.cantidad), 0)
     from venta_items i join ventas v on v.id = i.venta_id and not v.anulada where not i.es_dije) as piezas_vendidas,
  case
    when coalesce((select valor from configuracion where clave = 'piezas_mes_meta'), 0) > 0
    then 'meta'
    when (select min(fecha)::date from ventas where not anulada) is not null
     and current_date - (select min(fecha)::date from ventas where not anulada) >= 30
     and (select coalesce(sum(i.cantidad), 0)
            from venta_items i join ventas v on v.id = i.venta_id and not v.anulada where not i.es_dije) > 0
    then 'ventas' else 'estimado'
  end                                                          as origen,
  case
    when (select min(fecha)::date from ventas where not anulada) is not null
    then round((current_date - (select min(fecha)::date from ventas where not anulada)) / 30.0, 1)
  end                                                          as meses_observados,
  -- Nueva: las piezas al mes de verdad, aunque mande la meta.
  volumen_real()                                               as piezas_mes_reales
where es_admin();

grant select on v_volumen to authenticated;


-- =====================================================================
-- CÓMO COMPROBARLO, DESPUÉS DE CORRERLO
-- 1. Los gastos del mes, partida por partida:
--      select partida, round(monto_bcv, 2) from gastos_fijos_partidas();
--    -> Alquiler 120,00 · Sueldos 200,00. Total 320,00 (sin exhibidores).
-- 2. Lo de tienda por pieza, sin meta (la clave en 0):
--      select costo_operativo_por_pieza();
--    -> unos 5,89 (320 ÷ 55,31 piezas al mes + 0,10 de empaque). Antes de
--       correrlo daba 6,13. Cambia un poco cada día: las piezas al mes se
--       miden con las ventas hasta hoy.
-- 3. Con una meta en Costos, por ejemplo 80 piezas: 320 ÷ 80 + 0,10 = 4,10.
--      select origen, piezas_mes, piezas_mes_reales from v_volumen;
--    -> 'meta', 80, y las de verdad (unas 55).
-- 4. Inversiones sigue diciendo cuánto se ha recuperado de los muebles y
--    los exhibidores, con lo que sobra de las ventas.
-- =====================================================================
