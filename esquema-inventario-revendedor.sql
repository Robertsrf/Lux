-- =====================================================================
-- #72 · esquema-inventario-revendedor.sql
-- El inventario propio del revendedor (fase 5, pedido del dueño del
-- 18/11/2026; decidido el 23/11/2026).
-- Depende del #71 (esquema-credito.sql). Se puede correr varias veces.
--
-- POR QUÉ
-- "Si alguien, incluso ella, nos compra y había una sola unidad de esa en
-- nuestro inventario, se le desaparece a ella, lo cual es ilógico porque
-- nos compró para vender en su negocio." Su catálogo enseñaba solo lo
-- libre de la tienda: lo que él ya compró no existía para el sistema.
--
-- QUÉ HACE
-- 1. Su inventario NO se guarda como un número: se calcula
--    (`rv_inventario`, una sola regla):
--      tiene = lo que se le vendió para su inventario (ventas sin anular,
--              las notas de crédito en negativo)
--            + sus ajustes a mano (`revendedor_ajustes`)
--            − lo que vendió de lo suyo (líneas de sus pedidos cerrados)
--      apartadas = lo suyo en sus pedidos abiertos que no han vencido
--      libre = tiene − apartadas
--    Si la tienda anula, quita o devuelve, su inventario cambia solo.
-- 2. Entra por una venta del mostrador "para su inventario"
--    (`vender_para_inventario`, y `vender_a_credito(..., p_para_inventario)`),
--    solo con la ficha de un revendedor. Esa venta NO lleva
--    `ventas.revendedor_id`: cuenta para la meta de la vendedora (decisión
--    del dueño). Lleva `ventas.inventario_de`.
-- 3. Anular, quitar o devolver una pieza de una venta para su inventario
--    solo si él todavía la tiene LIBRE (disparadores).
-- 4. El pedido de su clienta toma primero de lo suyo: cada pieza se parte en
--    una línea de lo suyo (`apartado_items.de_su_inventario`, con
--    `precio_lux_usd = 0`: no le debe nada a Lux) y otra de la tienda. Un
--    pedido sin nada de la tienda se cierra al confirmarlo.
-- 5. Su catálogo suma lo suyo libre a lo libre de la tienda; su panel gana
--    "Mi inventario" (`rv_mi_inventario`, `rv_ajustar_inventario`), y el
--    dueño lo ve en `v_inventario_revendedores`.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LAS COLUMNAS Y LA TABLA
-- ---------------------------------------------------------------------

alter table ventas add column if not exists inventario_de bigint references revendedores(id);
comment on column ventas.inventario_de is
  'Venta a un revendedor para su inventario: las piezas salen en su catálogo. Null: no. La pone vender_para_inventario o vender_a_credito.';
create index if not exists ventas_inventario_de_idx on ventas (inventario_de) where inventario_de is not null;

-- Solo la ficha de ese revendedor. Solo al poner la marca: juntar dos
-- fichas (`admin_fusionar_clientes`) mueve `cliente_id` antes que el enlace.
create or replace function venta_inventario_de_valida()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.inventario_de is not null
     and not exists (select 1 from revendedores r
                      where r.id = new.inventario_de and r.cliente_id = new.cliente_id) then
    raise exception 'Para su inventario, la venta tiene que ser a la ficha de ese revendedor.';
  end if;
  return new;
end;
$fn$;
revoke all on function venta_inventario_de_valida() from public, anon, authenticated;

drop trigger if exists venta_inventario_de_valida on ventas;
create trigger venta_inventario_de_valida
  before insert or update of inventario_de on ventas
  for each row
  when (new.inventario_de is not null)
  execute function venta_inventario_de_valida();

create table if not exists revendedor_ajustes (
  id            bigserial primary key,
  revendedor_id bigint not null references revendedores(id),
  modelo_id     bigint not null references modelos(id),
  cantidad      int not null check (cantidad <> 0 and cantidad between -999 and 999),
  motivo        text not null check (length(btrim(motivo)) between 2 and 200),
  quien         text not null default 'revendedor' check (quien in ('revendedor', 'tienda')),
  perfil_id     uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);
