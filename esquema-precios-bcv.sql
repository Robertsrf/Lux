-- =====================================================================
-- Lux by Emory — el precio se ancla en DOLARES BCV
-- Ejecutar en el SQL Editor DESPUES de la Fase 3.
--
-- QUE CAMBIA Y POR QUE
-- Hasta ahora el numero de un grupo (G9) eran dolares reales y el cobro
-- se hacia con la tasa de venta. A partir de aqui el numero del grupo es
-- lo que dice la etiqueta: DOLARES BCV.
--
--   precio_bs        = precio_usd (BCV) x tasa_bcv        <- lo que paga
--   precio_usd_real  = precio_bs / tasa_venta             <- lo que queda
--   margen           = precio_usd_real - costo_puesto_usd
--
-- La diferencia entre las dos ultimas lineas ES la brecha, y ahora sale
-- a la luz en cada margen en vez de esconderse. Un costo de $2,68 reales
-- "en dolares BCV" cuesta 2,68 x (tasa_venta / tasa_bcv): eso es lo que
-- hay que cobrar en BCV para recuperar un dolar real.
--
-- OJO CON LOS DOS DOLARES QUE CONVIVEN
--   Cara a la clienta (etiqueta, minimo de mayoreo, tramos, tablero de
--   piezas premium): DOLARES BCV.
--   Cara al dueno (costo puesto, margen, ganancia de los reportes):
--   DOLARES REALES.
-- Nunca se restan entre si sin convertir. Las vistas de abajo lo hacen.
-- =====================================================================

insert into configuracion (clave, valor, descripcion) values
  ('margen_objetivo_pct', 65, 'Margen sobre el precio que se busca al sugerir un precio de venta')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 1. CATALOGO: precio en BCV, y ademas lo que de verdad queda
-- Se recrean en cascada porque cambia el juego de columnas.
-- ---------------------------------------------------------------------

drop view if exists v_pedido_vendedora  cascade;
drop view if exists v_venta_ubicacion   cascade;
drop view if exists v_disponible_publico cascade;
drop view if exists v_catalogo_admin    cascade;
drop view if exists v_catalogo_venta    cascade;

create view v_catalogo_venta
with (security_invoker = off) as
select
  m.id,
  m.sku,
  m.nombre,
  m.categoria,
  m.descripcion,
  m.variantes_nota,
  m.foto_path,
  m.foto_thumb_path,
  g.nombre as grupo,
  -- El numero de la etiqueta: dolares BCV.
  coalesce(m.precio_override_usd, g.precio_usd) as precio_usd,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv, 2) as precio_bs,
  -- Lo que el negocio conserva de verdad, recomprable a tasa de venta.
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv / t.tasa_venta, 4) as precio_usd_real,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0) as existencia_total,
  m.activo
from modelos m
left join grupos_precio g on g.id = m.grupo_precio_id
left join lateral (select * from tasas where vigente limit 1) t on true
where m.activo;

create view v_catalogo_admin
with (security_invoker = off) as
select
  v.*,
  m.costo_unitario_usd,
  m.flete_unitario_usd,
  m.costo_puesto_usd,
  m.peso_unitario_g,
  m.lote_id,
  -- Margen contra los dolares REALES, no contra la etiqueta.
  (v.precio_usd_real - m.costo_puesto_usd) as margen_usd,
  case when v.precio_usd_real > 0
       then round(((v.precio_usd_real - m.costo_puesto_usd) / v.precio_usd_real) * 100, 2)
       else 0 end as margen_pct,
  m.grupo_precio_id,
  m.precio_override_usd,
  l.codigo as lote_codigo
from v_catalogo_venta v
join modelos m on m.id = v.id
left join lotes l on l.id = m.lote_id
where es_admin();

grant select on v_catalogo_venta to authenticated;
grant select on v_catalogo_admin to authenticated;

-- ---------------------------------------------------------------------
-- 2. LAS VISTAS QUE COLGABAN DEL CATALOGO
-- ---------------------------------------------------------------------

