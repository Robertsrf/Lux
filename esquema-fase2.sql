-- =====================================================================
-- Lux by Emory — Fase 2: punto de venta y cuadre
-- Ejecutar en el SQL Editor DESPUES de esquema.sql y esquema-complemento.sql
--
-- Por que casi todo esto es SECURITY DEFINER:
-- la vendedora no puede leer `modelos`, pero una venta tiene que congelar
-- el costo puesto de cada pieza. Ese dato lo lee la funcion por dentro y
-- lo guarda en venta_items; la vendedora nunca lo ve de vuelta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REGISTRAR UNA VENTA (una sola transaccion)
--
-- Si esto fueran tres llamadas desde React y fallara la segunda, el
-- inventario quedaria corrupto. Por eso venta + items + descuento de
-- existencia viven en una sola funcion.
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

  -- El precio de un kit se fija en dolares POR PIEZA, nunca como
  -- porcentaje del detal: con porcentaje, mover la tasa lo descuadra.
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

    -- Bloquea la fila de existencia: dos ventas simultaneas no pueden
    -- llevarse la misma ultima pieza.
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

    v_precio_bs := round(v_precio_usd * v_tasa.tasa_venta, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs, costo_puesto_usd_snap)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            v_precio_usd, v_precio_bs, v_costo);

    v_total_bs := v_total_bs + (v_precio_bs * v_cantidad);
  end loop;

  -- El margen se mide en dolares: total_usd sale de deshacer la tasa usada.
  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  return v_venta_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 1b. EL DISPARADOR DE MAYOREO TIENE QUE LEER COMO DUENO
-- venta_items esta revocada para authenticated (parche de seguridad 01),
-- asi que sin SECURITY DEFINER este disparador rompe TODA venta al mayor.
-- ---------------------------------------------------------------------

create or replace function validar_minimo_mayoreo()
returns trigger
language plpgsql
security definer
set search_path = public
as $
declare
  v_piezas int;
  v_usd    numeric(12,4);
  v_min_p  numeric(12,4);
  v_min_u  numeric(12,4);
begin
  if (select tipo from ventas where id = new.venta_id) <> 'mayor' then
    return new;
  end if;

  select coalesce(sum(cantidad), 0),
         coalesce(sum(precio_unitario_usd * cantidad), 0)
    into v_piezas, v_usd
    from venta_items where venta_id = new.venta_id;

  select valor into v_min_p from configuracion where clave = 'mayoreo_min_piezas';
  select valor into v_min_u from configuracion where clave = 'mayoreo_min_usd';

  -- Minimo: 6 piezas O $30, lo que se cumpla primero. Solo se rechaza
  -- cuando la venta queda por debajo de LOS DOS.
  if v_piezas < v_min_p and v_usd < v_min_u then
    raise exception
      'La venta al mayor requiere % piezas o $%. Llevas % piezas y $%.',
      v_min_p, v_min_u, v_piezas, v_usd;
  end if;

  return new;
end;
$;

revoke all on function validar_minimo_mayoreo() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 2. VENDER UN KIT FIJO DE UN SOLO MOVIMIENTO
-- La mayorista no puede costar 50 toques. Se elige el kit y ya.
-- ---------------------------------------------------------------------

