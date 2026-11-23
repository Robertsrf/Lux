# El catálogo del revendedor, rediseñado — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (pedido del dueño: Claude construye en el mismo chat, sin agente por tarea). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el catálogo de cada revendedor y el pedido de su clienta se vean de su marca, en tres plantillas, con un tema que él y el dueño personalizan (logo incluido), sin perder nada de lo que hoy funciona.

**Architecture:** Un cerebro (`useCatalogoRv`) con toda la lógica del catálogo actual; tres plantillas que solo dibujan lo que el cerebro les da; un tema validado en la base (`revendedores.tema`) y normalizado y medido en el navegador (`tema.ts`) antes de llegar al CSS. El logo lo sube él por una función de servidor que comprueba su testigo.

**Tech Stack:** Vite + React 19 + TypeScript estricto + CSS plano; Supabase (Postgres, Storage, Edge Functions en Deno); `@fontsource`; pruebas con `node --test` y PGlite.

**Spec:** `docs/superpowers/specs/2026-11-23-catalogo-del-revendedor-design.md`

## Global Constraints

- Rama `fase-6-catalogo`. SQL nuevo: **#73 `esquema-catalogo-revendedor.sql`**.
- Primero el SQL, después el navegador; ninguna función pierde un parámetro. `rv_ajustes` y `revendedores.paleta` no cambian.
- Texto de Lux, exacto: «Joyería hipoalergénica Lux by Emory · acero 316L, titanio y baño de oro 18K · certificada SGS». En el pie y en la ficha. Ningún contacto de Lux.
- Plantillas: `editorial` | `tienda` | `lookbook`. Letras: `elegante` (Bodoni Moda) | `moderna` (Outfit) | `clasica` (Marcellus) | `revista` (Playfair Display) | `amable` (Nunito). Esquinas: `rectas` | `suaves` | `redondas`. Frase: 1 a 90 letras.
- Texto a 4,5:1 medido, en cualquier color que se guarde.
- Precios: Bs y $ BCV del mismo tamaño (`formatearBs`, `formatearBcv`); nada de $ Binance.
- Ni un costo, ni el piso, ni lo que él paga a Lux en nada que lea su catálogo.
- Ficheros en CRLF; TypeScript sin `any`; `useMemo` antes del primer `return`.
- Los componentes de `src/paginas/revendedor/catalogo/` no usan clases ni tokens de Lux (`.boton`, `.tarjeta`, `var(--verde-profundo)`...).
- Harness de PGlite: copiar `C:\Users\WF\AppData\Local\Temp\claude\d93c7f308e990546\387ece49-9d0d-436b-8d82-9d1ee5978c17\scratchpad\pg\` (instalar.mjs, orden.txt, base71, package.json, node_modules) al scratchpad de esta sesión; `base72` = base71 + #72.

**Ajuste al diseño:** `rv_ver_apartado` y `rv_resumen` no se tocan; el tema lo da solo `rv_perfil_publico` (el pedido y el panel ya saben el usuario y lo piden). Evita reescribir dos funciones de cien líneas para añadir una clave.

## Review Focus

1. **Un revendedor sin tema** (todos los de hoy): su catálogo sale en la plantilla Tienda con los colores de su paleta, legible. → prueba en Tarea 2 (`temaResuelto(null, 'vino')`).
2. **La pieza de portada se agotó o se retiró**: sale otra con foto, la misma durante la visita, sin error. → prueba en Tarea 2 (`elegirPortada`).
3. **Fondo oscuro elegido con la plantilla Tienda** (pensada clara): textos, botones, bordes y la hoja del pedido legibles. → prueba en Tarea 2 (todos los pares derivados ≥ 4,5 con `fondo: '#111111'`).
4. **Un enlace viejo `?paso=apartar` sin piezas** (o recargar la hoja del pedido): vuelve al catálogo, no a una hoja vacía. → paso de comprobación en Tarea 6.
5. **Un logo muy apaisado (6:1) o ninguno**: el nombre del catálogo sigue visible y nada se sale a 360 px. → paso de datos feos en Tarea 9.

---

### Task 1: La base — el tema y el logo (SQL #73)

**Files:**
- Create: `esquema-catalogo-revendedor.sql`
- Create (scratchpad): `pg/prueba-73.mjs`, `pg/base72`
- Modify: `INSTALACION.md` (fila 73 y cómo publicar `logo-revendedor`), `scripts/verificar.mjs`

**Interfaces:**
- Produces:
  - `revendedores.tema jsonb` (null = sale de `paleta`), `check (rv_tema_valido(tema))`.
  - `rv_tema_valido(p jsonb) returns boolean` immutable: null → true; si no, objeto con solo las claves `plantilla, principal, fondo, letra, esquinas, portada, frase`, cada una opcional y de su lista/forma (colores `^#[0-9a-fA-F]{6}$`; `portada` entero > 0 o null; `frase` string 1–90 sin `[[:cntrl:]]`, o null). Ejecutable por `anon, authenticated` (la usa el `check` en cualquier `update`).
  - `rv_guardar_tema(p_sesion text, p_tema jsonb) returns void` (anon, authenticated): `rv_de_sesion`; si `p_tema ? 'portada'` y no es null, la pieza tiene que estar en `rv_catalogo_publico(su usuario)` → si no, `raise 'Esa pieza no está en tu catálogo.'`; frase recortada (`btrim`), vacía → quita la clave; `check_violation` → `'El tema tiene un valor que no sirve. Recarga la página.'`.
  - `admin_tema_revendedor(p_revendedor bigint, p_tema jsonb) returns void` (authenticated, `if not es_admin() then raise`): misma validación de portada con el usuario del revendedor.
  - `rv_perfil_publico(p_usuario)`: el mismo objeto + `'tema', r.tema` al final.
  - `rv_usuario_para_logo(p_sesion text) returns text` y `rv_poner_logo(p_sesion text, p_ruta text) returns void`: revocadas a `public, anon, authenticated`; `grant execute ... to service_role`. `rv_poner_logo` exige `p_ruta ~ ('^revendedores/' || usuario || '/[0-9]{10,16}\.(webp|png|jpe?g)$')`.

