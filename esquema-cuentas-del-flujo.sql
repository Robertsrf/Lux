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