create index if not exists revendedor_ajustes_rv_idx on revendedor_ajustes (revendedor_id, modelo_id);
comment on table revendedor_ajustes is
  'Lo que el revendedor corrige a mano en su inventario ("vendí 1 en persona", "se dañó"). Se lee por rv_mi_inventario y v_inventario_revendedores. Nunca se borra.';

alter table revendedor_ajustes enable row level security;
revoke all on revendedor_ajustes from anon, authenticated;
revoke all on sequence revendedor_ajustes_id_seq from anon, authenticated;

drop trigger if exists revendedor_ajustes_no_se_borran on revendedor_ajustes;
drop trigger if exists revendedor_ajustes_no_se_vacian on revendedor_ajustes;
create trigger revendedor_ajustes_no_se_borran before delete   on revendedor_ajustes for each row       execute function historico_no_se_borra();
create trigger revendedor_ajustes_no_se_vacian before truncate on revendedor_ajustes for each statement execute function historico_no_se_borra();

-- Una línea del pedido de su clienta dice de dónde salen sus unidades.
-- Las de lo suyo no le deben nada a Lux: con `precio_lux_usd = 0`, todas
-- las cuentas que ya suman lo que paga a Lux (su tope, su nivel, Pedidos,
-- Revendedores) dan bien sin tocarlas.
alter table apartado_items add column if not exists de_su_inventario boolean not null default false;
alter table apartado_items drop constraint if exists apartado_items_suyo_sin_lux;
alter table apartado_items add constraint apartado_items_suyo_sin_lux
  check (not de_su_inventario or precio_lux_usd = 0);


-- ---------------------------------------------------------------------
-- 2. LO QUE TIENE: UNA SOLA REGLA
-- ---------------------------------------------------------------------

create or replace function rv_inventario(p_revendedor_id bigint)
returns table (modelo_id bigint, compradas int, ajustes int, vendidas int,
               apartadas int, tiene int, libre int)
language sql
stable
security definer
set search_path = public
as $fn$
  with compras as (
    select i.modelo_id, sum(i.cantidad)::int as n
      from venta_items i
      join ventas v on v.id = i.venta_id
      left join ventas o on o.id = v.devolucion_de
     where coalesce(v.inventario_de, o.inventario_de) = p_revendedor_id
       and not v.anulada
     group by 1
  ), aj as (
    select a.modelo_id, sum(a.cantidad)::int as n
      from revendedor_ajustes a
     where a.revendedor_id = p_revendedor_id
     group by 1
  ), suyas as (
    select ai.modelo_id,
           coalesce(sum(ai.cantidad) filter (where a.estado = 'retirado'), 0)::int as vendidas,
           coalesce(sum(ai.cantidad) filter (where a.estado = 'abierto' and a.cerrado_en is null
                                                   and a.expira_en > now()), 0)::int as apartadas
      from apartado_items ai
      join apartados a on a.id = ai.apartado_id
     where a.revendedor_id = p_revendedor_id and ai.de_su_inventario
     group by 1
  ), todas as (
    select c.modelo_id from compras c union select j.modelo_id from aj j union select s.modelo_id from suyas s
  )
  select t.modelo_id,
         coalesce(c.n, 0), coalesce(j.n, 0), coalesce(s.vendidas, 0), coalesce(s.apartadas, 0),
         coalesce(c.n, 0) + coalesce(j.n, 0) - coalesce(s.vendidas, 0),
         coalesce(c.n, 0) + coalesce(j.n, 0) - coalesce(s.vendidas, 0) - coalesce(s.apartadas, 0)
    from todas t
    left join compras c on c.modelo_id = t.modelo_id
    left join aj j      on j.modelo_id = t.modelo_id
    left join suyas s   on s.modelo_id = t.modelo_id;
