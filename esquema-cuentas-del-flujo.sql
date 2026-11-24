-- =====================================================================
-- #75 · esquema-cuentas-del-flujo.sql
-- La auditoría de las cuentas (fase 8, pedido del dueño del 24/11/2026):
-- dos errores arreglados y la cuenta del flujo: salió, entró, queda.
-- Depende del #74 (esquema-panel-revendedor.sql). Se puede correr varias
-- veces.
--
-- POR QUÉ
-- "Quiero entender cuánto se ha gastado y con lo que se ha vendido cuánto
-- queda; es como un flujo de sale y entra." El informe completo está en
-- docs/auditoria/2026-11-24-cuentas.md.
--
-- QUÉ HACE
-- 1. EL DÍA Y EL MES DE VENEZUELA. La base corre en UTC (lo que trae
--    Supabase), y varias cuentas cortaban el día con `current_date` o
--    `fecha::date` y el mes con `date_trunc('month', now())`: desde las 8
--    de la noche de Venezuela, "hoy" ya era mañana. Una venta de las 22:30
--    salía en Reportes al día siguiente, "Mi día" y la meta se ponían en
--    cero, y la del último día del mes contaba en el mes siguiente. La caja
--    ya cortaba bien (America/Caracas); ahora todas igual, con tres
--    funciones: `hoy_ve()`, `dia_ve(momento)` e `inicio_mes_ve()`.
--    Se corrigen: v_ventas_por_dia, v_tablero_dia, v_vendedoras,
--    v_venta_items_venta, v_cobertura_mes, v_volumen, meta_vendedora,
--    plan_ventas y volumen_real. Mismas columnas, mismos permisos.
--    `v_cuadre_dia` no se toca: compara `conteos.fecha` (que se guarda con
--    `current_date`) contra `current_date`, y así es coherente consigo.
-- 2. UNA VENTA POR PARTES CON DINERO QUE LLEGÓ NO SE ANULA A SECAS.
--    `anular_venta_por_verificar` (de las dos caras) anulaba también los
--    abonos ya comprobados, en efectivo incluido: el dinero que llegó
--    desaparecía de la caja de su día, sin decir si se devolvió. La regla
--    "la vendedora no anula un abono en efectivo" se saltaba por ahí.
--    Ahora, con un pago comprobado, la anula solo el administrador con
--    `admin_anular_credito` (que ya existía para el crédito y ahora vale
--    para toda venta por partes): dice si el dinero se devuelve (sale hoy
--    de la caja) o se queda, y sus abonos siguen en su día. Y
--    `admin_anular_venta` no anula una venta por partes con pagos sin ese
--    paso. Sin pagos comprobados, todo como siempre.
-- 3. LA CUENTA DEL FLUJO. `caja_flujo` gana al final `binance` (lo de
--    cada fila en dólares Binance, a la tasa de su día). `flujo_negocio
--    (desde, hasta)`, revocada a todos, da filas (grupo, concepto) con su
--    cifra en bolívares, $ Binance y $ BCV:
--      salio  · mercancia, exhibidores (de Lotes, con su flete), mobiliario
--               (Inversiones), caja:<categoria> (lo que salió por la Caja)
--      entro  · ventas, abonos (la regla de caja_flujo), caja:<categoria>
--      nota   · entro_sin_comprobar (parte de lo que entró; no suma)
--      queda  · dinero (entró − salió), mercancia_costo, mercancia_en_camino,
--               mercancia_sin_rastro, mercancia_etiqueta, abonado_sin_entregar
--               (en negativo), te_deben, si_se_vende
--    Cada movimiento con las tasas de SU día; lo de "hoy" (la etiqueta, lo
--    que te deben) con las de hoy. `admin_flujo` la envuelve para el
--    administrador.
--
-- DEBERÍA DAR (con tasa 100 BCV / 120 Binance)
--   Un lote de $100 de mercancía + $20 de flete pagado a 120 Bs:
--     salio · mercancia = Bs 14.400 · $120 Binance · $144 BCV.
--   select hoy_ve();  -- la fecha de hoy en Venezuela
-- Probado en PGlite con la instalación entera (ver INSTALACION.md, #75).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL DÍA Y EL MES DE VENEZUELA
-- ---------------------------------------------------------------------

create or replace function hoy_ve()
returns date
language sql
stable
set search_path = public
as $fn$
  select (now() at time zone 'America/Caracas')::date;
$fn$;

create or replace function dia_ve(p_momento timestamptz)
returns date
language sql
stable
set search_path = public
as $fn$
  select (p_momento at time zone 'America/Caracas')::date;
$fn$;

create or replace function inicio_mes_ve()
returns timestamptz
language sql
stable
set search_path = public
as $fn$
  select date_trunc('month', now() at time zone 'America/Caracas') at time zone 'America/Caracas';
$fn$;

-- No dicen nada de nadie: las vistas las llaman con la sesión de quien
-- consulta, así que tienen que poder ejecutarlas todos.
grant execute on function hoy_ve() to anon, authenticated;
grant execute on function dia_ve(timestamptz) to anon, authenticated;
grant execute on function inicio_mes_ve() to anon, authenticated;

create or replace view v_ventas_por_dia
with (security_invoker = off) as
 SELECT dia_ve(v.fecha) AS dia,
    count(*) FILTER (WHERE v.devolucion_de IS NULL) AS ventas,
    COALESCE(sum(m.piezas), 0::numeric) AS piezas,
    COALESCE(sum(v.total_bs), 0::numeric) AS total_bs,
    COALESCE(sum(v.total_bs / v.tasa_bcv_usada), 0::numeric) AS total_usd,
    COALESCE(sum(m.costo_usd), 0::numeric) AS costo_usd,
    COALESCE(sum((v.total_bs - v.extra_bs) / v.tasa_bcv_usada - m.costo_usd), 0::numeric) AS ganancia_usd,
    COALESCE(sum(m.mercancia_usd), 0::numeric) AS mercancia_usd,
    COALESCE(sum((v.total_bs - v.extra_bs) / v.tasa_bcv_usada - m.mercancia_usd - m.piezas_empaque::numeric * (( SELECT COALESCE(( SELECT configuracion.valor
                   FROM configuracion
                  WHERE configuracion.clave = 'empaque_por_pieza_usd'::text), 0::numeric) AS "coalesce"))), 0::numeric) AS contribucion_usd,
    COALESCE(sum(v.extra_bs / v.tasa_bcv_usada), 0::numeric) AS extra_bcv
   FROM ventas v
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(i.cantidad), 0::bigint) AS piezas,
            COALESCE(sum(i.cantidad) FILTER (WHERE NOT i.es_dije), 0::bigint) AS piezas_empaque,
            COALESCE(sum((i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada) + COALESCE(i.costo_operativo_usd_snap, 0::numeric)) * i.cantidad::numeric), 0::numeric) AS costo_usd,
            COALESCE(sum(i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada) * i.cantidad::numeric), 0::numeric) AS mercancia_usd
           FROM venta_items i
          WHERE i.venta_id = v.id) m ON true
  WHERE NOT v.anulada AND es_admin()
  GROUP BY (dia_ve(v.fecha));

