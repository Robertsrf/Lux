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
--  §4. EL CÓDIGO EN EL COBRO. `cotizar_pedido`, `crear_reserva`,
--      `registrar_venta` y `apartar_en_tienda` reciben los códigos al
--      final (`p_codigos`). Una regla, `oferta_de_lineas`, dice qué
--      código vale para qué piezas (en el orden en que llegan; cada pieza
--      en un solo código; todas sus piezas en el pedido y libres; el
--      código sin usar, sin vencer y sin anular), y `partes_de_linea`
--      pone el precio: en las piezas del código manda el MAYOR entre el
--      tramo y la oferta (nunca los dos sumados), el precio a mano se
--      ignora, y si la línea pide más unidades de las que cubre el código
--      se parte en dos. Cada línea guarda su código y lo que costaría sin
--      él (`oferta_codigo_id`, `precio_sin_oferta_usd`,
--      `motivo_sin_oferta`; en la venta también `precio_sin_oferta_bs`).
--      Un pedido toma el código y lo suelta si se cancela o vence; una
--      venta lo usa; al entregar un pedido la venta copia sus líneas tal
--      cual y el código queda usado; anular la venta lo devuelve.
--      `venta_items.motivo_rebaja` acepta 'oferta'.
--
-- LAS FIRMAS
-- Lo de §1 a §3 es nuevo: el navegador de hoy no lee nada de eso, y el
-- nuevo funciona sin este archivo (sin `v_landing` dibuja el inicio de
-- siempre). En la §4, cuatro funciones que el navegador YA llama ganan
-- `p_codigos text[] default null` AL FINAL; se borra la firma vieja y se
-- crea la nueva con sus permisos de siempre (como `crear_reserva` con
-- `p_armados` en esquema-dijes.sql). El navegador de hoy no manda
-- códigos, y sin ellos dan lo mismo que antes (`cotizar_pedido` suma a
-- cada línea `oferta_codigo` y `precio_sin_oferta_usd` en null, y
-- `codigos: []`):
--    cotizar_pedido(jsonb, text[])
--    crear_reserva(jsonb, text, text, text, text, text, text, text, text, jsonb, text[])
--    registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text,
--                    boolean, text, numeric, text, text[])
--    apartar_en_tienda(jsonb, jsonb, bigint, text, text, text, text, boolean, text[])
-- Cambian por dentro, con la misma firma y lo mismo sin códigos:
--  - `piso_margen_de` (la misma cuenta) llama ahora a `piso_margen_con`,
--    la cuenta sola, para que las ofertas costeen muchas piezas con las
--    cifras comunes calculadas una vez (como `costo_bcv_con` en el #62).
--    Da lo mismo pieza por pieza.
--  - `configuracion.valor` deja de ser obligatorio solo para las diez
--    claves de las ofertas (lo dice una restricción); las demás siguen
--    sin poder quedar vacías.
--  - `vender_congelado` y `entregar_pedido`: la venta de un pedido copia
--    el código de cada línea, y el código queda usado.
--  - `anular_venta_por_verificar` y `admin_anular_venta`: devuelven los
--    códigos de la venta.
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
--  9. select p.oid::regprocedure from pg_proc p
--      where p.proname in ('cotizar_pedido', 'crear_reserva',
--                          'registrar_venta', 'apartar_en_tienda');
--     -> 4 filas, cada una terminada en `text[]` (una sola firma de cada).
-- 10. select cotizar_pedido('[{"modelo_id": <una pieza con existencia>,
--                           "cantidad": 1}]'::jsonb) -> 'codigos';  -> []
--     y su total, el mismo que daba antes de correrlo.
-- 11. select count(*) from venta_items where oferta_codigo_id is not null;
--     -> 0, hasta la primera venta con código. Con un código de dos
--     piezas de $10 y $8 al 5 %, el total sale 17,10 (9,50 + 7,60).
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
-- sirve: uno usado o vencido no cambia (0). Uno tomado por un pedido que
-- sigue vivo es un error que lo dice: ese pedido ya congeló sus precios
-- con el descuento, y anularlo no se los quitaría; primero se cancela el
-- pedido o se le quitan las piezas. Un código que no existe es un error,
-- para que el panel lo diga.
create or replace function admin_anular_codigo(p_codigo text, p_motivo text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id     bigint;
  v_estado text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador anula un código.';
  end if;
  select c.id into v_id from ofertas_codigos c where c.codigo = normalizar_codigo(p_codigo) for update;
  if v_id is null then
    raise exception 'Ese código no existe: revisa las letras.';
  end if;
  v_estado := estado_codigo(v_id);
  if v_estado = 'tomado' then
    raise exception 'Ese código está en un pedido abierto (#%): cancélalo o quítale sus piezas para anularlo.',
      (select c.reserva_id from ofertas_codigos c where c.id = v_id);
  end if;
  if v_estado <> 'emitido' then
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


-- ---------------------------------------------------------------------
-- §4. EL CÓDIGO EN EL COBRO
-- Un código se usa en cuatro sitios: el total del carrito del catálogo
-- (`cotizar_pedido`), el pedido del catálogo (`crear_reserva`), la venta
-- del mostrador (`registrar_venta`) y el apartado del mostrador
-- (`apartar_en_tienda`). Las cuatro ganan `p_codigos text[] default null`
-- AL FINAL (regla 3: se borra la firma vieja y se crea la nueva con sus
-- permisos de siempre, como `crear_reserva` con `p_armados`); sin códigos
-- dan lo mismo que antes.
--
-- La regla, en un sitio:
--  - `oferta_de_lineas` dice qué código vale para qué piezas: los códigos
--    en el orden en que llegan; uno vale si sirve (ni usado, ni tomado por
--    otro pedido, ni vencido, ni anulado), si todas sus piezas están
--    libres, si todas están en el pedido con al menos sus unidades y si
--    ninguna la tomó ya un código anterior. Si no, dice por qué.
--  - `partes_de_linea` pone el precio de una línea: en las unidades que
--    cubre el código manda el MAYOR entre el tramo y la oferta (nunca los
--    dos sumados), el precio a mano se ignora, y si gana la oferta el
--    motivo es 'oferta'. Si la línea pide más unidades de las que cubre
--    el código, se parte: las cubiertas con oferta, las demás como
--    siempre. Cada parte cubierta guarda su código y lo que costaría con
--    solo el tramo (`precio_sin_oferta_usd`, `motivo_sin_oferta`): lo que
--    necesita quitar o devolver una pieza de un código (la §5).
-- Un pedido TOMA el código (`tomado`, con el pedido); si el pedido se
-- cancela o vence sin entregarse, vuelve a servir solo (`estado_codigo`).
-- Una venta lo USA (`usado`, con la venta). Al entregar un pedido, la
-- venta copia las líneas del pedido tal cual (con su código) y el código
-- pasa a usado con esa venta. Anular la venta lo devuelve.
-- ---------------------------------------------------------------------

-- LAS COLUMNAS
-- Al final de las dos tablas de líneas. En las líneas sin código, nulas.
alter table reserva_items add column if not exists oferta_codigo_id      bigint references ofertas_codigos(id);
alter table reserva_items add column if not exists precio_sin_oferta_usd numeric(12,4);
alter table reserva_items add column if not exists motivo_sin_oferta     text;

alter table venta_items add column if not exists oferta_codigo_id      bigint references ofertas_codigos(id);
alter table venta_items add column if not exists precio_sin_oferta_usd numeric(12,4);
alter table venta_items add column if not exists precio_sin_oferta_bs  numeric(14,2);
alter table venta_items add column if not exists motivo_sin_oferta     text;

create index if not exists reserva_items_oferta_idx on reserva_items (oferta_codigo_id) where oferta_codigo_id is not null;
create index if not exists venta_items_oferta_idx   on venta_items (oferta_codigo_id)   where oferta_codigo_id is not null;

comment on column reserva_items.oferta_codigo_id is
  'El código de oferta que puso el precio de esta línea. Null: sin código.';
comment on column reserva_items.precio_sin_oferta_usd is
  'Lo que la línea costaría con solo el tramo, sin el código (solo en las líneas con código).';
comment on column reserva_items.motivo_sin_oferta is
  'El motivo de rebaja que la línea tendría sin el código: tramo o null.';
comment on column venta_items.oferta_codigo_id is
  'El código de oferta que puso el precio de esta línea. Null: sin código.';
comment on column venta_items.precio_sin_oferta_usd is
  'Lo que la línea costaría con solo el tramo, sin el código (solo en las líneas con código).';
comment on column venta_items.precio_sin_oferta_bs is
  'precio_sin_oferta_usd en bolívares, a la tasa BCV de la venta.';
comment on column venta_items.motivo_sin_oferta is
  'El motivo de rebaja que la línea tendría sin el código: tramo o null.';

-- El motivo que tendría sin el código sale de `precio_de_linea` con solo
-- el tramo: 'tramo' o nada (el precio a mano no cuenta en una línea con
-- código). Se aceptan los de siempre por si la §5 los necesita.
alter table reserva_items drop constraint if exists reserva_items_motivo_sin_oferta_valido;
alter table reserva_items add constraint reserva_items_motivo_sin_oferta_valido
  check (motivo_sin_oferta is null or motivo_sin_oferta in ('regateo', 'tramo', 'revendedor'));
alter table venta_items drop constraint if exists venta_items_motivo_sin_oferta_valido;
alter table venta_items add constraint venta_items_motivo_sin_oferta_valido
  check (motivo_sin_oferta is null or motivo_sin_oferta in ('regateo', 'tramo', 'revendedor'));

-- Por qué salió más barata una línea: los tres de antes y 'oferta'.
-- `v_rebajas` ya lista toda línea por debajo de su etiqueta con su
-- motivo, así que cuenta las de oferta sin cambiar.
alter table venta_items drop constraint if exists venta_items_motivo_rebaja_check;
alter table venta_items add constraint venta_items_motivo_rebaja_check
  check (motivo_rebaja is null or motivo_rebaja in ('regateo', 'tramo', 'revendedor', 'oferta'));


-- LA REGLA: QUÉ CÓDIGO VALE PARA QUÉ PIEZAS
-- Devuelve {por_modelo: {"<modelo_id>": {pct, unidades, codigo_id,
-- codigo}}, codigos: [{codigo, aplica, motivo, pct}]}. `por_modelo` lleva
-- solo las piezas de los códigos que valen (una pieza, un código);
-- `codigos`, uno por código recibido (el mismo dos veces cuenta una), en
-- su orden, con el motivo si no vale: no_existe, usado, vencido, anulado,
-- pieza_no_disponible, faltan_piezas o comparte_pieza.
--   - Lo que pide el pedido se suma por pieza: la misma pieza en dos
--     líneas (o dos ubicaciones) es una.
--   - "Libre" es lo de siempre: lo que hay menos lo que apartan los
--     pedidos. Con `p_reserva_id` (quien re-cuenta un pedido que ya
--     existe), un código tomado por ESE pedido vale, y lo que él aparta
--     cuenta como libre para él.
--   - Ninguna cifra de costo, piso ni margen: `cotizar_pedido` le da
--     `codigos` a cualquiera.
-- Un tope técnico de códigos por llamada, no de negocio: nadie junta
-- veinte en un pedido, y sin tope se podrían probar miles de una vez.
-- En una función para que lo lean igual la regla y `tomar_codigos`.
create or replace function codigos_por_cobro_max()
returns integer
language sql
immutable
set search_path = public
as $fn$
  select 20;
$fn$;

create or replace function oferta_de_lineas(p_items jsonb, p_codigos text[], p_reserva_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_pide    jsonb    := '{}'::jsonb;
  v_tomadas bigint[] := '{}';
  v_vistos  bigint[] := '{}';
  v_por     jsonb    := '{}'::jsonb;
  v_lista   jsonb    := '[]'::jsonb;
  v_vivo    boolean  := false;
  v_txt     text;
  v_cod     text;
  v_c       ofertas_codigos%rowtype;
  v_estado  text;
  v_motivo  text;
begin
  if p_codigos is null or cardinality(p_codigos) = 0 then
    return jsonb_build_object('por_modelo', '{}'::jsonb, 'codigos', '[]'::jsonb);
  end if;
  if cardinality(p_codigos) > codigos_por_cobro_max() then
    raise exception 'Demasiados códigos en un solo pedido.';
  end if;

  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    select coalesce(jsonb_object_agg(q.modelo, q.cant), '{}'::jsonb)
      into v_pide
      from (select (x->>'modelo_id')::bigint as modelo,
                   sum(greatest(coalesce((x->>'cantidad')::int, 0), 0))::int as cant
              from jsonb_array_elements(p_items) x
             where x->>'modelo_id' is not null
             group by 1) q;
  end if;

  if p_reserva_id is not null then
    v_vivo := coalesce(fase_pedido(p_reserva_id) in ('esperando_pago', 'reportado', 'apartado', 'pagado'), false);
  end if;

  foreach v_txt in array p_codigos
  loop
    v_cod := normalizar_codigo(v_txt);
    v_c   := null;
    if v_cod is not null then
      select * into v_c from ofertas_codigos c where c.codigo = v_cod;
    end if;

    if v_c.id is null then
      v_lista := v_lista || jsonb_build_array(jsonb_build_object(
        'codigo', coalesce(v_cod, left(nullif(btrim(coalesce(v_txt, '')), ''), 40)),
        'aplica', false, 'motivo', 'no_existe', 'pct', null));
      continue;
    end if;
    continue when v_c.id = any (v_vistos);
    v_vistos := v_vistos || v_c.id;

    v_estado := estado_codigo(v_c.id);
    if v_estado = 'tomado' and v_vivo and v_c.reserva_id = p_reserva_id then
      v_estado := 'emitido';
    end if;
    v_motivo := case v_estado when 'emitido' then null when 'tomado' then 'usado' else v_estado end;

    if v_motivo is null then
      select case
               when count(*) = 0                    then 'faltan_piezas'
               when bool_or(not x.disponible)       then 'pieza_no_disponible'
               when bool_or(coalesce((v_pide->>i.modelo_id::text)::int, 0) < i.cantidad)
                                                    then 'faltan_piezas'
               when bool_or(i.modelo_id = any (v_tomadas)) then 'comparte_pieza'
             end
        into v_motivo
        from ofertas_codigo_items i
        join modelos m on m.id = i.modelo_id
        left join grupos_precio g on g.id = m.grupo_precio_id
        cross join lateral (
          select m.activo
                 and coalesce(m.precio_override_usd, g.precio_usd) is not null
                 and coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0)
                     - apartadas_de(m.id)
                     + case when v_vivo
                            then coalesce((select sum(ri.cantidad) from reserva_items ri
                                            where ri.reserva_id = p_reserva_id and ri.modelo_id = m.id), 0)
                            else 0 end
                     >= i.cantidad as disponible) x
       where i.codigo_id = v_c.id;
    end if;

    if v_motivo is null then
      select v_por || coalesce(jsonb_object_agg(i.modelo_id::text, jsonb_build_object(
                                 'pct', v_c.pct, 'unidades', i.cantidad,
                                 'codigo_id', v_c.id, 'codigo', v_c.codigo)), '{}'::jsonb),
             v_tomadas || coalesce(array_agg(i.modelo_id), '{}')
        into v_por, v_tomadas
        from ofertas_codigo_items i
       where i.codigo_id = v_c.id;
    end if;

    v_lista := v_lista || jsonb_build_array(jsonb_build_object(
      'codigo', v_c.codigo, 'aplica', v_motivo is null, 'motivo', v_motivo, 'pct', v_c.pct));
  end loop;

  return jsonb_build_object('por_modelo', v_por, 'codigos', v_lista);
end;
$fn$;

-- EL PRECIO DE UNA LÍNEA, CON SU CÓDIGO
-- Una línea (pieza, cuántas, el precio a mano si lo hay, el tramo que le
-- toca) en una o dos partes. `p_oferta` es lo de su pieza en `por_modelo`
-- (null sin código) y `p_ya`, cuántas unidades del código cubrieron ya
-- otras líneas de la misma pieza.
--   orden 1: las unidades que cubre el código, con el mayor entre el tramo
--            y la oferta, sin precio a mano; 'oferta' si la oferta la dejó
--            más barata que el tramo solo.
--            Lleva su código y lo que costaría con solo el tramo.
--   orden 2: las demás, exactamente como sin código (`precio_de_linea`
--            con el tramo y el precio a mano).
-- Los errores de `precio_de_linea` (pieza retirada, sin precio, por
-- debajo del mínimo) salen tal cual.
create or replace function partes_de_linea(
  p_modelo_id bigint,
  p_cantidad  integer,
  p_pedido    numeric,
  p_tramo     numeric,
  p_oferta    jsonb,
  p_ya        integer,
  p_tasa_bcv  numeric
)
returns table (orden integer, cantidad integer, nombre text, precio_lista numeric, precio_usd numeric,
               motivo text, costo numeric, oferta_codigo_id bigint, oferta_codigo text,
               precio_sin_oferta_usd numeric, motivo_sin_oferta text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_pct   numeric := 0;
  v_cubre integer := 0;
  v_tramo numeric := coalesce(p_tramo, 0);
  p       record;
  s       record;
begin
  if p_oferta is not null then
    v_pct   := coalesce((p_oferta->>'pct')::numeric, 0);
    v_cubre := greatest(least(coalesce(p_cantidad, 0),
                              coalesce((p_oferta->>'unidades')::int, 0) - coalesce(p_ya, 0)), 0);
  end if;

  if v_cubre > 0 then
    select * into s from precio_de_linea(p_modelo_id, null, v_tramo, p_tasa_bcv);
    select * into p from precio_de_linea(p_modelo_id, null, greatest(v_tramo, v_pct), p_tasa_bcv);
    orden                 := 1;
    cantidad              := v_cubre;
    nombre                := p.nombre;
    precio_lista          := p.precio_lista;
    precio_usd            := p.precio_usd;
    -- Ganó la oferta si dejó la pieza más barata que el tramo solo (con
    -- los dos en el piso, o empatados, el motivo sigue siendo el tramo).
    motivo                := case when p.motivo is not null and p.precio_usd < s.precio_usd then 'oferta' else p.motivo end;
    costo                 := p.costo;
    oferta_codigo_id      := (p_oferta->>'codigo_id')::bigint;
    oferta_codigo         := p_oferta->>'codigo';
    precio_sin_oferta_usd := s.precio_usd;
    motivo_sin_oferta     := s.motivo;
    return next;
  end if;

  if coalesce(p_cantidad, 0) > v_cubre then
    select * into p from precio_de_linea(p_modelo_id, p_pedido, p_tramo, p_tasa_bcv);
    orden                 := 2;
    cantidad              := p_cantidad - v_cubre;
    nombre                := p.nombre;
    precio_lista          := p.precio_lista;
    precio_usd            := p.precio_usd;
    motivo                := p.motivo;
    costo                 := p.costo;
    oferta_codigo_id      := null;
    oferta_codigo         := null;
    precio_sin_oferta_usd := null;
    motivo_sin_oferta     := null;
    return next;
  end if;
end;
$fn$;

-- Los códigos de un cobro que escribe (pedido, venta, apartado): primero
-- se bloquean, para que dos cobros a la vez no gasten el mismo, y después
-- se mira cuáles valen. Se llama DESPUÉS de los candados de las piezas y
-- antes de tocar la existencia o crear el pedido.
create or replace function tomar_codigos(p_items jsonb, p_codigos text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if p_codigos is not null and cardinality(p_codigos) between 1 and codigos_por_cobro_max() then
    perform 1
       from ofertas_codigos c
      where c.codigo = any (array(select normalizar_codigo(x) from unnest(p_codigos) x))
      order by c.id
        for update;
  end if;
  return oferta_de_lineas(p_items, p_codigos);
end;
$fn$;

-- Los códigos que valieron: un pedido los toma (`p_venta_id` null), una
-- venta los usa.
create or replace function gastar_codigos(p_oferta jsonb, p_reserva_id bigint, p_venta_id bigint)
returns void
language sql
volatile
security definer
set search_path = public
as $fn$
  update ofertas_codigos c
     set estado     = case when p_venta_id is not null then 'usado' else 'tomado' end,
         reserva_id = p_reserva_id,
         venta_id   = p_venta_id,
         usado_en   = now()
   where c.id in (select (e.value->>'codigo_id')::bigint
                    from jsonb_each(coalesce(p_oferta->'por_modelo', '{}'::jsonb)) e);
$fn$;

-- Una venta anulada devuelve sus códigos: vuelven a `emitido` y
-- `estado_codigo` dice si sirven o ya vencieron (vencido, no usado: la
-- venta que los usó ya no cuenta). Uno roto (se quitó o se devolvió una
-- de sus piezas, la §5) no vuelve.
create or replace function soltar_codigos_de_venta(p_venta_id bigint)
returns void
language sql
volatile
security definer
set search_path = public
as $fn$
  update ofertas_codigos c
     set estado     = 'emitido',
         venta_id   = null,
         reserva_id = null,
         usado_en   = null
   where c.venta_id = p_venta_id
     and c.estado = 'usado'
     and c.roto_en is null;
$fn$;

revoke all on function codigos_por_cobro_max()                                                   from public, anon, authenticated;
revoke all on function oferta_de_lineas(jsonb, text[], bigint)                                  from public, anon, authenticated;
revoke all on function partes_de_linea(bigint, integer, numeric, numeric, jsonb, integer, numeric) from public, anon, authenticated;
revoke all on function tomar_codigos(jsonb, text[])                                              from public, anon, authenticated;
revoke all on function gastar_codigos(jsonb, bigint, bigint)                                     from public, anon, authenticated;
revoke all on function soltar_codigos_de_venta(bigint)                                           from public, anon, authenticated;


-- EL TOTAL DEL CARRITO DEL CATÁLOGO
-- La de esquema-dijes.sql con `p_codigos` al final: la misma regla que
-- `crear_reserva`, así lo que dice la barra es lo que el pedido congela.
-- Cada línea dice además su código (`oferta_codigo`, o null) y lo que
-- costaría sin él (`precio_sin_oferta_usd`, o null), y `codigos` dice de
-- cada código si vale y, si no, por qué.
drop function if exists cotizar_pedido(jsonb);

create or replace function cotizar_pedido(p_items jsonb, p_codigos text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_item      jsonb;
  v_modelo    bigint;
  v_cantidad  int;
  v_piezas    int := 0;
  v_desc      numeric(5,2);
  v_tramo     jsonb;
  v_oferta    jsonb;
  v_cubiertas jsonb := '{}'::jsonb;
  v_partes    jsonb;
  v_parte     jsonb;
  v_subtotal  numeric := 0;
  v_total     numeric := 0;
  v_lineas    jsonb := '[]'::jsonb;
  v_sin       jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('piezas', 0, 'descuento_pct', 0, 'subtotal_usd', 0,
                              'total_usd', 0, 'lineas', '[]'::jsonb, 'sin_precio', '[]'::jsonb,
                              'codigos', oferta_de_lineas('[]'::jsonb, p_codigos)->'codigos');
  end if;
  -- Un tope técnico, no de negocio: que nadie la use para recorrer el
  -- catálogo entero de un golpe.
  if jsonb_array_length(p_items) > 300 then
    raise exception 'Demasiadas piezas distintas en un solo pedido.';
  end if;

  -- El tramo, línea por línea (`tramo_de_carrito`), como `crear_reserva`.
  v_tramo  := tramo_de_carrito(p_items);
  v_piezas := (v_tramo->>'piezas')::int;
  v_desc   := (v_tramo->>'descuento_pct')::numeric;

  -- El tope: lo mismo que pediría `crear_reserva`, sumado por pieza (una
  -- pieza repetida en la lista no se cuela dos veces).
  if exists (
    select 1
      from (select (x->>'modelo_id')::bigint as modelo, sum(greatest(coalesce((x->>'cantidad')::int, 0), 0)) as pide
              from jsonb_array_elements(p_items) x
             group by 1) q
     where q.pide > coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = q.modelo), 0)
                    - apartadas_de(q.modelo)
  ) then
    raise exception 'Una de las piezas ya no tiene esa cantidad disponible.';
  end if;

  -- Los códigos: la misma regla que el pedido.
  v_oferta := oferta_de_lineas(p_items, p_codigos);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 0);
    continue when v_modelo is null or v_cantidad <= 0;

    begin
      select coalesce(jsonb_agg(to_jsonb(x) order by x.orden), '[]'::jsonb)
        into v_partes
        from partes_de_linea(v_modelo, v_cantidad, null,
                             coalesce((v_tramo->'por_modelo'->>v_modelo::text)::numeric, 0),
                             v_oferta->'por_modelo'->(v_modelo::text),
                             coalesce((v_cubiertas->>v_modelo::text)::int, 0), null) x;
    exception when others then
      v_sin := v_sin || to_jsonb(v_modelo);
      continue;
    end;

    for v_parte in select e from jsonb_array_elements(v_partes) e
    loop
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_modelo, 'cantidad', (v_parte->>'cantidad')::int,
        'precio_usd', v_parte->'precio_usd', 'precio_lista_usd', v_parte->'precio_lista',
        'motivo', v_parte->>'motivo',
        'oferta_codigo', v_parte->>'oferta_codigo',
        'precio_sin_oferta_usd', v_parte->'precio_sin_oferta_usd'));
      v_subtotal := v_subtotal + (v_parte->>'precio_lista')::numeric * (v_parte->>'cantidad')::int;
      v_total    := v_total + (v_parte->>'precio_usd')::numeric * (v_parte->>'cantidad')::int;
      if v_parte->>'oferta_codigo_id' is not null then
        v_cubiertas := v_cubiertas || jsonb_build_object(v_modelo::text,
          coalesce((v_cubiertas->>v_modelo::text)::int, 0) + (v_parte->>'cantidad')::int);
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'piezas',        v_piezas,
    'descuento_pct', v_desc,
    'subtotal_usd',  round(v_subtotal, 4),
    'total_usd',     round(v_total, 4),
    'lineas',        v_lineas,
    'sin_precio',    v_sin,
    'codigos',       v_oferta->'codigos');
