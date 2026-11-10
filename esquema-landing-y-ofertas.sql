-- =====================================================================
-- Lux by Emory — la landing del catálogo y las ofertas con código (#65)
-- Ejecutar en el SQL Editor DESPUÉS de esquema-conteo-autorizado.sql (#64)
--
-- QUÉ PIDIÓ EL DUEÑO (09/11/2026)
-- "Que la dirección del catálogo, la que termina en `publico`, sea una
-- landing page de Lux, con motion, sliders y fotografías: quiénes somos,
-- qué buscamos, los materiales, nuestras redes para que nos sigan, el
-- catálogo con su carrito y el método de compra. Fácil de seguir para que
-- el consumidor no se pierda [...] Con un panel en la administración para
-- poner y editar secciones." Y que el sistema vea qué piezas se miran, para
-- ofrecerle las dos juntas a quien mira dos un buen rato.
-- El diseño: docs/superpowers/specs/2026-11-09-landing-y-ofertas-design.md.
--
-- QUÉ HACE
--  §1. LA LANDING. El inicio del catálogo deja de estar escrito a mano: son
--      secciones (`landing_secciones`), cada una de un tipo, en el orden y
--      con los textos y fotos que el dueño decide en el panel "Landing".
--      Sin sesión se leen por `v_landing` (solo las visibles, en orden, sin
--      una sola cifra); el panel las lee todas por `v_landing_admin`, y las
--      escribe por `admin_guardar_seccion`, `admin_ordenar_secciones` y
--      `admin_borrar_seccion`. La tabla no la lee ni la escribe nadie en
--      crudo, ni el administrador.
--      Siembra 18 secciones en el orden de la spec. Los textos de la
--      portada, Quiénes somos, Lo que buscamos y Materiales salen del
--      cerebro de marca y de `textos.materiales_largo`; ninguna cifra, ningún
--      proveedor. El video sale escondido: no hay video todavía, y una
--      sección vacía no aporta (el dueño la enciende al subir uno).
--      Dos textos nuevos, vacíos, para las redes: `tiktok_tienda` y
--      `facebook_tienda`.
--  §2. LAS MIRADAS. Cuánto se mira cada pieza en el catálogo: el navegador
--      cuenta el tiempo que el detalle de una pieza está abierto y lo manda
--      por `registrar_miradas` (sin sesión; con sesión no cuenta, como las
--      visitas). Se guarda por día y pieza, sumado de todos: nadie se
--      identifica. El dueño lo ve en `v_miradas` (lo más mirado en 30 días
--      y cuántas se vendieron).
--
-- LAS FIRMAS
-- Todo es nuevo: ninguna función que el navegador ya llama cambia. El
-- navegador de hoy no lee nada de esto, y el nuevo funciona sin este
-- archivo (sin `v_landing` dibuja el inicio de siempre).
--
-- QUÉ DEBERÍA DAR, DESPUÉS DE CORRERLO
--  1. select tipo, titulo from v_landing;
--     -> 17 filas: portada, cintas, tipos, estuche, combos, nosotros,
--        seleccion, estantes, escote, materiales, regalo, galeria,
--        como_pedir, proximamente, buscamos, redes, tienda (la 18.ª, el
--        video, está escondida).
--  2. select count(*) from landing_secciones;            -> 18
--  3. select clave, valor from textos
--      where clave in ('tiktok_tienda', 'facebook_tienda');
--     -> dos filas con valor ''.
--  4. select count(*) from catalogo_miradas;             -> 0, hasta que el
--     navegador nuevo empiece a contar. (En el SQL Editor `v_miradas` sale
--     vacía siempre: no hay sesión de administrador.)
--
-- Reejecutable: correrlo otra vez no vuelve a sembrar si ya hay secciones,
-- ni pisa lo que el dueño cambió en el panel o en Textos.
-- =====================================================================


-- ---------------------------------------------------------------------
-- §1. LA LANDING
-- ---------------------------------------------------------------------

-- Los diecinueve tipos de sección de la spec. Cada uno tiene su componente
-- en el navegador; uno que no está aquí no se puede guardar.
create or replace function landing_tipo_valido(p_tipo text)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  select coalesce(p_tipo in (
    'portada', 'cintas', 'estuche', 'tipos', 'combos', 'seleccion', 'estantes',
    'escote', 'regalo', 'casa', 'nosotros', 'buscamos', 'materiales', 'galeria',
    'video', 'como_pedir', 'proximamente', 'redes', 'tienda'), false);
$fn$;

-- Los que dibujan lo de la base (piezas, ofertas, la tienda): uno solo de
-- cada uno. Repetirlos enseñaría lo mismo dos veces; se esconden, no se
-- duplican ni se borran. Los demás (galería, video, nosotros, buscamos, y
-- también portada, materiales y redes) sí se repiten.
-- La lee también el índice único de abajo: si esta lista cambia, ese
-- índice se rehace a mano (drop index y correr otra vez este archivo).
create or replace function landing_tipo_unico(p_tipo text)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  select coalesce(p_tipo in (
    'tipos', 'estantes', 'como_pedir', 'proximamente', 'tienda', 'cintas',
    'estuche', 'combos', 'seleccion', 'escote', 'regalo', 'casa'), false);
$fn$;

-- Una foto, un póster o un video: una ruta del propio sitio
-- ("landing/portada-1.webp", que sirve GitHub Pages) o una dirección
-- pública del bucket `fotos` de Supabase (lo que sube el dueño). Nada de
-- otro sitio: la política de seguridad del navegador no lo dejaría
-- cargar, y una dirección ajena en la página es una puerta.
create or replace function landing_ruta_valida(p_ruta text)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  select p_ruta is null
      or p_ruta = ''
      or (p_ruta ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
          and p_ruta !~ '\.\.'
          and p_ruta !~ '//')
      or (p_ruta ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/fotos/[A-Za-z0-9._/%-]+$'
          and p_ruta !~ '\.\.');
$fn$;

-- A dónde lleva un botón. No es una dirección: es una palabra que el
-- navegador convierte en su sitio (todas las joyas, un tipo, las ofertas,
-- lo que viene, el WhatsApp de la tienda o una sección de la landing).
create or replace function landing_destino_valido(p_destino text)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  select coalesce(
       p_destino in ('todas', 'ofertas', 'proximamente', 'whatsapp')
    or (p_destino ~ '^tipo:' and length(p_destino) between 6 and 65
        and p_destino !~ '[[:cntrl:]<>"]')
    or (p_destino ~ '^seccion:' and landing_tipo_valido(substr(p_destino, 9))),
    false);
$fn$;

-- La forma de `datos`, por tipo (la que lee el navegador):
--   portada, galeria     {diapositivas: [{foto, frase, texto, boton: {texto, destino}}]}
--   nosotros, buscamos   {foto, boton?}
--   materiales           {tarjetas: [{titulo, texto, foto, icono}]}
--   video                {video, poster}
--   las de la base       {}
-- Aquí se comprueba lo que podría hacer daño o romper la página: que sea
-- un objeto, que las listas sean listas, que cada foto o video sea del
-- sitio o del bucket y que cada botón diga a dónde lleva con una palabra
-- de la lista. Devuelve el problema dicho para el dueño, o null.
create or replace function landing_datos_error(p_datos jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v_lista text;
  v_obj   jsonb;
  v_clave text;
  v_val   jsonb;
begin
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    return 'Los datos de la sección no se entienden. Recarga la pantalla y vuelve a guardar.';
  end if;

  foreach v_lista in array array['diapositivas', 'tarjetas'] loop
    if jsonb_typeof(p_datos -> v_lista) not in ('array', 'null') then
      return format('La lista de %s no se entiende. Recarga la pantalla y vuelve a guardar.', v_lista);
    end if;
  end loop;

  for v_obj in
    select p_datos
    union all
    select x from jsonb_array_elements(
      case when jsonb_typeof(p_datos -> 'diapositivas') = 'array' then p_datos -> 'diapositivas' else '[]'::jsonb end) x
    union all
    select x from jsonb_array_elements(
      case when jsonb_typeof(p_datos -> 'tarjetas') = 'array' then p_datos -> 'tarjetas' else '[]'::jsonb end) x
  loop
    if jsonb_typeof(v_obj) <> 'object' then
      return 'Una diapositiva o una tarjeta no se entiende. Recarga la pantalla y vuelve a guardar.';
    end if;

    foreach v_clave in array array['foto', 'poster', 'video'] loop
      v_val := v_obj -> v_clave;
      if v_val is not null and jsonb_typeof(v_val) <> 'null' then
        if jsonb_typeof(v_val) <> 'string' or not landing_ruta_valida(v_val #>> '{}') then
          return format('"%s" no es una foto ni un video de la tienda: súbelo desde el panel.', left(v_val #>> '{}', 80));
        end if;
      end if;
    end loop;

    v_val := v_obj -> 'boton';
    if v_val is not null and jsonb_typeof(v_val) <> 'null' then
      if jsonb_typeof(v_val) <> 'object'
         or jsonb_typeof(v_val -> 'texto') is distinct from 'string'
         or btrim(v_val ->> 'texto') = ''
         or jsonb_typeof(v_val -> 'destino') is distinct from 'string'
         or not landing_destino_valido(v_val ->> 'destino') then
        return format('El botón "%s" no dice a dónde lleva: elige su destino en la lista.',
                      left(coalesce(v_val ->> 'texto', ''), 60));
      end if;
    end if;
  end loop;

  return null;
end;
$fn$;

-- Nadie las llama por fuera: las usan la tabla y las funciones de abajo.
-- `landing_tipo_unico` queda abierta a la tienda porque la lee
-- `v_landing_admin`, y una vista no presta su permiso para ejecutar.
revoke all on function landing_tipo_valido(text)     from public, anon, authenticated;
revoke all on function landing_ruta_valida(text)     from public, anon, authenticated;
revoke all on function landing_destino_valido(text)  from public, anon, authenticated;
revoke all on function landing_datos_error(jsonb)    from public, anon, authenticated;
revoke all on function landing_tipo_unico(text)      from public, anon, authenticated;
grant execute on function landing_tipo_unico(text) to authenticated;


create table if not exists landing_secciones (
  id              bigserial   primary key,
  tipo            text        not null,
  -- Se ordena por `orden` y, a igual orden, por id. No es único: así
  -- reordenar no choca consigo mismo a mitad del cambio.
  orden           integer     not null,
  visible         boolean     not null default true,
  titulo          text,
  texto           text,
  datos           jsonb       not null default '{}'::jsonb,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid        references perfiles(id)
);

alter table landing_secciones drop constraint if exists landing_secciones_tipo_valido;
alter table landing_secciones add constraint landing_secciones_tipo_valido
  check (landing_tipo_valido(tipo));

alter table landing_secciones drop constraint if exists landing_secciones_datos_objeto;
alter table landing_secciones add constraint landing_secciones_datos_objeto
  check (jsonb_typeof(datos) = 'object');

-- Una sola de cada tipo de la base, también desde el SQL Editor.
create unique index if not exists landing_secciones_tipo_unico
  on landing_secciones (tipo)
  where landing_tipo_unico(tipo);

comment on table landing_secciones is
  'Las secciones de la landing del catálogo, en su orden. Se leen por v_landing (sin sesión) y v_landing_admin (el panel); se escriben por admin_guardar_seccion, admin_ordenar_secciones y admin_borrar_seccion.';

-- Nadie la lee ni la escribe en crudo, ni el administrador: así cada
-- escritura pasa por la comprobación de `datos` y deja quién y cuándo.
alter table landing_secciones enable row level security;
revoke all on table landing_secciones from public, anon, authenticated;
revoke all on sequence landing_secciones_id_seq from public, anon, authenticated;


-- La landing, sin sesión: las secciones visibles, en su orden. Ni una
-- cifra: títulos, textos y las fotos y botones de `datos`.
create or replace view v_landing
with (security_invoker = off) as
select s.id, s.tipo, s.orden, s.titulo, s.texto, s.datos
  from landing_secciones s
 where s.visible
 order by s.orden, s.id;

-- Una vista de una sola tabla se puede escribir (insert, update, delete),
-- y con el permiso del dueño de la vista: con los permisos que Supabase
-- da por omisión a lo nuevo, cualquiera sin sesión cambiaría la landing
-- escribiendo en ella. Solo lectura.
revoke all on v_landing from public, anon, authenticated;
grant select on v_landing to anon, authenticated;


-- El panel: todas, también las escondidas, con lo que necesita para
-- dibujar su lista (si sale, si se puede repetir o borrar, quién la tocó).
create or replace view v_landing_admin
with (security_invoker = off) as
select s.id, s.tipo, s.orden, s.visible, s.titulo, s.texto, s.datos,
       not landing_tipo_unico(s.tipo) as se_repite,
       s.actualizado_en,
       p.nombre as actualizado_por
  from landing_secciones s
  left join perfiles p on p.id = s.actualizado_por
 where es_admin()
 order by s.orden, s.id;

revoke all on v_landing_admin from public, anon, authenticated;
grant select on v_landing_admin to authenticated;


-- Guardar una sección. Sin `p_id`, una nueva, al final. Con `p_id`, cambia
-- su título, su texto y sus datos; `p_visible` null la deja como estaba.
-- El tipo de una sección guardada no cambia: sus datos son de ese tipo.
create or replace function admin_guardar_seccion(
  p_id      bigint,
  p_tipo    text,
  p_titulo  text,
  p_texto   text,
  p_datos   jsonb,
  p_visible boolean
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_tipo   text  := nullif(btrim(coalesce(p_tipo, '')), '');
  v_titulo text  := nullif(btrim(coalesce(p_titulo, '')), '');
  v_texto  text  := nullif(btrim(coalesce(p_texto, '')), '');
  v_datos  jsonb := coalesce(p_datos, '{}'::jsonb);
  v_error  text;
  v_actual landing_secciones%rowtype;
  v_otra   text;
  v_id     bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador cambia la landing.';
  end if;

  v_error := landing_datos_error(v_datos);
  if v_error is not null then
    raise exception '%', v_error;
  end if;

  -- Dos pestañas del panel guardando a la vez no se pisan el orden ni
  -- meten dos veces una sección de la base.
  perform pg_advisory_xact_lock(hashtext('landing_secciones'));

  if p_id is null then
    if v_tipo is null or not landing_tipo_valido(v_tipo) then
      raise exception 'Ese tipo de sección no existe: elige uno de la lista.';
    end if;
    if landing_tipo_unico(v_tipo) then
      select coalesce(s.titulo, s.tipo) into v_otra
        from landing_secciones s where s.tipo = v_tipo limit 1;
      if found then
        raise exception 'Ya hay una sección «%» en la landing, y esa no se repite: si no la quieres, escóndela.', v_otra;
      end if;
    end if;

    insert into landing_secciones (tipo, orden, visible, titulo, texto, datos, actualizado_por)
    values (v_tipo,
            coalesce((select max(orden) from landing_secciones), 0) + 1,
            coalesce(p_visible, true), v_titulo, v_texto, v_datos, auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  select * into v_actual from landing_secciones where id = p_id for update;
  if not found then
    raise exception 'Esa sección ya no existe: recarga la pantalla.';
  end if;
  if v_tipo is not null and v_tipo <> v_actual.tipo then
    raise exception 'Una sección no cambia de tipo: agrega una nueva y esconde o borra esta.';
  end if;

  update landing_secciones
     set titulo          = v_titulo,
         texto           = v_texto,
         datos           = v_datos,
         visible         = coalesce(p_visible, visible),
         actualizado_en  = now(),
         actualizado_por = auth.uid()
   where id = p_id;
  return p_id;
end;
$fn$;

revoke all on function admin_guardar_seccion(bigint, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function admin_guardar_seccion(bigint, text, text, text, jsonb, boolean) to authenticated;


-- El orden: las secciones en el orden de `p_ids`. Las que no vienen en la
-- lista (otra pestaña agregó una mientras tanto) quedan después, en el
-- orden que tenían; un id que ya no existe se ignora.
create or replace function admin_ordenar_secciones(p_ids bigint[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'Solo un administrador cambia la landing.';
  end if;

  perform pg_advisory_xact_lock(hashtext('landing_secciones'));

  with pedidas as (
    select x.id, min(x.n) as n
      from unnest(coalesce(p_ids, '{}'::bigint[])) with ordinality as x(id, n)
     where x.id is not null
     group by x.id
  ), nuevo as (
    select s.id,
           row_number() over (order by (p.n is null), p.n, s.orden, s.id)::int as orden
      from landing_secciones s
      left join pedidas p on p.id = s.id
  )
  update landing_secciones s
     set orden           = n.orden,
         actualizado_en  = now(),
         actualizado_por = auth.uid()
    from nuevo n
   where n.id = s.id
     and s.orden is distinct from n.orden;
end;
$fn$;

revoke all on function admin_ordenar_secciones(bigint[]) from public, anon, authenticated;
grant execute on function admin_ordenar_secciones(bigint[]) to authenticated;


-- Borrar una sección. Las de la base no se borran: se esconden (con
-- `admin_guardar_seccion(..., p_visible => false)`). Una que ya no existe
-- no es un error: es lo que se quería.
create or replace function admin_borrar_seccion(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_tipo   text;
  v_titulo text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador cambia la landing.';
  end if;

  perform pg_advisory_xact_lock(hashtext('landing_secciones'));

  select s.tipo, s.titulo into v_tipo, v_titulo
    from landing_secciones s where s.id = p_id;
  if not found then
    return;
  end if;
  if landing_tipo_unico(v_tipo) then
    raise exception 'La sección «%» sale de la base y no se borra: si no la quieres, escóndela.', coalesce(v_titulo, v_tipo);
  end if;

  delete from landing_secciones where id = p_id;
end;
$fn$;

revoke all on function admin_borrar_seccion(bigint) from public, anon, authenticated;
grant execute on function admin_borrar_seccion(bigint) to authenticated;


-- LO SEMBRADO
-- El orden de la spec: primero lo que vende y entretiene, la historia en
-- medio, para que una clienta con prisa compre sin bajar mucho.
-- Las fotos son las de ambiente de `public/landing/` (el navegador pide
-- cada una en -800 y -1600). Los textos dicen solo lo que afirma el
-- cerebro de marca: los materiales, la certificación, de dónde somos y
-- los envíos. Ninguna cifra: los porcentajes y los plazos los pone la
-- base en cada oferta, y ningún proveedor.
-- Las secciones de la base llevan solo su título; su texto, si lo tienen,
-- lo pone el navegador.
-- Solo si la tabla está vacía: correrlo otra vez no vuelve a sembrar lo
-- que el dueño borró, ni pisa lo que cambió.
insert into landing_secciones (tipo, orden, visible, titulo, texto, datos)
select v.tipo, v.orden, v.visible, v.titulo, v.texto, v.datos
  from (values
    ('portada', 1, true, null::text, null::text, $j${"diapositivas": [
      {"foto": "landing/portada-1.webp",
       "frase": "Joyas que no se manchan, no se ponen verdes y no irritan",
       "texto": "Acero 316L quirúrgico, titanio y baño de oro de 18K PVD, con certificación SGS. Desde Sabana de Mendoza para toda Venezuela.",
       "boton": {"texto": "Ver las joyas", "destino": "todas"}},
      {"foto": "landing/portada-2.webp",
       "frase": "El oro que no se borra",
       "texto": "El baño PVD se adhiere al metal y no se cae con facilidad, aunque la uses todos los días.",
       "boton": {"texto": "Conoce los materiales", "destino": "seccion:materiales"}},
      {"foto": "landing/portada-3.webp",
       "frase": "El regalo que sí dura",
       "texto": "Joyería para usar todos los días, que dura años y no meses.",
       "boton": {"texto": "Ver las ofertas", "destino": "ofertas"}},
      {"foto": "landing/portada-4.webp",
       "frase": "Enviamos a toda Venezuela",
       "texto": "Bien empacada y segura hasta tu estado. Si quieres ayuda para elegir, escríbenos.",
       "boton": {"texto": "Escríbenos por WhatsApp", "destino": "whatsapp"}}
    ]}$j$::jsonb),
    ('cintas', 2, true, null, null, '{}'::jsonb),
    ('tipos', 3, true, 'Elige por tipo', null, '{}'::jsonb),
    ('estuche', 4, true, 'Abre tu estuche', 'Tócalo y mira qué te tocó hoy.', '{}'::jsonb),
    ('combos', 5, true, 'Combos de la semana', 'Piezas que combinan, juntas y con descuento.', '{}'::jsonb),
    ('nosotros', 6, true, 'Quiénes somos',
     'Somos Lux by Emory, una joyería de Sabana de Mendoza que envía a toda Venezuela. Nuestras piezas son hipoalergénicas: acero 316L quirúrgico, titanio y baño de oro de 18K PVD, con certificación SGS. No vendemos moda pasajera: vendemos calidad real, con respaldo técnico, para que la uses todos los días.',
     $j${"foto": "landing/nosotros.webp",
         "boton": {"texto": "Conoce los materiales", "destino": "seccion:materiales"}}$j$::jsonb),
    ('seleccion', 7, true, 'Selección de la casa', 'Piezas elegidas por la tienda, con un descuento para ti.', '{}'::jsonb),
    ('estantes', 8, true, null, null, '{}'::jsonb),
    ('escote', 9, true, '¿Qué escote usas?', 'Elige el tuyo y te enseñamos el collar y los aretes que le van.', '{}'::jsonb),
    ('materiales', 10, true, 'De qué están hechas',
     coalesce((select nullif(btrim(t.valor), '') from textos t where t.clave = 'materiales_largo'),
              'Acero inoxidable 316L quirúrgico con aleación de titanio y baño de oro 18K PVD. No se mancha, no se pone verde y no irrita la piel, aunque la uses todos los días.'),
     $j${"tarjetas": [
      {"titulo": "Acero 316L y titanio",
       "texto": "El acero de los instrumentos médicos no libera níquel de forma dañina, y el titanio es de los metales más biocompatibles. Ideal para la piel muy sensible.",
       "foto": "landing/materiales-1.webp", "icono": "acero"},
      {"titulo": "Oro de 18K PVD",
       "texto": "El oro se adhiere al metal a nivel molecular. Resiste el desgaste, no mancha la piel y mantiene el brillo por más tiempo.",
       "foto": "landing/materiales-2.webp", "icono": "oro"},
      {"titulo": "Certificación SGS",
       "texto": "SGS, una entidad internacional, analizó los materiales y confirma que son seguros para la piel. No es que lo digamos nosotros: está comprobado.",
       "foto": "landing/materiales-3.webp", "icono": "sello"}
    ]}$j$::jsonb),
    ('regalo', 11, true, 'Para regalar', 'El regalo que sí dura: conjuntos listos para dar.', '{}'::jsonb),
    ('galeria', 12, true, 'Así se llevan', null, $j${"diapositivas": [
      {"foto": "landing/galeria-1.webp"},
      {"foto": "landing/galeria-2.webp"},
      {"foto": "landing/galeria-3.webp"},
      {"foto": "landing/galeria-4.webp"},
      {"foto": "landing/galeria-5.webp"},
      {"foto": "landing/galeria-6.webp"},
      {"foto": "landing/egipto-1.webp"},
      {"foto": "landing/egipto-2.webp"},
      {"foto": "landing/egipto-3.webp"}
    ]}$j$::jsonb),
    ('como_pedir', 13, true, 'Cómo pedir', null, '{}'::jsonb),
    ('proximamente', 14, true, 'Próximamente', null, '{}'::jsonb),
    -- Escondida hasta que el dueño suba un video y su póster.
    ('video', 15, false, 'De cerca', null, '{"video": null, "poster": null}'::jsonb),
    ('buscamos', 16, true, 'Lo que buscamos',
     'Que sea la última vez que te preocupas porque una pieza se manche, te irrite o se ponga fea. Que la uses en la ducha, en el gimnasio y con perfume, y siga igual. Y que vuelvas porque te funcionó.',
     '{"boton": {"texto": "Ver las joyas", "destino": "todas"}}'::jsonb),
    ('redes', 17, true, 'Síguenos', 'Ahí te enseñamos cada pieza de cerca. ¿Ya nos sigues?', '{}'::jsonb),
    ('tienda', 18, true, 'La tienda', null, '{}'::jsonb)
  ) as v(tipo, orden, visible, titulo, texto, datos)
 where not exists (select 1 from landing_secciones)
on conflict do nothing;


-- LAS REDES QUE FALTABAN
-- `textos` la lee cualquiera, también sin sesión, a propósito. Vacías, la
-- landing no pone el botón. `on conflict do nothing`: correrlo otra vez no
-- pisa lo que el dueño escribió.
insert into textos (clave, valor, descripcion) values
  ('tiktok_tienda',   '',
   'Usuario de TikTok de la tienda, sin @ y sin enlace: solo el usuario. Sale en la landing del catálogo, en las redes.'),
  ('facebook_tienda', '',
   'Página de Facebook de la tienda: lo que va después de facebook.com/ en su enlace, sin el enlace. Sale en la landing del catálogo, en las redes.')
on conflict (clave) do nothing;

-- Solo la descripción: el usuario que el dueño ya escribió no se toca.
insert into textos (clave, valor, descripcion) values
  ('instagram_tienda', '',
   'Usuario de Instagram de la tienda, sin @ y sin enlace: solo el usuario. Sale en el catálogo y en las redes de la landing.')
on conflict (clave) do update set descripcion = excluded.descripcion;


-- ---------------------------------------------------------------------
-- §2. LAS MIRADAS
-- Cuánto se mira cada pieza. El navegador cuenta, por pieza, cuántas
-- veces abrió su detalle y cuántos segundos lo tuvo abierto, y lo manda
-- al irse (o al pasar a otra pestaña). Se guarda por día y pieza, sumado
-- de todos: el número del navegador sirve para saber que no es alguien de
-- la tienda, y no se guarda.
--
-- LO QUE NO ES
-- No sirve para cobrar ni para dar una oferta: "Las dos que miraste" la
-- cuenta el navegador de la clienta, y el código lo pone `emitir_oferta`
-- con sus propias reglas. Cualquiera sin sesión puede llamar a
-- `registrar_miradas`, así que alguien con ganas podría inflar lo más
-- mirado; no puede leer nada ni tocar otra cosa, cada llamada tiene su
-- tope y la tabla no crece más que una fila por pieza y día.
-- ---------------------------------------------------------------------

create table if not exists catalogo_miradas (
  -- El día de Venezuela, como en las visitas y en la caja.
  dia            date        not null,
  -- Si se borra la pieza (una de un lote en camino que se cargó mal), sus
  -- miradas se van con ella: no son historia que lo impida.
  modelo_id      bigint      not null references modelos(id) on delete cascade,
  veces          bigint      not null default 0,
  segundos       bigint      not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (dia, modelo_id)
);

create index if not exists catalogo_miradas_modelo_idx on catalogo_miradas (modelo_id);

-- Nadie la lee ni la escribe en crudo: se escribe por `registrar_miradas`
-- y se lee por `v_miradas`.
alter table catalogo_miradas enable row level security;
revoke all on table catalogo_miradas from public, anon, authenticated;


-- Sin sesión: el catálogo público la llama con lo que se miró desde la
-- última vez. `p_miradas` = [{modelo_id, segundos, veces}].
-- Los topes son técnicos, no del negocio: 50 filas por llamada (las demás
-- se ignoran), y por pieza y llamada hasta 600 segundos y 100 veces. Lo
-- que no se entiende (una pieza que no existe o está retirada, un número
-- que no es número) se salta sin tumbar la llamada: es una cuenta, y la
-- clienta no tiene que ver un error por ella.
create or replace function registrar_miradas(p_visitante uuid, p_miradas jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_dia date := (now() at time zone 'America/Caracas')::date;
begin
  -- Con sesión es alguien de la tienda: no cuenta. Sin el número del
  -- navegador, tampoco (como en `registrar_visita`).
  if p_visitante is null or auth.uid() is not null then
    return;
  end if;
  if p_miradas is null or jsonb_typeof(p_miradas) <> 'array' then
    return;
  end if;

  insert into catalogo_miradas as cm (dia, modelo_id, veces, segundos)
  select v_dia, l.modelo_id, least(sum(l.veces), 100), least(sum(l.segundos), 600)
    from (
      select (e.x ->> 'modelo_id')::bigint as modelo_id,
             case when jsonb_typeof(e.x -> 'veces') = 'number'
                  then least(greatest(round((e.x ->> 'veces')::numeric), 0), 100)
                  else 1 end as veces,
             least(greatest(round((e.x ->> 'segundos')::numeric), 0), 600) as segundos
        from jsonb_array_elements(p_miradas) with ordinality as e(x, n)
       where e.n <= 50
         and jsonb_typeof(e.x) = 'object'
         and jsonb_typeof(e.x -> 'modelo_id') = 'number'
         and (e.x ->> 'modelo_id') ~ '^[0-9]{1,15}$'
         and jsonb_typeof(e.x -> 'segundos') = 'number'
         and coalesce(jsonb_typeof(e.x -> 'veces'), 'null') in ('number', 'null')
    ) l
    join modelos m on m.id = l.modelo_id and m.activo
   group by l.modelo_id
  having sum(l.segundos) > 0 or sum(l.veces) > 0
  on conflict (dia, modelo_id) do update
     set veces          = cm.veces + excluded.veces,
         segundos       = cm.segundos + excluded.segundos,
         actualizado_en = now();
end;
$fn$;

revoke all on function registrar_miradas(uuid, jsonb) from public, anon, authenticated;
grant execute on function registrar_miradas(uuid, jsonb) to anon, authenticated;


-- Lo más mirado, para el dueño: por pieza, en los últimos 30 días (hoy
-- incluido, en días de Venezuela), cuántas veces se abrió, cuántos
-- segundos sumó y cuántas se vendieron en esos mismos días (sin anuladas;
-- una devolución resta, como en la rotación). Ninguna cifra de costo: es
-- del dueño igual.
create or replace view v_miradas
with (security_invoker = off) as
with desde as (
  select (now() at time zone 'America/Caracas')::date - 29 as dia
)
select m.id                         as modelo_id,
       m.sku,
       m.nombre,
       m.variante,
       m.categoria,
       coalesce(m.familia_id, m.id) as familia,
       m.foto_thumb_path,
       m.activo,
       x.veces::bigint              as veces,
       x.segundos::bigint           as segundos,
       coalesce(v.vendidas, 0)::bigint as vendidas
  from (select cm.modelo_id, sum(cm.veces) as veces, sum(cm.segundos) as segundos
          from catalogo_miradas cm
         where cm.dia >= (select dia from desde)
         group by cm.modelo_id) x
  join modelos m on m.id = x.modelo_id
  left join lateral (
    select sum(i.cantidad) as vendidas
      from venta_items i
      join ventas vv on vv.id = i.venta_id and not vv.anulada
     where i.modelo_id = x.modelo_id
       and vv.fecha >= ((select dia from desde)::timestamp at time zone 'America/Caracas')
  ) v on true
 where es_admin()
 order by x.segundos desc, x.veces desc, m.id;

revoke all on v_miradas from public, anon, authenticated;
grant select on v_miradas to authenticated;


notify pgrst, 'reload schema';
