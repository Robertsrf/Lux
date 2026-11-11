-- =====================================================================
-- #66  LAS OFERTAS EN SUS PANTALLAS
--
-- Depende de: esquema-landing-y-ofertas.sql (#65).
--
-- Qué hace
--   El #65 dejó dos huecos que el navegador no podía cerrar solo, porque
--   las tablas de ofertas y las líneas de pedidos y ventas están
--   revocadas:
--
--   1. Pedidos y la ficha de la clienta no sabían qué línea llevaba un
--      código. Ahora tres vistas ganan, AL FINAL, el código, su
--      porcentaje y lo que costaría la pieza sin él:
--        v_pedido_vendedora      oferta_codigo, oferta_pct, precio_sin_oferta_usd
--        v_ventas_por_verificar  oferta_codigo, oferta_pct, precio_sin_oferta_bs
--        v_cliente_compras       oferta_codigo, oferta_pct, precio_sin_oferta_bs
--      Sin código, las tres salen null. Con eso Pedidos dice "Código
--      LUX-... · 5 %" y avisa, antes de "Quitar" o "Devolver", cuánto sube
--      el resto. Ninguna columna de costo, y los mismos permisos.
--
--   2. El panel Landing solo veía lo que la clienta ve hoy. Ahora el
--      administrador (y solo él) tiene:
--        v_ofertas_casa_admin  todas las ofertas de la casa: también las
--                              futuras, las terminadas y las apagadas, con
--                              si hoy se enseñan, sus piezas y cuántos
--                              códigos se dieron y se usaron.
--        v_combos_admin        los combos de la última vez que se
--                              rearmaron, aunque las ofertas estén
--                              apagadas o a un combo se le haya vendido
--                              una pieza.
--      Cada una cuelga de una función de definidor (una vista no presta
--      su permiso para ejecutar `combos_vigentes` y `casas_vigentes`, que
--      están cerradas), igual que `ofertas_codigos_admin` del #65, y
--      ambas dicen `where es_admin()`: la vendedora recibe vacío y
--      `anon` recibe 42501.
--
-- Se puede correr las veces que haga falta. No cambia ninguna función que
-- el navegador ya llame (regla 3): el navegador funciona con y sin él.
--
-- Qué debería dar
--   - Un pedido apartado con un código del 10 % para un collar de $10:
--     en su línea, oferta_codigo 'LUX-XXXXXX', oferta_pct 10 y
--     precio_sin_oferta_usd 10; la línea sin código, los tres en null.
--   - Lo mismo en la venta por verificar y en la compra de la clienta
--     (precio_sin_oferta_bs en bolívares).
--   - Como administrador, select * from v_ofertas_casa_admin lista
--     todas las ofertas de la casa; vigente_hoy es true solo para las
--     que se enseñan hoy. v_combos_admin lista los combos de la última
--     vez que se rearmaron.
--   - Como vendedora, las dos vistas del administrador salen vacías.
-- =====================================================================


-- ---------------------------------------------------------------------
-- §1. EL CÓDIGO EN LAS LÍNEAS DE PEDIDOS, VENTAS Y COMPRAS
-- Definiciones vigentes (esquema-pedido-completo / -quitar-por-verificar /
-- -devoluciones) con tres columnas nuevas al final.
-- ---------------------------------------------------------------------

create or replace view v_pedido_vendedora
with (security_invoker = off) as
select r.id as reserva_id,
       r.token,
       r.estado,
       r.creado_en,
       r.expira_en,
       r.cliente_nombre,
       r.cliente_apellido,
       r.cliente_cedula,
       r.cliente_telefono,
       r.entrega,
       r.envio_empresa,
       r.envio_agencia,
       r.envio_direccion,
       r.pago_metodo,
       r.pago_referencia,
       r.pago_fecha,
       r.pago_cedula,
       r.pago_telefono,
       r.pago_reportado_en,
       r.piezas as piezas_total,
       r.total_usd,
       ri.modelo_id,
       c.sku,
       c.nombre,
       c.variantes_nota,
       c.foto_thumb_path,
       ri.cantidad,
       coalesce(u.nombre, 'Sin existencia suficiente'::text) as ubicacion,
       c.variante,
       r.cliente_id,
       r.origen,
       f.fase,
       r.vence_apartado_en,
       r.pagado_en,
       round(r.total_usd - greatest(saldo_padre_bcv(null::bigint, r.id, null::bigint), 0::numeric), 4) as pagado_bcv,
       round(r.total_usd - greatest(saldo_padre_bcv(null::bigint, r.id, null::bigint, null::bigint, true), 0::numeric), 4) as verificado_bcv,
       falta_pedido_bcv(r.id) as falta_bcv,
       ((select count(*)
           from abonos a
          where a.reserva_id = r.id and a.anulado_en is null and a.verificado_en is null))::integer as por_revisar,
       pedido_con_precio(r.id) as con_precio,
       ri.precio_usd as precio_linea_usd,
       r.subtotal_usd,
       r.descuento_pct,
       round(r.total_usd * (select configuracion.valor
                              from configuracion
                             where configuracion.clave = 'apartado_inicial_pct'::text) / 100::numeric, 4) as minimo_bcv,
       pc.nombre as creado_por,
       -- #66: el código de oferta de la línea y lo que costaba sin él.
       oc.codigo as oferta_codigo,
       oc.pct as oferta_pct,
       ri.precio_sin_oferta_usd
  from reservas r
 cross join lateral (select fase_pedido(r.id) as fase) f
  join reserva_items ri on ri.reserva_id = r.id and ri.cantidad > 0
  join v_catalogo_venta c on c.id = ri.modelo_id
  left join perfiles pc on pc.id = r.creado_por
  left join lateral (select ub.nombre
                       from existencias e
                       join ubicaciones ub on ub.id = e.ubicacion_id
                      where e.modelo_id = ri.modelo_id and e.cantidad >= ri.cantidad
                      order by e.cantidad desc, ub.orden
                      limit 1) u on true
  left join ofertas_codigos oc on oc.id = ri.oferta_codigo_id
 where auth.uid() is not null and r.venta_id is null and r.cerrada_en is null
   and (f.fase = any (array['esperando_pago'::text, 'reportado'::text, 'apartado'::text, 'pagado'::text])
        or f.fase = 'vencido'::text and (exists (select 1
                                                   from abonos a
                                                  where a.reserva_id = r.id and a.anulado_en is null)));

grant select on v_pedido_vendedora to authenticated;


create or replace view v_ventas_por_verificar
with (security_invoker = off) as
select v.id as venta_id,
       v.fecha,
       v.usuario_id,
       p.nombre as vendedora,
       v.metodo,
       v.pago_referencia,
       v.cliente_id,
       v.cliente_nombre,
       v.cliente_telefono,
       cl.cedula as cliente_cedula,
       v.total_bs,
       round(v.total_bs / nullif(v.tasa_bcv_usada, 0::numeric), 2) as total_bcv,
       v.total_usd as total_binance,
       i.modelo_id,
       m.sku,
       m.nombre,
       m.variante,
       m.foto_thumb_path,
       i.cantidad,
       i.precio_unitario_bs,
       ub.nombre as ubicacion,
       v.pago_parcial,
       falta_bcv_de(v.id) as falta_bcv,
       v.extra_bs,
       v.extra_nota,
       -- #66: el código de oferta de la línea y lo que costaba sin él.
       oc.codigo as oferta_codigo,
       oc.pct as oferta_pct,
       i.precio_sin_oferta_bs
  from ventas v
  join venta_items i on i.venta_id = v.id and i.cantidad > 0
  join modelos m on m.id = i.modelo_id
  left join ubicaciones ub on ub.id = i.ubicacion_id
  left join perfiles p on p.id = v.usuario_id
  left join clientes cl on cl.id = v.cliente_id
  left join ofertas_codigos oc on oc.id = i.oferta_codigo_id
 where v.por_verificar and not v.anulada and auth.uid() is not null;

grant select on v_ventas_por_verificar to authenticated;


create or replace view v_cliente_compras
with (security_invoker = off) as
select v.cliente_id,
       v.id as venta_id,
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
       v.fecha + make_interval(months => meses_servicio()) as servicio_hasta,
       now() < (v.fecha + make_interval(months => meses_servicio())) as servicio_vigente,
       m.variante,
       v.por_verificar,
       v.verificada_en,
       v.anulada as anulada_sin_pago,
       v.pago_referencia,
       v.pago_parcial,
       falta_bcv_de(v.id) as falta_bcv,
       rv.nombre as revendedor,
       v.extra_bs,
       v.extra_nota,
       coalesce((select - sum(r.cantidad)::integer
                   from venta_items r
                   join ventas rv2 on rv2.id = r.venta_id and not rv2.anulada
                  where r.devuelve_item_id = i.id), 0) as devueltas,
       i.ubicacion_id,
       i.precio_unitario_usd,
       m.foto_path,
       -- #66: el código de oferta de la línea y lo que costaba sin él.
       oc.codigo as oferta_codigo,
       oc.pct as oferta_pct,
       i.precio_sin_oferta_bs
  from ventas v
  join venta_items i on i.venta_id = v.id and i.cantidad <> 0
  join modelos m on m.id = i.modelo_id
  left join revendedores rv on rv.id = v.revendedor_id
  left join ofertas_codigos oc on oc.id = i.oferta_codigo_id
 where v.cliente_id is not null and v.devolucion_de is null
   and (not v.anulada or v.notas ~~ '%Anulada sin pago:%'::text)
   and auth.uid() is not null;

grant select on v_cliente_compras to authenticated;


-- ---------------------------------------------------------------------
-- §2. TODAS LAS OFERTAS DE LA CASA, PARA EL PANEL
-- Las de hoy las enseña `ofertas_publicas()`; el dueño necesita también
-- las que vienen, las que ya pasaron y las apagadas, para editarlas,
-- terminarlas o anular sus códigos.
--   vigente_hoy:  está entre las que se enseñan hoy (`casas_vigentes()`:
--                 activa, en sus fechas, con todas sus piezas libres y
--                 aguantando su porcentaje).
--   piezas:       [{modelo_id, nombre, variante, categoria, foto_thumb,
--                  foto_url (rutas del bucket), precio_lista_usd,
--                  precio_oferta_usd, cantidad}], en su orden. Sin costo
--                 ni piso.
--   codigos_dados / codigos_usados: de esa oferta; usado = con una venta
--                 que no se anuló.
-- ---------------------------------------------------------------------
create or replace function ofertas_casa_admin()
returns table (id bigint, nombre text, texto text, foto text, pct numeric, desde date, hasta date,
               activa boolean, vigente_hoy boolean, creado_en timestamptz, actualizado_en timestamptz,
               piezas jsonb, codigos_dados bigint, codigos_usados bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select o.id, o.nombre, o.texto, o.foto, o.pct::numeric, o.desde, o.hasta,
         o.activa,
         o.id in (select cv.oferta_id from casas_vigentes() cv),
         o.creado_en, o.actualizado_en,
         coalesce((select jsonb_agg(pieza_oferta(i.modelo_id, 1, o.pct) order by i.orden, i.modelo_id)
                     from oferta_casa_items i
                    where i.oferta_id = o.id), '[]'::jsonb),
         (select count(*) from ofertas_codigos c
           where c.origen = 'casa' and c.ref_id = o.id),
         (select count(*) from ofertas_codigos c
            join ventas v on v.id = c.venta_id and not v.anulada
           where c.origen = 'casa' and c.ref_id = o.id)
    from ofertas_casa o
   where es_admin()
   order by o.hasta desc, o.id desc;
$fn$;

revoke all on function ofertas_casa_admin() from public, anon, authenticated;
grant execute on function ofertas_casa_admin() to authenticated;

create or replace view v_ofertas_casa_admin
with (security_invoker = off) as
select o.id, o.nombre, o.texto, o.foto, o.pct, o.desde, o.hasta, o.activa, o.vigente_hoy,
       o.creado_en, o.actualizado_en, o.piezas, o.codigos_dados, o.codigos_usados
  from ofertas_casa_admin() o
 where es_admin();

revoke all on v_ofertas_casa_admin from public, anon, authenticated;
grant select on v_ofertas_casa_admin to authenticated;


-- ---------------------------------------------------------------------
-- §3. LOS COMBOS DE LA SEMANA, PARA EL PANEL
-- Los de la última vez que se rearmaron (`combos_rearmados`), todos: se
-- vean o no hoy. `se_ensena_hoy` dice si `combos_vigentes()` lo deja
-- salir (con una pieza vendida no sale, y aquí sí se ve). Los códigos de
-- un combo son los de origen combo, estuche o regalo con su id.
-- ---------------------------------------------------------------------
create or replace function combos_admin()
returns table (id bigint, semana date, orden integer, pct numeric, n_piezas integer,
               se_ensena_hoy boolean, armado_en timestamptz, piezas jsonb,
               total_lista_usd numeric, total_oferta_usd numeric,
               codigos_dados bigint, codigos_usados bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select cs.id, cs.semana, cs.orden, cs.pct::numeric, cs.piezas,
         cs.id in (select cv.combo_id from combos_vigentes() cv),
         r.armado_en,
         coalesce((select jsonb_agg(pieza_oferta(ci.modelo_id, 1, cs.pct) order by ci.orden)
                     from combo_semana_items ci
                    where ci.combo_id = cs.id), '[]'::jsonb),
         (select sum(coalesce(m.precio_override_usd, g.precio_usd))::numeric
            from combo_semana_items ci
            join modelos m on m.id = ci.modelo_id
            left join grupos_precio g on g.id = m.grupo_precio_id
           where ci.combo_id = cs.id),
         (select sum(precio_oferta_con(coalesce(m.precio_override_usd, g.precio_usd)::numeric(12,4), cs.pct))::numeric
            from combo_semana_items ci
            join modelos m on m.id = ci.modelo_id
            left join grupos_precio g on g.id = m.grupo_precio_id
           where ci.combo_id = cs.id),
         (select count(*) from ofertas_codigos c
           where c.origen in ('combo', 'estuche', 'regalo') and c.ref_id = cs.id),
         (select count(*) from ofertas_codigos c
            join ventas v on v.id = c.venta_id and not v.anulada
           where c.origen in ('combo', 'estuche', 'regalo') and c.ref_id = cs.id)
    from combos_semana cs
    join combos_rearmados r on r.id = cs.rearmado_id
   where es_admin()
     and cs.rearmado_id = (select max(x.id) from combos_rearmados x)
   order by cs.orden, cs.id;
$fn$;

revoke all on function combos_admin() from public, anon, authenticated;
grant execute on function combos_admin() to authenticated;

create or replace view v_combos_admin
with (security_invoker = off) as
select c.id, c.semana, c.orden, c.pct, c.n_piezas, c.se_ensena_hoy, c.armado_en, c.piezas,
       c.total_lista_usd, c.total_oferta_usd, c.codigos_dados, c.codigos_usados
  from combos_admin() c
 where es_admin();

revoke all on v_combos_admin from public, anon, authenticated;
grant select on v_combos_admin to authenticated;