$fn$;
revoke all on function rv_inventario(bigint) from public, anon, authenticated;

-- Lo libre de una pieza, para los guardias y los pedidos.
create or replace function rv_libre_de(p_revendedor_id bigint, p_modelo_id bigint)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select libre from rv_inventario(p_revendedor_id) where modelo_id = p_modelo_id), 0);
$fn$;
revoke all on function rv_libre_de(bigint, bigint) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. LA VENTA PARA SU INVENTARIO
-- ---------------------------------------------------------------------

-- Los mismos argumentos que el mostrador le manda a `registrar_venta`
-- para cobrar; la llama tal cual (precio, tramo, descuento de clienta y
-- códigos salen de ahí) y le pone la marca. Todo en una transacción.
create or replace function vender_para_inventario(
  p_tipo             text,
  p_metodo           text,
  p_items            jsonb,
  p_cliente_nombre   text    default null,
  p_cliente_telefono text    default null,
  p_cliente_id       bigint  default null,
  p_cliente_cedula   text    default null,
  p_cliente_apellido text    default null,
  p_notas            text    default null,
  p_por_verificar    boolean default false,
  p_pago_referencia  text    default null,
  p_extra_bs         numeric default null,
  p_extra_nota       text    default null,
  p_codigos          text[]  default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rv bigint;
  v_id bigint;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  if p_cliente_id is null then
    raise exception 'Para su inventario, elige la ficha del revendedor.';
  end if;
  select id into v_rv from revendedores where cliente_id = p_cliente_id;
  if not found then
    raise exception 'Esa clienta no es revendedor: cóbralo sin "Para su inventario".';
  end if;

  v_id := registrar_venta(
    p_tipo             => p_tipo,
    p_metodo           => p_metodo,
    p_items            => p_items,
    p_cliente_nombre   => p_cliente_nombre,
    p_cliente_telefono => p_cliente_telefono,
    p_notas            => p_notas,
    p_cliente_id       => p_cliente_id,
    p_cliente_cedula   => p_cliente_cedula,
    p_cliente_apellido => p_cliente_apellido,
    p_por_verificar    => coalesce(p_por_verificar, false),
    p_pago_referencia  => p_pago_referencia,
    p_extra_bs         => p_extra_bs,
    p_extra_nota       => p_extra_nota,
    p_codigos          => p_codigos);

  update ventas set inventario_de = v_rv where id = v_id;
  return v_id;
end;
$fn$;
revoke all on function vender_para_inventario(text, text, jsonb, text, text, bigint, text, text, text, boolean, text, numeric, text, text[]) from public, anon;
grant execute on function vender_para_inventario(text, text, jsonb, text, text, bigint, text, text, text, boolean, text, numeric, text, text[]) to authenticated;

-- La del #71 con `p_para_inventario` al final. Una sola firma: el
-- navegador de antes, que manda nueve, sigue entrando.
drop function if exists vender_a_credito(jsonb, bigint, text, numeric, text, boolean, numeric, text, text[]);

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
  p_para_inventario  boolean default false
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
  if v_dias is null then
    raise exception 'Esta clienta no tiene crédito: lo habilita el administrador en su ficha.';
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

  v_vence := (now() at time zone 'America/Caracas')::date + v_dias;
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
revoke all on function vender_a_credito(jsonb, bigint, text, numeric, text, boolean, numeric, text, text[], boolean) from public, anon;
grant execute on function vender_a_credito(jsonb, bigint, text, numeric, text, boolean, numeric, text, text[], boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 4. LOS GUARDIAS: NADA SALE DE SU INVENTARIO SI YA NO LO TIENE LIBRE
-- Anular, quitar una pieza o devolverla (nota de crédito) de una venta
-- para su inventario. Sin reescribir las funciones de siempre.
-- ---------------------------------------------------------------------

create or replace function rv_inventario_alcanza(p_revendedor_id bigint, p_modelo_id bigint, p_salen int)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_libre  int := rv_libre_de(p_revendedor_id, p_modelo_id);
  v_nombre text;
  v_rv     text;
begin
  if p_salen > 0 and v_libre < p_salen then
    select m.nombre || coalesce(' · ' || m.variante, '') into v_nombre from modelos m where m.id = p_modelo_id;
    select r.nombre into v_rv from revendedores r where r.id = p_revendedor_id;
    raise exception 'De "%" a % le quedan % libres en su inventario y esto le quita %: ya la vendió o está en un pedido suyo.',
      v_nombre, v_rv, greatest(v_libre, 0), p_salen;
  end if;
end;
$fn$;
revoke all on function rv_inventario_alcanza(bigint, bigint, int) from public, anon, authenticated;

create or replace function venta_inventario_anular()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
begin
  for r in
    select i.modelo_id, sum(i.cantidad)::int as n
      from venta_items i where i.venta_id = new.id
     group by 1 having sum(i.cantidad) > 0
  loop
    perform rv_inventario_alcanza(new.inventario_de, r.modelo_id, r.n);
  end loop;
  return new;
end;
$fn$;
revoke all on function venta_inventario_anular() from public, anon, authenticated;

drop trigger if exists venta_inventario_anular on ventas;
create trigger venta_inventario_anular
  before update of anulada on ventas
  for each row
  when (new.anulada and not old.anulada and new.inventario_de is not null)
  execute function venta_inventario_anular();

-- En una línea: bajar su cantidad (quitar) o una línea de nota de crédito.
create or replace function venta_item_inventario()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rv bigint;
begin
  if tg_op = 'INSERT' then
    if new.devuelve_item_id is null or new.cantidad >= 0 then
      return new;
    end if;
    select v.inventario_de into v_rv
      from venta_items i join ventas v on v.id = i.venta_id
     where i.id = new.devuelve_item_id;
    if v_rv is not null then
      perform rv_inventario_alcanza(v_rv, new.modelo_id, -new.cantidad);
    end if;
  elsif new.cantidad < old.cantidad then
    select v.inventario_de into v_rv from ventas v where v.id = new.venta_id and not v.anulada;
    if v_rv is not null then
      perform rv_inventario_alcanza(v_rv, new.modelo_id, old.cantidad - new.cantidad);
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function venta_item_inventario() from public, anon, authenticated;

drop trigger if exists venta_item_inventario on venta_items;
create trigger venta_item_inventario
  before insert or update of cantidad on venta_items
  for each row
  execute function venta_item_inventario();


-- ---------------------------------------------------------------------
-- 4b. LO QUE VE EL DUEÑO
-- Una vista no presta su permiso para ejecutar funciones: la envoltura,
-- de definidor, no da nada a quien no sea administrador.
-- ---------------------------------------------------------------------

create or replace function inventario_revendedores_admin()
returns table (revendedor_id bigint, revendedor text, modelo_id bigint, sku text, nombre text,
               variante text, foto_thumb_path text, tiene int, apartadas int, libre int)
language sql
stable
security definer
set search_path = public
as $fn$
  select r.id, r.nombre, x.modelo_id, m.sku, m.nombre, m.variante, m.foto_thumb_path,
         x.tiene, x.apartadas, x.libre
    from revendedores r
   cross join lateral rv_inventario(r.id) x
    join modelos m on m.id = x.modelo_id
   where es_admin() and (x.tiene <> 0 or x.apartadas <> 0);
$fn$;
revoke all on function inventario_revendedores_admin() from public, anon;
grant execute on function inventario_revendedores_admin() to authenticated;

create or replace view v_inventario_revendedores
with (security_invoker = off) as
select * from inventario_revendedores_admin();

revoke all on v_inventario_revendedores from anon;
grant select on v_inventario_revendedores to authenticated;
