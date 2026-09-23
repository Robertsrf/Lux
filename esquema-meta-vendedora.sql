-- =====================================================================
-- Lux by Emory — la meta de la vendedora, entera y sacada de las cuentas
-- Ejecutar en el SQL Editor DESPUÉS de esquema-cuentas-claras.sql
--
-- QUÉ ESTABA A MEDIAS
-- `esquema-cuentas-claras.sql` le dio a la vendedora una meta de piezas por
-- día sacada del plan de ventas. Quedaron cuatro cabos sueltos:
--
--   1. Sin el dato de días que abre la tienda, la meta volvía al 4 que se
--      escribió al instalar: un número sin relación con nada.
--   2. Solo veía el día. La meta de verdad es la del MES —de ahí sale la
--      del día—, y ella no sabía si la tienda iba adelantada o atrasada.
--   3. La meta de piezas premium (1 al día) y el precio desde el que una
--      pieza cuenta como premium ($20) también venían de la instalación,
--      y no había pantalla para cambiarlos.
--   4. Su tablero decía el dinero solo en bolívares.
--
-- LO QUE HACE
--   - `meta_vendedora()`: todo lo que ella necesita para saber cómo va, en
--     PIEZAS y nada más. Reemplaza a `meta_del_dia()`, que se suelta.
--   - `v_tablero_dia` gana lo vendido y el ticket en dólares BCV, al final.
--   - El 4 de la instalación se borra: si todavía no se puede hacer la
--     cuenta, su pantalla dice que falta el dato, no enseña un número viejo.
--   - La meta premium y su umbral quedan en la pantalla de Costos (eso es
--     del navegador; aquí no hay nada que tocar, ya se podían leer).
--   - Ella puede leer `descuento_max_mostrador_pct`: cuánto puede rebajar
--     de la etiqueta para cerrar una venta. Lo veía el dueño y ella no.
--     Ver la sección 3 para por qué eso sí y el margen mínimo no.
--
-- LO QUE ELLA NO PUEDE DEDUCIR
-- `meta_vendedora()` devuelve conteos de piezas: la meta del mes, la del
-- día, las vendidas y el calendario. Ni un gasto, ni un costo, ni lo que
-- deja una pieza. Para despejar el alquiler o el costo le harían falta dos
-- cifras más que no ve. Y las piezas vendidas por la tienda no son un
-- secreto para quien las vende.
--
-- POR QUÉ SE PUEDE SOLTAR meta_del_dia SIN ESPERAR
-- La regla de la casa es no quitar una función que el navegador ya llama.
-- Esta no la llamó nunca ningún navegador publicado: nació con
-- esquema-cuentas-claras.sql y la pantalla que la usaba no llegó a subirse.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LA META DE LA VENDEDORA
--
-- Sale de `plan_ventas()`, la misma cuenta que ve el dueño en Costos: si
-- él cambia un gasto o su meta de ganancia, la de ella cambia sola.
--
--   meta_mes   piezas para la meta de ganancia del mes; sin meta de
--              ganancia, las piezas para cubrir los gastos.
--   meta_hoy   lo mismo repartido entre los días que abre la tienda. Null
--              mientras el dueño no haya dicho cuántos son.
--   para       'meta' o 'equilibrio': con qué se armó la meta del mes,
--              para decirle a ella en palabras qué persigue.
--
-- Las piezas son de la TIENDA, no solo las de ella: la meta es de la
-- tienda, y si el dueño cobra una venta también cuenta.
-- ---------------------------------------------------------------------

drop function if exists meta_del_dia();

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
  select
    coalesce(p.piezas_meta_dia, p.piezas_equilibrio_dia)::int,
    coalesce(p.piezas_meta_mes, p.piezas_equilibrio_mes)::int,
    case when p.piezas_meta_mes is not null then 'meta'
         when p.piezas_equilibrio_mes is not null then 'equilibrio' end,
    (select coalesce(sum(i.cantidad), 0)
       from venta_items i
       join ventas v on v.id = i.venta_id and not v.anulada
      where v.fecha::date = current_date)::int,
    p.vendidas_mes::int,
    p.dia_del_mes,
    p.dias_del_mes,
    p.ritmo_piezas_mes::int,
    p.dias_abiertos_mes::int
  from plan_ventas() p
  where auth.uid() is not null;
$fn$;

revoke all on function meta_vendedora() from public, anon;
grant execute on function meta_vendedora() to authenticated;

