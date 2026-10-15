-- =====================================================================
-- Lux by Emory — el conteo que no borra lo apartado, y el total del
-- catálogo que dice lo mismo que el pedido
-- Ejecutar en el SQL Editor DESPUÉS de esquema-fuera-de-catalogo.sql
-- Se puede volver a correr entero.
--
-- LO QUE ESTABA MAL (auditoría del 14/10/2026)
--
-- 1. EL CONTEO SEMANAL BORRABA LAS PIEZAS APARTADAS.
--    La pantalla leía `v_venta_ubicacion.cantidad`, que desde
--    esquema-apartadas-en-mostrador.sql es lo LIBRE, no lo que hay. Con 5
--    cadenas en la bodega y 2 apartadas por un pedido, decía "el sistema
--    espera 3"; al guardar sin tocar esa fila, `registrar_conteo_semanal`
--    dejaba la existencia en 3 y las 2 del pedido desaparecían. Probado en
--    una base de prueba: 7 piezas antes, 5 después, sin cambiar un número.
--    Y cada semana otra vez.
--
--    Además mandaba TODAS las filas, contadas o no: una fila que ella no
--    llegó a contar "confirmaba" lo que decía el sistema. Y si mientras
--    contaba se vendía una pieza, el conteo la devolvía al inventario.
--
-- 2. EL TOTAL DEL CATÁLOGO NO ERA EL DEL PEDIDO.
--    El carrito público calculaba subtotal × (1 − tramo). El pedido
--    (`crear_reserva`) cobra pieza por pieza con `precio_de_linea`, que
--    nunca baja del piso de margen. Cuando el piso manda, la clienta veía
--    un total y el pedido le congelaba otro, más alto. Probado: 4 cadenas
--    y 2 anillos, $96,90 en el carrito y $100,90 en el pedido.
--
-- 3. CUALQUIER SESIÓN PODÍA REESCRIBIR EL INVENTARIO DESDE LA CONSOLA.
--    `existencias`, `conteos` y `conteo_detalle` aceptaban insert y update
--    directos de cualquier sesión. Ninguna pantalla los usa: toda escritura
--    pasa por funciones de definidor (comprobado una por una). Se cierran.
--
-- LO QUE TRAE
--   - `registrar_conteo`: el conteo nuevo. Recibe solo lo contado, cada
--     fila con lo que la pantalla vio al empezar (`vista`). Si al guardar
--     la existencia ya no es esa (se vendió o se movió algo mientras
--     contaba), esa fila NO se toca: vuelve en la respuesta para contarla
--     otra vez. Lo contado manda sobre lo FÍSICO; lo apartado sigue
--     siendo del pedido.
--   - `registrar_conteo_semanal` (la de siempre) ya no escribe: rechaza
--     con un aviso de recargar la página. Misma firma, para que el
--     navegador viejo reciba un mensaje y no un error de PostgREST.
--   - `v_conteos` y `v_conteo_detalle`: los conteos anteriores, con quién
--     contó y qué no cuadró. Sin un solo costo: piezas y nombres.
--   - `cotizar_pedido`: el total del carrito público con la misma regla
--     que `crear_reserva`. Sin sesión, como el catálogo.
--   - `admin_desactivar_modelo` (misma firma) ya no retira una pieza que
--     un pedido tiene apartada: el pedido quedaba apartando algo que nadie
--     veía.
--   - Sin escritura directa a `existencias`, `conteos` y `conteo_detalle`.
--
-- FIRMAS: ninguna cambia. Las dos funciones nuevas tienen nombre nuevo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL CONTEO NUEVO
--
-- p_detalle: [{ "modelo_id": 12, "contada": 5, "vista": 5 }, ...]
--   contada  lo que ella contó, entero desde cero.
--   vista    la existencia FÍSICA de esa pieza en esa ubicación cuando la
--            pantalla cargó el conteo. Es la foto contra la que se contó.
--
-- Por qué `vista` y no "lo que hay ahora": un conteo dura minutos y la
-- tienda sigue vendiendo. Si se vendió una pieza mientras contaba, no se
-- sabe si la contó antes o después de la venta; las dos respuestas
-- automáticas se equivocan en uno de los dos casos. Lo honesto es no
-- adivinar: esa fila se devuelve y se cuenta otra vez, ya con la cifra
-- nueva. Son pocas, y las demás se guardan.
--
-- Toma el mismo candado por pieza que `registrar_venta`, `crear_reserva`
-- y `apartar_en_tienda`: una venta y un conteo de la misma pieza no se
-- cruzan.
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
     where e.modelo_id = v_modelo and e.ubicacion_id = p_ubicacion_id
     for update;
    v_ahora := coalesce(v_ahora, 0);

    -- Se movió mientras contaba: no se adivina, se devuelve.
    if v_ahora <> v_vista then
      v_cambiaron := v_cambiaron || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_modelo, 'nombre', v_nombre, 'vista', v_vista, 'ahora', v_ahora,
        'contada', v_contada));
      continue;
    end if;

    insert into conteo_detalle (conteo_id, modelo_id, cantidad_esperada, cantidad_contada)
    values (v_conteo_id, v_modelo, v_ahora, v_contada);

    if v_contada <> v_ahora then
      insert into existencias (modelo_id, ubicacion_id, cantidad)
      values (v_modelo, p_ubicacion_id, v_contada)
      on conflict (modelo_id, ubicacion_id)
      do update set cantidad = excluded.cantidad, actualizado_en = now();
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
    'cambiaron',      v_cambiaron);
