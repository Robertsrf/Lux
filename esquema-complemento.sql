-- =====================================================================
-- Lux by Emory — complemento del esquema (Fase 1)
-- Ejecutar en el SQL Editor de Supabase DESPUES de esquema.sql
--
-- Por que existe este archivo:
--   esquema.sql seccion 14 hace REVOKE ALL sobre modelos y lotes para
--   authenticated. Eso protege los costos de la vendedora, pero tambien
--   deja al admin sin poder escribir desde el navegador. El propio
--   esquema lo anticipa: "el admin escribe modelos y lotes via funciones
--   SECURITY DEFINER". Aqui estan esas funciones.
--
-- Toda funcion admin_* verifica es_admin() por dentro. La seguridad real
-- vive aqui, no en React.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. STORAGE: bucket de fotos (lectura publica, escritura solo admin)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "fotos lectura publica" on storage.objects;
drop policy if exists "fotos escribe admin"   on storage.objects;
drop policy if exists "fotos actualiza admin" on storage.objects;
drop policy if exists "fotos borra admin"     on storage.objects;

create policy "fotos lectura publica" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'fotos');

create policy "fotos escribe admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and es_admin());

create policy "fotos actualiza admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and es_admin())
  with check (bucket_id = 'fotos' and es_admin());

create policy "fotos borra admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and es_admin());

-- ---------------------------------------------------------------------
-- B. v_catalogo_venta: no dependas de que exista una tasa vigente
--
-- El original usa CROSS JOIN LATERAL contra la tasa vigente: si todavia
-- no hay tasa registrada, la vista devuelve CERO filas y el catalogo se
-- ve vacio sin explicacion. Con LEFT JOIN LATERAL el catalogo se ve
-- igual y solo el precio en Bs queda en null hasta fijar la tasa.
-- Mismas columnas y mismo orden que el original.
-- ---------------------------------------------------------------------

create or replace view v_catalogo_venta
with (security_invoker = off) as
select
  m.id,
  m.sku,
  m.nombre,
  m.categoria,
  m.descripcion,
  m.variantes_nota,
  m.foto_path,
  m.foto_thumb_path,
  g.nombre as grupo,
  coalesce(m.precio_override_usd, g.precio_usd) as precio_usd,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_venta, 2) as precio_bs,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_venta / t.tasa_bcv, 2) as precio_usd_bcv_ref,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0) as existencia_total,
  m.activo
from modelos m
left join grupos_precio g on g.id = m.grupo_precio_id
left join lateral (select * from tasas where vigente limit 1) t on true
where m.activo;

-- v_catalogo_admin: agrega las columnas que el formulario de edicion
-- necesita (grupo, override, lote). Se anaden al final para no romper
-- el orden de columnas del original.
create or replace view v_catalogo_admin
with (security_invoker = off) as
select
  v.*,
  m.costo_unitario_usd,
  m.flete_unitario_usd,
  m.costo_puesto_usd,
  m.peso_unitario_g,
  m.lote_id,
  (v.precio_usd - m.costo_puesto_usd) as margen_usd,
  case when v.precio_usd > 0
       then round(((v.precio_usd - m.costo_puesto_usd) / v.precio_usd) * 100, 2)
       else 0 end as margen_pct,
  m.grupo_precio_id,
  m.precio_override_usd,
  l.codigo as lote_codigo
from v_catalogo_venta v
join modelos m on m.id = v.id
left join lotes l on l.id = m.lote_id
where es_admin();

-- Lotes para el admin: la tabla esta revocada, se lee por esta vista.
create or replace view v_lotes_admin
with (security_invoker = off) as
select
  l.*,
  (l.costo_flete_usd - l.flete_mercancia_usd) as flete_exhibidores_usd,
  (l.costo_exhibidores_usd + (l.costo_flete_usd - l.flete_mercancia_usd)) as capex_total_usd,
  case when l.metodo = 'peso' and l.peso_mercancia_g > 0
       then l.flete_mercancia_usd / l.peso_mercancia_g
       else null end as flete_por_gramo_usd,
  (select count(*) from modelos m where m.lote_id = l.id) as modelos_cargados
from lotes l
where es_admin();

