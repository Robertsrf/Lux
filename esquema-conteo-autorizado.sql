-- =====================================================================
-- Lux by Emory — el conteo anota; el inventario lo ajusta el dueño
-- Ejecutar en el SQL Editor DESPUÉS de esquema-precio-esencial.sql (#63)
--
-- QUÉ PASÓ (28/10/2026, lo reportó el dueño)
-- En el conteo semanal, la vendedora (y él) dejaban en 0 las piezas que
-- están en pedidos, apartadas o esperando que se verifique el pago: "ya
-- no son del local". `registrar_conteo` ponía la existencia en lo contado,
-- así que esas piezas desaparecían del inventario, y al ir a entregar el
-- pedido la base decía que no había. Las palabras del dueño: "el conteo
-- debe servir para hacer un chequeo e inventario y ver dónde están las
-- piezas hasta que coincidan con el inventario; no pueden descontar del
-- inventario las piezas a menos que autorice el admin". Y del conteo que
-- ya se hizo: "solo déjalo como conteo, revierte lo que hizo".
--
-- QUÉ HACE
--  1. Cada línea de un conteo dice qué pasó con su diferencia
--     (`conteo_detalle.ajuste`): 'pendiente' (no cuadra y nadie la ha
--     revisado), 'aplicado' (el inventario se ajustó a lo contado),
--     'descartado' (se dejó como estaba) o 'revertido' (se ajustó y después
--     se deshizo). Quién y cuándo, en `ajuste_por` y `ajuste_en`. Las
--     líneas de antes que no cuadraban quedan 'aplicado': eso hizo con ellas
--     la función de antes.
--  2. `registrar_conteo` (misma firma) ya NO escribe el inventario. Guarda
--     lo contado contra lo que había, y lo que no cuadra queda 'pendiente'.
--     Responde lo mismo de antes y, nuevo, `por_revisar`.
--  3. `admin_resolver_conteo(conteo, líneas, aplicar, nota)`: el dueño
--     decide. Aplicar ajusta el inventario por la DIFERENCIA (si después
--     del conteo se vendió una, la cuenta sigue bien), nunca por debajo de
--     cero ni por debajo de lo que tienen apartado los pedidos; esas líneas
--     no se tocan y se dicen. No aplicar la deja como estaba. Sin líneas,
--     todas las pendientes del conteo.
--  4. `admin_deshacer_conteo(conteo, nota)`: devuelve al inventario lo que
--     un conteo ajustó (lo que quitó, se pone; lo que sumó, se quita), por
--     la misma diferencia. Es lo que pidió para el conteo que ya se hizo.
--  5. `v_conteos` y `v_conteo_detalle` ganan, al final, cuántas líneas
--     quedan por revisar y cuántas se ajustaron, y en cada línea su estado,
--     quién la revisó y cuántas piezas apartan hoy los pedidos.
--
-- LAS FIRMAS
-- `registrar_conteo` no cambia. Las dos `admin_*` son nuevas, del dueño
-- (`es_admin()` por dentro). El navegador de antes sigue funcionando: su
-- conteo se guarda igual, solo que ya no toca el inventario.
--
-- Reejecutable.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LO QUE PASÓ CON CADA DIFERENCIA
-- ---------------------------------------------------------------------

alter table conteo_detalle add column if not exists ajuste text;
alter table conteo_detalle add column if not exists ajuste_por uuid references perfiles(id);
alter table conteo_detalle add column if not exists ajuste_en timestamptz;
alter table conteo_detalle add column if not exists ajuste_nota text;

alter table conteo_detalle drop constraint if exists conteo_detalle_ajuste_valido;
alter table conteo_detalle add constraint conteo_detalle_ajuste_valido
  check (ajuste is null or ajuste in ('pendiente', 'aplicado', 'descartado', 'revertido'));

comment on column conteo_detalle.ajuste is
  'Qué pasó con la diferencia: pendiente (por revisar), aplicado (el inventario se ajustó), descartado (se dejó como estaba) o revertido (se ajustó y se deshizo). Null si cuadró.';

-- Las de antes: la función vieja ajustaba siempre. Así se pueden deshacer.
update conteo_detalle
   set ajuste = 'aplicado'
 where ajuste is null
   and cantidad_contada <> cantidad_esperada;


-- ---------------------------------------------------------------------
-- 2. EL CONTEO, SIN TOCAR EL INVENTARIO
-- La de esquema-conteo-y-cotizar.sql, igual en todo menos en una cosa: no
-- escribe `existencias`. Lo que no cuadra queda 'pendiente' para el dueño.
-- Sigue tomando el candado de cada pieza y devolviendo las que se movieron
-- mientras se contaba: sin una foto fija, la diferencia no dice nada.
-- ---------------------------------------------------------------------

create or replace function registrar_conteo(
  p_ubicacion_id bigint,
  p_detalle      jsonb,
  p_notas        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_fila      jsonb;
  v_modelo    bigint;
  v_contada   int;
  v_vista     int;
  v_ahora     int;
  v_nombre    text;
  v_conteo_id bigint;
  v_cambiaron jsonb := '[]'::jsonb;
  v_aplicadas int := 0;
  v_distintas int := 0;
  v_tot_esp   int := 0;
  v_tot_cont  int := 0;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion para registrar un conteo.';
  end if;
  if not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Tu usuario no tiene un perfil activo.';
  end if;
  if not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa ubicación no existe o está desactivada.';
  end if;
  if p_detalle is null or jsonb_typeof(p_detalle) <> 'array' or jsonb_array_length(p_detalle) = 0 then
    raise exception 'El conteo no tiene ninguna pieza contada.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_detalle) x
     group by x->>'modelo_id' having count(*) > 1
  ) then
    raise exception 'Una pieza viene dos veces en el conteo.';
  end if;

  -- Los candados, en orden, antes de mirar nada.
  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_detalle) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  insert into conteos (tipo, ubicacion_id, usuario_id, cantidad_esperada, cantidad_contada, notas)
  values ('semanal', p_ubicacion_id, auth.uid(), 0, 0, nullif(btrim(coalesce(p_notas, '')), ''))
  returning id into v_conteo_id;

  for v_fila in select * from jsonb_array_elements(p_detalle)
  loop
    v_modelo  := (v_fila->>'modelo_id')::bigint;
    v_contada := (v_fila->>'contada')::int;
    v_vista   := (v_fila->>'vista')::int;

    if v_contada is null or v_contada < 0 then
      raise exception 'Cada pieza contada tiene que ser un número desde cero.';
    end if;
    if v_vista is null or v_vista < 0 then
      raise exception 'Falta lo que la pantalla vio al empezar. Recarga la página y vuelve a contar.';
    end if;

    select m.nombre || coalesce(' · ' || m.variante, '') into v_nombre
      from modelos m where m.id = v_modelo;
    if not found then
      raise exception 'Una de las piezas del conteo ya no existe.';
    end if;

    select e.cantidad into v_ahora
      from existencias e
     where e.modelo_id = v_modelo and e.ubicacion_id = p_ubicacion_id;
    v_ahora := coalesce(v_ahora, 0);

    -- Se movió mientras contaba: no se adivina, se devuelve.
    if v_ahora <> v_vista then
      v_cambiaron := v_cambiaron || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_modelo, 'nombre', v_nombre, 'vista', v_vista, 'ahora', v_ahora,
        'contada', v_contada));
      continue;
    end if;

    -- Se anota. El inventario no se toca: si no cuadra, lo revisa el dueño.
    insert into conteo_detalle (conteo_id, modelo_id, cantidad_esperada, cantidad_contada, ajuste)
    values (v_conteo_id, v_modelo, v_ahora, v_contada,
            case when v_contada <> v_ahora then 'pendiente' end);

    if v_contada <> v_ahora then
      v_distintas := v_distintas + 1;
    end if;

    v_aplicadas := v_aplicadas + 1;
    v_tot_esp   := v_tot_esp + v_ahora;
    v_tot_cont  := v_tot_cont + v_contada;
  end loop;

  if v_aplicadas = 0 then
    -- Todo cambió mientras contaba: no queda un conteo vacío en el
    -- historial. (Las filas de `conteos` no tienen candado de borrado.)
    delete from conteos where id = v_conteo_id;
    v_conteo_id := null;
  else
    update conteos
       set cantidad_esperada = v_tot_esp,
           cantidad_contada  = v_tot_cont
     where id = v_conteo_id;
  end if;

  return jsonb_build_object(
    'conteo_id',      v_conteo_id,
    'aplicadas',      v_aplicadas,
    'con_diferencia', v_distintas,
    'esperadas',      v_tot_esp,
    'contadas',       v_tot_cont,
    'cambiaron',      v_cambiaron,
    -- Nueva: lo que no cuadró y espera al dueño. El inventario no cambió.
    'por_revisar',    v_distintas);
