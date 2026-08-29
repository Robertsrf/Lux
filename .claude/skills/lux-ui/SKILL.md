---
name: lux-ui
description: >-
  Sistema de diseño de interfaz de Lux by Emory — paleta, tipografía, componentes,
  densidad y reglas de contraste para el sistema de inventario y punto de venta.
  Úsala SIEMPRE que escribas o modifiques cualquier pantalla, componente, CSS,
  hoja de impresión o pieza visual del sistema de Lux: login, cuadrícula de venta,
  formularios de carga, tablas de inventario, tableros, catálogo PDF o catálogo
  público. Actívala aunque el usuario solo diga "haz la pantalla de X" o "ajusta
  este componente"; basta con que la tarea toque la interfaz de Lux.
---

# Lux by Emory — Interfaz

Este sistema tiene dos caras con necesidades opuestas. Diséñalas distinto.

- **Cara de mostrador (vendedora):** táctil, grande, rápida, una mano, teléfono de gama baja, luz de tienda. Prioriza el pulgar y el reconocimiento visual.
- **Cara de escritorio (admin):** densa, tabular, precisa. Prioriza comparar cifras.

No apliques la misma densidad a las dos.

---

## Norte estético

La brújula es **Rolex**: autoridad silenciosa. El lujo no se grita, se demuestra. Mucho aire, poco ruido, un solo elemento protagonista por pantalla. Nada de degradados, sombras dramáticas, emojis decorativos ni animaciones de relleno.

La joya es siempre la protagonista. La interfaz es el estuche, no la pieza.

---

## Paleta (única fuente de verdad)

```css
:root {
  --verde-profundo: #1F4045;  /* ancla: cabeceras, barras, fondos de autoridad */
  --oro-arena:      #D0AE8A;  /* acento precioso: se gasta con avaricia */
  --crema:          #EDE5D3;  /* papel: superficie de lectura */
  --salvia:         #7F9492;  /* apoyo: texto secundario, bordes, estados vacíos */
}
```

**Proporción objetivo: 60 % crema · 25 % verde profundo · 10 % salvia · 5 % oro.**

Si el oro ocupa más del 5 % de una pantalla, quítale oro a algo.

### Colores de sistema (los únicos añadidos permitidos)

Estados funcionales que la paleta no cubre. Manténlos apagados, nunca saturados:

```css
--exito:   #4A6B52;   /* venta registrada, cuadre correcto */
--alerta:  #A8763E;   /* existencia baja, descuadre menor */
--error:   #8C3A32;   /* descuadre, validación fallida */
--blanco:  #FFFFFF;   /* superficies de tarjeta sobre crema */
--tinta:   #14292C;   /* texto de máximo contraste sobre crema */
```

Ningún otro color. Si necesitas uno nuevo, no lo necesitas.

### Reglas de contraste

- Texto de cuerpo sobre crema → **verde profundo** o `--tinta`. Nunca oro.
- El oro **solo luce sobre verde profundo**. Oro sobre crema en texto pequeño es ilegible: prohibido.
- Verde profundo sobre crema para todo lo que se lea de corrido.
- Salvia solo para texto secundario, nunca para información crítica.
- Todo texto debe pasar contraste 4.5:1. La tienda tiene luz fuerte y el teléfono es de gama baja.

---

## Tipografía

Tres roles. La jerarquía carga la personalidad.

1. **Display serif de alto contraste** — la fuente de marca es **Bagind**. Para el logotipo, titulares y **cifras de precio**. Con restricción; nunca para párrafos.
   - Si Bagind no está incrustada, usa **Fraunces** como sustituto (`@fontsource/fraunces`).
2. **Serif de lectura** — **EB Garamond** para descripciones y cuerpo.
3. **Sans utilitaria** — **Jost** en MAYÚSCULAS con `letter-spacing: 0.12em` para etiquetas, encabezados de tabla, datos y botones.

```css
--fuente-display: 'Fraunces', 'Bagind', Georgia, serif;
--fuente-cuerpo:  'EB Garamond', Georgia, serif;
--fuente-util:    'Jost', system-ui, sans-serif;
```

**Escala:** 12 · 14 · 16 · 20 · 28 · 40 · 56 px. No inventes tamaños intermedios.

**Regla firme:** los precios siempre en display serif. Es lo que hace que una cifra se sienta de joyería y no de ferretería.