create view v_venta_ubicacion
with (security_invoker = off) as
select
  e.ubicacion_id, c.id as modelo_id, c.sku, c.nombre, c.categoria,
  c.variantes_nota, c.foto_thumb_path, c.foto_path, c.grupo,
  c.precio_usd, c.precio_bs, e.cantidad
from existencias e
join v_catalogo_venta c on c.id = e.modelo_id;

create view v_disponible_publico
with (security_invoker = off) as
select * from (
  select
    c.id, c.sku, c.nombre, c.categoria, c.variantes_nota,
    c.foto_path, c.foto_thumb_path, c.precio_usd, c.precio_bs,
    c.existencia_total - coalesce((
      select sum(ri.cantidad)
        from reserva_items ri
        join reservas r on r.id = ri.reserva_id
       where ri.modelo_id = c.id and r.estado = 'abierta' and r.expira_en > now()
    ), 0) as disponible
  from v_catalogo_venta c
  where c.existencia_total > 0
) x
where x.disponible > 0;

create view v_pedido_vendedora
with (security_invoker = off) as
select
  r.id as reserva_id, r.token, r.estado, r.creado_en, r.expira_en,
  r.cliente_nombre, r.cliente_telefono, r.piezas as piezas_total, r.total_usd,
  ri.modelo_id, c.sku, c.nombre, c.variantes_nota, c.foto_thumb_path, ri.cantidad,
  coalesce(u.nombre, 'Sin existencia suficiente') as ubicacion
from reservas r
join reserva_items ri on ri.reserva_id = r.id
join v_catalogo_venta c on c.id = ri.modelo_id
left join lateral (
  select ub.nombre from existencias e join ubicaciones ub on ub.id = e.ubicacion_id
   where e.modelo_id = ri.modelo_id and e.cantidad >= ri.cantidad
   order by e.cantidad desc, ub.orden limit 1
) u on true
where r.estado in ('abierta', 'confirmada') and auth.uid() is not null;

grant select on v_venta_ubicacion    to authenticated;
grant select on v_pedido_vendedora   to authenticated;
grant select on v_disponible_publico to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. REPORTES: la ganancia se calcula con los BOLIVARES cobrados
-- Antes restaba precio_unitario_usd (etiqueta) menos costo (real), que
-- son dos monedas distintas. Ahora el ingreso real sale de deshacer la
-- tasa de venta congelada en cada venta, que es exacto.
-- ---------------------------------------------------------------------

create or replace view v_mezcla_grupo
with (security_invoker = off) as
select
  coalesce(g.nombre, 'Sin grupo') as grupo,
  coalesce(g.orden, 999)          as orden,
  sum(i.cantidad)                 as piezas,
  sum(i.precio_unitario_bs * i.cantidad / v.tasa_venta_usada) as ingreso_usd,
  sum(i.precio_unitario_bs * i.cantidad / v.tasa_venta_usada
      - i.costo_puesto_usd_snap * i.cantidad)                 as ganancia_usd
from venta_items i
join ventas v   on v.id = i.venta_id and not v.anulada
join modelos mo on mo.id = i.modelo_id
left join grupos_precio g on g.id = mo.grupo_precio_id
where es_admin()
group by coalesce(g.nombre, 'Sin grupo'), coalesce(g.orden, 999);

create or replace view v_rotacion_modelo
with (security_invoker = off) as
select
  mo.id, mo.sku, mo.nombre, mo.categoria,
  coalesce(g.nombre, 'Sin grupo') as grupo,
  coalesce(x.piezas, 0)           as piezas_vendidas,
  x.ultima_venta,
  case when x.ultima_venta is not null then (current_date - x.ultima_venta::date) end as dias_sin_vender,
  (current_date - mo.creado_en::date) as dias_en_inventario,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = mo.id), 0) as existencia,
  mo.costo_puesto_usd,
  coalesce(x.ganancia_usd, 0) as ganancia_usd
