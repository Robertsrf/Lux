-- =====================================================================
-- #69  EL USUARIO DEL REVENDEDOR ES SU SUBDOMINIO
--
-- Depende de: esquema-dama-caballero-revendedor.sql (#68).
--
-- Por qué (fase 2, 19/11/2026)
--   Lux pasa a luxbyemory.com y cada revendedor a <usuario>.luxbyemory.com
--   (jadujoyas.luxbyemory.com). El personal entra por entrar.luxbyemory.com.
--   Entonces el usuario de un revendedor es un nombre de subdominio:
--     - no puede ser uno de la tienda (entrar, www, admin...): un revendedor
--       "entrar" se quedaría con la puerta del personal;
--     - no puede terminar en guion (la regla de antes lo dejaba, y
--       "pedro-.luxbyemory.com" no es una dirección válida);
--     - no empieza por "xn--" (así se escriben los nombres con acentos en
--       una dirección: sería otro nombre).
--
-- Qué hace
--   `usuario_rv_valido(text)`: la regla, una vez. La usan el `check` de
--   `revendedores.usuario` y `admin_guardar_revendedor`. El navegador la
--   repite en `lib/dominio.ts` (USUARIOS_RESERVADOS, usuarioValido) para
--   avisar antes de guardar; scripts/pruebas/reservados.test.mjs vigila que
--   las dos listas digan lo mismo. Si cambias una, cambia la otra.
--
--   Antes de poner el `check`, busca revendedores que ya lo rompan. Si hay,
--   PARA y los nombra: no renombra a nadie (su enlace ya lo tienen sus
--   clientas). Se cambia el usuario en Revendedores y se corre otra vez.
--
--   `admin_guardar_revendedor` es la de esquema-revendedores.sql con un solo
--   cambio: la regla del usuario y su mensaje. Misma firma.
--
-- Se puede correr las veces que haga falta.
--
-- Qué debería dar
--   - select usuario_rv_valido('entrar'), usuario_rv_valido('jadujoyas');
--     -> false, true
--   - select usuario, usuario_rv_valido(usuario) from revendedores;
--     -> todos true (los mismos usuarios de antes, ninguno cambiado)
--   - Guardar un revendedor "pedro-" o "www" en Revendedores dice
--     "El usuario va en la dirección de su catálogo..."
-- =====================================================================

begin;

create or replace function usuario_rv_valido(p_usuario text)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  select coalesce(p_usuario, '') ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
     and coalesce(p_usuario, '') !~ '^xn--'
     and not (coalesce(p_usuario, '') = any (
array['www', 'entrar', 'admin', 'api', 'app', 'mail', 'correo', 'smtp', 'ftp', 'tienda', 'lux', 'luxbyemory', 'emory', 'rv', 'r', 'catalogo', 'vitrina', 'publico', 'guia', 'reserva', 'apartado', 'venta', 'pagos', 'soporte', 'ayuda', 'blog', 'static', 'assets', 'cdn', 'dev', 'test', 'staging'] -- RESERVADOS (igual que USUARIOS_RESERVADOS de lib/dominio.ts)
     ));
$fn$;

-- La evalúa el `check` al escribir en revendedores, con la sesión de quien
-- escribe (CLAUDE.md, Trampas: "Escribir en configuracion ejecuta
-- claves_ofertas()"). No dice nada que no diga la pantalla.
revoke all on function usuario_rv_valido(text) from public, anon;
grant execute on function usuario_rv_valido(text) to authenticated;

do $$
declare
  v_malos text;
begin
  select string_agg(format('"%s" (%s)', usuario, nombre), ', ' order by usuario)
    into v_malos
    from revendedores
   where not usuario_rv_valido(usuario);
  if v_malos is not null then
    raise exception 'Estos revendedores tienen un usuario que no sirve como subdominio: %. Cámbialo en Revendedores y corre este archivo otra vez.', v_malos;
  end if;
end;
$$;

alter table revendedores drop constraint if exists revendedores_usuario_check;
alter table revendedores add constraint revendedores_usuario_check check (usuario_rv_valido(usuario));

create or replace function admin_guardar_revendedor(
  p_id              bigint,
  p_nombre          text,
  p_usuario         text,
  p_telefono        text    default null,
  p_cedula          text    default null,
  p_catalogo_nombre text    default null,
  p_paleta          text    default 'lux',
  p_logo_path       text    default null,
  p_descuento_pct   numeric default null,
  p_tope_manual_usd numeric default null,
  p_activo          boolean default true,
  p_notas           text    default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_usuario text := lower(btrim(coalesce(p_usuario, '')));
  v_codigo  text;
  v_id      bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede crear o cambiar revendedores.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Falta el nombre.';
  end if;
  if not usuario_rv_valido(v_usuario) then
    raise exception 'El usuario va en la dirección de su catálogo: de 3 a 30 letras minúsculas, números o guiones, sin empezar ni terminar en guion. Algunos nombres los usa la tienda (entrar, www, admin...).';
  end if;

  begin
    if p_id is null then
      v_codigo := rv_codigo_nuevo();
      insert into revendedores (nombre, usuario, telefono, cedula, catalogo_nombre, paleta, logo_path,
                                descuento_pct, tope_manual_usd, activo, notas, clave_hash, creado_por)
      values (btrim(p_nombre), v_usuario, nullif(btrim(coalesce(p_telefono, '')), ''),
              nullif(btrim(coalesce(p_cedula, '')), ''), nullif(btrim(coalesce(p_catalogo_nombre, '')), ''),
              coalesce(nullif(btrim(coalesce(p_paleta, '')), ''), 'lux'), nullif(btrim(coalesce(p_logo_path, '')), ''),
              p_descuento_pct, p_tope_manual_usd, coalesce(p_activo, true),
              nullif(btrim(coalesce(p_notas, '')), ''), rv_huella_codigo(v_codigo), auth.uid())
      returning id into v_id;
    else
      update revendedores
         set nombre = btrim(p_nombre),
             usuario = v_usuario,
             telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
             cedula = nullif(btrim(coalesce(p_cedula, '')), ''),
             catalogo_nombre = nullif(btrim(coalesce(p_catalogo_nombre, '')), ''),
             paleta = coalesce(nullif(btrim(coalesce(p_paleta, '')), ''), 'lux'),
             logo_path = nullif(btrim(coalesce(p_logo_path, '')), ''),
             descuento_pct = p_descuento_pct,
             tope_manual_usd = p_tope_manual_usd,
             activo = coalesce(p_activo, true),
             notas = nullif(btrim(coalesce(p_notas, '')), '')
       where id = p_id
      returning id into v_id;
      if v_id is null then
        raise exception 'Ese revendedor no existe.';
      end if;
      -- Pausarlo cierra sus sesiones en el acto.
      if not coalesce(p_activo, true) then
        delete from revendedor_sesiones where revendedor_id = v_id;
      end if;
    end if;
  exception
    when unique_violation then
      raise exception 'Ya hay un revendedor con el usuario "%". Elige otro.', v_usuario;
    when check_violation then
      raise exception 'Revisa los datos: el nombre va de 2 a 80 letras, el del catálogo de 2 a 60, el descuento entre 0 y 100 y el tope no puede ser negativo.';
  end;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end;
$fn$;

revoke all on function admin_guardar_revendedor(bigint, text, text, text, text, text, text, text, numeric, numeric, boolean, text) from public, anon;
grant execute on function admin_guardar_revendedor(bigint, text, text, text, text, text, text, text, numeric, numeric, boolean, text) to authenticated;


commit;
