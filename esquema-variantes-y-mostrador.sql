-- =====================================================================
-- Lux by Emory — variantes, tasas en el mostrador y el tramo que sí baja
-- Ejecutar en el SQL Editor DESPUÉS de esquema-meta-vendedora.sql
--
-- QUÉ TRAE, EN SIETE LÍNEAS
--   1. La vendedora puede fijar la tasa del día (`fijar_tasa`).
--   2. "Binance" pasa a ser una forma de pago: si la clienta paga en
--      dólares, la venta queda dicha como lo que fue.
--   3. El descuento por cantidad ya no se corta en el 10 % del regateo.
--   4. Con tramo, manda el tramo; el regateo es para ventas chicas. Y cada
--      línea guarda POR QUÉ salió más barata que la etiqueta.
--   5. Variantes: una cadena de 45 cm y otra de 60 cm son el mismo
--      producto con dos opciones, no dos productos sueltos.
--   6. `v_rebajas`: el dueño ve cuánto se rebajó, en qué pieza y quién.
--   7. El pedido del catálogo cobra lo mismo que cobraría el mostrador.
--
-- ---------------------------------------------------------------------
-- 3. EL TRAMO QUE NUNCA LLEGABA AL 15 %
--
-- El tramo "no bajaba del piso", y el piso era `precio_minimo_de`. Pero ese
-- piso mezcla DOS topes: el margen mínimo (que protege de vender a
-- pérdida) y la rebaja máxima de la vendedora (10 %, que es cuánto puede
-- regatear ella). Con los dos juntos, el tramo de 20 piezas al 15 % se
-- quedaba en 10 % en todas las piezas, y el de 12 al 10 % también. La
-- clienta al mayor recibía menos de lo que la pantalla de Tramos prometía.
--
-- Ahora son dos pisos con dos trabajos:
--
--   piso_margen_de(modelo)    el precio que todavía deja el margen mínimo.
--                             Es el piso del TRAMO: un descuento por
--                             cantidad no vende a pérdida, y ya.
--   precio_minimo_de(modelo)  el mayor entre ese y la etiqueta menos la
--                             rebaja máxima. Es el piso del REGATEO.
--
-- La fórmula del margen vive en `piso_margen_de` y `precio_minimo_de` la
-- llama: una cifra, un sitio.
--
-- ---------------------------------------------------------------------
-- 4. CON TRAMO MANDA EL TRAMO
--
-- El dueño lo dijo así: el regateo es para cerrar una venta de menos de
-- seis piezas; a partir de ahí para eso están los tramos. Antes era al
-- revés (si ella regateaba, su precio mandaba y el tramo no se sumaba).
-- Ahora, si la venta alcanza un tramo, el precio a mano se ignora y se
-- cobra el tramo. El "seis" no está escrito aquí: es el `min_piezas` del
-- primer tramo activo, y lo cambia el dueño en Tramos.
--
-- `venta_items.motivo_rebaja` dice por qué una línea salió por debajo de la
-- etiqueta: 'regateo' (ella negoció) o 'tramo' (descuento por cantidad).
-- Las ventas viejas quedan en null: no se sabe, y no se inventa.
--
-- ---------------------------------------------------------------------
-- 5. VARIANTES
--
-- Cada variante sigue siendo un MODELO completo: su SKU, su existencia por
-- ubicación, su grupo, su costo, su foto. Lo único nuevo es que varias se
-- declaran hermanas:
--
--   modelos.familia_id   la cabeza de la familia (el id de una de ellas).
--                        Null en un producto suelto.
--   modelos.variante     lo que la distingue: "45 cm", "talla 7".
--
-- Las vistas publican `familia` = coalesce(familia_id, id), que nunca es
-- null: las pantallas agrupan por ahí y un producto suelto es una familia
-- de uno. Se eligió así, y no con una tabla de productos aparte, porque no
-- obliga a mudar ni una fila: todo lo que existe sigue siendo suelto hasta
-- que el dueño le agregue una variante.
--
-- La cabeza lleva su propio id en `familia_id`. Si sale de la familia, las
-- que quedan pasan a colgar de la menor de ellas (`soltar_de_familia`); si
-- queda una sola, vuelve a ser suelta.
--
-- `variantes_nota` NO se borra: las vistas la nombran y hay notas cargadas.
-- Pasa a ser una nota libre de la pieza.
--
-- ---------------------------------------------------------------------
-- LO QUE NO CAMBIA DE FIRMA
--
-- `registrar_venta`, `crear_reserva`, `ver_reserva` y `precio_minimo_de` se
-- reescriben con los mismos parámetros: el navegador viejo las sigue
-- llamando igual mientras GitHub Pages publica.
--
-- `admin_guardar_modelo` sí gana dos parámetros, AL FINAL y con valor por
-- defecto: el formulario viejo manda trece y sigue encajando. Y un
-- `p_variante` que no llega (null) NO borra la variante guardada: solo la
-- borra una cadena vacía, que es lo que manda el formulario nuevo.
--
-- `admin_fijar_tasa` se queda como estaba: la usa el navegador viejo del
-- administrador. La nueva, `fijar_tasa`, es la que llaman las dos caras.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA VENDEDORA FIJA LA TASA
--
-- Sin guardián de administrador, a propósito: la tasa se mueve durante el
-- día y ella es la que está en la tienda cuando se mueve. Queda escrito
-- quién la fijó (`registrado_por`), y la pantalla lo enseña.
-- ---------------------------------------------------------------------

