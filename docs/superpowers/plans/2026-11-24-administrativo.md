# Fase 9 — El administrativo, rehecho · Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (el dueño pidió que Claude construya en el mismo chat, sin agente por tarea). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El administrativo de Lux en el estilo Estuche: un Inicio, una pantalla Flujo, el menú por grupos, las piezas comunes nuevas y cada pantalla del dueño repasada, sin tocar ninguna cuenta.

**Architecture:** Primero el SQL #76 (dos lecturas para el administrador). Después las piezas comunes de `base.css` y el armazón, que visten todo; luego dos pantallas nuevas sobre funciones puras probadas (`lib/menu.ts`, `lib/inicio.ts`, `lib/flujo.ts`); al final el repaso pantalla por pantalla y los documentos.

**Tech Stack:** Vite + React 19 + TypeScript estricto + CSS plano; Supabase (Postgres); PGlite para probar SQL; `node --test` (Node 22, importa `.ts` directo).

**Spec:** `docs/superpowers/specs/2026-11-24-administrativo-design.md`

## Global Constraints

- Paleta y letras de `src/estilos/tokens.css` sin colores nuevos; escala 12 · 14 · 16 · 20 · 28 · 40 · 56.
- Todo texto a 4,5:1 medido. Oro `--oro-arena` solo sobre verde profundo.
- Regla 1: el Inicio y el Flujo los protege Postgres (`es_admin()`), no React.
- Ninguna pantalla recalcula dinero: suma solo renglones ya devueltos y en la misma moneda.
- Cada "$" dice cuál es (`formatearBcv`, `formatearBinance`; `formatearMonto` solo con la moneda en la cabecera).
- La vendedora conserva `.mostrador` (56 px, 18 px), sus tres de abajo (Mostrador, Pedidos, Mi día) y la barra del carrito por encima de la de navegación.
- Primero el SQL: sin el #76 nada se rompe (Inicio sin "Para hoy", Flujo sin el detalle por lote, con un aviso).
- Todos los `useMemo` antes del primer `return`. Archivos en CRLF (editar con la herramienta de edición, no con heredoc).
- Próximo SQL: **#76**, `esquema-inicio-y-rastro.sql`, depende del #75.

## Review Focus

1. **El panel del revendedor usa el mismo Armazón y los mismos tokens** (fase 7): la barra verde y la hoja por grupos tienen que verse bien con su tema y su menú sin grupos. → Tarea 2 prueba `agruparEnlaces` sin grupos y Tarea 9 lo mira en captura.
2. **El Mostrador en el teléfono con el carrito lleno**: la barra de abajo nueva (con margen y redondeada) no puede tapar ni quedar tapada por la barra del carrito. → Tarea 9, captura a 360 px con carrito.
3. **Un administrador sin el #76 instalado**: `admin_inicio` responde 404/`PGRST202`. → Tarea 4: `pendientesDeInicio(null)` devuelve `[]` y la pantalla dice "Falta instalar el #76".
4. **Un flujo sin movimientos** (tienda nueva, período vacío): `admin_flujo` devuelve solo las filas de "queda". → Tarea 5: `agruparFlujo([])` y con solo "queda" no revientan y dan totales 0.
5. **Cifras negativas y concepto desconocido** (`caja:otra_categoria` nueva, "abonado" en negativo): → Tarea 5: `nombreConcepto('caja:xyz')` da "Caja · xyz" y los negativos se formatean con "−".

---

### Task 1: SQL #76 — `admin_inicio` y la mercancía sin rastro por lote

**Files:**
- Create: `esquema-inicio-y-rastro.sql`
- Create (scratchpad, no va al repo): `<scratchpad>/pg/prueba-76.mjs` (copia del arnés de la fase 8: `pg/` de la sesión 990c06aa, con `base74`)
- Modify: `scripts/verificar.mjs` (FUNCIONES_CERRADAS y las dos `admin_*`), `INSTALACION.md` (fila 76), `CLAUDE.md` (funciones)