end;
$fn$;

revoke all on function registrar_conteo(bigint, jsonb, text) from public, anon;
grant execute on function registrar_conteo(bigint, jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. LA DE SIEMPRE YA NO ESCRIBE
--
-- La llama solo la pantalla vieja, la que lee lo libre como si fuera lo
-- que hay. Rechazar es mejor que dejarla borrar piezas apartadas durante
-- los minutos que tarda en publicarse la pantalla nueva: el conteo es una
-- vez por semana y puede esperar a que ella recargue. Misma firma.
-- ---------------------------------------------------------------------

create or replace function registrar_conteo_semanal(
  p_ubicacion_id bigint,
  p_detalle      jsonb,
  p_notas        text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Se ignoran los tres parámetros: siguen aquí para que el navegador viejo
  -- encuentre la función y reciba este mensaje (regla 3 de CLAUDE.md).
  raise exception 'Esta pantalla de conteo quedó vieja y podía borrar piezas apartadas. Recarga la página y vuelve a contar: lo que ya contaste no se guardó.';
end;
$fn$;

revoke all on function registrar_conteo_semanal(bigint, jsonb, text) from public, anon;
grant execute on function registrar_conteo_semanal(bigint, jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. LOS CONTEOS ANTERIORES
--
-- Para la pantalla de Conteo, de las dos caras: cuándo se contó cada
-- ubicación, quién, cuántas piezas y qué no cuadró. Solo piezas y
-- nombres; ningún costo. `perfiles` solo deja ver el propio a la
-- vendedora: la vista presta el nombre y nada más, como `v_tasas`.
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
  c.notas
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
  d.cantidad_contada - d.cantidad_esperada as diferencia
from conteo_detalle d
join modelos m on m.id = d.modelo_id
where auth.uid() is not null;

revoke all on v_conteo_detalle from anon;
grant select on v_conteo_detalle to authenticated;


-- ---------------------------------------------------------------------
-- 4. EL TOTAL DEL CATÁLOGO, CON LA REGLA DEL PEDIDO
--
-- p_items: [{ "modelo_id": 12, "cantidad": 2 }, ...], lo mismo que recibe
-- `crear_reserva`. Devuelve lo que el pedido congelaría si se apartara
-- ahora: el tramo por el total de piezas, y cada pieza con
-- `precio_de_linea`, que nunca baja del piso de margen. Una regla, un
-- sitio: esto no la copia, la llama.
--
-- LO QUE ENSEÑA, Y SU TOPE (revisión de seguridad del 14/10/2026).
-- Cuando el piso de margen manda, el precio de esa línea ES el piso, y
-- con el margen mínimo el piso despeja el costo. Eso no es nuevo: a quien
-- aparta 20 piezas, `ver_reserva` le enseña el precio de cada una. Pero
-- sin un tope, cualquiera podría pedir "20 de una pieza que tiene 1" sin
-- sesión y sin dejar rastro, y sacar el piso de todo el catálogo. Por eso
-- la cotización exige lo mismo que un pedido de verdad: no más piezas de
-- las que hay libres, sumadas por pieza. No enseña nada que no enseñe un
-- pedido que se podría apartar.
--
-- Una pieza retirada o sin precio no tumba la cotización: sale en
-- `sin_precio` y no suma.
-- ---------------------------------------------------------------------

create or replace function cotizar_pedido(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_item      jsonb;
  v_modelo    bigint;
  v_cantidad  int;
  v_piezas    int := 0;
  v_desc      numeric(5,2);
  v_subtotal  numeric := 0;
  v_total     numeric := 0;
  v_lineas    jsonb := '[]'::jsonb;
  v_sin       jsonb := '[]'::jsonb;
  p           record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('piezas', 0, 'descuento_pct', 0, 'subtotal_usd', 0,
                              'total_usd', 0, 'lineas', '[]'::jsonb, 'sin_precio', '[]'::jsonb);
  end if;
  -- Un tope técnico, no de negocio: que nadie la use para recorrer el
  -- catálogo entero de un golpe.
  if jsonb_array_length(p_items) > 300 then
    raise exception 'Demasiadas piezas distintas en un solo pedido.';
  end if;

  select coalesce(sum(greatest(coalesce((x->>'cantidad')::int, 0), 0)), 0)
    into v_piezas
    from jsonb_array_elements(p_items) x;
  v_desc := coalesce(descuento_para(v_piezas), 0);

  -- El tope: lo mismo que pediría `crear_reserva`, sumado por pieza (una
  -- pieza repetida en la lista no se cuela dos veces).
  if exists (
    select 1
      from (select (x->>'modelo_id')::bigint as modelo, sum(greatest(coalesce((x->>'cantidad')::int, 0), 0)) as pide
              from jsonb_array_elements(p_items) x
             group by 1) q
     where q.pide > coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = q.modelo), 0)
                    - apartadas_de(q.modelo)
  ) then
    raise exception 'Una de las piezas ya no tiene esa cantidad disponible.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 0);
    continue when v_modelo is null or v_cantidad <= 0;

    begin
      select * into p from precio_de_linea(v_modelo, null, v_desc, null);
    exception when others then
      v_sin := v_sin || to_jsonb(v_modelo);
      continue;
    end;

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'modelo_id', v_modelo, 'cantidad', v_cantidad,
      'precio_usd', p.precio_usd, 'precio_lista_usd', p.precio_lista,
      'motivo', p.motivo));
    v_subtotal := v_subtotal + p.precio_lista * v_cantidad;
    v_total    := v_total + p.precio_usd * v_cantidad;
  end loop;

  return jsonb_build_object(
    'piezas',        v_piezas,
    'descuento_pct', v_desc,
    'subtotal_usd',  round(v_subtotal, 4),
    'total_usd',     round(v_total, 4),
    'lineas',        v_lineas,
    'sin_precio',    v_sin);
