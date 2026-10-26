-- =====================================================================
-- Lux by Emory — un catálogo que se entiende y que vende
-- Ejecutar en el SQL Editor DESPUÉS de esquema-dijes.sql (#60)
--
-- QUÉ PIDIÓ EL DUEÑO (24/10/2026)
-- El catálogo no decía dónde está la tienda, su WhatsApp ni a quién se le
-- paga, y cómo pedir se descubría a mitad del camino. El navegador nuevo
-- lo dice (docs/superpowers/specs/2026-10-24-catalogo-claro-design.md);
-- este archivo le da a la base lo que ese navegador necesita, y cierra
-- dos huecos que ya estaban.
--
-- QUÉ HACE
--  1. Tres textos nuevos, vacíos, que el dueño llena en Textos: el enlace
--     de Google Maps, el Instagram y el titular del pago móvil. Y la
--     descripción del WhatsApp dice dónde sale ahora.
--  2. `reglas_pedido()`, sin sesión: el mínimo del apartado, sus días y
--     los minutos que se guardan las piezas. Nada más (`verificar` lo
--     vigila). `configuracion` sigue cerrada a quien no tiene sesión.
--  3. Un tope de pedidos sin pagar por clienta: hasta hoy cualquiera, sin
--     sesión, podía apartar lo libre del catálogo entero haciendo pedidos
--     seguidos con la misma cédula. Un disparador en `reservas` no deja
--     más de `pedidos_sin_pagar_max` (2) pedidos del catálogo esperando el
--     pago con la misma cédula o el mismo teléfono.
--  4. Un pago que no llegó suelta las piezas. Antes, si la clienta
--     reportaba el 40 % y la tienda decía "no llegó", el pedido seguía
--     apartado 15 días: `pedido_al_dia` solo sabía confirmar, nunca
--     deshacerlo. Ahora, si lo pagado sin anular baja del mínimo, el
--     pedido vuelve a "esperando pago" con los minutos de siempre para
--     completarlo; si no paga, vence y las piezas vuelven a la venta.
--     El mínimo con que se confirmó queda congelado en el pedido
--     (`reservas.apartado_pct`): si mañana el dueño sube el 40 % en Costos,
--     los que ya estaban apartados no se sueltan solos al verificarles un
--     pago. Congela al momento del hecho, como los precios.
--     Los que ya quedaron mal (apartados con un pago que no llegó, desde
--     antes de este archivo) se arreglan al correrlo: ver la sección 6.
--  5. Una puerta vieja que se saltaba las dos anteriores: `reportar_pago`,
--     el reporte de antes del apartado, sigue abierta sin sesión y con
--     "efectivo al retirar" (sin referencia) dejaba CUALQUIER pedido
--     confirmado y sin plazo: apartado para siempre sin pagar nada, fuera
--     del tope. Ahora solo atiende a los pedidos de antes (sin precio por
--     pieza), que son para los que se quedó; uno con precio congelado se
--     paga con abonos (`reportar_abono`), como ya lo hace la pantalla.
--
-- LAS FIRMAS
-- Ninguna cambia. `reglas_pedido()` es nueva; `pedido_al_dia` y
-- `reportar_pago` son las mismas funciones con la misma firma. El
-- navegador de hoy funciona igual con y sin este archivo: sin
-- `reglas_pedido()` dice los pasos sin cifras, sin las claves nuevas esas
-- líneas no salen, y `reportar_pago` solo la llama para un pedido sin
-- precio por pieza (`PagoDeAntes`, en Reserva.tsx).
--
-- Reejecutable.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LOS TEXTOS DE LA TIENDA
-- `textos` la lee cualquiera, también sin sesión, a propósito: son los
-- datos que la tienda le quiere dar a la clienta. Vacíos, el catálogo no
-- inventa nada: esa línea no sale.
-- `on conflict do nothing`: correrlo otra vez no pisa lo que el dueño
-- haya escrito.
-- ---------------------------------------------------------------------

insert into textos (clave, valor, descripcion) values
  ('mapa_tienda',        '',
   'Enlace de Google Maps de la tienda: en Maps, "Compartir" y copiar el enlace. Sale en el catálogo como "Cómo llegar". Vacío, el catálogo busca la dirección en Maps.'),
  ('instagram_tienda',   '',
   'Usuario de Instagram de la tienda, sin @ y sin enlace: solo el usuario. Sale en el catálogo.'),
  ('pago_movil_titular', '',
   'Pago móvil: nombre del titular, como lo enseña el banco al transferir. Sale junto a los datos del pago móvil para que la clienta compare antes de pagar.')
on conflict (clave) do nothing;

-- Solo la descripción: el número que el dueño ya escribió no se toca.
insert into textos (clave, valor, descripcion) values
  ('whatsapp_tienda', '',
   'WhatsApp de la tienda, con el código: 0414 1234567. Sale en el catálogo en línea, en la página del pedido (la clienta le manda su pedido a este número) y en la guía de revendedores (aquí llegan las solicitudes).')
on conflict (clave) do update set descripcion = excluded.descripcion;


-- ---------------------------------------------------------------------
-- 2. LAS REGLAS DEL PEDIDO, SIN SESIÓN
-- El catálogo le dice a la clienta, antes de apartar, cuánto paga como
-- mínimo, cuántos días tiene para lo demás y cuánto tiempo se guardan sus
-- piezas mientras paga. Esas cifras viven en `configuracion`, que quien no
-- tiene sesión no lee (y no debe: ahí está el margen mínimo). Esta función
-- da esas tres y ninguna más.
--
-- Sin la cifra, null: el navegador dice los pasos sin cifras. Nunca se
-- inventa una. `reserva_minutos` es la excepción, y no es inventada:
-- `crear_reserva` usa 60 cuando falta, así que 60 es lo que de verdad le
-- pasaría al pedido.
-- ---------------------------------------------------------------------

create or replace function reglas_pedido()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'apartado_inicial_pct', (select valor from configuracion where clave = 'apartado_inicial_pct'),
    'apartado_dias',        (select valor from configuracion where clave = 'apartado_dias'),
    'reserva_minutos',      coalesce((select valor from configuracion where clave = 'reserva_minutos'), 60));