create or replace function fijar_tasa(
  p_tasa_venta numeric,
  p_tasa_bcv   numeric
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion para fijar la tasa.';
  end if;
  if not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Tu usuario no tiene un perfil activo.';
  end if;
  if coalesce(p_tasa_venta, 0) <= 0 or coalesce(p_tasa_bcv, 0) <= 0 then
    raise exception 'Las dos tasas deben ser mayores que cero.';
  end if;

  update tasas set vigente = false where vigente;

  insert into tasas (tasa_venta, tasa_bcv, vigente, registrado_por)
  values (p_tasa_venta, p_tasa_bcv, true, auth.uid())
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function fijar_tasa(numeric, numeric) from public, anon;
grant execute on function fijar_tasa(numeric, numeric) to authenticated;

-- El histórico con el nombre de quien fijó cada una. `perfiles` solo deja
-- ver el propio a la vendedora; esta vista presta el nombre y nada más.
create or replace view v_tasas
with (security_invoker = off) as
select
  t.id,
  t.fecha,
  t.tasa_venta,
  t.tasa_bcv,
  t.vigente,
  t.creado_en,
  p.nombre as registrado_por_nombre
from tasas t
left join perfiles p on p.id = t.registrado_por
where auth.uid() is not null;

revoke all on v_tasas from anon;
grant select on v_tasas to authenticated;


-- ---------------------------------------------------------------------
-- 2. BINANCE, COMO FORMA DE PAGO
--
-- El total en dólares de cada venta (`ventas.total_usd`) ya es
-- total_bs / tasa de venta: justo lo que cobra quien paga en Binance. Lo
-- que faltaba era poder decir que se pagó así.
--
-- Nada de este archivo usa el valor nuevo: Postgres no deja usarlo en la
-- misma transacción en que se agrega.
-- ---------------------------------------------------------------------

alter type metodo_pago add value if not exists 'binance';


-- ---------------------------------------------------------------------
-- 3. LOS DOS PISOS
-- ---------------------------------------------------------------------

-- El piso del TRAMO: lo que todavía deja el margen mínimo. Nunca por encima
-- de la etiqueta.
create or replace function piso_margen_de(p_modelo_id bigint)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_precio     numeric(12,4);
  v_costo      numeric(12,4);
  v_margen_min numeric(12,4);
begin
  select coalesce(m.precio_override_usd, g.precio_usd), m.costo_puesto_usd
    into v_precio, v_costo
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
   where m.id = p_modelo_id and m.activo;

  if v_precio is null then
    return null;
  end if;

  if not exists (select 1 from tasas where vigente) then
    return v_precio;
  end if;

  select valor into v_margen_min from configuracion where clave = 'margen_minimo_pct';
  v_margen_min := least(coalesce(v_margen_min, 0), 99);

  return round(least(v_precio, costo_total_bcv(v_costo) / (1 - v_margen_min / 100)), 2);
end;
$fn$;

-- Abierta a `authenticated` porque la llama `v_catalogo_venta`: Postgres
-- comprueba el EXECUTE contra quien consulta la vista. Devuelve un piso,
-- no un costo, y sin `margen_minimo_pct` (que ella no puede leer) no se
-- despeja nada.
revoke all on function piso_margen_de(bigint) from public, anon;
grant execute on function piso_margen_de(bigint) to authenticated;

-- El piso del REGATEO: el mayor entre el piso de margen y la etiqueta menos
-- la rebaja máxima de la vendedora. Misma firma y mismo resultado que
-- antes; ahora el margen lo pregunta en vez de calcularlo otra vez.
create or replace function precio_minimo_de(p_modelo_id bigint)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_precio   numeric(12,4);
  v_desc_max numeric(12,4);
begin
  select coalesce(m.precio_override_usd, g.precio_usd)
    into v_precio
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
   where m.id = p_modelo_id and m.activo;

  if v_precio is null then
    return null;
  end if;

  if not exists (select 1 from tasas where vigente) then
    return v_precio;
  end if;

  select valor into v_desc_max from configuracion where clave = 'descuento_max_mostrador_pct';
  v_desc_max := least(coalesce(v_desc_max, 0), 99);

  return round(least(v_precio,
                     greatest(v_precio * (1 - v_desc_max / 100),
                              coalesce(piso_margen_de(p_modelo_id), 0))), 2);
end;
$fn$;

revoke all on function precio_minimo_de(bigint) from public, anon;
grant execute on function precio_minimo_de(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 5. VARIANTES: LAS COLUMNAS
-- ---------------------------------------------------------------------

alter table modelos add column if not exists familia_id bigint
  references modelos(id) on delete set null;
alter table modelos add column if not exists variante text;

create index if not exists modelos_familia_idx
  on modelos (familia_id) where familia_id is not null;

comment on column modelos.familia_id is
  'Cabeza de la familia de variantes (el id de una hermana, la suya propia si es la cabeza). Null si el producto va suelto.';
comment on column modelos.variante is
  'Lo que distingue a esta variante de sus hermanas: 45 cm, talla 7, dorada.';

-- Saca una pieza de su familia sin romper a las demás. Revocada a todo el
-- mundo: solo la usan por dentro las funciones del administrador.
create or replace function soltar_de_familia(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cabeza bigint;
  v_nueva  bigint;
begin
  select familia_id into v_cabeza from modelos where id = p_id;

  update modelos set familia_id = null where id = p_id;

  -- Si era la cabeza, las que colgaban de ella pasan a la menor.
  select min(id) into v_nueva from modelos where familia_id = p_id;
  if v_nueva is not null then
    update modelos set familia_id = v_nueva where familia_id = p_id;
  end if;

  -- Una familia de una sola pieza no es familia: vuelve a ir suelta. La
  -- etiqueta de variante se queda, por si le agregan hermanas otra vez.
  update modelos m
     set familia_id = null
   where m.familia_id in (coalesce(v_nueva, -1), coalesce(v_cabeza, -1))
     and (select count(*) from modelos x where x.familia_id = m.familia_id) = 1;
end;
$fn$;

revoke all on function soltar_de_familia(bigint) from public, anon, authenticated;

create or replace function admin_separar_variante(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede separar variantes.';
  end if;
  if not exists (select 1 from modelos where id = p_id) then
    raise exception 'Ese modelo no existe.';
  end if;
  perform soltar_de_familia(p_id);
end;
$fn$;

revoke all on function admin_separar_variante(bigint) from public, anon;
grant execute on function admin_separar_variante(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 5b. GUARDAR UN MODELO, AHORA CON SU VARIANTE
--
-- Se suelta la firma vieja y se crea la nueva en el mismo paso: si
-- quedaran las dos, PostgREST no sabría a cuál llamar y no se podría
-- guardar ningún producto.
-- ---------------------------------------------------------------------

drop function if exists admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb);

create or replace function admin_guardar_modelo(
  p_id                  bigint,
  p_nombre              text,
  p_categoria           text,
  p_grupo_precio_id     bigint,
  p_lote_id             bigint default null,
  p_costo_unitario_usd  numeric default 0,
  p_descripcion         text default null,
  p_variantes_nota      text default null,
  p_precio_override_usd numeric default null,
  p_foto_path           text default null,
  p_foto_thumb_path     text default null,
  p_sku                 text default null,
  p_existencias         jsonb default '[]'::jsonb,
  -- Nuevos, al final y con valor por defecto (ver la cabecera).
  p_variante            text default null,
  p_variante_de         bigint default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id      bigint;
  v_sku     text;
  v_flete   numeric;
  v_fila    jsonb;
  v_familia bigint;
  v_mia     bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar modelos.';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'El modelo necesita un nombre.';
  end if;

  v_flete := calcular_flete_unitario(p_lote_id);
  v_sku   := nullif(trim(coalesce(p_sku, '')), '');

  if p_id is null then
    v_sku := coalesce(v_sku, generar_sku(p_categoria, p_grupo_precio_id));
    insert into modelos (
      sku, nombre, categoria, descripcion, variantes_nota,
      lote_id, costo_unitario_usd, flete_unitario_usd,
      grupo_precio_id, precio_override_usd, foto_path, foto_thumb_path,
      variante
    ) values (
      v_sku, trim(p_nombre), lower(trim(p_categoria)), p_descripcion, p_variantes_nota,
      p_lote_id, coalesce(p_costo_unitario_usd, 0), v_flete,
      p_grupo_precio_id, p_precio_override_usd, p_foto_path, p_foto_thumb_path,
      nullif(trim(coalesce(p_variante, '')), '')
    ) returning id into v_id;
  else
    v_id := p_id;
    update modelos set
      sku                 = coalesce(v_sku, sku),
      nombre              = trim(p_nombre),
      categoria           = lower(trim(p_categoria)),
      descripcion         = p_descripcion,
      variantes_nota      = p_variantes_nota,
      lote_id             = p_lote_id,
      costo_unitario_usd  = coalesce(p_costo_unitario_usd, 0),
      flete_unitario_usd  = v_flete,
      grupo_precio_id     = p_grupo_precio_id,
      precio_override_usd = p_precio_override_usd,
      -- si no llega foto nueva, se conserva la que ya tenia
      foto_path           = coalesce(p_foto_path, foto_path),
      foto_thumb_path     = coalesce(p_foto_thumb_path, foto_thumb_path),
      -- null = no la mando (formulario viejo): se queda. '' = la borro.
      variante            = case when p_variante is null then variante
                                 else nullif(trim(p_variante), '') end,
      actualizado_en      = now()
    where id = v_id;
    if not found then
      raise exception 'El modelo % no existe.', p_id;
    end if;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_existencias, '[]'::jsonb))
  loop
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_id, (v_fila->>'ubicacion_id')::bigint, greatest((v_fila->>'cantidad')::int, 0))
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = excluded.cantidad, actualizado_en = now();
  end loop;

  -- Entrar en la familia de otra pieza.
  if p_variante_de is not null and p_variante_de <> v_id then
    select coalesce(familia_id, id) into v_familia from modelos where id = p_variante_de;
    if v_familia is null then
      raise exception 'La pieza de la que sale esta variante ya no existe.';
    end if;

    select coalesce(familia_id, id) into v_mia from modelos where id = v_id;
    if v_mia is distinct from v_familia then
      perform soltar_de_familia(v_id);
      update modelos set familia_id = v_familia where id in (v_id, v_familia);
    end if;
  end if;

  return v_id;
end;
$fn$;

revoke all on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb, text, bigint) from public, anon;
grant execute on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb, text, bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 5c. LAS VISTAS
--
-- Todas con `create or replace` y las columnas nuevas AL FINAL: nada se
-- suelta y ningún permiso se pierde. Las definiciones son las vigentes
-- (esquema-ubicacion-en-catalogo, esquema-regateo, esquema-ubicacion-en-
-- publico, esquema-costos-cerrados, esquema-pedido-completo y
-- esquema-clientes) con lo nuevo añadido.
-- ---------------------------------------------------------------------

-- La de venta.
--
-- OJO: los pisos se llaman DIRECTO en la lista de columnas, y no en un
-- lateral aparte, aunque así se calculen dos veces. Es lo que mantiene
-- vivo el catálogo público: la clienta sin sesión no puede ejecutar estas
-- funciones, y lee esta vista a través de `v_disponible_publico` sin pedir
-- esas columnas. Escritas así, Postgres no las evalúa si nadie las pide
-- (está probado en producción desde esquema-regateo.sql). En un lateral
-- no hay esa garantía, y el día que se evaluaran el catálogo público
-- respondería "permission denied" a todo el mundo.
create or replace view v_catalogo_venta
with (security_invoker = off) as
select
  m.id, m.sku, m.nombre, m.categoria, m.descripcion, m.variantes_nota,
  m.foto_path, m.foto_thumb_path,
  g.nombre as grupo,
  coalesce(m.precio_override_usd, g.precio_usd) as precio_usd,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv, 2) as precio_bs,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv / t.tasa_venta, 4) as precio_usd_real,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0) as existencia_total,
  m.activo,
  precio_minimo_de(m.id) as precio_minimo_usd,
  round(precio_minimo_de(m.id) * t.tasa_bcv, 2) as precio_minimo_bs,
  (select string_agg(u.nombre, ' · ' order by u.orden, u.nombre)
     from existencias e
     join ubicaciones u on u.id = e.ubicacion_id
    where e.modelo_id = m.id and e.cantidad > 0) as ubicaciones,
  (select string_agg(coalesce(u.codigo, upper(left(u.nombre, 2))), ' · ' order by u.orden, u.nombre)
     from existencias e
     join ubicaciones u on u.id = e.ubicacion_id
    where e.modelo_id = m.id and e.cantidad > 0) as ubicaciones_codigo,
  -- Nuevas.
  coalesce(m.familia_id, m.id) as familia,
  m.variante,
  piso_margen_de(m.id) as piso_tramo_usd,
  round(piso_margen_de(m.id) * t.tasa_bcv, 2) as piso_tramo_bs
