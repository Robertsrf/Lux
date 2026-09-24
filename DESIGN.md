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
Un producto con variantes es una sola pantalla: si cuestan lo mismo, las medidas en la línea de nota y un precio; si no, una fila por medida con la medida en EB Garamond 28 px y los dos precios en Fraunces 40 px oro.

Verde profundo a sangre. Categoría en label oro, nombre en EB Garamond 56 px crema, regla ornamental, **dos precios del mismo tamaño**, bolívares y $ BCV, los dos en Fraunces 56 px oro (hasta 92 px en televisores de más de 1600 px), materiales en prosa 20 px separados por línea de oro al 45 %. Cada cuatro piezas, una frase de marca centrada en EB Garamond de hasta 76 px. Clave de ubicación ("V1 · BG") en la esquina superior derecha, Jost 20 px crema al 66 % (4,86:1): para la vendedora, no para la clienta. Controles que se esconden a los 4 s y barra de progreso de 3 px en oro.

### Catálogo PDF
Portada a página completa en verde profundo con el wordmark verde dentro de un recuadro crema, regla de oro con monograma, intro y materiales. Fichas en crema con fondo blanco, borde de 1 px, radio 12 px: foto cuadrada, SKU y existencia en Jost 10 px secundario, nombre en EB Garamond 16 px, material en oro de texto, bolívares y $ BCV en Fraunces 20 px los dos, ubicación en el mismo tono que la existencia. Con variantes, una ficha por producto: medidas del mismo precio en la nota; de precios distintos, una fila por medida con los dos precios en Fraunces 16 px. Pie "Lux by Emory · Desde Sabana de Mendoza para toda Venezuela".

### Costos: la cifra que manda
La única pantalla con una cifra protagonista de verdad: las piezas que hay que vender en el mes, en Fraunces 56 px (40 px en teléfono), con su unidad en label debajo y para qué alcanzan en EB Garamond 20 px. A su lado, en un panel, la mitad secundaria de la respuesta (las piezas para no perder). Debajo, una barra de avance del mes y una frase con el ritmo. La cuenta se enseña entera más abajo como cadena de pasos ("se vende en − mercancía − empaque = deja"), para que el número no se crea por fe.

### Tus datos (pedido del catálogo)
Empieza por la cédula, sola, con la pista "Si ya compraste con nosotros, no tienes que escribir nada más". Si ya es clienta, aparece un panel sin borde: "Ya compraste con nosotros" en label, su nombre enmascarado ("María G.") en Fraunces 28 px, "Te escribimos al número que termina en 67" y dos botones, "Sí, soy yo" y "Cambiar mis datos". Si no, una línea de bienvenida y los campos de siempre. El botón de apartar dice debajo qué falta mientras está apagado. Enmascarado a propósito: el catálogo lo abre cualquiera.

### Tabla de variantes (formulario del producto)
Una fila por variante con cuatro casillas: nombre, cantidad, costo en $ Binance y "Sale en". La primera fila es la pieza misma, sobre fondo de panel, con el costo "el de arriba" como texto y su cantidad atada a la de la tarjeta de existencias. El costo vacío muestra "igual: $4,2000" como marcador. "Sale en" da el precio en Fraunces 16 px y debajo los bolívares, el grupo y lo que deja, en Jost 12 px secundario; si ningún grupo alcanza, una línea en alerta de texto. Quitar es un botón de 44 px con una cruz; la fila quitada queda al 50 % con "Deshacer" y un aviso de que sale del catálogo al guardar. Una lista arriba dice de qué ubicación son las cantidades. En el teléfono la cabecera desaparece, cada casilla lleva su etiqueta, y la fila se acomoda en tres renglones: nombre y quitar; cantidad y costo; precio.

### Confirmar la tasa
La única acción que cambia todos los precios de un toque pide un segundo paso en la misma tarjeta, no en una ventana: un panel que dice cada tasa "antes → después" con cuánto sube o baja en oro de texto, y dos botones, "Sí, fijarla" y "Corregir". Un cero de más se ve antes de que cueste.

### Tu día (tablero de la vendedora)
La misma forma que la cifra de Costos, a la escala de ella: lo vendido hoy en Fraunces 56 px con "de 4" a 28 px en salvia de texto al lado, una barra de avance y una frase con lo que falta. Debajo, el mes con su barra y el ritmo. Lo de ella (premium, vendido hoy, ticket) en celdas de tablero, con bolívares y $ BCV del mismo tamaño en las de dinero. En el Mostrador, la meta es una sola línea bajo el título, en éxito cuando se cumple.

### Barra de guardar (Costos)
La barra flotante del carrito, reutilizada: aparece en cuanto cambia un campo, esté donde esté, con Descartar y Guardar. La página reserva su alto abajo mientras está a la vista.

### Indicador con comparación (Reportes)
Celda de tablero: etiqueta, valor y una línea que lo compara con el período anterior del mismo largo ("+12 % contra los 30 días anteriores"). El signo y las palabras cargan el mensaje; el color (éxito si sube, alerta de texto si baja) solo acompaña. Si la cifra lleva su moneda detrás, el valor baja a 28 px para caber en 160.

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