- [ ] **Step 1:** `git checkout -b fase-6-catalogo`; copiar el harness; `node instalar.mjs <repo> base72 72` → "instalados 72".
- [ ] **Step 2: Prueba que falla** — `prueba-73.mjs` sobre copia de base72, con los datos de `prueba-72.mjs` (JaduJoyas `T-JADU-…`, Otro `T-OTRO-…`, piezas A y C con existencia, un modelo `X` sin existencia ni inventario). Comprobaciones:
  - `rv_tema_valido` acepta `{"plantilla":"lookbook","principal":"#AABBCC","frase":"Hola"}`, `null`, `{}`; rechaza `{"plantilla":"otra"}`, `{"principal":"red"}`, `{"principal":"#abc"}`, `{"letra":"comic"}`, `{"esquinas":"x"}`, `{"frase":""}`, frase de 91, frase con `\n`, `{"portada":-1}`, `{"portada":"1"}`, `{"extra":1}`, `[]`.
  - como `anon`: `rv_guardar_tema('T-JADU…', '{"plantilla":"editorial","portada":<A>,"frase":"  Brillo  "}')` → `tema->>'frase' = 'Brillo'`; con portada `<X>` falla "no está en tu catálogo"; con testigo malo, código `28000`; `null` deja `tema is null`.
  - `rv_perfil_publico('jadujoyas')` trae `tema` y las claves de antes intactas (`paleta`, `logo_path`, `horas_pago`...), sin ninguna clave con `costo|piso|lux`.
  - `admin_tema_revendedor` como vendedora falla; como admin escribe; sin sesión falla.
  - `rv_usuario_para_logo` y `rv_poner_logo` como `anon` y `authenticated`: permiso denegado. Como `service_role`: `rv_usuario_para_logo('T-JADU…') = 'jadujoyas'`; `rv_poner_logo('T-JADU…','revendedores/jadujoyas/1763900000000.webp')` escribe `logo_path`; con `revendedores/otrorv/1763900000000.webp`, `revendedores/jadujoyas/../x.webp` o `.gif` falla.
  - Correr el #73 dos veces no da error.
