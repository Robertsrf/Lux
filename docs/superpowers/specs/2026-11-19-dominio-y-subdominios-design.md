# Dominio propio, direcciones limpias y un subdominio por revendedor — diseño

Fase 2 de `docs/fases/2026-11-revendedores/`. Decisiones del dueño en el chat
del 19/11/2026. Este documento **reemplaza** lo que `fase-2-dominio.md` decía
de GitHub Pages, del Worker con código y de `www` delante del revendedor: se
decidió otra cosa.

## Por qué

El dueño compró `luxbyemory.com` (Namecheap). Quiere que Lux viva en su
dominio y que **cada revendedor tenga el suyo**, para que sus clientas sientan
el catálogo como de él y no lo asocien con la tienda. Y quiere direcciones que
se dicten sin símbolos raros: **`luxbyemory.com/rv`, no `luxbyemory.com/#/rv`**
("no quiero ese numeral").

## Las direcciones, como las decidió el dueño

| Dirección | Qué abre | Quién |
|---|---|---|
| `luxbyemory.com` | La landing con el catálogo (lo de hoy en `#/publico`; son una sola página) | Clientas |
| `luxbyemory.com/reserva/<token>` | El pedido de la tienda | Clientas |
| `luxbyemory.com/guia-revendedor` | La guía para quien quiere ser revendedor | Cualquiera |
| `luxbyemory.com/rv` (y `/rv/entrar`, `/rv/...`) | El panel del revendedor, con su código | Revendedores |
| `luxbyemory.com/vitrina` | La vitrina del televisor (sin sesión, como hoy) | La tienda |
| `entrar.luxbyemory.com` | Entrar y todo lo del personal: administración y mostrador (`/admin/...`, `/venta/...`, `/clientes`, `/tasas`, `/catalogo`, `/verificacion`) | Administrador y vendedoras |
| `<usuario>.luxbyemory.com` | El catálogo del revendedor en la raíz; `/apartado/<token>` el pedido de su clienta | Sus clientas |

- **Cada revendedor tiene el suyo, con su usuario**: `jadujoyas` es el de
  JaduJoyas, `pedro.luxbyemory.com` sería el de un revendedor `pedro`. Nace
  solo al crearlo en Revendedores: el comodín de Cloudflare cubre cualquier
  nombre, y no se toca Cloudflare por cada revendedor. El usuario es el de
  `revendedores.usuario` (el que ya va en `/#/r/<usuario>`).
- **Sin `www` delante del revendedor** (`jadujoyas.luxbyemory.com`): el
  certificado gratis cubre un nivel; dos niveles se pagan cada mes. El dueño
  lo aceptó ("era un ejemplo").
- **`www.luxbyemory.com` lleva a `luxbyemory.com`.**
- **No hay `/catalogo`**: la landing y el catálogo son una sola página, en la
  raíz (decisión del dueño). Ojo: `/catalogo` ya existe como ruta del personal
  (el catálogo PDF); vive en `entrar.`.
- El panel del revendedor **no** va en su subdominio: su subdominio es solo
  para sus clientas (decisión del dueño).

## Metas, no metas y lo que sería un fracaso

**Metas**
- Las direcciones de la tabla, con candado, sin `#`.
- Seguir publicando con un push a `main`; Cloudflare sirve (decisión del dueño:
  "si seguimos publicando en git y cloudflare lo sirve, fenomenal").
- Nombres reservados: ningún revendedor puede llamarse como una dirección de
  la tienda.

**No metas**
- El rediseño de la landing y el catálogo de Lux: es la **fase 8**, en otro
  chat (ver al final).
- El rediseño del catálogo y el panel del revendedor: fases 6 y 7.
- Correo con el dominio, SEO, analítica.

**Fracaso aunque funcione**
- Que `robertsrf.github.io/Lux/#/publico` deje de llevar a algún lado: ya hay
  imágenes publicadas del 17/11/2026 con esa dirección (tres en
  `Lux contenido/2026-11-17/`).
- Que la clienta de un revendedor pueda caer en una pantalla de Lux (entrar,
  administración, landing) desde su subdominio.
- Que la tienda quede sin sitio durante el cambio: github.io no se convierte
  en redirección hasta que `luxbyemory.com` responde.
