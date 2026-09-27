-- =====================================================================
-- Lux by Emory — a dónde pagar, y el histórico que no se borra
-- Ejecutar en el SQL Editor DESPUÉS de esquema-apartadas-en-mostrador.sql
--
-- QUÉ HACE
--
-- 1. LOS DATOS DEL PAGO MÓVIL, UNO POR UNO
--    La clienta que pide por el catálogo llega a "Ahora el pago" y veía un
--    texto corrido, o nada. Ahora ve cédula, teléfono y banco, cada uno con
--    su botón de copiar: los pega en la aplicación de su banco sin
--    equivocarse de un dígito. Viven en `textos` para que se cambien desde
--    la pantalla de Textos sin desplegar nada.
--
-- 2. LAS VENTAS Y LOS PEDIDOS NO SE BORRAN, NI POR ERROR
--    Ya no se borraban: ninguna pantalla ni función lo hace. Verificar una
--    venta la marca como comprobada; anularla la marca como anulada; un
--    pedido del catálogo se cancela o vence, y queda. Pero la base lo
--    permitía: `reservas` tenía una política "para todo" y cualquiera con
--    sesión podía borrar un pedido desde la consola del navegador.
--    Desde aquí la base lo impide dos veces:
--      - nadie con sesión tiene el permiso de borrar ni de vaciar esas
--        cuatro tablas;
--      - y un disparador rechaza cualquier borrado, venga de donde venga,
--        incluido el SQL Editor. Quitarlo exige hacerlo a propósito.
--
-- 3. JUNTAR DOS FICHAS YA NO SUELTA LOS PEDIDOS
--    `admin_fusionar_clientes` movía las ventas a la ficha que se queda,
--    pero no los pedidos del catálogo: al borrar la ficha que se va, sus
--    pedidos quedaban sin clienta. Ahora se mueven también.
--
-- 4. LA FICHA DE LA CLIENTA CUENTA SU CRÉDITO
--    Una venta "por verificar" salía de Pedidos al verificarse y en la ficha
--    se veía igual que una pagada en el acto: el histórico de quién pagó
--    después, y cuánto tardó, no se veía en ningún sitio. `v_cliente_compras`
--    añade al final si está por verificar, cuándo se verificó, si se anuló
--    porque el pago no llegó y la referencia, e incluye esas anuladas: "no
--    pagó" también es parte del histórico.
--
-- Firmas: las mismas. El navegador viejo sigue funcionando.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL PAGO MÓVIL
-- `do nothing`: si se vuelve a correr, no pisa lo que el dueño corrigió.
-- ---------------------------------------------------------------------

insert into textos (clave, valor, descripcion) values
  ('pago_movil_cedula',   '26482389',     'Pago móvil: cédula del titular'),
  ('pago_movil_telefono', '04147158596',  'Pago móvil: teléfono'),
  ('pago_movil_banco',    '0134 Banesco', 'Pago móvil: código y nombre del banco')
on conflict (clave) do nothing;


-- ---------------------------------------------------------------------
-- 2. NADA DEL HISTÓRICO SE BORRA
-- ---------------------------------------------------------------------

-- Primera puerta: el permiso. Postgres lo mira antes que las políticas,
-- así que la política "para todo" de `reservas` ya no alcanza para borrar.
revoke delete, truncate on ventas, venta_items, reservas, reserva_items
  from anon, authenticated;

-- Segunda puerta: el disparador. Vale también para el dueño de la base y
-- para las funciones de definidor, que se saltan los permisos.
create or replace function historico_no_se_borra()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'Las ventas y los pedidos no se borran: se anulan o se cancelan, y quedan en el histórico (%).', tg_table_name
    using hint = 'Si de verdad hace falta borrar, se desactiva el disparador a propósito desde el SQL Editor.';
end;
$fn$;

drop trigger if exists ventas_no_se_borran        on ventas;
drop trigger if exists ventas_no_se_vacian        on ventas;
drop trigger if exists venta_items_no_se_borran   on venta_items;
drop trigger if exists venta_items_no_se_vacian   on venta_items;
drop trigger if exists reservas_no_se_borran      on reservas;
drop trigger if exists reservas_no_se_vacian      on reservas;
drop trigger if exists reserva_items_no_se_borran on reserva_items;
drop trigger if exists reserva_items_no_se_vacian on reserva_items;

create trigger ventas_no_se_borran        before delete   on ventas        for each row       execute function historico_no_se_borra();
create trigger ventas_no_se_vacian        before truncate on ventas        for each statement execute function historico_no_se_borra();
create trigger venta_items_no_se_borran   before delete   on venta_items   for each row       execute function historico_no_se_borra();
create trigger venta_items_no_se_vacian   before truncate on venta_items   for each statement execute function historico_no_se_borra();
create trigger reservas_no_se_borran      before delete   on reservas      for each row       execute function historico_no_se_borra();
create trigger reservas_no_se_vacian      before truncate on reservas      for each statement execute function historico_no_se_borra();
create trigger reserva_items_no_se_borran before delete   on reserva_items for each row       execute function historico_no_se_borra();
create trigger reserva_items_no_se_vacian before truncate on reserva_items for each statement execute function historico_no_se_borra();