$fn$;

revoke all on function reglas_pedido() from public;
grant execute on function reglas_pedido() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. EL TOPE DE PEDIDOS SIN PAGAR
-- Un pedido del catálogo aparta sus piezas `reserva_minutos` mientras la
-- clienta paga. Sin tope, cualquiera sin sesión podía hacer un pedido
-- tras otro con la misma cédula y dejar el catálogo vacío una hora, cada
-- hora. El tope es por clienta: la misma cédula O el mismo teléfono (con
-- otra cédula inventada sigue siendo ella si deja su número).
--
-- Cuentan los pedidos del catálogo que esperan el pago: abiertos, sin
-- vencer, sin venta y sin cerrar, y los apartados cuyo dinero COMPROBADO
-- no llega al mínimo (un 40 % reportado que nadie ha visto en el banco no
-- saca un pedido de la cuenta). Uno con el mínimo comprobado no cuenta: esa
-- clienta ya puso dinero. Los apartados del mostrador (`origen = 'tienda'`)
-- no cuentan ni se frenan: los hace la tienda, con la clienta delante.
--
-- LO QUE NO FRENA: a quien inventa una cédula y un teléfono distintos en
-- cada pedido. Eso no se distingue de una clienta nueva sin una puerta con
-- servidor; lo que queda es que cada pedido así vence en `reserva_minutos`
-- y que un pago falso, al decir la tienda "no llegó", suelta las piezas.
--
-- POR QUÉ UN DISPARADOR Y NO OTRA VERSIÓN DE `crear_reserva`
-- `crear_reserva` (la de esquema-dijes.sql) son doscientas líneas de
-- precios, tramo, existencias y armados. Copiarlas para añadir diez es
-- como empiezan a derivar dos versiones de la misma regla. El disparador
-- es la regla en un sitio, y cubre también cualquier camino futuro que
-- inserte un pedido del catálogo.
--
-- DOS PEDIDOS A LA VEZ
-- Dos pedidos de la misma clienta en el mismo instante contarían cada uno
-- los que ya hay y entrarían los dos. Por eso, antes de contar, se toma un
-- candado por su cédula y otro por su teléfono (en orden, para que dos
-- pedidos no se esperen el uno al otro). Son candados de dos llaves
-- (`pg_advisory_xact_lock(int, int)`), un espacio aparte del de una llave
-- que usan las piezas (`pg_advisory_xact_lock(modelo_id)`): no se pisan.
-- Se sueltan solos al terminar la transacción, y el segundo pedido cuenta
-- con el primero ya guardado.
--
-- El teléfono se compara por sus diez últimos dígitos: "0414 1234567" y
-- "+58 414 1234567" son el mismo número.
--
-- Los mensajes sin acentos, como los demás de `crear_reserva`.
-- ---------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion) values
  ('pedidos_sin_pagar_max', 2,
   'Cuántos pedidos del catálogo puede tener una misma clienta (por cédula o por teléfono) esperando el pago a la vez. El que pagó el mínimo, venció o se canceló ya no cuenta. 0: sin tope.')