create or replace view v_tablero_dia
with (security_invoker = off) as
 SELECT v.usuario_id,
    count(*) FILTER (WHERE v.devolucion_de IS NULL) AS ventas,
    COALESCE(sum(v.total_bs), 0::numeric) AS total_bs,
    COALESCE(sum(p.piezas), 0::numeric) AS piezas,
    COALESCE(sum(p.premium), 0::numeric) AS piezas_premium,
        CASE
            WHEN count(*) FILTER (WHERE v.devolucion_de IS NULL) > 0 THEN round(sum(v.total_bs) FILTER (WHERE v.devolucion_de IS NULL) / count(*) FILTER (WHERE v.devolucion_de IS NULL)::numeric, 2)
            ELSE 0::numeric
        END AS ticket_promedio_bs,
    round(COALESCE(sum(v.total_bs / v.tasa_bcv_usada), 0::numeric), 2) AS total_bcv,
        CASE
            WHEN count(*) FILTER (WHERE v.devolucion_de IS NULL) > 0 THEN round(sum(v.total_bs / v.tasa_bcv_usada) FILTER (WHERE v.devolucion_de IS NULL) / count(*) FILTER (WHERE v.devolucion_de IS NULL)::numeric, 2)
            ELSE 0::numeric
        END AS ticket_promedio_bcv
   FROM ventas v
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(i.cantidad) FILTER (WHERE NOT i.es_dije), 0::bigint) AS piezas,
            COALESCE(sum(i.cantidad) FILTER (WHERE NOT i.es_dije AND i.precio_unitario_usd >= (( SELECT configuracion.valor
                   FROM configuracion
                  WHERE configuracion.clave = 'premium_min_usd'::text))), 0::bigint) AS premium
           FROM venta_items i
          WHERE i.venta_id = v.id) p ON true
  WHERE NOT v.anulada AND v.revendedor_id IS NULL AND dia_ve(v.fecha) = hoy_ve() AND (es_admin() OR v.usuario_id = auth.uid())
  GROUP BY v.usuario_id;

