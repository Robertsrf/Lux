-- =====================================================================
-- Lux by Emory — sumar al cobro algo que no está en el catálogo
-- Ejecutar en el SQL Editor DESPUÉS de esquema-guia-revendedores.sql
-- (la venta es la de esquema-abonos-y-apartados.sql)
--
-- QUÉ PIDIÓ EL DUEÑO (02/10/2026)
-- Al cobrar, a veces se suma algo que no está en el catálogo: el dije
-- que se le pone a una cadena, por ejemplo. No había cómo: o se cobraba
-- aparte, sin que quedara en ningún sitio, o no se cobraba. Que la
-- vendedora y el administrador puedan escribir cuántos bolívares más
-- suma la cuenta, que entre a la venta como vendido, y que la pantalla
-- diga cuánto es eso en dólares BCV.
--
-- QUÉ HACE
-- 1. Dos columnas en `ventas`: `extra_bs` (los bolívares que se sumaron,
--    congelados como todo lo de `ventas`) y `extra_nota` (qué era). El
--    total de la venta los incluye: `total_bs` = piezas + extra. Así lo
--    cuentan solos la caja (`caja_flujo`), "Mi día", lo que falta de una
--    venta por verificar (`falta_bcv_de`) y lo vendido en Reportes, sin
--    tocar ninguna de esas fórmulas.
-- 2. `registrar_venta` recibe `p_extra_bs` y `p_extra_nota`, al final.
--    Nunca negativo (sería una rebaja que se salta el mínimo de cada
--    pieza) y siempre diciendo qué es: el dueño tiene que poder saber qué
--    se vendió fuera del catálogo, y quién.
-- 3. `v_ventas_por_verificar` y `v_cliente_compras` lo dicen al final,
--    para que Pedidos y la ficha de la clienta lo enseñen y las piezas
--    cuadren con el total.
-- 4. Lo que DEJÓ una venta no lo cuenta (`v_ventas_por_dia`,
--    `v_margen_ventas`): el sistema no sabe lo que costó, y contarlo
--    entero como ganancia sería inventar un costo de cero. Así "Te
--    dejaron" dice lo mismo que "El mes" (`v_cobertura_mes`), que ya
--    suma pieza por pieza. `v_ventas_por_dia` dice al final cuánto fue,
--    para que Reportes lo enseñe aparte.
--
-- LO QUE NO ES
-- - No es una pieza: no descuenta existencia, no cuenta para el tramo de
--   mayoreo ni para la meta de piezas de la vendedora, y no lleva
--   descuento por cantidad.
-- - No se aparta: el apartado congela el precio pieza por pieza, y esto
--   no es una pieza. Va con "Pagó todo", o por verificar.
-- - No va solo: una venta sigue necesitando al menos una pieza del
--   catálogo. Si algo se vende a menudo, lo que toca es cargarlo.
--
-- La firma es la de antes con dos parámetros más al final, con valor por
-- omisión: el navegador viejo la sigue llamando con los doce de siempre y
-- encaja en la nueva. La vieja se suelta antes de crear la nueva; con
-- las dos vivas, PostgREST no sabría cuál elegir y nadie podría cobrar.
--
-- Reejecutable.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LAS COLUMNAS
-- ---------------------------------------------------------------------

alter table ventas add column if not exists extra_bs   numeric(14,2) not null default 0;
alter table ventas add column if not exists extra_nota text;

alter table ventas drop constraint if exists ventas_extra_valido;
alter table ventas add constraint ventas_extra_valido
  check (extra_bs >= 0
         and (extra_bs = 0 or nullif(btrim(coalesce(extra_nota, '')), '') is not null));

comment on column ventas.extra_bs is
  'Bolivares sumados al cobro por algo que no esta en el catalogo (un dije). Ya va dentro de total_bs. No es pieza: sin existencia, sin tramo, sin costo.';
comment on column ventas.extra_nota is
  'Que fue lo que se sumo fuera del catalogo. Obligatoria si extra_bs > 0.';


