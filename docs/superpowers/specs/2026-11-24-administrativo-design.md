# Fase 9 — El administrativo, rehecho (diseño)

24/11/2026. Fase 9 de `docs/fases/2026-11-revendedores/`. Parte del informe
de la fase 8 (`docs/auditoria/2026-11-24-cuentas.md`, "Para la fase 9").

## Por qué

El dueño pidió rehacer "absolutamente todo, hasta el administrativo", después
de la auditoría: una forma clara de ver lo que entra, lo que sale, lo
invertido y lo que hay. Hoy entra en Inventario, el menú tiene 24 secciones
sueltas y ninguna pantalla junta lo que salió con lo que entró (informe,
punto 1). Las cuentas ya están bien (fase 8); lo que falla es que la
pantalla no dice qué es cada cifra.

## Lo que decidió el dueño (24/11/2026)

1. **Alcance: base común + el administrador a fondo.** Las piezas comunes
   (armazón, menú, botones, tarjetas, tablas, cuadros de cifras, campos,
   avisos) cambian para todos; las pantallas del administrador se rehacen
   una por una. Mostrador, Pedidos, Cierre, Conteo, Mi día, Guía y Código
   solo cambian de piel, y **la vendedora conserva su densidad táctil**
   (56 px, 18 px; `.mostrador`).
2. **Primera pantalla: un Inicio** con lo urgente arriba (cada cosa con su
   botón) y cómo va el mes debajo.
3. **El menú, por grupos.** Vender (Mostrador, Pedidos, Código, Cierre,
   Conteo) · Dinero (Flujo, Caja, Crédito, Reportes, Costos, Inversiones) ·
   Mercancía (Inventario, Lotes, Grupos, Tramos, Tasas) · Gente (Clientes,
   Vendedoras, Revendedores, Capacitación) · En línea (Landing, Textos,
   Catálogo, Vitrina). Inicio va solo, arriba.
4. **Inversiones se queda, con rótulos claros**: sigue para cargar muebles y
   ver la recuperación; cada cifra dice qué es y remite al Flujo para lo
   cobrado y lo pagado de verdad.
