-- =====================================================================
-- #70 · esquema-descuento-clienta.sql
-- El 20 % de los revendedores y la clienta con descuento fijo
-- (fase 3, pedido del dueño del 18/11/2026; decidido el 23/11/2026).
-- Depende del #69 (esquema-dominio.sql). Se puede correr varias veces.
--
-- QUÉ HACE
-- 1. El descuento general de los revendedores pasa de 25 % a 20 %
--    (`revendedor_descuento_pct`), y ese general es también el TOPE: un
--    revendedor puede tener uno propio menor, nunca mayor. Lo cuida un
--    disparador al guardar (`revendedor_descuento_tope`) y lo cuida
--    `rv_descuento_de` al cobrar (least del propio y el general: si el
--    dueño baja el general después, nadie queda por encima). Los que hoy
--    tienen uno propio mayor quedan con el general (propio vacío); la
--    última consulta del archivo los nombra. Los pedidos ya confirmados
--    conservan sus precios congelados.
-- 2. Una clienta puede tener un descuento fijo (`clientes.descuento_pct`).
--    Lo pone SOLO el administrador (`admin_descuento_cliente`). En el
--    mostrador, al elegir SU ficha, cada pieza sale a la etiqueta menos ese
--    %, nunca por debajo del piso de margen: la misma cuenta del tramo
--    (`precio_de_linea`). Con tramo o con código manda el mayor; no se
--    suman. Con él, el precio a mano se ignora, como con el tramo. La
--    línea dice `motivo_rebaja = 'cliente'` y `v_rebajas` la enseña.
--    `registrar_venta` y `apartar_en_tienda` (mismas firmas) lo aplican;
--    el catálogo en línea no (cualquiera que sepa su cédula se lo
--    llevaría). Si la vendedora escribe la cédula como ficha nueva, no hay
--    descuento: llega por `p_cliente_id`, que es lo que el carrito ve.
-- 3. Un revendedor se enlaza con su ficha de clienta
--    (`revendedores.cliente_id`, `admin_enlazar_cliente_revendedor`).
--    `v_clientes` gana `descuento_pct` y `es_revendedor` al final;
--    `v_revendedores`, `cliente_id` y `cliente_nombre`.
--    `admin_fusionar_clientes` (misma firma) lleva el enlace y el descuento.
--
-- DEBERÍA DAR (SQL Editor, después de correrlo)
--   select valor from configuracion where clave = 'revendedor_descuento_pct';  -> 20
--   select usuario, descuento_pct, rv_descuento_de(id) from revendedores;     -> nadie con más de 20
--   Con una clienta del 20 % y una pieza de etiqueta $20 BCV con margen
--   holgado, el mostrador cobra $16 BCV ("descuento de clienta"); con 5
--   piezas y un tramo del 25 %, manda el tramo. Escribiendo su cédula como
--   ficha nueva, $20.
--   Como vendedora, esto TIENE QUE FALLAR:
--     select admin_descuento_cliente(1, 20);   -- "Solo un administrador..."
--
-- Probado en PGlite con la instalación entera (36 comprobaciones).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL 20 % DE LOS REVENDEDORES, Y EL GENERAL COMO TOPE
-- ---------------------------------------------------------------------

update configuracion set valor = 20 where clave = 'revendedor_descuento_pct';