**Interfaces:**
- Produces:
  - `admin_inicio() returns jsonb` — definidor, `if not es_admin() then raise`; claves: `ventas_por_verificar int`, `por_verificar_bs numeric`, `abonos_por_revisar int`, `pedidos_abiertos int`, `apartados_por_aprobar int`, `creditos_vencidos int`, `vencido_bcv numeric`, `conteos_por_revisar int`. Solo cuenta sobre `v_ventas_por_verificar` (ventas distintas, sin las de crédito: esas van en vencidos), `v_abonos_detalle` (sin verificar, sin anular, origen distinto de `tienda`), `v_pedido_vendedora` (pedidos del catálogo distintos que siguen abiertos), `v_apartados_revendedor` (los que esperan aprobación), `v_credito` (`vencida`, suma `falta_bcv`) y `v_conteos` (`lineas_por_revisar > 0`). Columnas exactas: confirmarlas en `base75` con `information_schema.columns` antes de escribir.
  - `sin_rastro_por_lote() returns table(lote_id bigint, codigo text, comprado numeric, vendido numeric, en_tienda numeric, en_camino numeric, sin_rastro numeric)` — todo en $ Binance; revocada a todos; un renglón por lote y uno con `lote_id` null ("sin lote"); misma regla que `flujo_negocio` (vendido: `venta_items` de ventas no anuladas × `costo_puesto_usd_snap`; en tienda: `existencias` × `costo_puesto_usd`; en camino: `por_llegar` de lotes `en_camino`; comprado: `costo_mercancia_usd + flete_mercancia_usd`), cada pieza por su `modelos.lote_id`.
  - `admin_sin_rastro_lotes()` — misma tabla, con el guardián, `grant execute ... to authenticated`.

- [ ] **Step 1:** Copiar `pg/` a `<scratchpad>/pg`, crear `base75` corriendo el #75 sobre `base74`, y escribir `prueba-76.mjs` con estas comprobaciones (cifras: tasa 100/120; lote L1 $100 + $20 flete con 10 piezas de costo puesto 12; se venden 3, quedan 6 en tienda, 1 perdida; una pieza sin lote de costo 5 con 2 en tienda y 0 compradas):
  - `sin_rastro_por_lote()` de L1: comprado 120, vendido 36, en_tienda 72, sin_rastro 12; "sin lote": sin_rastro −10.
  - `sum(sin_rastro)` = `binance` de `flujo_negocio()` en `mercancia_sin_rastro`.
  - Con 1 venta por verificar de Bs 2.000, 1 crédito vencido que debe $16, 1 abono reportado sin revisar, 1 conteo con una línea pendiente: `admin_inicio()` como ADMIN da 1, 2000, 1, …, 1, 16, 1.
  - La vendedora y `anon` reciben error en `admin_inicio`, `admin_sin_rastro_lotes` y `sin_rastro_por_lote`.
  - El archivo se corre dos veces sin error.
- [ ] **Step 2:** `node prueba-76.mjs "<repo>" sin76` → FALLA (las funciones no existen).
- [ ] **Step 3:** Escribir `esquema-inicio-y-rastro.sql` con cabecera del #76 (por qué, qué hace, "Debería dar", depende del #75, se puede correr varias veces).
- [ ] **Step 4:** `node prueba-76.mjs "<repo>"` → todas pasan, 0 FALLA.
- [ ] **Step 5:** `verificar.mjs`: `sin_rastro_por_lote` en FUNCIONES_CERRADAS; la vendedora rechazada en `admin_inicio` y `admin_sin_rastro_lotes`; el administrador recibe un objeto con las ocho claves. Fila 76 en INSTALACION.md; funciones en CLAUDE.md ("Las funciones que escriben", junto a `flujo_negocio`).
- [ ] **Step 6:** Commit `fase 9: #76 admin_inicio y la mercancía sin rastro por lote`.

### Task 2: El menú por grupos y el armazón

**Files:**
- Create: `src/lib/menu.ts`, `scripts/pruebas/menu.test.mjs`
- Modify: `src/componentes/Armazon.tsx`, `src/componentes/Disposicion.tsx`, `src/componentes/Iconos.tsx` (icono `inicio`, `flujo`), `src/estilos/base.css` (Armazón: `.lateral`, `.navegacion`, `.barra-nav`, `.hoja`)