end;
$fn$;

revoke all on function cotizar_pedido(jsonb, text[]) from public;
grant execute on function cotizar_pedido(jsonb, text[]) to anon, authenticated;


-- EL PEDIDO DEL CATÁLOGO
-- La de esquema-dijes.sql con `p_codigos` al final. Todo lo de antes
-- sigue: los mensajes de la clienta, lo libre sumado por pieza, el tope
-- de 300 líneas, el tramo línea por línea, qué dije va en qué base y,
-- por el disparador `reservas_tope_sin_pagar`, el tope de pedidos sin
-- pagar. Los códigos que valen quedan tomados por este pedido; los que
-- no, se ignoran (el pedido se crea sin ese descuento, como lo dijo la
-- barra).
drop function if exists crear_reserva(jsonb, text, text, text, text, text, text, text, text, jsonb);

create or replace function crear_reserva(
  p_items            jsonb,
  p_cliente_nombre   text,
  p_cliente_apellido text,
  p_cliente_cedula   text,
  p_cliente_telefono text,
  p_entrega          text   default 'tienda',
  p_envio_empresa    text   default null,
  p_envio_agencia    text   default null,
  p_envio_direccion  text   default null,
  p_armados          jsonb  default null,
  p_codigos          text[] default null
)
returns uuid
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
  v_piezas     int := 0;
  v_previas    int := 0;
  v_subtotal   numeric(12,4) := 0;
  v_desc       numeric(5,2);
  v_tramo      jsonb;
  v_oferta     jsonb;
  v_cubiertas  jsonb := '{}'::jsonb;
  v_partes     jsonb;
  v_parte      jsonb;
  v_total      numeric(12,4) := 0;
  v_minutos    numeric(12,4);
  v_id         bigint;
  v_token      uuid;
  v_entrega    forma_entrega;
  v_empresa    empresa_envio;
  v_cliente    clientes%rowtype;
  v_cliente_id bigint;
  v_maestro    boolean := false;
  v_lineas     jsonb := '[]'::jsonb;
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

  if v_ced is null then raise exception 'Falta tu cedula.'; end if;
  if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cedula esta incompleta.';
  end if;

  select * into v_cliente
    from clientes
   where cedula_digitos = regexp_replace(v_ced, '[^0-9]', '', 'g');
  if found then
    v_cliente_id := v_cliente.id;
    if v_nom is null then
      v_nom := nullif(btrim(v_cliente.nombre), '');
      v_maestro := v_nom is not null;
    end if;
    if v_ape is null and nullif(btrim(coalesce(v_cliente.apellido, '')), '') is not null then
      v_ape := btrim(v_cliente.apellido);
      v_maestro := true;
    end if;
    if v_tel is null and length(regexp_replace(coalesce(v_cliente.telefono, ''), '[^0-9]', '', 'g')) >= 10 then
      v_tel := btrim(v_cliente.telefono);
      v_maestro := true;
    end if;
  end if;

  if v_nom is null then raise exception 'Falta tu nombre.'; end if;
  if v_ape is null then raise exception 'Falta tu apellido.'; end if;
  if v_tel is null then raise exception 'Falta tu numero de telefono.'; end if;
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

  -- El tope técnico de `cotizar_pedido`, no de negocio.
  if jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 300 then
    raise exception 'Demasiadas piezas distintas en un solo pedido.';
  end if;

  perform limpiar_reservas();

  for v_modelo in
    select distinct (x->>'modelo_id')::bigint from jsonb_array_elements(p_items) x order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  -- El tramo, línea por línea (`tramo_de_carrito`): los dijes no cuentan y
  -- solo lo reciben los que van con una base.
  v_tramo   := tramo_de_carrito(p_items);
  v_previas := (v_tramo->>'piezas')::int;
  v_desc    := (v_tramo->>'descuento_pct')::numeric;

  -- Los códigos, bloqueados, con la regla de `cotizar_pedido`.
  v_oferta := tomar_codigos(p_items, p_codigos);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo   := (v_item->>'modelo_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    -- Con los mensajes de la clienta, antes de pedir el precio.
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
         - apartadas_de(v_modelo)
      into v_disponible;

    if v_cantidad > v_disponible then
      raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, greatest(v_disponible, 0), v_cantidad;
    end if;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.orden), '[]'::jsonb)
      into v_partes
      from partes_de_linea(v_modelo, v_cantidad, null,
                           coalesce((v_tramo->'por_modelo'->>v_modelo::text)::numeric, 0),
                           v_oferta->'por_modelo'->(v_modelo::text),
                           coalesce((v_cubiertas->>v_modelo::text)::int, 0), null) x;

    for v_parte in select e from jsonb_array_elements(v_partes) e
    loop
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_modelo, 'cantidad', (v_parte->>'cantidad')::int,
        'precio_usd', v_parte->'precio_usd', 'precio_lista_usd', v_parte->'precio_lista',
        'motivo', v_parte->>'motivo',
        'oferta_codigo_id', v_parte->'oferta_codigo_id',
        'precio_sin_oferta_usd', v_parte->'precio_sin_oferta_usd',
        'motivo_sin_oferta', v_parte->>'motivo_sin_oferta'));
      v_subtotal := v_subtotal + ((v_parte->>'precio_lista')::numeric * (v_parte->>'cantidad')::int);
      v_total    := v_total + ((v_parte->>'precio_usd')::numeric * (v_parte->>'cantidad')::int);
      if v_parte->>'oferta_codigo_id' is not null then
        v_cubiertas := v_cubiertas || jsonb_build_object(v_modelo::text,
          coalesce((v_cubiertas->>v_modelo::text)::int, 0) + (v_parte->>'cantidad')::int);
      end if;
    end loop;

    v_piezas := v_piezas + v_cantidad;
  end loop;

  -- Lo libre, sumado por pieza: la misma pieza en varias líneas no se
  -- cuela dos veces, ni llega así a un tramo (como `cotizar_pedido`).
  if exists (
    select 1
      from (select (x->>'modelo_id')::bigint as modelo, sum(greatest(coalesce((x->>'cantidad')::int, 0), 0)) as pide
              from jsonb_array_elements(p_items) x
             group by 1) q
     where q.pide > coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = q.modelo), 0)
                    - apartadas_de(q.modelo)
  ) then
    raise exception 'De una de las piezas que elegiste no quedan tantas disponibles.';
  end if;

  v_total := round(v_total, 4);

  select valor into v_minutos from configuracion where clave = 'reserva_minutos';

  insert into reservas (cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
                        entrega, envio_empresa, envio_agencia, envio_direccion,
                        piezas, subtotal_usd, descuento_pct, total_usd, expira_en,
                        cliente_id, datos_del_maestro, origen)
  values (v_nom, v_ape, v_ced, v_tel,
          v_entrega, v_empresa, v_agencia, v_direccion,
          v_piezas, round(v_subtotal, 4), v_desc, v_total,
          now() + (coalesce(v_minutos, 60) || ' minutes')::interval,
          v_cliente_id, v_maestro, 'catalogo')
  returning id, token into v_id, v_token;

  insert into reserva_items (reserva_id, modelo_id, cantidad, precio_usd, precio_lista_usd, motivo_rebaja,
                             oferta_codigo_id, precio_sin_oferta_usd, motivo_sin_oferta)
  select v_id, (x->>'modelo_id')::bigint, (x->>'cantidad')::int,
         (x->>'precio_usd')::numeric, (x->>'precio_lista_usd')::numeric, x->>'motivo',
         (x->>'oferta_codigo_id')::bigint, (x->>'precio_sin_oferta_usd')::numeric, x->>'motivo_sin_oferta'
    from jsonb_array_elements(v_lineas) with ordinality as e(x, n)
   order by e.n;

  -- Qué dije va en qué base, si el navegador lo dice y cuadra.
  perform guardar_armados(v_id, p_armados);

  -- Los códigos que valieron quedan tomados por este pedido.
  perform gastar_codigos(v_oferta, v_id, null);

  return v_token;