- [ ] **Step 3:** `node prueba-73.mjs <repo>` → falla (no existe el archivo).
- [ ] **Step 4:** Escribir `esquema-catalogo-revendedor.sql` con cabecera (qué hace, decisiones del dueño del 23/11/2026, depende del #72, "debería dar": `select count(*) from revendedores where tema is not null` → 0; `rv_perfil_publico('<uno>') ? 'tema'` → true).
- [ ] **Step 5:** `node prueba-73.mjs <repo>` → todas bien, 0 fallas.
- [ ] **Step 6:** `scripts/verificar.mjs`: sin sesión, `rv_perfil_publico('nadie')` responde; con las dos sesiones, `rv_usuario_para_logo` y `rv_poner_logo` dan error de permiso (42501); `rv_guardar_tema` con testigo inventado da 28000. Fila 73 en `INSTALACION.md`.
- [ ] **Step 7: Revisión de seguridad** (README paso 6): agente `backend-api-security:backend-api-security-backend-security-coder` sobre `rv_guardar_tema`, `rv_tema_valido` y las dos del logo. Corregir lo que salga, volver a correr la prueba.
- [ ] **Step 8: Commit** `fase 6: #73, el tema del revendedor y las funciones del logo`.

### Task 2: `tema.ts` — normalizar, medir y derivar

**Files:**
- Create: `src/paginas/revendedor/catalogo/tema.ts`
- Test: `scripts/pruebas/tema-rv.test.mjs`
- Modify: `src/lib/tipos.ts` (`PerfilRevendedor.tema?: TemaGuardado | null`)

**Interfaces:**
- Produces:
  - `type Plantilla = 'editorial' | 'tienda' | 'lookbook'`; `type Letra = 'elegante' | 'moderna' | 'clasica' | 'revista' | 'amable'`; `type Esquinas = 'rectas' | 'suaves' | 'redondas'`.
  - `interface TemaGuardado { plantilla?; principal?; fondo?; letra?; esquinas?; portada?: number | null; frase?: string | null }` (lo de la base).
  - `interface TemaResuelto { plantilla: Plantilla; letra: Letra; esquinas: Esquinas; portada: number | null; frase: string | null; colores: ColoresRv }`.
  - `interface ColoresRv { fondo, superficie, texto, textoSuave, linea, boton, sobreBoton, acento: string }` (todo `#rrggbb`).
  - `PLANTILLAS: { id: Plantilla; nombre: string; letra: Letra; esquinas: Esquinas; fondo: 'claro' | 'oscuro'; frase: string }[]` (Editorial/elegante/rectas/claro, Tienda/moderna/suaves/claro, Lookbook/clasica/redondas/oscuro).
  - `TEMAS_LISTOS: { id: PaletaRevendedor | 'cobalto'; nombre: string; principal: string; fondo: string }[]`: las seis paletas (principal = su `--verde-profundo`, fondo = su `--papel`; Lux `#1F4045` / `#F4EFE4`).
  - `contraste(a: string, b: string): number` (WCAG 2.x).
  - `normalizarTema(t: unknown): TemaGuardado` (lo desconocido se cae).
  - `temaResuelto(t: TemaGuardado | null | undefined, paleta: PaletaRevendedor | null | undefined): TemaResuelto` — sin tema: plantilla `tienda` y colores de la paleta (por defecto `lux`); sin fondo: el de la plantilla (claro `#FFFFFF`, oscuro `#1A1216`).
  - `variablesCss(t: TemaResuelto): Record<string, string>` → `--rvc-fondo`, `--rvc-superficie`, `--rvc-texto`, `--rvc-texto-suave`, `--rvc-linea`, `--rvc-boton`, `--rvc-sobre-boton`, `--rvc-acento`, `--rvc-radio` (rectas 0, suaves 14px, redondas 24px), `--rvc-radio-boton` (0 / 12px / 999px), `--rvc-letra-titulos`, `--rvc-letra-texto`.
  - `avisoContraste(principal: string, fondo: string): { razon: number; ajustado: string | null }` (para el panel).
  - `elegirPortada<T extends { id: number; foto_path: string | null }>(piezas: T[], portada: number | null, semilla: number): T | null`.

- [ ] **Step 1: Pruebas que fallan** (`tema-rv.test.mjs`, importando `../../src/paginas/revendedor/catalogo/tema.ts`):
  - `contraste('#000000','#FFFFFF')` ≈ 21; `contraste('#777777','#FFFFFF')` ≈ 4,48.
  - para los seis `TEMAS_LISTOS` en las tres plantillas, y para `{principal:'#F7C948', fondo:'#FFFFFF'}`, `{principal:'#808080', fondo:'#808080'}`, `{principal:'#000000', fondo:'#000000'}`, `{principal:'#2B3FD1', fondo:'#111111'}`: `contraste(texto,fondo)`, `contraste(textoSuave,fondo)`, `contraste(textoSuave,superficie)`, `contraste(sobreBoton,boton)`, `contraste(acento,fondo)` ≥ 4,5.
  - con el amarillo sobre blanco, `avisoContraste` da `razon` < 2 y `ajustado` distinto de null; con `#2B3FD1` sobre blanco, `ajustado` null.
  - `temaResuelto(null,'vino')` → plantilla `tienda`, `colores.boton` derivado de `#5B1F2E`.
  - `normalizarTema({plantilla:'x', principal:'red', frase:'a'.repeat(91), extra:1})` → `{}`; conserva lo válido.
  - `elegirPortada(piezas, idQueEsta, 3)` → esa; con id que no está o sin foto → una con foto, la misma para la misma semilla; sin piezas con foto → null.
- [ ] **Step 2:** `npm run pruebas` → falla (no existe).
- [ ] **Step 3:** Implementar. Ajuste: mover la luminosidad del color hacia negro o blanco (según el fondo) en pasos de 2 % hasta 4,5:1; `textoSuave` = mezcla de `texto` hacia `fondo` lo más lejos que siga ≥ 4,5 sobre fondo y superficie; `superficie` = fondo aclarado/oscurecido 4 %; `linea` puede quedar a 1,5–3 (es línea, no texto).
- [ ] **Step 4:** `npm run pruebas` → pasa.
- [ ] **Step 5: Commit** `fase 6: tema del revendedor (normalizar, contraste, colores)`.

### Task 3: Las letras

**Files:**
- Modify: `package.json` (`@fontsource/bodoni-moda`, `outfit`, `marcellus`, `playfair-display`, `nunito`, `manrope`, `dm-sans`, `figtree`, versión 5.x como las de hoy)
- Create: `src/paginas/revendedor/catalogo/letras.ts`

**Interfaces:**
- Produces: `cargarLetras(t: TemaResuelto): Promise<void>` (un `import()` fijo por letra de títulos y por letra de texto de la plantilla: `latin-500`/`latin-700` según la letra; texto `latin-400` y `latin-700`); `FAMILIA_TITULOS: Record<Letra, string>` y `FAMILIA_TEXTO: Record<Plantilla, string>` (pila con respaldo: `serif` o `system-ui, sans-serif`); `cargarTodasLasTitulos(): Promise<void>` (el panel).

- [ ] **Step 1:** `npm install` de las ocho; comprobar que existen `node_modules/@fontsource/<x>/latin-<peso>.css` de cada import.
- [ ] **Step 2:** Implementar `letras.ts` (solo `import()` con rutas literales: Vite las parte; nada en `main.tsx`).
- [ ] **Step 3:** `npm run build` → OK; en `dist/assets` hay `.woff2` por letra y **ninguno** se precarga en `dist/index.html`.
- [ ] **Step 4: Commit** `fase 6: las letras del catálogo del revendedor, cargadas al pedirlas`.

### Task 4: El cerebro (`useCatalogoRv`)

**Files:**
- Create: `src/paginas/revendedor/catalogo/useCatalogoRv.ts`, `src/paginas/revendedor/catalogo/tipos.ts`

**Interfaces:**
- Consumes: `temaResuelto`, `elegirPortada` (T2); `cargarLetras` (T3).
- Produces: `useCatalogoRv(usuario: string): CatalogoRv` con, en `tipos.ts`:
  - estado: `perfil: PerfilRevendedor | null`, `perfilListo`, `tema: TemaResuelto`, `error`, `cargando`, `listo` (filas de la consulta actual), `familias: Familia<ModeloRevendedor>[]`, `estantes` (`porCategoria`), `categorias: string[]`, `tiposConFoto: { nombre; cuantas; foto: FuenteFoto | null }[]`, `portada: ModeloRevendedor | null`, `enLista`, `alTope: boolean` (llegó a 400), `primerNombre`, `escribirle: string | null` (su WhatsApp).
  - ruta: `categoria`, `setCategoria`, `para`, `elegirPara`, `texto`, `setTexto`, `alInicio()`, `pedidoAbierto` (`?paso=apartar`), `abrirPedido()`, `cerrarPedido()`.
  - selección: `resumen: { piezas; totalUsd }`, `llevas(id)`, `disponible(id)`, `agregar(id)`, `cambiar(id, n)`, `vaciar()`, `elegidos: { m: ModeloRevendedor; cantidad }[]`.
  - ficha: `fichaAbierta: Familia<ModeloRevendedor> | null`, `abrirFicha(clave)`, `cerrarFicha()`, `esBase(id)`, `dijes: ModeloRevendedor[] | null`, `cargarDijes()`, `armarCon(baseId, dijeId): string | null` (null o el error dicho).
  - pedido: `datos`, `setDatos`, `buscarSuClienta`, `apartando`, `apartar()`.
  - letra grande: `letraGrande`, `alternarLetra`.
- Todo sale de `CatalogoRevendedor.tsx` tal cual (consultas, `turno`, `cargadoPara`, `porId`, `paresVigentes`, título y favicon de la pestaña, `navegar('/apartado/…')`), más: `cargarLetras(tema)`, la semilla de portada (`useState(() => Math.floor(Math.random()*1e9))`) y `useLetraGrande`.

- [ ] **Step 1:** Escribir `tipos.ts` y el hook moviendo la lógica (sin dibujar nada).
- [ ] **Step 2:** `npx tsc --noEmit` → OK.
- [ ] **Step 3: Commit** `fase 6: el cerebro del catálogo del revendedor`.

### Task 5: Las piezas comunes

**Files:**
- Create en `src/paginas/revendedor/catalogo/piezas/`: `Marca.tsx`, `Buscador.tsx`, `BarraPedido.tsx`, `PieLux.tsx`, `Ficha.tsx`, `HojaPedido.tsx`, `Tarjeta.tsx`; `src/paginas/revendedor/catalogo/catalogo-rv.css`

**Interfaces:**
- Consumes: `CatalogoRv` (T4).
- Produces (todas reciben `c: CatalogoRv` salvo donde se diga):
  - `Marca({ c, variante: 'centro' | 'lado' })`: logo `object-fit: contain`, alto `clamp(56px, 22vw, 96px)`, ancho máx. 80 %; sin logo, `catalogo_nombre` en la letra de títulos. Siempre `<h1>` o texto con el nombre (visualmente oculto si hay logo).
  - `Buscador({ c, conTipos: boolean })`: campo de búsqueda con `<label>`, "Todas · Dama · Caballero" (botones con `aria-pressed`), y si `conTipos`, los tipos en fichas.
  - `Tarjeta({ c, familia, forma: 'grande' | 'normal' | 'fila' })`: `<article>`, foto que abre la ficha, nombre, Bs y $ BCV, "Agregar" / contador / "Elegir medida" (familias con más de una medida). Nunca un botón dentro de otro.
  - `Ficha({ c })`: hoja (`role="dialog"`, `aria-modal`, foco atrapado, Escape cierra) con foto, medidas en fichas (más de 8: `cuadroDe`), "Agregar", "Agrégale un dije" en bases (lista de `c.dijes` dentro), `PieLux`.
  - `HojaPedido({ c })`: piezas con contador, total Bs y $ BCV, `TusDatos` (con `buscar={c.buscarSuClienta}`, `vendedor={c.primerNombre}`), las cifras de `horas_pago`, `inicial_pct`, `dias_credito` (sin cifra, la frase sin cifra), "Apartar mis piezas", `queFalta`.
  - `BarraPedido({ c })`: fija abajo con safe-area, "N piezas", total en Bs, "Ver mi pedido".
  - `PieLux()`: el texto exacto de Lux.
- `catalogo-rv.css`: todo bajo `.rvc`, sobre `--rvc-*`; `.rvc` redefine dentro los tokens de Lux que lee `TusDatos` (`--tinta`, `--papel`, `--panel`, `--linea`, `--verde-profundo`, `--salvia-texto`, `--error`) a partir de `--rvc-*`; objetivos táctiles ≥ 44 px; `prefers-reduced-motion`; tamaños en `rem`.

- [ ] **Step 1:** Escribir las piezas y el CSS.
- [ ] **Step 2:** `npx tsc --noEmit` → OK; `grep -rn "className=\"boton\|tarjeta\b\|var(--verde-profundo" src/paginas/revendedor/catalogo` → nada (salvo el bloque de `.rvc` que redefine tokens para `TusDatos`).
- [ ] **Step 3: Commit** `fase 6: piezas del catálogo del revendedor (marca, buscador, tarjeta, ficha, pedido)`.

### Task 6: Las tres plantillas y la ruta

**Files:**
- Create: `src/paginas/revendedor/catalogo/CatalogoRv.tsx`, `plantillas/Editorial.tsx`, `plantillas/Tienda.tsx`, `plantillas/Lookbook.tsx`, `plantillas/editorial.css`, `plantillas/tienda.css`, `plantillas/lookbook.css`
- Modify: `src/App.tsx` (la ruta del catálogo del revendedor apunta a `CatalogoRv`)
- Delete: `src/paginas/revendedor/CatalogoRevendedor.tsx`

**Interfaces:**
- Consumes: T4, T5.
- Produces: `CatalogoRv()` (misma ruta, `usuario` de la ruta o del subdominio): estados "abriendo", "no disponible" (sin nombrar a Lux, como hoy), aplica `variablesCss` en el contenedor `.rvc rvc--<plantilla>` y pone `document.body.style.background` al fondo mientras está abierta; monta `PLANTILLA[tema.plantilla]({ c })`.
- Cada plantilla, como en las maquetas (spec §2): cabecera con `Marca`, botón "Letra grande", "Escríbeme" si hay WhatsApp; portada (`c.portada` + `c.tema.frase ?? PLANTILLAS[..].frase`); `Buscador`; inicio con un estante de `POR_ESTANTE` (4) por tipo y "Ver los N"; lista (tipo, búsqueda) con "Ver más" de 24 en 24 y el aviso del tope de 400; vacío con "Ver todas las joyas"; su contacto al final; `PieLux`; `BarraPedido`, `Ficha` y `HojaPedido`. Lookbook: filas con `overflow-x: auto` y `scroll-snap` en el teléfono, cuadrícula desde 900 px. Tienda: menú lateral de tipos desde 900 px.

- [ ] **Step 1:** Escribir `CatalogoRv` y las tres plantillas; cambiar la ruta; borrar el viejo.
- [ ] **Step 2:** `npm run build` → OK.
- [ ] **Step 3: Comprobar en el navegador** (`npm run dev`, `/r/<un revendedor de prueba>` o `VITE_DOMINIO_BASE=lux.localhost`), en cada plantilla (cambiándola con `admin_tema_revendedor` desde la prueba o el panel): buscar, Dama/Caballero en la ruta, un tipo y atrás, agregar desde la tarjeta y desde la ficha, una pieza con medidas, "Agrégale un dije", elegir algo, buscar otra cosa y que lo elegido siga sumando, abrir el pedido, recargar con `?paso=apartar` (vuelve al catálogo si no hay piezas), apartar con una cédula de prueba y llegar a `/apartado/<token>`, Letra grande.
- [ ] **Step 4: Commit** `fase 6: tres plantillas (Editorial, Tienda, Lookbook) para el catálogo del revendedor`.

### Task 7: El pedido de su clienta con su tema

**Files:**
- Modify: `src/paginas/revendedor/ApartadoPublico.tsx`; Create: `src/paginas/revendedor/catalogo/apartado-rv.css`

**Interfaces:**
- Consumes: `temaResuelto`, `variablesCss`, `cargarLetras`, `Marca`, `PieLux`.
- `ApartadoPublico` pide además `rv_perfil_publico(apartado.usuario)` (mirado su error: si falla, sigue con la paleta, como hoy) y se viste con `.rvc`; deja `useTemaRv`. Su lógica (fases, `PagoMovil`, `ReportarPago`, el salto de subdominio) no cambia. Gana "Letra grande".

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npm run build` → OK; abrir un pedido de prueba en las tres plantillas y con un tema oscuro.
- [ ] **Step 3: Commit** `fase 6: el pedido de su clienta con su marca`.

### Task 8: El logo desde su panel (función de servidor)

**Files:**
- Create: `supabase/functions/logo-revendedor/index.ts`, `supabase/functions/logo-revendedor/reglas.ts`
- Test: `scripts/pruebas/logo-rv.test.mjs`
- Modify: `src/lib/fotos.ts` (`achicarLogo(archivo): Promise<Blob>` sale de `subirLogoRevendedor`, que la usa), `src/lib/revendedor.ts` (`subirMiLogo(archivo: File): Promise<string>`), `INSTALACION.md`

**Interfaces:**
- Produces:
  - `reglas.ts` (puro, sin Deno): `tipoDeImagen(bytes: Uint8Array): 'webp' | 'png' | 'jpeg' | null` (por los primeros bytes), `LOGO_MAX_BYTES = 300_000`, `rutaDeLogo(usuario: string, ahora: number, tipo: 'webp' | 'png' | 'jpeg'): string` → `revendedores/<usuario>/<ahora>.<webp|png|jpg>`.
  - La función: `POST` multipart `{ sesion, archivo }`, CORS como `vendedoras`; `rv_usuario_para_logo` (28000 → 401 "Tu sesión se cerró…"); tipo y tamaño (400 "Sube el logo en JPG, PNG o WebP, de menos de 300 KB."); `storage.from('fotos').upload(ruta, bytes, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })` (con el `contentType` y la extensión de su tipo real); `rv_poner_logo`; responde `{ ruta }`.
  - `subirMiLogo`: `achicarLogo` → `supabase.functions.invoke('logo-revendedor', { body: FormData })` con el testigo de `leerSesionRv()`; 401 → `SesionRvCerrada`; si la función no existe (404 o error de red) → `Error('Todavía no se puede subir desde aquí: mándale tu logo a Lux por WhatsApp.')`.
- El navegador siempre manda WebP; el servidor acepta los tres por si un navegador no sabe hacer WebP.

- [ ] **Step 1: Pruebas que fallan** (`logo-rv.test.mjs`): `tipoDeImagen` con la cabecera RIFF…WEBP, la de PNG (`89 50 4E 47`), la de JPEG (`FF D8 FF`), un GIF y un texto → `webp`, `png`, `jpeg`, null, null; `rutaDeLogo('jadujoyas', 1763900000000, 'webp')` → `revendedores/jadujoyas/1763900000000.webp`.
- [ ] **Step 2:** `npm run pruebas` → falla.
- [ ] **Step 3:** Implementar `reglas.ts`, la función y el cliente.
- [ ] **Step 4:** `npm run pruebas` → pasa; `npx tsc --noEmit` → OK. (La función se prueba publicada; ver Task 10.)
- [ ] **Step 5: Commit** `fase 6: el revendedor sube su logo (función logo-revendedor)`.

### Task 9: Personalizar — su panel y el del dueño

**Files:**
- Create: `src/paginas/revendedor/catalogo/EditorTemaRv.tsx`, `src/paginas/revendedor/catalogo/editor-tema.css`
- Modify: `src/paginas/revendedor/panel/MiCatalogoRv.tsx`, `src/paginas/admin/Revendedores.tsx`

**Interfaces:**
- Consumes: `PLANTILLAS`, `TEMAS_LISTOS`, `normalizarTema`, `avisoContraste`, `cargarTodasLasTitulos`.
- Produces: `EditorTemaRv({ valor: TemaGuardado, alCambiar: (t: TemaGuardado) => void, piezas: { id; nombre; foto_thumb_path }[] | null, paleta: PaletaRevendedor })`: Plantilla (tres con miniatura), Colores (temas listos: elegir uno escribe `principal` y `fondo`; "O los tuyos": dos campos `#rrggbb` con muestra y `<input type="color">`, y el aviso de `avisoContraste` como en la maqueta), Letra de los títulos (las cinco, cada una en su letra), Esquinas, Portada (buscar entre `piezas` por nombre, con miniatura; "Al azar" la quita) y Frase (máx. 90, contador). Los colores escritos se leen con mayúsculas o minúsculas y sin `#`; lo que no es un color no se guarda y se dice.
- `MiCatalogoRv`: "Tu logo" con subir (`subirMiLogo`) y la muestra; `EditorTemaRv` con sus piezas (`rv_catalogo_publico(su usuario)`, `id, nombre, foto_thumb_path`); al guardar, `rv_ajustes` y `rv_datos_pago` como hoy y además `rv_guardar_tema` (después de los otros dos: si el #73 no se ha corrido, el error del tema se dice y lo demás quedó guardado). El tema actual sale de `rv_perfil_publico(su usuario)`.
- `Revendedores`: en el formulario de un revendedor existente, `EditorTemaRv` y "Guardar el catálogo" con `admin_tema_revendedor`.
- Actualizar el comentario de cabecera de `MiCatalogoRv` (ya no "seis paletas y no un selector").

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npm run build` → OK. En el navegador: elegir amarillo `#F7C948` sobre blanco (sale el aviso), guardar, ver el catálogo legible; cambiar plantilla y letra; elegir portada y frase; subir un logo (si la función ya está publicada) o ver el aviso.
- [ ] **Step 3: Datos feos** (`break-ui` a mano, a 360 px y a 1280 px, en las tres plantillas): nombre de catálogo de 60 letras, logo apaisado 6:1, logo cuadrado, sin logo, 0 piezas, ~400 piezas, una pieza con 52 medidas, frase de 90. Y DevTools con CPU 4x más lenta: el inicio responde. Arreglar lo que se rompa.
- [ ] **Step 4: Commit** `fase 6: personalizar el catálogo desde su panel y desde Revendedores`.

### Task 10: Documentos, verificación y entrega

**Files:**
- Modify: `CLAUDE.md`, `DESIGN.md`, `.impeccable/design.json`, `.claude/skills/lux-ui/SKILL.md`, `src/paginas/publico/GuiaRevendedorPiezas.tsx` (si nombra lo que cambió en Mi catálogo), `docs/fases/2026-11-revendedores/README.md`, `src/estilos/revendedor.css` (quitar lo que solo usaba el catálogo viejo; las paletas se quedan para el panel)
- Delete: `src/hooks/useTemaRv.ts` solo si ya nadie lo usa (el panel sí lo usa: se queda).

- [ ] **Step 1:** CLAUDE.md: árbol (`revendedor/catalogo/`, `supabase/functions/logo-revendedor`), "Su paleta" → tema con color libre medido, funciones nuevas, el catálogo del revendedor fuera del sistema visual de Lux; DESIGN.md + design.json + lux-ui: la nota de dónde vive su propio sistema.
- [ ] **Step 2:** `npm run pruebas` → todo pasa; `npm run build` → OK.
- [ ] **Step 3:** Revisión simple propia: releer el diff contra el diseño (memoria: sin agente revisor final).
- [ ] **Step 4:** Estado de la fase en el README; commit `fase 6: documentos`.
- [ ] **Step 5:** Entregar al dueño: el #73 para correr primero (con lo que debería dar), cómo publicar `logo-revendedor` (`npx supabase functions deploy logo-revendedor --use-api`), y después fusionar y subir. `npm run verificar` cuando haya terminal con las claves.
