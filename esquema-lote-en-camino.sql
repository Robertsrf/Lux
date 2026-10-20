-- =====================================================================
-- Lux by Emory — el lote en camino: cargarlo antes de que llegue
-- Ejecutar en el SQL Editor DESPUÉS de esquema-quitar-por-verificar.sql (#58)
--
-- QUÉ PIDIÓ EL DUEÑO (20/10/2026)
-- Adelantar el trabajo de un lote que todavía no llega: registrarlo y ir
-- cargando sus productos, sin que salgan a la venta. Si se cargaban como
-- siempre, aparecían disponibles en el catálogo y confundían a las
-- clientas. Cuando la mercancía llega, él revisa que vino todo y lo
-- LIBERA: desde ese momento se vende, cuenta en el inventario y en las
-- estadísticas y sale en la vitrina, como cualquier otra pieza. Eligió
-- además que las clientas vean lo nuevo como "Próximamente" en el
-- catálogo en línea (sin poder pedirlo), y que el lote pueda traer
-- también más piezas de productos que ya se venden (reposición).
--
-- LA REGLA QUE LO SOSTIENE
-- Lo que viene NO se anota en `existencias`: se anota en `por_llegar`
-- (lote, pieza, ubicación a la que va y cuántas). Todo lo que vende en
-- este sistema mira `existencias` (el mostrador, el catálogo, el del
-- revendedor, el apartado, la vitrina, el PDF) y todo lo que cuenta
-- inventario también. Así lo que viene no se puede vender ni contar por
-- construcción, sin tener que acordarse de filtrarlo en cada pantalla.
-- Y para que nadie la rompa: un disparador no deja que una pieza de un
-- lote en camino tenga existencia, venga de donde venga la escritura.
--
--   - Un lote se registra "en camino" (`lotes.en_camino`).
--   - Producto NUEVO del lote: un modelo con ese lote. Su cantidad va a
--     `por_llegar` (lo hace `admin_guardar_modelo`, sin que el navegador
--     decida nada). No sale en el catálogo de venta; sale en el
--     Inventario como "Próximamente" y, para las clientas, en
--     `v_proximamente`, sin cantidad ni nada de la tienda.
--   - REPOSICIÓN: más piezas de un producto que ya se vende. Ese producto
--     sigue a la venta con lo que hay; lo que viene se anota en el lote
--     (`admin_guardar_por_llegar`) y se suma al liberarlo.
--   - LIBERAR (`admin_liberar_lote`): el dueño dice cuántas llegaron de
--     cada línea; eso entra a `existencias`, el lote deja de estar en
--     camino y su fecha de llegada pasa a ser la de hoy. Lo que se
--     esperaba y lo que llegó queda escrito en `por_llegar`.
--
-- POR QUÉ NO SE USA `activo = false`
-- Retirar es otra cosa (una pieza que ya no se vende), y "Quitar" una
-- variante ya lo usa. Mezclarlo haría que una pieza retirada volviera a
-- la venta al liberar un lote, o que una próxima se viera como retirada.
--
-- LAS ESTADÍSTICAS
-- Las que miran la existencia ya no ven lo que viene (no tiene). Las que
-- contaban modelos activos sin mirar la existencia (`v_valor_inventario`,
-- `v_diagnostico`, `v_rotacion_modelo`) dejan fuera lo que está en
-- camino; y la rotación cuenta los días en inventario desde que se liberó
-- el lote, no desde que se cargó la ficha. El dinero del lote no cambia:
-- ya se pagó, y sigue en Lotes e Inversiones como hasta ahora.
--
-- FIRMAS
-- `admin_guardar_lote` gana `p_en_camino` AL FINAL y con valor por
-- defecto: el navegador viejo manda diez y sigue encajando (y entonces el
-- lote queda como estaba). `admin_guardar_modelo` y `guardar_variantes_de`
-- no cambian de firma: cambian por dentro, para mandar la cantidad a
-- `por_llegar` cuando el lote no ha llegado.
--
-- LAS VISTAS DEL CATÁLOGO
-- `v_catalogo_venta` tenía las fórmulas del precio y de la existencia, y
-- el inventario del dueño (`v_catalogo_admin`) colgaba de ella. Ahora las
-- fórmulas viven en `v_catalogo_base` (interna, cerrada a todos) y las
-- dos cuelgan de ella: la de venta sin lo próximo y la del dueño con
-- todo. Una fórmula, un sitio. Los pisos siguen en la lista de columnas,
-- no en un lateral: la clienta sin sesión lee el catálogo sin pedirlos y
-- Postgres no los evalúa (ver la nota de esquema-variantes-y-mostrador).
--
-- Se puede volver a correr entero.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL LOTE: EN CAMINO, Y CUÁNDO Y QUIÉN LO LIBERÓ
-- Los lotes de antes ya llegaron: el valor por defecto es "no".
-- ---------------------------------------------------------------------

alter table lotes
  add column if not exists en_camino    boolean not null default false,
  add column if not exists liberado_en  timestamptz,
  add column if not exists liberado_por uuid references perfiles(id);

comment on column lotes.en_camino is
  'Todavía no llega: lo que trae se anota en por_llegar y no se vende hasta liberarlo';
comment on column lotes.liberado_en is
  'Cuándo se revisó y se puso a la venta lo que trajo (admin_liberar_lote)';


-- ---------------------------------------------------------------------
-- 2. LO QUE VIENE
-- Una fila por pieza y ubicación de destino. `cantidad` es lo que se
-- espera; `recibida`, lo que llegó al liberarlo (null hasta entonces).
-- Revocada a todos: se escribe por sus funciones y se lee por
-- `v_por_llegar`, que es del dueño.
-- ---------------------------------------------------------------------

create table if not exists por_llegar (
  id             bigserial primary key,
  lote_id        bigint not null references lotes(id),
  modelo_id      bigint not null references modelos(id),
  ubicacion_id   bigint not null references ubicaciones(id),
  cantidad       int not null check (cantidad >= 0),
  recibida       int check (recibida is null or recibida >= 0),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (lote_id, modelo_id, ubicacion_id)
);

create index if not exists por_llegar_modelo_idx on por_llegar (modelo_id);
alter table por_llegar enable row level security;
revoke all on por_llegar from anon, authenticated;
revoke all on sequence por_llegar_id_seq from anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. LA REGLA, EN LA BASE
-- Una pieza cuyo lote está en camino no tiene existencia. Vigila TODA
-- escritura de `existencias` (el conteo, mover, una venta anulada, el
-- formulario), así que ni un error de pantalla ni alguien desde la
-- consola la pone a la venta antes de liberar el lote.
-- ---------------------------------------------------------------------

create or replace function existencia_no_en_camino()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_nombre text;
  v_lote   text;
begin
  select m.nombre || coalesce(' · ' || m.variante, ''), l.codigo
    into v_nombre, v_lote
    from modelos m
    join lotes l on l.id = m.lote_id
   where m.id = new.modelo_id and l.en_camino;
  if found then
    raise exception '"%" viene en el lote %, que todavía no llega: se pone a la venta al liberar el lote, en Lotes.', v_nombre, v_lote;
  end if;
  return new;
end;
$fn$;

revoke all on function existencia_no_en_camino() from public, anon, authenticated;

drop trigger if exists existencia_no_en_camino on existencias;
create trigger existencia_no_en_camino
  before insert or update of cantidad, modelo_id on existencias
  for each row
  when (new.cantidad > 0)
  execute function existencia_no_en_camino();

-- Y la otra puerta: una pieza que ya tiene piezas en la tienda no se pasa
-- a un lote en camino (desaparecería de la venta con la mercancía en la
-- vitrina). Si vienen más de ella, eso es una reposición.
create or replace function modelo_no_pasa_a_lote_en_camino()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lote  text;
  v_otro  text;
begin
  if new.lote_id is not distinct from old.lote_id then
    return new;
  end if;
  select codigo into v_lote from lotes where id = new.lote_id and en_camino;
  if not found then
    return new;
  end if;
  if exists (select 1 from existencias where modelo_id = new.id and cantidad > 0) then
    raise exception '"%" ya tiene piezas en la tienda: no puede pasar al lote %, que todavía no llega. Si vienen más, súmalas en ese lote como reposición.',
      new.nombre || coalesce(' · ' || new.variante, ''), v_lote;
  end if;
  -- Ya viene en OTRO lote en camino como reposición: si pasara a ser nueva
  -- de este, liberar aquel no podría darle existencia y se trabaría.
  select l.codigo into v_otro
    from por_llegar p
    join lotes l on l.id = p.lote_id
   where p.modelo_id = new.id and l.en_camino and l.id <> new.lote_id and p.cantidad > 0
   limit 1;
  if found then
    raise exception '"%" ya viene en el lote % como reposición: quítala de ese lote antes de pasarla al %.',
      new.nombre || coalesce(' · ' || new.variante, ''), v_otro, v_lote;
  end if;
  return new;
end;
$fn$;

revoke all on function modelo_no_pasa_a_lote_en_camino() from public, anon, authenticated;

drop trigger if exists modelo_no_pasa_a_lote_en_camino on modelos;
create trigger modelo_no_pasa_a_lote_en_camino
  before update of lote_id on modelos
  for each row
  execute function modelo_no_pasa_a_lote_en_camino();


-- ---------------------------------------------------------------------
-- 4. ANOTAR UNA LÍNEA DE LO QUE VIENE, Y GUARDAR LAS CANTIDADES DE UNA
--    PIEZA DONDE TOCAN
-- Por dentro, revocadas a todos: las llaman las funciones del dueño.
-- ---------------------------------------------------------------------

create or replace function anotar_por_llegar(
  p_lote_id      bigint,
  p_modelo_id    bigint,
  p_ubicacion_id bigint,
  p_cantidad     int
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Cero es "no viene": la línea se quita, no se deja esperando nada.
  if coalesce(p_cantidad, 0) <= 0 then
    delete from por_llegar
     where lote_id = p_lote_id and modelo_id = p_modelo_id and ubicacion_id = p_ubicacion_id;
    return;
  end if;
  insert into por_llegar (lote_id, modelo_id, ubicacion_id, cantidad)
  values (p_lote_id, p_modelo_id, p_ubicacion_id, p_cantidad)
  on conflict (lote_id, modelo_id, ubicacion_id)
  do update set cantidad = excluded.cantidad, actualizado_en = now();
end;
$fn$;

revoke all on function anotar_por_llegar(bigint, bigint, bigint, int) from public, anon, authenticated;

/**
 * Las cantidades del formulario de una pieza, por ubicación. Si su lote
 * está en camino van a `por_llegar` (lo que viene); si no, a
 * `existencias`, como siempre. `p_lote_anterior` es el lote que tenía
 * antes de guardar: si cambió y aquel no había llegado, lo que esperaba
 * de él ya no viene por ahí (el formulario manda todas sus cantidades, y
 * se escriben donde tocan ahora).
 */
create or replace function guardar_cantidades_de(
  p_modelo_id     bigint,
  p_cantidades    jsonb,
  p_lote_anterior bigint default null
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lote      bigint;
  v_en_camino boolean;
  v_fila      jsonb;
  v_ubic      bigint;
  v_cant      int;
begin
  select m.lote_id, coalesce(l.en_camino, false)
    into v_lote, v_en_camino
    from modelos m
    left join lotes l on l.id = m.lote_id
   where m.id = p_modelo_id;

  if p_lote_anterior is not null and p_lote_anterior is distinct from v_lote
     and exists (select 1 from lotes where id = p_lote_anterior and en_camino) then
    delete from por_llegar where lote_id = p_lote_anterior and modelo_id = p_modelo_id;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_cantidades, '[]'::jsonb))
  loop
    v_ubic := (v_fila->>'ubicacion_id')::bigint;
    v_cant := greatest(coalesce((v_fila->>'cantidad')::int, 0), 0);
    if v_en_camino then
      perform anotar_por_llegar(v_lote, p_modelo_id, v_ubic, v_cant);
    else
      insert into existencias (modelo_id, ubicacion_id, cantidad)
      values (p_modelo_id, v_ubic, v_cant)
      on conflict (modelo_id, ubicacion_id)
      do update set cantidad = excluded.cantidad, actualizado_en = now();
    end if;
  end loop;
end;
$fn$;

revoke all on function guardar_cantidades_de(bigint, jsonb, bigint) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. GUARDAR EL LOTE, AHORA CON "EN CAMINO"
-- La de esquema-flete-y-gastos.sql con `p_en_camino` al final. El estado
-- solo se cambia aquí mientras el lote no tenga nada cargado: con piezas
-- dentro, "ya llegó" es liberarlo (que revisa lo que vino), y "en camino"
-- no se le pone a un lote cuyas piezas ya se venden.
-- ---------------------------------------------------------------------

drop function if exists admin_guardar_lote(bigint, text, date, numeric, numeric, numeric, numeric, integer, integer, text);

create or replace function admin_guardar_lote(
  p_id                    bigint,
  p_codigo                text,
  p_fecha_llegada         date,
  p_tasa_binance_compra   numeric,
  p_costo_mercancia_usd   numeric,
  p_costo_exhibidores_usd numeric,
  p_costo_flete_usd       numeric,
  p_piezas_mercancia      integer,
  p_unidades_exhibidores  integer,
  p_notas                 text default null,
  p_en_camino             boolean default null   -- null: como estaba (el navegador viejo no lo manda)
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     bigint;
  v_codigo text;
  v_lote   lotes%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede registrar lotes.';
  end if;

  v_codigo := nullif(trim(p_codigo), '');
  if v_codigo is null then
    v_codigo := 'L' || to_char(coalesce(p_fecha_llegada, current_date), 'YYMM')
                || '-' || lpad(((select count(*) from lotes) + 1)::text, 2, '0');
  end if;

  if p_id is null then
    insert into lotes (
      codigo, fecha_llegada, tasa_binance_compra,
      costo_mercancia_usd, costo_exhibidores_usd, costo_flete_usd,
      piezas_mercancia, unidades_exhibidores, notas, en_camino
    ) values (
      v_codigo, p_fecha_llegada, p_tasa_binance_compra,
      coalesce(p_costo_mercancia_usd, 0), coalesce(p_costo_exhibidores_usd, 0),
      coalesce(p_costo_flete_usd, 0),
      greatest(coalesce(p_piezas_mercancia, 0), 0),
      greatest(coalesce(p_unidades_exhibidores, 0), 0),
      p_notas, coalesce(p_en_camino, false)
    ) returning id into v_id;
    return v_id;
  end if;

  select * into v_lote from lotes where id = p_id for update;
  if not found then
    raise exception 'El lote % no existe.', p_id;
  end if;

  -- La tasa Binance de un lote es un hecho historico: no se toca jamas.
  if p_tasa_binance_compra is not null and p_tasa_binance_compra <> v_lote.tasa_binance_compra then
    raise exception 'La tasa Binance del lote % ya esta sellada en %. No se puede cambiar.', p_id, v_lote.tasa_binance_compra;
  end if;

  if p_en_camino is not null and p_en_camino <> v_lote.en_camino then
    if v_lote.liberado_en is not null then
      raise exception 'El lote % ya se liberó: lo que trajo ya está a la venta.', v_lote.codigo;
    end if;
    if exists (select 1 from modelos where lote_id = p_id)
       or exists (select 1 from por_llegar where lote_id = p_id) then
      if p_en_camino then
        raise exception 'El lote % ya tiene piezas cargadas que se venden: no se puede marcar como en camino.', v_lote.codigo;
      else
        raise exception 'Para dar por llegado el lote %, revisa lo que vino y libéralo con "Revisar y liberar".', v_lote.codigo;
      end if;
    end if;
  end if;

  update lotes set
    codigo                = v_codigo,
    fecha_llegada         = p_fecha_llegada,
    costo_mercancia_usd   = coalesce(p_costo_mercancia_usd, 0),
    costo_exhibidores_usd = coalesce(p_costo_exhibidores_usd, 0),
    costo_flete_usd       = coalesce(p_costo_flete_usd, 0),
    piezas_mercancia      = greatest(coalesce(p_piezas_mercancia, 0), 0),
    unidades_exhibidores  = greatest(coalesce(p_unidades_exhibidores, 0), 0),
    notas                 = p_notas,
    en_camino             = coalesce(p_en_camino, en_camino)
  where id = p_id;

  return p_id;
end;
$$;

revoke all on function admin_guardar_lote(bigint, text, date, numeric, numeric, numeric, numeric, integer, integer, text, boolean) from public, anon;
grant execute on function admin_guardar_lote(bigint, text, date, numeric, numeric, numeric, numeric, integer, integer, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 6. GUARDAR EL PRODUCTO Y SUS VARIANTES
-- Las de esquema-variantes-en-tabla.sql, con una sola diferencia: las
-- cantidades se guardan con `guardar_cantidades_de`, que las manda a
-- `por_llegar` si el lote no ha llegado. Misma firma, mismo resto.
-- ---------------------------------------------------------------------

create or replace function guardar_variantes_de(
  p_modelo_id bigint,
  p_variantes jsonb,
  p_foto_vieja text
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  m          modelos%rowtype;
  v_familia  bigint;
  v_fila     jsonb;
  v_id       bigint;
  v_etiqueta text;
  v_costo    numeric(12,4);
  v_antes    modelos%rowtype;
  v_grupo    bigint;
  v_override numeric(12,4);
  v_sug      jsonb;
  v_vivas    int;
  v_nombres  text[] := '{}';
begin
  select * into m from modelos where id = p_modelo_id;
  if not found then
    raise exception 'El modelo % no existe.', p_modelo_id;
  end if;

  select count(*) into v_vivas
    from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
   where not coalesce((x->>'quitar')::boolean, false);

  v_familia := coalesce(m.familia_id, m.id);

  if v_vivas > 0 then
    -- Con hermanas, la principal tambien necesita su nombre de variante:
    -- dos opciones sin nombre en la hoja de elegir son dos botones iguales.
    if nullif(btrim(coalesce(m.variante, '')), '') is null then
      raise exception 'Ponle nombre de variante a esta también: por ejemplo 45 cm.';
    end if;
    v_nombres := array[lower(btrim(m.variante))];
    if m.familia_id is null then
      update modelos set familia_id = m.id where id = m.id;
    end if;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    v_id := nullif(v_fila->>'id', '')::bigint;

    -- Quitar: fuera del catalogo, con sus ventas intactas.
    if coalesce((v_fila->>'quitar')::boolean, false) then
      if v_id is not null then
        update modelos
           set activo = false, actualizado_en = now()
         where id = v_id and id <> m.id and coalesce(familia_id, id) = v_familia;
      end if;
      continue;
    end if;

    v_etiqueta := nullif(btrim(coalesce(v_fila->>'variante', '')), '');
    if v_etiqueta is null then
      raise exception 'Cada variante necesita su nombre: 45 cm, talla 7, dorada.';
    end if;
    if lower(v_etiqueta) = any(v_nombres) then
      raise exception 'Hay dos variantes que se llaman "%". Cámbiale el nombre a una.', v_etiqueta;
    end if;
    v_nombres := v_nombres || lower(v_etiqueta);

    v_costo := nullif(v_fila->>'costo_unitario_usd', '')::numeric;
    if v_costo is not null and v_costo < 0 then
      raise exception 'El costo de "%" no puede ser negativo.', v_etiqueta;
    end if;

    v_antes := null;
    if v_id is not null then
      select * into v_antes from modelos
       where id = v_id and id <> m.id and coalesce(familia_id, id) = v_familia;
      if not found then
        raise exception 'La variante "%" ya no pertenece a este producto. Recarga la pantalla.', v_etiqueta;
      end if;
    end if;

    if v_costo is null or v_costo = m.costo_unitario_usd then
      -- Cuesta lo mismo que el producto: vale lo mismo.
      v_costo    := m.costo_unitario_usd;
      v_grupo    := m.grupo_precio_id;
      v_override := m.precio_override_usd;
    elsif v_antes.id is not null and v_costo = v_antes.costo_unitario_usd then
      -- Su costo propio no cambio: se respeta su precio como estaba.
      v_grupo    := v_antes.grupo_precio_id;
      v_override := v_antes.precio_override_usd;
    else
      -- Costo nuevo: el grupo con la misma cuenta que el formulario.
      v_sug      := admin_sugerir_precio(m.lote_id, v_costo, null);
      v_grupo    := nullif(v_sug->>'grupo_id', '')::bigint;
      v_override := null;
    end if;

    if v_id is null then
      insert into modelos (
        sku, nombre, categoria, descripcion, variantes_nota,
        lote_id, costo_unitario_usd, flete_unitario_usd,
        grupo_precio_id, precio_override_usd, foto_path, foto_thumb_path,
        variante, familia_id
      ) values (
        generar_sku(m.categoria, v_grupo), m.nombre, m.categoria, m.descripcion, m.variantes_nota,
        m.lote_id, v_costo, m.flete_unitario_usd,
        v_grupo, v_override, m.foto_path, m.foto_thumb_path,
        v_etiqueta, v_familia
      ) returning id into v_id;
    else
      update modelos set
        nombre              = m.nombre,
        categoria           = m.categoria,
        descripcion         = m.descripcion,
        variantes_nota      = m.variantes_nota,
        lote_id             = m.lote_id,
        flete_unitario_usd  = m.flete_unitario_usd,
        costo_unitario_usd  = v_costo,
        grupo_precio_id     = v_grupo,
        precio_override_usd = v_override,
        variante            = v_etiqueta,
        -- La foto del producto, salvo que la variante tenga una propia.
        foto_path           = case when foto_path is null or foto_path is not distinct from p_foto_vieja
                                   then m.foto_path else foto_path end,
        foto_thumb_path     = case when foto_path is null or foto_path is not distinct from p_foto_vieja
                                   then m.foto_thumb_path else foto_thumb_path end,
        actualizado_en      = now()
      where id = v_id;
    end if;

    -- Lo nuevo: a `por_llegar` si el lote no ha llegado, a `existencias` si
    -- ya está aquí. El lote de antes es el de la variante antes de guardar.
    perform guardar_cantidades_de(v_id, v_fila->'existencias', v_antes.lote_id);
  end loop;
end;
$fn$;

revoke all on function guardar_variantes_de(bigint, jsonb, text) from public, anon, authenticated;

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
  p_variante            text default null,
  p_variante_de         bigint default null,   -- se ignora desde la tabla de variantes; ver esquema-variantes-en-tabla.sql
  p_variantes           jsonb default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id         bigint;
  v_sku        text;
  v_flete      numeric;
  v_familia    bigint;
  v_mia        bigint;
  v_foto_vieja text;
  v_lote_viejo bigint;
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
    -- La foto de antes: las variantes que la compartian se llevan la nueva.
    -- Y el lote de antes: si no habia llegado y cambia, lo que esperaba de
    -- el se escribe donde toca ahora.
    select foto_path, lote_id into v_foto_vieja, v_lote_viejo from modelos where id = v_id;

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
      foto_path           = coalesce(p_foto_path, foto_path),
      foto_thumb_path     = coalesce(p_foto_thumb_path, foto_thumb_path),
      variante            = case when p_variante is null then variante
                                 else nullif(trim(p_variante), '') end,
      actualizado_en      = now()
    where id = v_id;
    if not found then
      raise exception 'El modelo % no existe.', p_id;
    end if;
  end if;

  perform guardar_cantidades_de(v_id, p_existencias, v_lote_viejo);

  -- El camino viejo de "agregar otra variante", para el navegador que
  -- todavia lo mande mientras se publica.
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

  -- Las variantes, en la misma transaccion: si una falla, no queda nada a medias.
  if p_variantes is not null then
    perform guardar_variantes_de(v_id, p_variantes, v_foto_vieja);
  end if;

  return v_id;
end;
$fn$;

revoke all on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb, text, bigint, jsonb) from public, anon;
grant execute on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb, text, bigint, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 7. LA REPOSICIÓN: LO QUE VIENE DE UNA PIEZA QUE YA SE VENDE
-- Las cantidades por ubicación, enteras: cero quita la línea. También
-- sirve para una pieza nueva del mismo lote (es lo que hace su
-- formulario). Una pieza nueva de OTRO lote en camino no se anota aquí:
-- lo suyo viene en el suyo.
-- ---------------------------------------------------------------------

create or replace function admin_guardar_por_llegar(
  p_lote_id    bigint,
  p_modelo_id  bigint,
  p_cantidades jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lote   lotes%rowtype;
  v_m      modelos%rowtype;
  v_suyo   lotes%rowtype;
  v_fila   jsonb;
  v_texto  text;
  v_ubic   bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anotar lo que viene en un lote.';
  end if;

  select * into v_lote from lotes where id = p_lote_id for update;
  if not found then
    raise exception 'Ese lote no existe.';
  end if;
  if not v_lote.en_camino then
    raise exception 'El lote % ya llegó: lo que trajo ya está en el inventario.', v_lote.codigo;
  end if;

  select * into v_m from modelos where id = p_modelo_id;
  if not found or not v_m.activo then
    raise exception 'Esa pieza no existe o está retirada.';
  end if;
  select * into v_suyo from lotes where id = v_m.lote_id;
  if found and v_suyo.en_camino and v_suyo.id <> p_lote_id then
    raise exception '"%" es nueva del lote %: lo que viene de ella se anota en ese lote.',
      v_m.nombre || coalesce(' · ' || v_m.variante, ''), v_suyo.codigo;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_cantidades, '[]'::jsonb))
  loop
    v_ubic  := nullif(v_fila->>'ubicacion_id', '')::bigint;
    v_texto := v_fila->>'cantidad';
    if v_ubic is null or not exists (select 1 from ubicaciones where id = v_ubic and activo) then
      raise exception 'Una de las ubicaciones ya no existe. Recarga la pantalla.';
    end if;
    if v_texto is null or v_texto !~ '^[0-9]{1,6}$' then
      raise exception 'Cada cantidad es un número entero: 0, 1, 2...';
    end if;
    perform anotar_por_llegar(p_lote_id, p_modelo_id, v_ubic, v_texto::int);
  end loop;
end;
$fn$;

revoke all on function admin_guardar_por_llegar(bigint, bigint, jsonb) from public, anon;
grant execute on function admin_guardar_por_llegar(bigint, bigint, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 8. LIBERAR: LO QUE LLEGÓ, A LA VENTA
-- `p_llegaron` trae una fila por cada línea de lo que viene (pieza activa
-- y ubicación): {modelo_id, ubicacion_id, cantidad}. Tienen que estar
-- TODAS, y ninguna de más: si alguien cargó o quitó algo mientras se
-- revisaba, no se libera a medias, se pide recargar. Lo que llegó se SUMA
-- a la existencia (en una reposición ya había piezas), el lote deja de
-- estar en camino y su fecha de llegada es la de hoy, en Venezuela.
-- ---------------------------------------------------------------------

create or replace function admin_liberar_lote(
  p_lote_id  bigint,
  p_llegaron jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lote      lotes%rowtype;
  v_linea     record;
  v_dicho     jsonb;
  v_texto     text;
  v_cant      int;
  v_lineas    int := 0;
  v_esperadas int := 0;
  v_llegaron  int := 0;
  v_faltaron  int := 0;
  v_sobraron  int := 0;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede liberar un lote.';
  end if;

  select * into v_lote from lotes where id = p_lote_id for update;
  if not found then
    raise exception 'Ese lote no existe.';
  end if;
  if not v_lote.en_camino then
    raise exception 'El lote % ya se liberó: lo que trajo ya está a la venta.', v_lote.codigo;
  end if;
  if jsonb_typeof(coalesce(p_llegaron, '[]'::jsonb)) <> 'array' then
    raise exception 'Lo que llegó tiene que venir como una lista.';
  end if;

  for v_linea in
    select p.id, p.modelo_id, p.ubicacion_id, p.cantidad,
           m.nombre || coalesce(' · ' || m.variante, '') as nombre
      from por_llegar p
      join modelos m on m.id = p.modelo_id
     where p.lote_id = p_lote_id and m.activo and p.cantidad > 0
     order by p.id
       for update of p
  loop
    v_lineas := v_lineas + 1;
    select x into v_dicho
      from jsonb_array_elements(p_llegaron) x
     where (x->>'modelo_id')::bigint = v_linea.modelo_id
       and (x->>'ubicacion_id')::bigint = v_linea.ubicacion_id
     limit 1;
    if v_dicho is null then
      raise exception 'El lote cambió mientras lo revisabas: alguien cargó o quitó una pieza. Recarga la pantalla y revísalo otra vez.';
    end if;
    v_texto := v_dicho->>'cantidad';
    if v_texto is null or v_texto !~ '^[0-9]{1,6}$' then
      raise exception 'Lo que llegó de "%" no es un número entero.', v_linea.nombre;
    end if;
    v_cant := v_texto::int;

    update por_llegar set recibida = v_cant, actualizado_en = now() where id = v_linea.id;

    v_esperadas := v_esperadas + v_linea.cantidad;
    v_llegaron  := v_llegaron + v_cant;
    v_faltaron  := v_faltaron + greatest(v_linea.cantidad - v_cant, 0);
    v_sobraron  := v_sobraron + greatest(v_cant - v_linea.cantidad, 0);
  end loop;

  if jsonb_array_length(p_llegaron) <> v_lineas then
    raise exception 'El lote cambió mientras lo revisabas: alguien cargó o quitó una pieza. Recarga la pantalla y revísalo otra vez.';
  end if;

  -- Primero el lote deja de estar en camino: solo entonces la existencia
  -- de sus piezas nuevas se puede escribir (lo vigila el disparador).
  update lotes set
    en_camino     = false,
    liberado_en   = now(),
    liberado_por  = auth.uid(),
    fecha_llegada = (now() at time zone 'America/Caracas')::date
  where id = p_lote_id;

  insert into existencias (modelo_id, ubicacion_id, cantidad)
  select p.modelo_id, p.ubicacion_id, p.recibida
    from por_llegar p
   where p.lote_id = p_lote_id and p.recibida > 0
  on conflict (modelo_id, ubicacion_id)
  do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();

  return jsonb_build_object(
    'lote',      v_lote.codigo,
    'lineas',    v_lineas,
    'esperadas', v_esperadas,
    'llegaron',  v_llegaron,
    'faltaron',  v_faltaron,
    'sobraron',  v_sobraron
  );
end;
$fn$;

revoke all on function admin_liberar_lote(bigint, jsonb) from public, anon;
grant execute on function admin_liberar_lote(bigint, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 9. LAS VISTAS DEL CATÁLOGO: UNA BASE, DOS CARAS
-- `v_catalogo_base` es la v_catalogo_venta de esquema-variantes-y-
-- mostrador.sql, entera, con lo próximo dentro y tres columnas nuevas al
-- final. Cerrada a todos: la leen las otras vistas, como su dueño.
-- ---------------------------------------------------------------------

create or replace view v_catalogo_base
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
  coalesce(m.familia_id, m.id) as familia,
  m.variante,
  piso_margen_de(m.id) as piso_tramo_usd,
  round(piso_margen_de(m.id) * t.tasa_bcv, 2) as piso_tramo_bs,
  -- Nuevas. Su lote no ha llegado: es nueva y no se vende todavía.
  coalesce(lc.en_camino, false) as proximamente,
  -- Lo que viene de ella en lotes que no han llegado (nueva o reposición).
  coalesce((select sum(p.cantidad)
              from por_llegar p
              join lotes lp on lp.id = p.lote_id
             where p.modelo_id = m.id and lp.en_camino), 0)::int as por_llegar,
  (select string_agg(distinct lp.codigo, ' · ')
     from por_llegar p
     join lotes lp on lp.id = p.lote_id
    where p.modelo_id = m.id and lp.en_camino and p.cantidad > 0) as por_llegar_lotes
from modelos m
left join grupos_precio g on g.id = m.grupo_precio_id
left join lotes lc on lc.id = m.lote_id
left join lateral (select * from tasas where vigente limit 1) t on true
where m.activo;

revoke all on v_catalogo_base from anon, authenticated;

-- La del dueño, con todo: lo próximo también, y las tres columnas al final.
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
    v.familia,
    v.variante,
    -- Nuevas.
    v.proximamente,
    v.por_llegar,
    v.por_llegar_lotes
   FROM v_catalogo_base v
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

-- La de venta: las mismas columnas de siempre, sin lo que no ha llegado.
-- De ella cuelgan el mostrador, el catálogo público, el del revendedor, la
-- vitrina, el PDF, el conteo y los pedidos: ninguno ve lo próximo.
create or replace view v_catalogo_venta
with (security_invoker = off) as
select
  b.id, b.sku, b.nombre, b.categoria, b.descripcion, b.variantes_nota,
  b.foto_path, b.foto_thumb_path, b.grupo,
  b.precio_usd, b.precio_bs, b.precio_usd_real, b.existencia_total, b.activo,
  b.precio_minimo_usd, b.precio_minimo_bs,
  b.ubicaciones, b.ubicaciones_codigo,
  b.familia, b.variante, b.piso_tramo_usd, b.piso_tramo_bs
from v_catalogo_base b
where not b.proximamente;

grant select on v_catalogo_venta to authenticated;


-- ---------------------------------------------------------------------
-- 10. "PRÓXIMAMENTE", PARA LAS CLIENTAS
-- Lo nuevo de los lotes en camino, con su foto y su precio, sin cantidad,
-- sin ubicación y sin pisos: no se puede pedir, solo mirar. La reposición
-- no sale aquí: ese producto ya está en el catálogo.
-- ---------------------------------------------------------------------

create or replace view v_proximamente
with (security_invoker = off) as
select
  b.id, b.sku, b.nombre, b.categoria, b.variantes_nota,
  b.foto_path, b.foto_thumb_path, b.precio_usd, b.precio_bs,
  b.familia, b.variante
from v_catalogo_base b
where b.proximamente and b.por_llegar > 0;

grant select on v_proximamente to anon, authenticated;


-- ---------------------------------------------------------------------
-- 11. LO QUE VIENE, PARA EL DUEÑO
-- Cada línea con su pieza, su lote y su destino; si es nueva del lote o
-- una reposición (y cuántas hay ya de ella ahí); lo esperado y, después
-- de liberar, lo que llegó. Sin costo, pero es del dueño.
-- ---------------------------------------------------------------------

create or replace view v_por_llegar
with (security_invoker = off) as
select
  p.id,
  p.lote_id,
  l.codigo as lote_codigo,
  l.en_camino,
  p.modelo_id,
  m.sku,
  m.nombre,
  m.variante,
  m.categoria,
  coalesce(m.familia_id, m.id) as familia,
  m.foto_path,
  m.foto_thumb_path,
  m.activo,
  coalesce(m.lote_id = p.lote_id, false) as es_nueva,
  p.ubicacion_id,
  u.nombre as ubicacion,
  p.cantidad,
  p.recibida,
  coalesce((select e.cantidad from existencias e
             where e.modelo_id = p.modelo_id and e.ubicacion_id = p.ubicacion_id), 0) as hay
from por_llegar p
join lotes l       on l.id = p.lote_id
join modelos m     on m.id = p.modelo_id
join ubicaciones u on u.id = p.ubicacion_id
where es_admin();

revoke all on v_por_llegar from anon;
grant select on v_por_llegar to authenticated;


-- ---------------------------------------------------------------------
-- 12. LOS LOTES, CON SU ESTADO
-- Se suelta y se crea: la de esquema-flete-y-gastos.sql era `l.*`, que
-- se congela al crearla y no veía las columnas nuevas. Nada cuelga de
-- ella. Las mismas columnas en el mismo orden, y las nuevas al final.
-- ---------------------------------------------------------------------

drop view if exists v_lotes_admin;

create view v_lotes_admin
with (security_invoker = off) as
select
  l.id, l.codigo, l.fecha_llegada, l.tasa_binance_compra,
  l.costo_mercancia_usd, l.costo_exhibidores_usd, l.costo_flete_usd,
  l.notas, l.creado_en, l.piezas_mercancia, l.unidades_exhibidores,
  l.flete_mercancia_usd,
  (l.costo_flete_usd - l.flete_mercancia_usd) as flete_exhibidores_usd,
  (l.costo_exhibidores_usd + (l.costo_flete_usd - l.flete_mercancia_usd)) as capex_total_usd,
  case when (l.piezas_mercancia + l.unidades_exhibidores) > 0
       then round(l.costo_flete_usd / (l.piezas_mercancia + l.unidades_exhibidores), 4)
       else null end                          as flete_por_unidad_usd,
  (select count(*) from modelos m where m.lote_id = l.id) as modelos_cargados,
  -- Nuevas.
  l.en_camino,
  l.liberado_en,
  (select pf.nombre from perfiles pf where pf.id = l.liberado_por) as liberado_por,
  coalesce((select sum(p.cantidad) from por_llegar p join modelos m on m.id = p.modelo_id
             where p.lote_id = l.id and m.activo), 0)::int as piezas_esperadas,
  (select sum(p.recibida) from por_llegar p where p.lote_id = l.id)::int as piezas_recibidas
from lotes l
where es_admin();

grant select on v_lotes_admin to authenticated;


-- ---------------------------------------------------------------------
-- 13. LAS ESTADÍSTICAS QUE CONTABAN MODELOS SIN MIRAR LA EXISTENCIA
-- Las mismas definiciones de siempre (esquema-parche-valor.sql,
-- esquema-cuentas-claras.sql y esquema-quitar-por-verificar.sql) con lo
-- que está en camino fuera. Las que suman existencia ya no lo veían.
-- ---------------------------------------------------------------------

create or replace view v_valor_inventario
with (security_invoker = off) as
with f as (
  select
    coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1::numeric) as factor,
    coalesce(factor_merma(), 1::numeric) as merma
),
piezas as (
  select
    m.id,
    m.categoria,
    coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0::bigint) as cantidad,
    m.costo_puesto_usd,
    coalesce(m.precio_override_usd, g.precio_usd) as precio_usd
  from modelos m
  left join grupos_precio g on g.id = m.grupo_precio_id
  where m.activo
    -- Lo que está en camino todavía no es inventario.
    and not exists (select 1 from lotes lc where lc.id = m.lote_id and lc.en_camino)
)
select
  count(*) filter (where p.cantidad > 0)                    as modelos_con_existencia,
  count(*)                                                  as modelos_activos,
  coalesce(sum(p.cantidad), 0::numeric)                     as piezas,
  round(coalesce(sum(p.cantidad::numeric * p.costo_puesto_usd * f.factor * f.merma), 0::numeric), 2) as costo_bcv,
  round(coalesce(sum(p.cantidad::numeric * p.costo_puesto_usd), 0::numeric), 2) as costo_real_usd,
  round(coalesce(sum(p.cantidad::numeric * p.precio_usd), 0::numeric), 2)      as precio_bcv,
  round(coalesce(sum(p.cantidad::numeric * (p.precio_usd - p.costo_puesto_usd * f.factor * f.merma)), 0::numeric), 2) as margen_bruto_bcv,
  case when coalesce(sum(p.cantidad::numeric * p.precio_usd), 0::numeric) > 0::numeric
       then round(coalesce(sum(p.cantidad::numeric * (p.precio_usd - p.costo_puesto_usd * f.factor * f.merma)), 0::numeric)
                  / sum(p.cantidad::numeric * p.precio_usd) * 100::numeric, 1)
       else null::numeric end                               as margen_bruto_pct,
  coalesce(sum(p.cantidad) filter (where p.precio_usd is null), 0::numeric) as piezas_sin_precio
from piezas p
cross join f
where es_admin()
having es_admin();

create or replace view v_diagnostico
with (security_invoker = off) as
with plan as (
  select * from plan_ventas_admin()
),
base as (
  select
    coalesce(gastos_fijos_admin(), 0::numeric)        as gastos_mes,
    volumen_mensual_estimado()                        as volumen,
    coalesce(costo_operativo_admin(), 0::numeric)     as operativo,
    coalesce(factor_merma(), 1::numeric)              as merma,
    coalesce((select tasa_venta / tasa_bcv from tasas where vigente limit 1), 1::numeric) as factor,
    coalesce((select valor from configuracion where clave = 'ganancia_mensual_objetivo_usd'), 0::numeric) as objetivo,
    coalesce((select valor from configuracion where clave = 'piezas_danadas_mes'), 0::numeric)          as danadas,
    coalesce((select valor from configuracion where clave = 'piezas_inventario_objetivo'), 0::numeric)  as piezas_objetivo,
    greatest(coalesce((select valor from configuracion where clave = 'meses_rotacion_objetivo'), 3::numeric), 1::numeric) as meses_rot,
    coalesce((select sum(cantidad) from existencias), 0::bigint) as piezas_cargadas,
    (select origen from v_volumen)                    as volumen_origen
),
catalogo as (
  select
    -- Los modelos que se venden: lo que está en camino todavía no.
    (select count(*) from modelos mo
      where mo.activo
        and not exists (select 1 from lotes lc where lc.id = mo.lote_id and lc.en_camino)) as modelos,
    coalesce((select costo_promedio_binance from plan), 0::numeric) as costo_merc_real,
    coalesce((select precio_promedio_bcv from plan), 0::numeric)    as precio_bcv_prom
),
calc as (
  select
    b.gastos_mes, b.volumen, b.operativo, b.merma, b.factor, b.objetivo, b.danadas,
    b.piezas_objetivo, b.meses_rot, b.piezas_cargadas, b.volumen_origen,
    c.modelos, c.costo_merc_real, c.precio_bcv_prom,
    round(c.costo_merc_real * b.factor * b.merma, 4)              as costo_merc_bcv,
    round(c.costo_merc_real * b.factor * b.merma + b.operativo, 4) as costo_total_bcv
  from base b cross join catalogo c
)
select
  gastos_mes                                        as gastos_mes_usd,
  piezas_cargadas,
  piezas_objetivo,
  meses_rot                                         as meses_rotacion,
  volumen                                           as volumen_mes,
  volumen_origen,
  operativo                                         as costo_operativo_pieza_usd,
  danadas                                           as piezas_danadas_mes,
  round((merma - 1::numeric) * 100::numeric, 2)     as merma_pct,
  modelos,
  round(costo_merc_real, 4)                         as costo_mercancia_real_usd,
  costo_merc_bcv                                    as costo_mercancia_promedio_usd,
  costo_total_bcv                                   as costo_total_promedio_usd,
  round(precio_bcv_prom, 2)                         as precio_bcv_promedio,
  objetivo                                          as ganancia_objetivo_mes_usd,
  case when volumen > 0::numeric and costo_total_bcv > 0::numeric and objetivo > 0::numeric
       then round(objetivo / (volumen * costo_total_bcv + objetivo) * 100::numeric, 1)
       else null::numeric end                       as margen_sugerido_pct,
  case when volumen > 0::numeric and costo_total_bcv > 0::numeric and objetivo > 0::numeric
       then round(costo_total_bcv / (1::numeric - objetivo / (volumen * costo_total_bcv + objetivo)), 2)
       else null::numeric end                       as precio_sugerido_promedio_bcv,
  case when precio_bcv_prom > 0::numeric
       then round((precio_bcv_prom - costo_total_bcv) / precio_bcv_prom * 100::numeric, 1)
       else null::numeric end                       as margen_actual_pct,
  round(volumen * (precio_bcv_prom - costo_total_bcv), 2) as ganancia_proyectada_mes_usd,
  (select piezas_equilibrio_mes from plan)          as piezas_equilibrio
from calc
where es_admin();

-- La rotación: sin lo que está en camino, y los días en inventario desde
-- que su lote se liberó (no desde que se cargó la ficha, semanas antes de
-- que la pieza estuviera en la tienda).
create or replace view v_rotacion_modelo
with (security_invoker = off) as
select
  mo.id,
  mo.sku,
  mo.nombre,
  mo.categoria,
  coalesce(g.nombre, 'Sin grupo') as grupo,
  coalesce(x.piezas, 0)           as piezas_vendidas,
  x.ultima_venta,
  case when x.ultima_venta is not null then (current_date - x.ultima_venta::date) end as dias_sin_vender,
  (current_date - greatest(mo.creado_en, lr.liberado_en)::date) as dias_en_inventario,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = mo.id), 0) as existencia,
  mo.costo_puesto_usd,
  coalesce(x.ganancia_usd, 0) as ganancia_usd
from modelos mo
left join grupos_precio g on g.id = mo.grupo_precio_id
left join lotes lr on lr.id = mo.lote_id
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
where mo.activo and not coalesce(lr.en_camino, false) and es_admin();


-- ---------------------------------------------------------------------
-- 14. EL RESPALDO TAMBIÉN SACA LO QUE VIENE
-- La de esquema-abonos-y-apartados.sql con `por_llegar` en la lista.
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
                     'por_llegar') then
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

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Nada cambió para lo que ya existe (ningún lote está en camino):
--
--      select count(*) from lotes where en_camino;            -> 0
--      select count(*) from v_catalogo_venta;                 -> lo mismo que antes
--      select count(*) from v_proximamente;                   -> 0
--
-- 2. En la pantalla Lotes: registra uno de prueba con "Todavía no ha
--    llegado". En "Lo que viene", carga un producto nuevo con 3 piezas en
--    Bodega y suma 2 de un producto que ya vendes.
--      - Inventario: el nuevo sale con "Próximamente · llegan 3", sin
--        existencia; el viejo dice "+2 en camino".
--      - Mostrador, catálogo de la vendedora y vitrina: el nuevo NO sale.
--      - Catálogo en línea: sale abajo, en "Próximamente", sin botón.
--    "Revisar y liberar" con 3 y 1 (falta una): Inventario dice 3 del nuevo,
--    y el viejo sube 1. Ya se vende en el mostrador y en el catálogo.
--
-- 3. `npm run verificar` (la sección "LO QUE VIENE EN CAMINO").
-- =====================================================================
