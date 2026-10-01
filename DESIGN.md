---
name: Lux by Emory
description: El estuche de la joya. Sistema de inventario y venta de una joyería, con la pieza como protagonista y la interfaz callada alrededor.
colors:
  verde-profundo: "#1F4045"
  oro-arena: "#D0AE8A"
  crema: "#EDE5D3"
  salvia: "#7F9492"
  tinta: "#14292C"
  blanco: "#FFFFFF"
  papel: "#F4EFE4"
  panel: "#FAF6EE"
  panel-hondo: "#EFE8DA"
  linea: "#E0D8C7"
  linea-suave: "#EDE7DA"
  verde-suave: "#F0F4F3"
  salvia-texto: "#506664"
  oro-texto: "#835D35"
  alerta-texto: "#875C2D"
  exito: "#4A6B52"
  alerta: "#A8763E"
  error: "#8C3A32"
typography:
  display:
    fontFamily: "Fraunces, Bagind, Georgia, serif"
    fontSize: "56px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Fraunces, Bagind, Georgia, serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Fraunces, Bagind, Georgia, serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  price:
    fontFamily: "Fraunces, Bagind, Georgia, serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.1
    fontFeature: "tnum"
  body:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  body-mostrador:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  prose:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.12em"
  label-small:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.12em"
  label-print:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.12em"
rounded:
  xs: "6px"
  base: "12px"
  md: "16px"
  lg: "22px"
  pill: "999px"
spacing:
  e-1: "4px"
  e-2: "8px"
  e-3: "12px"
  e-4: "16px"
  e-5: "24px"
  e-6: "32px"
  e-7: "48px"
  e-8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.verde-profundo}"
    textColor: "{colors.crema}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.crema}"
  button-secondary:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.verde-profundo}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "42px"
  button-secondary-hover:
    backgroundColor: "{colors.verde-suave}"
    textColor: "{colors.tinta}"
  button-confirm:
    backgroundColor: "{colors.verde-profundo}"
    textColor: "{colors.crema}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 32px"
    height: "42px"
  button-danger:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.error}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "42px"
  button-mostrador:
    backgroundColor: "{colors.verde-profundo}"
    textColor: "{colors.crema}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "56px"
  input:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    typography: "{typography.body}"
    rounded: "{rounded.base}"
    padding: "0 16px"
    height: "42px"
  card:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.verde-profundo}"
    rounded: "{rounded.lg}"
    padding: "24px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.verde-profundo}"
    rounded: "{rounded.md}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.verde-profundo}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
  chip-alerta:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.alerta-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
  table-header:
    backgroundColor: "{colors.verde-profundo}"
    textColor: "{colors.crema}"
    typography: "{typography.label}"
    padding: "12px 16px"
  nav-item-active:
    backgroundColor: "{colors.verde-profundo}"
    textColor: "{colors.crema}"
    rounded: "{rounded.base}"
    padding: "0 12px"
    height: "40px"
  cart-bar:
    backgroundColor: "{colors.verde-profundo}"
    textColor: "{colors.crema}"
    rounded: "{rounded.pill}"
    padding: "12px 12px 12px 24px"
---

# Design System: Lux by Emory

Este archivo refleja lo que hay en `src/estilos/tokens.css` y `base.css`, que son
la fuente. Si un valor cambia allí, cambia aquí en el mismo commit. El porqué de
cada regla, con las medidas que la justifican, vive en
`.claude/skills/lux-ui/SKILL.md`; este archivo dice qué es, aquel dice por qué.

## Overview

**Creative North Star: "El estuche"**

La joya es la protagonista y la interfaz es el estuche que la sostiene: cálido,
redondeado, callado. La referencia es Rolex, autoridad silenciosa: el lujo se
demuestra, no se grita. Mucho aire, poco ruido, un solo elemento protagonista por
pantalla. Nada de degradados, sombras dramáticas, emojis ni animación de relleno.

Hay dos caras con densidades opuestas y se diseñan distinto. El **mostrador** es
táctil, grande, de una mano, en un Android de gama baja bajo luz fuerte de tienda:
objetivos de 56 px, texto de 18 px, lo crítico abajo al alcance del pulgar. La
**administración** es densa y tabular en escritorio, pero desde septiembre de 2026
también funciona entera desde el teléfono: donde una tabla no cabe se enseña
menos, no lo mismo reacomodado. La única superficie con alma de pieza de marca es
el catálogo PDF; la vitrina del televisor es su hermana a pantalla completa.

**Key Characteristics:**
- Cuatro colores de marca y nada más; el oro se gasta con avaricia (≤ 5 % de una pantalla).
- Tres familias con roles fijos: Fraunces para títulos y precios, EB Garamond para prosa, Jost para toda la interfaz.
- Formas redondeadas en una sola escala; todos los botones son píldoras.
- Elevación teñida de verde, nunca gris; profundidad por capas de superficie, no por bordes duros.
- Contraste medido, no estimado: todo texto a 4,5:1 o más.

## Colors

Cuatro colores de marca en proporción 60 % crema · 25 % verde profundo · 10 % salvia
· 5 % oro, más los apagados de sistema que la paleta no cubre.

### Primary
- **Verde profundo** (`verde-profundo`): el ancla. Barra lateral, cabeceras de tabla, botón primario, barra del carrito, fondo a sangre de la vitrina y de la portada del catálogo. Es también el color del texto de cuerpo sobre crema.

### Secondary
- **Oro arena** (`oro-arena`): el acento precioso. Solo luce sobre verde profundo: barra de la sección activa, borde de confirmación, precio en la vitrina, regla ornamental con el monograma. Sobre claro da 2,08 en blanco y 1,66 en crema: prohibido como texto ahí.
- **Oro de texto** (`oro-texto`): el mismo tono (31°) y saturación (43 %) a 36 % de luminosidad. Es el único oro permitido sobre fondo claro, 4,68 sobre crema y 5,86 sobre blanco. Material de la ficha del catálogo impreso.

### Tertiary
- **Salvia** (`salvia`): apoyo. Bordes de control al pasar por encima, barra de desplazamiento, líneas. Da 2,56 sobre crema: **no es un color de texto**.
- **Salvia de texto** (`salvia-texto`): la misma familia oscurecida hasta 4,89 sobre crema y 6,13 sobre blanco. Es `--texto-secundario`: etiquetas de campo, pistas, SKU, existencia, metadatos.

