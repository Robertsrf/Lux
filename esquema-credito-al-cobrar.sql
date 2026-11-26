-- =====================================================================
-- #77 · esquema-credito-al-cobrar.sql
-- El crédito se decide en el cobro (26/11/2026). Depende del #76 (y de la
-- vender_a_credito del #72). Se puede correr varias veces.
--
-- POR QUÉ
-- Para venderle a crédito a una clienta había que registrarla, ir a su
-- ficha, que el administrador le pusiera los días, y volver al cobro. El
-- dueño: "registrarlo primero y darle crédito y luego ir a ponerle el
-- crédito es fastidioso". Decidió (diseño en
-- docs/superpowers/specs/2026-11-26-cobro-credito-y-rebaja-pct-design.md):
--   - lo dan desde el cobro el administrador y las vendedoras;
--   - vale SOLO para esa venta: la ficha no cambia;
--   - sin máximo de días: los escribe quien cobra;
--   - si su ficha tiene tope, el tope manda.
--
-- QUÉ HACE
-- vender_a_credito gana p_dias int default null al final. Con p_dias (un
-- entero de 1 en adelante) vence hoy en Venezuela más esos días, tenga o no
-- crédito en su ficha. Sin p_dias, como antes: los días de su ficha, o el
-- error de siempre. El tope de la ficha cuenta en los dos casos. Se borra
-- la firma de 10: una sola, y el navegador de antes, que manda 9 o 10,
-- sigue entrando.
--
-- DEBERÍA DAR
--   select count(*) from pg_proc where proname = 'vender_a_credito';  -- 1
--   A una clienta sin crédito en su ficha, con p_dias => 5, una pieza de
--   20 dólares BCV la deja debiendo 20, con vencimiento en 5 días, y su
--   ficha sigue sin crédito (credito_dias null).
-- =====================================================================

drop function if exists vender_a_credito(jsonb, bigint, text, numeric, text, boolean, numeric, text, text[], boolean);

create or replace function vender_a_credito(
  p_items            jsonb,
  p_cliente_id       bigint,
  p_metodo           text,
  p_pago_monto       numeric default null,
  p_pago_referencia  text    default null,
  p_pago_verificado  boolean default false,
  p_extra_bs         numeric default null,
  p_extra_nota       text    default null,
  p_codigos          text[]  default null,
  p_para_inventario  boolean default false,
  p_dias             int     default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_dias  int;
  v_tope  numeric;
  v_antes numeric;
  v_debe  numeric;
  v_id    bigint;
  v_vence date;
  v_falta numeric;
  v_rv    bigint;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  if p_cliente_id is null then
    raise exception 'Para vender a crédito, elige la ficha de la clienta: el crédito es suyo.';
  end if;
  if p_dias is not null and p_dias < 1 then
    raise exception 'Los días para pagar tienen que ser 1 o más.';
  end if;
  if coalesce(p_para_inventario, false) then
    select id into v_rv from revendedores where cliente_id = p_cliente_id;
    if not found then
      raise exception 'Esa clienta no es revendedor: cóbralo sin "Para su inventario".';
    end if;
  end if;

  -- Su fila, bloqueada: dos ventas a crédito a la vez no se saltan el tope.
  select credito_dias, credito_tope_usd into v_dias, v_tope
    from clientes where id = p_cliente_id for update;
  if not found then
    raise exception 'Esa ficha ya no existe.';
  end if;
  -- Los días que se dieron en el cobro mandan sobre los de su ficha, solo
  -- para esta venta. Sin ellos, los de su ficha.
  v_dias := coalesce(p_dias, v_dias);
  if v_dias is null then
    raise exception 'Esta clienta no tiene crédito en su ficha: escribe los días para pagar.';
  end if;
  v_antes := deuda_comprobada_de(p_cliente_id);

  v_id := registrar_venta(
    p_tipo            => 'detal',
    p_metodo          => p_metodo,
    p_items           => p_items,
    p_cliente_id      => p_cliente_id,
    p_por_verificar   => true,
    p_pago_referencia => p_pago_referencia,
    p_extra_bs        => p_extra_bs,
    p_extra_nota      => p_extra_nota,
    p_codigos         => p_codigos);

  v_vence := hoy_ve() + v_dias;
  update ventas
     set pago_parcial = true, credito_vence = v_vence, inventario_de = v_rv
   where id = v_id;

  if coalesce(p_pago_monto, 0) > 0 then
    perform abonar_venta(v_id, p_metodo, p_pago_monto, p_pago_referencia, coalesce(p_pago_verificado, false));
  end if;

  v_falta := falta_bcv_de(v_id);
  if v_falta <= 0 then
    raise exception 'Con eso ya está pagado: cóbralo como venta, no a crédito.';
  end if;

  if v_tope is not null then
    v_debe := deuda_comprobada_de(p_cliente_id);
    if v_debe > v_tope + 0.005 then
      raise exception 'Con esta venta debería $% BCV (sin contar pagos sin comprobar) y su tope es $% BCV: antes de esta venta le quedaban $% BCV.',
        to_char(v_debe, 'FM999G999G990D00'), to_char(v_tope, 'FM999G999G990D00'),
        to_char(greatest(v_tope - v_antes, 0), 'FM999G999G990D00');
    end if;
  end if;

  return jsonb_build_object('venta_id', v_id, 'falta_bcv', v_falta, 'credito_vence', v_vence);
end;
$fn$;
revoke all on function vender_a_credito(jsonb, bigint, text, numeric, text, boolean, numeric, text, text[], boolean, int) from public, anon;
grant execute on function vender_a_credito(jsonb, bigint, text, numeric, text, boolean, numeric, text, text[], boolean, int) to authenticated;
