# La landing de Lux y las ofertas con código (09/11/2026)

Pedido del dueño, el 09/11/2026:

> Que la dirección del catálogo, la que termina en `publico`, sea una landing
> page de Lux, con motion, sliders y fotografías: quiénes somos, qué buscamos,
> los materiales, nuestras redes para que nos sigan, el catálogo con su carrito
> y el método de compra. Fácil de seguir para que el consumidor no se pierda
> para comprar, ver el catálogo o lo que viene. Con un panel en la
> administración para poner y editar secciones. Fotos publicitarias de los
> proveedores (U7, E-Belle, Vnox) para dar ambiente, sin mencionarlos. Que el
> sistema analice al comprador: si mira dos artículos un tiempo sustancial, un
> pop-up le ofrece los dos con 5 %. Ofertas de varias piezas juntas, hasta
> 10 %, que varíen, con un código aleatorio que se pueda verificar en el
> sistema. Banners de "la selección" (lo que no se ha vendido, sin decirlo)
> con 5 %. Ofertas por todos lados, como al entrar en Shein.

Lo acordado en la conversación del mismo día:

- **Las imágenes de los proveedores se pueden usar**: la tienda les compra y
  tiene permiso. Se usan las que no traen logo, nombre de marca ni marca de
  agua; las que lo traen se descartan, no se editan.
- **Un solo mecanismo: el código.** Lo genera la base, nunca el navegador.
  Cada código dice qué piezas cubre y con qué porcentaje.
- **Se usa una vez.** Solo vale con TODAS las piezas del código. **No se suma**
  a otro descuento (con el tramo, manda el mayor). **Ningún código baja una
  pieza de su mínimo**: si una pieza no aguanta el descuento, no entra en esa
  oferta.
- **En la tienda:** la vendedora va a "Código", lo escribe, el sistema lo
  admite y le enseña las piezas del código para venderlas.
- **También en línea:** el pedido del catálogo lleva el código y congela el
  precio con el descuento.
- **El tono:** ofertas abundantes pero con la voz de la casa (cintas finas
  doradas, "Para ti", "Selección de la casa"), nunca rojo chillón ni
  "¡¡SOLO HOY!!". **Nada de urgencia falsa**: la única fecha que se enseña es
  el vencimiento real del código.
- El dueño aprobó también las formas de oferta que se propusieron:
  Complétalo, Abre tu estuche, ¿Qué escote usas?, Para regalar, Ofertas de la
  casa, el aviso del tramo en la barra y la cinta "Oferta".

Y las respuestas del dueño a las preguntas que dejó la revisión del diseño
(09/11/2026):

- **Si se quita o se devuelve una pieza de un código, las demás vuelven a su
  precio**: el código solo vale con todas sus piezas.
  - En un pedido sin entregar (`quitar_de_pedido`) o una venta por verificar
    (`quitar_de_venta`), las líneas que quedan de ese código vuelven al precio
    que tendrían sin él. Cada línea congela ese precio al apartar o vender
    (`precio_sin_oferta_usd`; en la venta, también en Bs). El total y lo que
    falta se recalculan, y la pantalla lo avisa antes de confirmar: "Las otras
    2 piezas del código LUX-7K2M9P vuelven a $X".
  - En una pieza ya entregada (`admin_devolver_pieza`), la nota de crédito
    devuelve la pieza por lo que se pagó, y resta lo que las demás piezas del
    código se ahorraron. Nunca devuelve menos de cero. La pantalla enseña la
    cuenta.
  - El código queda usado: no vuelve a estar libre.
- **Un código vale 3 días** desde que se emite (`oferta_dias_validez` = 3).
- **La selección: 90 días sin venderse** (`seleccion_dias_sin_venta` = 90).
- **Para regalar: hasta $15 BCV** con el descuento ya aplicado
  (`regalo_tope_usd` = 15).

## Para qué es

