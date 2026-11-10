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
-- Y ofertas "por todos lados", con la voz de la casa: combos de varias
-- piezas hasta 10 % que varíen, "la selección" con 5 %, ofertas que él
-- crea, y un código aleatorio de un solo uso que se verifique en la
-- tienda.
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
--  §3. LAS OFERTAS Y SUS CÓDIGOS. Las diez cifras de las ofertas, en
--      `configuracion` (solo ellas pueden quedar vacías: sin una cifra, la
--      oferta que depende de ella no sale). Las ofertas de la casa, la
--      selección a mano, los combos de la semana y los códigos, en tablas
--      que nadie lee ni escribe en crudo. Sin sesión, `ofertas_publicas()`
--      (lo que la landing enseña) y `emitir_oferta(...)` (un código de un
--      solo uso, con sus piezas, su porcentaje y su vencimiento). La
--      tienda revisa un código con `ver_oferta`. El administrador arma
--      los combos, mete o saca piezas de la selección, crea las ofertas
--      de la casa, anula códigos y cambia las cifras con sus `admin_*`, y
--      ve los códigos en `v_ofertas`. Ninguna oferta baja una pieza de su
--      piso, y nada de lo que reciben la clienta o la vendedora trae
--      costo, piso ni margen. Cobrar con el código es la §4.
--
-- LAS FIRMAS
-- Todo es nuevo: ninguna función que el navegador ya llama cambia. El
-- navegador de hoy no lee nada de esto, y el nuevo funciona sin este
-- archivo (sin `v_landing` dibuja el inicio de siempre).
-- Dos cosas de antes cambian por dentro, sin cambiar lo que dan:
--  - `piso_margen_de` (la misma firma y la misma cuenta) llama ahora a
--    `piso_margen_con`, la cuenta sola, para que las ofertas costeen
--    muchas piezas con las cifras comunes calculadas una vez (como
--    `costo_bcv_con` en el #62). Da lo mismo pieza por pieza.
--  - `configuracion.valor` deja de ser obligatorio solo para las diez
--    claves de las ofertas (lo dice una restricción); las demás siguen
--    sin poder quedar vacías.
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
--  5. select clave, valor from configuracion
--      where clave = any (claves_ofertas()) order by clave;
--     -> 10 filas: oferta_codigos_dia_max 10, oferta_dias_validez 3,
--        oferta_max_pct 10, oferta_min_pct 5, oferta_mirada_segundos 20,
--        oferta_pareja_pct 5, ofertas_encendidas 1, regalo_tope_usd 15,
--        seleccion_dias_sin_venta 90, seleccion_pct 5.
--  6. select ofertas_publicas() -> 'encendidas';                 -> true
--     select jsonb_array_length(ofertas_publicas() -> 'combos');   -> 0
--     hasta que el administrador abra el panel o el Inventario (los
--     arma su navegador). `ofertas_publicas() -> 'seleccion'` ya trae
--     piezas libres que llevan más de 90 días sin venderse: como mucho
--     24, que cambian cada día (`select count(*) from seleccion_de_hoy()`
--     dice cuántas califican en total).
--  7. select count(*) from ofertas_codigos;                    -> 0
--  8. select id, piso_margen_de(id) from modelos order by id;
--     -> lo mismo que antes de correrlo (apúntalo antes para comparar).
--
-- Reejecutable: correrlo otra vez no vuelve a sembrar si ya hay secciones,
-- ni pisa lo que el dueño cambió en el panel o en Textos, ni las cifras
-- de las ofertas que cambió o dejó vacías.
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


-- ---------------------------------------------------------------------
-- §3. LAS OFERTAS Y SUS CÓDIGOS
-- La landing ofrece descuentos de varias formas (las dos que miraste,
-- complétalo, el escote, los combos de la semana, para regalar, el
-- estuche, la selección de la casa y las ofertas de la casa), y todas
-- terminan igual: un CÓDIGO de un solo uso que la base hace y guarda.
-- El navegador nunca dice el porcentaje ni el precio: pide el código por
-- `emitir_oferta`, que comprueba la oferta y cada pieza, y lo devuelve con
-- sus piezas, su porcentaje y su vencimiento. Cobrarlo es la §4.
--
-- LAS REGLAS QUE NO SE NEGOCIAN
--  - Ninguna oferta baja una pieza de su mínimo: una pieza entra solo si
--    su etiqueta con el descuento no baja de `piso_margen_de` (la misma
--    cuenta que el tramo). Por eso el precio de oferta es siempre la
--    etiqueta menos el porcentaje, y ninguna respuesta dice el piso.
--  - Una pieza sin existencia libre, de un lote en camino, retirada o sin
--    precio no entra; un dije entra solo con una base en la misma oferta.
--  - Las cifras viven en `configuracion` (las diez de abajo). Sin una
--    cifra, la oferta que depende de ella no sale.
--  - Un código emitido se respeta hasta que vence: apagar las ofertas,
--    terminar una oferta de la casa o rearmar los combos deja de ENSEÑAR
--    y de emitir, no toca los ya dados. Para un error o un abuso, el
--    administrador los anula.
--
-- QUIÉN VE QUÉ
--  - Sin sesión: `ofertas_publicas()` (lo que la landing enseña) y
--    `emitir_oferta(...)`. Ninguna de las dos devuelve costo, piso ni
--    margen, en ningún nivel.
--  - La tienda (`es_personal()`): `ver_oferta(código)`, para la pantalla
--    "Código" del mostrador: si sirve, y sus piezas con dónde hay libres y
--    los dos precios en bolívares.
--  - El administrador: las `admin_*` de las ofertas y `v_ofertas`.
--  - Las tablas no las lee ni las escribe nadie en crudo.
-- ---------------------------------------------------------------------

-- LAS CIFRAS
-- Las diez claves de las ofertas, en un sitio: la restricción de abajo,
-- `admin_cifras_ofertas` y `admin_guardar_cifra_oferta` leen esta lista.
create or replace function claves_ofertas()
returns text[]
language sql
immutable
set search_path = public
as $fn$
  select array['oferta_pareja_pct', 'oferta_min_pct', 'oferta_max_pct', 'seleccion_pct',
               'seleccion_dias_sin_venta', 'oferta_mirada_segundos', 'oferta_dias_validez',
               'regalo_tope_usd', 'oferta_codigos_dia_max', 'ofertas_encendidas']::text[];
$fn$;

-- Abierta a la tienda: la lee la restricción de `configuracion`, y una
-- restricción comprueba el permiso de ejecutar de quien escribe (el
-- administrador guarda Costos y Revendedores escribiendo en la tabla).
-- Solo devuelve diez nombres de claves.
revoke all on function claves_ofertas() from public, anon, authenticated;
grant execute on function claves_ofertas() to authenticated;

-- "Sin una cifra, la oferta que depende de ella no sale": el dueño la
-- deja vacía en el panel y se guarda null. Solo estas diez pueden quedar
-- vacías; todas las demás siguen obligadas, como antes.
alter table configuracion alter column valor drop not null;
alter table configuracion drop constraint if exists configuracion_valor_vacio_solo_ofertas;
alter table configuracion add constraint configuracion_valor_vacio_solo_ofertas
  check (valor is not null or clave = any (claves_ofertas()));

-- Los porcentajes, los 90 días, los 3 días y los $15 los dijo el dueño el
-- 09/11/2026; los 20 segundos y los 10 códigos son técnicos (spec,
-- "Ofertas"). Correrlo otra vez solo pone la descripción: no pisa lo que
-- el dueño cambió ni vuelve a llenar lo que dejó vacío.
insert into configuracion (clave, valor, descripcion) values
  ('oferta_pareja_pct', 5,
   'Descuento, en %, de las piezas que elige la clienta en la landing (las dos que miró, Complétalo, ¿Qué escote usas?), de 2 a 4 piezas. Vacío: esas ofertas no salen.'),
  ('oferta_min_pct', 5,
   'Descuento, en %, de un combo de la semana de 2 piezas, el más bajo de los combos. Vacío: los combos y Para regalar no salen.'),
  ('oferta_max_pct', 10,
   'Descuento, en %, de un combo de 4 piezas, el más alto de los combos (uno de 3 lleva el punto medio). Vacío: los combos y Para regalar no salen.'),
  ('seleccion_pct', 5,
   'Descuento, en %, de cada pieza de la Selección de la casa. Vacío: la selección no sale.'),
  ('seleccion_dias_sin_venta', 90,
   'Días sin venderse para que una pieza entre sola en la Selección de la casa, desde su última venta o desde que llegó. Vacío: la selección no sale.'),
  ('oferta_mirada_segundos', 20,
   'Segundos que la clienta tiene que mirar cada una de dos piezas para que la landing le ofrezca las dos juntas. Vacío: esa oferta no sale.'),
  ('oferta_dias_validez', 3,
   'Días que vale un código de oferta desde que se da. Vacío: no se dan códigos y las ofertas no salen en la landing.'),
  ('regalo_tope_usd', 15,
   'Hasta cuánto, en $ BCV y con el descuento puesto, cuesta un combo para que salga en Para regalar. Vacío: Para regalar no sale.'),
  ('oferta_codigos_dia_max', 10,
   'Cuántos códigos puede pedir un mismo teléfono en un día: un freno técnico, no un precio. Vacío: no se dan códigos y las ofertas no salen.'),
  ('ofertas_encendidas', 1,
   'Ofertas en la landing: 1 encendidas, 0 apagadas. Apagadas no se enseñan ni se dan códigos nuevos; los ya dados se respetan hasta que vencen.')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- Una cifra de las ofertas: null si está vacía o si no existe. Los
-- porcentajes (las claves "_pct"), con dos decimales: los que guardan el
-- código, el combo y la oferta de la casa. Así el porcentaje con que se
-- revisa una pieza, el que se congela y el que se enseña son el mismo
-- (con "7,125" en la tabla, el código decía 7,13 y el precio iba al 7,125).
create or replace function cifra_oferta(p_clave text)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case when right(p_clave, 4) = '_pct' then round(c.valor, 2) else c.valor end
    from (select (select x.valor from configuracion x where x.clave = p_clave) as valor) c;
$fn$;

-- Si hoy se enseñan ofertas y se dan códigos: el interruptor encendido, y
-- las dos cifras sin las que no hay código (cuánto vale y cuántos al día).
create or replace function ofertas_abiertas()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(cifra_oferta('ofertas_encendidas') = 1, false)
     and coalesce(cifra_oferta('oferta_dias_validez') > 0, false)
     and coalesce(cifra_oferta('oferta_codigos_dia_max') > 0, false);
$fn$;

revoke all on function cifra_oferta(text)  from public, anon, authenticated;
revoke all on function ofertas_abiertas()  from public, anon, authenticated;


-- LAS DOS CUENTAS DEL PRECIO
-- El piso del tramo, sola. Es la cuenta de siempre de `piso_margen_de`
-- (lo que deja el margen mínimo, nunca por encima de la etiqueta), sacada
-- a una función para que la oferta pueda costear muchas piezas de una vez
-- con las cifras comunes (brecha, merma, lo de tienda) calculadas una
-- sola vez, como `admin_reasignar_grupos` con `costo_bcv_con`. Una
-- fórmula, un sitio: `piso_margen_de` la llama también (abajo).
create or replace function piso_margen_con(p_lista numeric, p_costo_bcv numeric, p_margen_min numeric)
returns numeric
language sql
immutable
set search_path = public
as $fn$
  select round(least(p_lista, p_costo_bcv / (1 - least(coalesce(p_margen_min, 0), 99) / 100)), 2);
$fn$;

-- El precio de una pieza con su descuento: la etiqueta menos el
-- porcentaje, a cuatro decimales como el tramo de `precio_de_linea`. Una
-- pieza entra en una oferta solo si esto no baja de su piso.
create or replace function precio_oferta_con(p_lista numeric, p_pct numeric)
returns numeric
language sql
immutable
set search_path = public
as $fn$
  select round(p_lista * (1 - p_pct / 100), 4);
$fn$;

revoke all on function piso_margen_con(numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function precio_oferta_con(numeric, numeric)         from public, anon, authenticated;

-- `piso_margen_de`, la misma firma y la misma cuenta: solo pasa a llamar a
-- `piso_margen_con`. Da lo mismo pieza por pieza que antes del #65 (la
-- prueba lo compara). Sigue de definidor y con sus permisos de siempre.
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
  v_dije       boolean;
  v_margen_min numeric(12,4);
begin
  select coalesce(m.precio_override_usd, g.precio_usd), m.costo_puesto_usd,
         coalesce(m.armado = 'dije', false)
    into v_precio, v_costo, v_dije
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

  return piso_margen_con(v_precio, costo_bcv_pieza(v_costo, v_dije), v_margen_min);
end;
$fn$;

-- Muchas piezas de una vez, sin costo hacia fuera: por pieza activa, su
-- nombre, si es dije o base, su etiqueta, su piso, lo libre (lo que hay
-- menos lo que apartan los pedidos) y si es de un lote en camino. Las
-- cifras comunes se calculan una vez, con las mismas funciones que
-- `costo_bcv_pieza`, así el piso es el de `piso_margen_de`.
-- Revocada a todos: solo la leen las funciones de abajo.
create or replace function pisos_oferta(p_ids bigint[])
returns table (modelo_id bigint, nombre text, armado text, lista numeric, piso numeric,
               libre integer, en_camino boolean)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_hay_tasa boolean;
  v_brecha   numeric;
  v_merma    numeric;
  v_tienda   numeric;
  v_margen   numeric(12,4);
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  select t.tasa_venta / t.tasa_bcv into v_brecha from tasas t where t.vigente limit 1;
  v_hay_tasa := found;
  v_merma    := factor_merma();
  v_tienda   := costo_operativo_por_pieza();
  select c.valor into v_margen from configuracion c where c.clave = 'margen_minimo_pct';

  return query
  select m.id,
         m.nombre || coalesce(' · ' || m.variante, ''),
         m.armado,
         x.lista,
         case when x.lista is null then null
              when not v_hay_tasa  then x.lista
              else piso_margen_con(x.lista,
                                   costo_bcv_con(m.costo_puesto_usd, coalesce(m.armado = 'dije', false),
                                                 coalesce(v_brecha, 1), v_merma, v_tienda),
                                   v_margen)
         end,
         (coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0)
          - apartadas_de(m.id))::integer,
         coalesce(l.en_camino, false)
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
    left join lotes l on l.id = m.lote_id
    cross join lateral (select coalesce(m.precio_override_usd, g.precio_usd)::numeric(12,4) as lista) x
   where m.id = any (p_ids)
     and m.activo;