**Interfaces:**
- Produces:
  - `EnlaceNav` gana `grupo?: string`.
  - `GRUPOS_ADMIN: readonly { titulo: string; enlaces: readonly string[] }[]` en `lib/menu.ts`, en este orden: `''` → `/admin`; `Vender` → `/venta`, `/venta/pedidos`, `/venta/codigo`, `/venta/cierre`, `/venta/conteo`; `Dinero` → `/admin/flujo`, `/admin/caja`, `/admin/credito`, `/admin/reportes`, `/admin/costos`, `/admin/inversiones`; `Mercancía` → `/admin/inventario`, `/admin/lotes`, `/admin/grupos`, `/admin/tramos`, `/tasas`; `Gente` → `/clientes`, `/admin/vendedoras`, `/admin/revendedores`, `/admin/capacitacion`; `En línea` → `/admin/landing`, `/admin/textos`, `/catalogo`, `/vitrina`; `Sistema` → `/verificacion`.
  - `agruparEnlaces(enlaces: EnlaceNav[]): { titulo: string; enlaces: EnlaceNav[] }[]` — conserva el orden de llegada de los grupos; enlaces sin `grupo` van a un grupo de título `''`; grupos vacíos no salen.
  - `PRINCIPALES_ADMIN = ['/admin', '/venta', '/venta/pedidos']`.

- [ ] **Step 1:** `menu.test.mjs`: cada ruta de `GRUPOS_ADMIN` aparece una sola vez; las 25 rutas de hoy del administrador más `/admin` y `/admin/flujo` están todas; `agruparEnlaces` sin ningún `grupo` devuelve un solo grupo `''` con todo (el panel del revendedor); un grupo sin enlaces no sale.
- [ ] **Step 2:** `npm run pruebas` → FALLA (no existe `lib/menu.ts`).
- [ ] **Step 3:** `lib/menu.ts`; `Disposicion` arma `ENLACES_ADMIN` desde `GRUPOS_ADMIN` (texto e icono por ruta; el aviso de vencidos sigue) y usa `PRINCIPALES_ADMIN`; `Armazon` pinta la lateral y la hoja con `agruparEnlaces` (título de grupo como `<h2>` visual en Jost 12 mayúsculas `--oro-arena` en la lateral, `--oro-texto` en la hoja clara).
- [ ] **Step 4:** CSS del armazón: lateral 244 px verde, activa en píldora crema con texto verde; barra de abajo verde, radio `--radio-lg`, margen 12 px, activa `--oro-arena`, resto `--crema`, 52 px; el contenido reserva su alto. La hoja: papel con títulos de grupo.
- [ ] **Step 5:** `npm run pruebas` y `npm run build` → pasan.
- [ ] **Step 6:** Commit `fase 9: el menú por grupos y el armazón Estuche`.

### Task 3: Las piezas comunes y la Banda

**Files:**
- Create: `src/componentes/Banda.tsx`, `scripts/pruebas/estuche.test.mjs`
- Modify: `src/estilos/base.css` (Contenido, Datos y cifras, Botones, Avisos, Tablas; `.banda`)

**Interfaces:**
- Produces: `Banda({ etiqueta, cifra, moneda, detalle, progreso, cuadritos, children })` — `etiqueta: string`, `cifra: string` (ya formateada), `moneda?: string` ("BCV"), `detalle?: ReactNode`, `progreso?: { texto: string; pct: number }` (0–100, se recorta), `cuadritos?: { etiqueta: string; valor: string }[]` (máx. 4). Es una `<section aria-label={etiqueta}>`.
- Clases que el resto usa sin cambiar: `pagina`, `encabezado-pagina`, `tarjeta`, `panel`, `tablero`, `tabla`, `boton`, `campo`, `dato`, `aviso`.