### Neutral
- **Tinta** (`tinta`): texto de máximo contraste. Títulos, precios, nombre de la pieza, hover del botón primario.
- **Crema** (`crema`): el papel de marca. Texto sobre verde profundo, portada, fondo de la foto en la vitrina.
- **Papel** (`papel`): fondo de toda la aplicación. Ligeramente más claro que la crema para que las tarjetas blancas no deslumbren.
- **Blanco** (`blanco`): `--superficie`. Tarjetas, campos, tablas, fichas del PDF.
- **Panel** (`panel`) y **Panel hondo** (`panel-hondo`): bloques de resumen dentro de una tarjeta y fondo de campos deshabilitados. Se distinguen por fondo, nunca por borde.
- **Línea** (`linea`) y **Línea suave** (`linea-suave`): bordes de control y de tarjeta. Línea da 3,20 sobre blanco, que es lo que un borde necesita para verse.
- **Verde suave** (`verde-suave`): hover de fila de tabla y de botón secundario.

### System states
Apagados, nunca saturados. Ningún otro color existe; si hace falta uno nuevo, no hace falta.
- **Éxito** (`exito`): venta registrada, cuadre correcto.
- **Alerta** (`alerta`) para fondos y bordes; **Alerta de texto** (`alerta-texto`, 4,65 sobre crema) para leer: existencia baja, descuadre menor.
- **Error** (`error`): descuadre, validación fallida, margen negativo.

### Named Rules
**La regla del oro.** El oro solo se lee sobre verde profundo. Sobre claro, `oro-texto` o nada. Si el oro ocupa más del 5 % de una pantalla, quítale oro a algo.

**La regla del color medido.** Un color de marca no es automáticamente un color de texto. Antes de usarlo para leer se mide contra el fondo real; salvia, alerta y oro tienen su variante de texto por eso.

**La regla de la paleta del revendedor.** La única excepción a "ningún otro color". El catálogo y el panel de un revendedor pueden llevar una de seis paletas (`lux`, `noche`, `vino`, `grafito`, `ciruela`, `oliva`, en `estilos/revendedor.css`), cada una con los mismos papeles que la de Lux y cada par de texto medido a 4,5:1; el peor de cada una va anotado en la cabecera del archivo. No hay selector de color libre. Debajo de su nombre siempre dice "Joyas Lux by Emory".

**La regla de las dos monedas.** En este negocio hay dos dólares y valen distinto. Todo "$" en pantalla dice cuál es: "$20,00 BCV" (el de la etiqueta) o "$14,50 Binance" (el que se compra afuera). En una tabla la moneda va en la cabecera ("Costo · $ Binance") y la celda lleva la cifra sola. Un "$" pelado es un defecto.

## Typography

**Display Font:** Fraunces (sustituto de Bagind, la fuente de marca; Georgia de reserva)
**Body Font:** Jost (system-ui de reserva)
**Prose Font:** EB Garamond (Georgia de reserva)

**Character:** serif de alto contraste para lo que tiene que sentirse de joyería, sans
geométrica y silenciosa para todo el trabajo. Un panel de administración es casi todo
etiquetas y cifras: aplicarle la serif lo envejece, así que EB Garamond se reserva
para prosa de verdad.

Escala cerrada: 12 · 14 · 16 · 20 · 28 · 40 · 56 px. No se inventan tamaños
intermedios. Se cargan solo los pesos usados (Fraunces 600, EB Garamond 400/500,
Jost 400/500) con `font-display: swap`.

### Hierarchy
- **Display** (600, 56 px, 1.0): nombre y precio en la vitrina; wordmark de la portada. En televisores de más de 1600 px sube con `clamp(56px, 4.4vw, 92px)`.
- **Headline** (600, 28 px, 1.2, −0,015 em): `h1` de cada pantalla; total del carrito y del cobro.
- **Title** (600, 20 px / 16 px, 1.2): `h2` de tarjeta y `h3` de sección; precio en la tarjeta de modelo.
- **Price** (600, tabular): cualquier cifra de dinero va en display serif con `tabular-nums`. Es lo que hace que una cifra se sienta de joyería y no de ferretería.
- **Body** (400, 15 px escritorio / 18 px mostrador, 1.55): Jost. Formularios, tablas, avisos, controles.
- **Prose** (400, 16 px, 1.45, máx. 68 ch): EB Garamond. Nombre de la pieza, descripciones, estados vacíos, frases de marca, catálogo impreso.
- **Label** (500, 12 px, 1.3, 0,12 em, MAYÚSCULAS): etiquetas de campo, cabeceras de tabla, botones, píldoras, categoría, existencia.
- **Label pequeña** (500, 11 px): botones pequeños, píldoras de estado, existencia en la tarjeta de modelo. Es el único paso por debajo de la escala, y existe porque a 12 px esas piezas obligaban a partir la palabra en dos líneas.
- **Label de impresión** (500, 10 px): SKU, material, existencia y ubicación en la ficha del catálogo PDF, donde caben tres por fila. Solo en `impresion.css`.

### Named Rules
**La regla del precio.** Todo precio va en display serif. Sin excepción, ni en una celda de tabla.

**La regla de la sans.** Jost es la fuente de trabajo de la interfaz. La serif de lectura nunca va en una etiqueta, un botón o un dato.

## Layout

Escritorio: armazón de dos columnas, barra lateral fija de 244 px en verde profundo y
contenido con `max-width: 1180px` y relleno de 32 px (`e-6`). Las páginas de
formulario usan `.pagina--angosta` a 700 px. Rejillas fluidas con
`repeat(auto-fit, minmax(280px, 1fr))` para paneles y `minmax(160px, 1fr)` para
cifras de tablero.

Ritmo de espaciado en ocho pasos (4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 px). Entre
tarjetas, 16 px en escritorio y 20 px en el mostrador (`--hueco-campos`). Las
etiquetas de campo viven en una caja de 34 px anclada abajo, así dos campos vecinos
nunca quedan a distinta altura aunque una etiqueta ocupe dos líneas.

Por debajo de 900 px la barra lateral desaparece y **la navegación vive abajo**:
barra fija de cuatro columnas (tres secciones diarias y un botón "Más" que abre una
hoja con todas), 52 px de objetivo táctil, cabe en 320 px. El contenido reserva su
sitio con `padding-bottom` y la barra del carrito flota por encima de la navegación,
no sobre sus botones. Puntos de quiebre reales: 900 (navegación y vitrina), 720,
560 (rejilla del PDF a una columna), 380.