grant select on v_catalogo_venta   to authenticated;
grant select on v_catalogo_admin   to authenticated;
grant select on v_lotes_admin      to authenticated;
grant select on v_disponible_publico to anon, authenticated;

-- ---------------------------------------------------------------------
-- C. CALCULO DE FLETE UNITARIO (PLAN 4)
--
--   flete_a_mercancia  -> columna generada lotes.flete_mercancia_usd
--   flete_por_gramo    = flete_a_mercancia / peso_mercancia_g
--   flete_unitario(i)  = peso_unitario_g(i) * flete_por_gramo
--   costo_puesto(i)    = costo_unitario_usd(i) + flete_unitario(i)  (generada)
--
-- Los exhibidores NO reciben carga: su flete queda en v_capex_lote.
-- Es la unica fuente de verdad del prorrateo. El frontend no lo repite.
-- ---------------------------------------------------------------------

create or replace function calcular_flete_unitario(
  p_lote_id   bigint,
  p_peso_g    numeric,
  p_costo_usd numeric
) returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l lotes%rowtype;
begin
  -- Funcion interna: NO se otorga EXECUTE a authenticated (ver seccion F).
  -- El admin llega por admin_previsualizar_flete(), que si verifica es_admin().

  if p_lote_id is null then
    return 0;
  end if;

  select * into l from lotes where id = p_lote_id;
  if not found then
    return 0;
  end if;

  if l.metodo = 'peso' then
    if l.peso_mercancia_g > 0 and coalesce(p_peso_g, 0) > 0 then
      return round(coalesce(p_peso_g, 0) * l.flete_mercancia_usd / l.peso_mercancia_g, 4);
    end if;
    return 0;
  else
    if l.costo_mercancia_usd > 0 then
      return round(l.flete_mercancia_usd * coalesce(p_costo_usd, 0) / l.costo_mercancia_usd, 4);
    end if;
    return 0;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- D. SKU: {CATEGORIA}-{GRUPO}-{correlativo}  ->  CAD-G13-007
-- ---------------------------------------------------------------------

