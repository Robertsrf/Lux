-- =====================================================================
-- Lux by Emory — los pedidos de antes también reciben abonos
-- Ejecutar en el SQL Editor DESPUÉS de esquema-revendedores-plazos.sql
--
-- QUÉ PASABA
-- Un pedido recibe abonos cuando cada pieza tiene su precio congelado
-- (`reserva_items.precio_usd`), porque la venta nace al entregar con esos
-- precios. Los pedidos que ya estaban abiertos antes del apartado
-- (esquema-abonos-y-apartados.sql) no lo tenían: solo el total, en
-- `reservas.total_usd`. En Pedidos no se les podía cargar un abono, ni la
-- vendedora ni el administrador (lo pidió el dueño el 30/09/2026).
--
-- QUÉ HACE
-- Les congela el precio a esos pedidos, una vez, SIN cambiar el total que
-- se le prometió a la clienta: el total del pedido se reparte entre sus
-- piezas en proporción a la etiqueta de cada una. Así:
--   - lo que suman las piezas es el total de siempre (al diezmilésimo);
--   - la etiqueta de cada línea sale del subtotal que el pedido guardó al
--     crearse, repartido igual, y si el pedido llevaba descuento por
--     cantidad, la línea dice "tramo" (para `v_rebajas`).
-- Desde ahí son pedidos como los nuevos: abonos, "Llegó", "Entregar".
--
-- Solo toca pedidos abiertos (sin venta, sin cerrar, abiertos o
-- confirmados) y solo las líneas que no tienen precio. Correrlo otra vez
-- no cambia nada.
--
-- Firmas de lo que ya existía: las mismas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. CONGELAR EL PRECIO DE UN PEDIDO DE ANTES
-- Por dentro: no la llama ninguna pantalla.
-- ---------------------------------------------------------------------

create or replace function congelar_pedido_de_antes(p_reserva_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r          reservas%rowtype;
  v_etiqueta numeric;
  v_subtotal numeric;
  v_lista    numeric;
  v_sin      text;
begin
  select * into r from reservas where id = p_reserva_id for update;
  if not found or r.venta_id is not null or r.cerrada_en is not null then
    return;
  end if;
  if not exists (select 1 from reserva_items where reserva_id = r.id and precio_usd is null) then
    return;
  end if;

  -- La etiqueta de hoy de cada pieza: solo para repartir el total.
  select sum(coalesce(m.precio_override_usd, g.precio_usd) * ri.cantidad),
         min(case when coalesce(m.precio_override_usd, g.precio_usd) is null then m.nombre end)
    into v_etiqueta, v_sin
    from reserva_items ri
    join modelos m on m.id = ri.modelo_id
    left join grupos_precio g on g.id = m.grupo_precio_id
   where ri.reserva_id = r.id;

  if v_sin is not null or coalesce(v_etiqueta, 0) <= 0 or coalesce(r.total_usd, 0) <= 0 then
    raise exception 'El pedido #% no se puede repartir: "%" no tiene precio.', r.id, coalesce(v_sin, '?');
  end if;

  -- El subtotal que guardó al crearse (lo que valían a la etiqueta de ese
  -- día). Los más viejos no lo tienen: entonces la etiqueta es el total.
  v_subtotal := coalesce(nullif(r.subtotal_usd, 0), r.total_usd);

  update reserva_items ri
     set precio_lista_usd = x.lista,
         precio_usd       = round(x.lista * r.total_usd / v_subtotal, 4),
         motivo_rebaja    = case when coalesce(r.descuento_pct, 0) > 0
                                  and round(x.lista * r.total_usd / v_subtotal, 4) < x.lista
                                 then 'tramo' end
    from (
      select ri2.id,
             round(coalesce(m.precio_override_usd, g.precio_usd) * v_subtotal / v_etiqueta, 4) as lista
        from reserva_items ri2
        join modelos m on m.id = ri2.modelo_id
        left join grupos_precio g on g.id = m.grupo_precio_id
       where ri2.reserva_id = r.id
    ) x
   where ri.id = x.id;
end;
$fn$;

revoke all on function congelar_pedido_de_antes(bigint) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. LOS QUE ESTÁN ABIERTOS HOY
-- Una vez. Si uno no se puede repartir (una pieza sin precio), se avisa y
-- se sigue con los demás: ese se sigue cobrando completo como antes.
-- ---------------------------------------------------------------------

do $bloque$
declare
  v_id bigint;
begin
  for v_id in
    select r.id
      from reservas r
     where r.venta_id is null
       and r.cerrada_en is null
       and r.estado in ('abierta', 'confirmada')
       and exists (select 1 from reserva_items ri where ri.reserva_id = r.id and ri.precio_usd is null)
     order by r.id
  loop
    begin
      perform congelar_pedido_de_antes(v_id);
    exception when others then
      raise notice 'Pedido % sin congelar: %', v_id, sqlerrm;
    end;
  end loop;
end
$bloque$;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN (en el SQL Editor, después de correrlo)
--
-- 1. Ningún pedido abierto se quedó sin precio (tiene que dar 0):
--      select count(*) from reservas r
--       where r.venta_id is null and r.cerrada_en is null
--         and r.estado in ('abierta', 'confirmada')
--         and exists (select 1 from reserva_items ri
--                      where ri.reserva_id = r.id and ri.precio_usd is null);
--
-- 2. Lo que suman sus piezas es su total de siempre (tiene que dar 0 filas):
--      select r.id, r.total_usd, sum(ri.precio_usd * ri.cantidad)
--        from reservas r join reserva_items ri on ri.reserva_id = r.id
--       where r.venta_id is null and r.cerrada_en is null
--       group by r.id, r.total_usd
--      having abs(r.total_usd - sum(ri.precio_usd * ri.cantidad)) > 0.005;
--
-- 3. En Pedidos, un pedido de antes ya dice "Pagó $0,00 de $X BCV" y tiene
--    "Cargar el pago", para ti y para la vendedora.
-- =====================================================================
