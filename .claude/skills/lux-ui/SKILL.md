---
name: lux-ui
description: >-
  Sistema de diseño de interfaz de Lux by Emory — paleta, tipografía, componentes,
  densidad y reglas de contraste para el sistema de inventario y punto de venta.
  Úsala SIEMPRE que escribas o modifiques cualquier pantalla, componente, CSS,
  hoja de impresión o pieza visual del sistema de Lux: login, cuadrícula de venta,
  formularios de carga, tablas de inventario, tableros, catálogo PDF o catálogo
  público. Actívala aunque el usuario solo diga "haz la pantalla de X" o "ajusta
  este componente"; basta con que la tarea toque la interfaz de Lux. Para trabajo
  visual de peso, complétala consultando la skill ui-ux-pro-max, como se explica
  dentro.
---

# Lux by Emory — Interfaz

Este sistema tiene dos caras con necesidades opuestas. Diséñalas distinto.

- **Cara de mostrador (vendedora):** táctil, grande, rápida, una mano, teléfono de gama baja, luz de tienda. Prioriza el pulgar y el reconocimiento visual.
- **Cara de escritorio (admin):** densa, tabular, precisa. Prioriza comparar cifras.

No apliques la misma densidad a las dos.

---

## Complementa esta skill con `ui-ux-pro-max`

Esta skill decide **qué es Lux**. No sabe todo sobre oficio de interfaz, así que
para cualquier trabajo visual de peso, consúltala junto con `ui-ux-pro-max`
(instalada en `~/.claude/skills/ui-ux-pro-max`):

```bash
python "$HOME/.claude/skills/ui-ux-pro-max/scripts/search.py" "<consulta>" --domain ux
python "$HOME/.claude/skills/ui-ux-pro-max/scripts/search.py" "<producto> <rubro>" --design-system
```

**Qué sí tomarle**, porque es donde aporta y esta skill no llega:

- Accesibilidad y objetivos táctiles por plataforma.
- Formularios: error junto al campo, `aria-describedby`, validación al salir.
- Estados de carga, confirmaciones de acciones destructivas, patrones de navegación.
- Su lista de verificación previa a entregar: iconos SVG y no emojis, `cursor: pointer`,
  transiciones de 150–300 ms, foco visible, contraste 4,5:1, `prefers-reduced-motion`,
  probar a 375 / 768 / 1024 / 1440 px.

**Qué NO tomarle nunca**, porque aquí ya está decidido:

- Su paleta. La de Lux son cuatro colores y están arriba.
- Sus pares tipográficos. Aquí son Fraunces, EB Garamond y Jost.
- Sus estilos de moda (*Liquid Glass*, glassmorphism, degradados). Prohibidos.

Cuando las dos se contradigan, **manda esta**. La otra recomienda; esta define la marca.
Para una pasada de pulido general también sirve `impeccable`, que aporta el criterio
de composición y las prohibiciones transversales (nada de tarjetas anidadas ni de
franjas laterales de color).

Así se hizo el rediseño de agosto de 2026, y de ahí salieron los tonos de texto
medidos, los iconos SVG y el error de formulario pegado a su campo.

---

## Norte estético

La brújula es **Rolex**: autoridad silenciosa. El lujo no se grita, se demuestra. Mucho aire, poco ruido, un solo elemento protagonista por pantalla. Nada de degradados, sombras dramáticas, emojis decorativos ni animaciones de relleno.