from modelos mo
left join grupos_precio g on g.id = mo.grupo_precio_id
left join lateral (
  select
    sum(i.cantidad) as piezas,
    max(v.fecha)    as ultima_venta,
    sum(i.precio_unitario_bs * i.cantidad / v.tasa_venta_usada
        - i.costo_puesto_usd_snap * i.cantidad) as ganancia_usd
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
  where i.modelo_id = mo.id
) x on true
where mo.activo and es_admin();

grant select on v_mezcla_grupo    to authenticated;
grant select on v_rotacion_modelo to authenticated;

-- ---------------------------------------------------------------------
-- 4. COBRAR: los bolivares salen de la tasa BCV
-- Unico cambio real: precio_bs = precio_usd (BCV) x tasa_bcv.
-- total_usd sigue siendo dolares REALES (total_bs / tasa_venta), que es
-- lo que hace que el reporte de ganancia diga la verdad.
-- ---------------------------------------------------------------------

create or replace function registrar_venta(
  p_tipo             text,
  p_metodo           text,
  p_items            jsonb,
  p_kit_id           bigint default null,
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null,
  p_notas            text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta_id     bigint;
  v_tasa         tasas%rowtype;
  v_item         jsonb;
  v_modelo_id    bigint;
  v_ubicacion_id bigint;
  v_cantidad     int;
  v_disponible   int;
  v_precio_usd   numeric(12,4);
  v_precio_bs    numeric(14,2);
  v_costo        numeric(12,4);
  v_nombre       text;
  v_ubi_nombre   text;
  v_kit_precio   numeric(12,4);
  v_total_bs     numeric(14,2) := 0;
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

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Un administrador tiene que fijarla antes de cobrar.';
  end if;

  if p_kit_id is not null then
    select precio_por_pieza_usd into v_kit_precio from kits where id = p_kit_id and activo;
    if not found then
      raise exception 'Ese kit no existe o esta inactivo.';
    end if;
  end if;

  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      kit_id, cliente_nombre, cliente_telefono, notas)
  values (auth.uid(), p_tipo::tipo_venta, p_metodo::metodo_pago,
          v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_kit_id, p_cliente_nombre, p_cliente_telefono, p_notas)
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo_id    := (v_item->>'modelo_id')::bigint;
    v_ubicacion_id := (v_item->>'ubicacion_id')::bigint;
    v_cantidad     := (v_item->>'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select e.cantidad into v_disponible
      from existencias e
     where e.modelo_id = v_modelo_id and e.ubicacion_id = v_ubicacion_id
     for update;

    select m.nombre,
           coalesce(m.precio_override_usd, g.precio_usd),
           m.costo_puesto_usd
      into v_nombre, v_precio_usd, v_costo
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo_id and m.activo;

    if not found then
      raise exception 'El modelo % no existe o esta retirado.', v_modelo_id;
    end if;

    select nombre into v_ubi_nombre from ubicaciones where id = v_ubicacion_id;

    if v_disponible is null or v_disponible < v_cantidad then
      raise exception 'No hay suficiente "%" en %. Quedan %, y pides %.',
        v_nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), coalesce(v_disponible, 0), v_cantidad;
    end if;

    if p_kit_id is not null then
      v_precio_usd := v_kit_precio;
    end if;
    if v_precio_usd is null then
      raise exception 'El modelo "%" no tiene precio: falta asignarle un grupo.', v_nombre;
    end if;

    -- El precio esta en dolares BCV: se cobra a la tasa del BCV.
    v_precio_bs := round(v_precio_usd * v_tasa.tasa_bcv, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs, costo_puesto_usd_snap)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            v_precio_usd, v_precio_bs, v_costo);

    v_total_bs := v_total_bs + (v_precio_bs * v_cantidad);
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  return v_venta_id;
end;
$$;

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text) from public, anon;
grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. PRECIO SUGERIDO Y GRUPO AUTOMATICO
--
--   costo_puesto  = costo unitario + su parte del flete   (dolares reales)
--   costo_bcv     = costo_puesto x (tasa_venta / tasa_bcv)
--                   lo que hay que cobrar en BCV para recuperar un dolar real
--   precio_bcv    = costo_bcv / (1 - margen)              margen SOBRE EL PRECIO
--   grupo         = el grupo activo mas barato que llegue a ese precio
--                   (redondeo hacia arriba: nunca por debajo del objetivo)
--
-- Devuelve todos los pasos para que el formulario muestre el porque, no
-- solo el resultado.
-- ---------------------------------------------------------------------

