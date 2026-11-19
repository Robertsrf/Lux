# Dominio propio y subdominio por revendedor — plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lux en `luxbyemory.com` sin `#`, el personal en `entrar.luxbyemory.com`, cada revendedor en `<usuario>.luxbyemory.com`, servido por Cloudflare y publicado desde GitHub.

**Architecture:** Una sola app (Vite + React) pasa de `HashRouter` a `BrowserRouter`. Una librería pura (`src/lib/dominio.ts`) decide en qué dirección está y adónde lleva cada ruta; `App.tsx` aplica esa tabla. Cloudflare sirve `dist/` con un Worker de archivos cuyo script solo reescribe la tarjeta de vista previa en el subdominio de un revendedor. GitHub Pages queda como reenvío de las direcciones viejas.

**Tech Stack:** Vite 7, React 19, react-router-dom 7, TypeScript estricto, Supabase (Postgres), Cloudflare Workers con archivos estáticos (`wrangler`), GitHub Actions, `node --test` (`npm run pruebas`).

**Spec:** `docs/superpowers/specs/2026-11-19-dominio-y-subdominios-design.md` (léelo entero antes de empezar; también `CLAUDE.md`).

## Global Constraints

- Rama `fase-2-dominio`. **Nada se fusiona a `main`** hasta que `luxbyemory.com` responda desde Cloudflare (el dueño hace sus pasos el 20/11/2026).
- Dominio base por variable de entorno: `VITE_DOMINIO_BASE` (valor `luxbyemory.com`). Sin ella, modo de **una sola dirección** (desarrollo).
- Subdominio del personal: `entrar`. Revendedor: `<revendedores.usuario>`, **sin `www` delante**. `www.luxbyemory.com` → `luxbyemory.com`.
- El panel del revendedor es `luxbyemory.com/rv`, y la barra lo dice así (sin `#`).
- Ningún `#/` escrito a mano queda en `src/`.
- TypeScript estricto, sin `any`; dominio en español, API de React en inglés. Ficheros en CRLF: edita por líneas.
- Ningún secreto (token de Cloudflare, ID de cuenta) en el repo ni en el chat: secretos de GitHub.
- Próximo SQL: **#69**, `esquema-dominio.sql`. Primero el SQL, después el navegador; no se quita ningún parámetro de una función que el navegador ya llama.
- Lista de nombres reservados (la base manda; el navegador la repite): `www`, `entrar`, `admin`, `api`, `app`, `mail`, `correo`, `smtp`, `ftp`, `tienda`, `lux`, `luxbyemory`, `emory`, `rv`, `r`, `catalogo`, `vitrina`, `publico`, `guia`, `reserva`, `apartado`, `venta`, `pagos`, `soporte`, `ayuda`, `blog`, `static`, `assets`, `cdn`, `dev`, `test`, `staging`.
- Regla del usuario: 3 a 30 caracteres `[a-z0-9-]`, ni empieza ni termina en guion, no empieza por `xn--`, no reservado.

## Review Focus

1. **Un enlace viejo con `#/` y búsqueda** (`…/#/publico?tipo=Collares&para=dama`) llega a `luxbyemory.com/?tipo=Collares&para=dama` sin perder la búsqueda → prueba en Tarea 1 (`rutaDeHashViejo`) y en Tarea 5 (`reenvio`).
2. **Mayúsculas y puntos en el host** (`JaduJoyas.LuxByEmory.com`, `luxbyemory.com.`) se reconocen igual → prueba en Tarea 1 (`dondeEstoy`).
3. **Un subdominio de dos niveles o raro** (`a.b.luxbyemory.com`, `entrar.luxbyemory.com` como revendedor, `xn--...`) nunca abre un catálogo ni la tienda: se trata como revendedor inexistente → prueba en Tarea 1.
4. **El pedido de otro revendedor** abierto en un subdominio ajeno salta al correcto, y uno inexistente no hace un bucle de saltos → prueba en Tarea 1 (`destinoDeApartado`).
5. **El navegador viejo del administrador** (pestaña abierta antes del despliegue, `#/admin/...`) sigue funcionando: la conversión del `#` corre antes de montar el router → Tarea 3, verificación manual.