end;
$fn$;

-- Si una pieza aguanta un porcentaje: su etiqueta con el descuento no baja
-- de su piso. Una pieza retirada o sin precio no aguanta nada.
create or replace function aguanta_oferta(p_modelo bigint, p_pct numeric)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(p_pct > 0 and p_pct < 100, false)
     and coalesce((
           select precio_oferta_con(coalesce(m.precio_override_usd, g.precio_usd), p_pct) >= piso_margen_de(m.id)
             from modelos m
             left join grupos_precio g on g.id = m.grupo_precio_id
            where m.id = p_modelo and m.activo), false);
$fn$;

-- Lo que no deja dar una oferta con estas piezas a este porcentaje, dicho
-- para la clienta (o, con `p_para_admin`, para el dueño), o null si todas
-- entran. La primera que falla, en el orden en que vienen. Nunca dice el
-- piso ni el costo de nadie.
create or replace function piezas_que_fallan(p_modelos bigint[], p_pct numeric, p_para_admin boolean default false)
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  r       record;
  v_dijes integer := 0;
  v_bases integer := 0;
begin
  if p_pct is null or p_pct <= 0 or p_pct >= 100 then
    return 'Esta oferta no está disponible en este momento.';
  end if;
  if p_modelos is null or cardinality(p_modelos) = 0 then
    return 'La oferta no tiene piezas.';
  end if;

  for r in
    select x.id, x.n, mm.nombre as nombre_modelo, p.modelo_id as activa, p.nombre, p.armado,
           p.lista, p.piso, p.libre, p.en_camino
      from unnest(p_modelos) with ordinality as x(id, n)
      left join modelos mm on mm.id = x.id
      left join pisos_oferta(p_modelos) p on p.modelo_id = x.id
     order by x.n
  loop
    -- Retirada o inexistente: sin sesión no se dice el nombre (no está en
    -- ningún catálogo, y así nadie los recorre por número).
    if r.activa is null then
      return case when p_para_admin and r.nombre_modelo is not null
                  then format('"%s" está retirada.', r.nombre_modelo)
                  else 'Una de las piezas ya no está en el catálogo.' end;
    end if;
    if r.lista is null then
      return format('"%s" ya no está disponible.', r.nombre);
    end if;
    if r.en_camino then
      return format('"%s" todavía no ha llegado a la tienda.', r.nombre);
    end if;
    if r.libre < 1 then
      return format('"%s" ya no está disponible: se vendió o está apartada.', r.nombre);
    end if;
    if precio_oferta_con(r.lista, p_pct) < r.piso then
      return case when p_para_admin
                  then format('"%s" no aguanta el %s %%: con ese descuento bajaría de su mínimo.', r.nombre, trim_scale(p_pct))
                  else format('"%s" no entra en esta oferta.', r.nombre) end;
    end if;
    if r.armado = 'dije' then
      v_dijes := v_dijes + 1;
    elsif r.armado = 'base' then
      v_bases := v_bases + 1;
    end if;
  end loop;

  if v_dijes > v_bases then
    return 'Un dije entra en la oferta con su cadena o su pulsera: elige también la base.';
  end if;
  return null;
end;
$fn$;

revoke all on function pisos_oferta(bigint[])                         from public, anon, authenticated;
revoke all on function aguanta_oferta(bigint, numeric)                from public, anon, authenticated;
revoke all on function piezas_que_fallan(bigint[], numeric, boolean)  from public, anon, authenticated;


-- LAS TABLAS
-- Ninguna se lee ni se escribe en crudo, ni el administrador: todo pasa
-- por las funciones de abajo, que comprueban y dejan quién y cuándo.
-- Las de configuración de ofertas (casa, selección, combos) se van con la
-- pieza si se borra una de un lote en camino (no son historia); los
-- códigos sí son historia y la pieza de un código no se borra.

-- Las ofertas de la casa: las crea el dueño, con sus piezas, su
-- porcentaje (sin tope, siempre con el piso) y sus fechas.
create table if not exists ofertas_casa (
  id              bigserial    primary key,
  nombre          text         not null,
  texto           text,
  foto            text,
  pct             numeric(5,2) not null,
  desde           date         not null,
  hasta           date         not null,
  activa          boolean      not null default true,
  creado_en       timestamptz  not null default now(),
  actualizado_en  timestamptz  not null default now(),
  actualizado_por uuid         references perfiles(id),
  constraint ofertas_casa_pct_valido check (pct > 0 and pct < 100),
  constraint ofertas_casa_fechas check (hasta >= desde)
);