create or replace view v_vendedoras
with (security_invoker = off) as
 SELECT p.id,
    p.nombre,
    p.activo,
    p.numero_vendedora,
    p.creado_en,
    COALESCE(s.piezas_hoy, 0) AS piezas_hoy,
    COALESCE(s.piezas_mes, 0) AS piezas_mes,
    COALESCE(s.ventas_mes, 0) AS ventas_mes,
    COALESCE(s.total_mes_bcv, 0::numeric) AS total_mes_bcv,
    ( SELECT max(v.fecha) AS max
           FROM ventas v
          WHERE v.usuario_id = p.id AND NOT v.anulada AND v.revendedor_id IS NULL) AS ultima_venta
   FROM perfiles p
     LEFT JOIN LATERAL ( SELECT sum(x.piezas) FILTER (WHERE dia_ve(v.fecha) = hoy_ve())::integer AS piezas_hoy,
            sum(x.piezas)::integer AS piezas_mes,
            count(*)::integer AS ventas_mes,
            round(sum(v.total_bs / v.tasa_bcv_usada), 2) AS total_mes_bcv
           FROM ventas v
             CROSS JOIN LATERAL ( SELECT COALESCE(sum(i.cantidad), 0::bigint) AS piezas
                   FROM venta_items i
                  WHERE i.venta_id = v.id AND NOT i.es_dije) x
          WHERE v.usuario_id = p.id AND NOT v.anulada AND v.revendedor_id IS NULL AND v.fecha >= inicio_mes_ve()) s ON true
  WHERE p.rol = 'vendedora'::rol_usuario AND es_admin();

create or replace view v_venta_items_venta
with (security_invoker = off) as
 SELECT i.id,
    i.venta_id,
    i.modelo_id,
    i.ubicacion_id,
    i.cantidad,
    i.precio_unitario_usd,
    i.precio_unitario_bs,
    i.precio_lista_usd
   FROM venta_items i
     JOIN ventas v ON v.id = i.venta_id
  WHERE es_admin() OR v.usuario_id = auth.uid() AND dia_ve(v.fecha) = hoy_ve();

create or replace view v_cobertura_mes
with (security_invoker = off) as
 SELECT gastos_fijos_bcv AS gastos_mes_usd,
    vendidas_mes::bigint AS piezas_vendidas,
    contribucion_mes_bcv AS contribucion_usd,
    round(LEAST(GREATEST(contribucion_mes_bcv, 0::numeric), gastos_fijos_bcv), 2) AS cubierto_usd,
    round(GREATEST(gastos_fijos_bcv - contribucion_mes_bcv, 0::numeric), 2) AS por_cubrir_usd,
    round(GREATEST(contribucion_mes_bcv - gastos_fijos_bcv, 0::numeric), 2) AS ganancia_usd,
        CASE
            WHEN gastos_fijos_bcv > 0::numeric THEN round(LEAST(GREATEST(contribucion_mes_bcv, 0::numeric) / gastos_fijos_bcv, 1::numeric) * 100::numeric, 1)
            ELSE 100::numeric
        END AS cubierto_pct,
    contribucion_pieza_bcv AS contribucion_por_pieza_usd,
        CASE
            WHEN gastos_fijos_bcv > contribucion_mes_bcv AND contribucion_pieza_bcv > 0::numeric THEN ceil((gastos_fijos_bcv - contribucion_mes_bcv) / contribucion_pieza_bcv)
            ELSE NULL::numeric
        END AS piezas_faltantes,
    date_trunc('month', hoy_ve())::date AS desde
   FROM plan_ventas_admin() p(gastos_fijos_bcv, empaque_bcv, promedio_de, piezas_promedio, precio_promedio_bcv, costo_promedio_binance, costo_promedio_bcv, brecha, merma_pct, contribucion_pieza_bcv, contribucion_pct, piezas_equilibrio_mes, meta_ganancia_bcv, piezas_meta_mes, dias_abiertos_mes, piezas_equilibrio_dia, piezas_meta_dia, vendidas_mes, contribucion_mes_bcv, dia_del_mes, dias_del_mes, ritmo_piezas_mes, resultado_mes_bcv, resultado_proyectado_bcv, resultado_proyectado_binance);