---

### Task 1: `src/lib/dominio.ts`, la regla de direcciones (pura)

**Files:**
- Create: `src/lib/dominio.ts`
- Test: `scripts/pruebas/dominio.test.mjs`

**Interfaces:**
- Produces (todas puras, sin `window` ni `import.meta`; reciben `base: string | null`, el dominio base ya en minúsculas, o null en modo de una sola dirección):
  - `type Lugar = { tipo: 'tienda' } | { tipo: 'entrar' } | { tipo: 'revendedor'; usuario: string } | { tipo: 'unica' } | { tipo: 'ninguno' }` (`ninguno`: un host bajo la base que no puede ser un revendedor válido; se comporta como revendedor inexistente).
  - `dondeEstoy(hostname: string, base: string | null): Lugar`
  - `USUARIOS_RESERVADOS: readonly string[]` y `usuarioValido(usuario: string): boolean` (la regla de Global Constraints).
  - `type Direcciones = { base: string | null; origen: string }` (`origen`: `window.location.origin` en modo único).
  - `urlTienda(d: Direcciones, ruta: string): string`, `urlEntrar(d, ruta)`, `urlRevendedor(d, usuario, ruta)` — con base: `https://luxbyemory.com/ruta`, `https://entrar.luxbyemory.com/ruta`, `https://<usuario>.luxbyemory.com/ruta`; sin base: `origen + ruta`, y el revendedor `origen + '/r/' + usuario + (ruta === '/' ? '' : ruta)`. `ruta` siempre empieza por `/`.
  - `rutaDeHashViejo(hash: string): string | null` — `'#/publico?x=1'` → `'/publico?x=1'`; sin `#/` → null.
  - `type Destino = { abrir: true } | { ir: string }` (`ir`: o una ruta interna que empieza por `/`, o una URL absoluta `https://...`).
  - `destinoDeRuta(lugar: Lugar, ruta: string, d: Direcciones): Destino` — la tabla del punto 3 del spec. Rutas del personal: `/entrar`, `/venta…`, `/admin…`, `/clientes…`, `/tasas`, `/catalogo`, `/verificacion`. Rutas de la tienda: `/`, `/reserva/…`, `/guia-revendedor`, `/rv…`, `/vitrina`; `/publico` → `{ ir: '/' + búsqueda }`; `/r/<u>` → `urlRevendedor`; `/apartado/<t>` en la tienda → `{ abrir: true }` (lo reenvía la página al saber su revendedor). En revendedor: `/` y `/apartado/…` se abren, lo demás `{ ir: '/' }`. En `ninguno`: `/` se abre (el catálogo dirá "no está disponible"), lo demás `{ ir: '/' }`. En `unica`: todo se abre.
  - `destinoDeApartado(lugar: Lugar, usuarioDelPedido: string | null, token: string, d: Direcciones): string | null` — URL a la que saltar, o null si se queda (mismo revendedor, modo único, o pedido sin revendedor).

