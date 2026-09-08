-- =====================================================================
-- Lux by Emory — cerrarle las funciones de costo a la vendedora
-- Ejecutar en el SQL Editor DESPUÉS de esquema-respaldo.sql
--
-- LO QUE SE ENCONTRÓ
-- Entrando con la sesión de la vendedora y llamando funciones directo,
-- saltándose la pantalla, respondían estas:
--
--   costo_operativo_por_pieza()   ->  2.8279
--   volumen_mensual_estimado()    ->  120
--   costo_total_bcv(1)            ->  4.0138
--   calcular_flete_unitario(4)    ->  0.2344
--   gastos_fijos_mes_bcv()        ->  BLOQUEADA        <- esta sí
--
-- `gastos_fijos_mes_bcv` estaba bien revocada. El problema es que no hacía
-- falta: 2,8279 × 120 = $339,35, que es justo la cifra que esa revocación
-- quería tapar. Se tapó la puerta y quedó la ventana al lado.
--
-- Y `costo_total_bcv(1)` entrega la fórmula entera de una: el 1,1859 de
-- brecha, el factor de merma y los $2,8279 de gasto operativo por pieza.
--
-- LO QUE NO PODÍA VER, Y SIGUE SIN PODER
-- El costo de cada pieza. `modelos` está revocada y las cinco vistas de
-- costo le devuelven cero filas. Eso se comprobó y funciona. La fuga era
-- de la estructura de gastos de la tienda, no del costo por pieza.
--
-- POR QUÉ NO BASTA UN REVOKE, Y POR QUÉ EL GUARDIÁN NO VA DENTRO
-- Dos callejones sin salida, para que no se vuelvan a intentar:
--
-- 1. Poner `if not es_admin() then raise` dentro de
--    `costo_operativo_por_pieza()` rompe la venta. `es_admin()` mira
--    `auth.uid()`, no el rol de Postgres, así que sigue dando falso aun
--    dentro de una función `security definer`. Y `registrar_venta` llama a
--    esa función cada vez que la vendedora cobra.
--
-- 2. Revocarla a secas puede dejar al ADMINISTRADOR sin sus propias
--    pantallas. La llaman `v_catalogo_admin` y `v_diagnostico`, y en una
--    vista Postgres comprueba el EXECUTE contra quien consulta — que
--    también es `authenticated`.
--
-- LO QUE SE HACE
-- Una envoltura, `costo_operativo_admin()`, que devuelve el número si eres
-- administrador y NULL si no. Las dos vistas pasan a llamar a la envoltura;
-- la función cruda se revoca. Así:
--
--   - La vendedora ya no tiene endpoint RPC para la función cruda.
--   - Si llama a la envoltura, recibe NULL. NULL no dice nada.
--   - El administrador ve sus vistas igual que antes.
--   - `registrar_venta` sigue llamando a la cruda por dentro, y ahí el
--     permiso se comprueba contra el dueño, no contra ella.
--
-- Devuelve NULL en vez de levantar excepción a propósito: las vistas
-- filtran con `where es_admin()`, pero el planificador puede evaluar el
-- LATERAL antes que el WHERE. Con NULL la vendedora sigue viendo cero
-- filas, como hasta ahora; con una excepción vería un error rojo.
--
-- LO QUE SE DEJA ABIERTO, Y POR QUÉ
-- `factor_merma()` y `volumen_mensual_estimado()` siguen como están. Solas
-- no revelan gastos: la merma es un factor cerca de 1 y el volumen lo puede
-- estimar ella contando sus propias ventas. Tienen siete vistas colgando y
-- cerrarlas costaría más de lo que protege.
-- =====================================================================

-- --- 1. La envoltura -------------------------------------------------

create or replace function costo_operativo_admin()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    return null;
  end if;
  return costo_operativo_por_pieza();
end;
$fn$;

revoke all on function costo_operativo_admin() from public, anon;
grant execute on function costo_operativo_admin() to authenticated;


-- --- 2. Las dos vistas pasan a usarla --------------------------------
-- Van completas y sin tocar ninguna otra cosa. La única diferencia con lo
-- que hay montado es el nombre de esa llamada. Las columnas quedan en el
-- mismo orden y con el mismo nombre, que es lo único que `create or
-- replace view` no perdona.

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
    l.codigo AS lote_codigo
   FROM v_catalogo_venta v
     JOIN modelos m ON m.id = v.id
     LEFT JOIN lotes l ON l.id = m.lote_id
     CROSS JOIN LATERAL ( SELECT COALESCE(costo_operativo_admin(), 0::numeric) AS operativo,
            COALESCE(factor_merma(), 1::numeric) AS merma,
            COALESCE(( SELECT tasas.tasa_venta / tasas.tasa_bcv
                   FROM tasas
                  WHERE tasas.vigente
                 LIMIT 1), 1::numeric) AS factor) o
  WHERE es_admin();