create or replace view v_volumen
with (security_invoker = off) as
 SELECT volumen_mensual_estimado() AS piezas_mes,
    ( SELECT dia_ve(min(ventas.fecha))
           FROM ventas
          WHERE NOT ventas.anulada) AS primera_venta,
    ( SELECT COALESCE(sum(i.cantidad), 0::bigint) AS "coalesce"
           FROM venta_items i
             JOIN ventas v ON v.id = i.venta_id AND NOT v.anulada
          WHERE NOT i.es_dije) AS piezas_vendidas,
        CASE
            WHEN COALESCE(( SELECT configuracion.valor
               FROM configuracion
              WHERE configuracion.clave = 'piezas_mes_meta'::text), 0::numeric) > 0::numeric THEN 'meta'::text
            WHEN (( SELECT dia_ve(min(ventas.fecha))
               FROM ventas
              WHERE NOT ventas.anulada)) IS NOT NULL AND (hoy_ve() - (( SELECT dia_ve(min(ventas.fecha))
               FROM ventas
              WHERE NOT ventas.anulada))) >= 30 AND (( SELECT COALESCE(sum(i.cantidad), 0::bigint) AS "coalesce"
               FROM venta_items i
                 JOIN ventas v ON v.id = i.venta_id AND NOT v.anulada
              WHERE NOT i.es_dije)) > 0 THEN 'ventas'::text
            ELSE 'estimado'::text
        END AS origen,
        CASE
            WHEN (( SELECT dia_ve(min(ventas.fecha))
               FROM ventas
              WHERE NOT ventas.anulada)) IS NOT NULL THEN round((hoy_ve() - (( SELECT dia_ve(min(ventas.fecha))
               FROM ventas
              WHERE NOT ventas.anulada)))::numeric / 30.0, 1)
            ELSE NULL::numeric
        END AS meses_observados,
    volumen_real() AS piezas_mes_reales
  WHERE es_admin();

-- meta_vendedora: la del #60, con el día y el mes de Venezuela.
create or replace function meta_vendedora()
returns table(meta_hoy integer, meta_mes integer, para text, vendidas_hoy integer, vendidas_mes integer,
              dia_del_mes integer, dias_del_mes integer, ritmo_mes integer, dias_abiertos integer)