Mostrador: cuadrícula de tarjetas `repeat(auto-fill, minmax(158px, 1fr))`, texto base
de 18 px, controles de 56 px, acciones principales abajo. Inventario en teléfono:
fichas de siete datos en vez de tabla de trece columnas. Filtros plegados en
`<details>` con el número de filtros activos en el título; abiertos en escritorio.
Paginación arriba y abajo cuando la lista es larga.

Catálogo PDF: `@page { margin: 14mm }`, portada a sangre en verde profundo, fichas en
rejilla de tres columnas con `break-inside: avoid`, una franja de frase de marca cada
nueve fichas. Vitrina: rejilla de dos columnas foto/ficha a pantalla completa, una
pieza por pantalla; en angosto la ficha baja debajo de la foto.

## Elevation & Depth

Híbrido de capas y sombra suave. La profundidad sale primero de tres superficies
cálidas de atrás hacia adelante: papel (fondo), superficie blanca (tarjetas, campos)
y panel (bloques de resumen dentro de una tarjeta). Un panel no lleva borde propio:
se distingue por su fondo.

Las sombras existen en tres pasos y **siempre teñidas del verde de marca**, nunca
grises ni dramáticas. Sobre fondo verde (vitrina) la sombra se tiñe aún más oscura
del propio verde para no ensuciar.

### Shadow Vocabulary
- **Reposo** (`--sombra-1`: `0 1px 2px rgba(31,64,69,.05), 0 2px 8px rgba(31,64,69,.04)`): tarjetas, campos, botones en reposo.
- **Hover** (`--sombra-2`: `0 2px 4px rgba(31,64,69,.06), 0 8px 24px rgba(31,64,69,.07)`): botón al pasar por encima.
- **Flotante** (`--sombra-3`: `0 4px 8px rgba(31,64,69,.08), 0 16px 40px rgba(31,64,69,.10)`): barra del carrito y tarjeta de modelo levantada.
- **Foco** (`--anillo-foco`: `0 0 0 3px rgba(31,64,69,.18)`): campos con foco. **Foco oro** (`--anillo-oro`: `0 0 0 3px rgba(208,174,138,.40)`): hover del botón de confirmación.

Movimiento: una sola curva de salida `cubic-bezier(0.22, 1, 0.36, 1)` en dos
duraciones, 150 ms (`--rapido`) para color y borde, 240 ms (`--medio`) para sombra y
desplazamiento. Una tarjeta tocable sube 3 px al pasar y vuelve al presionar; un
botón sube 1 px. Con `prefers-reduced-motion` se cae el `transform` y se conserva la
respuesta de color a 120 ms: quien pide menos movimiento no pide quedarse sin saber
si el sistema lo leyó.

### Named Rules
**La regla de la sombra verde.** Ninguna sombra gris. Toda elevación lleva el verde profundo en su rgba.

**La regla de la tarjeta única.** Tarjeta dentro de tarjeta está prohibido. Dentro de una tarjeta, un panel de fondo; nunca otro borde.

## Shapes

La marca es redondeada y cálida: el estuche, no la caja. Una sola escala, sin valores
intermedios: 6 px (anillos de foco, detalles), 12 px (campos, contadores, píldoras
pequeñas, elementos de navegación), 16 px (paneles, monograma, avisos, teclado del
PIN), 22 px (tarjetas, tablas, estados vacíos, fotos de la vitrina) y píldora para
todos los botones, etiquetas y filtros. Bordes de 1 px en línea suave para tarjetas y
en línea para controles; el único borde de 2 px es el de confirmación en oro.

Ornamento de la casa: dos líneas finas horizontales flanqueando el monograma "L". Se
reutiliza como divisor en la vitrina, la portada y las franjas del catálogo. El
wordmark LUX no se deforma, rota, sombrea ni se pone sobre fondos cargados.

## Components

### Buttons
Píldoras con respuesta al tacto. Jost 12 px, mayúsculas, tracking 0,12 em, 42 px de alto en escritorio y 56 px en el mostrador (36 px la variante pequeña, a 11 px).
- **Shape:** píldora (999 px).
- **Primary:** verde profundo con texto crema y sombra de reposo; al pasar, tinta, sube 1 px y gana la sombra de hover; al presionar vuelve.
- **Secondary:** blanco con borde línea y texto verde; al pasar, fondo verde suave y borde salvia.
- **Confirm:** el primario con borde de oro de 2 px y relleno más ancho (32 px). El oro es borde de confirmación, nunca relleno.
- **Danger:** blanco con texto y borde en error al 35 %; al pasar se rellena de error con texto crema.
- **Sobre verde** (barra lateral, vitrina, carrito): el secundario pasa a crema al 12 % con borde crema al 26 %; el primario del carrito es oro con texto tinta, y al pasar se vuelve crema.
- **Disabled:** opacidad 0,42 y sin sombra.

### Inputs / Fields
- **Style:** blanco, borde línea de 1 px, radio 12 px, 42 px de alto (56 en mostrador), Jost 16 px en tinta. Etiqueta arriba en label anclada abajo de una caja de 34 px.
- **Hover:** borde salvia.
- **Focus:** borde verde profundo y anillo de foco de 3 px.
- **Error:** borde error, anillo de error al 18 %, mensaje en error de 12 px justo debajo del campo, junto a él. Disabled: fondo panel hondo y texto secundario.
- **Select:** flecha propia dibujada con dos degradados en salvia de texto; **file:** fondo panel, borde discontinuo y botón interno vestido como el secundario.

### Cards / Containers
- **Corner Style:** 22 px.
- **Background:** blanco sobre papel, borde línea suave de 1 px.
- **Shadow Strategy:** reposo; una tarjeta tocable sube a flotante al pasar.
- **Internal Padding:** 24 px.
- **Panel** (dentro de tarjeta): fondo panel, radio 16 px, relleno 16 px, título en label secundario. Sin borde.

### Chips
- **Style:** `.etiqueta`, píldora con borde de 1 px en `currentColor`, 11 px en mayúsculas.
- **State:** alerta, éxito y error tiñen texto y fondo al 8 % del color de estado. Los filtros de categoría son botones secundarios pequeños que se envuelven en dos líneas, nunca se deslizan a escondidas.

