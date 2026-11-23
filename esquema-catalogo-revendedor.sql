-- =====================================================================
-- #73 · esquema-catalogo-revendedor.sql
-- El catálogo del revendedor, rediseñado (fase 6, pedido del dueño del
-- 18/11/2026; decidido el 23/11/2026).
-- Depende del #72 (esquema-inventario-revendedor.sql). Se puede correr
-- varias veces.
--
-- POR QUÉ
-- "Que los catálogos de los revendedores se vean mucho mejor y distintos
-- al de Lux, para que sus clientas no sospechen", "su logo grande", y que
-- "ellos lo personalicen". Hasta aquí su catálogo era el de la tienda con
-- una de seis paletas.
--
-- DECISIONES DEL DUEÑO (23/11/2026)
-- - Lo personalizan él (desde su panel) y el dueño (desde Revendedores),
--   el logo incluido.
-- - Tres plantillas: editorial, tienda y lookbook.
-- - La portada: él elige una pieza de SU catálogo y escribe una frase.
--
-- QUÉ HACE
-- 1. `revendedores.tema jsonb`: plantilla, color principal y de fondo,
--    letra de los títulos, esquinas, pieza de portada y frase. Null: como
--    antes, sale de su `paleta` (que no cambia, ni `rv_ajustes`: el
--    navegador viejo sigue guardando nombre, paleta y teléfono).
-- 2. `rv_tema_valido` es la ÚNICA regla de qué tema se puede guardar, en
--    un `check`: solo siete claves, cada una de su lista o de su forma
--    (colores #rrggbb, frase de 1 a 90 letras sin caracteres de control).
--    Un texto del revendedor nunca llega a CSS sin pasar por aquí, y el
--    navegador lo vuelve a normalizar antes de usarlo.
-- 3. `rv_guardar_tema` (él, con su testigo) y `admin_tema_revendedor` (el
--    dueño). La portada tiene que ser una pieza de su catálogo
--    (`rv_catalogo_publico`, que ya suma su inventario propio).
-- 4. `rv_perfil_publico` gana `tema` al final. El pedido de su clienta y
--    su panel lo leen de ahí: `rv_ver_apartado` y `rv_resumen` no cambian.
-- 5. El logo lo sube él por la función de servidor `logo-revendedor`, que
--    usa la llave maestra. Esa función llama a dos que SOLO puede
--    ejecutar `service_role`: `rv_usuario_para_logo` (su testigo → su
--    usuario) y `rv_poner_logo` (guarda la ruta, que tiene que ser
--    `revendedores/<su usuario>/<número>.webp|png|jpg`).
--
-- DEBERÍA DAR
--   select count(*) from revendedores where tema is not null;   → 0
--   select rv_perfil_publico(usuario) ? 'tema' from revendedores limit 1;
--                                                                → true
--   select rv_tema_valido('{"principal":"red"}');               → false
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA REGLA DEL TEMA
-- ---------------------------------------------------------------------

create or replace function rv_tema_valido(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $fn$
declare
  k text;
  v jsonb;
begin
  if p is null or p = 'null'::jsonb then
    return true;
  end if;
  if jsonb_typeof(p) <> 'object' then
    return false;
  end if;

  for k, v in select * from jsonb_each(p) loop
    if k not in ('plantilla', 'principal', 'fondo', 'letra', 'esquinas', 'portada', 'frase') then
      return false;
    end if;
    -- Una clave de la lista puede venir en null: es "la de por defecto".
    continue when v = 'null'::jsonb;
    case k
      when 'plantilla' then
        if jsonb_typeof(v) <> 'string' or v #>> '{}' not in ('editorial', 'tienda', 'lookbook') then return false; end if;
      when 'principal', 'fondo' then
        if jsonb_typeof(v) <> 'string' or v #>> '{}' !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
      when 'letra' then
        if jsonb_typeof(v) <> 'string' or v #>> '{}' not in ('elegante', 'moderna', 'clasica', 'revista', 'amable') then return false; end if;
      when 'esquinas' then
        if jsonb_typeof(v) <> 'string' or v #>> '{}' not in ('rectas', 'suaves', 'redondas') then return false; end if;
      when 'portada' then
        -- Escrito como entero: "1.0" o "1e3" no (después se lee como bigint).
        if jsonb_typeof(v) <> 'number' or v #>> '{}' !~ '^[1-9][0-9]{0,17}$' then return false; end if;
      when 'frase' then
        if jsonb_typeof(v) <> 'string'
           or char_length(v #>> '{}') not between 1 and 90
           or (v #>> '{}') ~ '[[:cntrl:]]'
           -- Los invisibles que [[:cntrl:]] no cubre: ancho cero, cambios
           -- de dirección del texto, separadores de línea, la marca BOM.
           or (v #>> '{}') ~ '[\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]' then return false; end if;
      else
        return false;
    end case;
  end loop;
  return true;
end;
$fn$;

-- Cerrada: `revendedores` solo se escribe por funciones de definidor,
-- así que el `check` corre con los permisos de su dueño. Nadie de afuera
-- la necesita (revisión de seguridad del 23/11/2026).
revoke all on function rv_tema_valido(jsonb) from public, anon, authenticated;

alter table revendedores add column if not exists tema jsonb;
alter table revendedores drop constraint if exists revendedores_tema_valido;
alter table revendedores add constraint revendedores_tema_valido check (rv_tema_valido(tema));


-- ---------------------------------------------------------------------
-- 2. GUARDARLO: ÉL Y EL DUEÑO
-- Una sola receta (`rv_tema_limpio`, revocada): la frase recortada, una
-- frase en blanco no se guarda, y la portada tiene que ser de su catálogo.
-- ---------------------------------------------------------------------

create or replace function rv_tema_limpio(p_usuario text, p_tema jsonb, p_quien text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  t jsonb := p_tema;
  v_frase text;
begin
  if t is null or t = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(t) <> 'object' then
    raise exception 'El tema tiene un valor que no sirve. Recarga la página.';
  end if;

  if jsonb_typeof(t -> 'frase') = 'string' then
    v_frase := btrim(t ->> 'frase', E' \t\u00A0');
    t := case when v_frase = '' then t - 'frase' else jsonb_set(t, '{frase}', to_jsonb(v_frase)) end;
  end if;

  if not rv_tema_valido(t) then
    raise exception 'El tema tiene un valor que no sirve. Recarga la página.';
  end if;

  if jsonb_typeof(t -> 'portada') = 'number'
     and not exists (select 1 from rv_catalogo_publico(p_usuario) c where c.id = (t ->> 'portada')::bigint) then
    raise exception 'Esa pieza no está en % catálogo. Elige otra para la portada.', p_quien;
  end if;

  return t;
end;
$fn$;

revoke all on function rv_tema_limpio(text, jsonb, text) from public, anon, authenticated;

create or replace function rv_guardar_tema(p_sesion text, p_tema jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id      bigint := rv_de_sesion(p_sesion);
  v_usuario text;
begin
  select usuario into v_usuario from revendedores where id = v_id;
  update revendedores set tema = rv_tema_limpio(v_usuario, p_tema, 'tu') where id = v_id;
end;
$fn$;

revoke all on function rv_guardar_tema(text, jsonb) from public;
grant execute on function rv_guardar_tema(text, jsonb) to anon, authenticated;

create or replace function admin_tema_revendedor(p_revendedor bigint, p_tema jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_usuario text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cambiar el catálogo de un revendedor.';
  end if;
  select usuario into v_usuario from revendedores where id = p_revendedor;
  if v_usuario is null then
    raise exception 'Ese revendedor no existe.';
  end if;
  update revendedores set tema = rv_tema_limpio(v_usuario, p_tema, 'su') where id = p_revendedor;
end;
$fn$;

revoke all on function admin_tema_revendedor(bigint, jsonb) from public, anon;
grant execute on function admin_tema_revendedor(bigint, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 3. SU PERFIL, CON EL TEMA AL FINAL
-- La de esquema-revendedores-plazos.sql, más `tema`. Lo leen su catálogo,
-- el pedido de su clienta, su panel y la tarjeta de vista previa del
-- Worker. Nada de costo: el tema son colores, una letra, una pieza que ya
-- es pública y una frase.
-- ---------------------------------------------------------------------

create or replace function rv_perfil_publico(p_usuario text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'usuario',             r.usuario,
    'nombre',              r.nombre,
    'catalogo_nombre',     coalesce(r.catalogo_nombre, r.nombre),
    'telefono',            r.telefono,
    'paleta',              r.paleta,
    'logo_path',           r.logo_path,
    'dias_apartado',       0,
    'pago_movil_cedula',   r.pago_movil_cedula,
    'pago_movil_telefono', r.pago_movil_telefono,
    'pago_movil_banco',    r.pago_movil_banco,
    'dias_credito',        r.dias_credito,
    'horas_pago',          (select valor from configuracion where clave = 'revendedor_horas_pago'),
    'inicial_pct',         (select valor from configuracion where clave = 'apartado_inicial_pct'),
    'tema',                r.tema)
    from revendedores r
   where r.usuario = lower(btrim(coalesce(p_usuario, ''))) and r.activo;
$fn$;

revoke all on function rv_perfil_publico(text) from public;
grant execute on function rv_perfil_publico(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. EL LOGO, DESDE SU PANEL
-- Sin sesión de Supabase él no puede escribir en el almacén de fotos. Lo
-- sube la función de servidor `logo-revendedor` con la llave maestra,
-- y estas dos SOLO las ejecuta `service_role`: nadie desde el navegador.
-- ---------------------------------------------------------------------

create or replace function rv_usuario_para_logo(p_sesion text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
begin
  return (select usuario from revendedores where id = v_id);
end;
$fn$;

create or replace function rv_poner_logo(p_sesion text, p_ruta text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id      bigint := rv_de_sesion(p_sesion);
  v_usuario text;
begin
  select usuario into v_usuario from revendedores where id = v_id;
  -- El usuario solo tiene minúsculas, números y guiones: no rompe la
  -- expresión. La ruta la arma el servidor; esto es la red por si no.
  if p_ruta is null or v_usuario is null or p_ruta !~ ('^revendedores/' || v_usuario || '/[0-9]{10,16}\.(webp|png|jpe?g)$') then
    raise exception 'Esa ruta no sirve para el logo.';
  end if;
  update revendedores set logo_path = p_ruta where id = v_id;
end;
$fn$;

revoke all on function rv_usuario_para_logo(text) from public, anon, authenticated;
revoke all on function rv_poner_logo(text, text) from public, anon, authenticated;
grant execute on function rv_usuario_para_logo(text) to service_role;
grant execute on function rv_poner_logo(text, text) to service_role;