from modelos m
left join grupos_precio g on g.id = m.grupo_precio_id
left join lateral (select * from tasas where vigente limit 1) t on true
where m.activo;

grant select on v_catalogo_venta to authenticated;

create or replace view v_venta_ubicacion
with (security_invoker = off) as
select
  e.ubicacion_id, c.id as modelo_id, c.sku, c.nombre, c.categoria,
  c.variantes_nota, c.foto_thumb_path, c.foto_path, c.grupo,
  c.precio_usd, c.precio_bs, e.cantidad,
  c.precio_minimo_usd, c.precio_minimo_bs,
  c.familia, c.variante, c.piso_tramo_usd, c.piso_tramo_bs
from existencias e
join v_catalogo_venta c on c.id = e.modelo_id;

grant select on v_venta_ubicacion to authenticated;

-- La pública lleva la familia y la variante, y NINGUNO de los dos pisos:
-- son información de mostrador.
create or replace view v_disponible_publico
with (security_invoker = off) as
select * from (
  select
    c.id, c.sku, c.nombre, c.categoria, c.variantes_nota,
    c.foto_path, c.foto_thumb_path, c.precio_usd, c.precio_bs,
    c.existencia_total - coalesce((
      select sum(ri.cantidad)
        from reserva_items ri
        join reservas r on r.id = ri.reserva_id
       where ri.modelo_id = c.id and r.estado = 'abierta' and r.expira_en > now()
    ), 0) as disponible,
    c.ubicaciones_codigo,
    c.familia,
    c.variante
  from v_catalogo_venta c
  where c.existencia_total > 0
) x
where x.disponible > 0;