El estuche es **redondeado y cálido**, no una caja angular. La profundidad se consigue con elevación suave teñida de verde —nunca sombras grises ni dramáticas— y con capas de superficie, no con bordes duros.

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
- **La salvia no es un color de texto.** Da 2,56:1 sobre crema: sirve para líneas y bordes de control, no para leer. Para texto secundario existe `--salvia-texto` (#506664), la misma familia oscurecida hasta 4,89:1.
- Lo mismo con `--alerta`: como texto se usa `--alerta-texto` (#875C2D), 4,65:1.
- Todo texto debe pasar contraste 4.5:1, **medido, no estimado**. La tienda tiene luz fuerte y el teléfono es de gama baja.
- El borde de un control necesita 3:1 para verse. La salvia da 3,20 sobre blanco y por eso sí sirve ahí.

---

## Tipografía

Tres roles. La jerarquía carga la personalidad.

1. **Display serif de alto contraste** — la fuente de marca es **Bagind**. Para el logotipo, titulares y **cifras de precio**. Con restricción; nunca para párrafos.
   - Si Bagind no está incrustada, usa **Fraunces** como sustituto (`@fontsource/fraunces`).
2. **Serif de lectura** — **EB Garamond** para descripciones y cuerpo.
3. **Sans utilitaria** — **Jost**, y es la **fuente de trabajo de la interfaz**: cuerpo, etiquetas, encabezados de tabla, datos, formularios y botones. En MAYÚSCULAS con `letter-spacing: 0.12em` para etiquetas y botones.

   Un panel de administración es casi todo etiquetas y cifras. Aplicar la serif de lectura a toda la interfaz la envejece: EB Garamond se reserva para prosa de verdad —nombre de la pieza, descripciones, estados vacíos y el catálogo impreso—.

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

## Forma y elevación

La marca es **redondeada**. Una sola escala, sin inventar valores intermedios:

```css
--radio-xs:    6px;   /* anillos de foco, detalles */
--radio:      12px;   /* campos, contadores, píldoras pequeñas */
--radio-md:   16px;   /* paneles, monograma, teclado del PIN */
--radio-lg:   22px;   /* tarjetas, tablas, estados vacíos */
--radio-pill: 999px;  /* TODOS los botones, etiquetas y filtros */
```

**Los botones son píldoras.** Sin excepción: primario, secundario, peligro y los del mostrador.

La profundidad va en tres pasos y **siempre teñida de verde**, nunca gris:

```css
--sombra-1: reposo (tarjetas, campos, botones)
--sombra-2: hover
--sombra-3: elemento flotante (barra del carrito) y tarjeta levantada
```

Una tarjeta tocable sube 3 px al pasar por encima y vuelve al presionar. El movimiento dura 150–240 ms con salida exponencial: se siente vivo sin hacerse esperar.

## Densidad y objetivos táctiles

| | Mostrador | Escritorio admin |
|---|---|---|
| Objetivo táctil mínimo | **56 px** | 40 px |
| Texto base | 18 px | 15 px |
| Espaciado entre tarjetas | 20 px | 16 px |
| Foto en cuadrícula | 1 columna en móvil angosto, 2 en normal | 4–6 columnas |
| Navegación | Barra superior, solo iconos | Barra lateral de 244 px con nombres |

La vendedora usa el pulgar con joyas en la otra mano. **Botones grandes, separados, sin nada crítico en la esquina superior.** Las acciones principales van abajo, al alcance del pulgar.

---

## Componentes clave

### Tarjeta de modelo (cuadrícula de venta)
Foto cuadrada arriba ocupando la mayor parte. Debajo: nombre en serif de cuerpo, precio en Bs en display serif, y existencia como etiqueta pequeña en Jost mayúsculas. Fondo blanco sobre crema, borde suave, radio `--radio-lg` y elevación `--sombra-1`, que sube a `--sombra-3` al tocarla.

Estado de existencia baja (≤2): etiqueta en `--alerta`. Existencia cero: la tarjeta no aparece.

### Botones
**Todos son píldoras** (`--radio-pill`). Primario: fondo verde profundo, texto crema, Jost mayúsculas con tracking, `--sombra-1` en reposo. Al pasar por encima sube 1 px y gana `--sombra-2`; al presionar vuelve a su sitio. Secundario: fondo blanco, borde `--linea`, que al hover pasa a fondo `--verde-suave`.

El oro se reserva para el **borde de confirmación** (`.boton--confirmar`, borde de 2 px), nunca para el relleno — salvo sobre verde profundo, donde sí es relleno legítimo: la barra del carrito y el botón de entrar.

### Tabla de inventario (admin)
Cabecera en Jost mayúsculas sobre verde profundo, con las esquinas superiores redondeadas por `--radio-lg`. La fila se resalta al pasar por encima con `--verde-suave`; **no** se usan filas alternas, que compiten con el hover. **Cifras alineadas a la derecha con tabular numerals** (`font-variant-numeric: tabular-nums`). Márgenes negativos en `--error`, positivos en `--tinta`.

### Navegación
En escritorio, **barra lateral de 244 px** en verde profundo, con icono y nombre por sección. La activa lleva fondo apenas más claro y una barra de oro de 3 px por dentro del borde izquierdo. Caben las ocho secciones del admin sin apretarse.

En móvil la misma barra pasa arriba, se vuelve horizontal y deslizable, y **deja solo los iconos**: la pantalla del mostrador no puede perder alto. La marca de oro pasa al borde inferior.

### Filas de pestañas y filtros

**Un juego pequeño y fijo se envuelve; no se desliza a escondidas.** Los siete
momentos de la guía y las categorías del catálogo caben en dos líneas: que bajen
de línea. Deslizarlos escondía la mitad, y como la barra iba oculta
(`scrollbar-width: none`) nada avisaba de que hubiera más.

Lo reportó el dueño el 31/08/2026: «estos botones no tienen deslizador y no se
ven completos». Tenía razón — sí se deslizaban, pero eso no se veía, que para el
caso es lo mismo.

**La excepción es la navegación en móvil**, que sigue deslizándose: son doce
secciones y sólo iconos, y envolverla le robaría alto a la pantalla del
mostrador, que es lo único que ahí no sobra.

Regla corta: si el juego cabe en dos líneas, envuélvelo. Si no cabe, deslízalo
**pero deja ver la barra**.

### Iconos
Trazo de 1,5, esquinas redondeadas, `viewBox` de 24 y color heredado. Viven en `componentes/Iconos.tsx`.

**Nunca emojis.** Un emoji se dibuja distinto en cada teléfono, y aquí el Android de la tienda y la laptop del dueño tienen que verse igual. Los iconos siempre acompañan a un texto, así que van con `aria-hidden`.

### Superficies
Tres capas cálidas, de atrás hacia adelante: `--papel` (fondo), `--superficie` (tarjetas, blanco) y `--panel` (bloques de resumen dentro de una tarjeta). Un panel **no lleva borde propio**: se distingue por su fondo. Tarjeta dentro de tarjeta está prohibido.

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

**El catálogo es una pieza digital**, un PDF que se comparte por WhatsApp y se
mira en pantalla. Esa es la razón de las decisiones de abajo — y la razón por la
que el argumento del gasto de tinta **no aplica aquí**.

- **La portada va en verde profundo a página completa, a sangre.** Es lo que hace
  que el catálogo se sienta importante desde que se abre, como la portada de la
  Guía del Colaborador de la casa. Lleva el wordmark **verde sobre un recuadro
  crema**, no crema sobre verde: así el logotipo respira y se lee como un sello.
- **Las páginas de fichas sí van en crema con texto verde.** Ahí el verde a
  sangre estorba la lectura y hace competir el fondo con la foto de la pieza.
- Si algún día se imprime en papel de verdad, vuelve el argumento del gasto de
  tinta: entonces la portada se pasa a crema. Mientras sea digital, no.
- Portada: wordmark en su recuadro, regla de oro con el monograma, texto de marca,
  materiales, fecha y total de modelos disponibles.

**Al generar el PDF hay que marcar "Gráficos de fondo" en el cuadro de impresión.**
Sin eso el navegador descarta todos los fondos y la portada sale en blanco. La
pantalla se lo recuerda al usuario junto al botón.
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