### Tables
Cabecera pegajosa en verde profundo con texto crema en label, esquinas superiores a 22 px. Cuerpo Jost 14 px; fila resaltada en verde suave al pasar, sin filas alternas. Cifras a la derecha con `tabular-nums`, negativas en error, positivas en tinta. Primera columna anclada para que las acciones no se vayan al desplazar. Envoltura con borde línea suave, sombra de reposo y barra de desplazamiento visible en salvia. En el teléfono la tabla no se reacomoda: se cambia por fichas.

### Navigation
- **Escritorio:** barra lateral de 244 px en verde profundo. Cada sección con icono y nombre, Jost 14 px medium, crema al 72 %; al pasar, fondo crema al 10 %; la activa lleva fondo crema al 14 %, texto crema, icono en oro y una barra de oro de 3 px por dentro del borde izquierdo (`inset 3px 0 0`).
- **Teléfono (≤ 900 px):** barra fija abajo en verde profundo con línea superior de oro al 22 %, cuatro columnas de 52 px con icono y nombre corto. Las tres secciones son las diarias, no las primeras de la lista; "Más" abre una hoja desde abajo con todas y devuelve el foco al cerrar.
- **Iconos:** SVG propios de trazo 1,5 y `viewBox` 24, color heredado, siempre con texto y `aria-hidden`. Nunca emojis.

### Avisos
Borde completo y fondo teñido, sin franja lateral de color. Radio 16 px, Jost 14 px con título en label. Éxito, alerta y error tiñen borde al 38 % y fondo al 6–8 % de su color; el texto va en la variante legible.

### Tarjeta de modelo (mostrador)
La tarjeta táctil de la cuadrícula de venta, y la del catálogo público. Foto cuadrada arriba sobre panel hondo; debajo nombre en EB Garamond 16 px, **dos precios del mismo tamaño**, bolívares y $ BCV, uno sobre otro en Fraunces 20 px tabular, existencia en label de 11 px (alerta si ≤ 2; con existencia cero no aparece) y un contador en píldora verde. Sube 3 px y pasa a sombra flotante al pasar, borde salvia; vuelve al presionar.

**En el mostrador lleva dos líneas más, que el catálogo público no lleva.** Debajo de los dos precios, el **tercer precio**: lo que se cobra si pagan en dólares, "$14,50 Binance", en Fraunces 16 px salvia de texto (5,9:1 sobre blanco). Un paso más chico porque es para ella, no lo primero que lee la clienta; en serif porque es un precio. Y el **mínimo**: "Mínimo Bs 1.215,00" en Jost 12 px oro de texto (5,86:1), o "Precio fijo" si la pieza no admite rebaja.

**Con variantes es una sola tarjeta.** Bajo el nombre, las medidas en Jost 14 px secundario ("45 cm · 60 cm"); si los precios difieren, la tarjeta enseña el más bajo con "desde" en label encima. Tocarla abre la hoja de elegir variante en vez de agregar.

### Hoja para elegir variante
Sube desde abajo, al alcance del pulgar, sobre un fondo de tinta al 58 %. Clara (papel), no verde: lo que se elige son piezas con su precio y se leen igual que en la cuadrícula. Nombre del producto en Fraunces 20 px, una línea de ayuda y el botón de cerrar de 48 px. Cada opción es una fila táctil de 64 px como mínimo: la medida en Fraunces 20 px y debajo lo que queda y el mínimo en Jost 14 px; a la derecha los precios apilados, bolívares y $ BCV del mismo tamaño y Binance un paso abajo. Si ya lleva de esa, un contador verde en la esquina. Un toque agrega y cierra. En escritorio es la misma hoja, centrada, de 520 px.

**Por qué una hoja y no fichas en la tarjeta.** Un blanco de 56 px por medida no cabe tres veces en una tarjeta de 160 px sin volverla una lista. Dos toques, abrir y elegir, es lo mínimo cuando hay que decidir algo.

### Visor de la pieza
A pantalla completa sobre tinta al 88 %. Foto hasta 60 vh; debajo categoría en oro, nombre en EB Garamond 20 px, SKU, las variantes como píldoras de 44 px (la elegida en crema con texto verde), bolívares y $ BCV en Fraunces 28 px crema, Binance en 16 px donde se enseña, lo que queda, materiales y un botón de agregar en **oro relleno con texto verde** (5,38:1): sobre el fondo oscuro del visor el oro es relleno legítimo, igual que en la barra del carrito.

**Se pasa de pieza sin salir**: flechas del teclado en la computadora, deslizar el dedo a un lado en el teléfono, y en los dos **botones de flecha siempre visibles** de 48 px a media altura, en tinta al 62 % para leerse encima de la foto. El gesto sin botón es invisible, y quien no puede deslizar se queda sin camino. La pieza nueva entra 32 px desde el lado hacia el que se pasó, en 200 ms; con movimiento reducido solo aparece. Debajo, "3 de 40" en label. Deslizar solo vive dentro del visor: en la cuadrícula, deslizar de lado sigue siendo mover la página.

### Barra del carrito
Píldora flotante en verde profundo con sombra flotante, fija abajo por encima de la navegación. Piezas en label crema al 72 %, total en Fraunces 28 px, tramo alcanzado en oro y lo que falta en crema al 66 %. Botón de cobrar en oro con texto tinta.

### Vitrina (televisor)
Verde profundo a sangre. Categoría en label oro, nombre en EB Garamond crema, regla ornamental, **dos precios del mismo tamaño**, bolívares y $ BCV, los dos en Fraunces oro, materiales en prosa separados por línea de oro al 45 %. Cada cuatro piezas, una frase de marca centrada en EB Garamond. Clave de ubicación ("V1 · BG") en la esquina superior derecha, Jost crema al 66 % (4,86:1): para la vendedora, no para la clienta. Controles que se esconden a los 4 s y barra de progreso de 3 px en oro.

Un producto con variantes es una sola pantalla: si cuestan lo mismo, las medidas en la línea de nota y un precio; si no, una fila por medida con su nombre y sus dos precios.

**Todo se mide contra la pantalla, no en píxeles.** Probada en un Daewoo de 32" (septiembre de 2026), el precio quedaba por debajo del borde: el navegador del televisor dibuja la página como si la pantalla fuera más chica, y el logotipo y los controles reservaban una fila arriba y otra abajo aunque estuvieran ocultos. Ahora:
- las letras son una fracción del alto (`vh`) con un tope por el ancho (`vw`): nombre ≈ 6,2 % del alto, precio ≈ 7,4 %, con topes de 96 y 112 px;
- el logotipo y los controles flotan encima: la pieza usa la pantalla entera;
- todo lo importante queda dentro de un margen de seguridad del 5 %, porque muchos televisores recortan los bordes;
- si aun así la ficha no cabe (un nombre muy largo, cinco medidas), `Vitrina.tsx` mide lo que se dibujó y baja su letra (`--escala`, hasta la mitad) hasta que entra entera. Se achica la letra; nunca se corta el precio.