end;
$fn$;

revoke all on function crear_reserva(jsonb, text, text, text, text, text, text, text, text, jsonb, text[]) from public;
grant execute on function crear_reserva(jsonb, text, text, text, text, text, text, text, text, jsonb, text[]) to anon, authenticated;


-- LA VENTA DEL MOSTRADOR
-- La de esquema-dijes.sql con `p_codigos` al final. Todo lo de antes
-- sigue (el tramo línea por línea, el regateo y su mínimo, lo apartado
-- que no se vende, lo de fuera del catálogo, los candados por pieza). En
-- las unidades que cubre un código manda el mayor entre el tramo y la
-- oferta, y el precio a mano de esa línea se ignora (como con el tramo);
-- las demás unidades de la línea, como siempre. La existencia baja una
-- vez por línea; la línea partida son dos filas de la misma ubicación.
-- Los códigos que valen quedan usados por esta venta; los que no (uno
-- vencido, uno ya usado), se ignoran y la venta sale a su precio.
drop function if exists registrar_venta(text, text, jsonb, bigint, text, text, text, bigint, text, text, boolean, text, numeric, text);

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
    -- con el código si cubre esta pieza (`partes_de_linea`).
    v_desc := coalesce((v_tramo->'por_modelo'->>v_modelo_id::text)::numeric, 0);
    select coalesce(jsonb_agg(to_jsonb(x) order by x.orden), '[]'::jsonb)
      into v_partes
      from partes_de_linea(v_modelo_id, v_cantidad, v_pedido, v_desc,
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
              (v_parte->>'costo')::numeric, v_operativo, v_parte->>'motivo',
              (v_parte->>'oferta_codigo_id')::bigint, (v_parte->>'precio_sin_oferta_usd')::numeric,
              round((v_parte->>'precio_sin_oferta_usd')::numeric * v_tasa.tasa_bcv, 2),
              v_parte->>'motivo_sin_oferta');

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