- Que una vendedora pierda un conteo a medias (ver "El navegador guarda por
  dirección").

## Cómo se construye: los caminos que se miraron

| Camino | Qué es | Por qué sí o no |
|---|---|---|
| **A. Cloudflare sirve el sitio (elegido)** | El build sale de GitHub Actions y se publica en Cloudflare (Workers con archivos estáticos). Un solo despliegue atiende `luxbyemory.com`, `entrar.` y `*.`. La app pasa de `HashRouter` a `BrowserRouter`. | Única forma de tener `/rv` sin `#` con respuesta 200 (WhatsApp e Instagram enseñan bien la vista previa). Gratis. Cloudflare hacía falta igual para los subdominios. |
| B. GitHub Pages con la página 404 | GitHub responde 404 a `/rv` y la app arranca igual | Las vistas previas de enlaces y Google lo ven como roto. Descartado por el dueño. |
| C. Seguir con `#` y un Worker que reenvía subdominios | Lo que decía `fase-2-dominio.md` | El dueño no quiere el numeral. |
| D. Solo una regla de redirección de subdominio a `luxbyemory.com/#/r/x` | Sin código | La clienta termina en la dirección de Lux. Descartado. |

## El diseño

### 1. Publicar en Cloudflare

- `wrangler.jsonc` en la raíz: un Worker con archivos (`assets.directory:
  ./dist`, `not_found_handling: "single-page-application"`): cualquier ruta
  que no sea un archivo devuelve `index.html` con 200. La app sabe en qué
  dirección está y elige las rutas sola.
- **Su script, `cloudflare/worker.js`, hace una sola cosa: la tarjeta del
  subdominio del revendedor** (decidido el 19/11 con lo que pidió el dueño,
  "que lo principal sea su marca"). Hoy `index.html` lleva para todo el sitio
  el título "Lux by Emory — Catálogo", `og:image` de Lux, el ícono de Lux y un
  JSON-LD `JewelryStore` de Lux: pegado en WhatsApp, `jadujoyas.luxbyemory.com`
  enseñaría la tarjeta de la tienda. En un subdominio de revendedor, y solo
  cuando se pide el HTML, el Worker lee `rv_perfil_publico` (sin sesión, la
  misma que ya lee su catálogo) y reescribe el `<head>` con HTMLRewriter:
  `<title>`, `og:title` y `og:description` con el nombre de su catálogo y
  "Joyas Lux by Emory" en pequeño; `og:image` e ícono con su logo (sin logo,
  ninguna imagen de Lux); y **quita el JSON-LD de Lux**. Con caché corta
  (minutos). Si Supabase no responde o el revendedor no existe o está
  pausado, una tarjeta **neutra** ("Catálogo de joyas"), sin Lux. Los
  archivos (`/assets/...`) y las direcciones `luxbyemory.com` y `entrar.`
  pasan sin tocar el script (`run_worker_first` solo para lo que haga falta,
  o como lo resuelva el constructor sin cobrar una invocación por archivo).
  El script lleva la URL y la llave anónima de Supabase por variables del
  Worker, no escritas en el código. La pestaña también: `CatalogoRevendedor`
  ya pone su `document.title`; el ícono lo cambia la app con su logo.
- Dominios: `luxbyemory.com` y `entrar.luxbyemory.com` como dominios propios
  del Worker; `*.luxbyemory.com/*` como ruta, con un registro DNS comodín
  en naranja (proxied). `www` → `luxbyemory.com` con una regla de
  redirección de Cloudflare (o como lo resuelva el constructor, comprobado).
- `.github/workflows/desplegar.yml`: construye una vez y publica en Cloudflare
  (`cloudflare/wrangler-action`, con `CLOUDFLARE_API_TOKEN` y
  `CLOUDFLARE_ACCOUNT_ID` como secretos del repo, nunca en el código). Las
  variables de Supabase siguen como hoy. Nueva variable: `VITE_DOMINIO_BASE`
  (`luxbyemory.com`).
- **GitHub Pages pasa a ser un reenvío**: el mismo flujo publica en Pages una
  página mínima (`index.html` y `404.html`) que convierte
  `robertsrf.github.io/Lux/#/<ruta>` en la dirección nueva que le toca
  (`#/publico` → `luxbyemory.com/`, `#/r/x` → `x.luxbyemory.com/`,
  `#/venta` → `entrar.luxbyemory.com/venta`, etc.; la misma tabla del punto 3).
  Necesita un script: es otra página, sin la política de la app.
- **El orden del cambio** (no negociable): primero Cloudflare responde en
  `luxbyemory.com` con la versión nueva (probado), y solo después github.io
  se vuelve reenvío. Mientras tanto github.io sigue con la app de siempre.
  **Cómo:** todo se construye en una rama (`fase-2-dominio`) y no se fusiona
  a `main` hasta que `luxbyemory.com` responda desde Cloudflare. El build
  nuevo no funciona en `robertsrf.github.io/Lux/` (con `base: '/'` pide
  `/assets`, y la ruta lleva `/Lux/`), así que no hay convivencia de dos
  versiones: la rama vive mientras el dueño hace sus pasos. El dueño se
  encarga de Cloudflare el 20/11/2026. Para probar antes de fusionar, la rama
  se publica a mano en Cloudflare (la dirección `*.workers.dev` y luego el
  dominio), no en Pages.
- **El token de Cloudflare nunca pasa por el chat ni por el repo**: el dueño
  lo pega como secreto en GitHub. Si hace falta publicar desde este equipo
  (`wrangler login` o el token en una variable de entorno de la sesión), lo
  hace el dueño en su terminal.
- `vite.config.ts`: `base: '/'` (con rutas anidadas, `./assets` se rompería en
  `/admin/inventario`). La política de seguridad (`<meta>`) no cambia:
  `'self'` en cada dirección es esa dirección, y todo se sirve desde ella.
  Comprobarlo con la consola abierta en las tres clases de dirección.

### 2. `src/lib/dominio.ts` (nuevo): la única regla de direcciones

- Lee `VITE_DOMINIO_BASE`. **Sin ella** (desarrollo, una vista previa de
  Cloudflare) el sitio funciona en **una sola dirección**, todas las rutas
  ahí, como hoy pero sin `#`; el catálogo del revendedor en `/r/<usuario>`.
- `dondeEstoy(hostname)` → `'tienda'` (base o `www`), `'entrar'`,
  `{ revendedor: usuario }` o `'unica'` (sin dominio base u otro host).
- Los que arman enlaces, todos aquí: `urlTienda(ruta)`, `urlEntrar(ruta)`,
  `urlRevendedor(usuario, ruta)`. En modo de una sola dirección dan el origen
  de hoy más la ruta.
- `enlaceCatalogoRv`, `enlaceApartado`, `enlacePanelRv`, `enlaceGuiaRv`,
  `enlaceReserva` (`lib/revendedor.ts`) y `enlacePublico`
  (`CompartirCatalogo.tsx`, que alimenta el QR de la vitrina y del catálogo
  PDF) pasan a llamarlos. **Ningún `#/` escrito a mano queda en `src/`**
  (hoy: `Landing.tsx` "Ver la landing", la pista de usuario en
  `Revendedores.tsx`, comentarios).

### 3. Las rutas según la dirección

`App.tsx` pasa a `BrowserRouter`. Antes de montar el router, **un enlace viejo
con `#/` se convierte en su ruta** (`history.replaceState`), y después aplica
la tabla:

| Estoy en | Ruta | Pasa |
|---|---|---|
| tienda | `/` | La landing con el catálogo (lo que hoy es `/publico`) |
| tienda | `/publico` (enlace viejo) | → `/` conservando `?tipo=`, `?ver=`, `?para=` |
| tienda | `/reserva/…`, `/guia-revendedor`, `/rv…`, `/vitrina` | Se abre |
| tienda | `/r/<usuario>` | → `https://<usuario>.luxbyemory.com/` |
| tienda | `/apartado/<token>` | → al subdominio de su revendedor (lo sabe al leer el pedido) |
| tienda | `/entrar` o cualquier ruta del personal | → la misma ruta en `entrar.luxbyemory.com` |
| entrar | `/` | Lo de hoy en `Inicio`: entrar o su pantalla de inicio |
| entrar | rutas del personal, `/entrar` | Se abren |
| entrar | cualquier otra | → la misma en `luxbyemory.com` |
| revendedor | `/` | Su catálogo (lo de `/r/<usuario>`) |
| revendedor | `/apartado/<token>` | Su pedido; si el pedido es de **otro** revendedor, → al subdominio de ese |
| revendedor | cualquier otra | → `/` de su subdominio. Nunca una pantalla de Lux |
| única | todas | Como hoy, sin `#` |

- Un revendedor pausado o que no existe: su subdominio dice "Este catálogo
  no está disponible" sin nombrar a Lux (ya lo hace `CatalogoRevendedor`, y la
  base no distingue pausado de inexistente: así no se averigua quién está
  pausado).