En vertical (un teléfono) la foto va arriba y la ficha debajo, por orientación y no por ancho: un televisor que el navegador dibuja a 900 px sigue siendo horizontal.

### Catálogo PDF
Portada a página completa en verde profundo con el wordmark verde dentro de un recuadro crema, regla de oro con monograma, intro y materiales. Fichas en crema con fondo blanco, borde de 1 px, radio 12 px: foto cuadrada, SKU y existencia en Jost 10 px secundario, nombre en EB Garamond 16 px, material en oro de texto, bolívares y $ BCV en Fraunces 20 px los dos, ubicación en el mismo tono que la existencia. Con variantes, una ficha por producto: medidas del mismo precio en la nota; de precios distintos, una fila por medida con los dos precios en Fraunces 16 px. Pie "Lux by Emory · Desde Sabana de Mendoza para toda Venezuela".

En pantalla, antes del enlace para WhatsApp y fuera de la impresión, **Visitas al catálogo en línea** (de las dos caras: la vendedora también tiene "Catálogo" en su menú): título de sección y tres celdas del tablero de "Mi día" (Hoy, Últimos 7 días, Últimos 30 días), cada una con las personas en la cifra del tablero y debajo, en su meta, "ayer 5" o "2 pedidos por el catálogo". Al pie, una pista que dice qué cuenta: un teléfono por día, sin la tienda. Sin gráfico: son tres números, y la librería de gráficos no se le carga al teléfono de la vendedora por tres números.

### Costos: la cifra que manda
La única pantalla con una cifra protagonista de verdad: las piezas que hay que vender en el mes, en Fraunces 56 px (40 px en teléfono), con su unidad en label debajo y para qué alcanzan en EB Garamond 20 px. A su lado, en un panel, la mitad secundaria de la respuesta (las piezas para no perder). Debajo, una barra de avance del mes y una frase con el ritmo. La cuenta se enseña entera más abajo como cadena de pasos ("se vende en − mercancía − empaque = deja"), para que el número no se crea por fe.

### Tus datos (pedido del catálogo)
Empieza por la cédula, sola, con la pista "Si ya compraste con nosotros, no tienes que escribir nada más". Si ya es clienta, aparece un panel sin borde: "Ya compraste con nosotros" en label, su nombre enmascarado ("María G.") en Fraunces 28 px, "Te escribimos al número que termina en 67" y dos botones, "Sí, soy yo" y "Cambiar mis datos". Si no, una línea de bienvenida y los campos de siempre. El botón de apartar dice debajo qué falta mientras está apagado. Enmascarado a propósito: el catálogo lo abre cualquiera.

### Tabla de variantes (formulario del producto)
Una fila por variante con cuatro casillas: nombre, cantidad, costo en $ Binance y "Sale en". La primera fila es la pieza misma, sobre fondo de panel, con el costo "el de arriba" como texto y su cantidad atada a la de la tarjeta de existencias. El costo vacío muestra "igual: $4,2000" como marcador. "Sale en" da el precio en Fraunces 16 px y debajo los bolívares, el grupo y lo que deja, en Jost 12 px secundario; si ningún grupo alcanza, una línea en alerta de texto. Quitar es un botón de 44 px con una cruz; la fila quitada queda al 50 % con "Deshacer" y un aviso de que sale del catálogo al guardar. Una lista arriba dice de qué ubicación son las cantidades. En el teléfono la cabecera desaparece, cada casilla lleva su etiqueta, y la fila se acomoda en tres renglones: nombre y quitar; cantidad y costo; precio.

### Mover de ubicación
Un botón "Mover" con su icono (una flecha que llega a una pared) junto a Editar en el Inventario, y en el Mostrador un círculo de 38 px arriba a la izquierda de cada tarjeta, frente a la lupa y con su misma ropa. Abre la misma hoja de elegir variante con un formulario corto: si la pieza está en un solo sitio, lo dice en una frase ("Está en Vitrina 1: 3 piezas"); si está en varios, pregunta de cuál. Después "Llevar a" y "Cuántas" (por defecto, todas las que hay ahí) y el botón Mover. Con variantes, primero "Cuál".

### Pago móvil, para copiar
En la página del pedido, antes de "Cómo pagaste": un panel "Pago móvil Lux" con tres renglones separados por una línea suave. Cada uno lleva a la izquierda su etiqueta en mayúsculas (Cédula, Teléfono, Banco) y el dato en Fraunces 20 px con números tabulares, y a la derecha un botón secundario "Copiar" de 112 px de ancho y 56 de alto, al alcance del pulgar. Al tocarlo dice "Copiado" con borde y letra en verde de éxito durante dos segundos y medio, y un aviso oculto lo dice al lector de pantalla. Debajo, "Copiar los tres juntos" (44 px de alto) para mandárselos a quien paga por ella, y la pista "Toca Copiar y pégalo en la aplicación de tu banco." Si el navegador no deja copiar, la pista cambia a cómo copiarlo a mano.

### El crédito en la ficha de la clienta
Si tiene ventas por verificar, un panel "Pago por verificar" con la frase "2 ventas por Bs 1.240,00." en la letra del servicio. En cada venta del histórico: la etiqueta en alerta "Pago por verificar" junto a la del servicio; si ya se comprobó, un renglón propio "Quedó por verificar. Pago comprobado el 20 sep, 12 días después."; si se anuló porque el pago no llegó, solo la etiqueta en error "Anulada: el pago no llegó". La referencia del pago va en la línea de datos.

### Apartar (mostrador)
Reemplazó a "Pagó una parte" el 30/09/2026. En el cobro, justo debajo de la forma de pago y con sus mismos botones, "Pagó todo" y "Lo aparta". Con "Lo aparta", en la franja verde suave del cobro en dólares: "Para apartar paga al menos el 40 %: **Bs 400,00** ($4,00 BCV). Tiene 15 días para pagar lo demás; si no, pierde lo abonado y las piezas vuelven a la venta." Debajo "Cuánto paga ahora · Bs" (o "· $"), la referencia ("Referencia de este pago") y una frase viva: "Faltarán **$6,00 BCV**, hoy **Bs 600,00**. Queda en Pedidos, y ahí se carga cada abono con su referencia." Si no llega al mínimo o ya es el total, lo dice en error junto al campo. Los botones: "Apartar" (confirmación), "Apartar, pago por verificar" (solo si la forma de pago no es en persona) y "Seguir agregando". Un apartado va a nombre de alguien: sin la clienta, el botón se apaga y la pista lo dice. El 40 % y los 15 días salen de la configuración; sin ellos, "Lo aparta" no aparece.

