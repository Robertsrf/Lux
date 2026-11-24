# Fase 7 — Panel del revendedor y Vender fácil · Plan

> **Para quien construye:** superpowers:executing-plans (el dueño pidió que
> Claude construya en el mismo chat, sin agente por tarea). Pasos con
> casillas (`- [ ]`).

**Meta:** Vender en tres pasos (Piezas → Clienta → Cobro) con barra fija,
la cédula opcional desde el panel, Inicio con lo urgente primero y el panel
entero vestido con el tema de su catálogo.

**Arquitectura:** primero el SQL #74 (`rv_vender` gana `p_cliente_id`, la
cédula deja de ser obligatoria desde el panel, `rv_resumen` trae `tema` y
`vence_lux_en`), probado en PGlite. Después el navegador: la lógica de
Vender en un archivo puro probado con `npm run pruebas`, los pasos como
componentes pequeños, y el tema del panel como una función pura que deriva
los tokens de Lux del `TemaResuelto` de la fase 6.

**Stack:** Vite + React 19 + TypeScript estricto + CSS plano; Supabase
(Postgres) con funciones `rv_*`; pruebas de base en PGlite; `node --test`.

**Diseño:** `docs/superpowers/specs/2026-11-24-panel-del-revendedor-design.md`

**Rama:** `fase-7-panel` (desde `main`). Se fusiona al terminar, después de
que el dueño corra el #74.

## Restricciones de todo el plan

- Primero el SQL, después el navegador; `rv_vender` conserva todos sus
  parámetros y gana `p_cliente_id bigint default null` **al final**.
- El catálogo de su clienta (`p_origen = 'catalogo'`) sigue pidiendo cédula,
  nombre, apellido y teléfono, como hoy.
- Desde el panel: nombre y teléfono (10 dígitos) obligatorios; apellido y
  cédula opcionales.
- Ni el revendedor ni su clienta ven un costo de Lux; "te sale" solo donde
  `precio_lux_usd` no es null.
- Todo texto a 4,5:1 medido, con los colores derivados de `tema.ts`.
- Controles del panel de 48 px como mínimo; navegación abajo en el teléfono.
- Ficheros del repo en CRLF: editar con la herramienta de edición, no con
  reemplazos que busquen `\n`.
- Toda cuenta de dinero sale de `lib/dinero.ts`; ningún `*` suelto con un
  precio en un componente.
- Todos los `useMemo` antes del primer `return` temprano.
- Ninguna cifra de negocio en el código (horas, %, días vienen de
  `rv_resumen`).

## Puntos de revisión (lo que más puede morder)

1. **Teléfono de una clienta suya escrito con otro formato** ("0412-123.45.67"
   vs "584121234567"): se reconoce por los 10 últimos dígitos, en la base y en
   el navegador. Pruebas en la Tarea 1 y la Tarea 2.
2. **Una pieza del carrito guardado que ya no está** (se vendió, salió de su
   catálogo) o tiene menos libres: al volver a Vender se quita o se baja, y se
   dice. Prueba en la Tarea 2 (`conciliarCarrito`).
3. **"Pagó todo" en dólares con la tasa Binance** cubre el total dentro de la
   tolerancia (un centavo de dólar) y no lo pasa. Prueba en la Tarea 2.
4. **Doble toque o red caída en "Hacer el pedido"**: un solo pedido, lo
   escrito se queda y se puede reintentar. Comprobación en la Tarea 4.
5. **Un color guardado feo** (amarillo claro, fondo oscuro): el panel sigue
   leyéndose (barra lateral, botón, aviso de error). Prueba en la Tarea 3.

---

### Tarea 1: SQL #74 `esquema-panel-revendedor.sql`, probado en PGlite

**Archivos:**
- Crear: `esquema-panel-revendedor.sql`
- Crear (scratchpad, no va al repo): `pg/prueba-74.mjs` y `pg/base73`
- Modificar: `scripts/verificar.mjs` (dos comprobaciones), `INSTALACION.md`
  (fila 74)

**Interfaces:**
- Produce: `rv_vender(p_sesion text, p_items jsonb, p_cedula text, p_nombre
  text default null, p_apellido text default null, p_telefono text default
  null, p_pago jsonb default null, p_cliente_id bigint default null) returns
  jsonb` → `{id, token, fase}` como hoy.
