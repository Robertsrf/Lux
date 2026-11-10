# La landing de Lux y las ofertas con código — plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/#/publico` en la landing de Lux (secciones administrables, motion, fotos de ambiente) y añadir las ofertas con código de un solo uso, que se ganan en la landing y se cobran en línea y en el mostrador.

**Architecture:** Una migración, `esquema-landing-y-ofertas.sql` (#65), con las tablas revocadas y todo por funciones de definidor; el precio con código entra por una sola regla (`oferta_de_lineas`) que llaman las cuatro funciones que cobran o apartan. En el navegador, la lógica pura de ofertas en `lib/ofertas.ts` (probada con `node --test`), los componentes de la landing en `paginas/publico/landing/`, el panel en `paginas/admin/landing/` y la pantalla "Código" en `paginas/venta/Codigo.tsx`.

**Tech Stack:** Postgres (Supabase) probado en PGlite; React 19 + TypeScript estricto + CSS plano; `sharp` (ya en devDependencies) para las fotos; `node --test` (Node 22.23, que quita los tipos solo) para la lógica pura; `playwright-core` con el Edge instalado para mirar las pantallas.

**Spec:** `docs/superpowers/specs/2026-11-09-landing-y-ofertas-design.md` — léela entera antes de tu tarea. Y `CLAUDE.md` (las cinco reglas, las Trampas) y las skills `lux-codigo` y `lux-ui`.

## Global Constraints

- **Regla 3:** primero el SQL. Ninguna función pierde un parámetro; los nuevos van AL FINAL con `default null`. Al cambiar la firma de una función existente, `drop function` de la vieja y `create` de la nueva en la misma migración, con el `revoke`/`grant` de siempre (como hizo `crear_reserva` con `p_armados` en `esquema-dijes.sql`).
- **El navegador funciona con y sin el #65**: si `v_landing` o `ofertas_publicas` fallan, la página se ve como hoy (el inicio de siempre, sin ofertas) y no enseña un error rojo.
- **Regla 4:** las cifras viven en `configuracion` y se siembran con: `oferta_pareja_pct` 5 · `oferta_min_pct` 5 · `oferta_max_pct` 10 · `seleccion_pct` 5 · `seleccion_dias_sin_venta` 90 · `oferta_mirada_segundos` 20 · `oferta_dias_validez` 3 · `regalo_tope_usd` 15 · `oferta_codigos_dia_max` 10 · `ofertas_encendidas` 1. Sin una cifra (null o borrada), la oferta que depende de ella no sale.
- **El código:** `LUX-` + 6 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sin 0, O, 1, I, L), de `gen_random_bytes`, único. Se lee sin importar mayúsculas, espacios, guiones ni el prefijo.
- **Ningún costo, piso ni margen** sale a `anon` ni a la vendedora: ni en `ofertas_publicas`, `emitir_oferta`, `cotizar_pedido`, `ver_oferta`, ni en `v_landing`. Una pieza entra en una oferta solo si `round(etiqueta × (1 − pct/100), 4) >= piso_margen_de(modelo)`.
- **No se suma:** en cada línea cubierta manda `greatest(tramo, oferta)`; con código se ignora el precio a mano.
- **Las tablas nuevas**: `enable row level security` y `revoke all ... from anon, authenticated` (y sus secuencias), como `reserva_armados`.
- **Ningún proveedor nombrado** en la página, el texto alternativo, los nombres de archivo publicados ni los textos sembrados.
- **TypeScript estricto sin `any`**; dominio en español, API de React en inglés; CSS plano sobre `tokens.css`; todos los `useMemo` antes del primer `return`; los ficheros están en CRLF (trabaja por líneas). Sin dependencias nuevas de producción.
- **Movimiento:** solo `transform` y `opacity`; con `prefers-reduced-motion: reduce` todo aparece quieto y los sliders no pasan solos.
- **Regla 5:** todo texto a 4,5:1 medido (sobre foto: con el velo, en el peor punto).
- **El catálogo de los revendedores no cambia**: `TarjetaPieza` gana la cinta "Oferta" por una prop opcional que solo pasa el catálogo de la tienda.
- **Las cifras de dinero** se forman con `lib/dinero.ts` (`formatearBcv`, `formatearBs`, `precioEnBs`); "$" siempre dice cuál es.

## Review Focus

1. **Una pieza con más unidades que las del código** (código de 1 collar, carrito con 2): una unidad con oferta y la otra a su precio de siempre, en `cotizar_pedido`, `crear_reserva`, `registrar_venta` y `apartar_en_tienda` (prueba en Tarea 4).
2. **Una pieza del código se vendió entre que se emitió y se usa**: `cotizar_pedido` lo marca `aplica: false, motivo: 'pieza_no_disponible'`, el pedido se crea SIN ese código (lo que dijo la barra es lo que congela) y "Código" en el mostrador dice qué pieza ya no está (pruebas en Tareas 3 y 4).
3. **Dos códigos que comparten una pieza**: gana el primero en el orden en que llegan; el segundo vuelve `aplica: false, motivo: 'comparte_pieza'` (prueba en Tarea 4).
4. **Un código vencido en una captura**: "Código" dice "Venció el 12/11/2026" y no deja pasarlo al cobro; `registrar_venta` lo ignora (pruebas en Tareas 3 y 4; pantalla en Tarea 11).
5. **Sin el #65 o con `localStorage` bloqueado**: la landing cae al inicio de hoy sin errores rojos, y los códigos ganados viven en memoria mientras dure la visita (pruebas en Tareas 6 y 7).

---

## Archivos