on conflict (clave) do nothing;

create or replace function reserva_tope_sin_pagar()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_max     numeric;
  v_ced     text := regexp_replace(coalesce(new.cliente_cedula, ''), '[^0-9]', '', 'g');
  v_tel     text := right(regexp_replace(coalesce(new.cliente_telefono, ''), '[^0-9]', '', 'g'), 10);
  v_llave   int;
  v_cuantos int;
  v_vence   timestamptz;
  v_min     int;
  v_cuando  text;
begin
  select valor into v_max from configuracion where clave = 'pedidos_sin_pagar_max';
  if coalesce(v_max, 0) < 1 then
    return new;   -- sin la cifra, o en cero: sin tope
  end if;

  -- Una cédula de menos de seis dígitos o un teléfono de menos de diez no
  -- dicen quién es (`crear_reserva` ya los rechaza): no se comparan.
  if length(v_ced) < 6 then v_ced := null; end if;
  if length(v_tel) < 10 then v_tel := null; end if;
  if v_ced is null and v_tel is null then
    return new;
  end if;

  for v_llave in
    select distinct k
      from unnest(array[case when v_ced is not null then hashtext('cedula:' || v_ced) end,
                        case when v_tel is not null then hashtext('telefono:' || v_tel) end]) k
     where k is not null
     order by 1
  loop
    perform pg_advisory_xact_lock(hashtext('pedidos_sin_pagar'), v_llave);
  end loop;

  -- Esperan el pago los abiertos sin vencer y también los apartados cuyo
  -- dinero COMPROBADO no llega al mínimo: si no, reportar un 40 % inventado
  -- en cada pedido los sacaba de la cuenta y el tope no frenaba nada
  -- (revisión del 24/10/2026). El plazo que se dice es el del más próximo.
  select count(*), min(case when r.estado = 'abierta' then r.expira_en else r.vence_apartado_en end)
    into v_cuantos, v_vence
    from reservas r
   where r.origen = 'catalogo'
     and r.venta_id is null
     and r.cerrada_en is null
     and r.pagado_en is null
     and (   (r.estado = 'abierta' and r.expira_en > now())
          or (r.estado = 'confirmada'
              and r.vence_apartado_en > now()
              and coalesce((select sum(a.monto_bcv) from abonos a
                              where a.reserva_id = r.id
                                and a.anulado_en is null
                                and a.verificado_en is not null), 0)
                  < r.total_usd * coalesce(r.apartado_pct, config_requerida('apartado_inicial_pct')) / 100 - 0.005))
     and (   (v_ced is not null
              and regexp_replace(coalesce(r.cliente_cedula, ''), '[^0-9]', '', 'g') = v_ced)
          or (v_tel is not null
              and right(regexp_replace(coalesce(r.cliente_telefono, ''), '[^0-9]', '', 'g'), 10) = v_tel));

  if v_cuantos >= v_max then
    v_min    := greatest(ceil(extract(epoch from (v_vence - now())) / 60), 1)::int;
    v_cuando := case
                  when v_min = 1         then '1 minuto'
                  when v_min <= 90       then v_min || ' minutos'
                  when v_min <= 48 * 60  then round(v_min / 60.0) || ' horas'
                  else round(v_min / 1440.0) || ' dias'
                end;
    if v_cuantos = 1 then
      raise exception 'Ya tienes un pedido esperando el pago. Pagalo desde su enlace o espera a que venza (en %) para hacer otro.',
        v_cuando;
    else
      raise exception 'Ya tienes % pedidos esperando el pago. Paga uno desde su enlace o espera a que venza el primero (en %) para hacer otro.',
        v_cuantos, v_cuando;
    end if;
  end if;

  return new;