create or replace function rv_descuento_de(p_revendedor_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  with g as (select coalesce((select valor from configuracion where clave = 'revendedor_descuento_pct'), 0) as general)
  select least(coalesce((select descuento_pct from revendedores where id = p_revendedor_id), g.general), g.general)
    from g;
$fn$;

revoke all on function rv_descuento_de(bigint) from public, anon;
grant execute on function rv_descuento_de(bigint) to authenticated;

-- Al guardar: uno propio no pasa del general. Solo si cambia: si el dueño
-- baja el general, pausar o editar a alguien que ya tenía más no se traba
-- (de todas formas recibe el general, por `rv_descuento_de`).
create or replace function revendedor_descuento_tope()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_general numeric := coalesce((select valor from configuracion where clave = 'revendedor_descuento_pct'), 0);
begin
  if tg_op = 'UPDATE' and new.descuento_pct is not distinct from old.descuento_pct then
    return new;
  end if;
  if new.descuento_pct is not null and new.descuento_pct > v_general then
    raise exception 'El descuento propio no puede pasar del general, % %%. Déjalo vacío para darle el general.',
      to_char(v_general, 'FM990D##');
  end if;
  return new;
end;
$fn$;

drop trigger if exists revendedor_descuento_tope on revendedores;
create trigger revendedor_descuento_tope
  before insert or update of descuento_pct on revendedores
  for each row execute function revendedor_descuento_tope();


-- ---------------------------------------------------------------------
-- 2. LA CLIENTA CON DESCUENTO FIJO
-- ---------------------------------------------------------------------

alter table clientes add column if not exists descuento_pct numeric(5,2);
alter table clientes drop constraint if exists clientes_descuento_pct_check;
alter table clientes add constraint clientes_descuento_pct_check
  check (descuento_pct is null or (descuento_pct > 0 and descuento_pct < 100));
comment on column clientes.descuento_pct is
  'Descuento fijo de la clienta en el mostrador, sobre la etiqueta y nunca bajo el piso de margen. Null: sin descuento. Solo lo escribe admin_descuento_cliente.';

-- Nadie con sesión escribe la tabla en crudo (ya era así: solo `select`).
-- Se repite por si alguna vez se abrió: el descuento no puede quedar a
-- mano de la vendedora.
revoke insert, update, delete, truncate on clientes from anon, authenticated;

-- El % de una clienta, o 0. Por dentro.
create or replace function descuento_de_clienta(p_cliente_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select descuento_pct from clientes where id = p_cliente_id), 0);
$fn$;
revoke all on function descuento_de_clienta(bigint) from public, anon, authenticated;

-- El motivo de una línea cuando el % que se le pasó a `partes_de_linea`
-- fue el de la clienta y no el del tramo. Por dentro.
create or replace function motivo_con_clienta(p_motivo text, p_tramo numeric, p_clienta numeric)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case when p_motivo = 'tramo' and coalesce(p_clienta, 0) > coalesce(p_tramo, 0)
              then 'cliente' else p_motivo end;
$fn$;
revoke all on function motivo_con_clienta(text, numeric, numeric) from public, anon, authenticated;

create or replace function admin_descuento_cliente(p_cliente_id bigint, p_pct numeric)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pct numeric := nullif(round(coalesce(p_pct, 0), 2), 0);
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede poner el descuento de una clienta.';
  end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then
    raise exception 'Esa ficha ya no existe.';
  end if;
  if v_pct is not null and (v_pct < 0 or v_pct >= 100) then
    raise exception 'El descuento va entre 0 y 100 %%, sin llegar a 100. Para quitarlo, déjalo vacío.';
  end if;
  update clientes set descuento_pct = v_pct, actualizado_en = now() where id = p_cliente_id;
end;
$fn$;
revoke all on function admin_descuento_cliente(bigint, numeric) from public, anon;
grant execute on function admin_descuento_cliente(bigint, numeric) to authenticated;


-- ---------------------------------------------------------------------
-- 3. EL REVENDEDOR ES TAMBIÉN UNA CLIENTA
-- ---------------------------------------------------------------------

alter table revendedores add column if not exists cliente_id bigint references clientes(id);
create unique index if not exists revendedores_cliente_idx on revendedores (cliente_id) where cliente_id is not null;
comment on column revendedores.cliente_id is
  'Su ficha en el maestro de clientas: lo que compra en la tienda sale ahí. La usan el crédito y su inventario (fases 4 y 5).';