-- ---------------------------------------------------------------------
-- 2. COBRAR, CON ALGO FUERA DEL CATÁLOGO
--
-- La de esquema-abonos-y-apartados.sql, igual línea por línea, con dos
-- parámetros más al final. Lo nuevo: valida el extra antes de tocar una
-- tabla, lo guarda en la venta y lo suma al total.
-- ---------------------------------------------------------------------

drop function if exists registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text, boolean, text);

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

  -- El tramo sale de las piezas del catálogo. Lo de fuera no es una pieza.
  select coalesce(sum((x->>'cantidad')::int), 0)
    into v_piezas
    from jsonb_array_elements(p_items) x;

  v_desc := coalesce(descuento_para(v_piezas), 0);

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

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text, boolean, text, numeric, text)
  from public, anon;
grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text, boolean, text, numeric, text)
  to authenticated;


-- ---------------------------------------------------------------------
-- 3. PEDIDOS Y LA FICHA LO DICEN
-- Las dos, con sus columnas de siempre (las de esquema-abonos.sql y de
-- esquema-revendedores-plazos.sql) y lo de fuera del catálogo al final.
-- Una fila por pieza: el extra se repite en cada una, como el total.
-- ---------------------------------------------------------------------

create or replace view v_ventas_por_verificar
with (security_invoker = off) as
select
  v.id                as venta_id,
  v.fecha,
  v.usuario_id,
  p.nombre            as vendedora,
  v.metodo,
  v.pago_referencia,
  v.cliente_id,
  v.cliente_nombre,
  v.cliente_telefono,
  cl.cedula           as cliente_cedula,
  v.total_bs,
  round(v.total_bs / nullif(v.tasa_bcv_usada, 0), 2) as total_bcv,
  v.total_usd         as total_binance,
  i.modelo_id,
  m.sku,
  m.nombre,
  m.variante,
  m.foto_thumb_path,
  i.cantidad,
  i.precio_unitario_bs,
  ub.nombre           as ubicacion,
  v.pago_parcial,
  falta_bcv_de(v.id)  as falta_bcv,
  v.extra_bs,
  v.extra_nota
from ventas v
join venta_items i on i.venta_id = v.id
join modelos m     on m.id = i.modelo_id
left join ubicaciones ub on ub.id = i.ubicacion_id
left join perfiles p     on p.id = v.usuario_id
left join clientes cl    on cl.id = v.cliente_id
where v.por_verificar
  and not v.anulada
  and auth.uid() is not null;

revoke all on v_ventas_por_verificar from anon;
grant select on v_ventas_por_verificar to authenticated;

create or replace view v_cliente_compras
with (security_invoker = off) as
select
  v.cliente_id,
  v.id            as venta_id,
  v.fecha,
  v.tipo,
  v.metodo,
  v.total_bs,
  v.total_usd,
  i.modelo_id,
  m.sku,
  m.nombre,
  m.categoria,
  m.variantes_nota,
  m.foto_thumb_path,
  i.cantidad,
  i.precio_unitario_bs,
  (v.fecha + make_interval(months => meses_servicio()))        as servicio_hasta,
  (now() < v.fecha + make_interval(months => meses_servicio())) as servicio_vigente,
  m.variante,
  v.por_verificar,
  v.verificada_en,
  v.anulada       as anulada_sin_pago,
  v.pago_referencia,
  v.pago_parcial,
  falta_bcv_de(v.id) as falta_bcv,
  rv.nombre       as revendedor,
  v.extra_bs,
  v.extra_nota
from ventas v
join venta_items i on i.venta_id = v.id
join modelos m     on m.id = i.modelo_id
left join revendedores rv on rv.id = v.revendedor_id
where v.cliente_id is not null
  and (not v.anulada or v.notas like '%Anulada sin pago:%')
  and auth.uid() is not null;

revoke all on v_cliente_compras from anon;
grant select on v_cliente_compras to authenticated;