end;
$fn$;

-- Un disparador no se llama a mano; aun así, cerrada a todos.
revoke all on function reserva_tope_sin_pagar() from public, anon, authenticated;

-- Ojo: la cláusula WHEN nombra `reservas.origen`. Si algún día se borra
-- esa columna, este disparador se borra antes.
drop trigger if exists reservas_tope_sin_pagar on reservas;
create trigger reservas_tope_sin_pagar
  before insert on reservas
  for each row
  when (new.origen = 'catalogo')
  execute function reserva_tope_sin_pagar();


-- ---------------------------------------------------------------------
-- 4. UN PAGO QUE NO LLEGÓ SUELTA LAS PIEZAS
-- La de esquema-abonos-y-apartados.sql, con la misma firma. Hace lo de
-- siempre (confirmar cuando lo pagado llega al mínimo, y marcar pagado
-- cuando todo está verificado) y dos cosas nuevas:
--
--   a) Al confirmar, congela el % mínimo en `reservas.apartado_pct`.
--   b) Si el pedido está confirmado con su plazo de apartado y lo pagado
--      sin anular ya no llega a ese mínimo (con la tolerancia de siempre,
--      medio centavo), vuelve a "abierta" sin plazo de apartado y con
--      `reserva_minutos` desde ahora para completar el pago: la clienta (o
--      la vendedora, en un apartado del mostrador) carga el pago bueno y se
--      confirma como siempre. Si no, vence como cualquier pedido y sus
--      piezas vuelven a la venta. Antes de la revisión del 24/10/2026 se
--      soltaba con su plazo de siempre, que ya había pasado: moría en el
--      acto y ni se podía cargar el pago corregido.
--      Un pedido de antes del apartado (reportó antes de su primer abono)
--      vuelve a "reportado", como estaba.
--      `pago_reportado_en` se queda: es cuándo reportó, y eso pasó.
--
-- No mira `pagado_en` del pedido tal como estaba al llamarla: si el
-- administrador anula un abono verificado de un pedido pagado, ese
-- `pagado_en` es de antes. Tampoco hace falta: si lo pagado sin anular no
-- llega al 40 %, lo verificado tampoco llega al total, y la última
-- actualización de abajo deja `pagado_en` en null.
--
-- NO SE TOCAN
--   - Los pedidos de antes del apartado (confirmados SIN plazo,
--     `vence_apartado_en` null, fase "reportado"): siguen apartando como
--     siempre. Uno de esos que recibió abonos, llegó al mínimo y después
--     se le anuló uno vuelve a "reportado", como estaba.
--   - Los vencidos, cancelados, cerrados y entregados (como antes).
--
-- QUIÉN LA LLAMA, Y POR QUÉ ES SEGURO PARA CADA UNO
--   - refrescar_padre (la de esquema-revendedores-plazos.sql), después de
--     editar_abono, anular_abono y verificar_abono: es el caso que se
--     arregla. Anular o corregir a la baja puede bajar lo pagado del
--     mínimo; verificar no cambia lo pagado sin anular.
--   - reportar_abono, abonar_pedido y apartar_en_tienda (la de
--     esquema-dijes.sql): suman un abono; lo pagado solo sube.
--     apartar_en_tienda ya exige el mínimo antes de llamarla.
--   - quitar_de_pedido (esquema-devoluciones.sql): baja el total, y con él
--     el mínimo; lo pagado no cambia.
--   - cobrar_pedido (esquema-abonos-y-apartados.sql, la de "Cobrar" del
--     navegador viejo): solo la llama con el pedido pagado entero.
-- Ninguno de esos puede dejar lo pagado bajo el mínimo congelado sin
-- anular o corregir un abono. Y como el mínimo está congelado, un cambio
-- del % en Costos no suelta a nadie al verificarle un pago.
-- ---------------------------------------------------------------------