- [ ] **Step 1:** `estuche.test.mjs` con `contraste` y `mezclar` de `revendedor/catalogo/tema.ts`: crema sobre verde ≥ 4,5; oro-arena sobre verde ≥ 4,5; crema sobre (verde mezclado con crema al 10 %) ≥ 4,5; `--salvia-texto` sobre `--panel` ≥ 4,5 (cabecera de tabla); `--error` sobre el rojo apagado del cuadrito (`#F6E9E6`) ≥ 4,5; `--oro-texto` sobre `--papel` ≥ 4,5 (títulos de grupo en la hoja).
- [ ] **Step 2:** `npm run pruebas` → pasa o falla según los colores elegidos; si falla, se oscurece el fondo/texto hasta pasar (el valor que pase se anota en el CSS).
- [ ] **Step 3:** `Banda.tsx` y `.banda` (verde, `--radio-lg`, cifra Fraunces 40 → 56 desde 900 px, etiqueta Jost 12 mayúsculas oro, barra oro sobre crema al 22 %, cuadritos crema al 10 %).
- [ ] **Step 4:** Piezas comunes: `encabezado-pagina` (título Fraunces 28 → 40 desde 900 px, línea de qué es); `tarjeta` blanca sin borde con `--sombra-1` y `--radio-lg`; tabla con cabecera clara (`--panel`, Jost 12 mayúsculas `--salvia-texto`); `tablero` como cuadros blancos; la densidad de `.mostrador` intacta.
- [ ] **Step 5:** `npm run pruebas` y `npm run build` → pasan.
- [ ] **Step 6:** Commit `fase 9: las piezas comunes del Estuche y la Banda`.

### Task 4: Inicio

**Files:**
- Create: `src/lib/inicio.ts`, `scripts/pruebas/inicio.test.mjs`, `src/paginas/admin/Inicio.tsx`
- Modify: `src/App.tsx` (ruta `/admin`, perezosa, `soloAdmin`; el administrador entra a `/admin`), `src/estilos/base.css` (`.para-hoy`)