-- EL APARTADO DEL MOSTRADOR
-- La de esquema-dijes.sql con `p_codigos` al final, con la misma regla de
-- la venta: en las unidades del código manda el mayor entre el tramo y la
-- oferta y se ignora el precio a mano. Los códigos que valen quedan
-- tomados por el apartado; si se cancela o vence, vuelven a servir; al
-- entregarlo, quedan usados por su venta. Devuelve lo de siempre.
drop function if exists apartar_en_tienda(jsonb, jsonb, bigint, text, text, text, text, boolean);

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

    select coalesce(jsonb_agg(to_jsonb(x) order by x.orden), '[]'::jsonb)
      into v_partes
      from partes_de_linea(v_modelo, v_cantidad, nullif(v_item->>'precio_unitario_usd', '')::numeric,
                           coalesce((v_tramo->'por_modelo'->>v_modelo::text)::numeric, 0),
                           v_oferta->'por_modelo'->(v_modelo::text),
                           coalesce((v_cubiertas->>v_modelo::text)::int, 0), v_tasa.tasa_bcv) x;

    for v_parte in select e from jsonb_array_elements(v_partes) e
    loop
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_modelo, 'cantidad', (v_parte->>'cantidad')::int,
        'precio_usd', v_parte->'precio_usd', 'precio_lista_usd', v_parte->'precio_lista',
        'motivo', v_parte->>'motivo',
        'oferta_codigo_id', v_parte->'oferta_codigo_id',
        'precio_sin_oferta_usd', v_parte->'precio_sin_oferta_usd',
        'motivo_sin_oferta', v_parte->>'motivo_sin_oferta'));
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