### Abonos de un pedido
Un panel "Abonos" en la tarjeta del pedido ("Lo que le ha pagado a Lux" en la de un revendedor, "Tus pagos" en el enlace de la clienta). Cada pago en un renglón: el monto en Fraunces 16 px y a la derecha su estado en una píldora (Por verificar en alerta, Llegó en éxito, No llegó en error); el que no llegó se tacha en salvia de texto y se queda. Debajo, fecha y hora, forma de pago, referencia, los datos de quien pagó si los reportó, y quién lo cargó o lo reportó. En su propia línea, lo que faltaba después de él: "Después de este, faltaban **$6,00 BCV**". En Pedidos, bajo cada pago que la tienda puede tocar, Llegó, Corregir y No llegó (peligro, con confirmación) en botones pequeños de 44 px; Corregir abre el formulario dentro del renglón, tras una línea (forma de pago, cuánto, referencia y "Por qué lo corriges", con la frase viva de cuánto faltaría), y "Se corrigió una vez" despliega quién cambió qué y por qué. Al final, "Faltan $6,00 BCV, hoy Bs 660,00 ($4,40 Binance)" o, en verde de éxito, que está pagado. Al pie, tras una línea, "Cargar otro abono" con la casilla "Ya lo vi en el banco" (44 px) para lo que se paga a distancia.

### Reportar un pago (sin sesión)
En el enlace del pedido, tras el panel de pago móvil: las formas de pago a distancia con la ropa de siempre (pago móvil, transferencia, Binance; el efectivo no se reporta), "Cuánto pagaste · Bs" con dos atajos de 44 px pegados al campo ("Todo lo que falta", "El mínimo para apartar"), la referencia, la fecha y, por pago móvil o transferencia, la cédula y el teléfono de quien pagó. Una frase viva dice cuánto faltará, o que todavía no llega al mínimo ("si pagaste en dos partes, reporta la otra enseguida"). El botón es de confirmación y debajo, mientras está apagado, qué falta.

### Guía para revendedores (pública)
Una página para leer en el teléfono desde un enlace de WhatsApp, con la densidad del mostrador (controles de 56 px). Cabecera del catálogo público con "Guía para revendedores". **Portada** en verde profundo a lo ancho: antetítulo en label oro, "Vende joyas Lux con tu propio catálogo" en Fraunces 28 (40 en tableta y escritorio), la entrada en EB Garamond 20 crema, una línea fina y tres claves ("25 % menos", "Con tu nombre", "Sin comprar antes") en Fraunces 28 con su label oro encima; "Empezar la guía" en oro relleno (legítimo sobre verde) y "Quiero ser revendedor" con borde crema. **Índice** agrupado en siete partes numeradas ("2 · Tu dinero" en label oro de texto), plegable en el teléfono y fijo al lado en escritorio (272 px); el tema actual con fondo verde suave, sin franja lateral. Cada salto lleva `?ir=` en la dirección, para mandar una sección. **Secciones** separadas por una línea fina, con su parte en label oro de texto y el título en Fraunces 28; la prosa en EB Garamond **20 px** (a 16 se queda chica en un teléfono de gama baja) y las instrucciones en Jost 16, la letra del panel. Notas en panel crema. Las piezas que se tocan: la **calculadora** (tres campos y cuatro cuentas en paneles de dos columnas, "Ganas por pieza" y "Con 10 al mes" en verde suave), los **niveles** del tope en paneles, el **manual** (catorce pasos plegables de 64 px con su número en un círculo verde, que pasa a éxito con un trazo de check al marcar "Ya lo entendí"; arriba la barra de avance, guardada en el teléfono), el **recorrido** de un pedido (seis fases en píldoras envueltas, la actual en verde con su número en oro, y la fase en un panel con la píldora real del panel y "Anterior"/"Siguiente"), las **preguntas** con un buscador y la **solicitud** (los campos de Revendedores, las seis paletas, el logo, "Leí la guía" y "Mandar mis datos por WhatsApp" con borde de confirmación). En el teléfono, abajo y fijos, "Índice" y "Quiero ser revendedor". Pie con la regla de líneas finas y el monograma.

### Capacitación revendedores (administración)
Página angosta: "Abrir la guía" arriba, el enlace con "Enviar por WhatsApp" y "Copiar enlace" (el mismo bloque que el del catálogo), y "De dónde saca la guía cada dato" en dos tarjetas de renglones (label a la izquierda, dato a la derecha): a dónde llegan las solicitudes y dónde se retira, con enlace a Textos (y un aviso de alerta si falta el WhatsApp), y las cifras del programa con enlace a Revendedores. Al final, los cuatro pasos para crear la cuenta de quien la pidió.

**Las casillas** (`.casilla`) deshacen la regla general de `input` (sin apariencia y con alto de campo): sin eso salían como cajas vacías de 56 px, también la de "Ya lo vi en el banco" en Pedidos.

### Pedidos: apartados, por verificar y de revendedores
Tres secciones con su cuenta en el título, y arriba, en alerta, cuántos pagos esperan que alguien los compruebe en el banco. **Pedidos y apartados** (del catálogo y del mostrador): la tarjeta de siempre con su origen ("Apartado en el mostrador por Dariana" o "Del catálogo"), su fase en una píldora ("Esperando el pago · 42:10", "Apartado · 12 días", "Pagado, por entregar", "Venció"), el panel "Pago" con "Pagó $4,50 de $10,00 BCV" y hasta cuándo, las piezas con su precio congelado, los abonos y, al pie, "Cargar el pago". Los botones: "Entregar" (confirmación, apagado mientras falte dinero o quede algo por verificar, con la pista de qué hacer), "Mandarle su enlace" por WhatsApp, "Cancelar pedido" (peligro, solo sin dinero), "Archivar" en un apartado vencido y, para el administrador, "Cancelar con dinero": se abre en su renglón y pregunta "Se le devuelve" o "Se queda", cuánto y por qué. Un pedido de antes del apartado conserva "Cerrar el pedido" con "Cobrar y entregar". **Por verificar el pago**: como antes, con los abonos de las ventas por partes; en las que se cobraron completas, "Cargar un pago" (secundario, junto a "Pago verificado") abre el formulario del abono, ya lleno con la forma de pago y la referencia del cobro, y el primer abono la vuelve una venta por partes. **De revendedores**: el revendedor, "Para" su clienta con su cédula, la fase ("Por pagar · 23 h 10 min", "Pagó todo · por aprobar", "Aprobado · por entregar"), lo que le paga a Lux en las tres monedas, las piezas, sus pagos a Lux y "Cargar un pago" (secundario, abre el formulario; en un pedido vencido, solo el administrador); "Aprobar" (confirmación, con un segundo paso que dice que registra la venta a nombre de su clienta) y, aprobado, "Se lo llevó".