grant select on v_disponible_publico to anon, authenticated;

create or replace view v_catalogo_admin
with (security_invoker = off) as
 SELECT v.id,
    v.sku,
    v.nombre,
    v.categoria,
    v.descripcion,
    v.variantes_nota,
    v.foto_path,
    v.foto_thumb_path,
    v.grupo,
    v.precio_usd,
    v.precio_bs,
    v.precio_usd_real,
    v.existencia_total,
    v.activo,
    v.precio_minimo_usd,
    v.precio_minimo_bs,
    m.costo_unitario_usd,
    m.flete_unitario_usd,
    m.costo_puesto_usd,
    m.lote_id,
    o.operativo AS costo_operativo_usd,
    o.merma AS factor_merma,
    round(m.costo_puesto_usd * o.factor * o.merma, 4) AS costo_mercancia_bcv,
    round(m.costo_puesto_usd * o.factor * o.merma + o.operativo, 4) AS costo_total_usd,
    round(v.precio_usd - (m.costo_puesto_usd * o.factor * o.merma + o.operativo), 4) AS margen_usd,
        CASE
            WHEN v.precio_usd > 0::numeric THEN round((v.precio_usd - (m.costo_puesto_usd * o.factor * o.merma + o.operativo)) / v.precio_usd * 100::numeric, 2)
            ELSE 0::numeric
        END AS margen_pct,
        CASE
            WHEN o.factor > 0::numeric THEN round((v.precio_usd - (m.costo_puesto_usd * o.factor * o.merma + o.operativo)) / o.factor, 4)
            ELSE NULL::numeric
        END AS ganancia_real_usd,
    m.grupo_precio_id,
    m.precio_override_usd,
    l.codigo AS lote_codigo,
    -- Nuevas.
    v.familia,
    v.variante
   FROM v_catalogo_venta v
     JOIN modelos m ON m.id = v.id
     LEFT JOIN lotes l ON l.id = m.lote_id
     CROSS JOIN LATERAL ( SELECT COALESCE(costo_operativo_admin(), 0::numeric) AS operativo,
            COALESCE(factor_merma(), 1::numeric) AS merma,
            COALESCE(( SELECT tasas.tasa_venta / tasas.tasa_bcv
                   FROM tasas
                  WHERE tasas.vigente
                 LIMIT 1), 1::numeric) AS factor) o
  WHERE es_admin();