grant select on v_catalogo_admin to authenticated;


create or replace view v_diagnostico
with (security_invoker = off) as
 WITH gastos AS (
         SELECT COALESCE(( SELECT sum(configuracion.valor) AS sum
                   FROM configuracion
                  WHERE configuracion.clave = ANY (ARRAY['gasto_alquiler_mes_usd'::text, 'gasto_sueldos_mes_usd'::text, 'gasto_servicios_mes_usd'::text, 'gasto_otros_mes_usd'::text])), 0::numeric) + COALESCE(( SELECT sum(inversiones.monto_usd / inversiones.amortizar_meses::numeric) AS sum
                   FROM inversiones
                  WHERE inversiones.activo AND inversiones.amortizar_meses > 0 AND inversiones.moneda = 'bcv'::text), 0::numeric) + (COALESCE(( SELECT sum(inversiones.monto_usd / inversiones.amortizar_meses::numeric) AS sum
                   FROM inversiones
                  WHERE inversiones.activo AND inversiones.amortizar_meses > 0 AND inversiones.moneda = 'real'::text), 0::numeric) + COALESCE(( SELECT sum(lotes.costo_exhibidores_usd + (lotes.costo_flete_usd - lotes.flete_mercancia_usd)) AS sum
                   FROM lotes), 0::numeric) / GREATEST(COALESCE(( SELECT configuracion.valor
                   FROM configuracion
                  WHERE configuracion.clave = 'capex_amortizar_meses'::text), 24::numeric), 1::numeric)) * COALESCE(( SELECT tasas.tasa_venta / tasas.tasa_bcv
                   FROM tasas
                  WHERE tasas.vigente
                 LIMIT 1), 1::numeric) AS gastos_mes
        ), base AS (
         SELECT ( SELECT gastos.gastos_mes
                   FROM gastos) AS gastos_mes,
            volumen_mensual_estimado() AS volumen,
            COALESCE(costo_operativo_admin(), 0::numeric) AS operativo,
            COALESCE(factor_merma(), 1::numeric) AS merma,
            COALESCE(( SELECT tasas.tasa_venta / tasas.tasa_bcv
                   FROM tasas
                  WHERE tasas.vigente
                 LIMIT 1), 1::numeric) AS factor,
            COALESCE(( SELECT configuracion.valor
                   FROM configuracion
                  WHERE configuracion.clave = 'ganancia_mensual_objetivo_usd'::text), 0::numeric) AS objetivo,
            COALESCE(( SELECT configuracion.valor
                   FROM configuracion
                  WHERE configuracion.clave = 'piezas_danadas_mes'::text), 0::numeric) AS danadas,
            COALESCE(( SELECT configuracion.valor
                   FROM configuracion
                  WHERE configuracion.clave = 'piezas_inventario_objetivo'::text), 0::numeric) AS piezas_objetivo,
            GREATEST(COALESCE(( SELECT configuracion.valor
                   FROM configuracion
                  WHERE configuracion.clave = 'meses_rotacion_objetivo'::text), 3::numeric), 1::numeric) AS meses_rot,
            COALESCE(( SELECT sum(existencias.cantidad) AS sum
                   FROM existencias), 0::bigint) AS piezas_cargadas,
            ( SELECT v_volumen.origen
                   FROM v_volumen) AS volumen_origen
        ), catalogo AS (
         SELECT count(*) AS modelos,
            COALESCE(avg(m.costo_puesto_usd), 0::numeric) AS costo_merc_real,
            COALESCE(avg(COALESCE(m.precio_override_usd, g.precio_usd)), 0::numeric) AS precio_bcv_prom
           FROM modelos m
             LEFT JOIN grupos_precio g ON g.id = m.grupo_precio_id
          WHERE m.activo
        ), calc AS (
         SELECT b.gastos_mes,
            b.volumen,
            b.operativo,
            b.merma,
            b.factor,
            b.objetivo,
            b.danadas,
            b.piezas_objetivo,
            b.meses_rot,
            b.piezas_cargadas,
            b.volumen_origen,
            c.modelos,
            c.costo_merc_real,
            c.precio_bcv_prom,
            round(c.costo_merc_real * b.factor * b.merma, 4) AS costo_merc_bcv,
            round(c.costo_merc_real * b.factor * b.merma + b.operativo, 4) AS costo_total_bcv
           FROM base b
             CROSS JOIN catalogo c
        )
 SELECT gastos_mes AS gastos_mes_usd,
    piezas_cargadas,
    piezas_objetivo,
    meses_rot AS meses_rotacion,
    volumen AS volumen_mes,
    volumen_origen,
    operativo AS costo_operativo_pieza_usd,
    danadas AS piezas_danadas_mes,
    round((merma - 1::numeric) * 100::numeric, 2) AS merma_pct,
    modelos,
    round(costo_merc_real, 4) AS costo_mercancia_real_usd,
    costo_merc_bcv AS costo_mercancia_promedio_usd,
    costo_total_bcv AS costo_total_promedio_usd,
    round(precio_bcv_prom, 2) AS precio_bcv_promedio,
    objetivo AS ganancia_objetivo_mes_usd,
        CASE
            WHEN volumen > 0::numeric AND costo_total_bcv > 0::numeric AND objetivo > 0::numeric THEN round(objetivo / (volumen * costo_total_bcv + objetivo) * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margen_sugerido_pct,
        CASE
            WHEN volumen > 0::numeric AND costo_total_bcv > 0::numeric AND objetivo > 0::numeric THEN round(costo_total_bcv / (1::numeric - objetivo / (volumen * costo_total_bcv + objetivo)), 2)
            ELSE NULL::numeric
        END AS precio_sugerido_promedio_bcv,
        CASE
            WHEN precio_bcv_prom > 0::numeric THEN round((precio_bcv_prom - costo_total_bcv) / precio_bcv_prom * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margen_actual_pct,
    round(volumen * (precio_bcv_prom - costo_total_bcv), 2) AS ganancia_proyectada_mes_usd,
        CASE
            WHEN (precio_bcv_prom - costo_merc_bcv) > 0::numeric THEN ceil(gastos_mes / (precio_bcv_prom - costo_merc_bcv))
            ELSE NULL::numeric
        END AS piezas_equilibrio
   FROM calc
  WHERE es_admin();

grant select on v_diagnostico to authenticated;


-- --- 3. Se cierran las tres ------------------------------------------
-- Ninguna vista llama a `costo_total_bcv` ni a `calcular_flete_unitario`,
-- así que con estas basta. Las funciones que sí las usan por dentro
-- —`precio_minimo_de`, `admin_sugerir_precio`, `admin_guardar_modelo`,
-- `recalcular_flete_de_lote`, `admin_reasignar_grupos`, `registrar_venta`—
-- son `security definer`: ahí el permiso se comprueba contra el dueño.
--
-- OJO con `precio_minimo_de`: esa SÍ se queda abierta. La llama
-- `v_catalogo_venta`, que es la vista de la vendedora, y ella necesita el
-- piso para regatear. Es el número que le toca ver.

revoke execute on function costo_operativo_por_pieza() from authenticated, anon;
revoke execute on function costo_total_bcv(numeric)    from authenticated, anon;
revoke execute on function calcular_flete_unitario(bigint) from authenticated, anon;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- Con tu sesión de administrador, en la pantalla de Verificación o aquí:
--
--   select costo_operativo_pieza_usd, costo_total_promedio_usd
--     from v_diagnostico;
--     -> los mismos números de siempre. Si sale 0 donde antes había
--        2,8279, la envoltura no te está reconociendo y hay que parar.
--
--   select count(*) from v_catalogo_admin;
--     -> 90. Si da 0, lo mismo.
--
--   select costo_operativo_admin();
--     -> 2.8279
--
-- Con sesión de vendedora, las tres tienen que fallar con 42501:
--   select costo_operativo_por_pieza();
--   select costo_total_bcv(1);
--   select calcular_flete_unitario(4);
--
-- Y esta tiene que devolver NULL, no un número:
--   select costo_operativo_admin();
--
-- Lo que NO puede cambiar: que ella siga pudiendo cobrar. Registra una
-- venta de prueba y anúlala. Si `registrar_venta` falla, es que el permiso
-- de `costo_operativo_por_pieza` sí se está comprobando contra ella y hay
-- que devolverle el grant y pensarlo de nuevo.
-- =====================================================================