- `luxbyemory.com/rv` lo escribe el revendedor **tal cual**, y la barra lo
  sigue diciendo así.

### 4. Nombres reservados (SQL #69)

- `esquema-dominio.sql` (#69): una función inmutable `usuario_rv_valido(text)`
  y el `check` de `revendedores.usuario` la usa:
  - 3 a 30 caracteres, minúsculas, cifras y guion; **ni empieza ni termina en
    guion** (hoy puede terminar en guion, y eso no es un subdominio válido);
    sin `--` en las posiciones 3–4 (`xn--`, nombres internacionales).
  - Fuera de una lista de reservados: al menos `www`, `entrar`, `admin`,
    `api`, `app`, `mail`, `correo`, `smtp`, `ftp`, `tienda`, `lux`,
    `luxbyemory`, `emory`, `rv`, `r`, `catalogo`, `vitrina`, `publico`, `guia`,
    `reserva`, `apartado`, `venta`, `pagos`, `soporte`, `ayuda`, `blog`,
    `static`, `assets`, `cdn`, `dev`, `test`, `staging`. (El constructor
    puede sumar; no quitar `entrar` ni `www`.)
  - Antes de poner el `check`, el `.sql` busca revendedores que ya lo
    rompan y, si hay, **para y los nombra** (no los renombra solo).
- El navegador repite la regla en `usuarioValido` (`lib/revendedor.ts`), con la
  lista en una constante y un mensaje claro ("Ese nombre lo usa la tienda").
  Dos copias como `CATEGORIAS_CAJA`; la base manda. `verificar` (o una prueba
  de `npm run pruebas`) compara las dos listas.
- Lo usan el formulario de Revendedores y la solicitud de la guía
  (`GuiaRevendedorPiezas`, "usuario libre"). `usuarioDesdeNombre` no debe
  proponer un nombre reservado.

### 5. El navegador guarda por dirección

Cada dirección tiene su propio almacenamiento. Consecuencias, todas aceptadas
y avisadas al dueño:
- Administrador y vendedoras **entran una vez más** en `entrar.`.
- **El conteo a medias** (`lux-conteo-v2-<ubicación>`) se queda en la
  dirección vieja: el cambio se hace **sin un conteo abierto**, y la guía del
  dueño lo dice.
- El revendedor entra una vez más con su código.
- La clienta pierde su carrito, sus códigos guardados (`lux-codigos-v1`; el
  código sigue valiendo en la base) y "Letra grande".
- El televisor de la vitrina hay que abrirlo en `luxbyemory.com/vitrina` y
  volver a elegir sus ajustes.

### 6. Lo que hace el dueño (con una guía paso a paso)

Se le entrega con la skill `wizard` o como lista guiada (decide el
constructor), con lo que hace en cada pantalla y cómo se comprueba:
1. Cloudflare: cuenta gratis, "Add a site", plan Free, los dos nameservers.
2. Namecheap: Nameservers → Custom DNS con los de Cloudflare. No comprar SSL
   ni PremiumDNS.
3. Cloudflare: un token de API para publicar, y el ID de la cuenta; los dos
   como secretos en GitHub (Settings → Secrets and variables → Actions). La
   variable `VITE_DOMINIO_BASE`.
4. Los dominios del Worker y el registro comodín; SSL/TLS en Full (strict);
   "Always Use HTTPS".
5. Supabase → Authentication → URL Configuration: Site URL
   `https://entrar.luxbyemory.com` (por orden; hoy se entra con correo y
   contraseña y no se usa).
6. Cambiar el enlace de Instagram/WhatsApp y el televisor.

## Cómo se comprueba

- `https://luxbyemory.com` abre la landing con candado; `http://` y `www.`
  llevan a `https://luxbyemory.com`.
- `luxbyemory.com/rv` abre el panel del revendedor y la barra dice `/rv`.
- `https://entrar.luxbyemory.com` pide entrar; `luxbyemory.com/admin/inventario`
  lleva a `entrar.`.
- `jadujoyas.luxbyemory.com` pegado en WhatsApp enseña su nombre y su logo,
  no la tarjeta de Lux; un usuario que no existe, la tarjeta neutra.
- `https://jadujoyas.luxbyemory.com` abre su catálogo con candado; un usuario
  que no existe dice "Este catálogo no está disponible";
  `jadujoyas.luxbyemory.com/admin` y `/entrar` caen en su catálogo.
- `robertsrf.github.io/Lux/#/publico` llega a `luxbyemory.com`;
  `…/#/r/jadujoyas` a su subdominio.
- El QR de la vitrina y del catálogo PDF dicen `luxbyemory.com`.
- La consola no muestra bloqueos de la política de seguridad en las tres
  clases de dirección (fotos de Supabase, la función de vendedoras, el
  tiempo real).
- Un enlace a `luxbyemory.com/rv` pegado en WhatsApp enseña vista previa.
- `npm run pruebas`, `npm run build` y `npm run verificar` (hay `.sql`).

## Lo que queda al constructor

- Cómo se conecta el script solo a las peticiones de HTML del subdominio
  (y que las rutas comodín sirvan los archivos), comprobado en la
  documentación vigente de Cloudflare el día que se haga.
- Cómo se resuelve `www` (regla de redirección o dominio del Worker).
- `rv_ver_apartado` ya devuelve el `usuario`: el reenvío de
  `luxbyemory.com/apartado/<token>` al subdominio sale de ahí, sin SQL nuevo.
- Si el reenvío de github.io va en el mismo flujo o en uno aparte.
- Dónde exactamente se aplica la tabla del punto 3 (un componente de rutas por
  dirección, o guardias en cada grupo de rutas).
- `<link rel="canonical">` y las etiquetas de vista previa, si salen baratas.

## Documentos que cambian

- `CLAUDE.md`: **la regla del `HashRouter` cambia** (ahora `BrowserRouter`,
  servido por Cloudflare, y por qué); el árbol (`lib/dominio.ts`,
  `wrangler.jsonc`); la regla del subdominio en "Los revendedores"; las rutas
  escritas con `/#/` en todo el archivo; `usuario_rv_valido`.
- `INSTALACION.md`: el #69, Cloudflare, los secretos y la variable.
- `ESTADO.md`: **la renovación anual del dominio en Namecheap** (caduca: la
  fecha exacta en Namecheap), el token de Cloudflare (si caduca) y el reenvío
  de github.io.
- `docs/fases/2026-11-revendedores/README.md`: fase 2 hecha, y la **fase 8**
  nueva en la tabla.
- `docs/fases/2026-11-revendedores/fase-8-landing-de-lux.md` (nuevo).

## La fase 8, que nace aquí

El dueño pidió (19/11/2026) rehacer la landing con el catálogo de Lux:
"modelos de inspiración de landing con catálogos espectaculares, ya probados
que funcionen y que se vean increíbles, con buenas animaciones, motions,
entendibles para cualquier usuario, que sean landing profesionales que
parezca de este año". En esa fase los orquestadores de diseño
(`disenio-web-pro`, `frontend-design`, `ui-ux-pro-max`, las de Emil para el
movimiento) **ignoran `lux-ui`, DESIGN.md y toda regla visual de Lux; respetan
solo los colores y la tipografía de la marca**. Lo que no es visual sigue:
ningún costo a la vista, ninguna cifra inventada, y el contraste legible
(pendiente de confirmar con el dueño al empezar esa fase). Va después de la
fase 2, porque vive en `luxbyemory.com`. Se escribe su archivo al cerrar esta.