-- ---------------------------------------------------------------------
-- 2. SU TABLERO, TAMBIÉN EN DÓLARES BCV
--
-- Misma vista, dos columnas más al final: lo vendido hoy y el ticket
-- promedio en dólares BCV, cada venta con la tasa BCV que se congeló al
-- cobrarla. Es la moneda de las etiquetas que ella ve todo el día.
-- ---------------------------------------------------------------------

create or replace view v_tablero_dia
with (security_invoker = off) as
select
  v.usuario_id,
  count(*)                                   as ventas,
  coalesce(sum(v.total_bs), 0)               as total_bs,
  coalesce(sum(p.piezas), 0)                 as piezas,
  coalesce(sum(p.premium), 0)                as piezas_premium,
  case when count(*) > 0
       then round(sum(v.total_bs) / count(*), 2)
       else 0 end                            as ticket_promedio_bs,
  round(coalesce(sum(v.total_bs / v.tasa_bcv_usada), 0), 2) as total_bcv,
  case when count(*) > 0
       then round(sum(v.total_bs / v.tasa_bcv_usada) / count(*), 2)
       else 0 end                            as ticket_promedio_bcv
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum(i.cantidad) filter (
      where i.precio_unitario_usd >= (select valor from configuracion where clave = 'premium_min_usd')
    ), 0) as premium
  from venta_items i
  where i.venta_id = v.id
) p on true
where not v.anulada
  and v.fecha::date = current_date
  and (es_admin() or v.usuario_id = auth.uid())
group by v.usuario_id;

grant select on v_tablero_dia to authenticated;

-- ---------------------------------------------------------------------
-- 3. FUERA EL 4 DE LA INSTALACIÓN, Y SU PORCENTAJE PARA NEGOCIAR
--
-- `meta_piezas_dia` era una meta escrita a mano al instalar, que ninguna
-- pantalla dejaba cambiar. Ya no la lee nadie: se borra para que no la
-- lea nadie por error más adelante. Sale también de la lista de claves que
-- la vendedora puede leer.
--
-- Y entra `descuento_max_mostrador_pct`, el porcentaje con el que ella
-- puede jugar para cerrar una venta. Es SEGURO dárselo, y conviene decir
-- por qué, porque su vecino no lo es:
--
--   - Ella ya ve el precio de lista y el mínimo de cada pieza. Con el
--     descuento máximo solo sabe, además, en qué piezas manda ese tope y
--     en cuáles manda otro. Del costo no aprende nada.
--
--   - `margen_minimo_pct` NO entra, y no debe entrar nunca. En las piezas
--     donde el margen es el que frena, el mínimo es costo × brecha ÷ (1 −
--     margen). Ella ve el mínimo y la brecha (las tasas son públicas):
--     con el margen, despejaría el costo de cada una. Es la fuga que cerró
--     esquema-parche-piso.sql.
-- ---------------------------------------------------------------------

delete from configuracion where clave = 'meta_piezas_dia';

drop policy if exists config_leer on configuracion;

create policy config_leer on configuracion for select to authenticated
using (
  es_admin()
  or clave in (
    'mayoreo_min_piezas',
    'mayoreo_min_usd',
    'meta_premium_dia',
    'premium_min_usd',
    'reserva_minutos',
    'meses_servicio',
    'descuento_max_mostrador_pct'
  )
);

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Con tu sesión de administrador, que la meta de ella sea la de Costos:
--
--      select meta_mes, meta_hoy from meta_vendedora();
--      select coalesce(piezas_meta_mes, piezas_equilibrio_mes),
--             coalesce(piezas_meta_dia, piezas_equilibrio_dia)
--        from v_plan_ventas;
--        -> los mismos dos números.
--
--      Si meta_hoy sale vacío: falta poner en Costos los días que abres.
--
-- 2. Con la sesión de la VENDEDORA:
--
--      select * from meta_vendedora();
--        -> una fila, solo piezas y fechas. Ninguna columna de dinero.
--
--      select * from v_plan_ventas;       -> 0 filas, como antes.
--      select meta_del_dia();             -> tiene que FALLAR: ya no existe.
--
-- 3. Que el 4 se haya ido:
--
--      select * from configuracion where clave = 'meta_piezas_dia';
--        -> 0 filas.
--
-- 4. Con la sesión de la VENDEDORA, lo que puede y lo que no puede leer:
--
--      select valor from configuracion where clave = 'descuento_max_mostrador_pct';
--        -> su porcentaje, 10 si no lo has cambiado.
--      select valor from configuracion where clave = 'margen_minimo_pct';
--        -> 0 filas. Si devuelve algo, puede despejar costos: para.
-- =====================================================================
