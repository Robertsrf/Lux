# Un catálogo que se entiende y que vende (24/10/2026)

## Por qué

El dueño: el catálogo "no luce atractivo o entendible para quedarse más
tiempo o saber cómo ordenar", y no dice dónde está la tienda, su teléfono ni
su pago móvil. Quiere que el pedido llegue al sistema **y** al WhatsApp de la
tienda. Cuatro revisiones (investigación, diseño, ingeniería y seguridad)
coincidieron en lo que falla, medido en un teléfono de 360 px:

- La primera pantalla no enseña joyas: el 62 % se va antes de la primera foto.
- La tienda no existe en la página: ni dirección, ni WhatsApp, ni horario, ni
  pie. Los campos existen en Textos, vacíos y sin usar.
- Cómo pedir se descubre a mitad del camino (el 40 %, los días, el pago
  móvil, el envío, el descuento por cantidad).
- Las categorías viven plegadas en "Filtrar" y "Ver más" deja categorías
  enteras fuera.
- La tarjeta es la del mostrador: el material repetido en cada una, la clave
  de bodega, "Quedan 2" en alerta en 82 de 100.
- Nada llega a WhatsApp, y la página del pedido dice "escríbenos por
  WhatsApp" sin número.

## Lo que decidió el dueño

- Hacerlo todo y publicarlo; él corre el SQL.
- El aviso por WhatsApp es **un botón que toca la clienta** con el pedido ya
  escrito (gratis). Nada de la API de WhatsApp Business por ahora.
- Arreglar dentro de este trabajo los dos huecos de seguridad que ya existían.

## El catálogo de la tienda (`/publico`)

**Inicio** (sin tipo, sin búsqueda, orden por tipo):

1. Cabecera con la marca y, si hay número, "Escríbenos" (WhatsApp).
2. Portada corta: de dónde es, los materiales (`materiales_largo`) y "Así
   pides", tres pasos de una línea con un enlace a los detalles.
3. Buscar.
4. **Elige por tipo**: un cuadro por categoría con la foto de una pieza suya
   y cuántas hay.
5. **Un estante por categoría**: su nombre, cuántas, cuatro piezas y "Ver
   las N". Ninguna categoría queda escondida detrás de "Ver más".
6. **Cómo pedir**, entero: los pasos con las cifras reales (`reglas_pedido()`
   y `tramos_mayoreo`); sin ellas, el texto sin cifras de siempre.
7. Próximamente, como estante: cuatro y "Ver las N".
8. **La tienda**: dirección con "Cómo llegar" (un enlace a Google Maps, nunca
   un mapa incrustado: pesa y la CSP lo bloquea), horario, WhatsApp,
   Instagram y "Cómo pagar" (el pago móvil para copiar, con el titular si
   está cargado y la nota de que primero se aparta).
9. Pie (`catalogo_pie`).

**Lista** (`?tipo=Anillos`, una búsqueda, u ordenado por precio): volver a
todo el catálogo, el tipo en una lista, buscar y ordenar, la rejilla con
"Ver más" de siempre.

**La tarjeta de vitrina** (compartida con el revendedor): nombre, las
medidas en corto, "desde" si hace falta, Bs y $ BCV del mismo tamaño, y
"Quedan N" y "Última pieza" en tono neutro (con datos reales, "Última pieza" en alerta salía en 25 de 42 tarjetas).
El material y la clave de ubicación pasan al visor.

**El pedido** (`?paso=pedido`): vuelve arriba al entrar, conserva la
cabecera, numera sus partes (1 tus piezas, 2 tus datos, 3 cómo lo recibes),
dice "Qué pasa al apartar" con las cifras reales antes del botón, y "Vaciar"
pasa a ser un enlace de texto.

**La confirmación** (`/reserva/:token`): arriba, "Avisar a la tienda por
WhatsApp", un enlace `wa.me` con un mensaje armado de `ver_reserva` (la
referencia, el nombre como lo da la base, hasta diez piezas y "y N más", el
total del sistema, la entrega y el enlace del pedido; nunca cédula, teléfono
ni dirección). Los "escríbenos por WhatsApp" pasan a ser enlaces. Sin número
válido en Textos, no sale el botón.

## El catálogo del revendedor (`/r/:usuario`)

La misma tarjeta, los mismos cuadros por tipo y estantes, y "Cómo pedir" con
SUS reglas (`horas_pago`, `dias_credito`, `inicial_pct`). Su contacto es el
suyo. **Nunca** sale la dirección, el WhatsApp ni el pago móvil de Lux: su
clienta le paga a él.

## El SQL (#61, `esquema-catalogo-claro.sql`)

1. Claves nuevas de `textos` (vacías): `mapa_tienda`, `instagram_tienda`,
   `pago_movil_titular`. La descripción de `whatsapp_tienda` dice que ahora
   sale en el catálogo y en el pedido.
2. `reglas_pedido()`, sin sesión: `apartado_inicial_pct`, `apartado_dias` y
   `reserva_minutos`, nada más (`verificar` lo vigila).
3. **Pedidos sin pagar, con tope**: un disparador en `reservas` no deja más
   de `pedidos_sin_pagar_max` (en `configuracion`, 2) pedidos del catálogo
   abiertos y sin pagar con la misma cédula o el mismo teléfono.
4. **Un pago que no llegó suelta las piezas**: si lo pagado sin anular baja
   del mínimo del apartado, `pedido_al_dia` devuelve el pedido a "esperando
   pago" con su plazo de siempre, que casi siempre ya pasó. Antes el pedido
   seguía apartado 15 días aunque la tienda dijera "no llegó".

El navegador funciona con y sin el #61: sin `reglas_pedido()` dice los pasos
sin cifras, y sin las claves nuevas esas líneas no salen.

## Lo que se deja fuera

- El aviso automático (API de WhatsApp Business, una función de servidor y
  pago por mensaje).
- Un mapa incrustado.
- Un interruptor para apagar los pedidos del catálogo.
