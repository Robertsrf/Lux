# Fase 10 — La landing, el catálogo y el pedido de Lux, rehechos

Diseño del 24/11/2026. Fase 10 de `docs/fases/2026-11-revendedores/`.
Maquetas: https://claude.ai/artifact/Y9HXj71jv7A3ttnT1xAYNJ (la elegida es
**A · Editorial cálido**; B y C quedan como referencia descartada).

## Por qué

El dueño (19/11/2026): "landing con catálogos espectaculares, ya probados,
que se vean increíbles, con buenas animaciones, entendibles para cualquier
usuario, que parezca de este año y no del 2000". Para estas páginas se
ignoran `lux-ui`, `DESIGN.md`, `.impeccable/design.json` y toda regla visual
de Lux; **solo se conservan los colores de la marca y la tipografía**
(`estilos/tokens.css`; Fraunces, EB Garamond, Jost).

Éxito: una clienta que llega por el enlace de WhatsApp o el QR entiende en
la primera pantalla qué vende Lux, ve joyas grandes y bonitas, encuentra
lo que busca y aparta sin ayuda; y el dueño puede mandar una pieza sola por
WhatsApp.

## Decisiones del dueño (24/11/2026)

1. **Alcance: todo lo público de Lux.** La landing, el catálogo (estantes,
   lista, tarjetas, detalle, barra del pedido) y el pedido (Tu pedido con la
   cédula y apartar, y la página `Reserva` con el pago móvil y el aviso por
   WhatsApp).
2. **Los 19 tipos de sección se quedan como están** en la base y en el panel
   Landing: cambia cómo se ve cada uno. **Sin SQL.**
3. **Dirección A · Editorial cálido, tal cual**: fondo papel/crema, títulos
   grandes en Fraunces ligera (con cursiva para el énfasis), prosa en EB
   Garamond, botones píldora verde profundo, fotos grandes de la joya puesta
   a sangre, estantes que se deslizan de lado con tarjetas altas (4:5) y un
   "+" sobre la foto, una cinta de materiales que corre, cabecera mínima
   (buscar · LUX · pedido) y la barra del pedido flotante, píldora verde.
   Inspiración citada: Mejuri (mejuri.com) y Missoma (missoma.com), joyería
   de uso diario de este año; no se copia ninguna (ni textos ni fotos).
4. **La pieza tiene página propia con enlace**: `luxbyemory.com/?pieza=<id>`,
   con la foto grande que se desliza, sus medidas, "Agregar" y "Compártela por
   WhatsApp". Atrás vuelve al catálogo donde estaba.
5. **Camino: separar la lógica de lo que se dibuja**, como el catálogo del
   revendedor en la fase 6 (`useCatalogoRv`): la lógica de hoy de
   `Catalogo.tsx` pasa sin cambios a un cerebro (`useCatalogoLux`) y todo lo
   que se ve se escribe nuevo, con su propio CSS encerrado en lo público.

Ya decidido antes (archivo de la fase): el texto se mide a 4,5:1 siempre;
`prefers-reduced-motion` se respeta siempre; el panel Landing sigue
mandando qué sale y en qué orden.

## Objetivos

- Las páginas públicas de Lux en el estilo A, en teléfono (360–430 px,
  lo principal) y en escritorio (desde 900 px, dos columnas donde tenga
  sentido).
- Movimiento que se note y que pese poco: CSS y `IntersectionObserver`,
  sin librerías nuevas.
- Una página por pieza, compartible.
- Todo lo que hoy funciona sigue funcionando (lista abajo).

## Lo que no es

- **No toca la base.** Ningún `.sql`, ninguna vista ni función nueva. Lo que
  la página nueva necesite lo saca de lo que ya lee hoy (`v_disponible_publico`,
  `v_proximamente`, `v_landing`, `ofertas_publicas()`, `cotizar_pedido`,
  `crear_reserva`, `ver_reserva`, `reglas_pedido()`, `categorias_publicas`,
  `tramos_mayoreo`, `textos`).
- **No toca** el catálogo ni el panel del revendedor, la vitrina, el catálogo
  PDF, la guía para revendedores, ni ninguna pantalla con sesión (mostrador,
  Pedidos, administrativo). Tampoco el panel Landing (`/admin/landing`): sus
  pestañas viejas son un pendiente de la fase 9, no de esta.
- No cambia ninguna regla de dinero, de ofertas ni del pedido.

## Anti-objetivos (fallaría aunque "funcione")

- Que una cifra (total, tramo, oferta) diga algo distinto de lo que cobra la
  base, o que salga una cifra de costo, piso o margen.
