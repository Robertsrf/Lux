# Dijes y bases para armar — diseño

21/10/2026 · Borrador para que lo apruebe el dueño · Pedido del dueño del 21/10/2026

## Por qué

El dueño trajo muchos dijes sueltos, y cadenas y pulseras sin dije (unos $1
de costo) para colgárselos. Al cargar un dije de $0,88 como inventario, el
sistema lo pone en **$9**: le suma lo de tienda de una pieza completa
(empaque + su parte del mes de alquiler y sueldos, hoy unos $3 que dice
Costos) y luego el margen, y el grupo más barato que lo cubre es G9. Cadena
y dije por separado saldrían en unos $18 juntos. "Obvio no puede costar eso."

Lo que pidió: que la clienta elija su cadena o pulsera y el dije que quiera,
que se sumen los costos, y que **sobre esa suma** se aplique una sola vez lo
del negocio y el margen.

Hoy el remiendo es "Sumar algo fuera del catálogo" (`esquema-fuera-de-catalogo.sql`,
02/10/2026), que se hizo justo para el dije de una cadena: no descuenta
existencia y no sabe lo que costó. CLAUDE.md ya lo dice: "si algo se vende a
menudo así, lo que toca es cargarlo al catálogo". Este es ese momento.

## La idea en una línea

El margen es un porcentaje, así que se reparte sobre una suma: aplicarlo al
total de los costos da lo mismo que aplicarlo a cada parte.

```
(cadena×k + tienda)/(1−m) + (dije×k)/(1−m)  ==  ((cadena + dije)×k + tienda)/(1−m)
        k = brecha × merma          m = margen          tienda = lo de tienda por pieza
```

Lo único que no puede contarse dos veces es **lo de tienda**. Entonces:

- **La base** (cadena o pulsera) es una pieza como cualquier otra: lleva lo de
  tienda y su margen. Sin cambios.
- **El dije** lleva solo su mercancía con el margen: **sin lo de tienda**.
- **Puestos juntos**, base + dije es exactamente "sumar los costos y aplicar
  el negocio una vez" (salvo el redondeo de las escaleras de precio).

A ojo, con las cifras del dueño: cadena G9 + dije unos $2 = **unos $11** en
vez de $18. La cifra real sale de la fórmula con la brecha del día y de la
escalera que cargue el dueño.

## Decidido por el dueño

- **El dije se vende de las tres formas** (21/10/2026): solo, para una cadena
  propia de la clienta; solo, para una cadena que ya compró otro día; o para
  armarlo con una base de la tienda. Consecuencia: **el dije tiene un solo
  precio**, vaya solo o puesto. No hay regla que lo empareje con una base.
- **El dije solo cuenta en las estadísticas de venta** (lo vendido, la caja,
  la ganancia, las piezas de Reportes), pero **no cuenta para el descuento
  por cantidad ni para la meta de la vendedora, salvo que vaya con una base**
  (21/10/2026). Puesto en una base, base y dije son UNA joya: cuenta como una
  pieza (la base) y, si la venta llega a un tramo, el descuento le llega
  también al dije.

## Decidido tras la revisión del constructor (21/10/2026)

*Mis decisiones; el dueño las puede cambiar:*

- **Lo de tienda del dije es cero, empaque incluido.** El negocio (empaque y
  gastos del mes) se cobra una vez, en la base. Un dije que sale solo se
  lleva su bolsita sin que su precio la cubra: son céntimos, y cobrarla
  siempre haría pagar dos empaques a cada pieza armada.
- **Qué dijes van con base, en una venta:** se cuentan las bases de la venta.
  Los dijes se recorren por su modelo, de menor a mayor id; cada modelo de
  dije cuyas unidades quepan enteras en las bases que quedan recibe el
  descuento del tramo y gasta esas bases; el que no cabe, no. Nunca recibe
  descuento un dije que no tiene base. La misma cuenta en la base de datos
  (una función) y en el carrito del mostrador.
- **Un dije sin base en una venta con tramo** está fuera del tramo: se cobra
  su etiqueta o se regatea hasta su mínimo, como una venta chica.
- **Cualquier dije va en cualquier base.**
- **Cada línea de venta congela si era un dije** (`venta_items`), al
  guardarse, por un disparador: así lo cubren los dos caminos a la venta y la
  nota de crédito sin reescribirlos, y una pieza que mañana deja de ser dije
  no cambia el pasado. Las cuentas de piezas leen esa marca, no la del modelo.