grant select on v_catalogo_admin to authenticated;

-- Se suelta y se crea, como hizo esquema-pedido-completo.sql: el viejo
-- esquema-limpieza-pruebas.sql la definía con otras columnas, y si alguna
-- vez corrió después, un `create or replace` fallaría a mitad del archivo.
-- No cuelga ninguna otra vista de ella.
drop view if exists v_pedido_vendedora;

create view v_pedido_vendedora
with (security_invoker = off) as
select
  r.id as reserva_id,
  r.token,
  r.estado,
  r.creado_en,
  r.expira_en,
  r.cliente_nombre,
  r.cliente_apellido,
  r.cliente_cedula,
  r.cliente_telefono,
  r.entrega,
  r.envio_empresa,
  r.envio_agencia,
  r.envio_direccion,
  r.pago_metodo,
  r.pago_referencia,
  r.pago_fecha,
  r.pago_cedula,
  r.pago_telefono,
  r.pago_reportado_en,
  r.piezas as piezas_total,
  r.total_usd,
  ri.modelo_id,
  c.sku,
  c.nombre,
  c.variantes_nota,
  c.foto_thumb_path,
  ri.cantidad,
  coalesce(u.nombre, 'Sin existencia suficiente') as ubicacion,
  c.variante
from reservas r
join reserva_items ri on ri.reserva_id = r.id
join v_catalogo_venta c on c.id = ri.modelo_id
left join lateral (
  select ub.nombre
    from existencias e
    join ubicaciones ub on ub.id = e.ubicacion_id
   where e.modelo_id = ri.modelo_id and e.cantidad >= ri.cantidad
   order by e.cantidad desc, ub.orden
   limit 1
) u on true
where auth.uid() is not null
  and (r.estado = 'confirmada' or (r.estado = 'abierta' and r.expira_en > now()));

revoke all on v_pedido_vendedora from anon;
grant select on v_pedido_vendedora to authenticated;

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
  m.variante
from ventas v
join venta_items i on i.venta_id = v.id
join modelos m     on m.id = i.modelo_id
where v.cliente_id is not null
  and not v.anulada
  and auth.uid() is not null;

grant select on v_cliente_compras to authenticated;


-- ---------------------------------------------------------------------
-- 4. COBRAR: CON TRAMO MANDA EL TRAMO, Y CADA REBAJA DICE POR QUÉ
-- ---------------------------------------------------------------------

alter table venta_items add column if not exists motivo_rebaja text;
alter table venta_items drop constraint if exists venta_items_motivo_rebaja_check;
alter table venta_items add constraint venta_items_motivo_rebaja_check
  check (motivo_rebaja is null or motivo_rebaja in ('regateo', 'tramo'));

