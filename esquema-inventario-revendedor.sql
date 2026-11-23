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
  v_libre  int;
  v_nombre text;
  v_rv     text;
begin
  -- La misma fila que bloquea su pedido: no se cruzan.
  perform 1 from revendedores where id = p_revendedor_id for update;
  v_libre := rv_libre_de(p_revendedor_id, p_modelo_id);
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


-- ---------------------------------------------------------------------
-- 5. EL PEDIDO DE SU CLIENTA TOMA PRIMERO DE LO SUYO
-- Las de esquema-revendedores-plazos.sql, mismas firmas; solo cambia lo
-- marcado con #72.
-- ---------------------------------------------------------------------

create or replace function rv_crear_apartado(
  p_revendedor_id bigint,
  p_items         jsonb,
  p_cedula        text,
  p_nombre        text,
  p_apellido      text,
  p_telefono      text,
  p_origen        text
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r           revendedores%rowtype;
  v_cli       revendedor_clientes%rowtype;
  v_ced       text := nullif(btrim(coalesce(p_cedula, '')), '');
  v_nom       text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_ape       text := nullif(btrim(coalesce(p_apellido, '')), '');
  v_tel       text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_desc      numeric;
  v_horas     numeric;
  v_linea     record;
  v_lista     numeric;
  v_lux       numeric;
  v_precio    numeric;
  v_nombre    text;
  v_hay       int;
  v_lineas    jsonb := '[]'::jsonb;
  v_nuevo     numeric := 0;
  v_tope      record;
  v_id        bigint;
  -- #72: lo suyo libre, por pieza, y cuánto sale de lo suyo y de la tienda.
  v_suyas     jsonb;
  v_activo    boolean;
  v_suyo      int;
  v_tienda    int;
begin
  -- La fila del revendedor, bloqueada: el tope y lo suyo, de a un pedido.
  select * into r from revendedores where id = p_revendedor_id for update;
  if not found or not r.activo then
    raise exception 'Este catálogo no está disponible.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No elegiste ninguna pieza.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
              where coalesce((x->>'cantidad')::int, 0) <= 0) then
    raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
  end if;
  if jsonb_array_length(p_items) > 300 then
    raise exception 'Son demasiadas piezas en un pedido.';
  end if;

  if v_ced is null then raise exception 'Falta la cédula.'; end if;
  if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cédula está incompleta.';
  end if;

  select * into v_cli
    from revendedor_clientes
   where revendedor_id = r.id
     and cedula_digitos = regexp_replace(v_ced, '[^0-9]', '', 'g');

  if found then
    v_nom := coalesce(v_nom, nullif(btrim(v_cli.nombre), ''));
    v_ape := coalesce(v_ape, nullif(btrim(coalesce(v_cli.apellido, '')), ''));
    if v_tel is null and length(regexp_replace(coalesce(v_cli.telefono, ''), '[^0-9]', '', 'g')) >= 10 then
      v_tel := btrim(v_cli.telefono);
    end if;
  end if;

  if v_nom is null then raise exception 'Falta el nombre.'; end if;
  if v_ape is null then raise exception 'Falta el apellido.'; end if;
  if v_tel is null then raise exception 'Falta el número de teléfono.'; end if;
  if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
    raise exception 'Ese teléfono está incompleto. Escríbelo con el código, por ejemplo 0412 1234567.';
  end if;

  if v_cli.id is null then
    insert into revendedor_clientes (revendedor_id, nombre, apellido, cedula, telefono)
    values (r.id, v_nom, v_ape, v_ced, v_tel)
    returning * into v_cli;
  else
    update revendedor_clientes
       set apellido = coalesce(nullif(btrim(coalesce(apellido, '')), ''), v_ape),
           telefono = case when length(regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g')) >= 10
                           then telefono else v_tel end
     where id = v_cli.id;
  end if;

  v_horas := config_requerida('revendedor_horas_pago');
  v_desc  := rv_descuento_de(r.id);

  for v_linea in
    select (x->>'modelo_id')::bigint as modelo_id
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    perform pg_advisory_xact_lock(v_linea.modelo_id);
    perform 1 from existencias where modelo_id = v_linea.modelo_id for update;
  end loop;

  -- #72: lo suyo libre, una vez (con su fila bloqueada, nadie más lo toma).
  -- Las que tiene (aunque estén apartadas): de esas se dice cuántas quedan.
  select coalesce(jsonb_object_agg(i.modelo_id::text, greatest(i.libre, 0)), '{}'::jsonb)
    into v_suyas
    from rv_inventario(r.id) i
   where i.tiene > 0;

  for v_linea in
    select (x->>'modelo_id')::bigint as modelo_id, sum((x->>'cantidad')::int)::int as cantidad
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    select m.nombre || coalesce(' · ' || m.variante, ''), coalesce(m.precio_override_usd, g.precio_usd), m.activo
      into v_nombre, v_lista, v_activo
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_linea.modelo_id;
    if not found or v_lista is null then
      raise exception 'Una de las piezas que elegiste ya no está disponible.';
    end if;

    -- #72: primero de lo suyo, que ya pagó; lo que falte, de la tienda.
    v_suyo   := least(coalesce((v_suyas->>v_linea.modelo_id::text)::int, 0), v_linea.cantidad);
    v_tienda := v_linea.cantidad - v_suyo;

    if v_tienda > 0 then
      v_lux := case when v_activo then rv_precio_lux(v_linea.modelo_id, v_desc) end;
      -- De la tienda solo lo que está en su catálogo (que el piso deje rebaja).
      if v_lux is null or v_lux >= v_lista then
        if not v_suyas ? v_linea.modelo_id::text then
          raise exception '"%" no está en este catálogo.', v_nombre;
        end if;
        raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, v_suyo, v_linea.cantidad;
      end if;

      select coalesce(sum(e.cantidad), 0) - apartadas_de(v_linea.modelo_id)
        into v_hay
        from existencias e
       where e.modelo_id = v_linea.modelo_id;
      if v_tienda > v_hay then
        raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, v_suyo + greatest(v_hay, 0), v_linea.cantidad;
      end if;
    end if;

    select rv_precio_clienta(rp.precio_usd, v_lista)
      into v_precio
      from (select 1) uno
      left join revendedor_precios rp on rp.revendedor_id = r.id and rp.modelo_id = v_linea.modelo_id;

    if v_suyo > 0 then
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_linea.modelo_id, 'cantidad', v_suyo,
        'lista', v_lista, 'lux', 0, 'precio', v_precio, 'suyo', true));
    end if;
    if v_tienda > 0 then
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_linea.modelo_id, 'cantidad', v_tienda,
        'lista', v_lista, 'lux', v_lux, 'precio', v_precio, 'suyo', false));
      v_nuevo := v_nuevo + v_lux * v_tienda;
    end if;
  end loop;

  select * into v_tope from rv_tope(r.id);
  if v_tope.usado_usd + v_nuevo > v_tope.tope_usd + 0.005 then
    raise exception 'Por ahora no se pueden apartar más piezas en este catálogo. Escríbele a % para apartarlas.',
      split_part(btrim(r.nombre), ' ', 1);
  end if;

  insert into apartados (revendedor_id, cliente_id, expira_en, plazo_pago_en, origen)
  values (r.id, v_cli.id, now() + make_interval(hours => v_horas::int),
          now() + make_interval(hours => v_horas::int), p_origen)
  returning id into v_id;

  insert into apartado_items (apartado_id, modelo_id, cantidad, precio_lista_usd, precio_lux_usd, precio_clienta_usd,
                              de_su_inventario)
  select v_id, l.modelo_id, l.cantidad, l.lista, l.lux, l.precio, l.suyo
    from jsonb_to_recordset(v_lineas)
      as l(modelo_id bigint, cantidad int, lista numeric, lux numeric, precio numeric, suyo boolean);

  return v_id;