create table if not exists oferta_casa_items (
  oferta_id bigint  not null references ofertas_casa(id) on delete cascade,
  modelo_id bigint  not null references modelos(id) on delete cascade,
  orden     integer not null default 0,
  primary key (oferta_id, modelo_id)
);
create index if not exists oferta_casa_items_modelo_idx on oferta_casa_items (modelo_id);

-- Las piezas que el dueño metió o sacó a mano de la Selección de la casa.
-- Sin fila, manda la regla de los días sin venderse.
create table if not exists seleccion_manual (
  modelo_id    bigint      primary key references modelos(id) on delete cascade,
  accion       text        not null,
  cambiado_en  timestamptz not null default now(),
  cambiado_por uuid        references perfiles(id),
  constraint seleccion_manual_accion_valida check (accion in ('meter', 'sacar'))
);

-- Cada vez que se rearman los combos (con cuántos quedaron): los de la
-- semana son los de la última vez. Así `combos_armados_en` dice la fecha
-- aunque esa vez no quedara ninguno, y el panel no los rearma en bucle.
create table if not exists combos_rearmados (
  id          bigserial   primary key,
  armado_en   timestamptz not null default now(),
  armado_por  uuid        references perfiles(id),
  guardados   integer     not null default 0,
  descartados integer     not null default 0
);

-- Los combos de la semana: de 2 a 4 piezas que combinan (las elige el
-- navegador del administrador con `armarConjunto`), con el porcentaje que
-- pone la base por el número de piezas.
create table if not exists combos_semana (
  id          bigserial    primary key,
  rearmado_id bigint       not null references combos_rearmados(id),
  semana      date         not null,
  orden       integer      not null,
  pct         numeric(5,2) not null,
  piezas      integer      not null,
  constraint combos_semana_pct_valido check (pct > 0 and pct < 100),
  constraint combos_semana_piezas_validas check (piezas between 2 and 4)
);
create index if not exists combos_semana_rearmado_idx on combos_semana (rearmado_id);

create table if not exists combo_semana_items (
  combo_id  bigint  not null references combos_semana(id) on delete cascade,
  modelo_id bigint  not null references modelos(id) on delete cascade,
  orden     integer not null,
  primary key (combo_id, modelo_id)
);
create index if not exists combo_semana_items_modelo_idx on combo_semana_items (modelo_id);