comment on column venta_items.motivo_rebaja is
  'Por qué la línea salió por debajo de la etiqueta: regateo (la vendedora negoció) o tramo (descuento por cantidad). Null: a precio de etiqueta, o venta anterior a esta columna.';

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
  p_cliente_apellido text default null
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
  v_precio_usd   numeric(12,4);
  v_precio_lista numeric(12,4);
  v_pedido       numeric(12,4);
  v_piso         numeric(12,4);
  v_piso_tramo   numeric(12,4);
  v_precio_bs    numeric(14,2);
  v_costo        numeric(12,4);
  v_operativo    numeric(12,4);
  v_nombre       text;
  v_ubi_nombre   text;
  v_motivo       text;
  v_piezas       int := 0;
  v_desc         numeric(5,2) := 0;
  v_total_bs     numeric(14,2) := 0;
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

  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  -- EL TRAMO SE DECIDE ANTES DE RECORRER NADA: depende del total de piezas.
  select coalesce(sum((x->>'cantidad')::int), 0)
    into v_piezas
    from jsonb_array_elements(p_items) x;

  v_desc := coalesce(descuento_para(v_piezas), 0);

  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      kit_id, cliente_id, cliente_nombre, cliente_telefono, notas)
  values (auth.uid(), p_tipo::tipo_venta, p_metodo::metodo_pago,
          v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_kit_id, v_cliente_id, v_cliente_nom, v_cliente_tel, p_notas)
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo_id    := (v_item->>'modelo_id')::bigint;
    v_ubicacion_id := (v_item->>'ubicacion_id')::bigint;
    v_cantidad     := (v_item->>'cantidad')::int;
    v_pedido       := nullif(v_item->>'precio_unitario_usd', '')::numeric;
    v_motivo       := null;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select e.cantidad into v_disponible
      from existencias e
     where e.modelo_id = v_modelo_id and e.ubicacion_id = v_ubicacion_id
     for update;

    select m.nombre || coalesce(' · ' || m.variante, ''),
           coalesce(m.precio_override_usd, g.precio_usd), m.costo_puesto_usd
      into v_nombre, v_precio_usd, v_costo
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo_id and m.activo;

    if not found then
      raise exception 'El modelo % no existe o esta retirado.', v_modelo_id;
    end if;

    select nombre into v_ubi_nombre from ubicaciones where id = v_ubicacion_id;

    if v_disponible is null or v_disponible < v_cantidad then
      raise exception 'No hay suficiente "%" en %. Quedan %, y pides %.',
        v_nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), coalesce(v_disponible, 0), v_cantidad;
    end if;

    if v_precio_usd is null then
      raise exception 'El modelo "%" no tiene precio: falta asignarle un grupo.', v_nombre;
    end if;

    v_precio_lista := v_precio_usd;

    if v_desc > 0 then
      -- CON TRAMO MANDA EL TRAMO. Un precio a mano que llegue se ignora:
      -- el regateo es para cerrar ventas chicas, y sumar los dos seria
      -- descontar dos veces la misma pieza. El piso es el de MARGEN, no el
      -- del regateo: si no, el 15 % se quedaba en el 10 % de la vendedora.
      v_piso_tramo := coalesce(piso_margen_de(v_modelo_id), v_precio_lista);
      v_precio_usd := least(v_precio_lista,
                            greatest(round(v_precio_lista * (1 - v_desc / 100), 4), v_piso_tramo));
      if v_precio_usd < v_precio_lista then
        v_motivo := 'tramo';
      end if;

    elsif v_pedido is not null then
      -- Ella escribio un precio para cerrar el trato. Se compara en
      -- bolivares redondeados, que es lo que ella ve y escribe: comparar
      -- dolares de cuatro decimales rechazaba justo el minimo exacto.
      v_piso := coalesce(precio_minimo_de(v_modelo_id), v_precio_lista);
      if round(v_pedido * v_tasa.tasa_bcv, 2) < round(v_piso * v_tasa.tasa_bcv, 2) then
        raise exception 'No puedes vender "%" por menos de Bs %. Ese es el minimo.',
          v_nombre, to_char(round(v_piso * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
      end if;
      if round(v_pedido * v_tasa.tasa_bcv, 2) > round(v_precio_lista * v_tasa.tasa_bcv, 2) then
        raise exception 'El precio de "%" no puede pasar de su precio de lista.', v_nombre;
      end if;
      v_precio_usd := least(greatest(v_pedido, v_piso), v_precio_lista);
      if v_precio_usd < v_precio_lista then
        v_motivo := 'regateo';
      end if;
    end if;

    v_precio_bs := round(v_precio_usd * v_tasa.tasa_bcv, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs,
                             precio_lista_usd, costo_puesto_usd_snap,
                             costo_operativo_usd_snap, motivo_rebaja)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            v_precio_usd, v_precio_bs, v_precio_lista, v_costo, v_operativo, v_motivo);

    v_total_bs := v_total_bs + (v_precio_bs * v_cantidad);
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  return v_venta_id;
end;
$fn$;

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text)
  from public, anon;
grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text)
  to authenticated;


-- ---------------------------------------------------------------------
-- 6. CUÁNTO SE REBAJÓ, EN QUÉ PIEZA Y QUIÉN
--
-- Una fila por línea vendida por debajo de su etiqueta. En dólares BCV, la
-- moneda de la etiqueta. Solo administrador: `where es_admin()` va en una
-- vista sin agregados, así que no hay fila que se escape.
-- ---------------------------------------------------------------------

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
  and i.precio_lista_usd > 0
  and i.precio_unitario_usd < i.precio_lista_usd
  and es_admin();

revoke all on v_rebajas from anon;
grant select on v_rebajas to authenticated;


-- ---------------------------------------------------------------------
-- 7. EL PEDIDO DEL CATÁLOGO COBRA LO MISMO QUE EL MOSTRADOR
--
-- `crear_reserva` aplicaba el tramo al subtotal entero, sin piso. El
-- mostrador lo aplica pieza por pieza sin bajar del piso de margen. En una
-- pieza de margen fino las dos cifras no coincidían, y la clienta llegaba
-- a la tienda con un total que el mostrador no le cobraba. Ahora la
-- reserva hace lo mismo que `registrar_venta`.
--
-- La pantalla pública sigue estimando con el porcentaje llano: no puede
-- conocer los pisos, que son de mostrador. La cifra que vale es la de la
-- reserva, y es la que ve la clienta en cuanto aparta.
-- ---------------------------------------------------------------------