alter table reservas add column if not exists apartado_pct numeric(5,2);

comment on column reservas.apartado_pct is
  'El % mínimo con que se confirmó el apartado, congelado por pedido_al_dia. Si lo pagado sin anular baja de ahí (un pago que no llegó), el pedido se suelta. Null mientras no está apartado.';

create or replace function pedido_al_dia(p_reserva_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r         reservas%rowtype;
  v_pagado  numeric;
  v_primero timestamptz;
  v_pct     numeric;
  v_minimo  numeric;
begin
  select * into r from reservas where id = p_reserva_id;
  if not found or r.venta_id is not null or r.cerrada_en is not null or r.estado = 'cancelada' then
    return;
  end if;

  select coalesce(sum(monto_bcv), 0), min(fecha)
    into v_pagado, v_primero
    from abonos
   where reserva_id = r.id and anulado_en is null;

  v_pct    := config_requerida('apartado_inicial_pct');
  v_minimo := r.total_usd * v_pct / 100;

  if r.vence_apartado_en is null and v_primero is not null and v_pagado >= v_minimo - 0.005
     and r.estado in ('abierta', 'confirmada') then
    -- Llegó al mínimo: apartado, con su plazo desde el primer pago.
    update reservas
       set estado            = 'confirmada',
           vence_apartado_en = v_primero + make_interval(days => config_requerida('apartado_dias')::int),
           pago_reportado_en = coalesce(pago_reportado_en, now()),
           apartado_pct      = v_pct
     where id = r.id;

  elsif r.estado = 'confirmada' and r.vence_apartado_en is not null
        and v_pagado < r.total_usd * coalesce(r.apartado_pct, v_pct) / 100 - 0.005 then
    if r.pago_reportado_en < (select min(a.fecha) from abonos a where a.reserva_id = r.id) then
      -- Un pedido de antes del apartado: reportó su pago (por el
      -- `reportar_pago` de antes) ANTES de tener un solo abono. En uno nuevo
      -- el primer reporte es el mismo instante que su primer abono (van en
      -- la misma transacción) o después. Vuelve a como estaba, "reportado",
      -- confirmado y sin plazo. No se toca más que eso.
      update reservas
         set vence_apartado_en = null,
             apartado_pct      = null
       where id = r.id;
    else
      -- Lo que lo apartaba no llegó: vuelve a esperar el pago, y con tiempo
      -- para completarlo (los minutos de siempre desde ahora). Sin eso
      -- moría en el acto: un apartado del mostrador nace con su plazo ya
      -- pasado, y un abono corregido a la baja no dejaba ni cargar el bueno
      -- ("ese apartado venció"). Si en ese rato no paga, vence como
      -- cualquier pedido y sus piezas vuelven a la venta.
      update reservas
         set estado            = 'abierta',
             vence_apartado_en = null,
             apartado_pct      = null,
             expira_en         = greatest(expira_en, now() + make_interval(mins =>
                                   coalesce((select valor from configuracion where clave = 'reserva_minutos'), 60)::int))
       where id = r.id;
    end if;
  end if;

  update reservas
     set pagado_en = case
                       when saldo_padre_bcv(null, r.id, null, null, true) < 0.005 then coalesce(pagado_en, now())
                       else null
                     end
   where id = r.id;
end;
$fn$;

revoke all on function pedido_al_dia(bigint) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. EL REPORTE DE ANTES, SOLO PARA LOS PEDIDOS DE ANTES
-- La de esquema-pedido-completo.sql, con la misma firma y el mismo
-- permiso: sigue viva para los pedidos sin precio por pieza (los de antes
-- del apartado que no se pudieron repartir), que se cobran completos.
--
-- El hueco: no miraba qué pedido era. Con el enlace de un pedido nuevo,
-- cualquiera sin sesión la llamaba con "efectivo_bs" (sin referencia ni
-- fecha) y el pedido quedaba "confirmado" sin `vence_apartado_en`: para
-- `apartadas_de` eso es un pedido de antes con el pago reportado, y aparta
-- sin plazo. Dos pedidos así, y otros dos, y otros dos: el tope de la
-- sección 3 no los ve (ya no esperan el pago) y el arreglo de la sección 4
-- tampoco (sin plazo de apartado no se tocan). Probado en PGlite antes de
-- cerrarlo.
--
-- Un pedido con precio congelado se paga con abonos (`reportar_abono`),
-- que exige el monto y suelta las piezas si el pago no llega.
-- ---------------------------------------------------------------------

create or replace function reportar_pago(
  p_token      uuid,
  p_metodo     text,
  p_referencia text default null,
  p_fecha      date default null,
  p_cedula     text default null,
  p_telefono   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r      reservas%rowtype;
  v_metodo metodo_pago;
  v_ref    text := nullif(trim(p_referencia), '');
  v_ced    text := nullif(trim(p_cedula), '');
  v_tel    text := nullif(trim(p_telefono), '');
begin
  perform limpiar_reservas();

  select * into v_r from reservas where token = p_token;
  if not found then
    raise exception 'Esa reserva no existe o el enlace esta mal copiado.';
  end if;

  if v_r.estado = 'cancelada' then
    raise exception 'Esa reserva fue cancelada.';
  end if;
  if v_r.estado = 'vencida' then
    raise exception 'Esa reserva ya vencio. Vuelve al catalogo y aparta de nuevo; no se te cobro nada.';
  end if;

  -- Lo nuevo: un pedido con precio por pieza no pasa por aquí.
  if pedido_con_precio(v_r.id) then
    raise exception 'Ese pedido se paga por partes: actualiza la pagina y reporta tu pago ahi.';
  end if;

  begin
    v_metodo := nullif(trim(p_metodo), '')::metodo_pago;
  exception when others then
    raise exception 'Esa forma de pago no existe.';
  end;
  if v_metodo is null then raise exception 'Dinos como pagaste.'; end if;

  if v_metodo in ('efectivo_bs', 'efectivo_usd') then
    -- Pagar al retirar solo tiene sentido si viene a la tienda.
    if v_r.entrega <> 'tienda' then
      raise exception 'El efectivo es solo para retirar en tienda. Si es envio, paga por movil o transferencia.';
    end if;
  else
    -- Pago móvil y transferencia: los cuatro datos con los que la tienda
    -- comprueba la transferencia en su banco. Sin uno no se comprueba.
    if v_ref is null then raise exception 'Falta el numero de referencia del pago.'; end if;
    if p_fecha is null then raise exception 'Falta la fecha del pago.'; end if;
    if v_ced is null then raise exception 'Falta la cedula de quien transfirio.'; end if;
    if v_tel is null then raise exception 'Falta el telefono de quien transfirio.'; end if;
    if p_fecha > current_date then raise exception 'Esa fecha de pago es de manana. Revisala.'; end if;
    if p_fecha < current_date - 30 then raise exception 'Esa fecha de pago tiene mas de un mes. Revisala.'; end if;
    if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
      raise exception 'Esa cedula esta incompleta.';
    end if;
    if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
      raise exception 'Ese telefono esta incompleto.';
    end if;
  end if;

  -- Reportar el pago confirma el pedido: quien pagó ya dijo que sí, y
  -- pedirle además un botón de "confirmar" es pedirle lo mismo dos veces.
  --
  -- Y deja de correr contra el reloj. Tres días le sobran a la vendedora
  -- para comprobar la referencia en su banco.
  update reservas set
    estado            = 'confirmada',
    pago_metodo       = v_metodo,
    pago_referencia   = v_ref,
    pago_fecha        = p_fecha,
    pago_cedula       = v_ced,
    pago_telefono     = v_tel,
    pago_reportado_en = now(),
    expira_en         = greatest(expira_en, now() + interval '3 days')
  where id = v_r.id;

  return jsonb_build_object('estado', 'confirmada', 'metodo', v_metodo);
end;
$fn$;

revoke all on function reportar_pago(uuid, text, text, date, text, text) from public;
grant execute on function reportar_pago(uuid, text, text, date, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. LOS QUE YA ESTABAN
-- a) Los apartados abiertos de hoy congelan el % de hoy: es el único que
--    se conoce.
-- b) Los que ya quedaron apartados con un pago que no llegó (antes de este
--    archivo, `pedido_al_dia` no los soltaba) se ponen al día con la misma
--    función. Solo los que siguen apartando piezas (plazo sin vencer, sin
--    pagar, sin venta y sin cerrar) y cuyo pago sin anular no llega al
--    mínimo. Correrlo otra vez no encuentra ninguno.
-- ---------------------------------------------------------------------

update reservas
   set apartado_pct = (select valor from configuracion where clave = 'apartado_inicial_pct')
 where estado = 'confirmada'
   and vence_apartado_en is not null
   and apartado_pct is null
   and venta_id is null
   and cerrada_en is null;

do $bloque$
declare
  v_id bigint;
  v_n  int := 0;
begin
  for v_id in
    select r.id
      from reservas r
     where r.estado = 'confirmada'
       and r.vence_apartado_en is not null
       and r.vence_apartado_en > now()
       and r.pagado_en is null
       and r.venta_id is null
       and r.cerrada_en is null
       and coalesce((select sum(a.monto_bcv) from abonos a
                      where a.reserva_id = r.id and a.anulado_en is null), 0)
           < r.total_usd * coalesce(r.apartado_pct,
                                    (select valor from configuracion where clave = 'apartado_inicial_pct')) / 100 - 0.005
     order by r.id
  loop
    perform pedido_al_dia(v_id);
    v_n := v_n + 1;
  end loop;
  raise notice 'Pedidos que soltaron sus piezas porque su pago no llegó: %', v_n;
end
$bloque$;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Las reglas, sin sesión (las tres cifras de Costos):
--      select reglas_pedido();
--    -> {"apartado_dias": 15, "reserva_minutos": 60, "apartado_inicial_pct": 40}
--       (con los decimales de la tabla: 15.0000, 60.0000, 40.0000)
-- 2. Los textos nuevos, vacíos:
--      select clave, valor from textos
--       where clave in ('mapa_tienda', 'instagram_tienda', 'pago_movil_titular');
--    -> tres filas con valor ''.
-- 3. El tope:
--      select valor from configuracion where clave = 'pedidos_sin_pagar_max';  -> 2
--    En el catálogo, con la misma cédula: el primer y el segundo pedido
--    entran; el tercero dice "Ya tienes 2 pedidos esperando el pago...".
-- 4. Ningún apartado vigente bajo su mínimo (debe dar 0 filas):
--      select r.id from reservas r
--       where r.estado = 'confirmada' and r.vence_apartado_en > now()
--         and r.pagado_en is null and r.venta_id is null and r.cerrada_en is null
--         and coalesce((select sum(monto_bcv) from abonos a
--                        where a.reserva_id = r.id and a.anulado_en is null), 0)
--             < r.total_usd * r.apartado_pct / 100 - 0.005;
-- 5. Los que apartan SIN plazo (confirmados sin `vence_apartado_en`). Son
--    los pedidos de antes con el pago reportado y, si alguien usó la
--    puerta de la sección 5 antes de cerrarla, pedidos nuevos apartados
--    sin pagar. Este archivo no los toca (no se distinguen unos de otros):
--    mirarlos en Pedidos y cancelar los que no pagaron.
--      select r.id, r.creado_en, r.cliente_nombre, r.cliente_cedula, r.total_usd,
--             (select coalesce(sum(monto_bcv), 0) from abonos a
--               where a.reserva_id = r.id and a.anulado_en is null) as pagado_bcv
--        from reservas r
--       where r.estado = 'confirmada' and r.vence_apartado_en is null
--         and r.venta_id is null and r.cerrada_en is null
--       order by r.creado_en;
-- =====================================================================