end;
$fn$;

revoke all on function registrar_conteo(bigint, jsonb, text) from public, anon;
grant execute on function registrar_conteo(bigint, jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. EL DUEÑO DECIDE QUÉ SE AJUSTA
--
-- Aplicar suma al inventario la diferencia (contada − esperada), no pone
-- la cifra contada: si después del conteo se vendió una pieza, poner la
-- cifra devolvería esa venta al inventario. No deja la existencia por
-- debajo de cero ni el total de la pieza por debajo de lo que apartan los
-- pedidos (esas piezas existen: están en un pedido). Esas líneas quedan
-- pendientes y vuelven dichas.
-- ---------------------------------------------------------------------

create or replace function admin_resolver_conteo(
  p_conteo_id bigint,
  p_lineas    bigint[] default null,   -- null: todas las pendientes del conteo
  p_aplicar   boolean  default true,
  p_nota      text     default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conteo     conteos%rowtype;
  v_linea      record;
  v_delta      int;
  v_ahora      int;
  v_total      int;
  v_apartadas  int;
  v_aplicadas  int := 0;
  v_dejadas    int := 0;
  v_rechazadas jsonb := '[]'::jsonb;
  v_nota       text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede ajustar el inventario.';
  end if;

  select * into v_conteo from conteos where id = p_conteo_id;
  if not found then
    raise exception 'Ese conteo no existe.';
  end if;

  for v_linea in
    select d.id, d.modelo_id, d.cantidad_esperada, d.cantidad_contada,
           m.nombre || coalesce(' · ' || m.variante, '') as nombre
      from conteo_detalle d
      join modelos m on m.id = d.modelo_id
     where d.conteo_id = p_conteo_id
       and d.ajuste = 'pendiente'
       and (p_lineas is null or d.id = any(p_lineas))
     order by d.modelo_id
  loop
    if not p_aplicar then
      update conteo_detalle
         set ajuste = 'descartado', ajuste_por = auth.uid(), ajuste_en = now(), ajuste_nota = v_nota
       where id = v_linea.id;
      v_dejadas := v_dejadas + 1;
      continue;
    end if;

    -- El mismo candado que la venta: no se cruzan.
    perform pg_advisory_xact_lock(v_linea.modelo_id);
    v_delta := v_linea.cantidad_contada - v_linea.cantidad_esperada;

    select e.cantidad into v_ahora
      from existencias e
     where e.modelo_id = v_linea.modelo_id and e.ubicacion_id = v_conteo.ubicacion_id
     for update;
    v_ahora := coalesce(v_ahora, 0);

    select coalesce(sum(e.cantidad), 0) into v_total
      from existencias e where e.modelo_id = v_linea.modelo_id;
    v_apartadas := coalesce(apartadas_de(v_linea.modelo_id), 0);

    if v_ahora + v_delta < 0 then
      v_rechazadas := v_rechazadas || jsonb_build_array(jsonb_build_object(
        'id', v_linea.id, 'nombre', v_linea.nombre,
        'motivo', format('Hoy hay %s y faltaron %s: se vendió o se movió después del conteo. Cuéntala otra vez.', v_ahora, -v_delta)));
      continue;
    end if;
    if v_delta < 0 and v_total + v_delta < v_apartadas then
      v_rechazadas := v_rechazadas || jsonb_build_array(jsonb_build_object(
        'id', v_linea.id, 'nombre', v_linea.nombre,
        'motivo', format('%s están apartadas por pedidos: búscalas antes de ajustar, o entrega o cancela el pedido.', v_apartadas)));
      continue;
    end if;

    begin
      insert into existencias (modelo_id, ubicacion_id, cantidad)
      values (v_linea.modelo_id, v_conteo.ubicacion_id, v_ahora + v_delta)
      on conflict (modelo_id, ubicacion_id)
      do update set cantidad = excluded.cantidad, actualizado_en = now();
    exception when others then
      -- Por ejemplo, una pieza que pasó a un lote en camino: no lleva existencia.
      v_rechazadas := v_rechazadas || jsonb_build_array(jsonb_build_object(
        'id', v_linea.id, 'nombre', v_linea.nombre, 'motivo', sqlerrm));
      continue;
    end;

    update conteo_detalle
       set ajuste = 'aplicado', ajuste_por = auth.uid(), ajuste_en = now(), ajuste_nota = v_nota
     where id = v_linea.id;
    v_aplicadas := v_aplicadas + 1;
  end loop;

  return jsonb_build_object(
    'aplicadas',  v_aplicadas,
    'dejadas',    v_dejadas,
    'rechazadas', v_rechazadas);
end;
$fn$;

revoke all on function admin_resolver_conteo(bigint, bigint[], boolean, text) from public, anon;
grant execute on function admin_resolver_conteo(bigint, bigint[], boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. DESHACER LO QUE UN CONTEO AJUSTÓ
--
-- Las líneas 'aplicado' de un conteo vuelven atrás por su misma diferencia:
-- lo que quitó, se pone; lo que sumó, se quita. Por la diferencia y no
-- poniendo la cifra de antes: lo vendido después del conteo sigue vendido.
-- Si quitar dejaría menos de cero (lo que sumó ya se vendió), esa línea no
-- se toca y se dice. El conteo se queda en el historial, como lo que se
-- contó.
-- ---------------------------------------------------------------------

create or replace function admin_deshacer_conteo(
  p_conteo_id bigint,
  p_nota      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conteo     conteos%rowtype;
  v_linea      record;
  v_delta      int;
  v_ahora      int;
  v_devueltas  int := 0;
  v_piezas     int := 0;
  v_rechazadas jsonb := '[]'::jsonb;
  v_nota       text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede deshacer un conteo.';
  end if;

  select * into v_conteo from conteos where id = p_conteo_id;
  if not found then
    raise exception 'Ese conteo no existe.';
  end if;

  for v_linea in
    select d.id, d.modelo_id, d.cantidad_esperada, d.cantidad_contada,
           m.nombre || coalesce(' · ' || m.variante, '') as nombre
      from conteo_detalle d
      join modelos m on m.id = d.modelo_id
     where d.conteo_id = p_conteo_id
       and d.ajuste = 'aplicado'
     order by d.modelo_id
  loop
    perform pg_advisory_xact_lock(v_linea.modelo_id);
    -- Lo contrario de lo que se ajustó.
    v_delta := v_linea.cantidad_esperada - v_linea.cantidad_contada;

    select e.cantidad into v_ahora
      from existencias e
     where e.modelo_id = v_linea.modelo_id and e.ubicacion_id = v_conteo.ubicacion_id
     for update;
    v_ahora := coalesce(v_ahora, 0);

    if v_ahora + v_delta < 0 then
      v_rechazadas := v_rechazadas || jsonb_build_array(jsonb_build_object(
        'id', v_linea.id, 'nombre', v_linea.nombre,
        'motivo', format('El conteo sumó %s y hoy hay %s: ya se vendieron. Esa no se deshace.', -v_delta, v_ahora)));
      continue;
    end if;

    begin
      insert into existencias (modelo_id, ubicacion_id, cantidad)
      values (v_linea.modelo_id, v_conteo.ubicacion_id, v_ahora + v_delta)
      on conflict (modelo_id, ubicacion_id)
      do update set cantidad = excluded.cantidad, actualizado_en = now();
    exception when others then
      v_rechazadas := v_rechazadas || jsonb_build_array(jsonb_build_object(
        'id', v_linea.id, 'nombre', v_linea.nombre, 'motivo', sqlerrm));
      continue;
    end;

    update conteo_detalle
       set ajuste = 'revertido', ajuste_por = auth.uid(), ajuste_en = now(), ajuste_nota = v_nota
     where id = v_linea.id;
    v_devueltas := v_devueltas + 1;
    v_piezas := v_piezas + v_delta;
  end loop;

  return jsonb_build_object(
    'deshechas',  v_devueltas,
    'piezas',     v_piezas,
    'rechazadas', v_rechazadas);
end;
$fn$;

revoke all on function admin_deshacer_conteo(bigint, text) from public, anon;
grant execute on function admin_deshacer_conteo(bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5. LO QUE VE LA PANTALLA
-- Las de esquema-conteo-y-cotizar.sql, mismas columnas en el mismo orden,
-- y lo nuevo al final.
-- ---------------------------------------------------------------------

create or replace view v_conteos
with (security_invoker = off) as
select
  c.id,
  c.fecha,
  c.creado_en,
  c.tipo,
  c.ubicacion_id,
  u.nombre                                      as ubicacion,
  p.nombre                                      as quien,
  c.cantidad_esperada,
  c.cantidad_contada,
  c.diferencia,
  (select count(*) from conteo_detalle d where d.conteo_id = c.id)::int as lineas,
  (select count(*) from conteo_detalle d
    where d.conteo_id = c.id and d.cantidad_contada <> d.cantidad_esperada)::int as lineas_distintas,
  (select coalesce(sum(d.cantidad_esperada - d.cantidad_contada), 0) from conteo_detalle d
    where d.conteo_id = c.id and d.cantidad_contada < d.cantidad_esperada)::int as piezas_faltaron,
  (select coalesce(sum(d.cantidad_contada - d.cantidad_esperada), 0) from conteo_detalle d
    where d.conteo_id = c.id and d.cantidad_contada > d.cantidad_esperada)::int as piezas_sobraron,
  c.notas,
  -- Nuevas: lo que espera al dueño y lo que ya se ajustó en el inventario.
  (select count(*) from conteo_detalle d where d.conteo_id = c.id and d.ajuste = 'pendiente')::int as lineas_por_revisar,
  (select count(*) from conteo_detalle d where d.conteo_id = c.id and d.ajuste = 'aplicado')::int  as lineas_ajustadas
from conteos c
left join ubicaciones u on u.id = c.ubicacion_id
left join perfiles p on p.id = c.usuario_id
where c.tipo = 'semanal'
  and auth.uid() is not null;

revoke all on v_conteos from anon;
grant select on v_conteos to authenticated;

create or replace view v_conteo_detalle
with (security_invoker = off) as
select
  d.conteo_id,
  d.modelo_id,
  m.sku,
  m.nombre,
  m.variante,
  d.cantidad_esperada,
  d.cantidad_contada,
  d.cantidad_contada - d.cantidad_esperada as diferencia,
  -- Nuevas: la línea, qué pasó con su diferencia, quién y cuándo, y cuántas
  -- apartan hoy los pedidos (para buscarlas antes de ajustar).
  d.id                                    as detalle_id,
  d.ajuste,
  pa.nombre                               as ajuste_quien,
  d.ajuste_en,
  d.ajuste_nota,
  apartadas_de(d.modelo_id)               as apartadas
from conteo_detalle d
join modelos m on m.id = d.modelo_id
left join perfiles pa on pa.id = d.ajuste_por
where auth.uid() is not null;

revoke all on v_conteo_detalle from anon;
grant select on v_conteo_detalle to authenticated;


-- =====================================================================
-- CÓMO COMPROBARLO, DESPUÉS DE CORRERLO
-- 1. Los conteos que ajustaron el inventario (los de antes):
--      select c.id, c.creado_en, u.nombre as ubicacion,
--             count(*) filter (where d.ajuste = 'aplicado') as lineas_ajustadas,
--             sum(d.cantidad_esperada - d.cantidad_contada) filter (where d.ajuste = 'aplicado') as piezas_que_quito
--        from conteos c join conteo_detalle d on d.conteo_id = c.id
--        left join ubicaciones u on u.id = c.ubicacion_id
--       group by c.id, c.creado_en, u.nombre having count(*) filter (where d.ajuste = 'aplicado') > 0
--       order by c.creado_en desc;
-- 2. Deshacer uno se hace desde la pantalla Conteo (con la sesión del
--    dueño): en "Conteos anteriores", "Deshacer el ajuste". En el SQL
--    Editor no hay sesión y la función dice "Solo un administrador".
-- 3. Un conteo nuevo con una pieza en 0 que tenía 2: el inventario sigue
--    en 2, y la línea dice "Por revisar" hasta que el dueño decida.
-- =====================================================================