create or replace function registrar_venta_kit(
  p_kit_id           bigint,
  p_metodo           text,
  p_ubicacion_id     bigint default null,
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null,
  p_notas            text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  if not exists (select 1 from kits where id = p_kit_id and activo) then
    raise exception 'Ese kit no existe o esta inactivo.';
  end if;

  -- Para cada modelo del kit se toma la ubicacion indicada; si no se
  -- indica ninguna, la que mas piezas tenga.
  select jsonb_agg(jsonb_build_object(
           'modelo_id',    ki.modelo_id,
           'ubicacion_id', coalesce(p_ubicacion_id, mejor.ubicacion_id),
           'cantidad',     ki.cantidad))
    into v_items
    from kit_items ki
    left join lateral (
      select e.ubicacion_id
        from existencias e
       where e.modelo_id = ki.modelo_id and e.cantidad >= ki.cantidad
       order by e.cantidad desc, e.ubicacion_id
       limit 1
    ) mejor on true
   where ki.kit_id = p_kit_id;

  if v_items is null then
    raise exception 'El kit no tiene piezas cargadas.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_items) x where x->>'ubicacion_id' is null) then
    raise exception 'Alguna pieza del kit no tiene existencia suficiente en ninguna ubicacion.';
  end if;

  return registrar_venta('mayor', p_metodo, v_items, p_kit_id,
                         p_cliente_nombre, p_cliente_telefono, p_notas);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. ANULAR UNA VENTA (solo admin) — devuelve las piezas al inventario
-- ---------------------------------------------------------------------

create or replace function admin_anular_venta(p_venta_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item venta_items%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular una venta.';
  end if;
  if (select anulada from ventas where id = p_venta_id) then
    raise exception 'Esa venta ya estaba anulada.';
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
end;
$$;

-- ---------------------------------------------------------------------
-- 4. TABLERO DEL DIA (vendedora)
--
-- El tablero existe para empujar el TICKET PROMEDIO, no el conteo de
-- piezas: vender 4 anillos de $9 cumple el numero y falla en plata. Por
-- eso se muestran dos cifras: piezas del dia y cuantas fueron de $20 o mas.
-- El umbral vive en configuracion, no quemado en el codigo.
-- ---------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion) values
  ('premium_min_usd', 20, 'Precio desde el cual una pieza cuenta como premium en el tablero')
on conflict (clave) do nothing;

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
       else 0 end                            as ticket_promedio_bs
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
-- 5. CIERRE DIARIO
--
-- Al final del dia la vendedora cuenta SOLO CANTIDADES por ubicacion.
-- Lo esperado es lo que el sistema cree que hay ahora mismo: la venta ya
-- descontó al cobrar. Rapido y sostenible; el detalle pieza por pieza es
-- el conteo semanal.
-- ---------------------------------------------------------------------

create or replace view v_cuadre_dia
with (security_invoker = off) as
select
  u.id           as ubicacion_id,
  u.nombre       as ubicacion,
  u.orden,
  coalesce((select sum(e.cantidad) from existencias e where e.ubicacion_id = u.id), 0) as esperado,
  c.id           as conteo_id,
  c.cantidad_contada,
  c.diferencia,
  c.creado_en    as contado_en
from ubicaciones u
left join lateral (
  select * from conteos
   where ubicacion_id = u.id and tipo = 'diario' and fecha = current_date
   order by creado_en desc limit 1
) c on true
where u.activo and u.cuenta_en_cuadre;

grant select on v_cuadre_dia to authenticated;

create or replace function cerrar_dia(
  p_ubicacion_id bigint,
  p_contado      int,
  p_notas        text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esperado int;
  v_id       bigint;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion para cerrar el dia.';
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'La cantidad contada no puede ser negativa.';
  end if;

  select coalesce(sum(cantidad), 0) into v_esperado
    from existencias where ubicacion_id = p_ubicacion_id;

  insert into conteos (tipo, ubicacion_id, usuario_id, cantidad_esperada, cantidad_contada, notas)
  values ('diario', p_ubicacion_id, auth.uid(), v_esperado, p_contado, p_notas)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. EXISTENCIA POR UBICACION, SIN COSTOS
-- Es la fuente de la cuadricula de venta y del conteo semanal.
-- La vendedora no puede leer `modelos`, asi que entra por aqui.
-- ---------------------------------------------------------------------

create or replace view v_venta_ubicacion
with (security_invoker = off) as
select
  e.ubicacion_id,
  c.id as modelo_id,
  c.sku,
  c.nombre,
  c.categoria,
  c.variantes_nota,
  c.foto_thumb_path,
  c.foto_path,
  c.grupo,
  c.precio_usd,
  c.precio_bs,
  e.cantidad
from existencias e
join v_catalogo_venta c on c.id = e.modelo_id;

grant select on v_venta_ubicacion to authenticated;

-- ---------------------------------------------------------------------
-- 7. CONTEO SEMANAL DETALLADO
-- Pieza por pieza, modelo por modelo, con ajuste de existencias y
-- registro de la diferencia. Lo contado pasa a ser la verdad.
-- ---------------------------------------------------------------------

create or replace function registrar_conteo_semanal(
  p_ubicacion_id bigint,
  p_detalle      jsonb,
  p_notas        text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conteo_id bigint;
  v_fila      jsonb;
  v_modelo    bigint;
  v_contada   int;
  v_esperada  int;
  v_tot_esp   int := 0;
  v_tot_cont  int := 0;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion para registrar un conteo.';
  end if;
  if p_detalle is null or jsonb_array_length(p_detalle) = 0 then
    raise exception 'El conteo no tiene ninguna linea.';
  end if;

  insert into conteos (tipo, ubicacion_id, usuario_id, cantidad_esperada, cantidad_contada, notas)
  values ('semanal', p_ubicacion_id, auth.uid(), 0, 0, p_notas)
  returning id into v_conteo_id;

  for v_fila in select * from jsonb_array_elements(p_detalle)
  loop
    v_modelo  := (v_fila->>'modelo_id')::bigint;
    v_contada := greatest((v_fila->>'cantidad_contada')::int, 0);

    select coalesce(cantidad, 0) into v_esperada
      from existencias
     where modelo_id = v_modelo and ubicacion_id = p_ubicacion_id
     for update;
    v_esperada := coalesce(v_esperada, 0);

    insert into conteo_detalle (conteo_id, modelo_id, cantidad_esperada, cantidad_contada)
    values (v_conteo_id, v_modelo, v_esperada, v_contada);

    -- Lo contado manda: se ajusta la existencia a la realidad fisica.
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_modelo, p_ubicacion_id, v_contada)
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = excluded.cantidad, actualizado_en = now();

    v_tot_esp  := v_tot_esp + v_esperada;
    v_tot_cont := v_tot_cont + v_contada;
  end loop;

  update conteos
     set cantidad_esperada = v_tot_esp,
         cantidad_contada  = v_tot_cont
   where id = v_conteo_id;

  return v_conteo_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. REPORTES DEL ADMINISTRADOR
-- La ganancia se mide SIEMPRE en dolares, con la tasa que se congelo al
-- vender. Si el reporte de enero cambia porque hoy movieron la tasa, el
-- sistema esta mintiendo.
-- Las tres vistas filtran con es_admin(): la vendedora no ve ganancias.
-- ---------------------------------------------------------------------

create or replace view v_ventas_por_dia
with (security_invoker = off) as
select
  v.fecha::date                                as dia,
  count(*)                                     as ventas,
  coalesce(sum(m.piezas), 0)                   as piezas,
  coalesce(sum(v.total_bs), 0)                 as total_bs,
  coalesce(sum(v.total_usd), 0)                as total_usd,
  coalesce(sum(m.costo_usd), 0)                as costo_usd,
  coalesce(sum(v.total_usd - m.costo_usd), 0)  as ganancia_usd
from ventas v
left join lateral (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum(i.costo_puesto_usd_snap * i.cantidad), 0) as costo_usd
  from venta_items i where i.venta_id = v.id
) m on true
where not v.anulada
  and es_admin()
group by v.fecha::date;

create or replace view v_mezcla_grupo
with (security_invoker = off) as
select
  coalesce(g.nombre, 'Sin grupo')                                        as grupo,
  coalesce(g.orden, 999)                                                 as orden,
  sum(i.cantidad)                                                        as piezas,
  sum(i.precio_unitario_usd * i.cantidad)                                as ingreso_usd,
  sum((i.precio_unitario_usd - i.costo_puesto_usd_snap) * i.cantidad)    as ganancia_usd
from venta_items i
join ventas v  on v.id = i.venta_id and not v.anulada
join modelos mo on mo.id = i.modelo_id
left join grupos_precio g on g.id = mo.grupo_precio_id
where es_admin()
group by coalesce(g.nombre, 'Sin grupo'), coalesce(g.orden, 999);

-- Rotacion y modelos dormidos en la misma vista: un modelo dormido es
-- uno con dias_sin_vender alto, o que nunca se ha vendido desde que entro.
create or replace view v_rotacion_modelo
with (security_invoker = off) as
select
  mo.id,
  mo.sku,
  mo.nombre,
  mo.categoria,
  coalesce(g.nombre, 'Sin grupo')                                  as grupo,
  coalesce(x.piezas, 0)                                            as piezas_vendidas,
  x.ultima_venta,
  case when x.ultima_venta is not null
       then (current_date - x.ultima_venta::date) end              as dias_sin_vender,
  (current_date - mo.creado_en::date)                              as dias_en_inventario,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = mo.id), 0) as existencia,
  mo.costo_puesto_usd,
  coalesce(x.ganancia_usd, 0)                                      as ganancia_usd