- Que una pantalla de la tienda o del revendedor cambie de aspecto porque un
  componente compartido se restiló sin encerrar.
- Que la página pese y se arrastre en un Android de gama baja: animaciones
  de `transform` y `opacity` solamente, nada que repinte en cada fotograma.
- Texto sobre una foto que dependa de la foto para leerse.
- Un botón que lleve a un hueco (una sección de ofertas sin datos).

## Lo que tiene que seguir funcionando (lista de comprobación)

De `CLAUDE.md` ("La landing", "Las ofertas con código", "El catálogo se
entiende y dice dónde está la tienda", "Dama, caballero o unisex", "Los
dijes y las bases para armar", "El lote en camino"):

- Las secciones de `v_landing`, en su orden, con `seDibuja` para las de
  ofertas; sin el #65 (`secciones === null`), el inicio de siempre.
- La ruta: `?tipo=`, `?ver=todas`, `?para=`, `?paso=pedido`, y ahora
  `?pieza=`. Atrás del teléfono vuelve un paso.
- El buscador en el mismo sitio de la página en todas las vistas (que el
  teléfono no cierre el teclado al cambiar de vista).
- "Todas · Dama · Caballero" (`ElegirPara`, lo unisex en las dos).
- Estantes por tipo (hasta 1.000 filas de una vez), la lista con "Ver más" de
  a 120 y cuántas faltan, orden por tipo o por precio.
- La tarjeta: un `<article>` con botones hermanos, nunca un botón dentro de
  otro; tocar la foto abre la pieza; "+" agrega y pasa a contador.
- Variantes: una tarjeta por producto (`agruparPorFamilia`), la hoja de
  elegir medida (fichas con más de 8, cuadro de dos ejes), `etiquetasCortas`.
- Dijes: "Agrégale un dije" en las bases; `reserva_armados` en el pedido.
- Próximamente: al final, con foto y precio y sin botón de agregar.
- Las miradas (`useMiradas`): la página de la pieza abierta cuenta segundos;
  la pareja con `oferta_pareja_pct` una vez por visita; "Complétalo".
- Las ofertas: cintas, estuche, combos, regalo, selección, casa, escote,
  `VentanaOferta`, `TusCodigos`; los códigos viajan con el pedido.
- El total de la barra es el de `cotizar_pedido`; "te faltan N para el X %".
- Aviso tras la primera pieza ("toca «Ver mi pedido»").
- "Letra grande" en la cabecera del catálogo y del pedido (`useLetraGrande`).
- "La tienda" (`LaTienda`) con Cómo llegar, horario, WhatsApp, Instagram y
  Cómo pagar; la ayuda por WhatsApp en la portada.
- Tu pedido en tres partes numeradas, "Qué pasa al apartar" con las cifras de
  `reglas_pedido()`, la cédula primero (`TusDatos`), entrega en tienda o envío.
- `Reserva`: referencia "LX-…", "Avisar a la tienda por WhatsApp", pago
  móvil para copiar (`PagoMovil`), reportar un abono (`ReportarPago`).
- Las visitas (`registrarVisita`) y `esDeLaTienda()`.

## Cómo se construye

### El cerebro: `useCatalogoLux`

`src/paginas/publico/useCatalogoLux.ts` (o una carpeta `publico/catalogo/`
si crece). Recibe nada y devuelve todo lo que hoy calcula `Catalogo.tsx`:
la ruta (tipo, ver todas, para, paso, pieza) y sus setters, las consultas y
sus estados (modelos, total, cargando, error, cargarMas), conocidos, tramos,
selección y cotización, el resumen de la barra, categorías, estantes y
familias, próximos, pares y dijes, datos de la clienta y entrega, reservar,
las ofertas y los códigos, las miradas, la ventana y "Complétalo", textos y
reglas. **El código se mueve, no se reescribe**: mismas consultas, mismos
comentarios, mismos `useMemo` antes de cualquier `return`. Si al moverlo
aparece un error, se arregla aparte y se dice.

### Las caras

`Catalogo.tsx` queda como la ruta: llama al cerebro y elige qué dibujar
(inicio, lista, pieza, pedido). Componentes nuevos en
`src/paginas/publico/` (nombres de referencia; el constructor ajusta):

| Componente | Qué dibuja |
|---|---|
| `Cabecera` | Pegada arriba: buscar, LUX, Letra grande, el pedido con su número. Debajo, las puertas (Joyas, Ofertas, Lo que viene) cuando hay landing. El campo de búsqueda vive aquí, el mismo nodo en todas las vistas |
| `PortadaA` | La portada sin secciones (la de siempre) y el estilo de la sección `portada`: texto arriba, foto a sangre debajo con su indicador; en escritorio, dos columnas |
| `Estante` | Título, "Ver los N", fila que se desliza con `scroll-snap` |
| `TarjetaPieza` (pública, nueva) | Foto 4:5, "+" redondo de 44 px sobre la foto (contador cuando ya va), nombre en Garamond, precio Bs · $ BCV en Fraunces, cinta "Oferta" |
| `PaginaPieza` | `?pieza=`: fotos que se deslizan, nombre, precio, para quién, medidas (la hoja de elegir integrada), "Agregar", "Agrégale un dije", "Compártela por WhatsApp", "En tienda: V1 · BG", lo que combina |
| `BarraPedido` | Píldora verde flotante: "N joyas · total", "Ver mi pedido"; la línea del tramo |
| `PedidoA` | `?paso=pedido`: las tres partes numeradas en Fraunces, líneas con foto, total, `TusDatos`, entrega, "Qué pasa al apartar", Apartar |
| `ReservaA` | El rediseño de `Reserva.tsx` con la misma lógica |
| Las 19 secciones | Cada componente de `publico/landing/` se rehace en el estilo A (ver abajo) |

`TarjetaPieza` y el resto de `VitrinaPublica.tsx` hoy los comparten la
landing, la lista y Próximamente: la nueva tarjeta es pública y propia;
`VitrinaPublica.tsx` se queda para quien todavía la use (si nadie, se borra).

### La página de la pieza

- Ruta `?pieza=<id del modelo>` (se conservan `para` y lo demás de la ruta
  para volver al mismo sitio; sin `replace`, atrás cierra la pieza). Se
  muestra la familia del modelo, abierta en esa medida (como hoy el visor).
- Si la pieza está en `conocidos`, sale al instante; si no (enlace directo),
  se pide a `v_disponible_publico` por familia con las mismas columnas. Si
  no está a la venta, se busca en `v_proximamente` y sale como Próximamente
  (sin agregar). Si no está en ninguna: "Esta joya ya no está disponible" y
  el botón al catálogo.
- "Compártela por WhatsApp": `https://wa.me/?text=` con el nombre y el
  enlace de la pieza (sin precio: la tasa cambia). Lo arma `lib/enlaces.ts`
  y el enlace sale de `lib/direccion.ts` (ninguna dirección a mano). En el
  teléfono, `navigator.share` si existe, con el mismo texto.
- La tarjeta de vista previa de WhatsApp sigue siendo la de la tienda (no hay
  servidor que la cambie por pieza; el Worker solo actúa en los subdominios).
  Se deja anotado como posible mejora, no se hace.
- Las miradas cuentan mientras la página de la pieza está abierta, como hoy
  con el visor (`alAbrirPieza`/`alCerrarPieza`).
- El visor a pantalla completa (zoom de la foto) puede seguir saliendo al
  tocar la foto dentro de la página, con `VisorFoto` tal cual.

### El estilo: `estilos/publico.css`

- Todo bajo una clase raíz (`.pub`) que lleva el contenedor de las páginas
  públicas. `landing.css` se reemplaza; las clases viejas que también use una
  pantalla con sesión no se tocan.
- Los componentes compartidos con la tienda (`TusDatos`, `PagoMovil`,
  `ReportarPago`, `ElegirVariante`, `ArmarDije`, `LaTienda`, `ElegirPara`,
  `LetraGrande`, `VisorFoto`) se visten desde `.pub` sin cambiar su
  marcado; si uno necesita otro marcado, se hace una copia pública.
- Colores: solo la paleta de `tokens.css` (verde profundo, oro arena, crema,
  salvia y sus variantes legibles, papel, blanco, tinta). Contrastes que usa
  A, ya medidos: verde profundo sobre papel y crema por encima de 9:1; crema
  sobre verde profundo, igual; `--salvia-texto` 4,89 sobre crema;
  `--oro-texto` 4,68 sobre crema y 5,11 sobre papel; el oro de marca solo
  sobre el verde (5,38). El constructor mide cada par nuevo y lo anota en el
  CSS.
- Letras: Fraunces ligera (300) y cursiva para títulos y precios; EB Garamond
  para nombres de pieza y prosa; Jost para botones, etiquetas y la UI.
  Escala fluida con `clamp()`; "Letra grande" sube la base un paso como hoy.
- Formas: píldoras para botones (alto mínimo 48 px, 52 en los principales),
  fotos con esquina mínima (4 px), objetivos táctiles de 44 px o más.
- Nunca texto sobre una foto (la portada: texto arriba en el teléfono, al
  lado desde 900 px).

### El movimiento

Con `useAparecer` (ya existe) y CSS. Todo lo que se mueve se apaga con
`prefers-reduced-motion: reduce` (queda quieto y visible).

- La foto de la portada entra con un zoom lento (escala 1,06 → 1, ~1,2 s,
  `ease-out`); el slider pasa con un fundido cruzado y se para fuera de
  pantalla (ya lo hace).
- Títulos y bloques suben 16 px y aparecen al entrar en pantalla (~450 ms,
  escalonados 60 ms en las tarjetas de un estante).
- La cinta de materiales corre en bucle con `transform` (se para fuera de
  pantalla y con movimiento reducido).
- Agregar: el "+" se convierte en contador con un pequeño rebote y el número
  de la barra salta; la barra entra desde abajo la primera vez.
- Abrir una pieza: la foto de la tarjeta crece hacia la página de la pieza
  con View Transitions donde el navegador las tenga; donde no, un fundido.
- Estantes con `scroll-snap` y el desplazamiento natural del dedo, sin
  librerías.

### Las 19 secciones en el estilo A

| Tipo | Cómo se ve |
|---|---|
| portada | Como `PortadaA` (arriba) |
| cintas | La cinta verde que corre, con las ofertas del día |
| tipos | Rejilla de tres con foto 3:4 y nombre debajo; el primer cuadro "Todas las joyas" |
| estantes | Un `Estante` por tipo y la tarjeta "Todas las joyas" al final |
| como_pedir | "Así pides": números grandes en Fraunces oro, texto en Garamond, con las cifras de la base |
| proximamente | Estante con sello "Próximamente", sin "+" |
| tienda | Foto, dirección, horario, "Cómo llegar", WhatsApp, Instagram, "Cómo pagar" plegado |
| nosotros, buscamos | Foto grande y texto editorial (título Fraunces, Garamond) |
| materiales | La cinta de materiales o tres fotos con su material |
| galeria | Mosaico de fotos a sangre que se desliza |
| video | El video a sangre con su póster |
| redes | Instagram y WhatsApp como enlaces grandes |
| estuche, combos, regalo, seleccion, casa, escote | Bloque crema con foto, etiqueta en oro, título Fraunces con cursiva, el botón píldora; las piezas en tarjetas como las de un estante |

El constructor decide los detalles finos de cada sección mirando las maquetas
y lo que hoy dibuja cada componente; lo que no cambia es qué datos usa.

## Peso y comprobación

- Ninguna dependencia nueva. Las fotos de la landing ya van en dos anchos;
  las tarjetas usan la miniatura y la página de la pieza la foto grande.
- Antes de entregar: `npm run pruebas`, `npm run build`, y capturas en
  teléfono emulado (360 y 390 px) y escritorio con el banco de la fase 9
  (`.superpowers/sdd/2026-11-24-administrativo/banco/`: Vite con Supabase
  falso y Edge sin ventana por CDP). Que ninguna página se corra de lado.
- Pruebas unitarias para lo puro nuevo (el enlace de compartir una pieza,
  leer `?pieza=`).
- `npm run verificar` no hace falta: no se toca la base.
- Las pantallas de la tienda que usan componentes compartidos se miran en el
  banco antes y después (Mostrador, Pedidos, Clientes) para comprobar que no
  cambiaron.

## Lo que queda al constructor

- El reparto exacto de archivos y nombres.
- Los detalles finos de cada sección y del escritorio, con las maquetas de
  guía.
- Los tiempos exactos de cada animación, dentro de lo dicho.

## Llamadas mías (para que el dueño las revise)

- El "+" de la tarjeta lleva `aria-label` "Agregar <nombre>" y pasa a
  contador (− 1 +) cuando la pieza ya va en el pedido, como pide la regla de
  hoy ("Agregar" y contador), dentro de la estética de A.
- Compartir una pieza no lleva el precio (la tasa cambia; la página lo dice).
- La vista previa de WhatsApp de una pieza sigue siendo la de Lux.
- "Todas · Dama · Caballero" va en la cabecera, junto al buscador, y no
  junto a "Elige por tipo" como en la maqueta: la regla de hoy dice que va en
  el mismo sitio en la landing y en la lista.
- La lupa de la cabecera abre el campo de búsqueda ahí mismo (en la lista ya
  sale abierto); es el mismo nodo en todas las vistas, para que el teclado
  no se cierre.
- La guía para revendedores no entra en esta fase.