5. **Estilo B, "Estuche"** (maquetas:
   https://claude.ai/artifact/YMX6F8qUTcrmQ3CJUgsHxQ): el verde profundo
   arriba con la cifra que manda en grande, tarjetas blancas redondeadas
   debajo, la barra de abajo del teléfono en verde. Paleta y letras de Lux
   intactas (ya decidido en el archivo de la fase).
6. **Camino: piezas comunes + pantalla por pantalla.** La lógica y las
   cuentas no se tocan.

## Enfoques considerados

| | Qué | Por qué no / por qué sí |
|---|---|---|
| **A (elegido)** | Cambiar las piezas comunes de `base.css` en su sitio, dos pantallas nuevas (Inicio, Flujo) y un repaso de cada pantalla del dueño | Las pantallas comparten unas pocas clases (`pagina`, `encabezado-pagina`, `tarjeta`, `panel`, `tablero`, `tabla`, `boton`, `campo`, `dato`): cambiarlas viste todo de una vez, y la lógica probada no se toca |
| B | Una hoja `admin.css` aparte, bajo `.cara-admin`, y pasar pantallas una a una | Dos estilos durante semanas y el CSS duplicado; contradice "base común" |
| C | Reescribir cada pantalla con componentes nuevos | Lo más limpio a la vista, pero arriesga la lógica de dinero y permisos |

## Metas

- Que el dueño abra el sistema y sepa en un vistazo qué le toca hacer hoy y
  cómo va el mes.
- Una pantalla **Flujo**: salió, entró y queda, con $ Binance y $ BCV lado a
  lado (decisión de la fase 8) y los bolívares a mano.
- Que cada cifra diga qué es: plan o pagado, vendido o cobrado, a la tasa de
  hoy o a la de su día (informe, puntos 2 a 6).
- Un solo lenguaje visual en toda la cara con sesión de la tienda.

## No metas

- Cambiar una cuenta. Las cifras salen de las funciones y vistas de
  siempre; ninguna pantalla recalcula dinero (una cifra, un sitio).
- La landing, el catálogo público, el PDF, la vitrina y el revendedor
  (fase 10 y fases 6–7).
- Cambiar el flujo de trabajo de la vendedora.

## Anti-metas (lo que lo haría un fracaso aunque funcione)

- Que la vendedora vea un costo (regla 1): el Inicio y el Flujo son solo del
  administrador, en la base (`es_admin()`), no en React.
- Un texto bajo 4,5:1 (regla 5), medido.
- Que la venta diaria se rompa o se vuelva más lenta en el teléfono de la
  tienda: la barra del carrito del Mostrador, el cobro y la hoja de variantes
  siguen donde están y del mismo tamaño.
- Una cifra inventada (regla 4): sin dato, la tarjeta no sale.

## El estilo Estuche, en piezas

Paleta y tipografía de `tokens.css` sin cambios. La escala de tamaños es la
de siempre (12 · 14 · 16 · 20 · 28 · 40 · 56): las maquetas usan tamaños
intermedios, al construir se redondean a la escala (decisión mía).

- **Banda** (componente nuevo, `componentes/Banda.tsx`): fondo verde
  profundo, radio `--radio-lg` (en el teléfono, solo las esquinas de abajo
  cuando va pegada arriba), etiqueta en Jost 12 mayúsculas `--oro-arena`
  (5,38 sobre verde), cifra en Fraunces crema (40 en el teléfono, 56 en
  escritorio), detalle en Jost 14 crema, y hasta cuatro cuadritos con
  `rgba(crema, .10)` de fondo. Barra de progreso en oro sobre
  `rgba(crema, .22)`. **Una banda por pantalla como mucho**: es el
  protagonista. Una pantalla sin una cifra que mande no lleva banda.
- **Tarjeta**: blanca sobre papel, radio `--radio-lg`, `--sombra-1`, sin
  borde. Su título en Fraunces 20. Dentro, renglones con línea
  `--linea-suave` entre ellos; nada de tarjeta dentro de tarjeta.
- **Fila que lleva a algo** ("Para hoy"): tarjeta tocable de 64 px con el
  número en un cuadrito redondeado (`--verde-suave`; en rojo apagado si es
  un vencido, texto `--error`), dos renglones y "›". Es un enlace, no un div.
- **Tablas**: dentro de una tarjeta, cabecera en Jost 12 mayúsculas
  `--salvia-texto` sobre `--panel` (ya no verde: el verde queda para la
  banda y las barras, decisión mía), cifras a la derecha con `tabular-nums`,
  hover `--verde-suave`. En el teléfono siguen las fichas donde ya las hay.
- **Botones, campos y avisos**: los de siempre (píldoras, error junto al
  campo, aviso con fondo tenido), ajustados a las nuevas superficies.
- **Selector de período** (Flujo, Caja, Reportes): píldoras dentro de una
  píldora blanca, la elegida en verde con texto crema.

### El armazón

- **Escritorio**: barra lateral verde de 244 px con las secciones **por
  grupos**: el título de cada grupo en Jost 12 mayúsculas `--oro-arena`, la
  sección activa en píldora crema con texto verde (como la maqueta B).
  Verificación va al final, en un grupo "Sistema" (decisión mía: no estaba
  en la lista del dueño).
- **Teléfono**: la barra de abajo, en verde y redondeada, con margen de 12
  px a los lados; activa en oro, las demás en crema. Tres secciones y
  "Más". Las del administrador pasan a **Inicio, Mostrador y Pedidos**
  (Inventario a la hoja). La hoja "Más" lista todas, por los mismos grupos.
  La de la vendedora no cambia de secciones; sí de piel.
- Los objetivos táctiles no bajan: 52 px en la barra; la barra del carrito
  sigue flotando por encima.
- El aviso "Crédito · 2 vencidos" sigue igual.

## Las pantallas nuevas

### Inicio (`/admin`; el administrador entra aquí)

- **Banda**: "Noviembre, hasta hoy" · lo vendido en $ BCV · "Gastos del mes
  cubiertos" con su barra · cuadritos: piezas vendidas y "Si se vende todo".
  Lo vendido sale de `v_ventas_por_dia` (el mes, cortado en Venezuela); lo
  cubierto y las piezas de `v_cobertura_mes`, rotulado "con el plan de
  Costos"; "Si se vende todo" de `admin_flujo()`.
- **Para hoy**: solo lo que tiene algo, cada uno con su destino:
  ventas por verificar y abonos por revisar (Pedidos), pedidos del catálogo
  abiertos (Pedidos), pedidos de revendedores esperando aprobación
  (Pedidos), créditos vencidos con lo que falta (Crédito), conteos por
  revisar (Conteo). Sin nada: "Nada pendiente por ahora."
  Lotes en camino no entran: no piden nada hasta que llegan (decisión mía).
- Arriba, la tasa vigente (BCV y Binance), que ya leen otras pantallas.
- **De dónde salen**: una función nueva, `admin_inicio()` (#76), de
  definidor, con `if not es_admin() then raise`, que **cuenta** sobre las
  vistas y funciones de siempre (`v_ventas_por_verificar`,
  `v_abonos_detalle`, `v_pedido_vendedora`, `v_apartados_revendedor`,
  `v_credito`, `v_conteos`, `creditos_vencidos()`) y devuelve un json. Una
  llamada en vez de siete en el teléfono, y ninguna regla copiada: si una
  vista cambia lo que es "por verificar", el Inicio cambia con ella.

### Flujo (`/admin/flujo`)

- Selector de período: **el mes · el año · desde el principio**. "Queda" es
  siempre el de hoy y lo dice.
- **Banda**: "Si se vende todo, hoy" en $ BCV grande, y $ Binance y
  bolívares al lado.
- **Tres tarjetas, Salió · Entró · Queda** (en escritorio, en fila; en el
  teléfono, una debajo de otra). Cada una con su total en las tres monedas
  y sus renglones con **$ Binance y $ BCV lado a lado**; los bolívares de
  cada renglón, con "Ver en bolívares" (decisión mía: tres columnas no
  caben en 360 px).
- Lo que nombra el informe, dicho en la pantalla: "De eso, sin comprobar"
  bajo Entró; "Lo ya abonado de pedidos sin entregar" en negativo con su
  porqué en una línea; "Cada movimiento a la tasa de su día; lo que queda, a
  la de hoy"; y que **solo cuenta lo anotado en la Caja** (informe, punto 5).
- **Mercancía sin rastro**, con su detalle por lote al tocarla (informe,
  punto 6): función nueva `admin_sin_rastro_lotes()` (#76), en $ Binance
  (el lote nace en Binance): por lote, lo comprado, lo vendido a lo que
  costó, lo que hay en la tienda, lo que viene y la diferencia; más un
  renglón "sin lote" para las piezas sin lote. **La suma de los renglones es
  la `mercancia_sin_rastro` de `flujo_negocio` en $ Binance**: se prueba en
  PGlite. Para no tener dos reglas, la cuenta por lote vive en una función
  revocada (`sin_rastro_por_lote()`) y `flujo_negocio` no se reescribe; la
  prueba vigila que sumen lo mismo.
- Nada de esto se recalcula en el navegador: se pinta lo que devuelve
  `admin_flujo(desde, hasta)`.

## El repaso de cada pantalla del administrador

Todas: encabezado nuevo (título Fraunces 28 en el teléfono, 40 en
escritorio, y una línea que dice qué es), tarjetas y tablas nuevas. La
banda solo donde hay una cifra que manda:

| Pantalla | Banda | Lo del informe |
|---|---|---|
| Caja | Lo que entró y salió en el período | Al elegir "Mercancía" o "Transporte": "Los lotes se anotan en Lotes; anotarlo aquí lo cuenta dos veces en el Flujo" (punto 1) |
| Crédito | Lo que te deben y cuántos vencidos | — |
| Reportes | "El mes": lo cubierto, rotulado "con el plan de Costos" | El margen por categoría dice "sin lo de tienda"; el valor del inventario, "con reserva de merma" |
| Costos | La cifra que ya manda (lo de tienda por pieza) | Dice que es el plan, no lo pagado (punto 5) |
| Inversiones | El % recuperado | "Invertido, al dólar de hoy" (punto 2); "Mercancía vendida, a lo que costó" en vez de "recuperada" (punto 3); "Ganancia con el plan de gastos de este mes" (punto 4); enlace "Lo cobrado y pagado de verdad: Flujo" |
| Inventario | — | El margen dice "con lo de tienda" |
| Lotes, Lote en camino, Grupos, Tramos, Tasas, Formulario de pieza | — | — |
| Clientes, Vendedoras, Revendedores, Capacitación | — | — |
| Landing (y sus tres partes), Textos, Verificación | — | — |

Catálogo (el PDF) y Vitrina no se tocan: son para las clientas.

## Lo que sigue valiendo

- Regla 1 en Postgres: `admin_inicio` y `admin_sin_rastro_lotes` con
  `es_admin()`; `sin_rastro_por_lote` revocada a todos. `verificar` gana
  las comprobaciones: la vendedora recibe error en las dos `admin_*` y en la
  revocada.
- Primero el SQL (#76), después el navegador. Sin el #76, el Inicio enseña
  la banda sin "Para hoy" y dice que falta instalar; el Flujo, sin el
  detalle por lote. Nada se rompe.
- Cada "$" dice cuál es (`formatearBcv`, `formatearBinance`).
- Todos los `useMemo` antes del primer `return`; los archivos en CRLF.

## Cómo se comprueba

- PGlite con la instalación entera: `admin_inicio` cuenta lo mismo que las
  vistas; la suma por lote cuadra con `flujo_negocio`; la vendedora y `anon`
  rechazados.
- `npm run pruebas`, `npm run build`, `npm run verificar` (las nuevas).
- Contraste medido de cada par nuevo (oro y crema sobre verde, cifras sobre
  `rgba` de la banda, rojo apagado del cuadrito) con un guion.
- Capturas en Edge sin ventana a 360 y 1280 px de Inicio, Flujo, una
  pantalla de cada grupo, el Mostrador con su carrito y la hoja "Más"
  (emulando el ancho, ver Trampas).

## Documentos

DESIGN.md y `.impeccable/design.json` (el estilo Estuche, la banda, el
armazón por grupos), `.claude/skills/lux-ui/SKILL.md` (navegación, tablas,
las tres del administrador), CLAUDE.md (árbol: Inicio, Flujo, Banda;
funciones del #76), INSTALACION.md (#76), el README de las fases.

## Lo que queda a quien construye

El orden de las pantallas, los nombres de clases nuevas, los iconos de
Inicio y Flujo (de `Iconos.tsx`, o uno nuevo con el mismo trazo), y cuánto
de cada pantalla se reacomoda más allá de lo que da la base: lo mínimo para
que se lea como Estuche, sin tocar su lógica.