**Advertencia de peso:** las tres familias suman peso de carga en un teléfono lento. Carga **solo los pesos que uses** (Fraunces 600, EB Garamond 400/500, Jost 400/500) y usa `font-display: swap`.

---

## Logotipo y ornamento

- Wordmark **LUX** con la ligadura característica en la primera letra; debajo "By Emory" flanqueado por **dos líneas horizontales finas** — el ornamento firma de la casa.
- El monograma **"L"** funciona como sello: favicon, avatar, marca de agua del PDF, esquina del login.
- **Reutiliza las líneas finas como divisores** en toda la interfaz. Es el recurso ornamental oficial.

Prohibido: deformar, rotar, añadir sombras o degradados al logotipo, ponerlo sobre fondos cargados, o introducir colores fuera de la paleta.

---

## Densidad y objetivos táctiles

| | Mostrador | Escritorio admin |
|---|---|---|
| Objetivo táctil mínimo | **56 px** | 36 px |
| Texto base | 18 px | 15 px |
| Espaciado entre tarjetas | 12 px | 8 px |
| Foto en cuadrícula | 1 columna en móvil angosto, 2 en normal | 4–6 columnas |

La vendedora usa el pulgar con joyas en la otra mano. **Botones grandes, separados, sin nada crítico en la esquina superior.** Las acciones principales van abajo, al alcance del pulgar.

---

## Componentes clave

### Tarjeta de modelo (cuadrícula de venta)
Foto cuadrada arriba ocupando la mayor parte. Debajo: nombre en serif de cuerpo, precio en Bs en display serif, y existencia como etiqueta pequeña en Jost mayúsculas. Fondo blanco sobre crema, borde hairline salvia, radio de esquina **4 px máximo** — la marca es angular, no redondeada.

Estado de existencia baja (≤2): etiqueta en `--alerta`. Existencia cero: la tarjeta no aparece.

### Botón primario
Fondo verde profundo, texto crema, Jost mayúsculas con tracking. Sin radio grande, sin sombra. El oro se reserva para el borde fino de confirmación, no para el relleno.

### Tabla de inventario (admin)
Cabecera en Jost mayúsculas sobre verde profundo. Filas alternas crema y blanco. **Cifras alineadas a la derecha con tabular numerals** (`font-variant-numeric: tabular-nums`). Márgenes negativos en `--error`, positivos en `--tinta`.

### Estados vacíos y errores
Un estado vacío es una invitación a actuar, no un lamento: "Aún no hay modelos en Vitrina 1. Carga el primero." Los errores dicen qué pasó y cómo arreglarlo, sin disculparse y sin vaguedad: "La venta al mayor requiere 6 piezas o $30. Llevas 4 piezas y $18."

---

## Voz de la interfaz

Sentence case, verbos planos, sin relleno. Nombra las cosas como el usuario las reconoce, no como está construido el sistema: "Vitrina 1", no "ubicación tipo vitrina id 1".

Una acción conserva su nombre en todo el flujo: el botón que dice "Registrar venta" produce el aviso "Venta registrada".

Español de Venezuela, natural y directo. Nada de "¡Genial!" ni signos de exclamación decorativos.

---

## Hoja de impresión del catálogo PDF

El catálogo se genera con `@media print` y "Guardar como PDF" del navegador. Sin librerías.

- Fondo crema, texto verde profundo. Nada de verde profundo a página completa (gasta tinta y se ve mal impreso).
- Portada: monograma L, wordmark, fecha del catálogo, total de modelos disponibles.
- Cuadrícula de 3 columnas por página, cada ficha con foto, nombre, nota de variantes y precio en Bs y $.
- Pie de página con "Lux by Emory · Desde Sabana de Mendoza para toda Venezuela".
- `@page { margin: 14mm; }` y `break-inside: avoid` en cada ficha.

**Nunca coloques el logo de SGS ni reproduzcas certificados en piezas de la marca.** Los certificados del proveedor son documentos privados de respaldo, no material de marca.

---

## Piso de calidad (sin anunciarlo)

- Responsive real hasta 320 px de ancho.
- Foco de teclado visible en todo elemento interactivo.
- `prefers-reduced-motion` respetado.
- Todo texto legible bajo luz de tienda.
- Sin animaciones que no sirvan a una función. Una transición de 150 ms al tocar una tarjeta basta.

Antes de dar una pantalla por terminada, mírala y **quítale un elemento**.