El catálogo ya vende (portada, tipos, estantes, "Cómo pedir", Próximamente,
"La tienda"). Le falta **atraer y retener**: contar quién es Lux, dar ambiente,
y darle a la clienta razones para comprar hoy y comprar más de una pieza. La
landing es la puerta de entrada que se manda por WhatsApp, Instagram y el QR de
la vitrina; ya está en `/#/publico`, y ese enlace no cambia.

## Metas

1. Que quien entra entienda en cinco segundos qué es Lux (joyería
   hipoalergénica que no se oscurece) y tenga tres puertas claras: **ver las
   joyas, ver las ofertas, ver lo que viene**.
2. Que compre más de una pieza: combos, complementos, el tramo a la vista.
3. Que vuelva: el estuche diario, las ofertas que cambian, las redes.
4. Que el dueño cambie la landing sin programar: secciones, fotos, textos,
   orden, y las cifras de las ofertas.
5. Que cada código se pueda verificar en la tienda y en Pedidos, y que el
   dueño vea cuánto se vende con ofertas.

## No metas

- El catálogo de los revendedores no lleva ofertas ni landing: sus precios son
  suyos. Comparte componentes con el de la tienda; nada de esto puede
  aparecerle.
- La vitrina del televisor y el catálogo PDF no cambian.
- No se nombra a ningún proveedor en la página, ni en el texto alternativo de
  las imágenes ni en el nombre de los archivos publicados.
- No hay cuentas de clienta ni correo: el código se guarda con una captura o
  queda en el pedido.

## Antimetas (sería un fracaso aunque funcione)

- Una página que tarda en un Android de gama baja con datos móviles. La
  primera imagen y el texto del inicio tienen que verse rápido; lo demás se
  carga al bajar.
- Una clienta que no encuentra cómo pedir, o que se pierde entre ofertas.
- Un código que alguien se fabrica desde la consola, o que baja una pieza de
  su mínimo, o un descuento que se suma a otro.
- Un número de costo que se escapa al público, a la vendedora o al panel de
  ofertas (ver "Seguridad").
- Una cifra de negocio inventada (regla 4): los porcentajes y plazos viven en
  `configuracion` y se cambian en el panel.
- Texto ilegible sobre una foto (regla 5: 4,5:1 medido).

---

## La página (`/#/publico`)