end;
$fn$;

revoke all on function cotizar_pedido(jsonb) from public;
grant execute on function cotizar_pedido(jsonb) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. NO SE RETIRA UNA PIEZA QUE UN PEDIDO TIENE APARTADA
--
-- La de esquema-complemento.sql, misma firma, con una guarda: retirar un
-- modelo lo saca de `v_catalogo_venta`, y con él del mostrador, del
-- catálogo y de las vistas que enseñan las líneas de un pedido. Un pedido
-- abierto se quedaba apartando algo que ya nadie veía. Primero se entrega
-- o se cancela el pedido; después se retira.
-- ---------------------------------------------------------------------

create or replace function admin_desactivar_modelo(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_apartadas int;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede retirar modelos.';
  end if;
  v_apartadas := apartadas_de(p_id);
  if v_apartadas > 0 then
    raise exception 'Esta pieza tiene % apartada(s) por pedidos. Entrega o cancela esos pedidos en Pedidos y después retírala.', v_apartadas;
  end if;
  update modelos set activo = false, actualizado_en = now() where id = p_id;
end;
$fn$;

revoke all on function admin_desactivar_modelo(bigint) from public, anon;
grant execute on function admin_desactivar_modelo(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 6. SIN ESCRITURA DIRECTA AL INVENTARIO NI A LOS CONTEOS
--
-- Las funciones que los escriben son todas de definidor y no necesitan
-- estos permisos: admin_guardar_modelo, guardar_variantes_de,
-- registrar_venta, admin_anular_venta, anular_venta_por_verificar,
-- vender_congelado, mover_existencia y registrar_conteo. Leer sí se
-- puede, como antes.
-- ---------------------------------------------------------------------

revoke insert, update, delete, truncate on existencias    from anon, authenticated;
revoke insert, update, delete, truncate on conteos        from anon, authenticated;
revoke insert, update, delete, truncate on conteo_detalle from anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN (con sesión de vendedora, en una ubicación con algo
-- apartado por un pedido):
--
-- 1. Abre Conteo y cuenta esa pieza: la pantalla ya no dice cuánto
--    espera mientras cuentas. Escribe lo que hay de verdad (las del
--    pedido incluidas) y guarda. La existencia queda en lo contado y el
--    pedido sigue con sus piezas.
--
--      select ubicacion_id, cantidad as libre, existencia, apartadas
--        from v_venta_ubicacion where modelo_id = <la pieza>;
--        -> existencia = lo que contaste; apartadas, las mismas de antes.
--
-- 2. Con la pantalla de conteo abierta, vende una pieza de esa ubicación
--    desde otro teléfono y guarda el conteo: esa pieza vuelve para
--    contarla otra vez; las demás se guardan.
--
-- 3. En el catálogo público, arma un pedido que llegue a un tramo con una
--    pieza de margen fino: el total de la barra es el mismo que dice el
--    pedido al apartar.
--
-- 4. En Inventario, "Retirar" una pieza que tiene algo apartado: dice
--    cuántas y que primero se entregue o se cancele el pedido.
--
-- 5. Desde la consola del navegador, con sesión de vendedora:
--      await supabase.from('existencias').update({ cantidad: 99 }).eq('modelo_id', 1)
--    -> "permission denied". Antes cambiaba el inventario.
-- =====================================================================