-- EL ÚNICO CAMINO DE PEDIDO A VENTA
-- La de esquema-abonos-y-apartados.sql, misma firma. Cada línea de
-- `p_lineas` puede traer además `oferta_codigo_id`,
-- `precio_sin_oferta_usd` y `motivo_sin_oferta` (los de su línea de
-- pedido), y la venta los guarda; lo que no los trae (un pedido de
-- revendedor) los deja en null. Lo sin oferta en bolívares, a la tasa de
-- la venta, como el precio.
create or replace function vender_congelado(
  p_tipo            text,
  p_metodo          metodo_pago,
  p_lineas          jsonb,
  p_cliente_id      bigint,
  p_cliente_nombre  text,
  p_cliente_telefono text,
  p_notas           text,
  p_usuario         uuid,
  p_revendedor_id   bigint,
  p_pago_referencia text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tasa      tasas%rowtype;
  v_venta     bigint;
  v_operativo numeric(12,4);
  v_linea     jsonb;
  v_ex        record;
  v_modelo    bigint;
  v_falta     int;
  v_toma      int;
  v_precio    numeric(12,4);
  v_bs        numeric(14,2);
  v_sin       numeric(12,4);
  v_costo     numeric(12,4);
  v_nombre    text;
  v_total_bs  numeric(14,2) := 0;
begin
  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fíjala en la pantalla de Tasas antes de cobrar.';
  end if;

  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  -- Nace como una venta cobrada, no "por verificar": lo que se verificó fue
  -- cada abono. (`verificada_en` es de las ventas que QUEDARON por verificar:
  -- la ficha de la clienta lo lee como "se comprobó N días después".)
  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      cliente_id, cliente_nombre, cliente_telefono, notas,
                      por_verificar, pago_referencia, pago_parcial, revendedor_id)
  values (p_usuario, p_tipo::tipo_venta, p_metodo, v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_cliente_id, p_cliente_nombre, p_cliente_telefono, p_notas,
          false, nullif(btrim(coalesce(p_pago_referencia, '')), ''), true, p_revendedor_id)
  returning id into v_venta;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_modelo := (v_linea->>'modelo_id')::bigint;
    v_falta  := (v_linea->>'cantidad')::int;
    v_precio := (v_linea->>'precio_usd')::numeric;
    v_bs     := round(v_precio * v_tasa.tasa_bcv, 2);
    v_sin    := nullif(v_linea->>'precio_sin_oferta_usd', '')::numeric;

    select m.costo_puesto_usd, m.nombre || coalesce(' · ' || m.variante, '')
      into v_costo, v_nombre
      from modelos m where m.id = v_modelo;

    perform 1 from existencias where modelo_id = v_modelo for update;

    for v_ex in
      select l.ubicacion_id, l.libre
        from v_existencia_libre l
        join ubicaciones u on u.id = l.ubicacion_id
       where l.modelo_id = v_modelo and l.libre > 0
       order by l.cantidad desc, u.orden, u.id
    loop
      exit when v_falta = 0;
      v_toma := least(v_falta, v_ex.libre);

      update existencias
         set cantidad = cantidad - v_toma, actualizado_en = now()
       where modelo_id = v_modelo and ubicacion_id = v_ex.ubicacion_id and cantidad >= v_toma;
      if not found then
        raise exception 'La existencia de "%" cambió mientras se entregaba. Inténtalo otra vez.', v_nombre;
      end if;

      insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                               precio_unitario_usd, precio_unitario_bs,
                               precio_lista_usd, costo_puesto_usd_snap,
                               costo_operativo_usd_snap, motivo_rebaja,
                               oferta_codigo_id, precio_sin_oferta_usd, precio_sin_oferta_bs, motivo_sin_oferta)
      values (v_venta, v_modelo, v_ex.ubicacion_id, v_toma,
              v_precio, v_bs, (v_linea->>'precio_lista_usd')::numeric, v_costo, v_operativo,
              nullif(v_linea->>'motivo', ''),
              nullif(v_linea->>'oferta_codigo_id', '')::bigint, v_sin, round(v_sin * v_tasa.tasa_bcv, 2),
              nullif(v_linea->>'motivo_sin_oferta', ''));

      v_total_bs := v_total_bs + v_bs * v_toma;
      v_falta    := v_falta - v_toma;
    end loop;

    if v_falta > 0 then
      raise exception 'De "%" faltan % en la tienda para completar la entrega.', v_nombre, v_falta;
    end if;
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta;

  return v_venta;
