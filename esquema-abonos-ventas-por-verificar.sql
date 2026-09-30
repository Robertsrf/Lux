-- =====================================================================
-- Lux by Emory — abonos a las ventas por verificar
-- Ejecutar en el SQL Editor DESPUÉS de esquema-abonos-pedidos-de-antes.sql
--
-- QUÉ PASABA
-- Una venta que se cobró con "Dejar por verificar" quedó registrada como
-- pagada completa, esperando que alguien comprobara el pago en el banco.
-- Si en realidad la clienta pagó solo una parte (o va pagando), no había
-- cómo cargarle abonos: `registrar_abono` solo acepta las ventas que
-- nacieron por partes. El dueño pidió (30/09/2026) poder hacerlo, él y la
-- vendedora.
--
-- QUÉ HACE
-- `abonar_venta`: carga un abono a una venta por verificar. Si la venta se
-- había registrado completa, el primer abono la vuelve una venta por
-- partes (`pago_parcial`), en la misma transacción. Desde ahí:
--   - lo que falta sale de `falta_bcv_de`, como en toda venta por partes;
--   - la caja deja de contar el total de la venta y cuenta cada abono el
--     día que llegó (`caja_flujo`): lo que entra es lo que de verdad
--     llegó, no lo que se anotó al cobrar;
--   - "Pago verificado" espera a que no falte nada (`verificar_venta`).
-- Si el abono no vale (pasa del total), no cambia nada: ni el abono ni la
-- marca de por partes.
--
-- Solo las ventas que siguen por verificar y no se anularon. Una venta ya
-- verificada no se toca: esa ya se comprobó.
--
-- Firmas de lo que ya existía: las mismas. `registrar_abono` sigue viva
-- para el navegador viejo.
-- =====================================================================

create or replace function abonar_venta(
  p_venta_id   bigint,
  p_metodo     text,
  p_monto      numeric,
  p_referencia text    default null,
  p_verificado boolean default false
) returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v       ventas%rowtype;
  v_falta numeric;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;

  -- Se bloquea la venta: dos abonos a la vez no pueden pasarse de lo que
  -- falta, ni verificarse mientras entra uno.
  select * into v from ventas where id = p_venta_id and por_verificar and not anulada for update;
  if not found then
    raise exception 'Esa venta ya no está por verificar.';
  end if;

  -- La primera vez, la venta pasa a ser por partes. Antes del abono: el
  -- disparador de `abonos` no deja colgar uno de una venta cobrada completa.
  if not v.pago_parcial then
    update ventas set pago_parcial = true where id = v.id;
  end if;

  v_falta := falta_bcv_de(v.id);
  if v_falta <= 0 then
    raise exception 'Esa venta ya está pagada completa: solo falta verificarla.';
  end if;

  perform anotar_abono_en(v.id, null, null, 'tienda', p_metodo, p_monto, p_referencia,
                          coalesce(p_verificado, false) or p_metodo in ('efectivo_bs', 'efectivo_usd', 'punto'),
                          v_falta);

  return falta_bcv_de(v.id);
end;
$fn$;

revoke all on function abonar_venta(bigint, text, numeric, text, boolean) from public, anon;
grant execute on function abonar_venta(bigint, text, numeric, text, boolean) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. En Pedidos, una venta de "Por verificar el pago" tiene "Cargar un
--    pago". Una venta de Bs 1.000 a tasa 100 ($10 BCV): carga Bs 400 por
--    pago móvil. La tarjeta dice "Pago por partes" y "Faltan $6,00 BCV";
--    "Pago verificado" queda apagado hasta cargar lo demás.
--
-- 2. En la Caja de ese día, la venta ya no entra por Bs 1.000: entran los
--    Bs 400 del abono (y lo demás, el día que llegue).
--
-- 3. Sin sesión, esto TIENE QUE FALLAR:
--      select abonar_venta(1, 'pago_movil', 1);      -- permiso denegado
-- =====================================================================