create or replace function admin_sugerir_precio(
  p_lote_id    bigint,
  p_peso_g     numeric,
  p_costo_usd  numeric,
  p_margen_pct numeric default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tasa        tasas%rowtype;
  v_flete       numeric(12,4);
  v_costo       numeric(12,4);
  v_factor      numeric;
  v_costo_bcv   numeric(12,4);
  v_margen      numeric;
  v_precio_bcv  numeric(12,4);
  v_grupo       grupos_precio%rowtype;
  v_grupo_real  numeric(12,4);
  v_margen_real numeric;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede calcular precios.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fijala antes de calcular precios.';
  end if;

  v_flete := calcular_flete_unitario(p_lote_id, p_peso_g, p_costo_usd);
  v_costo := coalesce(p_costo_usd, 0) + coalesce(v_flete, 0);

  v_factor    := v_tasa.tasa_venta / v_tasa.tasa_bcv;
  v_costo_bcv := round(v_costo * v_factor, 4);

  select coalesce(p_margen_pct, valor) / 100 into v_margen
    from configuracion where clave = 'margen_objetivo_pct';
  v_margen := coalesce(v_margen, coalesce(p_margen_pct, 0) / 100);

  if v_margen >= 1 then
    raise exception 'El margen tiene que ser menor que 100 %%.';
  end if;

  v_precio_bcv := round(v_costo_bcv / (1 - v_margen), 2);

  -- El grupo mas barato que alcance el precio: se redondea HACIA ARRIBA.
  select * into v_grupo
    from grupos_precio
   where activo and precio_usd >= v_precio_bcv
   order by precio_usd asc
   limit 1;

  -- Si ninguno llega, se propone el mas caro y el formulario avisa.
  if not found then
    select * into v_grupo from grupos_precio where activo order by precio_usd desc limit 1;
  end if;

  if v_grupo.id is not null then
    v_grupo_real  := round(v_grupo.precio_usd / v_factor, 4);
    v_margen_real := case when v_grupo_real > 0
                          then round(((v_grupo_real - v_costo) / v_grupo_real) * 100, 2)
                          else null end;
  end if;

  return jsonb_build_object(
    'flete_unitario_usd',   v_flete,
    'costo_puesto_usd',     v_costo,
    'factor_brecha',        round(v_factor, 4),
    'costo_en_bcv',         v_costo_bcv,
    'margen_objetivo_pct',  round(v_margen * 100, 2),
    'precio_sugerido_bcv',  v_precio_bcv,
    'grupo_id',             v_grupo.id,
    'grupo_nombre',         v_grupo.nombre,
    'grupo_precio_bcv',     v_grupo.precio_usd,
    'grupo_alcanza',        coalesce(v_grupo.precio_usd >= v_precio_bcv, false),
    'precio_grupo_real',    v_grupo_real,
    'margen_resultante_pct', v_margen_real);
end;
$$;

revoke all on function admin_sugerir_precio(bigint, numeric, numeric, numeric) from public, anon;
grant execute on function admin_sugerir_precio(bigint, numeric, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- 6. COMPROBACION
--
--   select admin_sugerir_precio(null, 0, 2.68);
--
-- Con tasa 500/250 y margen 65 %: costo_en_bcv 5,36 y
-- precio_sugerido_bcv 15,31. Con una brecha chica el numero baja mucho;
-- con brecha 0 (tasa_venta = tasa_bcv) daria 7,66.
--
-- Y con sesion de vendedora la misma llamada debe ser RECHAZADA.
-- =====================================================================