language sql
stable
security definer
set search_path = public
as $fn$
  with local as (
    select
      coalesce(sum(i.cantidad) filter (where dia_ve(v.fecha) = hoy_ve() and not i.es_dije), 0) as hoy,
      coalesce(sum(i.cantidad) filter (where not i.es_dije), 0)                                 as mes
    from venta_items i
    join ventas v on v.id = i.venta_id and not v.anulada
    where v.revendedor_id is null
      and v.fecha >= inicio_mes_ve()
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

-- plan_ventas: la del #63, con el mes y el día de Venezuela.
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
    where v.fecha >= inicio_mes_ve()
  ),
  cal as (
    select
      extract(day from hoy_ve())::int as dia,
      extract(day from date_trunc('month', hoy_ve()) + interval '1 month' - interval '1 day')::int as dias
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

revoke all on function plan_ventas() from public, anon, authenticated;

-- volumen_real: la del #63, con el día de Venezuela.
create or replace function volumen_real()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fn$
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
  select dia_ve(min(fecha)) into v_primera from ventas where not anulada;

  if v_primera is not null then
    v_dias := hoy_ve() - v_primera;
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

  -- Todavía no hay historia suficiente: vale la intención del dueño.
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
$fn$;


-- ---------------------------------------------------------------------
-- 2. UNA VENTA POR PARTES CON DINERO QUE LLEGÓ NO SE ANULA A SECAS
-- ---------------------------------------------------------------------

-- La última de siempre, con el guardián nuevo antes de tocar nada.
create or replace function anular_venta_por_verificar(p_venta_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item venta_items%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Hay que iniciar sesion.';
  end if;
  perform 1 from ventas where id = p_venta_id and por_verificar and not anulada for update;
  if not found then
    raise exception 'Esa venta ya no está por verificar: pídele al administrador que la anule.';
  end if;
  if exists (select 1 from reservas where venta_id = p_venta_id)
     or exists (select 1 from apartados where venta_id = p_venta_id) then
    raise exception 'Esa venta salió de un pedido pagado por abonos: la anula solo el administrador.';
  end if;
  -- #75: un pago que ya llegó no se borra de la caja. Lo decide el
  -- administrador (admin_anular_credito: se devuelve o se queda).
  if exists (select 1 from abonos
              where venta_id = p_venta_id and anulado_en is null and verificado_en is not null) then
    raise exception 'Esa venta tiene pagos que ya llegaron: la anula el administrador, diciendo si el dinero se devuelve o se queda.';
  end if;

  for v_item in select * from venta_items where venta_id = p_venta_id
  loop
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_item.modelo_id, v_item.ubicacion_id, v_item.cantidad)
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();
  end loop;

  update ventas
     set anulada = true, por_verificar = false,
         verificada_por = auth.uid(), verificada_en = now(),
         notas = coalesce(notas || ' | ', '') || 'Anulada sin pago: ' || coalesce(nullif(btrim(p_motivo), ''), 'el pago no llegó')
   where id = p_venta_id;

  update abonos
     set anulado_en = now(), anulado_por = auth.uid(), anulado_motivo = 'venta anulada'
   where venta_id = p_venta_id and anulado_en is null;

  perform soltar_codigos_de_venta(p_venta_id);
end;
$fn$;

-- La de esquema-devoluciones (#57), sin anular a secas una por partes con pagos.
create or replace function admin_anular_venta(p_venta_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item venta_items%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular una venta.';
  end if;
  if (select anulada from ventas where id = p_venta_id) then
    raise exception 'Esa venta ya estaba anulada.';
  end if;
  if (select devolucion_de from ventas where id = p_venta_id) is not null then
    raise exception 'Eso es una nota de crédito: no se anula.';
  end if;
  if exists (select 1 from ventas where devolucion_de = p_venta_id and not anulada) then
    raise exception 'Esa venta tiene piezas devueltas: no se puede anular entera.';
  end if;
  -- #75: sus abonos saldrían de la caja de su día. admin_anular_credito
  -- deja dicho qué pasó con el dinero (credito_cierre) y después llama aquí.
  if exists (select 1 from ventas where id = p_venta_id and pago_parcial and credito_cierre is null)
     and exists (select 1 from abonos where venta_id = p_venta_id and anulado_en is null) then
    raise exception 'Esa venta tiene pagos: anúlala diciendo si el dinero se devuelve o se queda.';
  end if;

  for v_item in select * from venta_items where venta_id = p_venta_id
  loop
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_item.modelo_id, v_item.ubicacion_id, v_item.cantidad)
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();
  end loop;

  update ventas
     set anulada = true,
         notas = coalesce(notas || ' | ', '') || 'Anulada: ' || coalesce(p_motivo, 'sin motivo')
   where id = p_venta_id;

  perform soltar_codigos_de_venta(p_venta_id);
end;
$fn$;

-- La del #71, para toda venta por partes (a crédito o no).
create or replace function admin_anular_credito(
  p_venta_id bigint,
  p_devolver boolean,
  p_metodo   text    default null,
  p_monto    numeric default null,
  p_motivo   text    default null
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v ventas%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo el administrador anula una venta con pagos.';
  end if;
  select * into v from ventas where id = p_venta_id for update;
  if not found or (v.credito_vence is null and not v.pago_parcial) then
    raise exception 'Esa venta no es a crédito ni por partes.';
  end if;
  if v.anulada then
    raise exception 'Esa venta ya estaba anulada.';
  end if;
  if exists (select 1 from abonos where venta_id = v.id and anulado_en is null) then
    if exists (select 1 from abonos where venta_id = v.id and anulado_en is null and verificado_en is null) then
      raise exception 'Hay pagos sin revisar: márcalos como que llegaron o que no llegaron antes de anular.';
    end if;
    if p_devolver is null then
      raise exception 'Di si lo que pagó se le devuelve o se queda.';
    end if;
    if p_devolver then
      if coalesce(p_monto, 0) <= 0 then
        raise exception 'Escribe cuánto se le devuelve.';
      end if;
      perform admin_anotar_caja('salida', hoy_ve(), 'devolucion',
                                'Devolución de la venta '
                                  || case when v.credito_vence is not null then 'a crédito ' else 'por partes ' end
                                  || '#' || v.id || coalesce(' · ' || v.cliente_nombre, ''),
                                p_metodo, p_monto, null);
    end if;
    update ventas set credito_cierre = case when p_devolver then 'devuelto' else 'se_queda' end where id = v.id;
  end if;
  perform admin_anular_venta(v.id, coalesce(nullif(btrim(coalesce(p_motivo, '')), ''),
                                            case when v.credito_vence is not null then 'la clienta devolvió las piezas'
                                                 else 'anulada con sus pagos' end));
end;
$fn$;



-- ---------------------------------------------------------------------
-- 3. LA CUENTA DEL FLUJO
-- ---------------------------------------------------------------------

-- caja_flujo: la del #71, con `binance` al final (lo de cada fila en
-- dólares Binance, a la tasa de su día: los bolívares entre la tasa
-- Binance de la fila; en la venta, su total_usd, que es esa misma cuenta).
-- Cambia lo que devuelve, así que se borra y se crea. Sus tres lectoras
-- (admin_caja_por_*) nombran sus columnas: no cambian. Ninguna vista la usa.
drop function if exists caja_flujo(date, date);
create function caja_flujo(p_desde date, p_hasta date)
returns table (
  fecha         date,
  metodo        metodo_pago,
  tipo          text,
  origen        text,
  categoria     text,
  bs            numeric,
  usd           numeric,
  bcv           numeric,
  por_verificar boolean,
  binance       numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  with r as (
    select (p_desde::timestamp at time zone 'America/Caracas')       as desde,
           ((p_hasta + 1)::timestamp at time zone 'America/Caracas') as hasta
  )
  select (v.fecha at time zone 'America/Caracas')::date,
         v.metodo,
         'entrada',
         'venta',
         null::text,
         v.total_bs,
         case when metodo_en_dolares(v.metodo) then v.total_usd end,
         v.total_bs / nullif(v.tasa_bcv_usada, 0),
         v.por_verificar,
         v.total_usd
    from ventas v, r
   where not v.anulada
     and not v.pago_parcial
     and v.devolucion_de is null
     and v.fecha >= r.desde and v.fecha < r.hasta
  union all
  select (a.fecha at time zone 'America/Caracas')::date,
         a.metodo,
         'entrada',
         'abono',
         null::text,
         a.monto_bs,
         a.monto_usd,
         a.monto_bcv,
         a.verificado_en is null,
         a.monto_bs / nullif(a.tasa_venta, 0)
    from abonos a
    left join ventas v on v.id = a.venta_id
    cross join r
   where a.anulado_en is null
     -- #71: los de una venta a crédito anulada diciendo qué pasó con el
     -- dinero siguen en su día: llegaron de verdad.
     and (v.id is null or not v.anulada or v.credito_cierre is not null)
     and (a.origen = 'tienda' or a.verificado_en is not null)
     and a.fecha >= r.desde and a.fecha < r.hasta
  union all
  select c.fecha,
         c.metodo,
         c.tipo,
         'anotado',
         c.categoria,
         c.monto_bs,
         c.monto_usd,
         c.monto_bcv,
         false,
         c.monto_bs / nullif(c.tasa_venta, 0)
    from caja_movimientos c
   where c.anulado_en is null
     and c.fecha between p_desde and p_hasta;
$fn$;

revoke all on function caja_flujo(date, date) from public, anon, authenticated;

-- Las tasas de un día: la última cargada ese día o antes (por cuándo se
-- cargó, en la hora de Venezuela). Si el día es anterior a toda tasa, la
-- más antigua: un lote de antes del sistema no se queda sin cifra.
create or replace function tasas_del_dia(p_dia date, out tasa_bcv numeric, out tasa_venta numeric)
returns record
language sql
stable
security definer
set search_path = public
as $fn$
  select t.tasa_bcv, t.tasa_venta
    from tasas t
   order by (dia_ve(t.creado_en) <= p_dia) desc,
            case when dia_ve(t.creado_en) <= p_dia then t.creado_en end desc nulls last,
            t.creado_en asc
   limit 1;
$fn$;

revoke all on function tasas_del_dia(date) from public, anon, authenticated;

-- flujo_negocio: lo que salió, lo que entró y lo que queda. Ver la
-- cabecera. El día de un lote es el más temprano entre su llegada y cuándo
-- se cargó (un lote viejo se carga después de llegar; uno en camino, antes,
-- y al liberarse su llegada pasa a ser la de ese día).
create or replace function flujo_negocio(p_desde date default null, p_hasta date default null)
returns table (orden int, grupo text, concepto text, bs numeric, binance numeric, bcv numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_desde date := coalesce(p_desde, date '2000-01-01');
  v_hasta date := coalesce(p_hasta, hoy_ve());
  v_t_bcv   numeric;
  v_t_venta numeric;
begin
  select t.tasa_bcv, t.tasa_venta into v_t_bcv, v_t_venta from tasas t where t.vigente limit 1;
  if v_t_bcv is null then
    select x.tasa_bcv, x.tasa_venta into v_t_bcv, v_t_venta from tasas_del_dia(hoy_ve()) x;
  end if;

  return query
  with
  lote as (
    select l.*, least(l.fecha_llegada, dia_ve(l.creado_en)) as dia,
           (select x.tasa_bcv from tasas_del_dia(least(l.fecha_llegada, dia_ve(l.creado_en))) x) as t_bcv
      from lotes l
  ),
  -- Lo de un lote nace en $ Binance; a bolívares con lo que se pagó el
  -- dólar ese día (tasa_binance_compra) y a $ BCV con la tasa BCV del día.
  salio_lotes as (
    select 'mercancia'::text as concepto,
           sum((costo_mercancia_usd + flete_mercancia_usd) * tasa_binance_compra) as bs,
           sum(costo_mercancia_usd + flete_mercancia_usd) as binance,
           sum((costo_mercancia_usd + flete_mercancia_usd) * tasa_binance_compra / t_bcv) as bcv
      from lote where dia between v_desde and v_hasta
    union all
    select 'exhibidores',
           sum((costo_exhibidores_usd + costo_flete_usd - flete_mercancia_usd) * tasa_binance_compra),
           sum(costo_exhibidores_usd + costo_flete_usd - flete_mercancia_usd),
           sum((costo_exhibidores_usd + costo_flete_usd - flete_mercancia_usd) * tasa_binance_compra / t_bcv)
      from lote where dia between v_desde and v_hasta
  ),
  inv as (
    select i.*, t.tasa_bcv as t_bcv, t.tasa_venta as t_venta
      from inversiones i cross join lateral tasas_del_dia(i.fecha) t
     where i.activo and i.fecha between v_desde and v_hasta
  ),
  salio_inv as (
    select 'mobiliario'::text as concepto,
           sum(case when moneda = 'bcv' then monto_usd * t_bcv else monto_usd * t_venta end) as bs,
           sum(case when moneda = 'bcv' then monto_usd * t_bcv / t_venta else monto_usd end) as binance,
           sum(case when moneda = 'bcv' then monto_usd else monto_usd * t_venta / t_bcv end) as bcv
      from inv
  ),
  caja as (
    select * from caja_flujo(v_desde, v_hasta)
  ),
  filas as (
    select 10 as orden, 'salio'::text as grupo, s.concepto, s.bs, s.binance, s.bcv from salio_lotes s
    union all
    select 20, 'salio', s.concepto, s.bs, s.binance, s.bcv from salio_inv s
    union all
    select 30, 'salio', 'caja:' || c.categoria, sum(c.bs), sum(c.binance), sum(c.bcv)
      from caja c where c.tipo = 'salida' group by c.categoria
    union all
    select 40, 'entro', 'ventas', sum(c.bs), sum(c.binance), sum(c.bcv) from caja c where c.origen = 'venta'
    union all
    select 41, 'entro', 'abonos', sum(c.bs), sum(c.binance), sum(c.bcv) from caja c where c.origen = 'abono'
    union all
    select 42, 'entro', 'caja:' || c.categoria, sum(c.bs), sum(c.binance), sum(c.bcv)
      from caja c where c.tipo = 'entrada' and c.origen = 'anotado' group by c.categoria
  ),
  sin_comprobar as (
    select sum(c.bs) as bs, sum(c.binance) as binance, sum(c.bcv) as bcv
      from caja c where c.tipo = 'entrada' and c.por_verificar
  ),
  dinero as (
    select sum(case when f.grupo = 'entro' then 1 else -1 end * coalesce(f.bs, 0))      as bs,
           sum(case when f.grupo = 'entro' then 1 else -1 end * coalesce(f.binance, 0)) as binance,
           sum(case when f.grupo = 'entro' then 1 else -1 end * coalesce(f.bcv, 0))     as bcv
      from filas f
  ),
  -- La mercancía a lo que costó, con las tasas de su lote (las mismas con
  -- que salió), para que lo comprado, lo vendido, lo que hay y lo que viene
  -- se resten en la misma moneda. Sin lote, las de hoy.
  costo_m as (
    select m.id, m.costo_puesto_usd as c,
           coalesce(l.tasa_binance_compra, v_t_venta) as t_compra,
           coalesce(l.t_bcv, v_t_bcv) as t_bcv
      from modelos m left join lote l on l.id = m.lote_id
  ),
  en_tienda as (
    select sum(e.cantidad * c.c * c.t_compra) as bs, sum(e.cantidad * c.c) as binance,
           sum(e.cantidad * c.c * c.t_compra / c.t_bcv) as bcv
      from existencias e join costo_m c on c.id = e.modelo_id
  ),
  en_camino as (
    select sum(p.cantidad * c.c * c.t_compra) as bs, sum(p.cantidad * c.c) as binance,
           sum(p.cantidad * c.c * c.t_compra / c.t_bcv) as bcv
      from por_llegar p
      join lotes l on l.id = p.lote_id and l.en_camino
      join costo_m c on c.id = p.modelo_id
  ),
  vendido as (
    select sum(i.cantidad * i.costo_puesto_usd_snap * c.t_compra) as bs,
           sum(i.cantidad * i.costo_puesto_usd_snap) as binance,
           sum(i.cantidad * i.costo_puesto_usd_snap * c.t_compra / c.t_bcv) as bcv
      from venta_items i
      join ventas v on v.id = i.venta_id and not v.anulada
      join costo_m c on c.id = i.modelo_id
  ),
  comprado as (
    select sum((costo_mercancia_usd + flete_mercancia_usd) * tasa_binance_compra) as bs,
           sum(costo_mercancia_usd + flete_mercancia_usd) as binance,
           sum((costo_mercancia_usd + flete_mercancia_usd) * tasa_binance_compra / t_bcv) as bcv
      from lote
  ),
  -- A la etiqueta de hoy: lo que está a la venta (activo y con precio).
  etiqueta as (
    select sum(e.cantidad * coalesce(m.precio_override_usd, g.precio_usd)) as bcv
      from existencias e
      join modelos m on m.id = e.modelo_id and m.activo
      left join grupos_precio g on g.id = m.grupo_precio_id
     where coalesce(m.precio_override_usd, g.precio_usd) is not null
  ),
  -- Lo que ya pagaron pedidos que todavía apartan sus piezas: está en lo
  -- que entró y la pieza sigue en la tienda; si no se resta, saldría dos
  -- veces en "si se vende todo". La misma regla que apartadas_de.
  abonado as (
    select sum(a.monto_bs) as bs, sum(a.monto_bs / nullif(a.tasa_venta, 0)) as binance, sum(a.monto_bcv) as bcv
      from abonos a
     where a.anulado_en is null
       and (a.origen = 'tienda' or a.verificado_en is not null)
       and (   exists (select 1 from reservas r
                        where r.id = a.reserva_id and r.venta_id is null and r.cerrada_en is null
                          and (   (r.estado = 'abierta' and r.expira_en > now())
                               or (r.estado = 'confirmada'
                                   and (r.pagado_en is not null or r.vence_apartado_en is null
                                        or r.vence_apartado_en > now()))))
            or exists (select 1 from apartados p
                        where p.id = a.apartado_id and p.venta_id is null and p.estado = 'abierto'
                          and p.cerrado_en is null and p.expira_en > now()))
  ),
  deben as (
    select sum(falta_bcv_de(v.id)) as bcv
      from ventas v
     where v.pago_parcial and v.por_verificar and not v.anulada and v.devolucion_de is null
  ),
  queda as (
    select 60 as orden, 'dinero'::text as concepto, d.bs, d.binance, d.bcv from dinero d
    union all
    select 61, 'mercancia_costo', coalesce(t.bs, 0), coalesce(t.binance, 0), coalesce(t.bcv, 0) from en_tienda t
    union all
    select 62, 'mercancia_en_camino', coalesce(c.bs, 0), coalesce(c.binance, 0), coalesce(c.bcv, 0) from en_camino c
    union all
    select 63, 'mercancia_sin_rastro',
           coalesce(k.bs, 0) - coalesce(v.bs, 0) - coalesce(t.bs, 0) - coalesce(c.bs, 0),
           coalesce(k.binance, 0) - coalesce(v.binance, 0) - coalesce(t.binance, 0) - coalesce(c.binance, 0),
           coalesce(k.bcv, 0) - coalesce(v.bcv, 0) - coalesce(t.bcv, 0) - coalesce(c.bcv, 0)
      from comprado k, vendido v, en_tienda t, en_camino c
    union all
    -- Lo que se mide hoy: de $ BCV a bolívares y a $ Binance con la tasa vigente.
    select 64, 'mercancia_etiqueta', coalesce(e.bcv, 0) * v_t_bcv, coalesce(e.bcv, 0) * v_t_bcv / v_t_venta,
           coalesce(e.bcv, 0) from etiqueta e
    union all
    select 65, 'abonado_sin_entregar', -coalesce(a.bs, 0), -coalesce(a.binance, 0), -coalesce(a.bcv, 0) from abonado a
    union all
    select 66, 'te_deben', coalesce(d.bcv, 0) * v_t_bcv, coalesce(d.bcv, 0) * v_t_bcv / v_t_venta,
           coalesce(d.bcv, 0) from deben d
  ),
  todo as (
    select f.orden, f.grupo, f.concepto, f.bs, f.binance, f.bcv from filas f where f.bs is not null
    union all
    select 50, 'nota', 'entro_sin_comprobar', coalesce(s.bs, 0), coalesce(s.binance, 0), coalesce(s.bcv, 0)
      from sin_comprobar s
    union all
    select q.orden, 'queda', q.concepto, q.bs, q.binance, q.bcv from queda q
    union all
    select 67, 'queda', 'si_se_vende', sum(q.bs), sum(q.binance), sum(q.bcv)
      from queda q where q.concepto in ('dinero', 'mercancia_etiqueta', 'abonado_sin_entregar', 'te_deben')
  )
  select t.orden, t.grupo, t.concepto, round(t.bs, 2), round(t.binance, 2), round(t.bcv, 2)
    from todo t
   order by t.orden, t.concepto;
end;
$fn$;

revoke all on function flujo_negocio(date, date) from public, anon, authenticated;

-- La puerta del administrador.
create or replace function admin_flujo(p_desde date default null, p_hasta date default null)
returns table (orden int, grupo text, concepto text, bs numeric, binance numeric, bcv numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'Solo un administrador ve el flujo del negocio.';
  end if;
  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then
    raise exception 'El período no es válido: la fecha final va después de la inicial.';
  end if;
  return query select * from flujo_negocio(p_desde, p_hasta);
end;
$fn$;

revoke all on function admin_flujo(date, date) from public, anon;
grant execute on function admin_flujo(date, date) to authenticated;