-- Los códigos. `estado` es lo último que se escribió: emitido, tomado (por
-- un pedido), usado (por una venta) o anulado. Lo que de verdad vale hoy
-- lo dice `estado_codigo`: un tomado cuyo pedido ya no aparta vuelve a
-- servir, y un emitido que pasó su fecha está vencido.
-- `ref_id` es el combo (combo, regalo y el estuche que salió de un combo)
-- o la oferta de la casa; null en los demás. `visitante` es el número al
-- azar del navegador (el de las visitas), para el tope del día.
-- `roto_en`: se quitó o se devolvió una de sus piezas (la §5); el código
-- ya no vuelve a servir.
create table if not exists ofertas_codigos (
  id             bigserial    primary key,
  codigo         text         not null unique,
  origen         text         not null,
  ref_id         bigint,
  pct            numeric(5,2) not null,
  visitante      uuid,
  emitido_en     timestamptz  not null default now(),
  vence_en       timestamptz  not null,
  estado         text         not null default 'emitido',
  reserva_id     bigint       references reservas(id),
  venta_id       bigint       references ventas(id),
  usado_en       timestamptz,
  anulado_en     timestamptz,
  anulado_por    uuid         references perfiles(id),
  anulado_motivo text,
  roto_en        timestamptz,
  constraint ofertas_codigos_codigo_valido check (codigo ~ '^LUX-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
  constraint ofertas_codigos_origen_valido check (origen in
    ('dos_vistas', 'complemento', 'escote', 'combo', 'estuche', 'regalo', 'seleccion', 'casa')),
  constraint ofertas_codigos_estado_valido check (estado in ('emitido', 'tomado', 'usado', 'anulado')),
  constraint ofertas_codigos_pct_valido check (pct > 0 and pct < 100)
);
create index if not exists ofertas_codigos_visitante_idx on ofertas_codigos (visitante, emitido_en);
create index if not exists ofertas_codigos_emitido_idx   on ofertas_codigos (emitido_en);
create index if not exists ofertas_codigos_ref_idx       on ofertas_codigos (origen, ref_id);
create index if not exists ofertas_codigos_reserva_idx   on ofertas_codigos (reserva_id) where reserva_id is not null;
create index if not exists ofertas_codigos_venta_idx     on ofertas_codigos (venta_id) where venta_id is not null;

-- Las piezas de cada código, con lo que decían la etiqueta y la oferta al
-- darlo (para la historia: al cobrar se cuenta otra vez, y si el costo
-- subió entretanto, manda el piso).
create table if not exists ofertas_codigo_items (
  codigo_id         bigint        not null references ofertas_codigos(id) on delete cascade,
  modelo_id         bigint        not null references modelos(id),
  cantidad          integer       not null default 1,
  orden             integer       not null default 0,
  precio_lista_usd  numeric(12,4),
  precio_oferta_usd numeric(12,4),
  primary key (codigo_id, modelo_id),
  constraint ofertas_codigo_items_cantidad check (cantidad > 0)
);
create index if not exists ofertas_codigo_items_modelo_idx on ofertas_codigo_items (modelo_id);

alter table ofertas_casa         enable row level security;
alter table oferta_casa_items    enable row level security;
alter table seleccion_manual     enable row level security;
alter table combos_rearmados     enable row level security;
alter table combos_semana        enable row level security;
alter table combo_semana_items   enable row level security;
alter table ofertas_codigos      enable row level security;
alter table ofertas_codigo_items enable row level security;

revoke all on table ofertas_casa         from public, anon, authenticated;
revoke all on table oferta_casa_items    from public, anon, authenticated;
revoke all on table seleccion_manual     from public, anon, authenticated;
revoke all on table combos_rearmados     from public, anon, authenticated;
revoke all on table combos_semana        from public, anon, authenticated;
revoke all on table combo_semana_items   from public, anon, authenticated;
revoke all on table ofertas_codigos      from public, anon, authenticated;
revoke all on table ofertas_codigo_items from public, anon, authenticated;

revoke all on sequence ofertas_casa_id_seq     from public, anon, authenticated;
revoke all on sequence combos_rearmados_id_seq from public, anon, authenticated;
revoke all on sequence combos_semana_id_seq    from public, anon, authenticated;
revoke all on sequence ofertas_codigos_id_seq  from public, anon, authenticated;


-- EL CÓDIGO
-- "LUX-7K2M9P" con cualquier forma de escribirlo: minúsculas, espacios,
-- guiones, con o sin "LUX". Null si no puede ser un código (una letra
-- fuera del alfabeto, otro largo). Ninguna letra del alfabeto es L, así
-- que el prefijo nunca se confunde con el código.
create or replace function normalizar_codigo(p_texto text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case when t.x ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' then 'LUX-' || t.x end
    from (select regexp_replace(upper(regexp_replace(coalesce(p_texto, ''), '[[:space:]-]', '', 'g')),
                                '^LUX', '') as x) t;
$fn$;

-- Un código nuevo: "LUX-" y seis letras de un alfabeto sin confusiones
-- (sin 0, O, 1, I ni L), al azar de `gen_random_bytes`. Son 31 letras; los
-- bytes de 248 a 255 se saltan para que todas salgan igual de seguido.
-- 31^6 son unos 887 millones: adivinar uno que exista no es práctico, y
-- aunque se adivinara daría el descuento de unas piezas concretas.
create or replace function codigo_oferta_nuevo()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes   bytea;
  v_txt     text;
  v_byte    integer;
  v_intento integer := 0;
begin
  loop
    v_intento := v_intento + 1;
    if v_intento > 20 then
      raise exception 'No pudimos hacer el código. Intenta otra vez.';
    end if;
    v_bytes := extensions.gen_random_bytes(12);
    v_txt := '';
    for i in 0 .. 11 loop
      v_byte := get_byte(v_bytes, i);
      if v_byte < 248 then
        v_txt := v_txt || substr(v_alfabeto, v_byte % 31 + 1, 1);
      end if;
      exit when length(v_txt) = 6;
    end loop;
    continue when length(v_txt) < 6;
    exit when not exists (select 1 from ofertas_codigos c where c.codigo = 'LUX-' || v_txt);
  end loop;
  return 'LUX-' || v_txt;
end;
$fn$;

-- Lo que vale hoy un código (su estado EFECTIVO):
--   anulado    lo anuló la tienda;
--   usado      lo usó una venta, o su pedido ya se entregó, o se quitó o
--              devolvió una de sus piezas (`roto_en`: no vuelve a servir);
--   tomado     lo tiene un pedido que todavía aparta sus piezas;
--   vencido    pasó su fecha sin usarse (o su pedido se soltó y ya pasó);
--   emitido    sirve.
-- Un tomado cuyo pedido se canceló, venció o se archivó vuelve a servir si
-- no ha vencido. Si el pedido sigue vivo lo dice `fase_pedido`, la misma
-- que usa Pedidos: esperando el pago, reportado, apartado o pagado.
create or replace function estado_codigo(p_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
           when c.estado = 'anulado' then 'anulado'
           when c.estado in ('usado', 'tomado') and c.roto_en is not null then 'usado'
           when c.estado = 'usado' then 'usado'
           when c.estado = 'tomado' and f.fase = 'entregado' then 'usado'
           when c.estado = 'tomado'
                and f.fase in ('esperando_pago', 'reportado', 'apartado', 'pagado') then 'tomado'
           when c.vence_en <= now() then 'vencido'
           else 'emitido'
         end
    from ofertas_codigos c
    left join lateral (select fase_pedido(c.reserva_id) as fase) f on true
   where c.id = p_id;
$fn$;

revoke all on function normalizar_codigo(text) from public, anon, authenticated;
revoke all on function codigo_oferta_nuevo()   from public, anon, authenticated;
revoke all on function estado_codigo(bigint)   from public, anon, authenticated;


-- LO QUE SE ENSEÑA
-- Una pieza como la ven la página y el mostrador (el `pieza` del
-- contrato): sin costo ni piso. `foto_url` y `foto_thumb` son las rutas
-- del bucket, como `foto_path` y `foto_thumb_path` del catálogo: el
-- navegador las pasa por `fuenteFoto`.
create or replace function pieza_oferta(p_modelo bigint, p_cantidad integer, p_pct numeric)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
           'modelo_id',         m.id,
           'nombre',            m.nombre,
           'variante',          m.variante,
           'categoria',         m.categoria,
           'foto_thumb',        m.foto_thumb_path,
           'foto_url',          m.foto_path,
           'precio_lista_usd',  x.lista,
           'precio_oferta_usd', precio_oferta_con(x.lista, p_pct),
           'cantidad',          p_cantidad)
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
    cross join lateral (select coalesce(m.precio_override_usd, g.precio_usd)::numeric(12,4) as lista) x
   where m.id = p_modelo;
$fn$;

-- Las piezas de una oferta, una de cada una, en su orden.
create or replace function piezas_oferta_json(p_modelos bigint[], p_pct numeric)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(jsonb_agg(pieza_oferta(x.id, 1, p_pct) order by x.n), '[]'::jsonb)
    from unnest(p_modelos) with ordinality as x(id, n);
$fn$;

-- Un código como lo recibe la clienta: {codigo, origen, pct, vence_en, piezas}.
create or replace function codigo_json(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
           'codigo',   c.codigo,
           'origen',   c.origen,
           'pct',      c.pct,
           'vence_en', c.vence_en,
           'piezas',   coalesce((select jsonb_agg(pieza_oferta(i.modelo_id, i.cantidad, c.pct) order by i.orden)
                                   from ofertas_codigo_items i
                                  where i.codigo_id = c.id), '[]'::jsonb))
    from ofertas_codigos c
   where c.id = p_id;
$fn$;

revoke all on function pieza_oferta(bigint, integer, numeric)  from public, anon, authenticated;
revoke all on function piezas_oferta_json(bigint[], numeric)    from public, anon, authenticated;
revoke all on function codigo_json(bigint)                      from public, anon, authenticated;


-- LAS OFERTAS DE HOY
-- Los combos de la semana que se pueden enseñar: los de la última vez que
-- se rearmaron, con las cifras de los combos puestas y su porcentaje sin
-- pasar del máximo de hoy, y con TODAS sus piezas libres, aguantando su
-- porcentaje y cada dije con su base. Uno al que se le vendió una pieza
-- deja de salir hasta que se rearman.
create or replace function combos_vigentes()
returns table (combo_id bigint, pct numeric, modelos bigint[])
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_min      numeric := cifra_oferta('oferta_min_pct');
  v_max      numeric := cifra_oferta('oferta_max_pct');
  v_rearmado bigint;
  v_ids      bigint[];
begin
  if v_min is null or v_max is null then
    return;
  end if;
  select max(r.id) into v_rearmado from combos_rearmados r;
  if v_rearmado is null then
    return;
  end if;
  select array_agg(distinct ci.modelo_id) into v_ids
    from combo_semana_items ci
    join combos_semana cs on cs.id = ci.combo_id
   where cs.rearmado_id = v_rearmado;
  if v_ids is null then
    return;
  end if;

  return query
  with p as materialized (select * from pisos_oferta(v_ids))
  select cs.id, cs.pct::numeric, array_agg(ci.modelo_id order by ci.orden)
    from combos_semana cs
    join combo_semana_items ci on ci.combo_id = cs.id
    left join p on p.modelo_id = ci.modelo_id
   where cs.rearmado_id = v_rearmado
     and cs.pct <= v_max
   group by cs.id, cs.pct, cs.orden, cs.piezas
  having count(*) = cs.piezas
     and bool_and(p.modelo_id is not null and p.lista is not null and p.libre >= 1
                  and precio_oferta_con(p.lista, cs.pct) >= p.piso)
     and count(*) filter (where p.armado = 'dije') <= count(*) filter (where p.armado = 'base')
   order by cs.orden, cs.id;
end;
$fn$;

-- Las ofertas de la casa de hoy (día de Venezuela): activas, entre su
-- desde y su hasta, con todas sus piezas libres y aguantando su porcentaje.
-- Son un conjunto, como un combo: el código cubre todas sus piezas, y si
-- una se vende la oferta deja de salir.
create or replace function casas_vigentes()
returns table (oferta_id bigint, pct numeric, modelos bigint[])
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_hoy date := (now() at time zone 'America/Caracas')::date;
  v_ids bigint[];
begin
  select array_agg(distinct i.modelo_id) into v_ids
    from oferta_casa_items i
    join ofertas_casa o on o.id = i.oferta_id
   where o.activa and v_hoy between o.desde and o.hasta;
  if v_ids is null then
    return;
  end if;

  return query
  with p as materialized (select * from pisos_oferta(v_ids))
  select o.id, o.pct::numeric, array_agg(i.modelo_id order by i.orden, i.modelo_id)
    from ofertas_casa o
    join oferta_casa_items i on i.oferta_id = o.id
    left join p on p.modelo_id = i.modelo_id
   where o.activa and v_hoy between o.desde and o.hasta
   group by o.id, o.pct, o.hasta
  having bool_and(p.modelo_id is not null and p.lista is not null and p.libre >= 1
                  and precio_oferta_con(p.lista, o.pct) >= p.piso)
     and count(*) filter (where p.armado = 'dije') <= count(*) filter (where p.armado = 'base')
   order by o.hasta, o.id;
end;
$fn$;

-- La Selección de la casa de hoy. Entra sola una pieza activa, con
-- precio, que no es un dije ni de un lote en camino, cuya última venta
-- (sin anuladas ni devoluciones) tiene más de `seleccion_dias_sin_venta`
-- días; si nunca se vendió, desde que llegó su lote (o se liberó), y sin
-- lote, desde su alta. Más las que el dueño metió, menos las que sacó.
-- Todas, también las metidas, con existencia libre y aguantando
-- `seleccion_pct`. Sin una de las dos cifras, vacía.
-- Las cuentas baratas primero y los pisos después, una vez para todas las
-- que quedan (`pisos_oferta`).
create or replace function seleccion_de_hoy()
returns setof bigint
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_pct  numeric := cifra_oferta('seleccion_pct');
  v_dias numeric := cifra_oferta('seleccion_dias_sin_venta');
  v_hoy  date    := (now() at time zone 'America/Caracas')::date;
  v_ids  bigint[];
begin
  if v_pct is null or v_dias is null or v_pct <= 0 or v_pct >= 100 then
    return;
  end if;

  select array_agg(b.id) into v_ids
    from (select m.id, s.accion,
                 coalesce(u.ultima, l.liberado_en,
                          (l.fecha_llegada::timestamp at time zone 'America/Caracas'),
                          m.creado_en) as desde
            from modelos m
            left join lotes l on l.id = m.lote_id
            left join seleccion_manual s on s.modelo_id = m.id
            left join (select i.modelo_id, max(v.fecha) as ultima
                         from venta_items i
                         join ventas v on v.id = i.venta_id
                        where not v.anulada
                          and v.devolucion_de is null
                          and i.cantidad > 0
                        group by i.modelo_id) u on u.modelo_id = m.id
           where m.activo
             and m.armado is distinct from 'dije'
             and not coalesce(l.en_camino, false)
             and s.accion is distinct from 'sacar') b
   where b.accion = 'meter'
      or v_hoy - (b.desde at time zone 'America/Caracas')::date > v_dias;

  if v_ids is null then
    return;
  end if;

  return query
  select p.modelo_id
    from pisos_oferta(v_ids) p
   where p.lista is not null
     and p.libre >= 1
     and not p.en_camino
     and precio_oferta_con(p.lista, v_pct) >= p.piso
   order by p.modelo_id;
end;
$fn$;

revoke all on function combos_vigentes()   from public, anon, authenticated;
revoke all on function casas_vigentes()    from public, anon, authenticated;
revoke all on function seleccion_de_hoy()  from public, anon, authenticated;

-- Las piezas de la selección que la landing enseña hoy: como mucho
-- `c_tope` de `seleccion_de_hoy()`, al azar con la fecha de hoy en
-- Venezuela como semilla. El mismo día salen las mismas para todas las
-- clientas, y al día siguiente salen otras. `seleccion_de_hoy()` sigue
-- siendo la lista entera (el panel la enseña así).
-- El tope es de CARGA, no del negocio: con los lotes de la prueba entraban
-- 307 de 312 piezas, unos 58 KB por cada visita a la landing y la cinta
-- "Oferta" en casi todo. `p_dia` es solo para probar otro día: la landing
-- y `emitir_oferta` no lo pasan.
create or replace function seleccion_ensenada(p_dia date default null)
returns setof bigint
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  c_tope constant integer := 24;  -- tope de carga de la página, no una cifra del negocio
  v_dia  date := coalesce(p_dia, (now() at time zone 'America/Caracas')::date);
begin
  return query
  select s.id
    from seleccion_de_hoy() s(id)
   order by md5(v_dia::text || ':' || s.id::text), s.id
   limit c_tope;
end;
$fn$;

revoke all on function seleccion_ensenada(date) from public, anon, authenticated;


-- Lo que la landing enseña, sin sesión. Apagadas (o sin las cifras de los
-- códigos), todo vacío y `encendidas: false`: la página no pinta ninguna
-- oferta ni cinta. Por pieza, la etiqueta y el precio de oferta; nunca el
-- piso, el costo ni el margen.
--   {encendidas, pareja_pct, mirada_segundos, dias_validez,
--    combos: [{id, pct, total_lista_usd, total_oferta_usd, piezas}],
--    regalo: [los combos con total_oferta_usd <= regalo_tope_usd],
--    seleccion: {pct, piezas},     (las de `seleccion_ensenada()`: como mucho 24, cada día otras)
--    casa: [{id, nombre, texto, foto, pct, hasta, total_lista_usd, total_oferta_usd, piezas}],
--    en_oferta: [modelo_id, ...]}   (las piezas de la cinta "Oferta")
create or replace function ofertas_publicas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_tope    numeric := cifra_oferta('regalo_tope_usd');
  v_sel_pct numeric := cifra_oferta('seleccion_pct');
  v_combos  jsonb;
  v_regalo  jsonb;
  v_sel     jsonb;
  v_casa    jsonb;
  v_en      jsonb;
begin
  if not ofertas_abiertas() then
    return jsonb_build_object(
      'encendidas', false, 'pareja_pct', null, 'mirada_segundos', null, 'dias_validez', null,
      'combos', '[]'::jsonb, 'regalo', '[]'::jsonb,
      'seleccion', jsonb_build_object('pct', null, 'piezas', '[]'::jsonb),
      'casa', '[]'::jsonb, 'en_oferta', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.combo_id, 'pct', c.pct,
           'total_lista_usd', t.lista, 'total_oferta_usd', t.oferta,
           'piezas', j.piezas) order by c.n), '[]'::jsonb)
    into v_combos
    from combos_vigentes() with ordinality as c(combo_id, pct, modelos, n)
    cross join lateral (select piezas_oferta_json(c.modelos, c.pct) as piezas) j
    cross join lateral (
      select sum((p ->> 'precio_lista_usd')::numeric * (p ->> 'cantidad')::integer) as lista,
             sum((p ->> 'precio_oferta_usd')::numeric * (p ->> 'cantidad')::integer) as oferta
        from jsonb_array_elements(j.piezas) p) t;

  if v_tope is null then
    v_regalo := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(x.e order by x.n), '[]'::jsonb)
      into v_regalo
      from jsonb_array_elements(v_combos) with ordinality as x(e, n)
     where (x.e ->> 'total_oferta_usd')::numeric <= v_tope;
  end if;

  select jsonb_build_object(
           'pct', v_sel_pct,
           'piezas', coalesce(jsonb_agg(pieza_oferta(m.id, 1, v_sel_pct)
                                        order by m.categoria, m.nombre, m.variante nulls first, m.id), '[]'::jsonb))
    into v_sel
    from seleccion_ensenada() s(id)
    join modelos m on m.id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'nombre', o.nombre, 'texto', o.texto, 'foto', o.foto,
           'pct', o.pct, 'hasta', o.hasta,
           'total_lista_usd', t.lista, 'total_oferta_usd', t.oferta,
           'piezas', j.piezas) order by c.n), '[]'::jsonb)
    into v_casa
    from casas_vigentes() with ordinality as c(oferta_id, pct, modelos, n)
    join ofertas_casa o on o.id = c.oferta_id
    cross join lateral (select piezas_oferta_json(c.modelos, c.pct) as piezas) j
    cross join lateral (
      select sum((p ->> 'precio_lista_usd')::numeric * (p ->> 'cantidad')::integer) as lista,
             sum((p ->> 'precio_oferta_usd')::numeric * (p ->> 'cantidad')::integer) as oferta
        from jsonb_array_elements(j.piezas) p) t;

  select coalesce(jsonb_agg(distinct q.id order by q.id), '[]'::jsonb)
    into v_en
    from (select (p ->> 'modelo_id')::bigint as id
            from jsonb_array_elements(v_combos) c, jsonb_array_elements(c -> 'piezas') p
          union all
          select (p ->> 'modelo_id')::bigint
            from jsonb_array_elements(v_sel -> 'piezas') p
          union all
          select (p ->> 'modelo_id')::bigint
            from jsonb_array_elements(v_casa) c, jsonb_array_elements(c -> 'piezas') p) q;

  return jsonb_build_object(
    'encendidas',      true,
    'pareja_pct',      cifra_oferta('oferta_pareja_pct'),
    'mirada_segundos', cifra_oferta('oferta_mirada_segundos'),
    'dias_validez',    cifra_oferta('oferta_dias_validez'),
    'combos',          v_combos,
    'regalo',          v_regalo,
    'seleccion',       v_sel,
    'casa',            v_casa,
    'en_oferta',       v_en);