### Confirmar la tasa
La única acción que cambia todos los precios de un toque pide un segundo paso en la misma tarjeta, no en una ventana: un panel que dice cada tasa "antes → después" con cuánto sube o baja en oro de texto, y dos botones, "Sí, fijarla" y "Corregir". Un cero de más se ve antes de que cueste.

### Tu día (tablero de la vendedora)
La misma forma que la cifra de Costos, a la escala de ella: lo vendido hoy en Fraunces 56 px con "de 4" a 28 px en salvia de texto al lado, una barra de avance y una frase con lo que falta. Debajo, el mes con su barra y el ritmo. Lo de ella (premium, vendido hoy, ticket) en celdas de tablero, con bolívares y $ BCV del mismo tamaño en las de dinero. En el Mostrador, la meta es una sola línea bajo el título, en éxito cuando se cumple.

### Barra de guardar (Costos)
La barra flotante del carrito, reutilizada: aparece en cuanto cambia un campo, esté donde esté, con Descartar y Guardar. La página reserva su alto abajo mientras está a la vista.

### Indicador con comparación (Reportes)
Celda de tablero: etiqueta, valor y una línea que lo compara con el período anterior del mismo largo ("+12 % contra los 30 días anteriores"). El signo y las palabras cargan el mensaje; el color (éxito si sube, alerta de texto si baja) solo acompaña. Si la cifra lleva su moneda detrás, el valor baja a 28 px para caber en 160.

### El catálogo de un revendedor
El catálogo de la tienda con su ropa: la paleta que él eligió va en `<html>` (`useTemaRv`), así también se visten la hoja de variantes y el visor. En la cabecera, su logo tal como es, en su proporción y sin recortarlo ni encerrarlo en una forma, de 48 px de alto (56 en escritorio; el ancho sale solo, hasta 160 px; en su ficha y en "Mi catálogo" la muestra va a 96), el nombre de su catálogo en Fraunces crema y debajo "Joyas Lux by Emory" en label del acento; a la derecha "Escribir a María", el secundario sobre el ancla. Las tarjetas son las del catálogo público sin la clave de ubicación. Apartar pide la cédula igual que el pedido de la tienda, pero habla por él ("Ya compraste con María"), y antes del botón un panel "Cómo funciona" en EB Garamond: las horas que se guardan las piezas mientras le paga a él, y si da crédito, el mínimo y sus días.

La página del pedido de su clienta lleva su misma cabecera y un aviso por fase: "Apartado por 1 h 42 min" en alerta mientras le paga, "María está revisando tu pago" cuando lo reportó, "Pedido confirmado" en éxito (con su plazo si le dio crédito). Lo que le falta en bolívares de hoy y en $ BCV, del mismo tamaño; "Tus pagos"; el panel "Pago móvil de María" para copiar y "Avisarle a María que pagué". Nada de lo que él le paga a Lux.

### El panel del revendedor
El armazón de la tienda (`Armazon`: barra lateral en escritorio, abajo en el teléfono con Inicio, Pedidos, Vender y Más) vestido con su paleta, y su marca arriba de la barra lateral: el logo arriba, centrado y a 72 px de alto en su proporción, y su nombre debajo en Fraunces 20 px. **Inicio** repite la forma de Costos: lo que ganó en el mes en Fraunces 56 px con "ganaste este mes" en label, y al lado, en un panel, lo que sus clientas le deben. Debajo, su tope como barra de avance con una frase del nivel ("Cuando hayas retirado $77,50 BCV más, tu tope sube a $150,00 BCV"), su enlace para compartir y sus meses en tabla (en el teléfono se cae "Vendiste").

**Pedidos**: pestañas envueltas (Por hacer, Te deben, Todos), y cada pedido en una tarjeta con su fase en una píldora ("Esperando su pago · 1 h 42 min", "Te reportó un pago", "Págale a Lux · 23 h", "Lux revisa tu pago", "Aprobado · retíralo en la tienda"), las piezas como líneas de cobro ("A tu clienta $22,00 BCV · te sale $15,00 BCV", ×2), "Lo que te ha pagado María" con "Me llegó" / "No me llegó" bajo cada pago que ella reportó, y "Confirmar el pedido" (confirmación, con un segundo paso que dice sus horas para pagarle a Lux). Confirmado, "Lo que le pagas a Lux" con sus pagos y, mientras le falte, el pago móvil de Lux y "Avisar que le pagué a Lux". Lo que le paga su clienta se carga con "Cargar un pago" (el principal de la tarjeta cuando no hay que confirmar; abre el formulario dentro de ella y se vuelve "No cargar pago"): abierto en cada tarjeta, la lista medía tres pantallas en el teléfono. Sigue ahí después de retirar la pieza, mientras ella le deba. Bajo cada pago ya recibido, "Quitar" (peligro, pequeño, con confirmación): el que cargó mal queda tachado. En "Te deben", arriba, cuánto le deben entre todas en $ BCV y en Bs de hoy; si a una clienta se le pasó el plazo que él le dio, su tarjeta lo dice en error sin dejar de recibir pagos. En Inicio, bajo "Tus clientas te deben", "Cargar lo que te pagan" lleva a esa pestaña. **Vender**: busca sus piezas (líneas de cobro con contador), el total que le cobra y lo que gana, "Para quién" por cédula (la reconoce si ya es suya) y "¿Ya te pagó?": con el pago en la mano, el pedido nace confirmado. **Mi catálogo** suma "Cómo te pagan": su pago móvil y sus días de crédito. **Mis precios**: una fila por pieza con "Te sale" en Fraunces y su precio en un campo que dice debajo cuánto gana y en qué por ciento; lo cambiado queda en borrador con la barra de guardar de Costos.