- **Las fórmulas que restan el empaque por pieza** (`v_ventas_por_dia`,
  `v_mezcla_grupo`, `v_recuperacion` y `plan_ventas`) lo restan solo por las
  piezas que no son dijes. Lo de tienda en cero en la foto de la línea, por sí
  solo, no movía ninguna cifra visible (las de "Te dejaron" y "El mes" restan
  el empaque de `configuracion`, no la foto).
- **`plan_ventas` se separa por dentro:** el dinero (lo vendido, la
  mercancía) con los dijes; las piezas (vendidas del mes, el promedio por
  pieza, el ritmo, la vitrina) sin ellos. `v_cobertura_mes`, `v_diagnostico`
  y `meta_vendedora` salen de ella y quedan bien solas.
- **Marcar los dijes que ya están cargados** se hace en su formulario (es un
  producto con sus 26 letras: un guardar). "Reacomodar precios" no toca las
  piezas con precio propio, como siempre.
- **La unión dije–base del pedido (fase 2) se guarda solo en los pedidos del
  catálogo de la tienda**, que prepara la tienda. En el del revendedor,
  "Agrégale un dije" mete las dos piezas sin la unión.

## Las palabras

| Palabra | Qué es |
|---|---|
| **Dije** | Pieza que se cuelga de una cadena o pulsera. Inventario normal (SKU, existencia, foto, costo, lote, ubicación, variantes), con su precio de dije. |
| **Base** | Cadena o pulsera que se trajo para colgarle un dije. Una pieza normal en todo; la marca solo dice que admite un dije (para el catálogo, fase 2). |
| **Pieza armada** | Una base con su dije en el mismo pedido o venta (fase 2). No es un producto cargado: son las dos líneas. |
| **Lo de tienda** | `costo_operativo_por_pieza()`: empaque + gastos fijos del mes ÷ piezas del mes. |
| **Escalera de dijes** | Los precios en los que puede caer un dije, como G9…G30 para las piezas, pero aparte. |

## Objetivos

1. Un dije se carga y sale a un precio con sentido: su mercancía (con brecha
   y merma) y el margen, **sin lo de tienda**.
2. Base + dije cuesta lo que costaría una sola pieza con los dos costos sumados.
3. Las cuentas del dueño siguen diciendo la verdad: lo que dejó cada venta,
   el volumen del mes, las piezas para no perder y la meta de la vendedora.
4. Fase 2: en el catálogo (el de la tienda y el de cada revendedor), la
   clienta abre una base, toca "Agrégale un dije", elige y le salen las dos
   en el pedido, sabiendo la tienda cuál va en cuál.

## No es

- No es un "kit" ni un producto compuesto cargado a mano. Los kits se
  retiraron en septiembre de 2026 por eso mismo. La pieza armada son dos
  líneas, cada una con su existencia.
- No es una rebaja: el dije no se vende "con descuento", tiene su propio precio.
- No cambia el precio de ninguna pieza que no sea un dije.
- No quita "Sumar algo fuera del catálogo": sigue para lo que de verdad no
  está cargado.

## Lo que lo haría un fracaso aunque funcione

- **Que los dijes cuenten como piezas en el volumen del mes.** El volumen sale
  de `sum(venta_items.cantidad)` (`volumen_mensual_estimado`). Si los dijes
  contaran, el sistema creería que se venden más piezas, lo de tienda por
  pieza bajaría y **todo el catálogo se abarataría** sin un solo error, con
  piezas que de verdad no cubren el mes. Es la trampa más grave de este cambio.
- Que Reportes diga que una venta con dije dejó $3 menos de lo que dejó
  (porque la línea del dije guardó lo de tienda en su foto).
- Que la vendedora vea un número de costo, o pueda despejarlo.
- Que el mostrador, el catálogo y la base digan precios distintos para el
  mismo carrito.
- Que una cifra (los precios de la escalera de dijes) la invente el sistema.

## La regla del precio del dije

```
costo del dije, en $ BCV = costo_puesto × brecha × merma        (sin lo de tienda)
grupo del dije = el más barato de la ESCALERA DE DIJES cuyo margen llegue al piso
```