end;
$fn$;

revoke all on function ofertas_publicas() from public, anon, authenticated;
grant execute on function ofertas_publicas() to anon, authenticated;


-- Dar un código. Sin sesión: la clienta lo gana en la landing.
--   dos_vistas, complemento, escote  las piezas las dice el navegador (2 a
--                                    4, distintas); el % es oferta_pareja_pct.
--   combo, regalo                    p_ref es un combo de esta semana que
--                                    se enseña hoy (regalo: con su total
--                                    dentro del tope); piezas y % de la base.
--   casa                             p_ref es una oferta de la casa de hoy.
--   seleccion                        una pieza de las que la selección
--                                    enseña hoy (`seleccion_ensenada`).
--   estuche                          la base elige al azar un combo o una
--                                    pieza de la selección; uno al día.
-- Lo que diga el navegador en p_modelos para combo, regalo, casa y estuche
-- no cuenta. Si el mismo visitante pide otra vez la misma oferta con las
-- mismas piezas y su código sigue sirviendo, recibe ese. Tope:
-- `oferta_codigos_dia_max` códigos por visitante y día. Cualquiera puede
-- llamarla desde la consola: la clase "las elige la clienta" es, en
-- efecto, una promoción pública de "2 a 4 piezas, 5 %", y es lo que el
-- dueño aceptó (spec, "Las formas de ganarlo").
create or replace function emitir_oferta(p_origen text, p_modelos bigint[], p_ref bigint, p_visitante uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_origen    text    := lower(btrim(coalesce(p_origen, '')));
  v_hoy       date    := (now() at time zone 'America/Caracas')::date;
  v_desde_hoy timestamptz;
  v_dias      numeric := cifra_oferta('oferta_dias_validez');
  v_tope_dia  numeric := cifra_oferta('oferta_codigos_dia_max');
  v_pct       numeric;
  v_modelos   bigint[];
  v_ref       bigint;
  v_error     text;
  v_id        bigint;
  v_total     numeric;
  v_lista     jsonb;
  v_sel       bigint[];
  v_elegido   jsonb;
begin
  v_desde_hoy := v_hoy::timestamp at time zone 'America/Caracas';

  if not ofertas_abiertas() then
    raise exception 'Las ofertas no están disponibles en este momento.';
  end if;
  if p_visitante is null then
    raise exception 'No pudimos darte el código. Recarga la página e intenta otra vez.';
  end if;
  if v_origen not in ('dos_vistas', 'complemento', 'escote', 'combo', 'estuche', 'regalo', 'seleccion', 'casa') then
    raise exception 'Esa oferta no existe.';
  end if;

  -- Un visitante a la vez: dos toques seguidos no le dan dos códigos ni se
  -- saltan el tope del día.
  perform pg_advisory_xact_lock(hashtext('oferta:' || p_visitante::text));

  if v_origen in ('dos_vistas', 'complemento', 'escote') then
    v_pct := cifra_oferta('oferta_pareja_pct');
    if v_pct is null or (v_origen = 'dos_vistas' and cifra_oferta('oferta_mirada_segundos') is null) then
      raise exception 'Esta oferta no está disponible en este momento.';
    end if;
    if p_modelos is null
       or array_position(p_modelos, null) is not null
       or cardinality(p_modelos) not between 2 and 4
       or (select count(distinct x) from unnest(p_modelos) x) <> cardinality(p_modelos) then
      raise exception 'Esta oferta es para 2 a 4 piezas distintas.';
    end if;
    v_modelos := p_modelos;

  elsif v_origen in ('combo', 'regalo') then
    select c.pct, c.modelos into v_pct, v_modelos from combos_vigentes() c where c.combo_id = p_ref;
    if not found then
      raise exception 'Ese combo ya no está disponible: mira los de esta semana.';
    end if;
    v_ref := p_ref;

  elsif v_origen = 'casa' then
    select c.pct, c.modelos into v_pct, v_modelos from casas_vigentes() c where c.oferta_id = p_ref;
    if not found then
      raise exception 'Esa oferta ya terminó o ya no está disponible.';
    end if;
    v_ref := p_ref;

  elsif v_origen = 'seleccion' then
    v_pct := cifra_oferta('seleccion_pct');
    if p_modelos is null or cardinality(p_modelos) <> 1 or p_modelos[1] is null
       or not exists (select 1 from seleccion_ensenada() s(id) where s.id = p_modelos[1]) then
      raise exception 'Esa pieza no está en la selección de hoy.';
    end if;
    v_modelos := p_modelos;

  else
    -- El estuche: uno al día por visitante. Si ya lo abrió hoy y su código
    -- sigue sirviendo, ese; si ya lo usó, mañana otro.
    select c.id into v_id
      from ofertas_codigos c
     where c.visitante = p_visitante and c.origen = 'estuche' and c.emitido_en >= v_desde_hoy
     order by c.id desc
     limit 1;
    if v_id is not null then
      if estado_codigo(v_id) = 'emitido' then
        return codigo_json(v_id);
      end if;
      raise exception 'Ya abriste tu estuche hoy. Vuelve mañana por otro.';
    end if;

    -- Al azar: mitad y mitad entre un combo y una pieza de la selección que
    -- se enseña hoy (si hay de los dos), y después uno de ellos.
    select jsonb_agg(jsonb_build_object('id', c.combo_id, 'pct', c.pct, 'modelos', to_jsonb(c.modelos)))
      into v_lista
      from combos_vigentes() c;
    v_sel := array(select s.id from seleccion_ensenada() s(id));
    if v_lista is null and cardinality(v_sel) = 0 then
      raise exception 'Hoy el estuche está vacío. Vuelve mañana.';
    end if;
    if v_lista is not null and (cardinality(v_sel) = 0 or random() < 0.5) then
      v_elegido := v_lista -> floor(random() * jsonb_array_length(v_lista))::integer;
      v_ref     := (v_elegido ->> 'id')::bigint;
      v_pct     := (v_elegido ->> 'pct')::numeric;
      v_modelos := array(select x::bigint from jsonb_array_elements_text(v_elegido -> 'modelos') x);
    else
      v_ref     := null;
      v_pct     := cifra_oferta('seleccion_pct');
      v_modelos := array[v_sel[1 + floor(random() * cardinality(v_sel))::integer]];
    end if;
  end if;

  -- Cada pieza: activa, con precio, libre, aguanta el porcentaje, y cada
  -- dije con su base.
  v_error := piezas_que_fallan(v_modelos, v_pct);
  if v_error is not null then
    raise exception '%', v_error;
  end if;

  if v_origen = 'regalo' then
    select sum(precio_oferta_con(p.lista, v_pct)) into v_total from pisos_oferta(v_modelos) p;
    if cifra_oferta('regalo_tope_usd') is null or v_total > cifra_oferta('regalo_tope_usd') then
      raise exception 'Ese combo no está en Para regalar.';
    end if;
  end if;

  -- La misma oferta otra vez: el mismo código, si sigue sirviendo.
  if v_origen <> 'estuche' then
    select c.id into v_id
      from ofertas_codigos c
     where c.visitante = p_visitante
       and c.origen = v_origen
       and c.ref_id is not distinct from v_ref
       and c.pct = v_pct
       and (select array_agg(i.modelo_id order by i.modelo_id) from ofertas_codigo_items i where i.codigo_id = c.id)
           = (select array_agg(x order by x) from unnest(v_modelos) x)
       and estado_codigo(c.id) = 'emitido'
     order by c.id desc
     limit 1;
    if v_id is not null then
      return codigo_json(v_id);
    end if;
  end if;

  -- El tope del día por visitante, y un freno técnico para todos (como el
  -- de las visitas): nadie llena la tabla cambiando de número.
  if (select count(*) from ofertas_codigos c
       where c.visitante = p_visitante and c.emitido_en >= v_desde_hoy) >= v_tope_dia then
    raise exception 'Hoy ya pediste muchos códigos en este teléfono. Los que tienes siguen sirviendo; mañana puedes pedir más.';
  end if;
  if (select count(*) from ofertas_codigos c where c.emitido_en >= v_desde_hoy) >= 20000 then
    raise exception 'Hoy no podemos dar más códigos. Escríbenos por WhatsApp y te ayudamos.';
  end if;

  insert into ofertas_codigos (codigo, origen, ref_id, pct, visitante, vence_en)
  values (codigo_oferta_nuevo(), v_origen, v_ref, v_pct, p_visitante,
          now() + v_dias::double precision * interval '1 day')
  returning id into v_id;

  insert into ofertas_codigo_items (codigo_id, modelo_id, cantidad, orden, precio_lista_usd, precio_oferta_usd)
  select v_id, x.id, 1, x.n, p.lista, precio_oferta_con(p.lista, v_pct)
    from unnest(v_modelos) with ordinality as x(id, n)
    join pisos_oferta(v_modelos) p on p.modelo_id = x.id;

  return codigo_json(v_id);
end;
$fn$;

revoke all on function emitir_oferta(text, bigint[], bigint, uuid) from public, anon, authenticated;
grant execute on function emitir_oferta(text, bigint[], bigint, uuid) to anon, authenticated;


-- Revisar un código en la tienda (la pantalla "Código"): su estado dicho
-- para la vendedora y sus piezas con los dos precios en bolívares a la
-- tasa de hoy y dónde hay libres.
--   sirve                el código vale y todas sus piezas están libres;
--   pieza_no_disponible  vale, pero una pieza ya no está (`disponible`
--                        false dice cuál);
--   usado                lo usó una venta, o lo tiene un pedido (con
--                        `reserva_id`);
--   vencido, anulado, no_existe.
-- El precio de oferta es el que cobrará la venta: la etiqueta con el
-- descuento y, si el costo subió desde que se dio, el piso. Ni el piso ni
-- el costo salen como cifra aparte.
create or replace function ver_oferta(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_codigo text := normalizar_codigo(p_codigo);
  v_c      ofertas_codigos%rowtype;
  v_estado text;
  v_tasa   numeric;
  v_piezas jsonb;
  v_todas  boolean;
begin
  if not es_personal() then
    raise exception 'Solo la tienda revisa un código.';
  end if;

  if v_codigo is not null then
    select * into v_c from ofertas_codigos c where c.codigo = v_codigo;
  end if;
  if v_c.id is null then
    return jsonb_build_object(
      'codigo', coalesce(v_codigo, nullif(btrim(coalesce(p_codigo, '')), '')),
      'estado', 'no_existe', 'origen', null, 'pct', null, 'vence_en', null,
      'usado_en', null, 'venta_id', null, 'reserva_id', null, 'piezas', '[]'::jsonb);
  end if;

  v_estado := estado_codigo(v_c.id);
  select t.tasa_bcv into v_tasa from tasas t where t.vigente limit 1;

  select jsonb_agg(pieza_oferta(i.modelo_id, i.cantidad, v_c.pct) || jsonb_build_object(
           'precio_oferta_usd', x.oferta,
           'precio_lista_bs',   round(x.lista * v_tasa, 2),
           'precio_oferta_bs',  round(x.oferta * v_tasa, 2),
           'libre',             x.libre,
           'disponible',        x.disponible,
           'ubicaciones',       coalesce((
              select jsonb_agg(jsonb_build_object('ubicacion_id', el.ubicacion_id, 'nombre', u.nombre,
                                                  'libre', el.libre) order by u.orden, u.id)
                from v_existencia_libre el
                join ubicaciones u on u.id = el.ubicacion_id
               where el.modelo_id = i.modelo_id and el.libre > 0), '[]'::jsonb))
           order by i.orden),
         bool_and(x.disponible)
    into v_piezas, v_todas
    from ofertas_codigo_items i
    join modelos m on m.id = i.modelo_id
    left join grupos_precio g on g.id = m.grupo_precio_id
    cross join lateral (select coalesce(m.precio_override_usd, g.precio_usd)::numeric(12,4) as lista,
                               (coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0)
                                - apartadas_de(m.id))::integer as libre) b
    cross join lateral (select b.lista, b.libre,
                               case when m.activo and b.lista is not null
                                    then greatest(precio_oferta_con(b.lista, v_c.pct), coalesce(piso_margen_de(m.id), 0))
                               end as oferta,
                               (m.activo and b.lista is not null and b.libre >= i.cantidad) as disponible) x
   where i.codigo_id = v_c.id;

  if v_estado = 'emitido' then
    v_estado := case when coalesce(v_todas, false) then 'sirve' else 'pieza_no_disponible' end;
  elsif v_estado = 'tomado' then
    v_estado := 'usado';
  end if;

  return jsonb_build_object(
    'codigo',         v_c.codigo,
    'estado',         v_estado,
    'origen',         v_c.origen,
    'pct',            v_c.pct,
    'vence_en',       v_c.vence_en,
    'usado_en',       v_c.usado_en,
    'venta_id',       v_c.venta_id,
    'reserva_id',     v_c.reserva_id,
    'anulado_en',     v_c.anulado_en,
    'anulado_motivo', v_c.anulado_motivo,
    'piezas',         coalesce(v_piezas, '[]'::jsonb));
end;
$fn$;

revoke all on function ver_oferta(text) from public, anon, authenticated;
grant execute on function ver_oferta(text) to authenticated;


-- LO DEL ADMINISTRADOR

-- Crear o cambiar una oferta de la casa. Sin `p_id`, una nueva. Las piezas
-- se cambian todas de una vez (las de `p_modelos`, en ese orden). Mientras
-- la oferta sigue viva, rechaza las piezas retiradas, sin precio, en
-- camino, un dije sin su base y las que no aguantan el porcentaje,
-- diciendo cuáles. Al terminarla (`p_activa` false o `p_hasta` ya
-- pasado) esas revisiones se saltan, para que siempre se pueda terminar,
-- aunque una pieza se haya retirado después. Una pieza sin existencia hoy
-- sí se guarda: la oferta no sale mientras le falte una.
-- El porcentaje se guarda con dos decimales (la columna), y con esos dos
-- se revisa: lo que se comprueba es lo que se cobra.
create or replace function admin_guardar_oferta_casa(
  p_id      bigint,
  p_nombre  text,
  p_texto   text,
  p_foto    text,
  p_pct     numeric,
  p_desde   date,
  p_hasta   date,
  p_modelos bigint[],
  p_activa  boolean
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_nombre text    := nullif(btrim(coalesce(p_nombre, '')), '');
  v_texto  text    := nullif(btrim(coalesce(p_texto, '')), '');
  v_foto   text    := nullif(btrim(coalesce(p_foto, '')), '');
  v_hoy    date    := (now() at time zone 'America/Caracas')::date;
  v_desde  date;
  v_activa boolean := coalesce(p_activa, true);
  v_pct    numeric := round(p_pct, 2);
  v_ids    bigint[];
  v_malas  text;
  v_id     bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador crea las ofertas de la casa.';
  end if;
  v_desde := coalesce(p_desde, v_hoy);

  if v_nombre is null then
    raise exception 'Ponle un nombre a la oferta.';
  end if;
  if v_pct is null or v_pct <= 0 or v_pct >= 100 then
    raise exception 'El descuento va entre 0 y 100 %%.';
  end if;
  if p_hasta is null then
    raise exception 'Dile hasta qué día va la oferta.';
  end if;
  if p_hasta < v_desde then
    raise exception 'La oferta termina antes de empezar: revisa las fechas.';
  end if;
  if v_foto is not null and not landing_ruta_valida(v_foto) then
    raise exception '"%" no es una foto de la tienda: súbela desde el panel.', left(v_foto, 80);
  end if;

  select array_agg(t.x order by t.n) into v_ids
    from (select u.x, min(u.n) as n
            from unnest(coalesce(p_modelos, '{}'::bigint[])) with ordinality as u(x, n)
           where u.x is not null
           group by u.x) t;
  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'Elige al menos una pieza.';
  end if;
  if cardinality(v_ids) > 40 then
    raise exception 'Son demasiadas piezas para una oferta: hasta 40.';
  end if;

  -- Una pieza que no existe no se puede guardar ni para terminar (la
  -- tabla no la acepta). Las borradas ya salieron solas de la oferta.
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from modelos m where m.id = x)) then
    raise exception 'Una de las piezas ya no existe: recarga la pantalla.';
  end if;

  -- Solo si la oferta sigue viva: al terminarla no se revisa nada de las
  -- piezas (una retirada después no impide terminar).
  if v_activa and p_hasta >= v_hoy then
    select string_agg(format('"%s"', m.nombre), ', ' order by u.n) into v_malas
      from unnest(v_ids) with ordinality as u(x, n)
      join modelos m on m.id = u.x
      left join grupos_precio g on g.id = m.grupo_precio_id
     where not m.activo or coalesce(m.precio_override_usd, g.precio_usd) is null;
    if v_malas is not null then
      raise exception 'Estas piezas están retiradas o no tienen precio: %.', v_malas;
    end if;
    select string_agg(format('"%s"', p.nombre), ', ' order by u.n) into v_malas
      from unnest(v_ids) with ordinality as u(x, n)
      join pisos_oferta(v_ids) p on p.modelo_id = u.x
     where p.en_camino;
    if v_malas is not null then
      raise exception 'Estas piezas todavía no han llegado y no entran en una oferta: %.', v_malas;
    end if;
    if (select count(*) filter (where m.armado = 'dije') > count(*) filter (where m.armado = 'base')
          from modelos m where m.id = any (v_ids)) then
      raise exception 'Cada dije de la oferta va con su cadena o su pulsera: agrega una base por cada dije.';
    end if;
    select string_agg(format('"%s"', p.nombre), ', ' order by u.n) into v_malas
      from unnest(v_ids) with ordinality as u(x, n)
      join pisos_oferta(v_ids) p on p.modelo_id = u.x
     where precio_oferta_con(p.lista, v_pct) < p.piso;
    if v_malas is not null then
      raise exception 'Con el % %% estas piezas bajarían de su mínimo: %. Quítalas o baja el descuento.',
        trim_scale(v_pct), v_malas;
    end if;
  end if;

  if p_id is null then
    insert into ofertas_casa (nombre, texto, foto, pct, desde, hasta, activa, actualizado_por)
    values (v_nombre, v_texto, v_foto, v_pct, v_desde, p_hasta, v_activa, auth.uid())
    returning id into v_id;
  else
    update ofertas_casa
       set nombre          = v_nombre,
           texto           = v_texto,
           foto            = v_foto,
           pct             = v_pct,
           desde           = v_desde,
           hasta           = p_hasta,
           activa          = v_activa,
           actualizado_en  = now(),
           actualizado_por = auth.uid()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Esa oferta ya no existe: recarga la pantalla.';
    end if;
    delete from oferta_casa_items where oferta_id = v_id;
  end if;

  insert into oferta_casa_items (oferta_id, modelo_id, orden)
  select v_id, u.x, u.n from unnest(v_ids) with ordinality as u(x, n);

  return v_id;