- [ ] **Step 1: Escribe las pruebas** en `scripts/pruebas/dominio.test.mjs` (importa de `../../src/lib/dominio.ts`, como `ofertas.test.mjs`). Con `const B = 'luxbyemory.com'` y `const D = { base: B, origen: 'https://luxbyemory.com' }`:
  - `dondeEstoy('luxbyemory.com', B)` y `('www.luxbyemory.com', B)` y `('LuxByEmory.com.', B)` → `{tipo:'tienda'}`; `('entrar.luxbyemory.com', B)` → `{tipo:'entrar'}`; `('JaduJoyas.luxbyemory.com', B)` → `{tipo:'revendedor', usuario:'jadujoyas'}`; `('a.b.luxbyemory.com', B)`, `('admin.luxbyemory.com', B)`, `('xn--abc.luxbyemory.com', B)`, `('jadu-.luxbyemory.com', B)` → `{tipo:'ninguno'}`; `('localhost', null)` y `('robertsrf.github.io', B)` → `{tipo:'unica'}`.
  - `usuarioValido`: `'jadujoyas'` y `'pedro-2'` true; `'ab'`, `'-pedro'`, `'pedro-'`, `'xn--pedro'`, `'entrar'`, `'www'`, `'Pedro'`, `'a'.repeat(31)` false.
  - `urlRevendedor(D,'jadujoyas','/')` === `'https://jadujoyas.luxbyemory.com/'`; `urlEntrar(D,'/venta')` === `'https://entrar.luxbyemory.com/venta'`; `urlRevendedor({base:null,origen:'http://localhost:5173'},'jadujoyas','/')` === `'http://localhost:5173/r/jadujoyas'`.
  - `rutaDeHashViejo('#/publico?tipo=Collares&para=dama')` === `'/publico?tipo=Collares&para=dama'`; `rutaDeHashViejo('#seccion')` === null; `rutaDeHashViejo('')` === null.
  - `destinoDeRuta({tipo:'tienda'}, '/publico?ver=todas', D)` → `{ir:'/?ver=todas'}`; `('/admin/inventario')` en tienda → `{ir:'https://entrar.luxbyemory.com/admin/inventario'}`; `('/r/jadujoyas')` en tienda → `{ir:'https://jadujoyas.luxbyemory.com/'}`; `('/rv/entrar')` en tienda → `{abrir:true}`; `('/reserva/abc')` en entrar → `{ir:'https://luxbyemory.com/reserva/abc'}`; `('/venta')` en entrar → `{abrir:true}`; `('/admin')` en revendedor → `{ir:'/'}`; `('/entrar')` en revendedor → `{ir:'/'}`; `('/apartado/t1')` en revendedor → `{abrir:true}`; `('/cualquier')` en unica → `{abrir:true}`.
  - `destinoDeApartado({tipo:'revendedor',usuario:'jadujoyas'}, 'pedro', 't1', D)` === `'https://pedro.luxbyemory.com/apartado/t1'`; mismo usuario → null; `{tipo:'tienda'}` con `'pedro'` → la URL de pedro; usuario del pedido null → null; `{tipo:'unica'}` → null.
- [ ] **Step 2:** `npm run pruebas` → FAIL (no existe `dominio.ts`).
- [ ] **Step 3:** Implementa `src/lib/dominio.ts` con las firmas de arriba. Comentarios en español, en el tono de `lib/enlaces.ts`.
- [ ] **Step 4:** `npm run pruebas` → PASS (también las de antes).
- [ ] **Step 5:** Commit: `git add src/lib/dominio.ts scripts/pruebas/dominio.test.mjs && git commit -m "fase 2: la regla de direcciones (lib/dominio.ts)"`

### Task 2: SQL #69, nombres reservados

**Files:**
- Create: `esquema-dominio.sql`
- Modify: `INSTALACION.md` (fila 69 de la tabla de orden), `scripts/verificar.mjs`
- Test: `scripts/pruebas/reservados.test.mjs`

**Interfaces:**
- Consumes: `USUARIOS_RESERVADOS`, `usuarioValido` (Tarea 1).
- Produces: `usuario_rv_valido(text) returns boolean`, inmutable, `grant execute` a `authenticated` (no a `anon`): lo evalúa el `check` al escribir. El `check` `revendedores_usuario_check` la usa. `admin_guardar_revendedor` (misma firma de 12 parámetros, ver `esquema-revendedores.sql:1804`) cambia su regex de la línea `if v_usuario !~ ...` por `if not usuario_rv_valido(v_usuario)` con el mensaje "El usuario va en la dirección de su catálogo: de 3 a 30 letras minúsculas, números o guiones, sin empezar ni terminar en guion. Algunos nombres los usa la tienda (entrar, www, admin...)."