from modelos mo
left join grupos_precio g on g.id = mo.grupo_precio_id
left join lateral (
  select
    sum(i.cantidad)                                                     as piezas,
    max(v.fecha)                                                        as ultima_venta,
    sum((i.precio_unitario_usd - i.costo_puesto_usd_snap) * i.cantidad) as ganancia_usd
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
  where i.modelo_id = mo.id
) x on true
where mo.activo
  and es_admin();

grant select on v_ventas_por_dia   to authenticated;
grant select on v_mezcla_grupo     to authenticated;
grant select on v_rotacion_modelo  to authenticated;

-- ---------------------------------------------------------------------
-- 9. PERMISOS DE EJECUCION
-- Postgres otorga EXECUTE a PUBLIC por defecto: hay que revocarlo.
-- ---------------------------------------------------------------------

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text)   from public, anon;
revoke all on function registrar_venta_kit(bigint, text, bigint, text, text, text)    from public, anon;
revoke all on function admin_anular_venta(bigint, text)                               from public, anon;
revoke all on function cerrar_dia(bigint, int, text)                                  from public, anon;
revoke all on function registrar_conteo_semanal(bigint, jsonb, text)                  from public, anon;

grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text)  to authenticated;
grant execute on function registrar_venta_kit(bigint, text, bigint, text, text, text)   to authenticated;
grant execute on function admin_anular_venta(bigint, text)                              to authenticated;
grant execute on function cerrar_dia(bigint, int, text)                                 to authenticated;
grant execute on function registrar_conteo_semanal(bigint, jsonb, text)                 to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- 10. VERIFICACION (Fase 2)
--
-- Con sesion de VENDEDORA, todo esto debe dar 0 filas o permiso denegado:
--   select * from v_ventas_por_dia;
--   select * from v_mezcla_grupo;
--   select * from v_rotacion_modelo;
--   select * from venta_items;
--
-- Y esto debe funcionar:
--   select * from v_venta_ubicacion where ubicacion_id = 1 and cantidad > 0;
--   select * from v_tablero_dia;
--   select * from v_cuadre_dia;
--
-- Prueba del minimo de mayoreo (debe FALLAR con 4 piezas por $18):
--   select registrar_venta('mayor', 'efectivo_usd',
--     '[{"modelo_id":1,"ubicacion_id":5,"cantidad":4}]'::jsonb);
--
-- Prueba de existencia insuficiente (debe FALLAR y no dejar rastro):
--   select registrar_venta('detal', 'efectivo_bs',
--     '[{"modelo_id":1,"ubicacion_id":5,"cantidad":9999}]'::jsonb);
-- =====================================================================
