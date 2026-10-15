-- =====================================================================
-- Lux by Emory — quitar una pieza de una venta POR VERIFICAR
-- Ejecutar en el SQL Editor DESPUÉS de esquema-devoluciones.sql (#57).
-- Se puede volver a correr entero.
--
-- LO QUE PIDIÓ EL DUEÑO (15/10/2026)
-- "Cuando un pedido es por verificar no deja quitar y recalcular." Una
-- venta por verificar es la que se cobró sin comprobar el pago: la pieza
-- salió del inventario y la venta espera en Pedidos a que alguien vea el
-- pago en el banco (o, si pagó una parte, a que termine de pagar). Hasta
-- hoy solo se podía verificar o anular ENTERA.
--
-- POR QUÉ SE CAMBIA LA VENTA Y NO SE HACE UNA NOTA DE CRÉDITO
-- La nota de crédito (#57) es para una venta YA comprobada: es un hecho, y
-- lo que pasa después va aparte, el día en que pasa. Una venta por
-- verificar todavía no es un hecho cerrado: es lo que se espera cobrar.
-- Con una nota de crédito, la caja seguiría esperando el total viejo
-- (cuenta la venta por su total y deja fuera las notas) y "lo que falta"
-- de una venta por partes también. Así que se hace lo mismo que con un
-- pedido (`quitar_de_pedido`):
--   - la línea baja; si llega a cero se queda en cero ("quitada"): no se
--     borra nada (`historico_no_se_borra`);
--   - la pieza vuelve a la ubicación de donde salió;
--   - el total se recalcula con los precios congelados de cada línea, más
--     lo de fuera del catálogo, igual que lo calcula `registrar_venta`.
--     Las demás piezas conservan su precio aunque la venta baje de un
--     tramo de mayoreo: se congeló al cobrar;
--   - el cambio queda escrito en `venta_cambios`, con quién y por qué.
-- Todo lo que suma dinero o piezas multiplica por la cantidad, así que una
-- línea en cero no cuenta en ninguna parte. Las cuatro vistas que listan
-- líneas una por una se la saltan (abajo).
--
-- QUIÉN
-- Las dos caras, como anular una venta por verificar. Si la venta es por
-- partes y lo ya pagado pasa del total nuevo, solo el administrador, que
-- dice si se le devuelve (sale de la caja como "Devolución") o se queda.
-- Con pagos sin revisar que sobrarían, se revisan primero.
--
-- LO QUE NO HACE
--   - No quita la última pieza: eso es anular la venta.
--   - No toca una venta que salió de un pedido o de un apartado de
--     revendedor (esas tienen su propio camino).
--   - Una venta ya verificada se devuelve con `admin_devolver_pieza`.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. UNA LÍNEA PUEDE QUEDAR EN CERO, SOLO EN UNA VENTA POR VERIFICAR
-- ---------------------------------------------------------------------

alter table venta_items drop constraint if exists venta_items_cantidad_valida;
-- Cero: solo en una línea normal (una nota de crédito siempre lleva su
-- pieza en negativo). Quién puede dejarla en cero lo dice el disparador.
alter table venta_items add constraint venta_items_cantidad_valida
  check (cantidad <> 0 or devuelve_item_id is null);

create or replace function venta_item_signo()
returns trigger
language plpgsql
as $fn$
declare
  v_es_devolucion boolean;
  v_por_verificar boolean;
begin
  select devolucion_de is not null, por_verificar
    into v_es_devolucion, v_por_verificar
    from ventas where id = new.venta_id;

  if coalesce(v_es_devolucion, false) then
    if new.cantidad >= 0 or new.devuelve_item_id is null then
      raise exception 'Una nota de crédito lleva sus piezas en negativo y dice qué línea devuelve.';
    end if;
    return new;
  end if;

  if new.cantidad < 0 then
    raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
  end if;
  -- Una línea nace con piezas. Queda en cero solo al quitarla de una
  -- venta que todavía está por verificar.
  if new.cantidad = 0 and (tg_op = 'INSERT' or not coalesce(v_por_verificar, false)) then
    raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
  end if;
  return new;
end;
$fn$;


-- ---------------------------------------------------------------------
-- 2. LA HISTORIA DE LO QUE SE LE QUITÓ A UNA VENTA
-- ---------------------------------------------------------------------

create table if not exists venta_cambios (
  id               bigserial primary key,
  venta_id         bigint        not null references ventas(id),
  modelo_id        bigint        not null references modelos(id),
  antes            int           not null,
  despues          int           not null,
  total_antes_bs   numeric(14,2) not null,
  total_despues_bs numeric(14,2) not null,
  -- Solo si sobraba dinero de una venta por partes.
  dinero           text check (dinero in ('devuelto', 'se_queda')),
  devuelto_bs      numeric(14,2),
  devuelto_metodo  metodo_pago,
  motivo           text          not null,
  cambiado_por     uuid          not null references perfiles(id),
  cambiado_en      timestamptz   not null default now()
);

create index if not exists venta_cambios_venta_idx on venta_cambios (venta_id);

comment on table venta_cambios is
  'Lo que se le quitó a una venta por verificar: antes, después, el total, el dinero, quién y por qué. Se lee por v_venta_cambios.';

alter table venta_cambios enable row level security;
revoke all on venta_cambios from anon, authenticated;
revoke all on sequence venta_cambios_id_seq from anon, authenticated;

drop trigger if exists venta_cambios_no_se_borran on venta_cambios;
drop trigger if exists venta_cambios_no_se_vacian on venta_cambios;
create trigger venta_cambios_no_se_borran before delete   on venta_cambios for each row       execute function historico_no_se_borra();
create trigger venta_cambios_no_se_vacian before truncate on venta_cambios for each statement execute function historico_no_se_borra();


-- ---------------------------------------------------------------------
-- 3. QUITAR UNA PIEZA DE UNA VENTA POR VERIFICAR
-- ---------------------------------------------------------------------

create or replace function quitar_de_venta(
  p_venta_id  bigint,
  p_modelo_id bigint,
  p_cantidad  int,
  p_motivo    text,
  p_devolver  boolean default null,
  p_metodo    text    default null,
  p_monto     numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v           ventas%rowtype;
  v_tiene     int;
  v_quedan    int;
  v_falta     int;
  v_toma      int;
  v_linea     record;
  v_total_bs  numeric(14,2);
  v_total_bcv numeric;
  v_pagado    numeric;
  v_verif     numeric;
  v_sobra     numeric := 0;
  v_tasa      tasas%rowtype;
  v_metodo    metodo_pago;
  m           record;
  v_nombre    text;
  v_dinero    text;
  v_dev_bs    numeric(14,2);
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe por qué se quita: queda en la historia de la venta.';
  end if;
  -- La pantalla corta en 200; la base no se fía de la pantalla.
  if length(btrim(p_motivo)) > 300 then
    raise exception 'El motivo es muy largo: dilo en menos de 300 letras.';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Di cuántas piezas se quitan.';
  end if;

  select * into v from ventas where id = p_venta_id for update;
  if not found then raise exception 'Esa venta no existe.'; end if;
  if v.devolucion_de is not null then raise exception 'Eso es una nota de crédito, no una venta.'; end if;
  if v.anulada then raise exception 'Esa venta está anulada: sus piezas ya volvieron.'; end if;
  if not v.por_verificar then
    raise exception 'Esa venta ya se verificó: la pieza se devuelve desde la ficha de la clienta.';
  end if;
  if exists (select 1 from reservas where venta_id = v.id)
     or exists (select 1 from apartados where venta_id = v.id) then
    raise exception 'Esa venta salió de un pedido: lo que se le quita lo decide el administrador.';
  end if;

  -- El mismo candado por pieza que la venta y el conteo.
  perform pg_advisory_xact_lock(p_modelo_id);

  select coalesce(sum(cantidad), 0) into v_tiene
    from venta_items where venta_id = v.id and modelo_id = p_modelo_id;
  if v_tiene < p_cantidad then
    raise exception 'La venta tiene % de esa pieza y quieres quitar %.', v_tiene, p_cantidad;
  end if;
  select coalesce(sum(cantidad), 0) - p_cantidad into v_quedan from venta_items where venta_id = v.id;
  if v_quedan <= 0 then
    raise exception 'Esa es la última pieza de la venta: para quitarlas todas, anula la venta.';
  end if;

  select m2.nombre || coalesce(' · ' || m2.variante, '') into v_nombre from modelos m2 where m2.id = p_modelo_id;

  -- Se bajan las líneas (la última primero) y cada pieza vuelve a su sitio.
  v_falta := p_cantidad;
  for v_linea in
    select id, ubicacion_id, cantidad from venta_items
     where venta_id = v.id and modelo_id = p_modelo_id and cantidad > 0
     order by id desc
  loop
    exit when v_falta = 0;
    v_toma := least(v_falta, v_linea.cantidad);
    update venta_items set cantidad = cantidad - v_toma where id = v_linea.id;
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (p_modelo_id, v_linea.ubicacion_id, v_toma)
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();
    v_falta := v_falta - v_toma;
  end loop;

  -- El total con lo que queda, como lo calcula registrar_venta: cada línea a
  -- sus bolívares congelados, más lo de fuera del catálogo.
  select coalesce(sum(precio_unitario_bs * cantidad), 0) + coalesce(v.extra_bs, 0)
    into v_total_bs
    from venta_items where venta_id = v.id;
  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v.tasa_venta_usada, 4)
   where id = v.id;
  v_total_bcv := v_total_bs / nullif(v.tasa_bcv_usada, 0);

  -- Lo pagado contra el total nuevo (solo una venta por partes tiene abonos).
  select coalesce(sum(monto_bcv), 0),
         coalesce(sum(monto_bcv) filter (where verificado_en is not null), 0)
    into v_pagado, v_verif
    from abonos where venta_id = v.id and anulado_en is null;

  if v_pagado > v_total_bcv + 0.005 and v_pagado > v_verif + 0.005 then
    raise exception 'Hay pagos sin revisar y con ellos pasa del total nuevo: márcalos como que llegaron o que no llegaron antes de quitar la pieza.';
  end if;

  v_sobra := round(v_verif - v_total_bcv, 4);
  if v_sobra > 0.005 then
    if not es_admin() then
      raise exception 'Con esa pieza fuera, lo pagado pasa del total en $% BCV. Lo hace el administrador, que decide si se le devuelve.',
        to_char(v_sobra, 'FM999G990D00');
    end if;
    if p_devolver is null then
      raise exception 'Sobran $% BCV de lo pagado: di si se le devuelven o se quedan.', to_char(v_sobra, 'FM999G990D00');
    end if;
    if p_devolver then
      if coalesce(p_monto, 0) <= 0 then
        raise exception 'Escribe cuánto se le devuelve.';
      end if;
      begin
        v_metodo := nullif(btrim(coalesce(p_metodo, '')), '')::metodo_pago;
      exception when others then
        raise exception 'Esa forma de pago no existe.';
      end;
      if v_metodo is null then raise exception 'Falta cómo se le devuelve.'; end if;
      select * into v_tasa from tasas where vigente limit 1;
      select * into m from montos_de_abono(v_metodo, p_monto, v_tasa.tasa_venta, v_tasa.tasa_bcv);
      if m.bcv > v_sobra + margen_de_abono(v_metodo, v_tasa.tasa_venta, v_tasa.tasa_bcv) then
        raise exception 'Se le devolvería más de lo que sobra: sobran $% BCV, hoy Bs %.',
          to_char(v_sobra, 'FM999G990D00'), to_char(round(v_sobra * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
      end if;
      perform admin_anotar_caja('salida', (now() at time zone 'America/Caracas')::date, 'devolucion',
                                'Devolución de la venta #' || v.id ||
                                coalesce(' · ' || nullif(btrim(v.cliente_nombre), ''), '') ||
                                ' · quitó ' || v_nombre,
                                v_metodo::text, p_monto, null);
      v_dinero := 'devuelto';
      v_dev_bs := m.bs;
    else
      v_dinero := 'se_queda';
    end if;
  end if;

  insert into venta_cambios (venta_id, modelo_id, antes, despues, total_antes_bs, total_despues_bs,
                             dinero, devuelto_bs, devuelto_metodo, motivo, cambiado_por)
  values (v.id, p_modelo_id, v_tiene, v_tiene - p_cantidad, v.total_bs, v_total_bs,
          v_dinero, v_dev_bs,
          case when v_dinero = 'devuelto' then v_metodo end,
          btrim(p_motivo), auth.uid());

  return jsonb_build_object(
    'total_bs', v_total_bs,
    'total_bcv', round(v_total_bcv, 4),
    'falta_bcv', falta_bcv_de(v.id),
    'sobraba_bcv', greatest(v_sobra, 0),
    'dinero', v_dinero);
end;
$fn$;

revoke all on function quitar_de_venta(bigint, bigint, int, text, boolean, text, numeric) from public, anon;
grant execute on function quitar_de_venta(bigint, bigint, int, text, boolean, text, numeric) to authenticated;

create or replace view v_venta_cambios
with (security_invoker = off) as
select
  c.id,
  c.venta_id,
  c.modelo_id,
  m.nombre,
  m.variante,
  c.antes,
  c.despues,
  c.total_antes_bs,
  c.total_despues_bs,
  c.dinero,
  c.devuelto_bs,
  c.devuelto_metodo,
  c.motivo,
  c.cambiado_en,
  p.nombre as quien
from venta_cambios c
join modelos m       on m.id = c.modelo_id
left join perfiles p on p.id = c.cambiado_por
where auth.uid() is not null;

revoke all on v_venta_cambios from anon;
grant select on v_venta_cambios to authenticated;


-- ---------------------------------------------------------------------
-- 4. LAS VISTAS QUE LISTAN LÍNEAS SE SALTAN LAS QUITADAS
-- Mismas columnas y en el mismo orden: solo cambia el `where`.
-- ---------------------------------------------------------------------

create or replace view v_ventas_por_verificar
with (security_invoker = off) as
select
  v.id                as venta_id,
  v.fecha,
  v.usuario_id,
  p.nombre            as vendedora,
  v.metodo,
  v.pago_referencia,
  v.cliente_id,
  v.cliente_nombre,
  v.cliente_telefono,
  cl.cedula           as cliente_cedula,
  v.total_bs,
  round(v.total_bs / nullif(v.tasa_bcv_usada, 0), 2) as total_bcv,
  v.total_usd         as total_binance,
  i.modelo_id,
  m.sku,
  m.nombre,
  m.variante,
  m.foto_thumb_path,
  i.cantidad,
  i.precio_unitario_bs,
  ub.nombre           as ubicacion,
  v.pago_parcial,
  falta_bcv_de(v.id)  as falta_bcv,
  v.extra_bs,
  v.extra_nota
from ventas v
join venta_items i on i.venta_id = v.id and i.cantidad > 0
join modelos m     on m.id = i.modelo_id
left join ubicaciones ub on ub.id = i.ubicacion_id
left join perfiles p     on p.id = v.usuario_id
left join clientes cl    on cl.id = v.cliente_id
where v.por_verificar
  and not v.anulada
  and auth.uid() is not null;

revoke all on v_ventas_por_verificar from anon;
grant select on v_ventas_por_verificar to authenticated;

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
  v.pago_referencia,
  v.pago_parcial,
  falta_bcv_de(v.id) as falta_bcv,
  rv.nombre       as revendedor,
  v.extra_bs,
  v.extra_nota,
  coalesce((select -sum(r.cantidad)::int
              from venta_items r join ventas rv2 on rv2.id = r.venta_id and not rv2.anulada
             where r.devuelve_item_id = i.id), 0) as devueltas,
  i.ubicacion_id,
  i.precio_unitario_usd,
  m.foto_path
from ventas v
join venta_items i on i.venta_id = v.id and i.cantidad <> 0
join modelos m     on m.id = i.modelo_id
left join revendedores rv on rv.id = v.revendedor_id
where v.cliente_id is not null
  and v.devolucion_de is null
  and (not v.anulada or v.notas like '%Anulada sin pago:%')
  and auth.uid() is not null;

create or replace view v_rebajas
with (security_invoker = off) as
select
  v.id                                  as venta_id,
  v.fecha,
  v.usuario_id,
  p.nombre                              as vendedora,
  i.modelo_id,
  m.sku,
  m.nombre,
  m.variante,
  i.cantidad,
  i.precio_lista_usd,
  i.precio_unitario_usd,
  round(i.precio_lista_usd * v.tasa_bcv_usada, 2)                       as precio_lista_bs,
  i.precio_unitario_bs,
  round((i.precio_lista_usd - i.precio_unitario_usd) * i.cantidad, 4)   as rebaja_usd,
  round((1 - i.precio_unitario_usd / i.precio_lista_usd) * 100, 2)      as rebaja_pct,
  i.motivo_rebaja
from venta_items i
join ventas v   on v.id = i.venta_id
join modelos m  on m.id = i.modelo_id
left join perfiles p on p.id = v.usuario_id
where not v.anulada
  and v.devolucion_de is null
  and i.cantidad > 0
  and i.precio_lista_usd > 0
  and i.precio_unitario_usd < i.precio_lista_usd
  and es_admin();

-- Una línea quitada tampoco es "la última vez que se vendió".
create or replace view v_rotacion_modelo
with (security_invoker = off) as
select
  mo.id, mo.sku, mo.nombre, mo.categoria,
  coalesce(g.nombre, 'Sin grupo') as grupo,
  coalesce(x.piezas, 0)           as piezas_vendidas,
  x.ultima_venta,
  case when x.ultima_venta is not null then (current_date - x.ultima_venta::date) end as dias_sin_vender,
  (current_date - mo.creado_en::date) as dias_en_inventario,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = mo.id), 0) as existencia,
  mo.costo_puesto_usd,
  coalesce(x.ganancia_usd, 0) as ganancia_usd
from modelos mo
left join grupos_precio g on g.id = mo.grupo_precio_id
left join lateral (
  select
    sum(i.cantidad) as piezas,
    max(v.fecha) filter (where v.devolucion_de is null and i.cantidad > 0) as ultima_venta,
    sum(i.precio_unitario_bs * i.cantidad / v.tasa_bcv_usada
        - (i.costo_puesto_usd_snap * (v.tasa_venta_usada / v.tasa_bcv_usada)
           + coalesce(i.costo_operativo_usd_snap, 0)) * i.cantidad) as ganancia_usd
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
  where i.modelo_id = mo.id
) x on true
where mo.activo and es_admin();

notify pgrst, 'reload schema';