Es la misma regla de `admin_sugerir_precio` (`esquema-piso-precio.sql`: "el
grupo más barato cuyo margen resultante llegue al piso"), con dos cambios:
sin lo de tienda y sobre la escalera de dijes.

- **La escalera de dijes la carga el dueño**, en la pantalla Grupos, aparte de
  la de las piezas. El sistema no trae precios sembrados (regla 4). Sin
  escalera cargada, un dije no tiene precio sugerido y el formulario lo dice.
  *Mi decisión:* escalera y no precio exacto redondeado. Es lo que el sistema
  ya hace, el dueño ya la conoce, y un precio exacto (lineal sobre el costo)
  deja despejar el costo con más facilidad.
- **Los pisos del dije** (`piso_margen_de`, `precio_minimo_de`) salen de su
  costo sin lo de tienda. Así el regateo, el revendedor (`rv_precio_lux`, que
  baja hasta `piso_margen_de`) y cualquier tramo se cortan contra lo que de
  verdad cuesta el dije.
- **El margen del dije en el Inventario y en Costos** se mide igual, sin lo de
  tienda. Si no, la pantalla diría que el dije pierde dinero.
- **Las variantes** (un dije en dos tamaños) siguen la regla de siempre de
  `guardar_variantes_de`: con costo propio se le busca el grupo con la misma
  función, ahora sobre la escalera de dijes.

## El dije no es una pieza para las cuentas que cuentan piezas

Cada cuenta que **cuenta piezas** deja fuera los dijes; cada cuenta que
**suma dinero** los incluye. *Mis decisiones, con su porqué:*

| Cuenta | Con dijes | Por qué |
|---|---|---|
| Volumen del mes (`volumen_mensual_estimado`, `v_volumen`) | **No** | Reparte lo de tienda entre piezas; el dije no lo carga (ver "fracaso") |
| Piezas para no perder y lo que deja cada pieza (`plan_ventas`) | **No** | Es "cuántas piezas con su parte de tienda cubren el mes" |
| Meta de la vendedora y "Mi día" en piezas (`meta_vendedora`, `v_vendedoras`) | **No** | La meta sale de `plan_ventas`; contarlos dejaría llegar a la meta sin cubrir el mes |
| Tramo de mayoreo (`descuento_para`, `precio_de_linea`, `cotizar_pedido`, `precioConTramo`) | **No cuentan ni reciben el descuento** | Su precio ya va sin lo de tienda; un 15 % encima caería contra su piso. El regateo sí, hasta su `precio_minimo_de` |
| Lo vendido en dinero, la caja, la ganancia del mes, `v_cobertura_mes` | **Sí** | Es dinero que entró y lo que dejó |
| Valor del inventario (`v_valor_inventario`) | **Sí** | Es mercancía en la tienda |
| Conteo, cierre del día, mover, existencia | **Sí** | Es inventario físico como cualquier otro |

El constructor recorre **todas** las funciones y vistas vigentes que llaman a
`costo_operativo_por_pieza()`, a `costo_total_bcv()`, o que cuentan
`venta_items.cantidad` o `existencias`, no solo las de esta lista (la trampa
del conteo de octubre: "cuando una columna cambia de significado, se buscan
TODAS las pantallas que la leen"). Las que conozco hoy: `admin_sugerir_precio`,
`admin_reasignar_grupos`, `guardar_variantes_de`, `piso_margen_de`,
`v_catalogo_base`/`v_catalogo_admin`, `registrar_venta`, `vender_congelado`,
`apartar_en_tienda`, `crear_reserva`, `cotizar_pedido`, `plan_ventas`,
`v_diagnostico`, `volumen_mensual_estimado`, `v_volumen`, `meta_vendedora`.

## Lo que se congela al vender

La línea de un dije en `venta_items` guarda `es_dije = true` y
`costo_operativo_usd_snap = 0` (y su costo de mercancía como siempre), por
un disparador al insertarla: vale para `registrar_venta`, `vender_congelado`
(pedidos, apartados y revendedores) y la nota de crédito. Las cuentas de
piezas y de empaque leen `es_dije` (ver "Decidido tras la revisión").

Si el dije deja de ser dije mañana, las ventas viejas no cambian: la foto es
la de ese día.

## Fase 1: el precio justo (primero, y sola ya resuelve el problema)

1. **La marca en la pieza.** Una columna en `modelos` que dice si la pieza es
   un **dije**, una **base** o ninguna. Explícita, **no deducida de la
   categoría** (las categorías son texto libre y "dijes" escrito con s no
   puede cambiar un precio). Se pone en el formulario del producto, se copia
   a las variantes como la categoría, y va en `v_catalogo_venta` y
   `v_disponible_publico` (no es un costo).
2. **La escalera de dijes.** En `grupos_precio`, para qué escalera es cada
   grupo. La pantalla Grupos las enseña por separado y el dueño carga la suya.
3. **El precio y los pisos** como dice "La regla del precio del dije".
4. **Las cuentas** como dice la tabla de arriba.
5. **La foto de la venta** como dice "Lo que se congela".
6. **Los dijes que ya están cargados.** Cargados hoy como piezas, con G9. El
   dueño los marca como dijes (en el formulario, o varios a la vez desde el
   Inventario) y "Reacomodar precios" (`admin_reasignar_grupos`) los pasa a la
   escalera de dijes. Un pedido que ya tenga un dije apartado conserva su
   precio congelado, como siempre.
7. **Las pantallas**: el formulario dice "Es un dije" / "Es una base para
   armar" y "Sale en" con la escalera de dijes; el Inventario enseña el margen
   del dije sin lo de tienda; el mostrador y el catálogo los venden como
   cualquier pieza, con su precio. El carrito no los cuenta para el tramo.

Con esto, un dije sale a su precio en el mostrador, en el catálogo y en el
del revendedor, solo o junto a una cadena.

## Fase 2: armar en el catálogo

1. En la ficha de una **base** (catálogo de la tienda y de cada revendedor):
   "Agrégale un dije" abre la lista de dijes con foto y precio ("+$2"); al
   elegir, las dos piezas entran al pedido **unidas**.
2. El pedido guarda qué dije va en qué base (la línea del dije apunta a la de
   la base, en `reserva_items` y `apartado_items`). Pedidos lo enseña como
   "Armar: cadena X + dije Y", para que quien lo prepara no adivine con dos
   cadenas y dos dijes.
3. Los dijes también salen solos, en su categoría, para quien solo quiere el dije.
4. En el mostrador no hace falta nada nuevo: se tocan la base y el dije y
   cada uno entra a su precio. *Mi decisión:* sin unión en la venta del
   mostrador; la pieza se arma ahí mismo, delante de la clienta.
5. La vitrina del televisor no usa un dije como pieza estelar ni en "tres
   para combinar" (un dije de $2 no es la pieza que vende la tienda). El
   catálogo PDF los pone en su categoría. *Mi decisión, menor.*

## Seguridad

- Ningún costo sale de la base: el precio del dije es un grupo, y la marca
  dije/base no es un costo. `margen_minimo_pct` sigue fuera de las claves que
  lee la vendedora.
- `cotizar_pedido` sigue sin soltar una clave de costo, y sigue sin cotizar
  más piezas de las libres.
- `npm run verificar` gana las comprobaciones de lo nuevo (la columna nueva en
  las vistas públicas no trae nada de costo; las funciones de precio del dije
  siguen cerradas a `anon`).

## Restricciones (las del repo que aplican aquí)

- **Primero el SQL, después el navegador.** Ninguna función que el navegador
  ya llama pierde un parámetro; lo nuevo va al final con valor por omisión.
- `create or replace view` solo añade columnas al final.
- El `.sql` nuevo es el **#60** de `INSTALACION.md`, se puede volver a correr,
  y dice de qué depende (del #59).
- Toda cuenta de dinero del navegador vive en `lib/dinero.ts`; el carrito
  repite la regla del tramo de la base, ahora sin dijes, y las dos dicen lo mismo.
- Campos de cifra: `type="text"` + `leerCifra`.
- Textos a 4,5:1; las pantallas siguen `lux-ui`.
- En el mismo commit: CLAUDE.md (reglas, tablas, funciones), INSTALACION.md,
  PRODUCT.md (la regla de negocio nueva) y, si cambia el panel del
  revendedor, su guía pública.

## Cómo se prueba

- **En PGlite**, con la instalación entera: un dije de $0,88 sale hoy en G9
  (la prueba falla primero, roja); con el cambio sale en su escalera, y
  cadena + dije cuesta lo que una pieza con los dos costos sumados (salvo el
  redondeo de las escaleras).
- Vender dijes no mueve `volumen_mensual_estimado`, ni `plan_ventas`, ni la
  meta de la vendedora; sí mueve la caja y la ganancia del mes.
- La línea de un dije queda con `costo_operativo_usd_snap = 0`, por
  `registrar_venta` y por `vender_congelado`.
- Un carrito con 5 piezas y 3 dijes no llega al tramo de 6, en la base, en
  `cotizar_pedido` y en `precioConTramo`.
- El revendedor: el precio de un dije para él no baja de su piso de dije.
- `npm run verificar` y `npm run build` limpios; contra la base real con
  `prueba-temporal.mjs`, entregando las cifras esperadas del dije de $0,88
  con la brecha del día.

## Lo que queda al constructor

Los nombres de las columnas y de las funciones nuevas; si el precio del dije
se resuelve con una función propia o con un parámetro en las de siempre (sin
cambiar ninguna firma que el navegador llame); cómo se ve "Agrégale un dije"
dentro de `lux-ui`; el orden de las tareas dentro de cada fase.