create or replace function admin_enlazar_cliente_revendedor(p_revendedor_id bigint, p_cliente_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_otro text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede enlazar un revendedor con su ficha.';
  end if;
  if not exists (select 1 from revendedores where id = p_revendedor_id) then
    raise exception 'Ese revendedor ya no existe.';
  end if;
  if p_cliente_id is not null then
    if not exists (select 1 from clientes where id = p_cliente_id) then
      raise exception 'Esa ficha ya no existe.';
    end if;
    select nombre into v_otro from revendedores where cliente_id = p_cliente_id and id <> p_revendedor_id;
    if v_otro is not null then
      raise exception 'Esa ficha ya es de %: suéltala allí primero.', v_otro;
    end if;
  end if;
  update revendedores set cliente_id = p_cliente_id where id = p_revendedor_id;
end;
$fn$;
revoke all on function admin_enlazar_cliente_revendedor(bigint, bigint) from public, anon;
grant execute on function admin_enlazar_cliente_revendedor(bigint, bigint) to authenticated;

-- Juntar dos fichas: lo de siempre, y además el enlace del revendedor y el
-- descuento (si la que se queda no tiene, el de la que se va).
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
  if exists (select 1 from revendedores where cliente_id = p_se_va)
     and exists (select 1 from revendedores where cliente_id = p_se_queda) then
    raise exception 'Las dos fichas son de revendedores distintos: no se pueden juntar.';
  end if;

  update ventas set cliente_id = p_se_queda where cliente_id = p_se_va;
  get diagnostics v_movidas = row_count;

  update reservas     set cliente_id = p_se_queda         where cliente_id = p_se_va;
  update apartados    set cliente_maestro_id = p_se_queda where cliente_maestro_id = p_se_va;
  update revendedores set cliente_id = p_se_queda         where cliente_id = p_se_va;

  update clientes q
     set cedula   = coalesce(q.cedula, v.cedula),
         apellido = coalesce(q.apellido, v.apellido),
         telefono = coalesce(q.telefono, v.telefono),
         notas    = coalesce(q.notas, v.notas),
         revendedor_id = coalesce(q.revendedor_id, v.revendedor_id),
         descuento_pct = coalesce(q.descuento_pct, v.descuento_pct),
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
-- 4. LAS VISTAS (columnas nuevas al final)
-- ---------------------------------------------------------------------

-- La de esquema-devoluciones.sql, con el descuento (la vendedora lo ve: lo
-- cobra el mostrador) y qué revendedor ES esta clienta. `revendedor` sigue
-- diciendo de quién es clienta.
create or replace view v_clientes
with (security_invoker = off) as
select
  c.id,
  c.cedula,
  c.cedula_digitos,
  c.nombre,
  c.apellido,
  c.nombre_completo,
  c.telefono,
  c.notas,
  c.creado_en,
  coalesce(r.compras, 0)   as compras,
  coalesce(r.piezas, 0)    as piezas,
  coalesce(r.total_usd, 0) as total_usd,
  r.primera_compra,
  r.ultima_compra,
  (r.ultima_compra + make_interval(months => meses_servicio())) as servicio_hasta,
  (r.ultima_compra is not null
   and now() < r.ultima_compra + make_interval(months => meses_servicio())) as servicio_vigente,
  coalesce(r.total_bcv, 0) as total_bcv,
  rv.nombre                as revendedor,
  c.descuento_pct,
  (select x.nombre from revendedores x where x.cliente_id = c.id) as es_revendedor
from clientes c
left join revendedores rv on rv.id = c.revendedor_id
left join lateral (
  select
    count(*) filter (where v.devolucion_de is null)        as compras,
    sum(v.total_usd)                                       as total_usd,
    sum(v.total_bs / v.tasa_bcv_usada)                     as total_bcv,
    min(v.fecha) filter (where v.devolucion_de is null)    as primera_compra,
    max(v.fecha) filter (where v.devolucion_de is null)    as ultima_compra,
    coalesce(sum(p.piezas), 0)                             as piezas
  from ventas v
  left join lateral (
    select coalesce(sum(i.cantidad), 0) as piezas
      from venta_items i where i.venta_id = v.id
  ) p on true
  where v.cliente_id = c.id and not v.anulada
) r on true
where auth.uid() is not null;

revoke all on v_clientes from anon;
grant select on v_clientes to authenticated;

-- La de esquema-revendedores.sql, con su ficha de clienta.
create or replace view v_revendedores
with (security_invoker = off) as
select
  r.id,
  r.nombre,
  r.usuario,
  r.telefono,
  r.cedula,
  r.catalogo_nombre,
  r.paleta,
  r.logo_path,
  r.descuento_pct,
  rv_descuento_de(r.id) as descuento_efectivo_pct,
  r.tope_manual_usd,
  r.activo,
  r.notas,
  r.creado_en,
  t.nivel,
  t.niveles,
  t.tope_usd,
  t.usado_usd,
  t.libre_usd,
  t.retirado_usd,
  t.siguiente_tope_usd,
  t.falta_para_subir_usd,
  t.vencidos_recientes,
  t.bajado,
  s.abiertos,
  s.piezas_mes,
  s.pagado_mes_usd,
  s.clientas,
  s.ultima_actividad,
  r.cliente_id,
  (select c.nombre_completo from clientes c where c.id = r.cliente_id) as cliente_nombre
from revendedores r
cross join lateral rv_tope(r.id) t
cross join lateral (
  select
    (select count(*)::int from apartados a
      where a.revendedor_id = r.id and a.estado = 'abierto' and a.expira_en > now()) as abiertos,
    (select coalesce(sum(i.cantidad), 0)::int from apartados a join apartado_items i on i.apartado_id = a.id
      where a.revendedor_id = r.id and a.estado = 'retirado'
        and a.retirado_en >= date_trunc('month', now())) as piezas_mes,
    (select coalesce(sum(i.precio_lux_usd * i.cantidad), 0) from apartados a join apartado_items i on i.apartado_id = a.id
      where a.revendedor_id = r.id and a.estado = 'retirado'
        and a.retirado_en >= date_trunc('month', now())) as pagado_mes_usd,
    (select count(*)::int from revendedor_clientes c where c.revendedor_id = r.id) as clientas,
    (select max(greatest(a.creado_en, coalesce(a.retirado_en, a.creado_en))) from apartados a
      where a.revendedor_id = r.id) as ultima_actividad
) s
where es_admin();

revoke all on v_revendedores from anon;
grant select on v_revendedores to authenticated;


-- ---------------------------------------------------------------------
-- 5. EL MOTIVO 'cliente'
-- ---------------------------------------------------------------------

alter table venta_items drop constraint if exists venta_items_motivo_rebaja_check;
alter table venta_items add constraint venta_items_motivo_rebaja_check
  check (motivo_rebaja is null or motivo_rebaja in ('regateo', 'tramo', 'revendedor', 'oferta', 'cliente'));
alter table venta_items drop constraint if exists venta_items_motivo_sin_oferta_valido;
alter table venta_items add constraint venta_items_motivo_sin_oferta_valido
  check (motivo_sin_oferta is null or motivo_sin_oferta in ('regateo', 'tramo', 'revendedor', 'cliente'));
alter table reserva_items drop constraint if exists reserva_items_motivo_sin_oferta_valido;
alter table reserva_items add constraint reserva_items_motivo_sin_oferta_valido
  check (motivo_sin_oferta is null or motivo_sin_oferta in ('regateo', 'tramo', 'revendedor', 'cliente'));


-- ---------------------------------------------------------------------
-- 6. LA VENTA DEL MOSTRADOR (la de esquema-landing-y-ofertas.sql)
-- Lo único nuevo: `v_clienta` y el % que va a `partes_de_linea`, el mayor
-- entre el tramo de la línea y el de la clienta; y el motivo.
-- ---------------------------------------------------------------------

create or replace function registrar_venta(
  p_tipo             text,
  p_metodo           text,
  p_items            jsonb,
  p_kit_id           bigint default null,   -- se ignora, ver esquema-tramos-en-mostrador.sql
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null,
  p_notas            text default null,
  p_cliente_id       bigint default null,
  p_cliente_cedula   text default null,
  p_cliente_apellido text default null,
  p_por_verificar    boolean default false,
  p_pago_referencia  text default null,
  p_extra_bs         numeric default null,
  p_extra_nota       text default null,
  p_codigos          text[] default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_venta_id     bigint;
  v_cliente_id   bigint;
  v_cliente_nom  text;
  v_cliente_tel  text;
  v_tasa         tasas%rowtype;
  v_item         jsonb;
  v_modelo_id    bigint;
  v_ubicacion_id bigint;
  v_cantidad     int;
  v_disponible   int;
  v_libre        int;
  v_apartadas    int;
  v_pedido       numeric(12,4);
  v_precio_bs    numeric(14,2);
  v_operativo    numeric(12,4);
  v_ubi_nombre   text;
  v_nombre       text;
  v_piezas       int := 0;
  v_desc         numeric(5,2) := 0;
  v_clienta      numeric(5,2) := 0;
  v_tramo        jsonb;
  v_oferta       jsonb;
  v_cubiertas    jsonb := '{}'::jsonb;
  v_partes       jsonb;
  v_parte        jsonb;
  v_total_bs     numeric(14,2) := 0;
  v_extra_bs     numeric(14,2);
  v_extra_nota   text;
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

  -- Lo de fuera del catálogo, a céntimos, como todo bolívar de `ventas`.
  v_extra_bs   := round(coalesce(p_extra_bs, 0), 2);
  v_extra_nota := nullif(btrim(coalesce(p_extra_nota, '')), '');
  if v_extra_bs < 0 then
    raise exception 'Lo que sumas fuera del catálogo no puede ser negativo. Para rebajar, cambia el precio de la pieza.';
  end if;
  if v_extra_bs > 0 and v_extra_nota is null then
    raise exception 'Di qué es lo que sumas fuera del catálogo, por ejemplo "dije para la cadena".';
  end if;
  if length(v_extra_nota) > 120 then
    raise exception 'Lo que escribiste de lo que sumas es muy largo: con unas palabras basta.';
  end if;
  if v_extra_bs = 0 then
    v_extra_nota := null;
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fijala en la pantalla de Tasas antes de cobrar.';
  end if;

  v_cliente_id := resolver_cliente(p_cliente_id, p_cliente_cedula,
                                   p_cliente_nombre, p_cliente_apellido, p_cliente_telefono);

  v_cliente_nom := nullif(btrim(coalesce(p_cliente_nombre, '')), '');
  v_cliente_tel := nullif(btrim(coalesce(p_cliente_telefono, '')), '');
  if v_cliente_id is not null then
    select coalesce(v_cliente_nom, c.nombre_completo), coalesce(v_cliente_tel, c.telefono)
      into v_cliente_nom, v_cliente_tel
      from clientes c where c.id = v_cliente_id;
  end if;

  -- El descuento fijo de la clienta, solo si se eligió SU ficha: es lo que
  -- el carrito ve. Escrita como ficha nueva, va sin descuento.
  if p_cliente_id is not null and v_cliente_id = p_cliente_id then
    v_clienta := descuento_de_clienta(v_cliente_id);
  end if;

  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  -- El tramo sale de las piezas del catálogo, línea por línea: lo de fuera
  -- no es una pieza, los dijes no cuentan y solo lo reciben los que van
  -- con una base (`tramo_de_carrito`, la misma de los pedidos).
  v_tramo  := tramo_de_carrito(p_items);
  v_piezas := (v_tramo->>'piezas')::int;

  -- El candado de cada modelo, en orden: el mismo que toman los pedidos.
  for v_modelo_id in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo_id);
  end loop;

  -- Los códigos, bloqueados y mirados antes de tocar la existencia: una
  -- pieza del código tiene que estar libre, y esta venta todavía no la
  -- ha tomado.
  v_oferta := tomar_codigos(p_items, p_codigos);

  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      kit_id, cliente_id, cliente_nombre, cliente_telefono, notas,
                      por_verificar, pago_referencia, extra_bs, extra_nota)
  values (auth.uid(), p_tipo::tipo_venta, p_metodo::metodo_pago,
          v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_kit_id, v_cliente_id, v_cliente_nom, v_cliente_tel, p_notas,
          coalesce(p_por_verificar, false), nullif(btrim(coalesce(p_pago_referencia, '')), ''),
          v_extra_bs, v_extra_nota)
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo_id    := (v_item->>'modelo_id')::bigint;
    v_ubicacion_id := (v_item->>'ubicacion_id')::bigint;
    v_cantidad     := (v_item->>'cantidad')::int;
    v_pedido       := nullif(v_item->>'precio_unitario_usd', '')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    -- Se bloquea la fila, y despues se mira cuanto de ella esta libre.
    select e.cantidad into v_disponible
      from existencias e
     where e.modelo_id = v_modelo_id and e.ubicacion_id = v_ubicacion_id
     for update;

    select l.libre, l.apartadas into v_libre, v_apartadas
      from v_existencia_libre l
     where l.modelo_id = v_modelo_id and l.ubicacion_id = v_ubicacion_id;
    v_libre     := coalesce(v_libre, 0);
    v_apartadas := coalesce(v_apartadas, 0);

    -- El precio, el nombre y el costo: la regla de siempre, en su sitio,
    -- con el código si cubre esta pieza (`partes_de_linea`). El % que
    -- recibe es el mayor entre el tramo de la línea y el de la clienta.
    v_desc := coalesce((v_tramo->'por_modelo'->>v_modelo_id::text)::numeric, 0);
    select coalesce(jsonb_agg(to_jsonb(x) order by x.orden), '[]'::jsonb)
      into v_partes
      from partes_de_linea(v_modelo_id, v_cantidad, v_pedido, greatest(v_desc, v_clienta),
                           v_oferta->'por_modelo'->(v_modelo_id::text),
                           coalesce((v_cubiertas->>v_modelo_id::text)::int, 0), v_tasa.tasa_bcv) x;
    v_nombre := v_partes->0->>'nombre';

    select nombre into v_ubi_nombre from ubicaciones where id = v_ubicacion_id;

    if v_disponible is null or v_libre < v_cantidad then
      if v_apartadas > 0 then
        raise exception 'De "%" en % quedan % libres: % están apartadas para un pedido. Pides %.',
          v_nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), v_libre, v_apartadas, v_cantidad;
      end if;
      raise exception 'No hay suficiente "%" en %. Quedan %, y pides %.',
        v_nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), coalesce(v_disponible, 0), v_cantidad;
    end if;

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    for v_parte in select e from jsonb_array_elements(v_partes) e
    loop
      v_precio_bs := round((v_parte->>'precio_usd')::numeric * v_tasa.tasa_bcv, 2);

      insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                               precio_unitario_usd, precio_unitario_bs,
                               precio_lista_usd, costo_puesto_usd_snap,
                               costo_operativo_usd_snap, motivo_rebaja,
                               oferta_codigo_id, precio_sin_oferta_usd, precio_sin_oferta_bs, motivo_sin_oferta)
      values (v_venta_id, v_modelo_id, v_ubicacion_id, (v_parte->>'cantidad')::int,
              (v_parte->>'precio_usd')::numeric, v_precio_bs, (v_parte->>'precio_lista')::numeric,
              (v_parte->>'costo')::numeric, v_operativo,
              motivo_con_clienta(v_parte->>'motivo', v_desc, v_clienta),
              (v_parte->>'oferta_codigo_id')::bigint, (v_parte->>'precio_sin_oferta_usd')::numeric,
              round((v_parte->>'precio_sin_oferta_usd')::numeric * v_tasa.tasa_bcv, 2),
              motivo_con_clienta(v_parte->>'motivo_sin_oferta', v_desc, v_clienta));

      v_total_bs := v_total_bs + (v_precio_bs * (v_parte->>'cantidad')::int);
      if v_parte->>'oferta_codigo_id' is not null then
        v_cubiertas := v_cubiertas || jsonb_build_object(v_modelo_id::text,
          coalesce((v_cubiertas->>v_modelo_id::text)::int, 0) + (v_parte->>'cantidad')::int);
      end if;
    end loop;
  end loop;

  -- Las piezas y, encima, lo de fuera del catálogo: es lo que se cobró.
  v_total_bs := v_total_bs + v_extra_bs;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  -- Los códigos que valieron quedan usados por esta venta.
  perform gastar_codigos(v_oferta, null, v_venta_id);

  return v_venta_id;