### Elegir paleta
Seis radios de verdad, vestidos, en rejilla de 132 px: una muestra de 16 px de radio con el ancla arriba (44 px) y una raya del acento, el papel abajo (18 px), y el nombre en label. Cada muestra lleva la clase de su paleta y dibuja con los tokens, así los colores no se repiten en TypeScript. La elegida lleva borde de 2 px en tinta y la sombra de hover; con el teclado, el anillo de foco.

### El código de entrada (revendedores y vendedoras)
`.codigo-entrada`: se enseña una sola vez, al crear la cuenta o al darle uno nuevo, en Fraunces 28 px con números tabulares y 0,08 em entre letras, seleccionable de un toque, para dictarlo por teléfono sin confundir un 8 con una B. El de un revendedor son doce letras y números, con "Mandárselo por WhatsApp" (confirmación) que manda su catálogo, su panel y el código en un solo mensaje. El de una vendedora del local son ocho dígitos partidos en su número y su PIN ("03 482915"), con "Copiar el código" y "Ya se lo di". No se guarda: si lo pierde, se le da otro.

### Las fichas del equipo (Vendedoras y Revendedores)
`.ficha-persona`: una tarjeta por persona con el nombre en EB Garamond 20 px, sus datos debajo en Jost 12 px y su estado en una píldora a la derecha (activa, en pausa, nivel). Cómo va, en tres celdas de tablero que dentro de la ficha son paneles sin borde, y al pie las acciones en secundario, con Pausar en peligro. **Vendedoras** y **Revendedores** son dos pantallas: son dos cosas aparte, y la de Vendedoras lo dice en su primera línea.

### La caja: anotar y el libro
Dos columnas desde 1240 px: a la izquierda (340 px) la tarjeta **Anotar**, que se queda a la vista al bajar si la pantalla pasa de 860 px de alto; a la derecha las cuentas. Por debajo, anotar va primero (es a lo que se entra) a 700 px como máximo. **Anotar**: "Salió dinero" / "Entró dinero" con la ropa de las formas de pago, y debajo una frase de qué va en cada una; qué fue (con las que ya se escribieron sugeridas), categoría, qué día, cómo se pagó, cuánto (· Bs o · $ según la forma de pago) y la referencia si la forma la lleva. Una línea viva dice "Son Bs 2.100,00, $12,47 BCV a la tasa de hoy"; con otro día, que se usa la tasa de ese día. El botón dice "Anotar salida" o "Anotar entrada", y mientras está apagado, debajo, qué falta.
Arriba de las cuentas, "Un día" / "Un mes" y la fecha o el mes. **El libro** (`.libro`) es una tabla sin cabecera verde, porque vive dentro de una tarjeta: cabecera en label secundario sobre una línea, un renglón por forma de pago con el nombre en Jost medium y debajo, en 12 px, "En dólares Binance" si es en dólares, cuántos cobros y lo que falta verificar en alerta de texto. Entró, salió y queda en Fraunces 16 px tabular, cada renglón en su moneda (la de dólares, cifra sola: el renglón ya lo dice). El pie, en fondo panel con las esquinas de abajo redondeadas: "En dólares BCV" y "En bolívares". Debajo, en alerta de texto, cuánto de lo que entró falta verificar, con enlace a Pedidos. En el teléfono se caen entró y salió: bajan a una línea bajo el nombre, el pie dice solo lo que queda y una frase repite lo que entró y salió en $ BCV. Si una cifra no cabe, el libro se desliza dentro de su tarjeta; la página nunca.
En el mes, además: **En qué se fue**, un renglón por categoría con cuántas veces, el monto en $ BCV y su parte en por ciento, y en un panel lo que entró sin ser venta; y **Día por día**, el libro con Día, Entró, Salió y Queda en $ BCV (la moneda en la cabecera, que puede partirse en dos líneas), cada día un enlace a ese día. **Lo anotado**: el concepto en EB Garamond 16 px, el monto con su signo en Fraunces 16 px, debajo categoría, forma de pago, referencia, quién y su valor en $ BCV, y "Anular" en peligro pequeño. Lo anulado se queda tachado en salvia de texto, con la etiqueta "Anulado" y quién y por qué.

## Do's and Don'ts

### Do:
- **Do** poner todo precio en Fraunces 600 con `tabular-nums`.
- **Do** decir de qué dólar es cada "$": BCV o Binance.
- **Do** poner el precio en bolívares y en $ BCV del mismo tamaño en todo catálogo y en la vitrina.
- **Do** poner el tercer precio, el de $ Binance, solo en el mostrador y en la administración, un paso más chico. Nunca en lo que ve la clienta: el catálogo público, el PDF y la vitrina.
- **Do** acompañar todo gesto con un botón visible que haga lo mismo.
- **Do** medir el contraste contra el fondo real antes de usar un color para leer; 4,5:1 mínimo, sin excepción.
- **Do** usar la variante de texto (`salvia-texto`, `oro-texto`, `alerta-texto`) sobre fondo claro.
- **Do** hacer píldora todo botón, etiqueta y filtro.
- **Do** teñir toda sombra de verde profundo y limitarla a los tres pasos.
- **Do** cambiar una tabla por fichas en el teléfono y decidir qué datos se caen.
- **Do** poner la navegación y las acciones principales abajo en el teléfono.
- **Do** envolver un juego pequeño de pestañas o filtros; si no cabe en dos líneas, deslizarlo con la barra visible.
- **Do** escribir el error junto a su campo, diciendo qué pasó y cómo se arregla.
- **Do** quitarle un elemento a cada pantalla antes de darla por terminada.

### Don't:
- **Don't** usar oro como texto sobre crema o blanco.
- **Don't** usar salvia (`#7F9492`) como color de texto: es de líneas y bordes.
- **Don't** inventar un color, un tamaño de letra ni un radio fuera de las escalas.
- **Don't** meter tarjeta dentro de tarjeta ni franjas laterales de color como acento.
- **Don't** usar degradados decorativos, sombras grises o dramáticas, emojis ni animación de relleno.
- **Don't** aplicar EB Garamond a etiquetas, botones o datos, ni Fraunces a párrafos.
- **Don't** usar filas alternas en tablas: compiten con el hover.
- **Don't** poner nada crítico en la esquina superior izquierda del teléfono.
- **Don't** poner el logo de SGS ni reproducir certificados del proveedor en piezas de la marca.