**Interfaces:**
- Consumes: `admin_inicio()` (Tarea 1), `Banda` (Tarea 3), `useTasa`, `admin_flujo()` (#75).
- Produces: `type ResumenInicio` (las ocho claves de Tarea 1); `pendientesDeInicio(r: ResumenInicio | null): Pendiente[]` con `Pendiente = { clave: string; cuantos: number; texto: string; detalle: string | null; a: string; urgente: boolean }`.

- [ ] **Step 1:** `inicio.test.mjs`: `null` → `[]`; todo en 0 → `[]`; con `creditos_vencidos: 2, vencido_bcv: 85` sale primero, `urgente: true`, `a: '/admin/credito'`, detalle "$85,00 BCV por cobrar"; singular/plural ("1 venta por verificar", "3 ventas por verificar"); ventas, abonos, pedidos y apartados van a `/venta/pedidos`, conteos a `/venta/conteo`.
- [ ] **Step 2:** `npm run pruebas` → FALLA.
- [ ] **Step 3:** `lib/inicio.ts` (los montos con `formatearBcv`/`formatearBs` de `lib/dinero.ts`).
- [ ] **Step 4:** `Inicio.tsx`: cuatro lecturas en paralelo (`admin_inicio`, `v_ventas_por_dia` desde el primer día del mes de Venezuela, `v_cobertura_mes`, `admin_flujo()`), mirando cada error; Banda "Mes, hasta hoy" con lo vendido en $ BCV, "Gastos del mes cubiertos · con el plan de Costos", cuadritos piezas y "Si se vende todo" (enlace a Flujo); "Para hoy" como enlaces de 64 px; vacío: "Nada pendiente por ahora."; sin el #76: aviso "Falta instalar el #76" y la banda igual. La tasa arriba.
- [ ] **Step 5:** `npm run pruebas` y `npm run build` → pasan.
- [ ] **Step 6:** Commit `fase 9: el Inicio del administrador`.

### Task 5: Flujo

**Files:**
- Create: `src/lib/flujo.ts`, `scripts/pruebas/flujo.test.mjs`, `src/paginas/admin/Flujo.tsx`
- Modify: `src/App.tsx` (ruta `/admin/flujo`), `src/estilos/base.css` (`.flujo`)

**Interfaces:**
- Consumes: `admin_flujo(p_desde, p_hasta)` → `{ orden, grupo, concepto, bs, binance, bcv }[]`; `admin_sin_rastro_lotes()` (Tarea 1); `Banda`.
- Produces: `type FilaFlujo`; `nombreConcepto(c: string): string`; `agruparFlujo(filas: FilaFlujo[]): { salio: Grupo; entro: Grupo; queda: Grupo; sinComprobar: Montos | null; siSeVende: Montos | null }` con `Grupo = { filas: FilaFlujo[]; total: Montos }`, `Montos = { bs: number; binance: number; bcv: number }` (el total de `queda` es la fila `dinero`, no una suma); `periodo(clave: 'mes' | 'anio' | 'todo', hoy: string): { desde: string | null; hasta: string | null }`.
- Nombres: `mercancia` "Mercancía, con su flete"; `exhibidores` "Exhibidores"; `mobiliario` "Mobiliario (Inversiones)"; `caja:<x>` "Caja · <nombre de CATEGORIAS_CAJA o x>"; `ventas` "Ventas cobradas completas"; `abonos` "Abonos"; `dinero` "Dinero (entró − salió)"; `mercancia_costo` "Mercancía en la tienda, a lo que costó"; `mercancia_en_camino` "Mercancía en camino"; `mercancia_sin_rastro` "Mercancía sin rastro"; `mercancia_etiqueta` "Mercancía a la etiqueta de hoy"; `abonado_sin_entregar` "Lo ya abonado de pedidos sin entregar"; `te_deben` "Lo que te deben".

- [ ] **Step 1:** `flujo.test.mjs`: los totales de salió y entró suman sus renglones en cada moneda; `[]` da totales 0 y `siSeVende` null; solo filas "queda" no revienta; `nombreConcepto('caja:alquiler')` → "Caja · Alquiler", `'caja:xyz'` → "Caja · xyz"; `periodo('mes', '2026-11-24')` → desde `2026-11-01`, hasta `2026-11-24`; `periodo('anio', …)` → `2026-01-01`; `'todo'` → nulls.
- [ ] **Step 2:** `npm run pruebas` → FALLA.
- [ ] **Step 3:** `lib/flujo.ts`.
- [ ] **Step 4:** `Flujo.tsx`: selector de período (en la ruta, `?periodo=`), Banda "Si se vende todo, hoy" ($ BCV grande; $ Binance y Bs al lado), tres tarjetas con columnas $ Binance y $ BCV y "Ver en bolívares" que suma la columna Bs; "De eso, sin comprobar" bajo Entró; las líneas que explican (tasa de su día, solo lo anotado en la Caja, por qué el abonado va en negativo); "Mercancía sin rastro" abre el detalle por lote (si `admin_sin_rastro_lotes` falla con función inexistente, no hay detalle y no se dice nada más). Negativos con "−".
- [ ] **Step 5:** `npm run pruebas` y `npm run build` → pasan.
- [ ] **Step 6:** Commit `fase 9: la pantalla Flujo`.

### Task 6: Dinero — Caja, Crédito, Reportes, Costos, Inversiones

**Files:** Modify `src/paginas/admin/{Caja,Credito,Reportes,Costos,Inversiones}.tsx`, `src/estilos/base.css`.

- [ ] **Step 1:** Caja: Banda con lo que entró y salió del período (de lo que ya lee, en $ BCV); al elegir categoría `mercancia` o `transporte` (`CATEGORIAS_CAJA`), aviso: "Los lotes se anotan en Lotes. Si lo anotas aquí, el Flujo lo cuenta dos veces."
- [ ] **Step 2:** Crédito: Banda con lo que te deben y cuántos vencidos (de `v_credito`, ya leída).
- [ ] **Step 3:** Reportes: Banda "El mes" (lo cubierto, "con el plan de Costos"); rótulos "sin lo de tienda" (margen por categoría) y "con reserva de merma" (valor del inventario).
- [ ] **Step 4:** Costos: la cifra que manda en Banda y la línea "Es el plan con que se ponen los precios; lo pagado de verdad está en la Caja y el Flujo".
- [ ] **Step 5:** Inversiones: Banda con el % recuperado; "Invertido, al dólar de hoy"; "Mercancía vendida, a lo que costó" (antes "recuperada"); "Ganancia con el plan de gastos de este mes"; enlace "Lo cobrado y lo pagado de verdad: Flujo".
- [ ] **Step 6:** Encabezado nuevo y tarjetas en las cinco; `npm run build` → pasa. Commit `fase 9: Dinero en Estuche, con sus rótulos`.

### Task 7: Mercancía — Inventario, Formulario, Lotes, Lote en camino, Grupos, Tramos, Tasas

**Files:** Modify `src/paginas/admin/{Inventario,FormularioModelo,Lotes,LoteEnCamino,Grupos,Tramos}.tsx`, `src/paginas/Tasas.tsx`, `src/estilos/base.css`.

- [ ] **Step 1:** Encabezado nuevo, tarjetas y tablas de la base en las siete; Inventario rotula su margen "con lo de tienda". Sin Banda (ninguna tiene una cifra que mande).
- [ ] **Step 2:** `npm run build` → pasa. Commit `fase 9: Mercancía en Estuche`.

### Task 8: Gente, En línea y Sistema

**Files:** Modify `src/paginas/Clientes.tsx`, `src/paginas/admin/{Vendedoras,Revendedores,CapacitacionRv,Landing,Textos}.tsx`, `src/paginas/admin/landing/*.tsx`, `src/paginas/Verificacion.tsx`, `src/estilos/base.css`, `src/estilos/panel-landing.css`.

- [ ] **Step 1:** Encabezado nuevo, tarjetas y tablas en todas; sin Banda.
- [ ] **Step 2:** `npm run build` → pasa. Commit `fase 9: Gente, En línea y Sistema en Estuche`.

### Task 9: La vendedora, el revendedor y las capturas

**Files:** Modify lo que salga en `src/estilos/base.css`. Scratchpad: guion de capturas (Edge sin ventana + CDP `Emulation.setDeviceMetricsOverride`).

- [ ] **Step 1:** `npm run build` y `npx vite preview`; capturas a 360 y 1280 px de Inicio, Flujo, Caja, Inventario, la hoja "Más", Mostrador con carrito y cobro, Pedidos, Conteo, y el panel del revendedor (`/rv` con `?demo=1` en desarrollo si existe, si no su Inicio) con un tema claro y uno oscuro.
- [ ] **Step 2:** Mirar cada una: nada se sale de lado (ancho de documento = ancho de ventana), la barra del carrito sobre la de navegación, ningún texto sobre fondo sin medir. Arreglar lo que salga.
- [ ] **Step 3:** `npm run pruebas` (incluye `tema-panel.test.mjs`) y `npm run build` → pasan. Commit `fase 9: repaso de la vendedora y del panel del revendedor`.

### Task 10: Documentos y cierre

**Files:** Modify `DESIGN.md`, `.impeccable/design.json`, `.claude/skills/lux-ui/SKILL.md` (navegación: las tres del administrador son Inicio, Mostrador, Pedidos; lateral por grupos; cabecera de tabla clara; la Banda), `CLAUDE.md` (árbol: `lib/menu.ts`, `lib/inicio.ts`, `lib/flujo.ts`, `componentes/Banda.tsx`, `admin/Inicio`, `admin/Flujo`; las tres del administrador), `docs/fases/2026-11-revendedores/README.md` (fase 9 hecha, próximo SQL #77).

- [ ] **Step 1:** Escribir los documentos.
- [ ] **Step 2:** `npm run pruebas`, `npm run build` → pasan. Revisión simple propia del diff contra el diseño.
- [ ] **Step 3:** Commit `fase 9: documentos`. Preguntar al dueño si se fusiona y se publica (primero correr el #76).
