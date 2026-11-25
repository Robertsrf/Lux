# Fase 10 — Landing, catálogo y pedido de Lux · Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (decisión del dueño: construye Claude en el chat, sin agente por tarea). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer lo público de Lux (landing, catálogo, página de la pieza, pedido y `Reserva`) en el estilo A · Editorial cálido, sin tocar la base ni las pantallas con sesión.

**Architecture:** La lógica de `Catalogo.tsx` pasa intacta a `useCatalogoLux` (cerebro); `Catalogo.tsx` queda como ruta que elige qué dibujar; cada cara es un componente nuevo con su CSS en `estilos/publico.css`, todo bajo la clase raíz `.pub`. La pieza tiene página propia por `?pieza=<id>`.

**Tech Stack:** Vite + React 19 + TypeScript estricto, CSS plano sobre `tokens.css`, `react-router-dom` (BrowserRouter), Supabase (solo lecturas y RPC que ya existen), `node --test` para lo puro.

**Spec:** `docs/superpowers/specs/2026-11-24-landing-catalogo-pedido-design.md` (maquetas: https://claude.ai/artifact/Y9HXj71jv7A3ttnT1xAYNJ, la A).

## Global Constraints

- Sin `.sql`, sin vistas ni funciones nuevas; solo lo que ya se lee hoy.
- Sin dependencias nuevas.
- Solo la paleta de `tokens.css` y las letras Fraunces, EB Garamond y Jost. Se ignoran `lux-ui`, `DESIGN.md` y `.impeccable/design.json` en estas páginas.
- Todo texto a 4,5:1 medido; cada par de colores nuevo, con su cifra en un comentario del CSS.
- `prefers-reduced-motion: reduce` deja todo quieto y visible. Solo se animan `transform` y `opacity`.
- Nunca texto sobre una foto.
- Objetivos táctiles de 44 px o más; botones principales de 52 px.
- Ninguna cifra de costo, piso ni margen; ninguna cifra de negocio inventada.
- Ninguna dirección armada a mano: `lib/direccion.ts` y `lib/dominio.ts`.
- Todos los `useMemo` antes del primer `return` temprano.
- Ficheros en CRLF: editar con la herramienta de edición, no con `sed -i`.
- Las pantallas con sesión, el catálogo y el panel del revendedor, la vitrina y el PDF no cambian de aspecto.

## Review Focus

1. **Enlace directo `?pieza=` a una pieza vendida, próxima o que no existe** → sale Próximamente o "Esta joya ya no está disponible" con el botón al catálogo, nunca una página en blanco (Task 5, prueba en el banco con los tres casos).
2. **Un componente compartido restilado sin encerrar** → Mostrador, Pedidos, Clientes y el catálogo del revendedor se ven igual que antes (Task 10, capturas antes/después).
3. **Teléfono de 360 px con "Letra grande"** → ninguna página se corre de lado; las filas que se deslizan son `position: relative` (texto oculto dentro, ver Trampas) (Task 10, `scrollWidth <= innerWidth` en cada ruta).
4. **Escribir en el buscador y pasar del inicio a la lista** → el foco y el teclado se quedan en el campo (mismo nodo) (Task 3, prueba en el banco: escribir una letra y comprobar `document.activeElement`).
5. **Movimiento reducido o red lenta** → todo visible sin animar; la barra del pedido no tapa el último botón (`padding-bottom` de la página) (Task 9, captura con `prefers-reduced-motion` emulado).

---

### Task 1: Lo puro de la pieza (`lib/pieza.ts`)

**Files:**
- Create: `src/lib/pieza.ts`
- Test: `scripts/pruebas/pieza.test.mjs`

**Interfaces:**
- Produces:
  - `piezaDeRuta(valor: string | null): number | null` — entero positivo escrito como entero; cualquier otra cosa, null.
  - `rutaDePieza(rutaCatalogo: string, id: number, para: string | null): string` — `"/?pieza=12"`, `"/?pieza=12&para=dama"`, `"/publico?pieza=12"`.
  - `textoParaCompartir(nombre: string, url: string): string` — `"Mira esta joya de Lux by Emory: <nombre>\n<url>"`, sin precio.
  - `enlaceCompartirPieza(nombre: string, url: string): string` — `https://wa.me/?text=` + `encodeURIComponent(textoParaCompartir(...))`.

- [ ] **Step 1: Escribir las pruebas** — `piezaDeRuta('12') === 12`; `'0'`, `'-3'`, `'1.5'`, `'12abc'`, `''`, `null`, `'1e3'` → `null`; `rutaDePieza('/', 12, null) === '/?pieza=12'`; `rutaDePieza('/publico', 7, 'caballero') === '/publico?pieza=7&para=caballero'`; `textoParaCompartir` no contiene `Bs` ni `$`; `enlaceCompartirPieza('Collar & co', 'https://luxbyemory.com/?pieza=1')` empieza por `https://wa.me/?text=` y decodifica al texto exacto.
- [ ] **Step 2:** `npm run pruebas` → falla (no existe el módulo).
- [ ] **Step 3:** Escribir `src/lib/pieza.ts` (sin imports de navegador).
- [ ] **Step 4:** `npm run pruebas` → pasa todo.
- [ ] **Step 5:** Commit `fase 10: lo puro de la página de la pieza`.

### Task 2: El cerebro (`useCatalogoLux`), sin cambiar lo que se ve

**Files:**
- Create: `src/paginas/publico/useCatalogoLux.ts`
- Modify: `src/paginas/publico/Catalogo.tsx` (toda la lógica sale; el JSX de hoy se queda, leyendo del cerebro)

**Interfaces:**
- Produces: `useCatalogoLux(): CatalogoLux`, con `CatalogoLux` exportado. Agrupa en el objeto devuelto, con los nombres de hoy: `tasa, textos, reglas, landing, ofertas, miradas, parejaPct, ventana, setVentana, completalo, setCompletalo, modelos, total, conocidos, seleccion, resumen, armados, texto, setTexto, categorias, orden, setOrden, cargando, cargandoMas, cargarMas, error, setError, paso, setPaso, para, elegirPara, categoria, setCategoria, verTodas, irATodas, enLista, recienAgregada, consultaActual, cargadoPara, datos, setDatos, entrega, setEntrega, empresa, setEmpresa, agencia, setAgencia, direccion, setDireccion, reservando, reservar, familiaAbierta, setFamiliaAbierta, cerrarHoja, familias, estantes, tipos, fichas, familiasProximas, fichasProximas, proximos, totalProximos, todosProximos, setTodosProximos, pasos, whatsappTienda, cambiar, agregarPorId, vaciar, quererOferta, abrirArmar, armarCon, armandoBase, setArmandoBase, dijes, esBase, alInicio, cintaDe, codigosVigentes, tituloLista` (el ref).
- Se mueven también `COLUMNAS`, `COLUMNAS_PROXIMO`, `TOPE_PROXIMO`, `POR_TANDA`, `TOPE_INICIO`, `AVISO_AGREGADA_MS`, `claveDe` y el tipo `Orden` (exportados los que use la cara).
- `visor` y `visorProximo` (`useVisorFoto`) se quedan en la cara hasta la Task 5; `abrirArmar` recibe un `alAntes?: () => void` para cerrar el visor.

- [ ] **Step 1:** Mover el código tal cual (mismos comentarios, mismo orden de hooks). `useCatalogoLux` no devuelve JSX.
- [ ] **Step 2:** `npm run build` → sin errores.
- [ ] **Step 3:** Banco (`.superpowers/sdd/2026-11-24-administrativo/banco/`, puerto 5288, `MSYS_NO_PATHCONV=1`): captura de `/publico`, `/publico?tipo=Collares` y `/publico?paso=pedido` con una pieza, antes (rama en 344831b) y después: iguales.
- [ ] **Step 4:** Commit `fase 10: el cerebro del catálogo (useCatalogoLux), sin cambiar lo que se ve`.

### Task 3: La base del estilo A, la cabecera y la barra del pedido

**Files:**
- Create: `src/estilos/publico.css`, `src/paginas/publico/caras/Cabecera.tsx`, `src/paginas/publico/caras/BarraPedido.tsx`
- Modify: `src/paginas/publico/Catalogo.tsx`

**Interfaces:**
- Consumes: `CatalogoLux` (Task 2).
- Produces:
  - `.pub` en el contenedor raíz de Catalogo (y de Reserva en la Task 8). En `publico.css`: variables `--pub-*` (escala fluida con `clamp()`, `--pub-pildora: 999px`, `--pub-foto-radio: 4px`, `--pub-alto-boton: 52px`), las clases `.pub-boton`, `.pub-boton--claro`, `.pub-titulo` (Fraunces 300), `.pub-etiqueta` (Jost mayúsculas, `--oro-texto`), `.pub-prosa` (EB Garamond), `.pub-aparece` / `.pub-aparece--visible`, y el bloque `@media (prefers-reduced-motion: reduce)`.
  - `Cabecera({ c: CatalogoLux, conBuscador: boolean, conPuertas: boolean })`: pegada arriba; lupa · LUX (enlace a `rutaDelCatalogo()`) · Letra grande · bolsa con el número; debajo, en una fila, el campo de búsqueda (siempre montado, mismo nodo; la lupa lo enfoca) con `ElegirPara` al lado, y las puertas cuando hay landing.
  - `BarraPedido({ c: CatalogoLux })`: la píldora verde flotante con "N joyas · Bs total", el tramo y "te faltan", "Ver mi pedido"; "Vaciar" solo desde 420 px; el aviso de la primera pieza encima.

- [ ] **Step 1:** Escribir `publico.css` con la base. Cada par de color con su cifra en un comentario.
- [ ] **Step 2:** `Cabecera` y `BarraPedido`, y montarlos en Catalogo en lugar de `cabecera`, `buscador` y la `barra-carrito`. El orden y "Ver" del buscador de la lista van en la cara de la lista (Task 4).
- [ ] **Step 3:** `npm run build`; banco: escribir "c" en el inicio, comprobar que pasa a la lista y que `document.activeElement.id === 'buscar-publico'` (Review Focus 4).
- [ ] **Step 4:** Commit `fase 10: estilo A, cabecera y barra del pedido`.

### Task 4: Tarjeta, estante, tipos, la lista y Próximamente

**Files:**
- Create: `src/paginas/publico/caras/Tarjeta.tsx`, `src/paginas/publico/caras/Estante.tsx`, `src/paginas/publico/caras/Lista.tsx`
- Modify: `src/paginas/publico/landing/SeccionesCatalogo.tsx`, `src/paginas/publico/Catalogo.tsx`, `src/estilos/publico.css`

**Interfaces:**
- Consumes: `CatalogoLux`; `PropsCatalogo` (se queda, con `tarjeta` dibujando la nueva).
- Produces:
  - `Tarjeta({ familia: Familia<ModeloPublico>, alVer: () => void, llevas: (id) => number, disponible: (id) => number, alAgregar: (id) => void, alCambiar: (id, n) => void, alElegir: () => void, oferta?: string, proxima?: boolean })`: un `<article>`; la foto (miniatura, 4:5) es el botón que abre la pieza; el "+" redondo de 44 px es su hermano, sobre la foto (`aria-label` "Agregar <nombre>"; con medidas, abre la hoja de elegir); con piezas en el pedido pasa a contador − n +; nombre en Garamond; precio Bs · $ BCV (Fraunces, el BCV en `--salvia-texto`); la medida en corto (`etiquetasCortas`); `proxima` sin "+" y con el sello "Próximamente".
  - `Estante({ titulo, verTodas: { texto, alTocar }, children })`: fila `scroll-snap` con `position: relative`.
  - `Lista({ c: CatalogoLux, alVer })`: volver, título, tipos (fichas desde 900 px, "Ver" en el teléfono), orden, rejilla de dos (cuatro desde 900 px), "Ver más · faltan N".
- `VitrinaPublica.tsx`: si nadie más la usa tras esta tarea, se borra; si no, se queda.

- [ ] **Step 1:** Escribir las tres caras y el CSS.
- [ ] **Step 2:** `SeccionTipos`, `SeccionEstantes` y `SeccionProximamente` las usan (rejilla de tres con foto 3:4 y "Todas las joyas" primero; un `Estante` por tipo; Próximamente como estante).
- [ ] **Step 3:** `npm run build`; banco en 360 y 1280 px: inicio, `?tipo=`, `?ver=todas`, una búsqueda.
- [ ] **Step 4:** Commit `fase 10: tarjeta, estantes y lista en el estilo A`.

### Task 5: La página de la pieza (`?pieza=`)

**Files:**
- Create: `src/paginas/publico/caras/PaginaPieza.tsx`
- Modify: `src/paginas/publico/useCatalogoLux.ts`, `src/paginas/publico/Catalogo.tsx`, `src/estilos/publico.css`

**Interfaces:**
- Consumes: `piezaDeRuta`, `rutaDePieza`, `enlaceCompartirPieza`, `textoParaCompartir` (Task 1); `CatalogoLux`.
- Produces en el cerebro: `pieza: number | null` (de la ruta), `abrirPieza(id: number): void` (sin `replace`, conserva `para`), `cerrarPieza(): void` (`navigate(-1)` si se llegó desde el catálogo; si no, a `rutaDelCatalogo()`), `piezaCargada: { estado: 'cargando' } | { estado: 'venta', familia: Familia<ModeloPublico>, abierta: number } | { estado: 'proxima', familia: Familia<ModeloProximo>, abierta: number } | { estado: 'no_esta' }` — de `conocidos` si está; si no, `v_disponible_publico` con `COLUMNAS` por la familia del id (`.eq('id', id)` y luego `.eq('familia', f)`), y si no, `v_proximamente` con `COLUMNAS_PROXIMO`.
- `PaginaPieza({ c: CatalogoLux })`: fotos que se deslizan (una por medida con foto propia; tocar una abre `VisorFoto` para el zoom); categoría y para quién; nombre (Fraunces); precio Bs · $ BCV; medidas en fichas (más de `MUCHAS_OPCIONES` y `cuadroDe` como hoy en `ElegirVariante`); "Agregar" de 52 px que pasa a contador; "Agrégale un dije" si es base; "En tienda: V1 · BG"; `materiales_largo`; "Compártela por WhatsApp" (`navigator.share` si existe, si no el enlace `wa.me`); volver. Próxima: sin agregar, con "Próximamente: todavía no se puede pedir". `no_esta`: "Esta joya ya no está disponible" y el botón al catálogo.
- Las miradas: `miradas.abrir(id)` al montar y al cambiar de medida, `miradas.cerrar()` al desmontar (lo que hoy hacen `alAbrirPieza`/`alCerrarPieza`).
- La tarjeta (`alVer`) y "Complétalo"/la pareja abren la página; los visores de `Catalogo.tsx` dejan de usarse para eso (el de Próximamente también pasa a la página).

- [ ] **Step 1:** El estado de la pieza en el cerebro y la cara.
- [ ] **Step 2:** `npm run build`; banco con los cuatro casos: desde la tarjeta (atrás vuelve al mismo sitio y desplazamiento), enlace directo a una a la venta, a una próxima y a un id que no existe (Review Focus 1).
- [ ] **Step 3:** Commit `fase 10: la página de la pieza, con su enlace`.

### Task 6: La portada y las secciones de contenido

**Files:**
- Modify: `src/paginas/publico/landing/{Portada,Cintas,Historia,Materiales,Galeria,VideoLanding,Redes,Puertas,Titulo,Landing}.tsx`, `src/paginas/publico/landing/SeccionesCatalogo.tsx` (Cómo pedir), `src/paginas/publico/Catalogo.tsx` (la portada sin secciones), `src/estilos/publico.css`; `src/estilos/landing.css` se vacía de lo que pase a `publico.css` y se borra si queda vacío.
- `LaTienda` se viste desde `.pub` sin cambiar su marcado (la usa también la guía).

**Interfaces:**
- Consumes: `.pub-*` (Task 3), `Estante` (Task 4).
- Cada componente conserva sus props y los datos que lee; cambia el marcado y las clases a `pub-…`.
- Portada (y la de siempre): etiqueta en oro (ciudad · Hipoalergénica), título Fraunces 300 con la cursiva en la segunda mitad, prosa Garamond, "Ver todas las joyas" + "Cómo pedir", la ayuda por WhatsApp; la foto a sangre debajo con su indicador; desde 900 px, dos columnas. Cintas y materiales: la cinta verde que corre. Cómo pedir: números Fraunces en `--oro-texto`. Nosotros/buscamos, galería, video, redes y la tienda: como dice la tabla del diseño.

- [ ] **Step 1:** Rehacer cada componente y su CSS.
- [ ] **Step 2:** `npm run build`; banco con la landing sembrada (las secciones de `datos.ts` del banco; añadir las que falten) y con `secciones === null`.
- [ ] **Step 3:** Commit `fase 10: portada y secciones de contenido en el estilo A`.

### Task 7: Las secciones de ofertas

**Files:**
- Modify: `src/paginas/publico/landing/{Estuche,Combos,Seleccion,OfertasCasa,Escote,PiezasOferta,VentanaOferta,Completalo,TusCodigos}.tsx`, `src/estilos/publico.css`

**Interfaces:**
- Mismas props y la misma lógica; cambia el marcado y las clases. Bloque crema con foto, etiqueta en oro, título Fraunces con cursiva, botón píldora; las piezas en `Tarjeta` o en filas de `Estante`. `VentanaOferta`, `HojaCompletalo` y `HojaPareja` como hojas que suben, en el estilo A.

- [ ] **Step 1:** Rehacer cada uno.
- [ ] **Step 2:** `npm run build`; banco con ofertas encendidas (combos, regalo, selección, casa, escote, estuche) y apagadas (no sale ninguna ni la puerta "Ofertas").
- [ ] **Step 3:** Commit `fase 10: secciones de ofertas en el estilo A`.

### Task 8: Tu pedido y la página del pedido (`Reserva`)

**Files:**
- Create: `src/paginas/publico/caras/Pedido.tsx`
- Modify: `src/paginas/publico/Catalogo.tsx`, `src/paginas/publico/Reserva.tsx`, `src/estilos/publico.css`

**Interfaces:**
- Consumes: `CatalogoLux`; `TusDatos`, `PagoMovil`, `ReportarPago`, `ArmarDije` vestidos desde `.pub`.
- `Pedido({ c: CatalogoLux })`: el `paso === 'pedido'` de hoy, con la misma lógica y textos: "Tu pedido", las tres partes numeradas (número Fraunces en oro, título Fraunces), líneas con foto, contador y "Agrégale un dije", `TusCodigos`, el total, `TusDatos`, entrega, "Qué pasa al apartar", "Apartar mis piezas" de 52 px, "Seguir viendo" y "Vaciar el pedido". Sin piezas, `Navigate` al catálogo (como hoy).
- `Reserva.tsx`: misma lógica; el raíz lleva `.pub`, la cabecera del catálogo (sin buscador) y el marcado nuevo en el estilo A (referencia "LX-…", "Avisar a la tienda por WhatsApp" destacado, líneas, total, el pago).

- [ ] **Step 1:** `Pedido` y su CSS; Catalogo lo monta en `paso === 'pedido'`.
- [ ] **Step 2:** Reserva en el estilo A.
- [ ] **Step 3:** `npm run build`; banco: pedido con una pieza, con una base y su dije, con un código; `/reserva/x` (en el banco, con `ver_reserva` falso).
- [ ] **Step 4:** Commit `fase 10: tu pedido y la página del pedido en el estilo A`.

### Task 9: El movimiento

**Files:**
- Modify: `src/estilos/publico.css`, `src/paginas/publico/landing/Landing.tsx`, `src/paginas/publico/caras/{Tarjeta,Estante,BarraPedido,PaginaPieza}.tsx`, `src/paginas/publico/landing/Portada.tsx`

**Interfaces:**
- Valores: foto de la portada escala 1,06 → 1 en 1,2 s `cubic-bezier(0.2, 0.7, 0.2, 1)`; bloques y títulos suben 16 px y aparecen en 450 ms (`useAparecer`), escalonados 60 ms por tarjeta con `--i` (máximo 6); la cinta corre a ~40 px/s con `transform`, en pausa fuera de pantalla (`useAparecer(true)`); el "+" que pasa a contador y el número de la barra, un rebote de escala 1 → 1,12 → 1 en 260 ms; la barra entra desde abajo (translateY 120 % → 0, 320 ms) la primera vez; abrir una pieza con `document.startViewTransition` donde exista (`view-transition-name` en la foto de la tarjeta tocada y en la de la página), y si no, un fundido de 200 ms.
- `prefers-reduced-motion: reduce`: sin transformaciones ni View Transitions; todo visible.

- [ ] **Step 1:** Escribir el movimiento.
- [ ] **Step 2:** `npm run build`; banco con `Emulation.setEmulatedMedia` `prefers-reduced-motion: reduce`: todo visible en la primera captura (Review Focus 5); y que la página con barra tenga `padding-bottom` para que el último botón no quede debajo.
- [ ] **Step 3:** Commit `fase 10: el movimiento`.

### Task 10: Comprobación y documentos

**Files:**
- Create: en el banco, `medir.mjs` (abre cada ruta pública en 360 px con y sin "Letra grande" y falla si `document.documentElement.scrollWidth > innerWidth`)
- Modify: `CLAUDE.md` (árbol de `src/`: `useCatalogoLux`, `caras/`, `lib/pieza.ts`, `estilos/publico.css`; la regla de la página de la pieza en "El catálogo se entiende..."; quitar `landing.css` si se borró), `DESIGN.md` (una línea: lo público vive fuera del sistema, en `publico.css`), `docs/fases/2026-11-revendedores/README.md` (estado de la 10), `PRODUCT.md` si cambia algo de cómo habla.

- [ ] **Step 1:** `node medir.mjs` → ninguna ruta se corre (Review Focus 3).
- [ ] **Step 2:** Capturas de Mostrador, Pedidos, Clientes y `/r/muestra?demo=1` antes (344831b) y después: iguales (Review Focus 2).
- [ ] **Step 3:** `npm run pruebas` y `npm run build` → todo pasa.
- [ ] **Step 4:** Revisión simple propia: releer el diff contra la lista "Lo que tiene que seguir funcionando" del diseño.
- [ ] **Step 5:** Documentos y commit `fase 10: documentos`.