create or replace function generar_sku(p_categoria text, p_grupo_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pre  text;
  v_grp  text;
  v_n    int := 0;
  v_cand text;
begin
  v_pre := upper(substr(translate(coalesce(nullif(trim(p_categoria), ''), 'GEN'),
                                  'aeiounAEIOUNáéíóúüñÁÉÍÓÚÜÑ',
                                  'aeiounAEIOUNaeiouunAEIOUUN'), 1, 3));
  select nombre into v_grp from grupos_precio where id = p_grupo_id;
  v_grp := coalesce(nullif(trim(v_grp), ''), 'SG');

  loop
    v_n := v_n + 1;
    v_cand := v_pre || '-' || v_grp || '-' || lpad(v_n::text, 3, '0');
    exit when not exists (select 1 from modelos where sku = v_cand);
    if v_n > 9999 then
      raise exception 'No se pudo generar un SKU libre para % / %.', v_pre, v_grp;
    end if;
  end loop;

  return v_cand;
end;
$$;

-- ---------------------------------------------------------------------
-- E. ESCRITURA DEL ADMIN (SECURITY DEFINER, siempre con es_admin())
-- ---------------------------------------------------------------------

-- Tasa vigente: hay un indice unico parcial que permite una sola vigente.
-- Bajar la anterior y subir la nueva tiene que pasar en una transaccion.
create or replace function admin_fijar_tasa(
  p_tasa_venta numeric,
  p_tasa_bcv   numeric
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede fijar la tasa.';
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
$$;

create or replace function admin_guardar_lote(
  p_id                    bigint,
  p_codigo                text,
  p_fecha_llegada         date,
  p_tasa_binance_compra   numeric,
  p_costo_mercancia_usd   numeric,
  p_costo_exhibidores_usd numeric,
  p_costo_flete_usd       numeric,
  p_peso_mercancia_g      numeric,
  p_peso_exhibidores_g    numeric,
  p_metodo                text,
  p_notas                 text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     bigint;
  v_codigo text;
  v_tasa   numeric;
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
      peso_mercancia_g, peso_exhibidores_g, metodo, notas
    ) values (
      v_codigo, p_fecha_llegada, p_tasa_binance_compra,
      coalesce(p_costo_mercancia_usd, 0), coalesce(p_costo_exhibidores_usd, 0),
      coalesce(p_costo_flete_usd, 0),
      coalesce(p_peso_mercancia_g, 0), coalesce(p_peso_exhibidores_g, 0),
      p_metodo::metodo_prorrateo, p_notas
    ) returning id into v_id;
    return v_id;
  end if;

  -- La tasa Binance de un lote es un hecho historico: no se toca jamas.
  select tasa_binance_compra into v_tasa from lotes where id = p_id;
  if not found then
    raise exception 'El lote % no existe.', p_id;
  end if;
  if p_tasa_binance_compra is not null and p_tasa_binance_compra <> v_tasa then
    raise exception 'La tasa Binance del lote % ya esta sellada en %. No se puede cambiar.', p_id, v_tasa;
  end if;

  update lotes set
    codigo                = v_codigo,
    fecha_llegada         = p_fecha_llegada,
    costo_mercancia_usd   = coalesce(p_costo_mercancia_usd, 0),
    costo_exhibidores_usd = coalesce(p_costo_exhibidores_usd, 0),
    costo_flete_usd       = coalesce(p_costo_flete_usd, 0),
    peso_mercancia_g      = coalesce(p_peso_mercancia_g, 0),
    peso_exhibidores_g    = coalesce(p_peso_exhibidores_g, 0),
    metodo                = p_metodo::metodo_prorrateo,
    notas                 = p_notas
  where id = p_id;

  return p_id;
end;
$$;

-- Previsualizacion del costo puesto para el formulario de carga.
-- El frontend NUNCA calcula el flete por su cuenta: pregunta aqui.
create or replace function admin_previsualizar_flete(
  p_lote_id   bigint,
  p_peso_g    numeric,
  p_costo_usd numeric
) returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede consultar costos.';
  end if;
  return calcular_flete_unitario(p_lote_id, p_peso_g, p_costo_usd);
end;
$$;

-- Si cambian los datos de prorrateo del lote, el flete de sus modelos
-- queda viejo. El trigger lo recalcula con la misma funcion, para que la
-- formula viva en un solo lugar.
create or replace function recalcular_flete_de_lote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update modelos m
     set flete_unitario_usd = calcular_flete_unitario(new.id, m.peso_unitario_g, m.costo_unitario_usd),
         actualizado_en     = now()
   where m.lote_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_recalcular_flete_de_lote on lotes;
create trigger trg_recalcular_flete_de_lote
  after update on lotes
  for each row
  when (
    old.costo_flete_usd       is distinct from new.costo_flete_usd or
    old.costo_mercancia_usd   is distinct from new.costo_mercancia_usd or
    old.costo_exhibidores_usd is distinct from new.costo_exhibidores_usd or
    old.peso_mercancia_g      is distinct from new.peso_mercancia_g or
    old.peso_exhibidores_g    is distinct from new.peso_exhibidores_g or
    old.metodo                is distinct from new.metodo
  )
  execute function recalcular_flete_de_lote();

-- Alta y edicion de modelos. p_existencias es un arreglo JSON:
--   [{"ubicacion_id": 1, "cantidad": 12}, {"ubicacion_id": 5, "cantidad": 3}]
create or replace function admin_guardar_modelo(
  p_id                  bigint,
  p_nombre              text,
  p_categoria           text,
  p_grupo_precio_id     bigint,
  p_lote_id             bigint default null,
  p_costo_unitario_usd  numeric default 0,
  p_peso_unitario_g     numeric default 0,
  p_descripcion         text default null,
  p_variantes_nota      text default null,
  p_precio_override_usd numeric default null,
  p_foto_path           text default null,
  p_foto_thumb_path     text default null,
  p_sku                 text default null,
  p_existencias         jsonb default '[]'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    bigint;
  v_sku   text;
  v_flete numeric;
  v_fila  jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar modelos.';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'El modelo necesita un nombre.';
  end if;

  v_flete := calcular_flete_unitario(p_lote_id, p_peso_unitario_g, p_costo_unitario_usd);
  v_sku   := nullif(trim(coalesce(p_sku, '')), '');

  if p_id is null then
    v_sku := coalesce(v_sku, generar_sku(p_categoria, p_grupo_precio_id));
    insert into modelos (
      sku, nombre, categoria, descripcion, variantes_nota,
      lote_id, costo_unitario_usd, flete_unitario_usd, peso_unitario_g,
      grupo_precio_id, precio_override_usd, foto_path, foto_thumb_path
    ) values (
      v_sku, trim(p_nombre), lower(trim(p_categoria)), p_descripcion, p_variantes_nota,
      p_lote_id, coalesce(p_costo_unitario_usd, 0), v_flete, coalesce(p_peso_unitario_g, 0),
      p_grupo_precio_id, p_precio_override_usd, p_foto_path, p_foto_thumb_path
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
      peso_unitario_g     = coalesce(p_peso_unitario_g, 0),
      grupo_precio_id     = p_grupo_precio_id,
      precio_override_usd = p_precio_override_usd,
      -- si no llega foto nueva, se conserva la que ya tenia
      foto_path           = coalesce(p_foto_path, foto_path),
      foto_thumb_path     = coalesce(p_foto_thumb_path, foto_thumb_path),
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

  return v_id;
end;
$$;

-- Baja logica: el modelo sale del catalogo pero conserva su historia de ventas.
create or replace function admin_desactivar_modelo(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede retirar modelos.';
  end if;
  update modelos set activo = false, actualizado_en = now() where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- F. PERMISOS DE EJECUCION
-- Postgres otorga EXECUTE a PUBLIC por defecto: hay que revocarlo a mano.
-- ---------------------------------------------------------------------

revoke all on function calcular_flete_unitario(bigint, numeric, numeric) from public, anon, authenticated;
revoke all on function generar_sku(text, bigint)                          from public, anon, authenticated;
revoke all on function recalcular_flete_de_lote()                         from public, anon, authenticated;

revoke all on function admin_fijar_tasa(numeric, numeric)                                     from public, anon;
revoke all on function admin_previsualizar_flete(bigint, numeric, numeric)                    from public, anon;
revoke all on function admin_desactivar_modelo(bigint)                                        from public, anon;
revoke all on function admin_guardar_lote(bigint, text, date, numeric, numeric, numeric, numeric, numeric, numeric, text, text) from public, anon;
revoke all on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, numeric, text, text, numeric, text, text, text, jsonb) from public, anon;

grant execute on function admin_fijar_tasa(numeric, numeric)                  to authenticated;
grant execute on function admin_previsualizar_flete(bigint, numeric, numeric) to authenticated;
grant execute on function admin_desactivar_modelo(bigint)                     to authenticated;
grant execute on function admin_guardar_lote(bigint, text, date, numeric, numeric, numeric, numeric, numeric, numeric, text, text) to authenticated;
grant execute on function admin_guardar_modelo(bigint, text, text, bigint, bigint, numeric, numeric, text, text, numeric, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- G. VERIFICACION (Fase 1)
--
-- Con sesion de VENDEDORA:
--   select * from modelos;             -> debe FALLAR (permission denied)
--   select * from lotes;               -> debe FALLAR
--   select * from v_catalogo_venta;    -> funciona, sin columnas de costo
--   select * from v_catalogo_admin;    -> 0 filas
--   select * from v_lotes_admin;       -> 0 filas
--   select admin_fijar_tasa(1,1);      -> debe FALLAR
--
-- Caso de prueba del PLAN 4 (mercancia $1.000, exhibidores $200,
-- flete $150, pesos 2.000 g y 8.000 g, metodo peso):
--   select flete_mercancia_usd,        -- 30.0000
--          flete_exhibidores_usd,      -- 120.0000
--          capex_total_usd,            -- 320.0000
--          flete_por_gramo_usd         -- 0.015
--     from v_lotes_admin where codigo = 'PRUEBA';
--
--   Cadena de 12 g con costo unitario $2,50 en ese lote:
--     flete_unitario_usd = 0.1800  y  costo_puesto_usd = 2.6800
-- =====================================================================