end;
$fn$;

-- La entrega de un pedido, la de esquema-abonos-y-apartados.sql, misma
-- firma. Las líneas de la venta copian de las del pedido el motivo, el
-- código y lo que costarían sin él; y los códigos que el pedido tenía
-- tomados quedan usados por esta venta.
create or replace function entregar_pedido(
  p_reserva_id bigint,
  p_metodo     text    default null,
  p_monto      numeric default null,
  p_referencia text    default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r          reservas%rowtype;
  v_fase     text;
  v_falta    numeric;
  v_pend     int;
  v_tasa     numeric;
  v_modelo   bigint;
  v_metodo   metodo_pago;
  v_ref      text;
  v_cliente  bigint;
  v_lineas   jsonb;
  v_venta    bigint;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesión.';
  end if;

  select * into r from reservas where id = p_reserva_id for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;

  v_fase := fase_pedido(r.id);
  if v_fase = 'entregado' then raise exception 'Ese pedido ya se entregó.'; end if;
  if v_fase in ('cancelado', 'cerrado') then raise exception 'Ese pedido está cerrado.'; end if;
  if v_fase = 'vencido' then
    raise exception 'Ese apartado venció el %: sus piezas ya están libres.',
      to_char(coalesce(r.vence_apartado_en, r.expira_en) at time zone 'America/Caracas', 'DD/MM/YYYY');
  end if;
  if not pedido_con_precio(r.id) then
    raise exception 'Ese pedido es de antes del apartado: cóbralo con "Cobrar y entregar".';
  end if;

  if coalesce(p_monto, 0) > 0 then
    v_falta := falta_pedido_bcv(r.id);
    perform anotar_abono_en(null, r.id, null, 'tienda', p_metodo, p_monto, p_referencia, true, v_falta);
  end if;

  select count(*) into v_pend
    from abonos where reserva_id = r.id and anulado_en is null and verificado_en is null;
  if v_pend > 0 then
    raise exception 'Hay % pago(s) sin verificar. Revisa en el banco si llegaron antes de entregar.', v_pend;
  end if;

  v_falta := falta_pedido_bcv(r.id, true);
  if v_falta > 0 then
    select tasa_bcv into v_tasa from tasas where vigente limit 1;
    raise exception 'Todavía faltan $% BCV (hoy Bs %). Carga lo que falta y después entrega.',
      to_char(v_falta, 'FM999G999G990D00'),
      coalesce(to_char(round(v_falta * v_tasa, 2), 'FM999G999G990D00'), '?');
  end if;

  for v_modelo in
    select distinct modelo_id from reserva_items where reserva_id = r.id order by 1
  loop
    perform pg_advisory_xact_lock(v_modelo);
  end loop;

  -- Se suelta: desde aquí sus piezas cuentan como libres y se toman.
  update reservas set cerrada_en = now(), cerrada_por = auth.uid() where id = r.id;

  select a.metodo into v_metodo
    from abonos a where a.reserva_id = r.id and a.anulado_en is null
   order by a.monto_bcv desc, a.fecha desc limit 1;
  select a.referencia into v_ref
    from abonos a where a.reserva_id = r.id and a.anulado_en is null and a.referencia is not null
   order by a.fecha desc limit 1;

  v_cliente := resolver_cliente(r.cliente_id, r.cliente_cedula, r.cliente_nombre,
                                r.cliente_apellido, r.cliente_telefono);

  select jsonb_agg(jsonb_build_object(
           'modelo_id', ri.modelo_id, 'cantidad', ri.cantidad,
           'precio_usd', ri.precio_usd, 'precio_lista_usd', ri.precio_lista_usd,
           'motivo', ri.motivo_rebaja,
           'oferta_codigo_id', ri.oferta_codigo_id,
           'precio_sin_oferta_usd', ri.precio_sin_oferta_usd,
           'motivo_sin_oferta', ri.motivo_sin_oferta) order by ri.id)
    into v_lineas
    from reserva_items ri where ri.reserva_id = r.id;

  v_venta := vender_congelado(
    'detal', v_metodo, v_lineas, v_cliente,
    btrim(coalesce(r.cliente_nombre, '') || ' ' || coalesce(r.cliente_apellido, '')),
    r.cliente_telefono,
    case r.origen when 'tienda' then 'Apartado #' else 'Pedido del catálogo #' end || r.id,
    coalesce(r.creado_por, auth.uid()), null, v_ref);

  update abonos set venta_id = v_venta where reserva_id = r.id;

  update reservas
     set venta_id = v_venta, estado = 'confirmada', pagado_en = coalesce(pagado_en, now())
   where id = r.id;

  -- Lo que el pedido tenía tomado, usado por su venta.
  update ofertas_codigos
     set estado = 'usado', venta_id = v_venta, usado_en = now()
   where reserva_id = r.id and estado = 'tomado';

  return v_venta;
end;
$fn$;


-- ANULAR UNA VENTA DEVUELVE SUS CÓDIGOS
-- La de esquema-abonos-y-apartados.sql, misma firma: lo de siempre y,
-- al final, sus códigos vuelven (`soltar_codigos_de_venta`).
create or replace function anular_venta_por_verificar(p_venta_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item venta_items%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Hay que iniciar sesion.';
  end if;
  perform 1 from ventas where id = p_venta_id and por_verificar and not anulada for update;
  if not found then
    raise exception 'Esa venta ya no está por verificar: pídele al administrador que la anule.';
  end if;
  if exists (select 1 from reservas where venta_id = p_venta_id)
     or exists (select 1 from apartados where venta_id = p_venta_id) then
    raise exception 'Esa venta salió de un pedido pagado por abonos: la anula solo el administrador.';
  end if;

  for v_item in select * from venta_items where venta_id = p_venta_id
  loop
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_item.modelo_id, v_item.ubicacion_id, v_item.cantidad)
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();
  end loop;

  update ventas
     set anulada = true, por_verificar = false,
         verificada_por = auth.uid(), verificada_en = now(),
         notas = coalesce(notas || ' | ', '') || 'Anulada sin pago: ' || coalesce(nullif(btrim(p_motivo), ''), 'el pago no llegó')
   where id = p_venta_id;

  update abonos
     set anulado_en = now(), anulado_por = auth.uid(), anulado_motivo = 'venta anulada'
   where venta_id = p_venta_id and anulado_en is null;

  perform soltar_codigos_de_venta(p_venta_id);
end;
$fn$;

-- La del administrador, la de esquema-devoluciones.sql, misma firma: lo
-- de siempre y sus códigos vuelven.
create or replace function admin_anular_venta(p_venta_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_item venta_items%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular una venta.';
  end if;
  if (select anulada from ventas where id = p_venta_id) then
    raise exception 'Esa venta ya estaba anulada.';
  end if;
  if (select devolucion_de from ventas where id = p_venta_id) is not null then
    raise exception 'Eso es una nota de crédito: no se anula.';
  end if;
  if exists (select 1 from ventas where devolucion_de = p_venta_id and not anulada) then
    raise exception 'Esa venta tiene piezas devueltas: no se puede anular entera.';
  end if;

  for v_item in select * from venta_items where venta_id = p_venta_id
  loop
    insert into existencias (modelo_id, ubicacion_id, cantidad)
    values (v_item.modelo_id, v_item.ubicacion_id, v_item.cantidad)
    on conflict (modelo_id, ubicacion_id)
    do update set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now();
  end loop;

  update ventas
     set anulada = true,
         notas = coalesce(notas || ' | ', '') || 'Anulada: ' || coalesce(p_motivo, 'sin motivo')
   where id = p_venta_id;

  perform soltar_codigos_de_venta(p_venta_id);
end;
$fn$;


notify pgrst, 'reload schema';