-- ---------------------------------------------------------------------
-- 4. LO QUE DEJÓ UNA VENTA NO CUENTA LO QUE NO SE SABE LO QUE COSTÓ
--
-- Las de esquema-cuentas-claras.sql (v_ventas_por_dia) y
-- esquema-flete-y-gastos.sql (v_margen_ventas), mismas columnas y mismos
-- tipos. Lo vendido sigue siendo el total (entró ese dinero); lo que
-- dejó resta el extra antes de restar la mercancía. Con cero de extra,
-- que es toda venta de antes, dan exactamente lo mismo que ayer.
-- `extra_bcv`, al final: cuánto de lo vendido fue fuera del catálogo.
-- ---------------------------------------------------------------------

create or replace view v_ventas_por_dia
with (security_invoker = off) as
select
  v.fecha::date                                as dia,
  count(*)                                     as ventas,
  coalesce(sum(m.piezas), 0)                   as piezas,
  coalesce(sum(v.total_bs), 0)                 as total_bs,
  coalesce(sum(v.total_bs / v.tasa_bcv_usada), 0) as total_usd,
  coalesce(sum(m.costo_usd), 0)                as costo_usd,
  coalesce(sum((v.total_bs - v.extra_bs) / v.tasa_bcv_usada - m.costo_usd), 0) as ganancia_usd,
  coalesce(sum(m.mercancia_usd), 0)            as mercancia_usd,
  coalesce(sum((v.total_bs - v.extra_bs) / v.tasa_bcv_usada - m.mercancia_usd
               - m.piezas * (select coalesce((select valor from configuracion
                                               where clave = 'empaque_por_pieza_usd'), 0))), 0)
                                               as contribucion_usd,
  coalesce(sum(v.extra_bs / v.tasa_bcv_usada), 0) as extra_bcv
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum((i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                  + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad), 0) as costo_usd,
    coalesce(sum(i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                 * i.cantidad), 0) as mercancia_usd
  from venta_items i where i.venta_id = v.id
) m on true
where not v.anulada
  and es_admin()
group by v.fecha::date;

grant select on v_ventas_por_dia to authenticated;

create or replace view v_margen_ventas
with (security_invoker = off) as
select
  v.id,
  v.fecha,
  v.tipo,
  v.metodo,
  round(v.total_bs / v.tasa_bcv_usada, 4) as total_usd,
  round(coalesce(sum((i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                      + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad), 0), 4) as costo_total_usd,
  round((v.total_bs - v.extra_bs) / v.tasa_bcv_usada
        - coalesce(sum((i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
                        + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad), 0), 4) as ganancia_usd
from ventas v
left join venta_items i on i.venta_id = v.id
where not v.anulada
  and es_admin()
group by v.id, v.fecha, v.tipo, v.metodo, v.total_bs, v.extra_bs, v.tasa_bcv_usada, v.tasa_venta_usada;

grant select on v_margen_ventas to authenticated;

notify pgrst, 'reload schema';


-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Una sola registrar_venta, con catorce parámetros:
--      select pg_get_function_identity_arguments(oid)
--        from pg_proc where proname = 'registrar_venta';
--    Debe salir UNA fila que termina en "p_extra_bs numeric, p_extra_nota text".
--
-- 2. Las ventas de antes no cambian:
--      select count(*) from ventas where extra_bs <> 0;
--    Debe dar 0 hasta la primera venta con algo fuera del catálogo.
--
-- 3. "Te dejaron" no se movió: antes de correr este archivo y después,
--      select sum(contribucion_usd) from v_ventas_por_dia;
--    da la misma cifra (con sesión de administrador; en el SQL Editor
--    `es_admin()` da falso y la vista sale vacía, como siempre).
--
-- 4. En el mostrador: una pieza de Bs 1.000,00 y "Fuera del catálogo"
--    Bs 200,00, "dije". La venta debe quedar con total_bs = 1.200,00,
--    extra_bs = 200,00 y una sola línea en venta_items, de Bs 1.000,00;
--    la existencia baja una pieza, no dos.
--      select id, total_bs, extra_bs, extra_nota from ventas order by id desc limit 1;
-- =====================================================================