-- ---------------------------------------------------------------------
-- 3. JUNTAR DOS FICHAS: LOS PEDIDOS VAN CON LAS VENTAS
-- Igual que en esquema-clientes.sql, más la línea de `reservas`. Sigue
-- devolviendo cuántas VENTAS movió, que es lo que la pantalla enseña.
-- ---------------------------------------------------------------------

create or replace function admin_fusionar_clientes(
  p_se_va    bigint,
  p_se_queda bigint
) returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_movidas int;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede juntar dos fichas.';
  end if;
  if p_se_va is null or p_se_queda is null or p_se_va = p_se_queda then
    raise exception 'Hacen falta dos fichas distintas.';
  end if;
  if not exists (select 1 from clientes where id = p_se_va)
     or not exists (select 1 from clientes where id = p_se_queda) then
    raise exception 'Alguna de las dos fichas ya no existe.';
  end if;

  update ventas set cliente_id = p_se_queda where cliente_id = p_se_va;
  get diagnostics v_movidas = row_count;

  -- Sin esto, el `on delete set null` de `reservas.cliente_id` dejaba los
  -- pedidos de la ficha que se va sin clienta.
  update reservas set cliente_id = p_se_queda where cliente_id = p_se_va;

  -- Lo que le faltaba a la que se queda se lo presta la que se va.
  update clientes q
     set cedula   = coalesce(q.cedula, v.cedula),
         apellido = coalesce(q.apellido, v.apellido),
         telefono = coalesce(q.telefono, v.telefono),
         notas    = coalesce(q.notas, v.notas),
         actualizado_en = now()
    from clientes v
   where q.id = p_se_queda and v.id = p_se_va;

  delete from clientes where id = p_se_va;

  return v_movidas;
end;
$fn$;

revoke all on function admin_fusionar_clientes(bigint, bigint) from public, anon;
grant execute on function admin_fusionar_clientes(bigint, bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 4. LA FICHA, CON SU CRÉDITO
-- Mismas columnas y en el mismo orden que en esquema-variantes-y-mostrador.sql;
-- las nuevas van al final.
--
-- Entran también las ventas anuladas PORQUE EL PAGO NO LLEGÓ: no dan
-- servicio ni suman, pero son parte del crédito de la clienta. Las que el
-- administrador anuló por otra cosa (una venta cargada por error) siguen
-- fuera, como antes. Las distingue la nota que deja
-- `anular_venta_por_verificar`, que es la única que escribe "Anulada sin
-- pago".
-- ---------------------------------------------------------------------

create or replace view v_cliente_compras
with (security_invoker = off) as
select
  v.cliente_id,
  v.id            as venta_id,
  v.fecha,
  v.tipo,
  v.metodo,
  v.total_bs,
  v.total_usd,
  i.modelo_id,
  m.sku,
  m.nombre,
  m.categoria,
  m.variantes_nota,
  m.foto_thumb_path,
  i.cantidad,
  i.precio_unitario_bs,
  (v.fecha + make_interval(months => meses_servicio()))        as servicio_hasta,
  (now() < v.fecha + make_interval(months => meses_servicio())) as servicio_vigente,
  m.variante,
  v.por_verificar,
  v.verificada_en,
  v.anulada       as anulada_sin_pago,
  v.pago_referencia
from ventas v
join venta_items i on i.venta_id = v.id
join modelos m     on m.id = i.modelo_id
where v.cliente_id is not null
  and (not v.anulada or v.notas like '%Anulada sin pago:%')
  and auth.uid() is not null;

grant select on v_cliente_compras to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Los datos del pago:
--      select clave, valor from textos where clave like 'pago_movil_%';
--        -> 3 filas: 26482389, 04147158596, 0134 Banesco
--
-- 2. Que no se borra nada. Pega las tres líneas juntas: TIENE QUE FALLAR
--    con "Las ventas y los pedidos no se borran". Van dentro de begin y
--    rollback para que, aunque algo saliera mal, no se pierda nada:
--      begin;
--      delete from reservas where id = (select min(id) from reservas);
--      rollback;
--
-- 3. Los disparadores, ocho:
--      select tgname from pg_trigger where tgname like '%no_se_%' order by 1;
--
-- 4. Cuántas ventas por verificar hay, y que siguen todas ahí:
--      select count(*) from ventas where por_verificar and not anulada;
--        -> el mismo número que la sección "Por verificar" de Pedidos.
-- =====================================================================