end;
$fn$;

revoke all on function admin_guardar_oferta_casa(bigint, text, text, text, numeric, date, date, bigint[], boolean)
  from public, anon, authenticated;
grant execute on function admin_guardar_oferta_casa(bigint, text, text, text, numeric, date, date, bigint[], boolean)
  to authenticated;


-- Meter o sacar una pieza de la Selección de la casa a mano, o devolverla
-- a la regla de los días ('auto').
create or replace function admin_seleccion(p_modelo_id bigint, p_accion text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_accion text := lower(btrim(coalesce(p_accion, '')));
  v_m      modelos%rowtype;
  v_pct    numeric := cifra_oferta('seleccion_pct');
begin
  if not es_admin() then
    raise exception 'Solo un administrador cambia la selección.';
  end if;
  if v_accion not in ('meter', 'sacar', 'auto') then
    raise exception 'Esa acción no existe: meter, sacar o auto.';
  end if;
  select * into v_m from modelos where id = p_modelo_id;
  if v_m.id is null then
    raise exception 'Esa pieza ya no existe: recarga la pantalla.';
  end if;

  if v_accion = 'auto' then
    delete from seleccion_manual where modelo_id = p_modelo_id;
    return;
  end if;

  if v_accion = 'meter' then
    if not v_m.activo then
      raise exception '"%" está retirada.', v_m.nombre;
    end if;
    if v_m.armado = 'dije' then
      raise exception '"%" es un dije: los dijes no van solos en la selección.', v_m.nombre;
    end if;
    if exists (select 1 from lotes l where l.id = v_m.lote_id and l.en_camino) then
      raise exception '"%" todavía no ha llegado.', v_m.nombre;
    end if;
    if v_pct is not null and not aguanta_oferta(p_modelo_id, v_pct) then
      raise exception '"%" no aguanta el % %%: con ese descuento bajaría de su mínimo.', v_m.nombre, trim_scale(v_pct);
    end if;
  end if;

  insert into seleccion_manual (modelo_id, accion, cambiado_por)
  values (p_modelo_id, v_accion, auth.uid())
  on conflict (modelo_id) do update
     set accion       = excluded.accion,
         cambiado_en  = now(),
         cambiado_por = excluded.cambiado_por;
end;
$fn$;

revoke all on function admin_seleccion(bigint, text) from public, anon, authenticated;
grant execute on function admin_seleccion(bigint, text) to authenticated;


-- Rearmar los combos de la semana. "Qué combina con qué" vive en
-- `lib/combinar.ts` y no se copia aquí: el navegador del administrador
-- los arma y los manda (`[[modelo_id, ...], ...]`). La base comprueba cada
-- uno y le pone el porcentaje por el número de piezas: 2 → oferta_min_pct,
-- 4 → oferta_max_pct, 3 → el punto medio redondeado (5 y 10 → 8). Los que
-- no pasan vuelven en `descartados` con su motivo. Los de antes dejan de
-- enseñarse; sus códigos ya dados se respetan.
create or replace function admin_rearmar_combos(p_combos jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_min       numeric := cifra_oferta('oferta_min_pct');
  v_max       numeric := cifra_oferta('oferta_max_pct');
  v_semana    date    := date_trunc('week', (now() at time zone 'America/Caracas')::date)::date;
  v_rearmado  bigint;
  v_combo     jsonb;
  v_n         integer;
  v_ids       bigint[];
  v_pct       numeric;
  v_clave     text;
  v_vistos    text[]  := '{}';
  v_motivo    text;
  v_combo_id  bigint;
  v_guardados integer := 0;
  v_desc      jsonb   := '[]'::jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador arma los combos.';
  end if;
  if v_min is null or v_max is null then
    raise exception 'Faltan los porcentajes de los combos (el de 2 piezas y el de 4): escríbelos en Ofertas y vuelve a armarlos.';
  end if;
  if p_combos is null or jsonb_typeof(p_combos) <> 'array' then
    raise exception 'Los combos no se entienden. Recarga la pantalla y vuelve a armarlos.';
  end if;
  if jsonb_array_length(p_combos) > 30 then
    raise exception 'Son demasiados combos de una vez: hasta 30.';
  end if;

  perform pg_advisory_xact_lock(hashtext('combos_semana'));

  insert into combos_rearmados (armado_por) values (auth.uid()) returning id into v_rearmado;

  for v_combo, v_n in
    select e.x, e.n::integer from jsonb_array_elements(p_combos) with ordinality as e(x, n)
  loop
    v_ids    := null;
    v_motivo := null;

    if jsonb_typeof(v_combo) <> 'array' then
      v_motivo := 'No se entiende: un combo es una lista de piezas.';
    elsif exists (select 1 from jsonb_array_elements(v_combo) y
                   where jsonb_typeof(y) <> 'number' or (y #>> '{}') !~ '^[0-9]{1,15}$') then
      v_motivo := 'No se entiende: un combo es una lista de piezas.';
    else
      select array_agg((z.y #>> '{}')::bigint order by z.k) into v_ids
        from jsonb_array_elements(v_combo) with ordinality as z(y, k);
      if coalesce(cardinality(v_ids), 0) not between 2 and 4 then
        v_motivo := 'Un combo lleva de 2 a 4 piezas.';
      elsif (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
        v_motivo := 'Tiene una pieza repetida.';
      end if;
    end if;

    if v_motivo is null then
      v_pct := case cardinality(v_ids)
                 when 2 then v_min
                 when 4 then v_max
                 else round((v_min + v_max) / 2)
               end;
      v_clave := (select string_agg(x::text, ',' order by x) from unnest(v_ids) x);
      if v_clave = any (v_vistos) then
        v_motivo := 'Repetido: las mismas piezas ya van en otro combo.';
      end if;
    end if;

    if v_motivo is null then
      v_motivo := piezas_que_fallan(v_ids, v_pct, true);
    end if;

    if v_motivo is not null then
      v_desc := v_desc || jsonb_build_array(jsonb_build_object(
        'piezas', coalesce(to_jsonb(v_ids), v_combo), 'motivo', v_motivo));
      continue;
    end if;

    v_vistos := v_vistos || v_clave;
    insert into combos_semana (rearmado_id, semana, orden, pct, piezas)
    values (v_rearmado, v_semana, v_n, v_pct, cardinality(v_ids))
    returning id into v_combo_id;
    insert into combo_semana_items (combo_id, modelo_id, orden)
    select v_combo_id, u.x, u.k from unnest(v_ids) with ordinality as u(x, k);
    v_guardados := v_guardados + 1;
  end loop;

  update combos_rearmados
     set guardados = v_guardados, descartados = jsonb_array_length(v_desc)
   where id = v_rearmado;

  return jsonb_build_object('guardados', v_guardados, 'descartados', v_desc);
end;
$fn$;

revoke all on function admin_rearmar_combos(jsonb) from public, anon, authenticated;
grant execute on function admin_rearmar_combos(jsonb) to authenticated;


-- Anular un código (un error de precio, un abuso). Solo uno que todavía
-- sirve: uno usado, tomado por un pedido vivo o vencido no cambia (0). Un
-- código que no existe es un error, para que el panel lo diga.
create or replace function admin_anular_codigo(p_codigo text, p_motivo text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador anula un código.';
  end if;
  select c.id into v_id from ofertas_codigos c where c.codigo = normalizar_codigo(p_codigo) for update;
  if v_id is null then
    raise exception 'Ese código no existe: revisa las letras.';
  end if;
  if estado_codigo(v_id) <> 'emitido' then
    return 0;
  end if;
  update ofertas_codigos
     set estado         = 'anulado',
         anulado_en     = now(),
         anulado_por    = auth.uid(),
         anulado_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = v_id;
  return 1;
end;
$fn$;

-- Anular de una vez los códigos que todavía sirven de un combo (los de
-- combo, para regalar y el estuche que salió de él) o de una oferta de la
-- casa. Devuelve cuántos.
create or replace function admin_anular_codigos_de(p_origen text, p_ref bigint, p_motivo text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_origen   text := lower(btrim(coalesce(p_origen, '')));
  v_origenes text[];
  v_n        integer;
begin
  if not es_admin() then
    raise exception 'Solo un administrador anula códigos.';
  end if;
  v_origenes := case
                  when v_origen in ('combo', 'regalo') then array['combo', 'regalo', 'estuche']
                  when v_origen = 'casa' then array['casa']
                end;
  if v_origenes is null or p_ref is null then
    raise exception 'Se anulan de una vez los códigos de un combo o de una oferta de la casa.';
  end if;

  update ofertas_codigos c
     set estado         = 'anulado',
         anulado_en     = now(),
         anulado_por    = auth.uid(),
         anulado_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where c.origen = any (v_origenes)
     and c.ref_id = p_ref
     and estado_codigo(c.id) = 'emitido';
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function admin_anular_codigo(text, text)               from public, anon, authenticated;
revoke all on function admin_anular_codigos_de(text, bigint, text)   from public, anon, authenticated;
grant execute on function admin_anular_codigo(text, text)             to authenticated;
grant execute on function admin_anular_codigos_de(text, bigint, text) to authenticated;


-- Las diez cifras para el panel (null las vacías) y cuándo se armaron los
-- combos por última vez (null si nunca), para rearmarlos al abrir el
-- panel o el Inventario si tienen más de siete días.
create or replace function admin_cifras_ofertas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'Solo un administrador ve las cifras de las ofertas.';
  end if;
  return (select jsonb_object_agg(k, cifra_oferta(k)) from unnest(claves_ofertas()) k)
         || jsonb_build_object('combos_armados_en', (select max(r.armado_en) from combos_rearmados r));
end;
$fn$;

-- Guardar una de las diez cifras (null la deja vacía: la oferta que
-- depende de ella deja de salir). Cada una con su regla: los porcentajes
-- entre 0 y 100, los días, los segundos y el tope en enteros, el
-- interruptor 0 o 1, y el mínimo de los combos nunca por encima del
-- máximo. Ninguna otra clave de `configuracion` se toca por aquí.
create or replace function admin_guardar_cifra_oferta(p_clave text, p_valor numeric)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_clave text := btrim(coalesce(p_clave, ''));
begin
  if not es_admin() then
    raise exception 'Solo un administrador cambia las cifras de las ofertas.';
  end if;
  if not (v_clave = any (claves_ofertas())) then
    raise exception 'Esa cifra no es de las ofertas.';
  end if;

  -- Un porcentaje se guarda con dos decimales, los que se usan.
  if right(v_clave, 4) = '_pct' then
    p_valor := round(p_valor, 2);
  end if;

  if p_valor is not null then
    if v_clave in ('oferta_pareja_pct', 'oferta_min_pct', 'oferta_max_pct', 'seleccion_pct')
       and (p_valor <= 0 or p_valor >= 100) then
      raise exception 'Un descuento va entre 0 y 100 %%.';
    end if;
    if v_clave in ('seleccion_dias_sin_venta', 'oferta_mirada_segundos', 'oferta_dias_validez')
       and (p_valor < 1 or p_valor <> trunc(p_valor)) then
      raise exception 'Escribe un número entero de 1 en adelante.';
    end if;
    if v_clave = 'oferta_codigos_dia_max' and (p_valor < 0 or p_valor <> trunc(p_valor)) then
      raise exception 'Escribe un número entero de 0 en adelante.';
    end if;
    if v_clave = 'regalo_tope_usd' and p_valor <= 0 then
      raise exception 'El tope de Para regalar va por encima de cero.';
    end if;
    if v_clave = 'ofertas_encendidas' and p_valor not in (0, 1) then
      raise exception 'Las ofertas van encendidas (1) o apagadas (0).';
    end if;
    if v_clave = 'oferta_min_pct' and p_valor > coalesce(cifra_oferta('oferta_max_pct'), p_valor) then
      raise exception 'El descuento de 2 piezas no puede pasar del de 4 (%).', trim_scale(cifra_oferta('oferta_max_pct'));
    end if;
    if v_clave = 'oferta_max_pct' and p_valor < coalesce(cifra_oferta('oferta_min_pct'), p_valor) then
      raise exception 'El descuento de 4 piezas no puede quedar por debajo del de 2 (%).', trim_scale(cifra_oferta('oferta_min_pct'));
    end if;
  end if;

  update configuracion set valor = p_valor where clave = v_clave;
  if not found then
    insert into configuracion (clave, valor) values (v_clave, p_valor);
  end if;
end;
$fn$;

revoke all on function admin_cifras_ofertas()                      from public, anon, authenticated;
revoke all on function admin_guardar_cifra_oferta(text, numeric)   from public, anon, authenticated;
grant execute on function admin_cifras_ofertas()                    to authenticated;
grant execute on function admin_guardar_cifra_oferta(text, numeric) to authenticated;


-- Los códigos, para el panel: uno por fila, con su estado efectivo y sus
-- piezas en texto. La envoltura calcula el estado con el permiso del
-- dueño (una vista no presta su permiso para ejecutar funciones, y
-- `estado_codigo` está cerrada a todos) y no devuelve nada a quien no es
-- administrador; la vista lo dice otra vez.
create or replace function ofertas_codigos_admin()
returns table (id bigint, codigo text, origen text, ref_id bigint, pct numeric, estado text,
               emitido_en timestamptz, vence_en timestamptz, usado_en timestamptz,
               venta_id bigint, reserva_id bigint, anulado_en timestamptz, anulado_por text,
               anulado_motivo text, roto_en timestamptz, piezas text)
language sql
stable
security definer
set search_path = public
as $fn$
  select c.id, c.codigo, c.origen, c.ref_id, c.pct, estado_codigo(c.id),
         c.emitido_en, c.vence_en, c.usado_en, c.venta_id, c.reserva_id,
         c.anulado_en, p.nombre, c.anulado_motivo, c.roto_en,
         (select string_agg(m.nombre || coalesce(' · ' || m.variante, '')
                            || case when i.cantidad > 1 then ' ×' || i.cantidad else '' end,
                            ' + ' order by i.orden)
            from ofertas_codigo_items i
            join modelos m on m.id = i.modelo_id
           where i.codigo_id = c.id)
    from ofertas_codigos c
    left join perfiles p on p.id = c.anulado_por
   where es_admin()
   order by c.emitido_en desc, c.id desc;
$fn$;

revoke all on function ofertas_codigos_admin() from public, anon, authenticated;
grant execute on function ofertas_codigos_admin() to authenticated;

create or replace view v_ofertas
with (security_invoker = off) as
select o.id, o.codigo, o.origen, o.ref_id, o.pct, o.estado, o.emitido_en, o.vence_en,
       o.usado_en, o.venta_id, o.reserva_id, o.anulado_en, o.anulado_por,
       o.anulado_motivo, o.roto_en, o.piezas
  from ofertas_codigos_admin() o
 where es_admin();

revoke all on v_ofertas from public, anon, authenticated;
grant select on v_ofertas to authenticated;


notify pgrst, 'reload schema';