`Catalogo.tsx` se queda con todo lo que ya hace (la lista por tipo, `?ver=todas`,
la búsqueda, el orden, el carrito, "Tu pedido", el armado de dijes, "Letra
grande"). Lo que cambia es **el inicio**: deja de estar escrito a mano y pasa a
ser **la landing, armada con las secciones del panel, en el orden del panel**.
Los componentes nuevos van en `src/paginas/publico/landing/` y sus estilos en
`src/estilos/landing.css`.

### La navegación que no deja perderse

- **Cabecera fija y delgada:** la marca (vuelve al inicio), el buscador de
  siempre, "Letra grande" y el pedido con su contador.
- **Debajo, tres puertas que siempre están**, como pestañas grandes:
  **Joyas** · **Ofertas** · **Lo que viene**. "Joyas" lleva a "Todas las joyas"
  y los tipos; "Ofertas" baja a las ofertas; "Lo que viene" baja a
  Próximamente. En el teléfono caben las tres en una fila (texto de 16 px
  mínimo, 48 px de alto).
- La barra del pedido de siempre, abajo, cuando hay piezas, con el aviso del
  tramo (ver "Ofertas").
- Cada sección termina con **un solo** botón que dice a dónde lleva ("Ver los
  collares", "Ver mis ofertas"), nunca dos llamadas que compitan.

### Las secciones

Cada una es un **tipo** con su componente. El panel decide cuáles salen, en qué
orden y con qué textos y fotos. Las que se alimentan de la base (piezas,
ofertas, Próximamente) toman sus piezas solas; el panel solo cambia su título,
su texto y si salen.

| Tipo | Qué es | De dónde salen las piezas |
|---|---|---|
| `portada` | **Slider** de pantalla casi completa: foto de ambiente, una frase, un botón. Pasa solo, se puede deslizar con el dedo y tiene puntos. La primera diapositiva dice qué es Lux | Panel (fotos y textos) |
| `cintas` | Una franja estrecha que pasa despacio con las ofertas del momento ("Llévate dos con 5 %", "Selección de la casa") | Ofertas activas |
| `estuche` | **Abre tu estuche**: un estuche animado que se toca y descubre la oferta del día | Ofertas |
| `tipos` | Los tipos con foto y "Todas las joyas" (lo de hoy) | Base |
| `combos` | **Combos de la semana**: tarjetas con dos a cuatro piezas, el precio de cada una, el total con el descuento y "Lo quiero" | Ofertas |
| `seleccion` | **Selección de la casa**: banner con foto y un estante de piezas con su 5 % | Ofertas |
| `estantes` | Un estante por tipo (lo de hoy) | Base |
| `escote` | **¿Qué escote usas?**: elige su escote (con los dibujos de `SiluetaEscote`) y ve lo que le va, con un código por el conjunto | Base + `lib/escotes.ts` |
| `regalo` | **Para regalar**: conjuntos que no pasan de un precio, con código | Ofertas |
| `casa` | **Ofertas de la casa**: las que crea el dueño, con su banner | Panel |
| `nosotros` | Quiénes somos: foto + texto | Panel |
| `buscamos` | Qué buscamos (lo que la marca quiere para la clienta) | Panel |
| `materiales` | Acero 316L, titanio, baño de oro 18K PVD, certificación SGS: tres o cuatro tarjetas con foto e icono, y lo que significa para la piel | Panel (el texto de partida sale del cerebro de marca y de `materiales_largo`) |
| `galeria` | Fotos de ambiente en un carrusel horizontal o mosaico | Panel |
| `video` | Un video corto en bucle, sin sonido, con su póster | Panel |
| `como_pedir` | Lo de hoy, con las cifras de `reglas_pedido()` y los tramos | Base |
| `proximamente` | Lo de hoy, como estante | Base |
| `redes` | Instagram, TikTok, Facebook y WhatsApp, con un botón cada uno y una frase para que la sigan | `textos` |
| `tienda` | "La tienda" de hoy (`LaTienda`) | `textos` |

El orden de partida (el que siembra el SQL; el dueño lo cambia):
portada · cintas · tipos · estuche · combos · nosotros · seleccion · estantes ·
escote · materiales · regalo · galeria · como_pedir · proximamente · video ·
buscamos · redes · tienda. **Mi decisión**: primero lo que vende y entretiene,
la historia en medio, para que una clienta con prisa compre sin bajar mucho.

### El movimiento

- **Sin librería nueva.** CSS (transiciones, `@keyframes`, `scroll-snap` para
  los sliders) y un gancho pequeño con `IntersectionObserver` que pone una clase
  cuando la sección entra en pantalla. Cada sección entra una vez, sin repetir
  al subir y bajar.
- Solo `transform` y `opacity` (lo que el teléfono anima sin trabajar de más).
  Nada de `blur` animado.
- El slider de la portada pasa solo cada pocos segundos, **se detiene al
  tocarlo** y no pasa mientras no se ve. Fundido suave entre fotos con un
  acercamiento lento (Ken Burns).
- El estuche se abre con su tapa (giro 3D) y la oferta sube con un destello
  dorado; la filigrana de `Filigrana` se dibuja alrededor.
- Con `prefers-reduced-motion`, todo aparece sin moverse y el slider no pasa
  solo.

### Las fotos

- Las fotos de ambiente de partida (de los proveedores, sin marca) las busca y
  descarga un agente de sus sitios (09/11/2026), mirando una por una y
  descartando las que traen logo, nombre o marca de agua. Se convierten a WebP con `sharp` en dos tamaños (unos 1600 y 800 px de ancho) y
  van en `public/landing/`, con nombres que no dicen de dónde vienen. Se sirven
  desde el mismo sitio (`'self'`), así que la política de seguridad no cambia
  para ellas.
- Las que sube el dueño desde el panel van al almacenamiento de fotos de
  siempre (`lib/fotos.ts`, mismo bucket, carpeta `landing/`), con la misma
  compresión.
- Toda foto con texto encima lleva un velo de verde profundo debajo del texto,
  medido para que el texto dé 4,5:1 en el peor punto de la foto.
- `loading="lazy"` en todo menos la primera diapositiva, que se precarga.

### Los videos

- Se aceptan videos cortos (mp4, sin sonido, en bucle) que suba el dueño, con
  su póster. Se reproducen solo mientras se ven, y no se cargan con
  "ahorro de datos" (`navigator.connection.saveData`).
- La política de seguridad gana `media-src 'self' <origen de Supabase>`.
- **No se incrustan videos de YouTube ni de otros sitios**: enseñan el canal
  del proveedor y pedirían abrir la política de seguridad a otro origen.

---

## Las ofertas

### Un código

`LUX-` seguido de seis caracteres de un alfabeto sin confusiones (sin 0/O,
1/I/L), sacados de `gen_random_bytes` en la base. Único. Ejemplo: `LUX-7K2M9P`.
No se puede adivinar uno válido en la práctica, y aunque se adivinara solo
daría el descuento de unas piezas concretas.

Cada código guarda:

- qué piezas (modelo y cuántas; casi siempre una de cada una),
- el porcentaje,
- de qué oferta salió (`origen`: `dos_vistas`, `complemento`, `escote`,
  `combo`, `estuche`, `regalo`, `seleccion`, `casa`),
- cuándo vence,
- en qué está: emitido, usado (con el pedido o la venta) o vencido,
- el visitante anónimo que lo pidió (el número al azar que ya guarda el
  navegador para las visitas), para el tope diario.

**Se usa una vez.** Cuando un pedido del catálogo o un apartado del mostrador
(`apartar_en_tienda`, que también gana `p_codigos` al final) lo usa, queda
tomado por ese pedido; si el pedido se cancela o vence sin entregarse y el
código no ha vencido, vuelve a estar libre. Cuando lo usa una venta del
mostrador, queda usado. Una venta anulada lo devuelve con la misma regla.

**Un código emitido se respeta hasta que vence** (mi decisión: la clienta
guardó su captura y la tienda cumple). Apagar las ofertas de la landing,
terminar antes una oferta de la casa, rearmar los combos o sacar una pieza de
la selección deja de ENSEÑAR la oferta y de emitir códigos nuevos, pero no
toca los ya emitidos. Para un error de precio o un abuso, el panel tiene
**"Anular"** en cada código y **"Anular los códigos de esta oferta"** en cada
oferta de la casa y en cada combo: anulado no vale en ningún sitio, y la
pantalla "Código" dice "Este código fue anulado por la tienda".

### Las formas de ganarlo

Dos clases, con reglas distintas, porque en una la clienta elige las piezas y
en la otra las elige la base:

**Las piezas las elige la clienta** (cualquier pareja o trío de piezas que ella
quiera), con el porcentaje de `oferta_pareja_pct` (5 %, lo dijo el dueño) y de
2 a 4 piezas:

1. **Las dos que miraste** (`dos_vistas`). El navegador cuenta el tiempo que
   el detalle de cada pieza está abierto (sumando las veces que lo abre).
   Cuando dos piezas pasan cada una de `oferta_mirada_segundos`, sale una
   ventana: las dos fotos, "Llévate las dos con 5 %", el precio de cada una y
   el total. "Las quiero" pide el código y mete las dos al pedido; "Ahora no"
   la cierra. Sale una vez por pareja y como mucho una vez cada visita.
2. **Complétalo** (`complemento`). Al agregar una pieza, una hoja pequeña
   enseña la que combina con ella (con `lib/combinar.ts`: otra parte del
   cuerpo, el mismo tono si el nombre lo dice): "Complétalo: las dos con 5 %".
   Sale para las primeras dos piezas que agrega en la visita, no cada vez.
3. **¿Qué escote usas?** (`escote`). Elige su escote; la sección le enseña el
   collar y los aretes que le van (`lib/escotes.ts`, la misma regla de la
   vitrina) y "Llévate el conjunto con 5 %".

Como cualquiera puede pedir desde la consola un código de este tipo para
cualquier pareja, **esta clase equivale a una promoción pública de "dos o más
piezas, 5 %"**: el porcentaje lo pone la base, no el navegador, y nunca pasa de
`oferta_pareja_pct`. Es lo que el dueño aceptó.

**Las piezas las elige la base** (hasta `oferta_max_pct`, 10 %):

4. **Combos de la semana** (`combo`). Combos de 2 a 4 piezas que combinan, de
   lo que hay libre, con un porcentaje entre `oferta_min_pct` (5 %) y
   `oferta_max_pct` (10 %): más piezas, más porcentaje. **Varían**: se rearman
   cada semana, así todas las clientas ven los mismos esa semana y el código se
   emite sin que el navegador diga el porcentaje.
   **Quién los arma (mi decisión):** "qué combina con qué" vive en
   `lib/combinar.ts` y no se copia a SQL (una fórmula copiada deriva). El
   navegador del administrador los arma con `armarConjunto` y los manda a
   `admin_rearmar_combos(p_combos)`; la base comprueba cada pieza (activa,
   libre, con precio, aguanta el piso) y pone el porcentaje por número de
   piezas. Se rearman al tocar "Rearmar" y, solos, cuando el administrador abre
   el panel de la landing o el Inventario y los de ahora tienen más de siete
   días. Entre rearmados, un combo al que se le vendió una pieza deja de
   enseñarse.
5. **Abre tu estuche** (`estuche`). Una vez al día por teléfono (lo guarda el
   navegador; si lo borra, puede abrir otro, y no importa: son las mismas
   ofertas de la base). Al abrirlo, la base elige al azar uno de los combos de
   la semana o una pieza de la selección, y emite el código.
6. **Para regalar** (`regalo`). Combos de la semana cuyo total con descuento no
   pasa de `regalo_tope_usd` (lo fija el dueño). Sin cifra, la sección no
   sale.
7. **Selección de la casa** (`seleccion`). Piezas con existencia libre que no
   se han vendido en `seleccion_dias_sin_venta` días (contados desde la última
   venta, o desde que llegaron si nunca se vendieron), con
   `seleccion_pct` (5 %). El dueño puede además **sacar** una pieza de la
   selección o **meter** una a mano. La página nunca dice por qué están ahí.
   Cada tarjeta lleva "Pídela con 5 %", que emite un código de esa pieza.
8. **Ofertas de la casa** (`casa`). Las crea el dueño en el panel: nombre,
   texto, foto del banner, piezas, porcentaje (sin tope, pero siempre con el
   piso) y fechas de inicio y fin. Fuera de sus fechas no salen. "Lo quiero"
   emite un código.

En todas: **una pieza entra en una oferta solo si su etiqueta con el
descuento no baja de `piso_margen_de`**. Así el precio de oferta es siempre la
etiqueta menos el porcentaje, nunca el piso, y la oferta no enseña el piso de
nadie. Una pieza sin existencia libre, de un lote en camino, un dije sin base
en el combo, o una pieza sin precio, tampoco entra.

### En el carrito y el pedido en línea

- El código que gana la clienta **entra solo a su pedido** con sus piezas; no
  hay que escribirlo. Debajo del pedido, "Tus códigos": cada uno con sus
  piezas, el porcentaje, el vencimiento y un botón para quitarlo.
- Además, la ventana del código enseña el código grande, "Guárdalo con una
  captura: sirve también en la tienda" y el vencimiento.
- Puede tener **varios códigos** en un pedido si no comparten piezas.
- Si quita una pieza de un código, el pedido dice "Este código ya no aplica:
  necesita las N piezas" y no lo usa.
- **El total de la barra sale de `cotizar_pedido` con los códigos**, como hoy:
  lo que la barra dice es lo que el pedido congela.
- **El aviso del tramo** en la barra: "Te faltan 2 joyas para 5 % en todo el
  pedido", con los tramos reales. No cuenta dijes, como el tramo.
- **La cinta "Oferta"** en cada tarjeta de una pieza que está en un combo, la
  selección o una oferta de la casa.

### En la tienda: la pantalla "Código"

Nueva, de las dos caras: `/venta/codigo`, en el menú (en el teléfono, dentro
de "Más"; en el Mostrador, también un botón "Tengo un código").

1. La vendedora escribe el código (acepta minúsculas, sin el guion o con
   espacios).
2. La base dice si sirve: **"Sirve"** con las piezas (foto, nombre, dónde hay
   libres, precio de etiqueta y de oferta en Bs y $ BCV), el porcentaje y
   cuándo vence; o por qué no: **ya se usó** (cuándo y en qué venta o pedido),
   **venció**, **no existe**, o **una pieza ya no está** (se vendió o se
   retiró).
3. **"Pasar al cobro"** lleva las piezas al carrito del Mostrador con el código
   puesto. El cobro sigue como siempre (cliente, forma de pago, por verificar).
   El carrito enseña el precio de oferta en esas líneas; si la vendedora quita
   una pieza del código, el código se cae y se lo dice.
4. `registrar_venta` gana `p_codigos text[] default null` al final (regla 3).
   Con el código, en sus líneas manda el mayor entre el tramo y la oferta, y se
   ignora el precio a mano (como con el tramo). La línea guarda
   `motivo_rebaja = 'oferta'`.

### En Pedidos y en Reportes

- Pedidos dice el código y su porcentaje en cada pedido o venta que lo usó.
- Reportes gana "Ventas con oferta": cuántas, cuánto se vendió y cuánto se
  rebajó, por origen, en el mes. `v_rebajas` cuenta las de motivo `oferta`.

---

## El panel: Administración → "Landing"

Nueva pantalla del administrador, `/admin/landing`, con tres pestañas:

### Secciones

- La lista de secciones en su orden, cada una con su tipo, su título, si sale
  (interruptor) y "Subir" / "Bajar".
- Al tocar una, su formulario: título, texto, foto (subir o elegir de las de
  partida), botón (texto y a dónde lleva: Todas las joyas, un tipo, Ofertas,
  Lo que viene, WhatsApp). La portada y la galería tienen **una lista de
  diapositivas** (foto, frase, texto corto, botón) que se agregan, se ordenan y
  se quitan. El video: archivo y póster.
- "Agregar sección": elegir un tipo de la tabla de arriba. Las que ya existen
  (las de la base) solo se pueden esconder, no duplicar.
- "Ver la landing" abre `/#/publico` en otra pestaña.
- Cada foto que se sube enseña cómo se verá con su velo.

### Ofertas

- Las cifras, cada una con lo que hace y qué pasa si se deja vacía:
  `oferta_pareja_pct`, `oferta_min_pct`, `oferta_max_pct`, `seleccion_pct`,
  `seleccion_dias_sin_venta`, `oferta_mirada_segundos`, `oferta_dias_validez`,
  `regalo_tope_usd`, `oferta_codigos_dia_max` (tope técnico de códigos por
  teléfono y día). **Sin una cifra, la oferta que depende de ella no sale**, y
  el panel lo dice.
  Valores con los que se siembran: 5, 5, 10, 5, 90, 20, 3, 15 y 10. Los
  porcentajes, los 90 días, los 3 días y los $15 los dijo el dueño. Los **20
  segundos** de mirada y el tope de **10 códigos** por teléfono y día son mi
  decisión, porque no son dinero ni plazos de la clienta, y se cambian aquí.
- Ofertas de la casa: crear, editar, terminar antes de tiempo.
- La selección: qué piezas entran hoy, con "Sacar" y "Meter una pieza".
- Combos de la semana: cuáles son, con "Rearmar".
- Un interruptor general: **"Ofertas en la landing"**, para apagarlas todas de
  una vez sin tocar nada más.

### Resultados

- Códigos emitidos, usados y vencidos en el mes, por origen; cuánto se vendió
  con ellos y cuánto se rebajó.
- La lista de códigos con su estado, para buscar uno.
- **Lo más mirado**: las piezas que más tiempo se miran en el catálogo, y
  cuántas se vendieron. (La clienta no se identifica: es la suma de todos.)

---

## La base: `esquema-landing-y-ofertas.sql` (#65)

Depende del #64. Lo de abajo es el contrato que usan la página, el panel y el
Mostrador; los nombres internos los decide quien lo construye.

### Tablas

| Tabla | Para qué | Permisos |
|---|---|---|
| `landing_secciones` | id, `tipo`, `orden`, `visible`, `titulo`, `texto`, `datos jsonb` (diapositivas, foto, botón, video), `actualizado_en` | Revocada a todos; se lee por `v_landing` y se escribe por funciones `admin_*` |
| `ofertas_casa` | Las del dueño: nombre, texto, foto, porcentaje, desde, hasta, activa | Revocada; por funciones |
| `oferta_casa_items` | Sus piezas | Revocada |
| `seleccion_manual` | Piezas que el dueño metió o sacó de la selección | Revocada |
| `combos_semana` | Los combos armados de la semana: semana, piezas, porcentaje | Revocada; los lee `ofertas_publicas()` |
| `ofertas_codigos` | El código, origen, porcentaje, vence, estado, visitante, `reserva_id`, `venta_id`, cuándo se usó | Revocada a todos; se escribe por `emitir_oferta` y se lee por `ver_oferta` y `v_ofertas` |
| `ofertas_codigo_items` | Las piezas de cada código | Revocada |
| `catalogo_miradas` | Por día y pieza: cuántas veces se abrió el detalle y los segundos sumados | Revocada; se escribe por `registrar_miradas` |

Claves nuevas de `configuracion` (las cifras de arriba) y de `textos`
(`tiktok_tienda`, `facebook_tienda`, vacías).

### Funciones

Sin sesión (el catálogo público):

- `v_landing` (vista): las secciones visibles en su orden. Ninguna columna de
  dinero.
- `ofertas_publicas()`: las ofertas activas que la página enseña: combos de la
  semana, para regalar, selección, ofertas de la casa, y las cifras públicas
  (`oferta_pareja_pct`, `oferta_mirada_segundos`, si las ofertas están
  encendidas). Por pieza: id, porcentaje y precio de oferta en $ BCV. **Nunca
  el piso, el costo ni el margen** (`verificar` lo vigila).
- `emitir_oferta(p_origen text, p_modelos bigint[], p_ref bigint, p_visitante
  text)`: devuelve el código, sus piezas, el porcentaje y el vencimiento.
  - `dos_vistas`, `complemento`, `escote`: las piezas las dice el navegador (2
    a 4, distintas); el porcentaje es `oferta_pareja_pct`.
  - `combo`, `regalo`, `casa`: `p_ref` es el combo o la oferta; las piezas y el
    porcentaje los pone la base.
  - `seleccion`: una pieza de la selección de hoy.
  - `estuche`: la base elige al azar.
  - Comprueba cada pieza (activa, con precio, libre, aguanta el piso). Tope de
    `oferta_codigos_dia_max` por visitante y día; si el mismo visitante pide la
    misma oferta otra vez, le devuelve el código que ya tiene en vez de otro.
- `registrar_miradas(p_visitante text, p_miradas jsonb)`: suma segundos por
  pieza; con sesión no cuenta (como `registrar_visita`). Topes técnicos por
  llamada.
- `cotizar_pedido(p_items, p_codigos text[] default null)` y
  `crear_reserva(..., p_codigos text[] default null)`: aplican los códigos
  válidos.

Con sesión de la tienda (`es_personal()`):

- `ver_oferta(p_codigo text)`: el estado del código y sus piezas con su
  existencia libre por ubicación y los dos precios.
- `registrar_venta(..., p_codigos text[] default null)`.

Solo administrador: `admin_guardar_seccion`, `admin_ordenar_secciones`,
`admin_borrar_seccion`, `admin_guardar_oferta_casa`, `admin_seleccion`,
`admin_rearmar_combos`, y las vistas `v_ofertas` (los códigos) y
`v_miradas` (lo más mirado), con `where es_admin()` o `having es_admin()` según
toque.

### La regla del precio con código: un sitio

Una función revocada, `oferta_de_lineas(p_items, p_codigos)`, decide qué
código vale para qué línea (todas las piezas del código presentes, cada pieza
en un solo código, el código emitido y sin vencer) y devuelve el porcentaje de
oferta por modelo y cuántas unidades cubre. La llaman `cotizar_pedido`,
`crear_reserva` y `registrar_venta`, como `tramo_de_carrito`. En cada línea
cubierta, `precio_de_linea` recibe el mayor entre el tramo y la oferta, y el
motivo es `oferta` si ganó la oferta. Si una línea pide más unidades de las
que cubre el código, se parte: las cubiertas con oferta y las demás como
siempre. `venta_items_motivo_rebaja_check` acepta `oferta`.

El navegador repite la cuenta solo para enseñarla (en `lib/dinero.ts`), y el
total que manda es el de `cotizar_pedido`.

### Seguridad

- Las tablas nuevas, revocadas a `anon` y `authenticated`; todo por funciones
  de definidor o vistas.
- `emitir_oferta` y `ofertas_publicas` no devuelven ninguna columna de costo,
  piso ni margen. `verificar` comprueba sus claves, como con `cotizar_pedido`.
- Sabido y aceptado: que una pieza aparezca en un combo del 10 % dice que su
  piso queda por debajo del 90 % de su etiqueta. Es un dato pequeño y la
  vendedora ya ve mínimos más finos.
- El precio de oferta se cuenta en la base al emitir y otra vez al usar: si el
  costo subió entretanto, manda el piso.

---

## Lo que se cambia en la documentación

`CLAUDE.md` (árbol, tablas, vistas, funciones, reglas de las ofertas y de la
landing), `INSTALACION.md` (#65), `DESIGN.md` y `.impeccable/design.json` (la
landing, el estuche, las cintas, la ventana de oferta), `PRODUCT.md` (la
landing y las ofertas), `scripts/verificar.mjs` y la pantalla Verificación.

## Lo que queda abierto

- **Los revendedores.** Su clienta paga como mínimo la etiqueta + $0,10 para
  que el revendedor no le haga la competencia a la tienda. Con los códigos de
  dos piezas al 5 %, que puede sacar cualquiera, ahora la tienda queda por
  debajo de él. No se cambia nada mientras el dueño no lo pida.

## Lo que se deja a quien construye

- Los nombres internos, la forma de los `jsonb` de `datos`, el reparto de los
  componentes.
- Cómo arma la base los combos (dentro de "piezas que combinan, de lo libre,
  2 a 4, más piezas más porcentaje"), y la semilla de la semana.
- El ritmo exacto del slider y de las entradas, dentro de "rápido, suave y
  solo `transform`/`opacity`".
- Los textos de partida de Nosotros, Buscamos y Materiales, **con los datos
  del cerebro de marca `lux-by-emory`**: nada que no esté ahí se afirma.