create or replace function crear_reserva(
  p_items            jsonb,
  p_cliente_nombre   text,
  p_cliente_apellido text,
  p_cliente_cedula   text,
  p_cliente_telefono text,
  p_entrega          text default 'tienda',
  p_envio_empresa    text default null,
  p_envio_agencia    text default null,
  p_envio_direccion  text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_modelo     bigint;
  v_item       jsonb;
  v_cantidad   int;
  v_disponible int;
  v_nombre     text;
  v_precio     numeric(12,4);
  v_linea      numeric(12,4);
  v_piezas     int := 0;
  v_previas    int := 0;
  v_subtotal   numeric(12,4) := 0;
  v_desc       numeric(5,2);
  v_total      numeric(12,4) := 0;
  v_min_p      numeric(12,4);
  v_min_u      numeric(12,4);
  v_minutos    numeric(12,4);
  v_id         bigint;
  v_token      uuid;
  v_entrega    forma_entrega;
  v_empresa    empresa_envio;
  v_nom        text := nullif(trim(p_cliente_nombre), '');
  v_ape        text := nullif(trim(p_cliente_apellido), '');
  v_ced        text := nullif(trim(p_cliente_cedula), '');
  v_tel        text := nullif(trim(p_cliente_telefono), '');
  v_agencia    text := nullif(trim(p_envio_agencia), '');
  v_direccion  text := nullif(trim(p_envio_direccion), '');
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No elegiste ninguna pieza.';
  end if;

  if v_nom is null then raise exception 'Falta tu nombre.'; end if;
  if v_ape is null then raise exception 'Falta tu apellido.'; end if;
  if v_ced is null then raise exception 'Falta tu cedula.'; end if;
  if v_tel is null then raise exception 'Falta tu numero de telefono.'; end if;

  if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cedula esta incompleta.';
  end if;
  if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
    raise exception 'Ese telefono esta incompleto. Escribelo con el codigo, por ejemplo 0412 1234567.';
  end if;

  begin
    v_entrega := coalesce(nullif(trim(p_entrega), ''), 'tienda')::forma_entrega;
  exception when others then
    raise exception 'La forma de entrega tiene que ser tienda o envio.';
  end;

  if v_entrega = 'envio' then
    begin
      v_empresa := nullif(trim(p_envio_empresa), '')::empresa_envio;
    exception when others then
      raise exception 'La empresa de envio tiene que ser Domesa o MRW.';
    end;
    if v_empresa is null then raise exception 'Dinos por cual empresa lo enviamos: Domesa o MRW.'; end if;
    if v_agencia is null then raise exception 'Falta a que agencia lo enviamos.'; end if;
    if v_direccion is null then raise exception 'Falta la direccion de la agencia.'; end if;
  else
    v_empresa   := null;
    v_agencia   := null;
    v_direccion := null;
  end if;

  perform limpiar_reservas();

  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  -- El tramo se decide antes de recorrer, igual que en el mostrador.
  select coalesce(sum(greatest((x->>'cantidad')::int, 0)), 0)
    into v_previas
    from jsonb_array_elements(p_items) x;
  v_desc := coalesce(descuento_para(v_previas), 0);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select m.nombre || coalesce(' · ' || m.variante, ''),
           coalesce(m.precio_override_usd, g.precio_usd)
      into v_nombre, v_precio
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo and m.activo;
    if not found then
      raise exception 'Una de las piezas que elegiste ya no esta disponible.';
    end if;
    if v_precio is null then
      raise exception 'La pieza "%" todavia no tiene precio. Escribenos y te cotizamos.', v_nombre;
    end if;

    select coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = v_modelo), 0)
         - coalesce((select sum(ri.cantidad)
                       from reserva_items ri
                       join reservas r on r.id = ri.reserva_id
                      where ri.modelo_id = v_modelo
                        and r.estado = 'abierta'
                        and r.expira_en > now()), 0)
      into v_disponible;

    if v_cantidad > v_disponible then
      raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, v_disponible, v_cantidad;
    end if;

    -- Pieza por pieza, sin bajar del piso de margen: lo mismo que cobra
    -- `registrar_venta` con esa misma cantidad de piezas.
    v_linea := v_precio;
    if v_desc > 0 then
      v_linea := least(v_precio,
                       greatest(round(v_precio * (1 - v_desc / 100), 4),
                                coalesce(piso_margen_de(v_modelo), v_precio)));
    end if;

    v_piezas   := v_piezas + v_cantidad;
    v_subtotal := v_subtotal + (v_precio * v_cantidad);
    v_total    := v_total + (v_linea * v_cantidad);
  end loop;

  v_total := round(v_total, 4);

  select valor into v_min_p from configuracion where clave = 'mayoreo_min_piezas';
  select valor into v_min_u from configuracion where clave = 'mayoreo_min_usd';

  if v_piezas < v_min_p and v_total < v_min_u then
    raise exception 'El pedido al mayor requiere % piezas o $%. Llevas % piezas y $%.',
      trunc(v_min_p)::int, to_char(v_min_u, 'FM999999990.00'),
      v_piezas, to_char(v_total, 'FM999999990.00');
  end if;

  select valor into v_minutos from configuracion where clave = 'reserva_minutos';

  insert into reservas (cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
                        entrega, envio_empresa, envio_agencia, envio_direccion,
                        piezas, subtotal_usd, descuento_pct, total_usd, expira_en)
  values (v_nom, v_ape, v_ced, v_tel,
          v_entrega, v_empresa, v_agencia, v_direccion,
          v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now() + (coalesce(v_minutos, 60) || ' minutes')::interval)
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int
    from jsonb_array_elements(p_items) x;

  return v_token;
