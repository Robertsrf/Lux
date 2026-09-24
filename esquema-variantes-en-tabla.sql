-- =====================================================================
-- Lux by Emory — las variantes se cargan en una tabla, en el mismo guardar
-- Ejecutar en el SQL Editor DESPUÉS de esquema-cedula-en-catalogo.sql
--
-- QUÉ CAMBIA
-- Cargar una variante era un protocolo: guardar el producto, "agregar otra
-- variante", un formulario entero copiado, cambiar la medida, guardar, y
-- otra vez por cada medida. El dueño lo pidió así, y tiene razón:
--
--   una fila por variante: su nombre, su cantidad y su costo si es
--   distinto. El precio sale solo, con la misma fórmula de siempre.
--
-- Ahora el formulario manda la lista entera de variantes junto con el
-- producto, y la base guarda todo en la MISMA transacción: si una variante
-- falla, no queda el producto a medias.
--
-- LO QUE HACE CADA FILA
--   - Costo vacío (o igual al del producto): la variante cuesta lo mismo y
--     vale lo mismo, en el mismo grupo o con el mismo precio propio.
--   - Costo distinto: se le busca el grupo con `admin_sugerir_precio`, la
--     misma cuenta que usa el formulario para el producto. Si el costo no
--     cambió desde la última vez, su grupo o su precio propio se respetan:
--     no se repricia lo que nadie tocó.
--   - Cantidades: por ubicación, igual que el producto.
--   - "Quitar": la saca del catálogo (activo = false). Sus ventas quedan.
--
-- Nombre, categoría, descripción, nota, lote y flete son del PRODUCTO:
-- se copian a todas sus variantes al guardar. La foto también, salvo la de
-- una variante que tenga foto propia distinta de la que tenía el producto.
--
-- FIRMA
-- `admin_guardar_modelo` gana `p_variantes`, AL FINAL y con valor por
-- defecto: el formulario viejo manda quince y sigue encajando, y sin
-- `p_variantes` no toca ninguna variante. `p_variante_de` se queda y se
-- ignora: ya no lo manda nadie, pero quitarlo cambiaría la firma.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. GUARDAR LAS VARIANTES DE UN PRODUCTO
-- Por dentro, revocada a todos: la llama `admin_guardar_modelo`, que es la
-- que tiene el guardián de administrador.
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
  v_ex       jsonb;
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

    for v_ex in select * from jsonb_array_elements(coalesce(v_fila->'existencias', '[]'::jsonb))
    loop
      insert into existencias (modelo_id, ubicacion_id, cantidad)
      values (v_id, (v_ex->>'ubicacion_id')::bigint, greatest(coalesce((v_ex->>'cantidad')::int, 0), 0))
      on conflict (modelo_id, ubicacion_id)
      do update set cantidad = excluded.cantidad, actualizado_en = now();
    end loop;
  end loop;
end;
$fn$;

revoke all on function guardar_variantes_de(bigint, jsonb, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. GUARDAR EL PRODUCTO CON SUS VARIANTES, TODO JUNTO
-- La de esquema-variantes-y-mostrador.sql con dos cosas nuevas: recuerda
-- la foto que tenía antes de cambiarla, y al final guarda las variantes.
-- ---------------------------------------------------------------------

drop function if exists admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, text, text, numeric, text, text, text, jsonb, text, bigint);

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
  p_variante_de         bigint default null,   -- se ignora desde la tabla de variantes; ver la cabecera
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
  v_fila       jsonb;
  v_familia    bigint;
  v_mia        bigint;
  v_foto_vieja text;
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
    select foto_path into v_foto_vieja from modelos where id = v_id;

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

  for v_fila in select * from jsonb_array_elements(coalesce(p_existencias, '[]'::jsonb))
  loop
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_id, (v_fila->>'ubicacion_id')::bigint, greatest((v_fila->>'cantidad')::int, 0))
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = excluded.cantidad, actualizado_en = now();
  end loop;

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

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Que quede UNA sola:
--
--      select count(*) from pg_proc where proname = 'admin_guardar_modelo';
--        -> 1.
--
-- 2. Desde el formulario: abre una cadena, ponle "45 cm", agrega una fila
--    "60 cm" con cantidad 3 y costo vacío, y otra "70 cm" con un costo más
--    alto. Guarda. En Inventario:
--      - "60 cm" sale con el MISMO precio que la de 45 (costo vacío);
--      - "70 cm" sale en el grupo que corresponde a su costo, el mismo que
--        el formulario enseñaba en "Sale en" antes de guardar;
--      - las tres comparten nombre, foto y lote.
--    En el Mostrador, una sola tarjeta con las tres medidas.
-- =====================================================================