- Produce: `rv_resumen(p_sesion)` con las claves de hoy y al final `tema`
  (jsonb o null) y `vence_lux_en` (timestamptz o null: el `plazo_lux_en`
  más próximo de sus pedidos en fase `por_pagar_lux`).
- `rv_crear_apartado` gana `p_cliente_id bigint default null` al final
  (revocada; se borra la firma vieja y se vuelve a revocar a `public, anon,
  authenticated`).

- [ ] **Paso 1: Preparar la base de prueba.** Copiar
  `…/5a5ebde2-…/scratchpad/pg` (instalar.mjs, node_modules, base72) a
  `pg/` de este scratchpad; aplicar `esquema-catalogo-revendedor.sql` sobre
  una copia de `base72` y guardarla como `base73`. Comprobar:
  `select rv_tema_valido('{"principal":"red"}')` da `false`.

- [ ] **Paso 2: Escribir `pg/prueba-74.mjs`** (mismo esqueleto que
  `prueba-73.mjs`: copia `base73`, aplica el #74, `como()`, `falla()`), con
  estas comprobaciones:
  - Desde el panel sin cédula: `rv_vender(TJ, [{A,1}], null, 'Ana', null,
    '0412-1234567')` crea el pedido; `revendedor_clientes` tiene a Ana con
    `cedula` null y `apellido` null.
  - Otra venta con `p_telefono '584121234567'` y sin nombre reconoce a Ana
    (mismo `cliente_id`, ninguna clienta nueva).
  - Sin teléfono y sin `p_cliente_id`: falla con "Falta el número de
    teléfono". Sin nombre ni clienta reconocida: "Falta el nombre".
  - `p_cliente_id` de una clienta del otro revendedor: falla ("No encuentro
    esa clienta"); de una suya: usa esa, y un `p_apellido` llena su apellido
    vacío sin pisar el nombre.
  - Con cédula de una suya: como hoy (la reconoce).
  - `rv_apartar` (catálogo) sin cédula sigue fallando con "Falta la cédula";
    sin apellido, "Falta el apellido".
  - Toda de su inventario (dar inventario con `vender_para_inventario` como
    en `prueba-72.mjs`), sin cédula y pagada entera: `rv_fase_de` cerrada /
    `estado = 'retirado'`.
  - Dos pedidos de Ana sin cédula, confirmados, pagados a Lux y aprobados por
    el admin: un solo `clientes` nuevo (mismo `cliente_maestro_id`).
  - `rv_resumen(TJ)` tiene `tema` y `vence_lux_en`; con un pedido en
    `por_pagar_lux`, `vence_lux_en` = su `plazo_lux_en`; sin ninguno, null.
  - `select count(*) from pg_proc where proname = 'rv_vender'` = 1;
    `rv_crear_apartado` = 1; `anon` no ejecuta `rv_crear_apartado` ni
    `cliente_de_revendedor`.
  - Correr el #74 dos veces no falla.

- [ ] **Paso 3: Correrla y ver que falla** (`node pg/prueba-74.mjs <repo>`):
  falla al no existir el archivo.

- [ ] **Paso 4: Escribir el #74.** Cabecera con fecha, de qué depende (#73),
  qué cambia, "se puede correr varias veces" y lo que debería dar. Cuerpos:
  - `rv_crear_apartado`: la del #72 entera con `p_cliente_id`. Orden de
    reconocer: `p_cliente_id` (debe ser suya) → cédula (si llega) → teléfono
    (sus 10 últimos dígitos, `order by id desc limit 1`, solo si
    `p_origen = 'panel'`). Con `p_origen = 'catalogo'` las exigencias de hoy;
    con `'panel'`, solo nombre y teléfono. Completa lo vacío de la ficha
    (apellido, teléfono, cédula si no tenía y no choca con otra suya), nunca
    pisa.
  - `rv_vender`: `drop function if exists rv_vender(text, jsonb, text, text,
    text, text, jsonb)`; la nueva pasa `p_cliente_id`.
  - `rv_apartar`: misma firma, llama a la nueva `rv_crear_apartado` (con
    `null` al final).
  - `cliente_de_revendedor`: sin `cedula_digitos`, antes de insertar busca
    `cliente_maestro_id` de otro apartado con el mismo `cliente_id`.
  - `rv_resumen`: la del #72 entera, con `'tema', r.tema, 'vence_lux_en',
    (…min(plazo_lux_en) de sus apartados en fase 'por_pagar_lux')` al final.
  - Grants: `rv_vender` a `anon, authenticated`; las de por dentro revocadas.

- [ ] **Paso 5: Correr `prueba-74.mjs` hasta que pase entera.** Correr
  también `prueba-73.mjs` y `prueba-72.mjs` sobre una base con el #74
  aplicado (no deben romperse: `rv_apartar` y el inventario).

- [ ] **Paso 6: `scripts/verificar.mjs`:** una sola firma de `rv_vender`
  (con la llamada a un testigo inventado da `28000`, como las otras `rv_*`) y
  `rv_resumen` sin claves de costo (`costo`, `piso`, `margen`) en su
  respuesta. Fila 74 en `INSTALACION.md` con lo que debería dar.

- [ ] **Paso 7: Revisión de seguridad** con el agente
  `backend-api-security:backend-api-security-backend-security-coder` sobre el
  #74 (es una `rv_*` abierta a `anon`): reconocer por teléfono no debe dejar
  leer datos de una clienta ajena; `p_cliente_id` no debe aceptar una ajena.
  Corregir lo que encuentre con su prueba.

- [ ] **Paso 8: Commit** en `fase-7-panel`:
  `fase 7: #74, vender sin cédula desde el panel y el tema en rv_resumen`.

### Tarea 2: Las cuentas de Vender, puras y probadas

**Archivos:**
- Crear: `src/paginas/revendedor/panel/vender/cuentas.ts`
- Crear: `scripts/pruebas/vender-rv.test.mjs`

**Interfaces:**
- Consume: `PiezaRevendedor`, `ClienteRevendedor`, `MetodoPago` de
  `lib/tipos.ts`; `Tasas`, `totalDeLineas`, `abonoEnBcv`, `faltaTrasAbono`,
  `minimoParaApartar`, `precioEnBs`, `binanceDesdeBs` de `lib/dinero.ts`.
- Produce:
  - `type Carrito = Map<number, number>` (modelo → cantidad).
  - `ordenarPiezas(piezas: PiezaRevendedor[], ver: 'tuyas' | 'todas', texto: string): PiezaRevendedor[]` — con `'tuyas'` solo `mias > 0`; siempre las de `mias > 0` primero y después por nombre; el texto busca en nombre, variante, sku y categoría sin tildes ni mayúsculas.
  - `cuentasDe(piezas: PiezaRevendedor[], carrito: Carrito): { piezas: number; cobras: number; lux: number; todasTuyas: boolean }` — `lux` cuenta solo lo que excede `mias` (como `VenderRv` hoy).
  - `conciliarCarrito(piezas: PiezaRevendedor[], carrito: Carrito): { carrito: Carrito; quitadas: string[]; bajadas: string[] }`.
  - `digitosTelefono(t: string | null): string` (los 10 últimos dígitos) y `buscarClientas(clientas: ClienteRevendedor[], texto: string): ClienteRevendedor[]` (nombre, apellido, teléfono por dígitos, cédula por dígitos; máximo 20).
  - `clientaConDato(clientas, cedula: string, telefono: string): ClienteRevendedor | null` (la de esa cédula, o la de ese teléfono).
  - `montoQueCubre(totalBcv: number, metodo: MetodoPago, tasa: Tasas): number` — en Bs (`precioEnBs`) o, si el método es en dólares, Bs entre la tasa Binance redondeado **hacia arriba** al centavo.
  - `faltaParaSeguir(paso: 1 | 2 | 3, estado: EstadoVender, resumen: { dias_credito: number | null; inicial_pct: number | null }, tasa: Tasas | null): string | null` — null si puede seguir; si no, la frase que va bajo el botón ("Elige al menos una pieza.", "Falta su nombre.", "Falta su teléfono con el código, por ejemplo 0412 1234567.", "Para confirmar tiene que pagarte al menos …", "Es más que el total.").
  - `type EstadoVender = { carrito: Carrito; clientaId: number | null; nueva: { nombre: string; telefono: string; apellido: string; cedula: string }; cobro: 'todo' | 'parte' | 'no' | null; metodo: MetodoPago; monto: string; referencia: string }`.

- [ ] **Paso 1: Escribir las pruebas** (`vender-rv.test.mjs`, importando el
  `.ts` como `tema-rv.test.mjs`):
  - `ordenarPiezas`: con `mias` 2 en la segunda, sale primera; `'tuyas'` deja solo esa; "cadena" encuentra "Cadena Fígaro" y "CADENA"; "figaro" encuentra "Fígaro".
  - `cuentasDe`: precio 30, lux 20, `mias` 1, cantidad 2 → `cobras` 60, `lux` 20, `todasTuyas` false; cantidad 1 → `lux` 0, `todasTuyas` true.
  - `conciliarCarrito`: pieza que ya no viene → en `quitadas`; pedidas 3 con `disponible` 1 → queda 1 y en `bajadas`.
  - `digitosTelefono('0412-123.45.67')` = `digitosTelefono('+58 412 1234567')` = `'4121234567'`.
  - `clientaConDato` encuentra por teléfono con otro formato y por cédula `V-12.345.678`.
  - `montoQueCubre(10, 'efectivo_usd', {tasa_bcv:100, tasa_venta:120})` → 8,34 (1000/120 hacia arriba) y `abonoEnBcv(8.34, true, tasa)` no deja `faltaTrasAbono` > 0 ni `pasa`.
  - `faltaParaSeguir`: paso 1 con carrito vacío → "Elige al menos una pieza."; paso 2 nueva sin teléfono → la frase del teléfono; teléfono de 9 dígitos → la misma; paso 3 `'parte'` sin `dias_credito` → no se puede (frase del total); `'todo'` con monto mayor → "Es más que el total."; `'no'` → null.

- [ ] **Paso 2: `npm run pruebas`** → fallan (no existe el archivo).
- [ ] **Paso 3: Escribir `cuentas.ts`** con esas firmas.
- [ ] **Paso 4: `npm run pruebas`** → pasan todas, también las de antes.
- [ ] **Paso 5: Commit** `fase 7: las cuentas de Vender, puras y probadas`.

### Tarea 3: El panel vestido con su tema

**Archivos:**
- Crear: `src/paginas/revendedor/panel/temaPanel.ts`, `src/paginas/revendedor/panel/panel-rv.css`
- Modificar: `src/paginas/revendedor/Panel.tsx`, `src/lib/tipos.ts` (`ResumenRevendedor` gana `tema?: unknown` y `vence_lux_en?: string | null`)
- Test: `scripts/pruebas/tema-panel.test.mjs`

**Interfaces:**
- Consume: `temaResuelto`, `variablesCss`, `contraste`, `TemaResuelto` de `catalogo/tema.ts`; `cargarLetras` de `catalogo/letras.ts`.
- Produce: `tokensDelPanel(t: TemaResuelto): Record<string, string>` — los primitivos y derivados de `tokens.css` que usan Armazón, Piezas y las tablas: `--papel` (fondo), `--blanco` y `--superficie` (superficie), `--panel`/`--panel-hondo` (mezcla de superficie y línea), `--verde-profundo` (botón: la barra y el botón principal), `--crema` y `--texto-sobre-verde` (sobre botón), `--tinta`/`--texto`/`--texto-fuerte` (texto), `--texto-secundario`/`--salvia-texto` (texto suave), `--oro-arena`/`--oro-texto` (acento), `--linea`/`--linea-suave`, `--error`, `--exito`, `--radio*` y `--fuente-display` (letra de títulos), más las `--rvc-*` de `variablesCss`.
- Produce: `useTemaPanel(tema: unknown, paleta: PaletaRevendedor | null | undefined): void` (en `temaPanel.ts`): pone esas variables y la clase `rv-panel` en `<html>`, las quita al salir; carga las letras.

- [ ] **Paso 1: Pruebas** (`tema-panel.test.mjs`): para los seis `TEMAS_LISTOS`, para `{principal:'#FFE600', fondo:'#FFFFFF'}` y para `{principal:'#FF66CC', fondo:'#111111'}`, los pares que pinta el panel dan ≥ 4,5: texto y texto suave sobre papel, blanco y panel; sobre-verde sobre verde-profundo; oro-texto sobre papel y blanco; error y éxito sobre blanco y papel. Y que toda clave empieza por `--` y todo color es `#RRGGBB`.
- [ ] **Paso 2: `npm run pruebas`** → falla.
- [ ] **Paso 3: Escribir `tokensDelPanel` y `useTemaPanel`.** En `Panel.tsx`, `useTemaPanel(resumen?.tema, resumen?.paleta)` en lugar de `useTemaRv`. `panel-rv.css` bajo `.rv-panel`: densidad táctil (controles 48 px, texto base 17 px en < 900 px, 18 px en Vender), títulos con `--fuente-display`.
- [ ] **Paso 4: `npm run pruebas` y `npm run build`** → pasan.
- [ ] **Paso 5: Mirarlo** con `npm run dev` en un teléfono de 360 px (`mirar.mjs`, CDP) con un tema claro y uno oscuro: Inicio, Pedidos, Mi inventario, Clientas, Mis precios, Mi catálogo. Nada ilegible ni corrido de lado.
- [ ] **Paso 6: Commit** `fase 7: el panel se viste con el tema de su catálogo`.

### Tarea 4: Vender en tres pasos

**Archivos:**
- Reescribir: `src/paginas/revendedor/panel/VenderRv.tsx` (el estado, la carga, el envío y el paso actual; menos de 200 líneas)
- Crear en `src/paginas/revendedor/panel/vender/`: `PasoPiezas.tsx`, `PasoClienta.tsx`, `PasoCobro.tsx`, `Listo.tsx`, `BarraVender.tsx`, `vender.css`

**Interfaces:**
- Consume: todo lo de la Tarea 2; `rv_vender` con `p_cliente_id` (Tarea 1); `enlaceApartado`, `enlaceWhatsApp`, `rpcRv` de `lib/revendedor.ts`; `METODOS_PAGO`, `METODOS_EN_DOLARES`, `PIDE_REFERENCIA`.
- Produce: la ruta `/rv/vender` de siempre.

- [ ] **Paso 1: Estado y persistencia.** `EstadoVender` en `VenderRv`; el carrito y lo escrito se guardan en `sessionStorage` `lux-rv-vender-v1` (try/catch en leer y escribir); al cargar las piezas, `conciliarCarrito` y un aviso con `quitadas`/`bajadas`. El paso va en la ruta (`?paso=1|2|3`, `navigate` con historial), así "atrás" vuelve un paso; `?paso=2` sin piezas vuelve a 1.
- [ ] **Paso 2: `PasoPiezas`.** Buscar arriba; "Tuyas · Todas" (empieza en "Tuyas" si alguna tiene `mias > 0`); cuadrícula de 2 columnas en el teléfono; cada tarjeta `<article>` con la foto como botón que suma una y, con la pieza en el carrito, un contador hermano (− n +). Marca "Tuyas: n". "A tu clienta" grande; "te sale" solo con `precio_lux_usd`; "n libres". De a 60 con "Ver más (faltan n)".
- [ ] **Paso 3: `PasoClienta`.** Buscar entre las suyas (`buscarClientas`), un toque la elige (tarjeta con "Cambiar"); "Clienta nueva" con Nombre y Teléfono y "Más datos" (Apellido, Cédula). `clientaConDato` sobre lo escrito: "Es María G., ¿es ella?" con "Sí, es ella". Si la elegida no tiene teléfono de 10 dígitos, se pide.
- [ ] **Paso 4: `PasoCobro`.** Tres botones grandes "Pagó todo · Una parte · Todavía no" ("Una parte" solo con `dias_credito`). "Pagó todo": fichas de método; monto ya puesto con `montoQueCubre` (se recalcula al cambiar de método mientras no lo haya editado); referencia solo con `PIDE_REFERENCIA`. "Una parte": monto con la frase del mínimo y lo que quedará debiendo. "Todavía no": la frase de las horas. Encima del botón: "Le pagas a Lux $X · ganas $Y" o "Todas son tuyas: no le debes nada a Lux".
- [ ] **Paso 5: `BarraVender`.** Fija abajo, encima de la barra de navegación del panel (y con `env(safe-area-inset-bottom)`): piezas, total $ BCV y Bs, y el botón del paso ("Seguir", "Seguir", "Hacer el pedido" / "Hacer y confirmar"). Debajo, la frase de `faltaParaSeguir`. Apagado mientras guarda.
- [ ] **Paso 6: Enviar y `Listo`.** `rv_vender` con `p_cliente_id` (elegida) o los datos de la nueva (`p_cedula` puede ir null); `p_pago` como hoy con `'todo'` o `'parte'`. Con error: el texto de `textoDeError`, todo se queda, "Intentar otra vez". Con éxito: `Listo` según el resultado (toda suya y pagada → "Venta anotada."; `por_pagar_lux` → "Confirmado: págale a Lux $X" con `vence_lux_en` del resumen recargado y "Pagarle a Lux"; si no → "Mandarle su enlace por WhatsApp" y "Copiar enlace"); "Vender otra" limpia el `sessionStorage` y vuelve a `?paso=1`.
- [ ] **Paso 7: `npm run build`** → sin errores.
- [ ] **Paso 8: Recorrerlo** contra la base de verdad con el #74 corrido y un revendedor de prueba (o, si el dueño no ha corrido el #74, hasta el envío): venta de una pieza a una clienta conocida pagada (contar toques: meta ≤ 4 y 0–1 campos), clienta nueva sin cédula, 30 piezas en el carrito, recargar a la mitad, red caída al enviar (DevTools offline), doble toque. Capturas a 360 px.
- [ ] **Paso 9: Commit** `fase 7: Vender en tres pasos`.

### Tarea 5: Inicio, lo urgente primero

**Archivos:**
- Modificar: `src/paginas/revendedor/panel/InicioRv.tsx`, `panel-rv.css`

**Interfaces:**
- Consume: `ResumenRevendedor` con `fases`, `credito_usd`, `vence_lux_en` (Tarea 3).

- [ ] **Paso 1:** Arriba, tarjetas solo si aplican, en este orden: pagos por confirmar (`fases.por_confirmar`) → Pedidos; lo que debe a Lux con "vence el …" (`vence_lux_en`, hora de Venezuela) → Pedidos; aprobados por retirar (`fases.vendido`) → Pedidos; "Te deben $X (hoy Bs Y)" → `/rv/apartados?ver=deben`. Después un botón grande "Vender" y "Mandar mi catálogo". Lo demás como hoy (mes, tope, meses, "Cómo funciona"), sin cambiar cifras; el texto de "Cómo funciona" sobre Vender dice que desde el panel la cédula es opcional.
- [ ] **Paso 2: `npm run build`** y mirarlo a 360 px con y sin cosas urgentes.
- [ ] **Paso 3: Commit** `fase 7: Inicio dice lo urgente primero`.

### Tarea 6: La guía, los documentos y la entrega

**Archivos:**
- Modificar: `src/paginas/publico/GuiaRevendedorPiezas.tsx` (el manual: Vender en tres pasos, "Pagó todo · Una parte · Todavía no", "Clienta nueva", cédula opcional desde el panel; los nombres tal como salen), `CLAUDE.md` (árbol de `revendedor/panel` con `vender/`; reglas del revendedor: cédula opcional desde su panel, panel con su tema; `rv_vender` con `p_cliente_id`; `rv_resumen` con `tema` y `vence_lux_en`; la cuenta de `verificar`), `DESIGN.md` y `.impeccable/design.json` (el panel del revendedor sale del sistema de Lux: su tema y densidad táctil), `docs/fases/2026-11-revendedores/README.md` (estado de la fase 7; próximo SQL libre #75), `ESTADO.md` si toca.

- [ ] **Paso 1:** Escribir los documentos.
- [ ] **Paso 2:** `npm run pruebas` y `npm run build` → pasan. `npm run verificar` si hay credenciales en la máquina; si no, decir que falta.
- [ ] **Paso 3:** Revisión simple propia: releer el diff entero contra el diseño (memoria: sin agente revisor final).
- [ ] **Paso 4:** Commit `fase 7: la guía y los documentos`. Entregar al dueño: correr el #74 (con lo que debería dar), después fusionar `fase-7-panel` a `main` y push.