**Base**
- Create: `esquema-landing-y-ofertas.sql` (#65; depende del #64). Secciones: §1 landing, §2 miradas, §3 ofertas (emisión), §4 ofertas en el cobro, §5 quitar y devolver con código, §6 reportes y respaldo.
- Create (scratchpad, no va al repo): `<scratch>/pg65/` — banco PGlite y pruebas. `<scratch>` = `C:\Users\WF\AppData\Local\Temp\claude\d93c7f308e990546\35368129-8956-4cf0-8f74-4b84d2de1f49\scratchpad`.

**Lógica pura y datos del navegador**
- Create: `src/lib/ofertas.ts` (sin importar nada que no sea `import type`), `src/lib/ofertasApi.ts` (las llamadas), `scripts/pruebas/ofertas.test.mjs`.
- Create: `src/hooks/useLanding.ts`, `src/hooks/useOfertas.ts`, `src/hooks/useMiradas.ts`, `src/hooks/useAparecer.ts`.

**Landing**
- Create: `src/paginas/publico/landing/` — `Landing.tsx` (arma las secciones), `Puertas.tsx`, `Portada.tsx`, `Cintas.tsx`, `Historia.tsx` (nosotros, buscamos), `Materiales.tsx`, `Galeria.tsx`, `VideoLanding.tsx`, `Redes.tsx`, `SeccionesCatalogo.tsx` (tipos, estantes, cómo pedir, próximamente, sacadas de `Catalogo.tsx`), `Estuche.tsx`, `Combos.tsx` (combos y para regalar), `Seleccion.tsx`, `OfertasCasa.tsx`, `Escote.tsx`, `Completalo.tsx`, `VentanaOferta.tsx`, `TusCodigos.tsx`.
- Create: `src/estilos/landing.css`; `public/landing/*.webp`.
- Modify: `src/paginas/publico/Catalogo.tsx` (el inicio pasa a `<Landing>`; códigos en el carrito, `cotizar_pedido` y `crear_reserva`), `src/componentes/VitrinaPublica.tsx` (prop `oferta` en `TarjetaPieza`), `src/componentes/VisorFoto.tsx` (avisa apertura y cierre para las miradas), `vite.config.ts` (`media-src`).

**Panel**
- Create: `src/paginas/admin/Landing.tsx` (pestañas) y `src/paginas/admin/landing/` — `SeccionesLanding.tsx`, `FormularioSeccion.tsx`, `OfertasLanding.tsx`, `ResultadosLanding.tsx`.
- Modify: `src/App.tsx` (rutas), `src/componentes/Disposicion.tsx` (menú), `src/lib/fotos.ts` (`subirArchivoLanding`), `src/paginas/admin/Inventario.tsx` (rearmar combos viejos al abrir).

**Mostrador**
- Create: `src/paginas/venta/Codigo.tsx`.
- Modify: `src/hooks/useCarrito.ts`, `src/paginas/venta/Mostrador.tsx`, `src/paginas/venta/Pedidos.tsx`, `src/paginas/Clientes.tsx`, `src/paginas/admin/Reportes.tsx`.

**Verificación y documentos**
- Modify: `scripts/verificar.mjs`, `src/paginas/Verificacion.tsx`, `CLAUDE.md`, `INSTALACION.md`, `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md`, `ESTADO.md`.

## Contrato de la base (lo que usan todas las tareas del navegador)

Tipos devueltos en `jsonb` salvo que se diga. `pieza` = `{modelo_id, nombre, variante, categoria, foto_thumb, foto_url, precio_lista_usd, precio_oferta_usd, cantidad}` (sin costo ni piso).

| Función / vista | Quién | Devuelve |
|---|---|---|
| `v_landing` | anon, authenticated | `id, tipo, orden, titulo, texto, datos jsonb` de las visibles, por `orden` |
| `ofertas_publicas()` | anon, authenticated | `{encendidas: bool, pareja_pct, mirada_segundos, dias_validez, combos: [{id, pct, total_lista_usd, total_oferta_usd, piezas: [pieza]}], regalo: [mismo formato, total_oferta_usd <= regalo_tope_usd], seleccion: {pct, piezas: [pieza]}, casa: [{id, nombre, texto, foto, pct, hasta, piezas: [pieza]}], en_oferta: [modelo_id]}` |
| `emitir_oferta(p_origen text, p_modelos bigint[], p_ref bigint, p_visitante uuid)` | anon, authenticated | `{codigo, origen, pct, vence_en, piezas: [pieza]}`; error con mensaje para la clienta si no se puede |
| `registrar_miradas(p_visitante uuid, p_miradas jsonb)` | anon (con sesión no cuenta) | `void`; `p_miradas` = `[{modelo_id, segundos, veces}]`, ≤ 50 filas, segundos ≤ 600 por fila |
| `cotizar_pedido(p_items jsonb, p_codigos text[] default null)` | anon, authenticated | lo de hoy + en cada línea `oferta_codigo` (o null) y `precio_sin_oferta_usd`, y la clave nueva `codigos: [{codigo, aplica, motivo, pct}]` (`motivo` ∈ `no_existe`, `vencido`, `usado`, `anulado`, `faltan_piezas`, `comparte_pieza`, `pieza_no_disponible`) |
| `crear_reserva(..., p_armados jsonb, p_codigos text[] default null)` | anon, authenticated | `uuid` como hoy |
| `ver_oferta(p_codigo text)` | `es_personal()` | `{codigo, estado ('sirve','usado','vencido','anulado','no_existe','pieza_no_disponible'), origen, pct, vence_en, usado_en, venta_id, reserva_id, piezas: [pieza + precio_lista_bs, precio_oferta_bs, ubicaciones: [{ubicacion_id, nombre, libre}]]}` |
| `registrar_venta(..., p_extra_nota text, p_codigos text[] default null)` | authenticated | `bigint` como hoy |
| `apartar_en_tienda(..., p_verificado boolean, p_codigos text[] default null)` | authenticated | como hoy |
| `admin_guardar_seccion(p_id bigint, p_tipo text, p_titulo text, p_texto text, p_datos jsonb, p_visible boolean)` | admin | `bigint` (id) |
| `admin_ordenar_secciones(p_ids bigint[])` · `admin_borrar_seccion(p_id bigint)` | admin | `void` |
| `admin_guardar_oferta_casa(p_id bigint, p_nombre text, p_texto text, p_foto text, p_pct numeric, p_desde date, p_hasta date, p_modelos bigint[], p_activa boolean)` | admin | `bigint`; rechaza las piezas que no aguantan el piso diciendo cuáles |
| `admin_seleccion(p_modelo_id bigint, p_accion text)` (`'meter'`, `'sacar'`, `'auto'`) | admin | `void` |
| `admin_rearmar_combos(p_combos jsonb)` (`[[modelo_id, ...], ...]`) | admin | `{guardados, descartados: [{piezas, motivo}]}`; el % lo pone la base: 2 piezas → `oferta_min_pct`, 4 → `oferta_max_pct`, 3 → el punto medio redondeado a entero |
| `admin_anular_codigo(p_codigo text, p_motivo text)` · `admin_anular_codigos_de(p_origen text, p_ref bigint, p_motivo text)` | admin | `int` (cuántos) |
| `admin_cifras_ofertas()` · `admin_guardar_cifra_oferta(p_clave text, p_valor numeric)` | admin | `{<las diez claves>: valor, combos_armados_en: timestamptz}` / `void` (solo acepta esas diez claves) |
| `v_ofertas` | admin (`where es_admin()`) | un código por fila: código, origen, pct, estado efectivo, emitido, vence, usado, venta o pedido, piezas (texto) |
| `v_ofertas_mes` | admin (`having es_admin()`) | por mes y origen: emitidos, usados, vendido $ BCV, rebajado $ BCV |
| `v_miradas` | admin | por pieza, últimos 30 días: veces, segundos, vendidas en esos días |

`venta_items.motivo_rebaja` acepta `'oferta'`. `reserva_items` y `venta_items` ganan al final `oferta_codigo_id bigint`, `precio_sin_oferta_usd numeric(12,4)`, `motivo_sin_oferta text` (y `venta_items.precio_sin_oferta_bs numeric(14,2)`).

---

### Tarea 1: el banco de pruebas en PGlite

**Files:**
- Create: `<scratch>/pg65/package.json`, `<scratch>/pg65/banco.mjs`, `<scratch>/pg65/prueba-banco.mjs`

**Interfaces:**
- Produces: `banco.mjs` exporta `async function banco({ hasta = 64 } = {}): Promise<{ db, comoAnon(fn), comoVendedora(fn), comoAdmin(fn), sembrar() }>`. `comoX(fn)` corre `fn(db)` con `set role` + el GUC que lee `auth.uid()` y vuelve a `postgres`. `sembrar()` deja: tasa vigente (BCV 100, venta 140), dos ubicaciones (Vitrina 1, Bodega), los grupos de precio de piezas y de dijes, 12 modelos activos (collares, aretes, pulseras, anillos; dos con "dorado" en el nombre, dos con "plateado"; uno dije y uno base), existencias, un perfil admin y uno vendedora, `margen_minimo_pct` y las claves de `configuracion` que piden #1–#64. Devuelve `{ modelos: {collarDorado, aretesDorados, ...}: id }`.
- Se guarda una copia de la base instalada (`base-64.tgz`, `db.dumpDataDir()`) para que cada prueba arranque en segundos.

- [ ] **Step 1:** `npm init -y && npm i @electric-sql/pglite` en `<scratch>/pg65`. Escribe `prueba-banco.mjs`: instala #1–#64 en el orden de `INSTALACION.md` y comprueba `select count(*) from modelos` = 12 tras `sembrar()`, `es_admin()` true dentro de `comoAdmin`, false dentro de `comoVendedora`, y que `comoAnon` no puede `select` de `modelos` (error `42501`).
- [ ] **Step 2:** Corre `node prueba-banco.mjs`: falla (no existe `banco.mjs`).
- [ ] **Step 3:** Escribe `banco.mjs`: los cimientos de Supabase que la instalación supone (roles `anon`, `authenticated`, `service_role`; esquema `auth` con `auth.users` y `auth.uid()` leyendo `request.jwt.claim.sub`; esquema `storage` con `buckets` y `objects` y lo que piden sus políticas; la extensión `pgcrypto` de `@electric-sql/pglite/contrib/pgcrypto`). Si un `.sql` del repo no instala en PGlite por una diferencia de Supabase, se ajusta el cimiento, **nunca el `.sql`**; si es una errata del `.sql`, se para y se informa.
- [ ] **Step 4:** `node prueba-banco.mjs` → `TODO BIEN`.
- [ ] **Step 5:** Sin commit (vive en el scratchpad). Anota en el informe cuánto tarda instalar y cuánto arrancar desde `base-64.tgz`.

### Tarea 2: §1 la landing y §2 las miradas en la base

**Files:**
- Create: `esquema-landing-y-ofertas.sql` (cabecera con el pedido, la dependencia del #64, cómo correrlo y qué debería dar; §1 y §2)
- Test: `<scratch>/pg65/prueba-65-landing.mjs`

**Interfaces:**
- Consumes: `banco()` de la Tarea 1.
- Produces: `landing_secciones`, `v_landing`, `admin_guardar_seccion`, `admin_ordenar_secciones`, `admin_borrar_seccion`, `catalogo_miradas`, `registrar_miradas`, `v_miradas`, las claves de `textos` `tiktok_tienda` y `facebook_tienda` (vacías, con descripción para la pantalla Textos), y **las 18 secciones sembradas** en el orden de la spec con `visible = true`.
- `tipo` es un `check` con los 19 tipos de la spec (`portada, cintas, estuche, tipos, combos, seleccion, estantes, escote, regalo, casa, nosotros, buscamos, materiales, galeria, video, como_pedir, proximamente, redes, tienda`). Los tipos de la base (`tipos, estantes, como_pedir, proximamente, tienda, cintas, estuche, combos, seleccion, escote, regalo, casa`) no se repiten (índice único parcial); `galeria`, `video`, `nosotros`, `buscamos` sí.
- `datos` por tipo: `portada`/`galeria` → `{diapositivas: [{foto, frase, texto, boton: {texto, destino}}]}`; `nosotros`/`buscamos` → `{foto, boton?}`; `materiales` → `{tarjetas: [{titulo, texto, foto, icono}]}`; `video` → `{video, poster}`. `foto` es una ruta relativa al sitio (`landing/portada-1.webp`) o una URL pública del bucket `fotos`. `destino` ∈ `todas`, `tipo:<categoria>`, `ofertas`, `proximamente`, `whatsapp`, `seccion:<tipo>`.
- **Textos sembrados** de `portada`, `nosotros`, `buscamos` y `materiales`: los escribe esta tarea **solo con datos de la skill `anthropic-skills:lux-by-emory`** (cárgala) y de `textos.materiales_largo`; voz de la marca, sin tics de IA, nada que el cerebro no afirme. Las fotos sembradas usan los nombres `landing/portada-1.webp` … `portada-4`, `landing/nosotros.webp`, `landing/materiales-1.webp` … `-3`, `landing/galeria-1.webp` … `-6`, `landing/egipto-1.webp` … `-3` (la Tarea 9 produce esos archivos; si alguno no se consigue, la Tarea 9 corrige la siembra).

- [ ] **Step 1: pruebas que fallan** en `prueba-65-landing.mjs`: anon lee `v_landing` y recibe 18 filas en orden con `orden` creciente; anon no puede `select` de `landing_secciones` (`42501`); la vendedora no puede `admin_guardar_seccion` (error); el admin crea una `galeria`, la reordena con `admin_ordenar_secciones` y la ve en su sitio; `admin_guardar_seccion` con un segundo `tipos` falla; con `visible=false` no sale en `v_landing`; `registrar_miradas` como anon suma (dos llamadas de 10 s → 20 s, `veces` 2) y como vendedora no suma; `registrar_miradas` con 51 filas o 601 segundos se recorta o rechaza sin tumbar; `v_miradas` vacía para la vendedora y con filas para el admin; ninguna columna de `v_landing` se llama como `%costo%`, `%piso%` o `%margen%`.
- [ ] **Step 2:** `node prueba-65-landing.mjs` → falla (no existe el archivo).
- [ ] **Step 3:** Escribe §1 y §2.
- [ ] **Step 4:** `node prueba-65-landing.mjs` → `TODO BIEN`; y el #65 corre dos veces seguidas sin error (idempotente: `if not exists`, `on conflict do nothing` en la siembra).
- [ ] **Step 5: Commit** `git add esquema-landing-y-ofertas.sql` · `git commit -m "landing: secciones administrables y miradas (#65 §1-§2)"`

### Tarea 3: §3 las ofertas y sus códigos

**Files:**
- Modify: `esquema-landing-y-ofertas.sql` (§3)
- Test: `<scratch>/pg65/prueba-65-ofertas.mjs`

**Interfaces:**
- Produces: las diez claves de `configuracion` (Global Constraints) con su `descripcion`; `ofertas_casa`, `oferta_casa_items`, `seleccion_manual`, `combos_semana` (+ items), `ofertas_codigos`, `ofertas_codigo_items`; las funciones revocadas `codigo_oferta_nuevo() returns text`, `aguanta_oferta(p_modelo bigint, p_pct numeric) returns boolean`, `seleccion_de_hoy() returns setof bigint`, `estado_codigo(p_id bigint) returns text` (el estado EFECTIVO: un `tomado` cuyo pedido ya no aparta piezas —cancelado, vencido, archivado— y que no ha vencido vuelve a `emitido`; un `emitido` con `vence_en < now()` es `vencido`); y las públicas y del admin del contrato (`ofertas_publicas`, `emitir_oferta`, `ver_oferta`, `admin_guardar_oferta_casa`, `admin_seleccion`, `admin_rearmar_combos`, `admin_anular_codigo`, `admin_anular_codigos_de`, `admin_cifras_ofertas`, `admin_guardar_cifra_oferta`, `v_ofertas`).
- `ofertas_codigos.estado` ∈ `emitido`, `tomado` (por un pedido), `usado` (por una venta), `anulado`. Columnas: `codigo` único, `origen`, `ref_id`, `pct`, `visitante uuid`, `emitido_en`, `vence_en`, `reserva_id`, `venta_id`, `usado_en`, `anulado_en`, `anulado_por`, `anulado_motivo`, `roto_en` (se quitó o devolvió una de sus piezas).
- `seleccion_de_hoy()`: modelos activos, con precio, con existencia libre > 0, que no son de un lote en camino ni dijes, cuya última venta (o `liberado_en` de su lote, o su alta si nunca se vendió) tiene más de `seleccion_dias_sin_venta` días, que aguantan `seleccion_pct`; más los `meter`, menos los `sacar`.
- `emitir_oferta`: valida según la spec ("Las formas de ganarlo"). `dos_vistas`/`complemento`/`escote`: 2–4 modelos distintos, `pct = oferta_pareja_pct`. `combo`/`regalo`: `p_ref` = combo de la semana vigente. `casa`: `p_ref` = oferta activa hoy (hora de Venezuela). `seleccion`: un modelo de `seleccion_de_hoy()`. `estuche`: elige al azar entre los combos vigentes y la selección. Cada pieza: activa, con precio, libre ≥ 1, `aguanta_oferta`. Con `ofertas_encendidas` = 0 no emite. Tope `oferta_codigos_dia_max` por visitante y día; si el visitante ya tiene un código `emitido` y vigente de la misma oferta y las mismas piezas, devuelve ese.
- Un combo de la semana deja de enseñarse si una de sus piezas ya no está libre o no aguanta.

- [ ] **Step 1: pruebas que fallan**, cada una con su cifra:
  - `emitir_oferta('dos_vistas', [collar, aretes], null, v)` como anon → código que cumple `^LUX-[2-9A-HJKMNP-Z]{6}$`, `pct` 5, `vence_en` ≈ ahora + 3 días; las claves de `piezas` no contienen `costo`, `piso` ni `margen`.
  - Mismo pedido otra vez → el mismo código. Con 10 códigos del visitante en el día, el 11.º falla con un mensaje para la clienta.
  - `dos_vistas` con 1 pieza o 5 → error; con una pieza sin existencia libre → error que nombra la pieza; con una pieza cuyo piso no aguanta 5 % (fíjale un `precio_override_usd` cerca del piso) → error.
  - `admin_rearmar_combos([[a,b],[a,b,c],[a,b,c,d]])` → pct 5, 8 y 10; un combo con una pieza que no aguanta el 10 % sale en `descartados`; la vendedora no puede llamarla.
  - `ofertas_publicas()` como anon: `combos` trae los 3, `regalo` solo los de `total_oferta_usd <= 15`, `en_oferta` contiene sus modelos; con `ofertas_encendidas` = 0 → `encendidas: false` y listas vacías; con `regalo_tope_usd` null → `regalo` vacía.
  - Selección: un modelo sin ventas con alta de hace 91 días entra; uno vendido hace 10 días no; `admin_seleccion(x, 'sacar')` lo saca; `'meter'` mete uno vendido ayer.
  - `ver_oferta` como vendedora: `sirve` con precios en Bs a la tasa vigente (precio_oferta_bs = round(oferta × 100, 2)) y las ubicaciones con libres; como anon → error de permiso. Tras vender una pieza del código por `registrar_venta` sin código → `pieza_no_disponible`. Con `vence_en` en el pasado → `vencido`. Tras `admin_anular_codigo` → `anulado`; la vendedora no puede anular.
  - Oferta de la casa: con `p_hasta` ayer no sale en `ofertas_publicas` y `emitir_oferta('casa', ..)` falla; un código emitido antes sigue `sirve` en `ver_oferta` (se respeta hasta que vence).
- [ ] **Step 2:** corre → falla.
- [ ] **Step 3:** escribe §3.
- [ ] **Step 4:** corre → `TODO BIEN`; vuelve a correr `prueba-65-landing.mjs` → `TODO BIEN`.
- [ ] **Step 5: Commit** `git commit -am "ofertas: codigos de un solo uso, combos, seleccion y ofertas de la casa (#65 §3)"`

### Tarea 4: §4 el código en el cobro

**Files:**
- Modify: `esquema-landing-y-ofertas.sql` (§4)
- Test: `<scratch>/pg65/prueba-65-cobro.mjs`

**Interfaces:**
- Produces: `oferta_de_lineas(p_items jsonb, p_codigos text[]) returns jsonb` (revocada a todos): `{por_modelo: {"<modelo_id>": {pct, unidades, codigo_id, codigo}}, codigos: [{codigo, aplica, motivo, pct}]}`. Regla: los códigos en el orden recibido, normalizados; cada uno aplica si su estado efectivo es `emitido` (o `tomado` por el MISMO pedido, para la entrega), todas sus piezas están en `p_items` con al menos sus unidades, ninguna pieza ya la tomó un código anterior y todas están libres.
- Las cuatro funciones con `p_codigos text[] default null` al final (firma vieja borrada, `revoke`/`grant` de siempre). En cada línea cubierta: se parte si pide más unidades de las cubiertas; `precio_de_linea` recibe `greatest(tramo, oferta)`; si ganó la oferta, `motivo = 'oferta'`; se guarda `oferta_codigo_id`, `precio_sin_oferta_usd` (y `_bs` en la venta) y `motivo_sin_oferta` (el precio y el motivo que la línea tendría con solo el tramo).
- Estados: `crear_reserva` y `apartar_en_tienda` → `tomado` + `reserva_id`; `registrar_venta` → `usado` + `venta_id`; al entregar un pedido (`entregar_pedido` → `vender_congelado`) las líneas de venta copian `motivo_rebaja`, `oferta_codigo_id`, `precio_sin_oferta_*` y `motivo_sin_oferta` de `reserva_items`, y el código pasa a `usado` con la venta; `anular_venta_por_verificar` (y la anulación del administrador) devuelve a `emitido` un código usado por esa venta si no ha vencido y no está `roto`.
- `venta_items_motivo_rebaja_check` acepta `'oferta'`. `v_rebajas` lo cuenta.
- `cotizar_pedido` devuelve en cada línea `oferta_codigo` y `precio_sin_oferta_usd`, y `codigos`.

- [ ] **Step 1: pruebas que fallan:**
  - Collar $10 y aretes $8 con un código `dos_vistas` 5 %: `cotizar_pedido` → total 17,10, motivos `oferta`, `codigos[0].aplica` true; `crear_reserva` congela 9,50 y 7,60 y el código queda `tomado`; `ver_oferta` de un código `tomado` devuelve `estado: 'usado'` con `reserva_id` (para la vendedora, "ya se usó en el pedido …").
  - Carrito con 2 collares y el código de 1 collar + aretes: líneas 9,50 (1), 10,00 (1), 7,60 (1); total 27,10.
  - Dos códigos que comparten el collar: el segundo `aplica: false, motivo: 'comparte_pieza'`.
  - Con 6 piezas en el carrito (tramo 5 %) y un código de combo 10 %: las del código a 10 %, las demás a 5 %; nunca 15 %.
  - Código con una pieza que ya no está libre: `cotizar` → `pieza_no_disponible`; `crear_reserva` crea el pedido SIN el descuento y el código sigue `emitido`.
  - `registrar_venta` con el código: líneas `oferta`, código `usado` con `venta_id`; con `precio_unitario_usd` a mano en esa línea se ignora; el mismo código en otra venta no aplica (`usado`).
  - `apartar_en_tienda` con código → `tomado`; cancelar ese pedido → `estado_codigo` vuelve a `emitido`; dejarlo vencer → igual; entregarlo → `usado` y las líneas de la venta con `motivo_rebaja = 'oferta'`.
  - `anular_venta_por_verificar` de una venta con código → `emitido` otra vez.
  - Un código vencido en `registrar_venta` → la venta sale a precio de siempre y `codigos[0].motivo = 'vencido'` en `cotizar`.
  - Regresión: `crear_reserva`, `registrar_venta`, `apartar_en_tienda` y `cotizar_pedido` con la llamada de HOY (sin `p_codigos`) dan exactamente lo mismo que antes del #65 (compara contra una corrida en `base-64.tgz`).
- [ ] **Step 2:** corre → falla.
- [ ] **Step 3:** escribe §4.
- [ ] **Step 4:** corre → `TODO BIEN`, y las pruebas de las Tareas 2 y 3 siguen `TODO BIEN`.
- [ ] **Step 5: Commit** `git commit -am "ofertas: el codigo en el cotizar, el pedido, la venta y el apartado (#65 §4)"`

### Tarea 5: §5 quitar y devolver con código, §6 reportes y respaldo

**Files:**
- Modify: `esquema-landing-y-ofertas.sql` (§5, §6)
- Test: `<scratch>/pg65/prueba-65-devolver.mjs`

**Interfaces:**
- `quitar_de_pedido`, `quitar_de_venta` (misma firma): si la línea quitada tiene `oferta_codigo_id`, las demás líneas de ese código en ese pedido o venta vuelven a `precio_sin_oferta_*` y `motivo_sin_oferta`; el total y lo que falta se recalculan como hoy; el código queda con `roto_en`. La respuesta `jsonb` gana `codigo_roto: {codigo, piezas: n, total_antes, total_despues}` para que la pantalla lo diga.
- `admin_devolver_pieza` (misma firma): si la pieza devuelta era de un código, la nota de crédito lleva la pieza en negativo y, en `extra_bs` (positivo) y `extra_nota` ("Descuento del código LUX-XXXXXX que pierden las otras piezas"), lo que las demás piezas de ese código se ahorraron (`Σ (precio_sin_oferta_bs − precio_unitario_bs) × cantidad`), nunca más que lo que vale la pieza devuelta; el código queda `roto_en`. `p_monto` sigue topado al total de la nota.
- §6: `v_ofertas_mes`, `v_miradas` si no salió en §2, y `admin_respaldo` gana las tablas nuevas.

- [ ] **Step 1: pruebas que fallan:** pedido con combo de 3 piezas a 10 % ($10, $8, $6 → 9, 7,20, 5,40; total 21,60): quitar la de $6 → las otras dos vuelven a 10 y 8, total 18, `codigo_roto` lo dice; venta por verificar con lo mismo → total en Bs recalculado (1.800,00 a tasa 100); venta verificada y entregada, devolver la de $6 → nota de crédito con la pieza en −540,00 Bs y extra +280,00 Bs (los 2,80 $ que se ahorraron las otras), total de la nota −260,00; `v_ofertas_mes` como admin cuenta 1 usado de `combo`; como vendedora, vacía.
- [ ] **Step 2:** corre → falla.
- [ ] **Step 3:** escribe §5 y §6.
- [ ] **Step 4:** las cinco pruebas `prueba-65-*.mjs` → `TODO BIEN`. Instala el #65 entero dos veces sobre `base-64.tgz` sin error.
- [ ] **Step 5: Commit** `git commit -am "ofertas: quitar y devolver una pieza de un codigo, reportes y respaldo (#65 §5-§6)"`

### Tarea 6: la lógica pura y los ganchos de datos

**Files:**
- Create: `src/lib/ofertas.ts`, `src/lib/ofertasApi.ts`, `src/hooks/useLanding.ts`, `src/hooks/useOfertas.ts`, `src/hooks/useMiradas.ts`, `src/hooks/useAparecer.ts`, `scripts/pruebas/ofertas.test.mjs`
- Modify: `package.json` (script `"pruebas": "node --test scripts/pruebas/"`)

**Interfaces:**
- `lib/ofertas.ts` (solo `import type`):
  - `type OrigenOferta = 'dos_vistas' | 'complemento' | 'escote' | 'combo' | 'estuche' | 'regalo' | 'seleccion' | 'casa'`
  - `interface PiezaOferta { modelo_id: number; nombre: string; variante: string | null; categoria: string | null; foto_thumb: string | null; foto_url: string | null; precio_lista_usd: number; precio_oferta_usd: number; cantidad: number }`
  - `interface CodigoOferta { codigo: string; origen: OrigenOferta; pct: number; vence_en: string; piezas: PiezaOferta[] }`
  - `interface OfertasPublicas` (la forma de `ofertas_publicas()` del contrato).
  - `normalizarCodigo(texto: string): string | null` — `' lux 7k2m9p '`, `'LUX7K2M9P'`, `'7K2-M9P'` → `'LUX-7K2M9P'`; con un carácter fuera del alfabeto o longitud ≠ 6 → `null`.
  - `codigoCompleto(c: CodigoOferta, carrito: ReadonlyMap<number, number>): boolean`
  - `codigosQueAplican(codigos: CodigoOferta[], carrito: ReadonlyMap<number, number>): Map<number, { pct: number; unidades: number; codigo: string }>` — la misma regla que `oferta_de_lineas` (orden, sin compartir piezas), solo para enseñar.
  - `vigente(c: CodigoOferta, ahora?: number): boolean`
  - `interface Miradas { [modeloId: number]: number }` (ms); `sumarMirada(m: Miradas, modeloId: number, ms: number): Miradas`; `parejaParaOfrecer(m: Miradas, umbralSeg: number, yaOfrecidas: ReadonlySet<string>): [number, number] | null` (las dos que más pasan del umbral; la clave de una pareja es `"menor-mayor"`).
  - `faltanParaTramo(piezas: number, tramos: { piezas_min: number; descuento_pct: number }[]): { faltan: number; pct: number } | null`
- `lib/ofertasApi.ts`: `cargarOfertasPublicas(): Promise<OfertasPublicas | null>` (null si la función no existe o falla), `emitirOferta(origen: OrigenOferta, modelos: number[], ref?: number): Promise<CodigoOferta>`, `verOferta(codigo: string)`, `registrarMiradas(m: { modelo_id: number; segundos: number; veces: number }[]): void` (con `navigator.sendBeacon` no se puede llamar a Supabase: usa `fetch` con `keepalive` vía el cliente, en `visibilitychange` → `hidden`). El visitante es el de `lib/visitas.ts` (exporta `visitante()`).
- `useLanding(): { secciones: SeccionLanding[] | null; cargando: boolean }` — `null` si `v_landing` falla (el inicio de hoy).
- `useOfertas(): { ofertas: OfertasPublicas | null; codigos: CodigoOferta[]; ganar(origen, modelos, ref?): Promise<CodigoOferta>; quitar(codigo): void }` — guarda los códigos en `localStorage` (`lux-codigos-v1`) con try/catch; sin almacenamiento, en memoria; descarta los vencidos al cargar.
- `useMiradas(umbralSeg: number | null): { abrir(modeloId): void; cerrar(): void; pareja: [number, number] | null; descartar(): void }` — una sola ventana por visita.
- `useAparecer<T extends Element>(): [RefObject<T>, boolean]` — `IntersectionObserver` una vez; con `prefers-reduced-motion` o sin `IntersectionObserver`, `true` de entrada.

- [ ] **Step 1:** pruebas en `scripts/pruebas/ofertas.test.mjs` (`import { … } from '../../src/lib/ofertas.ts'`): los tres casos de `normalizarCodigo` y dos `null` (`'LUX-7K2M9O'`, `'LUX-7K2M9'`); `codigosQueAplican` con el carrito {collar: 2, aretes: 1} y un código {collar 1, aretes 1} → collar `unidades` 1; dos códigos que comparten el collar → solo el primero; `codigoCompleto` false si falta una pieza; `parejaParaOfrecer({1: 25000, 2: 21000, 3: 5000}, 20, new Set())` → `[1, 2]`; con `'1-2'` ofrecida → `null`; `faltanParaTramo(4, [{6,5},{12,10}])` → `{faltan: 2, pct: 5}`; `vigente` false con `vence_en` de ayer.
- [ ] **Step 2:** `npm run pruebas` → falla.
- [ ] **Step 3:** escribe `lib/ofertas.ts`, luego `ofertasApi.ts` y los ganchos.
- [ ] **Step 4:** `npm run pruebas` → todas pasan; `npm run build` → sin errores.
- [ ] **Step 5: Commit** `git add src/lib/ofertas.ts src/lib/ofertasApi.ts src/hooks/use{Landing,Ofertas,Miradas,Aparecer}.ts scripts/pruebas package.json` · `git commit -m "ofertas: logica pura, sus pruebas y los ganchos de datos"`

### Tarea 7: la landing (estructura, motion y secciones de marca)

**Files:**
- Create: `landing/Landing.tsx`, `Puertas.tsx`, `Portada.tsx`, `Cintas.tsx`, `Historia.tsx`, `Materiales.tsx`, `Galeria.tsx`, `VideoLanding.tsx`, `Redes.tsx`, `SeccionesCatalogo.tsx`; `src/estilos/landing.css`
- Modify: `src/paginas/publico/Catalogo.tsx`, `vite.config.ts`, `src/main.tsx` o donde se importan los estilos

**Interfaces:**
- Consumes: `useLanding`, `useAparecer` (Tarea 6); `v_landing` (Tarea 2).
- Produces: `<Landing secciones={SeccionLanding[]} catalogo={PropsCatalogo} ofertas={...} />`, donde `PropsCatalogo` es lo que hoy usa el inicio de `Catalogo.tsx` (familias, tipos con foto, estantes, reglas, tramos, próximos, textos, `alAgregar`, `alVerFoto`, `irATodas`, `irATipo`). Un mapa `tipo → componente`; un tipo sin componente todavía (los de ofertas, hasta la Tarea 8) no dibuja nada. `SeccionesCatalogo.tsx` exporta `SeccionTipos`, `SeccionEstantes`, `SeccionComoPedir`, `SeccionProximamente` con el JSX que hoy está en línea en `Catalogo.tsx`, sin cambiarlo.
- Sin `v_landing` (`secciones === null`): `<Landing>` dibuja el inicio de hoy en su orden de hoy.
- `Puertas`: "Joyas" (→ `irATodas`), "Ofertas" (baja a la primera sección de oferta visible; sin ofertas, la puerta no sale), "Lo que viene" (baja a `proximamente`; sin próximos, no sale). Fija debajo de la cabecera, 48 px, letra ≥ 16 px.
- `Portada`: `scroll-snap` horizontal, una diapositiva por pantalla, puntos, pasa sola cada 6 s, se para al tocar y mientras no se ve (`useAparecer`), Ken Burns lento (`transform: scale`), velo verde profundo bajo el texto, la primera foto con `fetchpriority="high"` y sin `lazy`, `srcset` con `-800`/`-1600`.
- `VideoLanding`: `muted loop playsInline`, `preload="none"`, póster; `play()` solo visible; no carga con `navigator.connection?.saveData`.
- `Redes`: Instagram, TikTok, Facebook y WhatsApp desde `textos` con `lib/enlaces.ts` (sin dato válido no hay botón; sin ninguno no sale la sección).
- `vite.config.ts`: `media-src 'self' ${origen}`.

- [ ] **Step 1:** levanta el arnés de pantallas en `<scratch>/arnes/` (`npm i playwright-core`; `chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })`) con `ver.mjs <url> <ancho> <salida.png>`; corre `npm run dev` y fotografía `/#/publico` a 360 y 1280 px ANTES del cambio (la referencia).
- [ ] **Step 2:** escribe los componentes y `landing.css` (paleta de `tokens.css`, Fraunces para títulos, Jost para lo demás; cintas finas en `--oro-arena` sobre verde).
- [ ] **Step 3:** `npm run build` sin errores; `npm run pruebas` pasa.
- [ ] **Step 4:** con el #65 aún sin correr en producción, `/#/publico` a 360 px se ve igual que la referencia (prueba de la caída). Si el dueño ya corrió el #65: la landing con sus 18 secciones, las puertas visibles sin bajar, la primera foto pintada antes que lo demás, sin desbordes horizontales a 360 px, y con `prefers-reduced-motion` emulado nada se mueve. Mide el contraste del texto de la portada sobre la parte más clara de cada foto con su velo: ≥ 4,5.
- [ ] **Step 5: Commit** `git commit -m "landing: secciones del panel, puertas, portada con slider, historia, materiales, galeria, video y redes"`

### Tarea 8: las ofertas en la landing y en el pedido

**Files:**
- Create: `landing/Estuche.tsx`, `Combos.tsx`, `Seleccion.tsx`, `OfertasCasa.tsx`, `Escote.tsx`, `Completalo.tsx`, `VentanaOferta.tsx`, `TusCodigos.tsx`
- Modify: `landing/Landing.tsx` (mapa), `landing/Cintas.tsx` (sus textos de `ofertas_publicas`), `Catalogo.tsx`, `src/componentes/VitrinaPublica.tsx`, `src/componentes/VisorFoto.tsx`, `src/estilos/landing.css`

**Interfaces:**
- Consumes: `useOfertas`, `useMiradas`, `lib/ofertas.ts` (Tarea 6); `ofertas_publicas`, `emitir_oferta`, `cotizar_pedido(p_items, p_codigos)`, `crear_reserva(..., p_codigos)` (Tareas 3–4); `armarConjunto`/`zonasDe`/`tonoDe` de `lib/combinar.ts`; `lib/escotes.ts` y `SiluetaEscote`.
- `VentanaOferta`: el diálogo único para todo código ganado: fotos, cada pieza con su precio tachado y el de oferta (`formatearBcv` y Bs), el total, el código grande con "Guárdalo con una captura: sirve también en la tienda", "Vence el …" (fecha real), "Ver mi pedido" y "Seguir viendo". Foco atrapado, `Escape` cierra, `aria-modal`.
- Dos que miraste: `VisorFoto` gana `alAbrirPieza?(modeloId)` y `alCerrar?()`; `Catalogo` se los pasa a `useMiradas(ofertas?.mirada_segundos)`; con una pareja, una hoja "¿Te gustaron las dos? Llévatelas con 5 %" → "Las quiero" (`ganar('dos_vistas', pareja)` + mete las dos al pedido + `VentanaOferta`) / "Ahora no".
- Complétalo: al agregar una de las dos primeras piezas de la visita, si `armarConjunto` encuentra una pieza libre de otra zona que no está en el pedido → hoja pequeña "Complétalo: las dos con 5 %".
- Estuche: un estuche (SVG) que se abre una vez al día (`lux-estuche-<fecha>` en `localStorage`; sin almacenamiento, una vez por visita): giro de la tapa en `rotateX`, destello, filigrana; `ganar('estuche', [])` → `VentanaOferta`. Abierto hoy: enseña su código de hoy.
- Combos / Para regalar / Selección / Ofertas de la casa: tarjetas con piezas, precio tachado y de oferta, "Lo quiero" → código + piezas al pedido. Sin datos, la sección no sale.
- Escote: elegir escote → collar y aretes que le van (`lib/escotes.ts`) → "Llévate el conjunto con 5 %" (`escote`).
- `TarjetaPieza` gana `oferta?: string` (texto de la cinta, "Oferta") — solo la pasa el catálogo de la tienda con `en_oferta`.
- Barra del pedido: `faltanParaTramo` → "Te faltan N joyas para X % en todo el pedido" (sin dijes, como el tramo).
- "Tu pedido": `TusCodigos` lista cada código con sus piezas, si aplica (de `cotizar_pedido().codigos`, con el motivo dicho para la clienta: "Necesita las 2 piezas", "Ya venció", "Una pieza ya no está") y "Quitar". `cotizar_pedido` y `crear_reserva` mandan `p_codigos` con los códigos vigentes; sin el #65 no se mandan (la llamada de hoy).

- [ ] **Step 1:** escribe los componentes; conecta `Catalogo.tsx`.
- [ ] **Step 2:** `npm run build` y `npm run pruebas` pasan.
- [ ] **Step 3 (con el #65 corrido):** en el arnés, a 360 px: abrir dos piezas 21 s cada una → sale la hoja; "Las quiero" → `VentanaOferta` con un código `LUX-…` y las dos en el pedido; la barra dice el total de `cotizar_pedido` con el 5 %; quitar una pieza → "Necesita las 2 piezas" y el total sin descuento; abrir el estuche → código; con `ofertas_encendidas` = 0 ninguna sección de ofertas ni cinta. Capturas en `<scratch>/arnes/`.
- [ ] **Step 4:** el catálogo de un revendedor (`/#/r/<usuario>`) no enseña cintas ni ofertas (captura).
- [ ] **Step 5: Commit** `git commit -m "ofertas en la landing: dos que miraste, completalo, estuche, combos, seleccion, regalo, casa, escote y codigos en el pedido"`

### Tarea 9: las fotos de ambiente

**Files:**
- Create: `public/landing/*.webp` (los nombres de la Tarea 2, en `-800` y `-1600`), `scripts/preparar-landing.mjs`
- Modify (si hace falta): la siembra de §1 en `esquema-landing-y-ofertas.sql`

**Interfaces:**
- Consumes: las candidatas que dejó el agente de búsqueda en `<scratch>/landing-candidatas/` y su informe (lo pega el orquestador en la tarea).
- `scripts/preparar-landing.mjs <carpeta-origen>`: con `sharp`, cada foto elegida a WebP calidad 78, 800 y 1600 px de ancho, sin metadatos (EXIF fuera).

- [ ] **Step 1:** elige las fotos de cada uso de la Tarea 2 mirando cada una con Read: sin logo, nombre ni marca de agua; tono cálido que vaya con la paleta; la portada horizontal; la primera diapositiva dice "joya hipoalergénica que se usa todos los días" sin decirlo con texto.
- [ ] **Step 2:** corre el script; cada `-800.webp` ≤ 120 KB y cada `-1600.webp` ≤ 300 KB.
- [ ] **Step 3:** si falta una foto de un uso, corrige la siembra (menos diapositivas, galería más corta) y vuelve a correr `prueba-65-landing.mjs`.
- [ ] **Step 4:** `npm run build` copia `public/landing/` a `dist/landing/`.
- [ ] **Step 5: Commit** `git add public/landing scripts/preparar-landing.mjs` · `git commit -m "landing: fotos de ambiente en webp"`

### Tarea 10: el panel "Landing" del administrador

**Files:**
- Create: `src/paginas/admin/Landing.tsx`, `src/paginas/admin/landing/SeccionesLanding.tsx`, `FormularioSeccion.tsx`, `OfertasLanding.tsx`, `ResultadosLanding.tsx`
- Modify: `src/App.tsx` (`/admin/landing`, `soloAdmin`, perezosa), `src/componentes/Disposicion.tsx` (entrada "Landing" junto a "Textos"), `src/lib/fotos.ts` (`subirArchivoLanding(archivo: File, tipo: 'foto' | 'video'): Promise<string>` — foto con la compresión de siempre; video mp4 ≤ 20 MB sin tocar, ambos en `landing/` del bucket `fotos`), `src/paginas/admin/Inventario.tsx`, `src/paginas/admin/Textos.tsx` (etiquetas de `tiktok_tienda` y `facebook_tienda`)

**Interfaces:**
- Consumes: las funciones `admin_*` y vistas del contrato; `armarConjunto` de `lib/combinar.ts` sobre `v_catalogo_venta` (lo libre).
- `rearmarCombos(): Promise<{ guardados: number; descartados: number }>` en `OfertasLanding.tsx` (exportada): arma hasta 8 combos de 2–4 piezas con `armarConjunto`, sin repetir pieza entre combos y variando la semilla por semana, y llama `admin_rearmar_combos`. `Inventario.tsx` y el panel la llaman al abrir si `admin_cifras_ofertas().combos_armados_en` es null o tiene más de 7 días.
- Secciones: la lista con interruptor, Subir/Bajar (`admin_ordenar_secciones`), Editar (`FormularioSeccion`: título, texto, foto con vista previa con su velo, botón con destino, lista de diapositivas para portada y galería, archivo y póster para video, tarjetas para materiales), Agregar (solo los tipos que se pueden repetir o que faltan), Borrar (con confirmación), "Ver la landing".
- Ofertas: las diez cifras con `leerCifra` y lo que hace cada una; el interruptor general; ofertas de la casa (crear, editar, terminar, anular sus códigos); selección (lista de hoy con Sacar, buscar y Meter); combos de la semana con "Rearmar" y "Anular sus códigos".
- Resultados: `v_ofertas_mes` del mes, la lista `v_ofertas` con buscador y "Anular", y `v_miradas` (lo más mirado y cuánto se vendió).
- Densidad del administrador (40 px, 15 px), y usable en el teléfono.

- [ ] **Step 1:** escribe la pantalla.
- [ ] **Step 2:** `npm run build` y `npm run pruebas` pasan.
- [ ] **Step 3 (con el #65 corrido):** en el arnés, con sesión de administrador (la pide al orquestador; si no hay, se queda en build + lectura): subir una galería, esconder "buscamos", subir "combos" arriba → `/#/publico` lo refleja; "Rearmar" guarda combos; una cifra vacía dice qué oferta deja de salir.
- [ ] **Step 4:** a 360 px no hay desborde horizontal.
- [ ] **Step 5: Commit** `git commit -m "panel Landing: secciones, fotos, ofertas, seleccion, combos y resultados"`

### Tarea 11: "Código" en el mostrador, Pedidos, Clientes y Reportes

**Files:**
- Create: `src/paginas/venta/Codigo.tsx`
- Modify: `src/App.tsx` (`/venta/codigo`, las dos caras), `src/componentes/Disposicion.tsx` (en las dos listas, dentro de "Más"), `src/hooks/useCarrito.ts`, `src/paginas/venta/Mostrador.tsx`, `src/paginas/venta/Pedidos.tsx`, `src/paginas/Clientes.tsx`, `src/paginas/admin/Reportes.tsx`

**Interfaces:**
- Consumes: `ver_oferta`, `registrar_venta(..., p_codigos)`, `apartar_en_tienda(..., p_codigos)`, las respuestas de `quitar_de_pedido`/`quitar_de_venta` con `codigo_roto`, `v_ofertas_mes`; `normalizarCodigo` y `codigosQueAplican` de `lib/ofertas.ts`.
- `useCarrito` gana `codigos: VerOferta[]`, `agregarCodigo(o: VerOferta): void` (mete sus piezas en la ubicación con más libres de cada una), `quitarCodigo(codigo: string): void`; el precio que enseña cada línea cubierta es `precio_oferta_bs` de `ver_oferta`; si una línea cubierta baja de las unidades del código, el código se cae con un aviso; `registrar_venta` y `apartar_en_tienda` mandan `p_codigos`. Sin el #65 la llamada de hoy.
- `Codigo.tsx`: campo grande (56 px, 18 px, `inputMode="text"`, `autoCapitalize="characters"`), "Revisar"; los seis estados de `ver_oferta` dichos para la vendedora ("Sirve", "Ya se usó el 10/11 en la venta 345", "Venció el 12/11", "La tienda lo anuló", "No existe: revisa las letras", "Una pieza ya no está: …"); con "Sirve", las piezas con foto, dónde hay libres y los dos precios en Bs y $ BCV, y "Pasar al cobro" → Mostrador con el carrito cargado.
- Mostrador: botón "Tengo un código" → `/venta/codigo`.
- Pedidos: cada pedido o venta con código dice "Código LUX-… · 5 %"; antes de "Quitar" una pieza de un código, el aviso "Las otras N piezas del código vuelven a su precio: el total pasa de X a Y".
- Clientes ("Devolver"): si la pieza es de un código, la cuenta antes de confirmar (lo que se devuelve y lo que se descuenta).
- Reportes: tarjeta "Ventas con oferta" del mes (`v_ofertas_mes`) y la fila `oferta` en las rebajas.

- [ ] **Step 1:** escribe la pantalla y los cambios.
- [ ] **Step 2:** `npm run build` y `npm run pruebas` pasan.
- [ ] **Step 3 (con el #65 corrido y una sesión de prueba):** en el arnés a 360 px: escribir un código en minúsculas y sin guion → "Sirve"; "Pasar al cobro" → el carrito con los precios de oferta; un código vencido → el aviso y sin botón.
- [ ] **Step 4:** los textos de la vendedora no dicen "piso", "margen" ni "costo".
- [ ] **Step 5: Commit** `git commit -m "codigo en el mostrador: revisar, pasar al cobro, pedidos, devoluciones y reportes"`

### Tarea 12: verificar y documentos

**Files:**
- Modify: `scripts/verificar.mjs`, `src/paginas/Verificacion.tsx`, `CLAUDE.md`, `INSTALACION.md`, `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md`, `ESTADO.md`

**Interfaces:**
- `verificar.mjs` gana (con su número nuevo en la cabecera y en CLAUDE.md): anon no lee ninguna de las tablas nuevas; `v_landing` sin columnas de dinero; `ofertas_publicas()` y `emitir_oferta()` sin claves `costo`/`piso`/`margen` en ningún nivel; `cotizar_pedido` con `p_codigos` conserva sus claves y suma `codigos`; la vendedora no ejecuta ninguna `admin_*` nueva; `v_ofertas`, `v_ofertas_mes` y `v_miradas` vacías para la vendedora; `oferta_de_lineas`, `aguanta_oferta`, `codigo_oferta_nuevo`, `seleccion_de_hoy`, `estado_codigo` cerradas a anon y authenticated (en `FUNCIONES_CERRADAS`); `configuracion` sigue cerrada a anon. `Verificacion.tsx` gana las que se pueden hacer con una sola sesión.
- Documentos: lo que pide "Qué actualizar cuando cambias algo" de CLAUDE.md — árbol de `src/`, tablas, vistas, funciones, las reglas de la landing y de las ofertas, y una Trampa si alguna mordió durante la construcción; #65 en INSTALACION.md con lo que debería dar; la landing, el estuche, las cintas, `VentanaOferta` y "Código" en DESIGN.md y design.json; PRODUCT.md (la landing y las ofertas); ESTADO.md (`playwright-core` del arnés NO es dependencia del repo; las fotos de `public/landing/`).

- [ ] **Step 1:** escribe las comprobaciones; `node --check scripts/verificar.mjs`.
- [ ] **Step 2:** escribe los documentos.
- [ ] **Step 3:** `npm run build` y `npm run pruebas` pasan.
- [ ] **Step 4:** `npm run verificar` lo corre el dueño tras correr el #65 (el `.env` no se lee desde aquí); el informe dice cuántas comprobaciones deberían salir.
- [ ] **Step 5: Commit** `git commit -am "landing y ofertas: verificar, verificacion y documentos"`

---

## Orden y paralelo

- Base: 1 → 2 → 3 → 4 → 5 (seguidas: el mismo archivo).
- Navegador: 6 primero; luego 7 → 8 (las dos tocan `Catalogo.tsx`), y en paralelo 10 y 11 (archivos aparte; las dos tocan `App.tsx` y `Disposicion.tsx`: la segunda en llegar hace merge de esas líneas).
- 9 cuando llegue el informe del agente de fotos; antes que el paso 4 de la Tarea 7.
- 12 al final.
- **El dueño corre el #65 en el SQL Editor** cuando la Tarea 5 pase su revisión; los pasos "con el #65 corrido" de 7, 8, 10 y 11 esperan a eso. Nada se publica (`git push`) sin que el dueño lo diga.