end;
$fn$;

revoke all on function rv_crear_apartado(bigint, jsonb, text, text, text, text, text) from public, anon, authenticated;

create or replace function rv_confirmar_de(p_revendedor_id bigint, p_apartado_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a        apartados%rowtype;
  r        revendedores%rowtype;
  v_total  numeric;
  v_pagado numeric;
  v_minimo numeric;
  v_horas  numeric;
begin
  select * into a from apartados where id = p_apartado_id and revendedor_id = p_revendedor_id for update;
  if not found then
    raise exception 'No encuentro ese pedido.';
  end if;
  if a.estado <> 'abierto' or a.cerrado_en is not null then
    raise exception 'Ese pedido ya no está abierto.';
  end if;
  if a.confirmado_en is not null then
    raise exception 'Ese pedido ya está confirmado.';
  end if;
  if a.expira_en <= now() then
    raise exception 'Ese pedido ya venció: las piezas volvieron a la tienda.';
  end if;
  select * into r from revendedores where id = p_revendedor_id;

  update apartado_abonos
     set confirmado_en = now()
   where apartado_id = a.id and anulado_en is null and confirmado_en is null;

  select coalesce(sum(i.precio_clienta_usd * i.cantidad), 0) into v_total
    from apartado_items i where i.apartado_id = a.id;
  select coalesce(sum(b.monto_bcv), 0) into v_pagado
    from apartado_abonos b where b.apartado_id = a.id and b.anulado_en is null;
  v_minimo := v_total * config_requerida('apartado_inicial_pct') / 100;

  if v_pagado < v_minimo - 0.005 then
    raise exception 'Para confirmar, tu clienta tiene que haberte pagado al menos el % %%: $% BCV. Lleva $% BCV.',
      to_char(config_requerida('apartado_inicial_pct'), 'FM990'),
      to_char(v_minimo, 'FM999G999G990D00'), to_char(v_pagado, 'FM999G999G990D00');
  end if;
  if v_pagado < v_total - 0.005 and r.dias_credito is null then
    raise exception 'Tu clienta no te pagó completo. Para darle crédito, pon tus días de crédito en "Mi catálogo".';
  end if;

  v_horas := config_requerida('revendedor_horas_para_pagar');
  update apartados
     set confirmado_en    = now(),
         plazo_lux_en     = now() + make_interval(hours => v_horas::int),
         vence_clienta_en = case when v_pagado < v_total - 0.005
                                 then now() + make_interval(days => r.dias_credito) end
   where id = a.id;

  -- #72: sin nada de la tienda no hay nada que pagarle a Lux ni que
  -- aprobar: es venta suya y las piezas ya las tiene él.
  if not exists (select 1 from apartado_items i where i.apartado_id = a.id and not i.de_su_inventario) then
    update apartados
       set estado = 'retirado', retirado_en = now(), cerrado_en = now(),
           entregado_en = now(), expira_en = 'infinity'
     where id = a.id;
    return;
  end if;

  perform apartado_al_dia(a.id);
end;
$fn$;

revoke all on function rv_confirmar_de(bigint, bigint) from public, anon, authenticated;

-- La de esquema-abonos-y-apartados.sql: las líneas de lo suyo no apartan nada en la tienda.
create or replace function apartadas_de(p_modelo_id bigint)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select (
    coalesce((select sum(ri.cantidad)
                from reserva_items ri
                join reservas r on r.id = ri.reserva_id
               where ri.modelo_id = p_modelo_id
                 and r.venta_id is null
                 and r.cerrada_en is null
                 and (   (r.estado = 'abierta' and r.expira_en > now())
                      or (r.estado = 'confirmada'
                          and (r.pagado_en is not null
                               or r.vence_apartado_en is null
                               or r.vence_apartado_en > now())))), 0)
  + coalesce((select sum(ai.cantidad)
                from apartado_items ai
                join apartados a on a.id = ai.apartado_id
               where ai.modelo_id = p_modelo_id
                 and not ai.de_su_inventario   -- #72: lo suyo no aparta nada en la tienda
                 and a.estado = 'abierto'
                 and a.cerrado_en is null
                 and a.expira_en > now()), 0)
  )::int;
$fn$;

revoke all on function apartadas_de(bigint) from public;
grant execute on function apartadas_de(bigint) to anon, authenticated;

create or replace view v_apartados_revendedor
with (security_invoker = off) as
select
  a.id,
  a.creado_en,
  a.expira_en,
  a.revendedor_id,
  r.nombre   as revendedor,
  r.telefono as revendedor_telefono,
  btrim(c.nombre || ' ' || coalesce(c.apellido, '')) as clienta,
  x.piezas,
  x.total_usd,
  x.lista_usd,
  x.items,
  -- Nuevas.
  rv_fase_de(a.id)                                                           as fase,
  a.confirmado_en,
  a.plazo_lux_en,
  c.cedula                                                                   as clienta_cedula,
  c.telefono                                                                 as clienta_telefono,
  round(x.total_usd - greatest(saldo_padre_bcv(null, null, a.id), 0), 4)             as lux_pagado_bcv,
  round(x.total_usd - greatest(saldo_padre_bcv(null, null, a.id, null, true), 0), 4) as lux_verificado_bcv,
  greatest(round(saldo_padre_bcv(null, null, a.id), 4), 0)                   as lux_falta_bcv,
  (select count(*) from abonos b
    where b.apartado_id = a.id and b.anulado_en is null and b.verificado_en is null)::int as por_revisar,
  a.venta_id,
  a.entregado_en,
  (a.cliente_maestro_id is not null
   or exists (select 1 from clientes cl where cl.cedula_digitos = c.cedula_digitos)) as ya_es_clienta
from apartados a
join revendedores r on r.id = a.revendedor_id
join revendedor_clientes c on c.id = a.cliente_id
cross join lateral (
  select sum(i.cantidad)::int                    as piezas,
         sum(i.precio_lux_usd * i.cantidad)      as total_usd,
         sum(i.precio_lista_usd * i.cantidad)    as lista_usd,
         jsonb_agg(jsonb_build_object(
           'modelo_id', i.modelo_id, 'sku', m.sku, 'nombre', m.nombre, 'variante', m.variante,
           'foto_thumb_path', m.foto_thumb_path, 'cantidad', i.cantidad,
           'precio_usd', i.precio_lux_usd,
           'donde', (select string_agg(u.nombre, ' · ' order by e.cantidad desc, u.orden, u.id)
                       from existencias e join ubicaciones u on u.id = e.ubicacion_id
                      where e.modelo_id = i.modelo_id and e.cantidad > 0)
         ) order by m.nombre) as items
    from apartado_items i
    join modelos m on m.id = i.modelo_id
   where i.apartado_id = a.id
     and not i.de_su_inventario   -- #72: la tienda ve solo lo suyo
) x
where es_personal()
  and (   (a.estado = 'abierto' and a.cerrado_en is null and a.confirmado_en is not null
           and (a.expira_en > now()
                or exists (select 1 from abonos b where b.apartado_id = a.id and b.anulado_en is null)))
       or (a.estado = 'retirado' and a.entregado_en is null and a.venta_id is not null));

revoke all on v_apartados_revendedor from anon;
grant select on v_apartados_revendedor to authenticated;

create or replace function aprobar_apartado(p_apartado_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a        apartados%rowtype;
  r        revendedores%rowtype;
  c        revendedor_clientes%rowtype;
  v_falta  numeric;
  v_modelo bigint;
  v_metodo metodo_pago;
  v_ref    text;
  v_cli    bigint;
  v_lineas jsonb;
  v_venta  bigint;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;

  select * into a from apartados where id = p_apartado_id for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;
  if a.estado <> 'abierto' or a.cerrado_en is not null then
    raise exception 'Ese pedido ya no está abierto.';
  end if;
  if a.confirmado_en is null then
    raise exception 'El revendedor todavía no confirmó el pago de su clienta.';
  end if;

  -- Lo que queda por revisar lo da por bueno quien aprueba: aprobar es
  -- decir "lo vi en el banco".
  update abonos
     set verificado_en = now(), verificado_por = auth.uid()
   where apartado_id = a.id and anulado_en is null and verificado_en is null;

  v_falta := saldo_padre_bcv(null, null, a.id, null, true);
  if v_falta >= 0.005 then
    raise exception 'Todavía faltan $% BCV de lo que él le paga a Lux. Carga lo que falta y después aprueba.',
      to_char(v_falta, 'FM999G999G990D00');
  end if;

  select * into r from revendedores where id = a.revendedor_id;
  select * into c from revendedor_clientes where id = a.cliente_id;

  for v_modelo in
    select distinct modelo_id from apartado_items where apartado_id = a.id and not de_su_inventario order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  -- Se suelta: sus piezas cuentan como libres y se toman.
  update apartados set cerrado_en = now() where id = a.id;

  select b.metodo into v_metodo
    from abonos b where b.apartado_id = a.id and b.anulado_en is null
   order by b.monto_bcv desc, b.fecha desc limit 1;
  select b.referencia into v_ref
    from abonos b where b.apartado_id = a.id and b.anulado_en is null and b.referencia is not null
   order by b.fecha desc limit 1;

  v_cli := cliente_de_revendedor(a.id);

  select jsonb_agg(jsonb_build_object(
           'modelo_id', i.modelo_id, 'cantidad', i.cantidad,
           'precio_usd', i.precio_lux_usd, 'precio_lista_usd', i.precio_lista_usd,
           'motivo', case when i.precio_lux_usd < i.precio_lista_usd then 'revendedor' end) order by i.id)
    into v_lineas
    from apartado_items i where i.apartado_id = a.id and not i.de_su_inventario;   -- #72
  if v_lineas is null then
    raise exception 'Ese pedido no trae nada de la tienda.';
  end if;

  v_venta := vender_congelado(
    'mayor', v_metodo, v_lineas, v_cli,
    btrim(c.nombre || ' ' || coalesce(c.apellido, '')), c.telefono,
    'Pedido #' || a.id || ' de ' || r.nombre,
    auth.uid(), r.id, v_ref);

  update abonos set venta_id = v_venta where apartado_id = a.id;

  update apartados
     set estado = 'retirado', retirado_en = now(), retirado_por = auth.uid(),
         venta_id = v_venta, cliente_maestro_id = v_cli
   where id = a.id;

  return v_venta;
end;
$fn$;

revoke all on function aprobar_apartado(bigint) from public, anon;
grant execute on function aprobar_apartado(bigint) to authenticated;

create or replace function rv_resumen(p_sesion text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id    bigint := rv_de_sesion(p_sesion);
  r       revendedores%rowtype;
  v_tope  record;
  v_mes   jsonb;
  v_meses jsonb;
  v_cred  numeric;
  v_fases jsonb;
  v_vent  numeric;
  v_venc  int;
begin
  select * into r from revendedores where id = v_id;
  select * into v_tope from rv_tope(v_id);
  select valor into v_vent from configuracion where clave = 'revendedor_dias_ventana';

  select jsonb_build_object(
           'piezas',    coalesce(sum(i.cantidad), 0),
           'vendido_usd', coalesce(sum(i.precio_clienta_usd * i.cantidad), 0),
           'pagado_usd',  coalesce(sum(i.precio_lux_usd * i.cantidad), 0),
           -- #72: lo suyo no: no se sabe lo que pagó por cada unidad.
           'ganancia_usd', coalesce(sum((i.precio_clienta_usd - i.precio_lux_usd) * i.cantidad)
                                      filter (where not i.de_su_inventario), 0))
    into v_mes
    from apartados a
    join apartado_items i on i.apartado_id = a.id
   where a.revendedor_id = v_id and a.estado = 'retirado'
     and a.retirado_en >= date_trunc('month', now());

  select jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'piezas', coalesce(x.piezas, 0),
           'vendido_usd', coalesce(x.vendido, 0),
           'ganancia_usd', coalesce(x.ganancia, 0)) order by m.mes)
    into v_meses
    from generate_series(date_trunc('month', now()) - interval '5 months',
                         date_trunc('month', now()), interval '1 month') m(mes)
    left join (
      select date_trunc('month', a.retirado_en) as mes,
             sum(i.cantidad) as piezas,
             sum(i.precio_clienta_usd * i.cantidad) as vendido,
             sum((i.precio_clienta_usd - i.precio_lux_usd) * i.cantidad)
               filter (where not i.de_su_inventario) as ganancia
        from apartados a
        join apartado_items i on i.apartado_id = a.id
       where a.revendedor_id = v_id and a.estado = 'retirado'
         and a.retirado_en >= date_trunc('month', now()) - interval '5 months'
       group by 1
    ) x on x.mes = m.mes;

  -- Lo que sus clientas le deben: pedidos confirmados vigentes y vendidos.
  select coalesce(sum(rv_falta_de(a.id)), 0)
    into v_cred
    from apartados a
   where a.revendedor_id = v_id
     and (a.estado = 'retirado'
          or (a.estado = 'abierto' and a.confirmado_en is not null and a.expira_en > now()));

  select jsonb_object_agg(f.fase, f.n)
    into v_fases
    from (select rv_fase_de(a.id) as fase, count(*)::int as n
            from apartados a
           where a.revendedor_id = v_id
             and (a.estado = 'abierto' or (a.estado = 'retirado' and a.entregado_en is null))
           group by 1) f;

  select count(*)::int into v_venc
    from apartados a
   where a.revendedor_id = v_id and a.estado = 'abierto' and a.confirmado_en is not null
     and a.expira_en <= now()
     and a.expira_en > now() - make_interval(days => greatest(coalesce(v_vent, 0), 0)::int);

  return jsonb_build_object(
    'usuario',          r.usuario,
    'nombre',           r.nombre,
    'catalogo_nombre',  coalesce(r.catalogo_nombre, r.nombre),
    'catalogo_propio',  r.catalogo_nombre,
    'telefono',         r.telefono,
    'paleta',           r.paleta,
    'logo_path',        r.logo_path,
    'descuento_pct',    rv_descuento_de(v_id),
    'sobre_etiqueta_usd', coalesce((select valor from configuracion where clave = 'revendedor_sobre_etiqueta_usd'), 0),
    'dias_apartado',    0,
    'vencidos_para_bajar', coalesce((select valor from configuracion where clave = 'revendedor_vencidos_para_bajar'), 0),
    'dias_ventana',     coalesce(v_vent, 0),
    'tope',             to_jsonb(v_tope),
    'mes',              v_mes,
    'meses',            v_meses,
    'credito_usd',      round(v_cred, 2),
    'abiertos',         (select count(*)::int from apartados a
                          where a.revendedor_id = v_id and a.estado = 'abierto' and a.expira_en > now()),
    'por_vencer',       coalesce((v_fases->>'por_pagar_lux')::int, 0),
    'vencidos',         v_venc,
    -- Nuevas.
    'fases',            coalesce(v_fases, '{}'::jsonb),
    'horas_pago',       (select valor from configuracion where clave = 'revendedor_horas_pago'),
    'horas_para_pagar', (select valor from configuracion where clave = 'revendedor_horas_para_pagar'),
    'inicial_pct',      (select valor from configuracion where clave = 'apartado_inicial_pct'),
    'dias_credito',     r.dias_credito,
    'pago_movil_cedula',   r.pago_movil_cedula,
    'pago_movil_telefono', r.pago_movil_telefono,
    'pago_movil_banco',    r.pago_movil_banco);
end;
$fn$;

revoke all on function rv_resumen(text) from public;
grant execute on function rv_resumen(text) to anon, authenticated;

create or replace function rv_apartados(p_sesion text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
begin
  return coalesce((
    select jsonb_agg(fila order by orden, clave)
      from (
        select case when a.estado = 'abierto' and a.expira_en > now() then 0
                    when a.estado = 'retirado' and (a.entregado_en is null or rv_falta_de(a.id) > 0) then 1
                    else 2 end as orden,
               -- Lo que espera que alguien confirme (plazo infinito) va arriba:
               -- es lo que pide atención.
               case when a.estado = 'abierto' and a.expira_en > now()
                    then extract(epoch from case when a.expira_en = 'infinity' then a.creado_en else a.expira_en end)
                    else -extract(epoch from coalesce(a.retirado_en, a.cancelado_en, least(a.expira_en, now()))) end as clave,
               jsonb_build_object(
                 'id',          a.id,
                 'token',       a.token,
                 'estado',      case when a.estado = 'abierto' and a.expira_en <= now() then 'vencido' else a.estado end,
                 'creado_en',   a.creado_en,
                 'expira_en',   case when a.expira_en = 'infinity' then null else a.expira_en end,
                 'retirado_en', a.retirado_en,
                 'cancelado_en', a.cancelado_en,
                 'motivo',      a.motivo,
                 'cliente',     jsonb_build_object('id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
                                                   'telefono', c.telefono, 'cedula', c.cedula),
                 'items',       (select jsonb_agg(jsonb_build_object(
                                          'modelo_id', i.modelo_id, 'sku', m.sku, 'nombre', m.nombre,
                                          'variante', m.variante, 'foto_thumb_path', m.foto_thumb_path,
                                          'cantidad', i.cantidad,
                                          'precio_usd', i.precio_clienta_usd,
                                          'precio_lux_usd', i.precio_lux_usd,
                                          'de_su_inventario', i.de_su_inventario) order by m.nombre, i.de_su_inventario desc)
                                   from apartado_items i join modelos m on m.id = i.modelo_id
                                  where i.apartado_id = a.id),
                 'total_usd',   t.cliente,
                 'lux_usd',     t.lux,
                 'abonado_usd', coalesce((select sum(b.monto_bcv) from apartado_abonos b
                                           where b.apartado_id = a.id and b.anulado_en is null), 0),
                 'falta_usd',   rv_falta_de(a.id),
                 'abonos',      coalesce((select jsonb_agg(jsonb_build_object(
                                          'id', b.id, 'fecha', b.fecha, 'metodo', b.metodo, 'monto_bs', b.monto_bs,
                                          'monto_usd', b.monto_usd, 'monto_bcv', round(b.monto_bcv, 4),
                                          'referencia', b.referencia, 'origen', b.origen,
                                          'pago_cedula', b.pago_cedula, 'pago_telefono', b.pago_telefono,
                                          'estado', case when b.anulado_en is not null then 'no_llego'
                                                         when b.confirmado_en is not null then 'recibido'
                                                         else 'por_revisar' end,
                                          'falta_despues_bcv', s.falta_despues_bcv) order by b.fecha, b.id)
                                            from apartado_abonos b
                                            join apartado_abonos_saldo s on s.id = b.id
                                           where b.apartado_id = a.id), '[]'::jsonb),
                 -- Nuevas.
                 'fase',          rv_fase_de(a.id),
                 'origen',        a.origen,
                 'reportado_en',  a.reportado_en,
                 'confirmado_en', a.confirmado_en,
                 'plazo_lux_en',  a.plazo_lux_en,
                 'vence_clienta_en', a.vence_clienta_en,
                 'entregado_en',  a.entregado_en,
                 'minimo_usd',    round(t.cliente * (select valor from configuracion where clave = 'apartado_inicial_pct') / 100, 4),
                 'lux_pagado_usd',    round(t.lux - greatest(saldo_padre_bcv(null, null, a.id), 0), 4),
                 'lux_verificado_usd', round(t.lux - greatest(saldo_padre_bcv(null, null, a.id, null, true), 0), 4),
                 'lux_falta_usd',     greatest(round(saldo_padre_bcv(null, null, a.id), 4), 0),
                 'pagos_lux',     coalesce((select jsonb_agg(jsonb_build_object(
                                          'id', x.id, 'fecha', x.fecha, 'metodo', x.metodo,
                                          'monto_bs', x.monto_bs, 'monto_usd', x.monto_usd,
                                          'monto_bcv', round(x.monto_bcv, 4), 'referencia', x.referencia,
                                          'estado', case when x.anulado_en is not null then 'no_llego'
                                                         when x.verificado_en is not null then 'recibido'
                                                         else 'por_revisar' end,
                                          'falta_despues_bcv', xs.falta_despues_bcv) order by x.fecha, x.id)
                                            from abonos x
                                            join abonos_saldo xs on xs.id = x.id
                                           where x.apartado_id = a.id), '[]'::jsonb)
               ) as fila
          from apartados a
          join revendedor_clientes c on c.id = a.cliente_id
          cross join lateral (
            select coalesce(sum(i.precio_clienta_usd * i.cantidad), 0) as cliente,
                   coalesce(sum(i.precio_lux_usd * i.cantidad), 0)     as lux
              from apartado_items i where i.apartado_id = a.id
          ) t
         where a.revendedor_id = v_id
           and ((a.estado = 'abierto' and a.expira_en > now())
                or (a.estado = 'retirado' and (a.entregado_en is null or rv_falta_de(a.id) > 0))
                or coalesce(a.retirado_en, a.cancelado_en, least(a.expira_en, now())) > now() - interval '120 days')
         order by 1, 2
         limit 300
      ) x
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function rv_apartados(text) from public;
grant execute on function rv_apartados(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. SU CATÁLOGO: LO LIBRE DE LA TIENDA MÁS LO SUYO
-- ---------------------------------------------------------------------

-- La del #68: mismas columnas y misma firma (por eso basta `create or
-- replace`). Lo nuevo: suma lo suyo libre, y una pieza suya sale aunque
-- la tienda no la tenga, la haya retirado o el piso no deje rebaja. Su
-- clienta no sabe de dónde sale cada unidad. Ninguna columna de costo,
-- piso ni de lo que él le paga a Lux.
create or replace function rv_catalogo_publico(p_usuario text)
returns table (
  id              bigint,
  sku             text,
  nombre          text,
  categoria       text,
  variantes_nota  text,
  foto_path       text,
  foto_thumb_path text,
  precio_usd      numeric,
  precio_bs       numeric,
  disponible      int,
  familia         bigint,
  variante        text,
  para            text
)
language sql
stable
security definer
set search_path = public
as $fn$
  with r as (
    select rv.id, rv_descuento_de(rv.id) as descuento
      from revendedores rv
     where rv.usuario = lower(btrim(coalesce(p_usuario, ''))) and rv.activo
  ), de_tienda as (
    select p.id, p.disponible::int as n
      from v_disponible_publico p
     cross join r
     where rv_precio_lux(p.id, r.descuento) < p.precio_usd
  ), suyo as (
    select i.modelo_id as id, i.libre as n
      from r cross join lateral rv_inventario(r.id) i
     where i.libre > 0
  ), d as (
    select x.id, sum(x.n)::int as n
      from (select * from de_tienda union all select * from suyo) x
     group by x.id
  )
  select m.id, m.sku, m.nombre, m.categoria, m.variantes_nota, m.foto_path, m.foto_thumb_path,
         x.precio,
         round(x.precio * t.tasa_bcv, 2),
         d.n,
         coalesce(m.familia_id, m.id),
         m.variante,
         m.para
    from d
    join modelos m on m.id = d.id
   cross join r
    left join grupos_precio g on g.id = m.grupo_precio_id
    left join revendedor_precios rp on rp.revendedor_id = r.id and rp.modelo_id = m.id
    left join lateral (select tasa_bcv from tasas where vigente limit 1) t on true
   cross join lateral (
     select rv_precio_clienta(rp.precio_usd, coalesce(m.precio_override_usd, g.precio_usd)) as precio
   ) x
   where coalesce(m.precio_override_usd, g.precio_usd) is not null;
$fn$;

revoke all on function rv_catalogo_publico(text) from public;
grant execute on function rv_catalogo_publico(text) to anon, authenticated;

-- Lo que ve en Vender y en Precios. Cambia lo que devuelve (`mias` al
-- final): se borra y se crea en una transacción. `disponible` es lo de
-- la tienda más lo suyo libre, así el navegador de antes pide bien.
begin;

drop function if exists rv_piezas(text);

create function rv_piezas(p_sesion text)
returns table (
  id              bigint,
  sku             text,
  nombre          text,
  categoria       text,
  variantes_nota  text,
  foto_path       text,
  foto_thumb_path text,
  familia         bigint,
  variante        text,
  disponible      int,
  etiqueta_usd    numeric,
  precio_lux_usd  numeric,
  minimo_usd      numeric,
  precio_usd      numeric,
  precio_propio   numeric,
  ganancia_usd    numeric,
  -- Nueva (#72): las suyas libres.
  mias            int
)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id   bigint := rv_de_sesion(p_sesion);
  v_desc numeric := rv_descuento_de(v_id);
begin
  return query
  with de_tienda as (
    select p.id, p.disponible::int as n
      from v_disponible_publico p
     where rv_precio_lux(p.id, v_desc) < p.precio_usd
  ), suyo as (
    select i.modelo_id as id, greatest(i.libre, 0) as n
      from rv_inventario(v_id) i
     where i.tiene > 0
  ), d as (
    select coalesce(t.id, s.id) as id, coalesce(t.n, 0) as tienda, coalesce(s.n, 0) as mias
      from de_tienda t full join suyo s on s.id = t.id
  )
  select m.id, m.sku, m.nombre, m.categoria, m.variantes_nota, m.foto_path, m.foto_thumb_path,
         coalesce(m.familia_id, m.id), m.variante,
         (d.tienda + d.mias)::int,
         l.lista,
         x.lux,
         rv_minimo_clienta(l.lista),
         x.precio,
         rp.precio_usd,
         x.precio - x.lux,
         d.mias::int
    from d
    join modelos m on m.id = d.id
    left join grupos_precio g on g.id = m.grupo_precio_id
    left join revendedor_precios rp on rp.revendedor_id = v_id and rp.modelo_id = m.id
   cross join lateral (select coalesce(m.precio_override_usd, g.precio_usd) as lista) l
   cross join lateral (
     select rv_precio_lux(m.id, v_desc) as lux,
            rv_precio_clienta(rp.precio_usd, l.lista) as precio
   ) x
   where l.lista is not null
   order by m.categoria, m.nombre, m.variante;
end;
$fn$;

revoke all on function rv_piezas(text) from public;
grant execute on function rv_piezas(text) to anon, authenticated;

commit;

-- La de esquema-revendedores.sql, misma firma. Lo nuevo: también le pone
-- precio a una pieza suya que la tienda ya no vende o que no deja rebaja.
create or replace function rv_fijar_precios(p_sesion text, p_precios jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id     bigint := rv_de_sesion(p_sesion);
  v_desc   numeric := rv_descuento_de(v_id);
  v_x      jsonb;
  v_modelo bigint;
  v_precio numeric;
  v_lista  numeric;
  v_activo boolean;
  v_nombre text;
  v_min    numeric;
  v_n      int := 0;
begin
  if p_precios is null or jsonb_typeof(p_precios) <> 'array' then
    raise exception 'No llegó ningún precio.';
  end if;

  for v_x in select * from jsonb_array_elements(p_precios) loop
    v_modelo := (v_x->>'modelo_id')::bigint;
    v_precio := nullif(v_x->>'precio_usd', '')::numeric;

    if v_precio is null then
      delete from revendedor_precios where revendedor_id = v_id and modelo_id = v_modelo;
      v_n := v_n + 1;
      continue;
    end if;

    select m.nombre || coalesce(' · ' || m.variante, ''), coalesce(m.precio_override_usd, g.precio_usd), m.activo
      into v_nombre, v_lista, v_activo
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo;
    if not found or v_lista is null then
      raise exception 'Una de las piezas ya no está en el catálogo.';
    end if;
    -- #72: en su catálogo está lo de la tienda que le deja rebaja, y lo suyo.
    if not ((v_activo and rv_precio_lux(v_modelo, v_desc) < v_lista)
            or exists (select 1 from rv_inventario(v_id) i where i.modelo_id = v_modelo and i.tiene > 0)) then
      raise exception '"%" no está en tu catálogo.', v_nombre;
    end if;

    v_min := rv_minimo_clienta(v_lista);
    if round(v_precio, 2) < v_min then
      raise exception 'El precio de "%" no puede ser menor que $% BCV: el tuyo va siempre por encima del de la tienda.',
        v_nombre, to_char(v_min, 'FM999G999G990D00');
    end if;

    insert into revendedor_precios (revendedor_id, modelo_id, precio_usd)
    values (v_id, v_modelo, round(v_precio, 2))
    on conflict (revendedor_id, modelo_id)
    do update set precio_usd = excluded.precio_usd, actualizado_en = now();
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

revoke all on function rv_fijar_precios(text, jsonb) from public;
grant execute on function rv_fijar_precios(text, jsonb) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. "MI INVENTARIO" EN SU PANEL
-- ---------------------------------------------------------------------

-- Cada pieza que tiene o tuvo: cuántas, cuántas en pedidos, cuántas
-- libres, su precio y lo último que se movió. Nada de lo que paga a Lux.
create or replace function rv_mi_inventario(p_sesion text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'modelo_id',       i.modelo_id,
             'sku',             m.sku,
             'nombre',          m.nombre,
             'variante',        m.variante,
             'categoria',       m.categoria,
             'foto_thumb_path', m.foto_thumb_path,
             'tiene',           i.tiene,
             'apartadas',       i.apartadas,
             'libre',           i.libre,
             'compradas',       i.compradas,
             'vendidas',        i.vendidas,
             'precio_usd',      rv_precio_clienta(rp.precio_usd, coalesce(m.precio_override_usd, g.precio_usd)),
             'movimientos',     coalesce((
               select jsonb_agg(jsonb_build_object('fecha', mv.fecha, 'cantidad', mv.cantidad,
                                                   'motivo', mv.motivo) order by mv.fecha desc)
                 from (
                   select * from (
                     select v.fecha, i2.cantidad::int as cantidad,
                            case when v.devolucion_de is not null then 'Devuelta a la tienda'
                                 else 'Comprada a Lux' end as motivo
                       from venta_items i2
                       join ventas v on v.id = i2.venta_id
                       left join ventas o on o.id = v.devolucion_de
                      where coalesce(v.inventario_de, o.inventario_de) = v_id
                        and i2.modelo_id = i.modelo_id and not v.anulada and i2.cantidad <> 0
                     union all
                     select a.creado_en, a.cantidad, a.motivo
                       from revendedor_ajustes a
                      where a.revendedor_id = v_id and a.modelo_id = i.modelo_id
                     union all
                     select ap.retirado_en, -ai.cantidad,
                            'Vendida a ' || btrim(c.nombre || ' ' || coalesce(c.apellido, ''))
                       from apartado_items ai
                       join apartados ap on ap.id = ai.apartado_id
                       join revendedor_clientes c on c.id = ap.cliente_id
                      where ap.revendedor_id = v_id and ai.modelo_id = i.modelo_id
                        and ai.de_su_inventario and ap.estado = 'retirado'
                   ) todo
                   order by 1 desc
                   limit 10
                 ) mv), '[]'::jsonb)
           ) order by (i.tiene > 0) desc, m.nombre, m.variante)
      from rv_inventario(v_id) i
      join modelos m on m.id = i.modelo_id
      left join grupos_precio g on g.id = m.grupo_precio_id
      left join revendedor_precios rp on rp.revendedor_id = v_id and rp.modelo_id = m.id
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function rv_mi_inventario(text) from public;
grant execute on function rv_mi_inventario(text) to anon, authenticated;

-- Corregir a mano, en las dos direcciones (decisión del dueño), con su
-- motivo. Nunca por debajo de lo que tiene en pedidos ni de cero.
create or replace function rv_ajustar_inventario(p_sesion text, p_modelo_id bigint, p_cantidad int, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id     bigint := rv_de_sesion(p_sesion);
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nombre text;
  v_libre  int;
  f        record;
begin
  if coalesce(p_cantidad, 0) = 0 then
    raise exception 'Di cuántas sumas o restas: la cantidad no puede ser cero.';
  end if;
  if abs(p_cantidad) > 999 then
    raise exception 'De una vez, hasta 999 piezas.';
  end if;
  if v_motivo is null or length(v_motivo) < 2 then
    raise exception 'Escribe por qué cambias tu inventario: queda anotado.';
  end if;
  if length(v_motivo) > 200 then
    raise exception 'El motivo es muy largo: hasta 200 letras.';
  end if;

  -- La misma fila que bloquea sus pedidos: no se cruzan.
  perform 1 from revendedores where id = v_id for update;

  select m.nombre || coalesce(' · ' || m.variante, '') into v_nombre from modelos m where m.id = p_modelo_id;
  if not found then
    raise exception 'Esa pieza no existe.';
  end if;

  if p_cantidad < 0 then
    v_libre := rv_libre_de(v_id, p_modelo_id);
    if v_libre + p_cantidad < 0 then
      raise exception 'De "%" tienes % libres (lo de tus pedidos abiertos no se quita): no puedes restar %.',
        v_nombre, greatest(v_libre, 0), -p_cantidad;
    end if;
  end if;

  insert into revendedor_ajustes (revendedor_id, modelo_id, cantidad, motivo, quien)
  values (v_id, p_modelo_id, p_cantidad, v_motivo, 'revendedor');

  select * into f from rv_inventario(v_id) i where i.modelo_id = p_modelo_id;
  return jsonb_build_object('tiene', coalesce(f.tiene, 0), 'libre', coalesce(f.libre, 0));
end;
$fn$;

revoke all on function rv_ajustar_inventario(text, bigint, int, text) from public;
grant execute on function rv_ajustar_inventario(text, bigint, int, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. EL RESPALDO GANA LOS AJUSTES (la del #65, misma firma)
-- ---------------------------------------------------------------------

create or replace function admin_respaldo(p_tabla text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_filas jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede sacar un respaldo.';
  end if;
  if p_tabla not in ('modelos', 'lotes', 'venta_items',
                     'abonos', 'abono_cambios', 'caja_movimientos',
                     'revendedores', 'revendedor_precios', 'revendedor_clientes',
                     'apartados', 'apartado_items', 'apartado_abonos',
                     'por_llegar', 'reserva_armados',
                     'landing_secciones', 'catalogo_miradas',
                     'ofertas_casa', 'oferta_casa_items', 'seleccion_manual',
                     'combos_rearmados', 'combos_semana', 'combo_semana_items',
                     'ofertas_codigos', 'ofertas_codigo_items',
                     'revendedor_ajustes') then
    raise exception 'Esa tabla no esta en la lista del respaldo: %', p_tabla;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %I t', p_tabla)
     into v_filas;
  return v_filas;
end;
$fn$;

revoke all on function admin_respaldo(text) from public, anon;
grant execute on function admin_respaldo(text) to authenticated;

notify pgrst, 'reload schema';