end;
$fn$;

revoke all on function crear_reserva(jsonb, text, text, text, text, text, text, text, text) from public;
grant execute on function crear_reserva(jsonb, text, text, text, text, text, text, text, text) to anon, authenticated;

-- La reserva dice qué variante se apartó: "Cadena cubana" a secas no le
-- sirve ni a la clienta ni a quien la despacha.
create or replace function ver_reserva(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r     reservas%rowtype;
  v_items jsonb;
begin
  perform limpiar_reservas();

  select * into v_r from reservas where token = p_token;
  if not found then
    raise exception 'Esa reserva no existe o el enlace esta mal copiado.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'modelo_id', ri.modelo_id, 'cantidad', ri.cantidad,
           'sku', c.sku, 'nombre', c.nombre,
           'variantes_nota', c.variantes_nota,
           'foto_thumb_path', c.foto_thumb_path,
           'precio_usd', c.precio_usd,
           'variante', c.variante
         ) order by c.nombre, c.variante), '[]'::jsonb)
    into v_items
    from reserva_items ri
    join v_catalogo_venta c on c.id = ri.modelo_id
   where ri.reserva_id = v_r.id;

  return jsonb_build_object(
    'estado',           v_r.estado,
    'creado_en',        v_r.creado_en,
    'expira_en',        v_r.expira_en,
    'cliente_nombre',   v_r.cliente_nombre,
    'cliente_apellido', v_r.cliente_apellido,
    'cliente_telefono', v_r.cliente_telefono,
    'entrega',          v_r.entrega,
    'envio_empresa',    v_r.envio_empresa,
    'envio_agencia',    v_r.envio_agencia,
    'envio_direccion',  v_r.envio_direccion,
    'pago_metodo',      v_r.pago_metodo,
    'pago_referencia',  v_r.pago_referencia,
    'pago_fecha',       v_r.pago_fecha,
    'pago_reportado_en', v_r.pago_reportado_en,
    'piezas',           v_r.piezas,
    'subtotal_usd',     v_r.subtotal_usd,
    'descuento_pct',    v_r.descuento_pct,
    'total_usd',        v_r.total_usd,
    'items',            v_items);
end;
$fn$;

revoke all on function ver_reserva(uuid) from public;
grant execute on function ver_reserva(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Que no hayan quedado DOS admin_guardar_modelo:
--
--      select count(*) from pg_proc where proname = 'admin_guardar_modelo';
--        -> 1. Si da 2, suelta la de trece parámetros por su firma.
--
-- 2. Los dos pisos, con tu sesión de administrador:
--
--      select sku, precio_usd, precio_minimo_usd, piso_tramo_usd
--        from v_catalogo_venta order by precio_usd desc limit 5;
--        -> en cada fila: piso_tramo_usd <= precio_minimo_usd <= precio_usd.
--           Con rebaja máxima 10 %, precio_minimo_usd es el mayor entre
--           el 90 % de la etiqueta y piso_tramo_usd. Una pieza de $20,00
--           con margen holgado da mínimo $18,00 y piso de tramo por debajo.
--
--      select count(*) from v_catalogo_venta where piso_tramo_usd > precio_minimo_usd + 0.01;
--        -> 0. Si no, algo quedó al revés.
--
-- 3. El tramo que ahora sí llega: con los tramos de fábrica (6 → 5 %,
--    12 → 10 %, 20 → 15 %), una pieza de $20,00 en una venta de 20 piezas
--    sale a $17,00 BCV (antes: $18,00, cortada por el 10 % del regateo),
--    salvo que su piso de margen sea mayor.
--
-- 4. Variantes, que no haya familias rotas:
--
--      select count(*) from modelos m
--       where m.familia_id is not null
--         and not exists (select 1 from modelos c where c.id = m.familia_id and c.familia_id = c.id);
--        -> 0. Toda familia tiene una cabeza que se apunta a sí misma.
--
-- 5. Con sesión de VENDEDORA (o en la pantalla de Verificación):
--
--      select fijar_tasa(0, 0);
--        -> tiene que fallar con "Las dos tasas deben ser mayores que
--           cero". Si falla con "permission denied", no puede fijarla.
--
--      select count(*) from v_rebajas;
--        -> 0 filas: es del administrador.
--
-- 6. Sin sesión, como una clienta cualquiera:
--
--      select piso_tramo_usd from v_disponible_publico limit 1;
--        -> tiene que FALLAR con "column does not exist".
--      select familia, variante from v_disponible_publico limit 1;
--        -> funciona.
-- =====================================================================