- [ ] **Step 1: Prueba de las dos listas** en `scripts/pruebas/reservados.test.mjs`: lee `esquema-dominio.sql` con `fs`, extrae el arreglo de reservados (va en UNA línea `array['www', 'entrar', ...]` marcada con el comentario `-- RESERVADOS`) y comprueba que es igual, en el mismo orden, a `USUARIOS_RESERVADOS`. Si alguien cambia una lista sin la otra, falla.
- [ ] **Step 2:** `npm run pruebas` → FAIL (no existe el `.sql`).
- [ ] **Step 3: Escribe `esquema-dominio.sql`.** Cabecera como los anteriores (de qué depende: #68; qué hace; "Se puede correr varias veces"; "Debería dar"). En una transacción: la función; **antes del `check`**, un bloque `do` que junta los `usuario` que no pasan y, si hay, `raise exception` nombrándolos (no renombra); `alter table revendedores drop constraint if exists revendedores_usuario_check, add constraint revendedores_usuario_check check (usuario_rv_valido(usuario))`; `create or replace` de `admin_guardar_revendedor` copiando el cuerpo vigente con el único cambio dicho; sus `revoke`/`grant` como estaban. "Debería dar": `select usuario_rv_valido('entrar')` false, `('jadujoyas')` true, y la lista de revendedores intacta.
- [ ] **Step 4: Pruébalo en PGlite** con la instalación entera en el orden de `INSTALACION.md` (como en las fases anteriores; script desechable en el scratchpad): corre limpio, corre dos veces, rechaza `entrar` y `pedro-` por `admin_guardar_revendedor` con el mensaje nuevo, acepta `jadujoyas`, y con un revendedor `pedro-` insertado antes del #69 el `.sql` para y lo nombra.
- [ ] **Step 5:** `npm run pruebas` → PASS.
- [ ] **Step 6:** En `scripts/verificar.mjs`, en el bloque de revendedores: como administrador, `rpc('usuario_rv_valido', {p_usuario:'entrar'})` da false y `'jadujoyas'` true; sin sesión, la misma llamada da error de permiso. (Nunca crea un revendedor para probar.) Fila 69 en `INSTALACION.md`.
- [ ] **Step 7:** Commit: `git add esquema-dominio.sql scripts/pruebas/reservados.test.mjs scripts/verificar.mjs INSTALACION.md && git commit -m "fase 2: SQL #69, nombres reservados para el subdominio"`. **Entregar el `.sql` al dueño para correrlo antes de la Tarea 4** (primero el SQL).

### Task 3: Sin numeral: `BrowserRouter`, la conversión del `#` y las rutas por dirección

**Files:**
- Create: `src/lib/direccion.ts` (lo único que lee `window.location` e `import.meta.env.VITE_DOMINIO_BASE`)
- Modify: `src/main.tsx`, `src/App.tsx`, `vite.config.ts` (`base: '/'`), `index.html` (rutas `./marca/...` → `/marca/...`), `src/paginas/revendedor/CatalogoRevendedor.tsx:46`, `src/paginas/revendedor/ApartadoPublico.tsx`, `src/vite-env.d.ts` (si existe; tipar `VITE_DOMINIO_BASE`), `.env.example` (si existe)

**Interfaces:**
- Consumes: `dondeEstoy`, `destinoDeRuta`, `destinoDeApartado`, `rutaDeHashViejo`, `Direcciones`, `Lugar` (Tarea 1).
- Produces: `direcciones(): Direcciones` y `lugarActual(): Lugar` en `src/lib/direccion.ts`; `irA(destino: string): void` (ruta interna con `navigate`, absoluta con `window.location.replace`).

- [ ] **Step 1:** `src/main.tsx`: antes de `createRoot`, si `rutaDeHashViejo(location.hash)` no es null, `history.replaceState(null, '', ruta)`. Va después de la comprobación del marco.
- [ ] **Step 2:** `App.tsx`: `HashRouter` → `BrowserRouter`; borra el comentario de GitHub Pages y explica que Cloudflare devuelve `index.html` para cualquier ruta. Un componente `PorDireccion` envuelve `<Routes>`: con `useLocation`, calcula `destinoDeRuta(lugarActual(), pathname + search, direcciones())` y, si es `{ir}`, salta (interna: `<Navigate replace>`; absoluta: `window.location.replace` y `<Cargando>`). Rutas: `/` es `CatalogoPublico` en tienda/unica, `CatalogoRevendedor` en revendedor/ninguno, `Inicio` en entrar. En modo único `/` sigue siendo `Inicio` y `/publico` el catálogo (el desarrollo trabaja igual que hoy). El `*` final lleva a `/`.
- [ ] **Step 3:** `CatalogoRevendedor`: el usuario sale de `useParams().usuario` o, si no hay, de `lugarActual()` (revendedor → su usuario; ninguno → `''`, que ya da "Este catálogo no está disponible"). Con su perfil, cambia el `<link rel="icon">` por su logo (sin logo, lo deja vacío, nunca el de Lux) y lo restaura al salir.
- [ ] **Step 4:** `ApartadoPublico`: al cargar el pedido, `destinoDeApartado(lugarActual(), apartado.usuario, token, direcciones())`; si da URL, `window.location.replace`. Los `Link` internos que tenga, revisados para la nueva dirección.
- [ ] **Step 5:** `npm run build` → sin errores. `grep -rn "#/" src` → solo comentarios que ya no mientan (corrígelos).
- [ ] **Step 6: Prueba a mano** con `VITE_DOMINIO_BASE=lux.localhost npm run dev` (Chrome resuelve `*.localhost`; si Vite rechaza el host, añade `server.allowedHosts: ['.lux.localhost']` solo en desarrollo) y sin la variable:
  - `lux.localhost:5173/` → landing; `/#/publico?ver=todas` → `/?ver=todas`; `/admin/inventario` → `entrar.lux.localhost:5173/admin/inventario`; `/rv` → panel, y la barra dice `/rv`.
  - `jadujoyas.lux.localhost:5173/` → su catálogo (o "no disponible" si no existe en la base de desarrollo); `/admin` y `/entrar` → `/`.
  - Sin la variable, `localhost:5173/#/venta` → `/venta` y todo como hoy.
  - Las fotos de Supabase cargan con rutas anidadas (`/admin/modelos/12`) y la compresión de fotos (`lib/fotos.ts`) sigue encontrando su trabajador.
  (La URL con puerto: `urlTienda` etc. llevan el puerto si `origen` lo tiene; ajústalo en Tarea 1 si hace falta y añade su prueba.)
- [ ] **Step 7:** Commit: `git commit -am "fase 2: sin numeral, y cada dirección abre lo suyo"` (añade los nuevos con `git add`).

### Task 4: Los enlaces y los nombres en pantalla

**Files:**
- Modify: `src/lib/revendedor.ts:84-96` y `:134-146`, `src/componentes/CompartirCatalogo.tsx:22-28`, `src/paginas/admin/Landing.tsx:27`, `src/paginas/admin/Revendedores.tsx:329`, `src/paginas/publico/GuiaRevendedorPiezas.tsx` (usuario libre), `index.html` (`og:url`, `og:image`, JSON-LD `url`/`image` → `https://luxbyemory.com/` y `https://luxbyemory.com/marca/og.png`)

**Interfaces:**
- Consumes: `urlTienda`, `urlEntrar`, `urlRevendedor`, `usuarioValido` (Tarea 1), `direcciones()` (Tarea 3).
- Produces: las mismas firmas de hoy (`enlaceCatalogoRv(usuario)`, `enlacePanelRv()`, `enlaceGuiaRv()`, `enlaceApartado(token)`, `enlaceReserva(token)`, `enlacePublico()`), ahora sin `#`: catálogo → `urlRevendedor(d, u, '/')`; apartado → necesita el usuario: **`enlaceApartado(token, usuario?)`** (con usuario, en su subdominio; sin él, `urlTienda('/apartado/'+token)`, que salta solo). Pasa el usuario en `ApartadosRv`, `VenderRv` y `ApartadoPublico` (lo tienen del resumen o del pedido). Panel → `urlTienda('/rv')`; guía → `urlTienda('/guia-revendedor')`; reserva → `urlTienda('/reserva/'+t)`; público → `urlTienda('/')`.
- `usuarioValido` de `revendedor.ts` pasa a reexportar el de `dominio.ts`. `usuarioDesdeNombre`: si el resultado es reservado, le añade `-joyas` (recortado a 30).

- [ ] **Step 1:** Prueba en `dominio.test.mjs` para lo que se pueda en puro (p. ej. si mueves `usuarioDesdeNombre` a `dominio.ts`: `'Lux'` → `'lux-joyas'`, `'María González'` → `'maria-gonzalez'`). FAIL, implementa, PASS.
- [ ] **Step 2:** Cambia los enlaces. "Ver la landing" usa `urlTienda('/')`. La pista de Revendedores dice `Su catálogo: <usuario>.luxbyemory.com` (con el dominio de `direcciones()`; en modo único, la URL que de verdad sale). Un usuario reservado se dice en el formulario y en la solicitud de la guía: "Ese nombre lo usa la tienda: prueba con otro."
- [ ] **Step 3:** `npm run build` y `npm run pruebas` → PASS. `grep -rn "#/" src` → nada que arme un enlace.
- [ ] **Step 4:** Prueba a mano en `lux.localhost`: Revendedores → "Ver su catálogo" abre `jadujoyas.lux.localhost:5173/`; el QR de la vitrina y del catálogo PDF codifican `http://lux.localhost:5173/`; el mensaje de WhatsApp de un pedido del revendedor trae su subdominio.
- [ ] **Step 5:** Commit: `git commit -am "fase 2: los enlaces llevan a la dirección nueva"`

### Task 5: Cloudflare y GitHub: el Worker, su tarjeta, el despliegue y el reenvío

**Files:**
- Create: `wrangler.jsonc`, `cloudflare/worker.js`, `cloudflare/tarjeta.mjs`, `reenvio-github/index.html`, `reenvio-github/reenvio.js`, `reenvio-github/404.html` (igual que `index.html`)
- Modify: `.github/workflows/desplegar.yml`, `.gitignore` (`.wrangler/`), `package.json` (`wrangler` como devDependency fijada; script `"cf": "wrangler deploy"`)
- Test: `scripts/pruebas/tarjeta.test.mjs`, `scripts/pruebas/reenvio.test.mjs`

**Interfaces:**
- Consumes: `destinoDeRuta`, `rutaDeHashViejo` (Tarea 1) solo en la prueba de `reenvio`.
- Produces:
  - `cloudflare/tarjeta.mjs`: `usuarioDeHost(hostname, base): string | null` (repite la regla de `dondeEstoy` para revendedor; la prueba compara las dos con los mismos casos) y `tarjetaDe(perfil: {catalogo_nombre: string, logo_url: string | null} | null): {titulo: string, descripcion: string, imagen: string | null}` — con perfil: título `<catalogo_nombre>`, descripción `"Catálogo de <catalogo_nombre>. Joyas Lux by Emory."`, imagen su logo; sin perfil: título `"Catálogo de joyas"`, descripción `"Este catálogo no está disponible."`, imagen null.
  - `cloudflare/worker.js`: `export default { fetch(request, env) }`. Si el host es de un revendedor y la petición pide HTML (`/` o `/apartado/...`): pide `index.html` a `env.ASSETS`, lee `rv_perfil_publico` (`env.SUPABASE_URL`, `env.SUPABASE_ANON_KEY`, POST a `/rest/v1/rpc/rv_perfil_publico`, con `cf: { cacheTtl: 300 }` y un tiempo máximo de 2 s), y con `HTMLRewriter` cambia `<title>`, `og:title`, `og:description`, `meta[name=description]`, `og:url`, `og:image` (o lo quita), el ícono, y **quita el `script[type="application/ld+json"]`**. Todo lo demás: `env.ASSETS.fetch(request)` sin tocar. Si Supabase falla: tarjeta neutra.
  - `reenvio-github/reenvio.js`: `export function destinoViejo(hash: string, base: string): string` — `#/publico…` → `https://base/…`; `#/r/u` → `https://u.base/`; `#/apartado/t` → `https://base/apartado/t`; rutas del personal → `https://entrar.base/…`; sin hash → `https://base/`. Y al cargarse en un navegador, `location.replace(destinoViejo(location.hash, 'luxbyemory.com'))`.

- [ ] **Step 1: Pruebas.** `tarjeta.test.mjs`: los casos de host de la Tarea 1 dan lo mismo en `usuarioDeHost` que en `dondeEstoy` (revendedor → usuario, lo demás → null); `tarjetaDe` con y sin perfil, y que **ninguna salida contiene "Lux by Emory" como título**. `reenvio.test.mjs`: para `#/publico?tipo=Collares`, `#/r/jadujoyas`, `#/admin/inventario`, `#/venta`, `#/rv`, `#/reserva/abc`, `#/guia-revendedor`, `''`, `destinoViejo` da la URL esperada y coincide con lo que darían `rutaDeHashViejo` + `destinoDeRuta` en la tienda.
- [ ] **Step 2:** `npm run pruebas` → FAIL.
- [ ] **Step 3:** Implementa `tarjeta.mjs`, `reenvio.js`, `worker.js` y las dos páginas de reenvío (texto visible: "Lux by Emory se mudó a luxbyemory.com" con el enlace, por si el script no corre).
- [ ] **Step 4:** `wrangler.jsonc`: `name: "lux"`, `main: "cloudflare/worker.js"`, `compatibility_date` de hoy, `assets: { directory: "./dist", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: [...] }` con lo mínimo para que `/` y `/apartado/*` pasen por el script (compruébalo en la documentación vigente de Cloudflare: si `run_worker_first` por rutas no existe, otra forma sin invocar el script por cada archivo de `/assets`). `routes`: `luxbyemory.com` y `entrar.luxbyemory.com` como `custom_domain: true`, y `{ pattern: "*.luxbyemory.com/*", zone_name: "luxbyemory.com" }`. `vars`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (se pasan al publicar, no escritos).
- [ ] **Step 5:** `desplegar.yml`: el job `construir` construye con `VITE_DOMINIO_BASE: ${{ vars.VITE_DOMINIO_BASE }}` y además sube `dist`; un job `cloudflare` publica con `cloudflare/wrangler-action@v3` (`apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`, `--var` para las dos de Supabase); el de Pages sube `reenvio-github/` en vez de `dist` y **solo corre en `main`** (`if: github.ref == 'refs/heads/main'`): así la rama se puede publicar en Cloudflare con "Run workflow" (`workflow_dispatch`) sin convertir github.io en reenvío antes de tiempo. Comprobación al principio: sin el token o sin `VITE_DOMINIO_BASE`, falla con un mensaje que diga dónde ponerlos (como la de Supabase).
- [ ] **Step 6:** `npm run pruebas` y `npm run build` → PASS. `npx wrangler deploy --dry-run` → sin errores de configuración.
- [ ] **Step 7:** Commit: `git add -A cloudflare reenvio-github wrangler.jsonc scripts/pruebas .github package.json package-lock.json .gitignore && git commit -m "fase 2: Cloudflare sirve el sitio, la tarjeta del revendedor y el reenvío de github.io"`

### Task 6: Documentos, la guía del dueño y la fase 8

**Files:**
- Create: `docs/fases/2026-11-revendedores/fase-2-pasos-del-dueno.md`, `docs/fases/2026-11-revendedores/fase-8-landing-de-lux.md`
- Modify: `CLAUDE.md`, `INSTALACION.md`, `ESTADO.md`, `docs/fases/2026-11-revendedores/README.md`, `docs/fases/2026-11-revendedores/fase-2-dominio.md` (una línea arriba: "Reemplazado por el diseño del 19/11", con el enlace)

- [ ] **Step 1: La guía del dueño**, en el orden del punto 6 del spec, cada paso con dónde hacer clic, qué copiar y cómo se ve que salió bien. Incluye: los dos secretos y la variable en GitHub; los registros DNS que crea el Worker y el comodín en naranja; Full (strict) y "Always Use HTTPS"; `www` → raíz; Supabase Site URL; **el cambio se hace sin un conteo abierto**; avisar a vendedoras y revendedores que entran una vez más; el televisor en `luxbyemory.com/vitrina`; cambiar el enlace de Instagram. Y el final: "cuando `luxbyemory.com` abra, avísame y fusionamos".
- [ ] **Step 2: `fase-8-landing-de-lux.md`**, con el formato de las otras fases: lo que pidió (la cita del spec), que los orquestadores ignoran `lux-ui`, DESIGN.md y toda regla visual de Lux salvo colores y tipografía, lo que sigue valiendo (ningún costo, ninguna cifra inventada, contraste: preguntar), dependencias (fase 2), decisiones abiertas.
- [ ] **Step 3: `CLAUDE.md`:** "`HashRouter`: GitHub Pages no reescribe rutas" pasa a "`BrowserRouter`: Cloudflare devuelve `index.html` en cualquier ruta" con el porqué (`/rv` sin `#`, vista previa en WhatsApp); el árbol (`lib/dominio.ts`, `lib/direccion.ts`, `cloudflare/`, `reenvio-github/`, `wrangler.jsonc`); en "Los revendedores", la regla del subdominio, la tarjeta y los reservados (`usuario_rv_valido`); `/#/...` → rutas sin `#` en todo el archivo; "Antes de publicar": el despliegue a Cloudflare. Una trampa nueva: "El navegador guarda por dirección" (lo del punto 5 del spec).
- [ ] **Step 4: `INSTALACION.md`** (Cloudflare, secretos, variable; la fila 69 ya está), **`ESTADO.md`** (la renovación anual del dominio en Namecheap, con "fecha exacta en Namecheap"; el token de Cloudflare y si caduca; el reenvío de github.io), **README de las fases** (fase 2: "Construida en la rama, falta el dueño"; fase 8 en la tabla y en el estado; el próximo SQL libre, #70).
- [ ] **Step 5:** Commit: `git add -A docs CLAUDE.md INSTALACION.md ESTADO.md && git commit -m "fase 2: documentos, guía del dueño y la fase 8"`

### Task 7: Cierre en la rama

- [ ] **Step 1:** `npm run pruebas`, `npm run build` → PASS. `npm run verificar` con el #69 ya corrido por el dueño → todo pasa (si no se ha corrido, decirlo y no darlo por hecho).
- [ ] **Step 2:** Revisión de seguridad con el agente `backend-api-security:backend-api-security-backend-security-coder` sobre `cloudflare/worker.js` (lo que lee sin sesión, que no filtre la llave más de lo que ya es pública, inyección en `HTMLRewriter` desde `catalogo_nombre` — usar `setAttribute`/`setInnerContent` con texto, nunca HTML) y `esquema-dominio.sql`.
- [ ] **Step 3:** Rama empujada (`git push -u origin fase-2-dominio`) **sin fusionar**.
- [ ] **Step 4 (cuando el dueño termine su guía):** "Run workflow" sobre la rama → Cloudflare publica; github.io no cambia. Se recorre "Cómo se comprueba" del spec en `luxbyemory.com`, `entrar.` y un subdominio de revendedor, con la consola abierta. Solo si todo pasa: fusionar a `main` (eso convierte github.io en reenvío), comprobar `robertsrf.github.io/Lux/#/publico`, y marcar la fase hecha en el README.