end;
$fn$;

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text, boolean, text, numeric, text, text[])
  from public, anon;
grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text, boolean, text, numeric, text, text[])
  to authenticated;


-- ---------------------------------------------------------------------
-- 7. EL APARTADO DEL MOSTRADOR (la de esquema-landing-y-ofertas.sql)
-- Lo mismo que la venta: el % de la clienta, si se eligió su ficha.
-- ---------------------------------------------------------------------

create or replace function apartar_en_tienda(
  p_items            jsonb,
  p_pagos            jsonb,
  p_cliente_id       bigint  default null,
  p_cliente_cedula   text    default null,
  p_cliente_nombre   text    default null,
  p_cliente_apellido text    default null,
  p_cliente_telefono text    default null,
  p_verificado       boolean default true,
  p_codigos          text[]  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tasa      tasas%rowtype;
  v_cliente   clientes%rowtype;
  v_cli_id    bigint;
  v_modelo    bigint;
  v_item      jsonb;
  v_pago      jsonb;
  v_cantidad  int;
  v_piezas    int := 0;
  v_desc      numeric(5,2);
  v_linea     numeric(5,2);
  v_clienta   numeric(5,2) := 0;
  v_tramo     jsonb;
  v_oferta    jsonb;
  v_cubiertas jsonb := '{}'::jsonb;
  v_partes    jsonb;
  v_parte     jsonb;
  v_disp      int;
  v_pedidas   int;
  p           record;
  v_lineas    jsonb := '[]'::jsonb;
  v_subtotal  numeric(12,4) := 0;
  v_total     numeric(12,4) := 0;
  v_id        bigint;
  v_token     uuid;
  v_falta     numeric;
  v_minimo    numeric;
  v_metodo    text;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El apartado no tiene piezas.';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Para apartar hace falta el primer pago.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fíjala en la pantalla de Tasas antes de cobrar.';
  end if;

  -- La clienta, con su cédula: un apartado es una deuda con nombre.
  v_cli_id := resolver_cliente(p_cliente_id, p_cliente_cedula, p_cliente_nombre,
                               p_cliente_apellido, p_cliente_telefono);
  if v_cli_id is null then
    raise exception 'Para apartar hace falta la clienta: búscala o escribe su cédula y su nombre.';
  end if;
  select * into v_cliente from clientes where id = v_cli_id;
  if v_cliente.cedula_digitos is null then
    raise exception 'Para apartar hace falta la cédula de la clienta.';
  end if;

  -- Su descuento fijo, solo si se eligió su ficha (como en la venta).
  if p_cliente_id is not null and v_cli_id = p_cliente_id then
    v_clienta := descuento_de_clienta(v_cli_id);
  end if;

  select coalesce(sum((x->>'cantidad')::int), 0) into v_piezas from jsonb_array_elements(p_items) x;
  -- El tramo, línea por línea (`tramo_de_carrito`): los dijes no cuentan y
  -- solo lo reciben los que van con una base.
  v_tramo := tramo_de_carrito(p_items);
  v_desc  := (v_tramo->>'descuento_pct')::numeric;

  -- Candados en orden y existencias bloqueadas, como `registrar_venta`.
  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
    perform 1 from existencias where modelo_id = v_modelo for update;
  end loop;

  -- Los códigos, bloqueados, con la regla de `cotizar_pedido`.
  v_oferta := tomar_codigos(p_items, p_codigos);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::int;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    v_linea := coalesce((v_tramo->'por_modelo'->>v_modelo::text)::numeric, 0);
    select coalesce(jsonb_agg(to_jsonb(x) order by x.orden), '[]'::jsonb)
      into v_partes
      from partes_de_linea(v_modelo, v_cantidad, nullif(v_item->>'precio_unitario_usd', '')::numeric,
                           greatest(v_linea, v_clienta),
                           v_oferta->'por_modelo'->(v_modelo::text),
                           coalesce((v_cubiertas->>v_modelo::text)::int, 0), v_tasa.tasa_bcv) x;

    for v_parte in select e from jsonb_array_elements(v_partes) e
    loop
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_modelo, 'cantidad', (v_parte->>'cantidad')::int,
        'precio_usd', v_parte->'precio_usd', 'precio_lista_usd', v_parte->'precio_lista',
        'motivo', motivo_con_clienta(v_parte->>'motivo', v_linea, v_clienta),
        'oferta_codigo_id', v_parte->'oferta_codigo_id',
        'precio_sin_oferta_usd', v_parte->'precio_sin_oferta_usd',
        'motivo_sin_oferta', motivo_con_clienta(v_parte->>'motivo_sin_oferta', v_linea, v_clienta)));
      v_subtotal := v_subtotal + (v_parte->>'precio_lista')::numeric * (v_parte->>'cantidad')::int;
      v_total    := v_total + (v_parte->>'precio_usd')::numeric * (v_parte->>'cantidad')::int;
      if v_parte->>'oferta_codigo_id' is not null then
        v_cubiertas := v_cubiertas || jsonb_build_object(v_modelo::text,
          coalesce((v_cubiertas->>v_modelo::text)::int, 0) + (v_parte->>'cantidad')::int);
      end if;
    end loop;
  end loop;

  -- Lo libre, por modelo: todo lo que hay menos lo apartado.
  for v_modelo, v_pedidas in
    select (x->>'modelo_id')::bigint, sum((x->>'cantidad')::int)::int
      from jsonb_array_elements(p_items) x group by 1
  loop
    select coalesce((select sum(cantidad) from existencias where modelo_id = v_modelo), 0)
         - apartadas_de(v_modelo)
      into v_disp;
    if v_pedidas > v_disp then
      select nombre into p from precio_de_linea(v_modelo, null, 0, null);
      raise exception 'De "%" quedan % libres y quieres apartar %.', p.nombre, greatest(v_disp, 0), v_pedidas;
    end if;
  end loop;

  v_total := round(v_total, 4);

  insert into reservas (cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
                        entrega, piezas, subtotal_usd, descuento_pct, total_usd,
                        expira_en, cliente_id, datos_del_maestro, origen, creado_por, estado)
  values (v_cliente.nombre, v_cliente.apellido, v_cliente.cedula, v_cliente.telefono,
          'tienda', v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now(), v_cli_id, false, 'tienda', auth.uid(), 'abierta')
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad, precio_usd, precio_lista_usd, motivo_rebaja,
                             oferta_codigo_id, precio_sin_oferta_usd, motivo_sin_oferta)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int,
         (x->>'precio_usd')::numeric, (x->>'precio_lista_usd')::numeric, x->>'motivo',
         (x->>'oferta_codigo_id')::bigint, (x->>'precio_sin_oferta_usd')::numeric, x->>'motivo_sin_oferta'
    from jsonb_array_elements(v_lineas) with ordinality as e(x, n)
   order by e.n;

  -- Los códigos que valieron quedan tomados por este apartado.
  perform gastar_codigos(v_oferta, v_id, null);

  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    v_metodo := v_pago->>'metodo';
    v_falta  := saldo_padre_bcv(null, v_id, null);
    perform anotar_abono_en(null, v_id, null, 'tienda', v_metodo,
                            nullif(v_pago->>'monto', '')::numeric, v_pago->>'referencia',
                            coalesce(p_verificado, true) or v_metodo in ('efectivo_bs', 'efectivo_usd', 'punto'),
                            v_falta);
  end loop;

  v_minimo := v_total * config_requerida('apartado_inicial_pct') / 100;
  v_falta  := saldo_padre_bcv(null, v_id, null);
  if v_total - v_falta < v_minimo - 0.005 then
    raise exception 'Para apartar, lo que paga hoy tiene que ser al menos el % %%: $% BCV, hoy Bs %.',
      to_char(config_requerida('apartado_inicial_pct'), 'FM990'),
      to_char(v_minimo, 'FM999G999G990D00'),
      to_char(round(v_minimo * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
  end if;
  if v_falta < 0.005 then
    raise exception 'Con eso ya está pagado completo: cóbralo como venta, no como apartado.';
  end if;

  perform pedido_al_dia(v_id);

  return jsonb_build_object('id', v_id, 'token', v_token, 'falta_bcv', falta_pedido_bcv(v_id),
                            'vence_apartado_en', (select vence_apartado_en from reservas where id = v_id));
end;
$fn$;

revoke all on function apartar_en_tienda(jsonb, jsonb, bigint, text, text, text, text, boolean, text[]) from public, anon;
grant execute on function apartar_en_tienda(jsonb, jsonb, bigint, text, text, text, text, boolean, text[]) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 8. LOS REVENDEDORES CON UN PROPIO MAYOR QUE EL GENERAL
-- Quedan con el general (propio vacío). Esta consulta los nombra; al
-- correrlo otra vez sale vacía.
-- ---------------------------------------------------------------------

with bajados as (
  update revendedores r
     set descuento_pct = null
   where r.descuento_pct > (select valor from configuracion where clave = 'revendedor_descuento_pct')
  returning r.nombre, r.usuario
)
select nombre as revendedor_bajado_al_general, usuario from bajados;
