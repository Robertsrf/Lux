# Fase 4 — El crédito con Lux y la pantalla Crédito

Fecha: 23/11/2026. Pedido del dueño del 18/11/2026; fase 4 de
`docs/fases/2026-11-revendedores/`. SQL **#71**, `esquema-credito.sql`
(depende del #70).

## Por qué

JaduJoyas (clienta y futura revendedora) se lleva piezas hoy y paga en 7 a 10
días. Hoy no hay forma: desde el 30/09/2026 el mostrador no vende a crédito
(la pieza se queda en el apartado hasta pagarla) y el revendedor paga a Lux en
24 horas. El dueño quiere además una pantalla **Crédito**: quién debe, qué se
llevó, cuánto y con qué descuento.

## Lo que decidió el dueño (23/11/2026)

1. **Vende a crédito cualquier vendedora**, a una clienta que el dueño
   habilitó en su ficha. El permiso es de la clienta.
2. **Con un crédito vencido sí puede llevarse más**: el mostrador lo avisa y
   deja vender.
3. **Los pedidos de su panel de revendedora siguen en 24 horas.** El crédito
   es solo de la tienda, en el mostrador. Lo de su panel se ve en la fase 5.
4. **Los pagos del crédito se cargan en Pedidos (las dos caras) y en Crédito
   (el administrador).**
5. **Una función nueva, `vender_a_credito`**, que usa `registrar_venta` tal
   cual (no cambia su firma).
6. **El aviso de vencidos va en el menú**: "Crédito · 2 vencidos".

## Mis decisiones (para corregir)

- **Los días y el tope los escribe el dueño en la ficha** (regla 4): no hay un
  7 ni un 10 en el código. `clientes.credito_dias` (null: sin crédito) y
  `clientes.credito_tope_usd` (lo máximo que puede deber a la vez, en $ BCV;
  null: sin tope).
- **Puede pagar algo el día que se lleva la pieza, sin obligación.** Si paga,
  ese pago se carga como el primer abono, en la misma transacción.
- **La forma de pago se elige igual**: es cómo paga hoy o, si no paga nada,
  cómo va a pagar (la venta necesita una, y Pedidos la enseña). No cuenta en
  la caja: ahí solo entran los abonos.
- **El vencimiento es un día, no una hora**: hoy (en Venezuela) más sus días.
  Vencida desde el día siguiente. `ventas.credito_vence date` (null: no es a
  crédito) dice las dos cosas a la vez.
- **El tope cuenta todo lo que debe**: lo que falta de todas sus ventas por
  partes abiertas (las de crédito y las de antes) más lo que queda de esta,
  después del pago del día. Si lo pasa, no se vende, y se dice cuánto le
  queda.
- **En una venta a crédito, "Anular" y "Quitar" son solo del administrador.**
  La pieza ya salió con la clienta: si la vendedora la anula o le quita una
  pieza, el sistema la daría por vuelta a la vitrina sin estar ahí. El dueño
  lo hace cuando la clienta de verdad la devuelve antes de terminar de pagar.
  Lo cuidan dos disparadores, sin reescribir `quitar_de_venta` (200 líneas)
  ni `anular_venta_por_verificar`.
- **Crédito enseña todas las deudas con nombre**: las ventas a crédito y las
  ventas por partes de antes que siguen abiertas (estas sin fecha de
  vencimiento, dicho así: "Por partes, sin plazo").
- **Se cierra como cualquier venta por partes**: cuando no falta nada,
  "Pago verificado" (`verificar_venta`) la saca de Crédito y de Pedidos.

## Cómo se construye (el camino elegido)

Una venta a crédito ES una venta por partes por verificar, con fecha de
vencimiento. Todo lo demás ya existe y no se toca:

- La pieza sale del inventario (`registrar_venta`).
- El precio, el tramo, el descuento de clienta (fase 3) y los códigos salen de
  `registrar_venta`, el mismo sitio de siempre.
- La caja no cuenta la venta entera: cuenta cada abono el día que llega
  (`caja_flujo` ya deja fuera las ventas `pago_parcial`).
- Reportes, la meta y "Mi día" la cuentan vendida el día que se llevó la
  pieza (ya cuentan toda venta no anulada).
- Lo que falta, de `falta_bcv_de`. Los abonos, `abonar_venta`. Cerrar,
  `verificar_venta`.

`vender_a_credito(...)`, de definidor y de las dos caras, en una sola
transacción:
1. La clienta tiene que llegar por SU ficha (`p_cliente_id`) y tener
   `credito_dias`. Se bloquea su fila (dos ventas a la vez no pasan el tope).
2. Llama a `registrar_venta(..., p_por_verificar => true, ...)` con lo mismo
   que el mostrador manda hoy.
3. Marca la venta `pago_parcial` y `credito_vence = hoy + credito_dias`.
4. Si hay pago del día, `abonar_venta`.
5. Si tiene tope: lo que debe ahora (todas sus ventas por partes abiertas,
   con `falta_bcv_de`) no puede pasarlo. Si lo pasa, error y nada se guarda.
6. Devuelve el id, lo que falta y la fecha de vencimiento.

Descartada: agregar `p_credito` a `registrar_venta` (el plan original);
obliga a borrar su firma y reescribir otra vez la función de 300 líneas que
se tocó en la fase 3, con el mismo resultado.

## La base (#71, `esquema-credito.sql`)

- `clientes.credito_dias int` (null, o de 1 a 365: solo freno de erratas) y `clientes.credito_tope_usd
  numeric(12,2)` (null o > 0). Solo los escribe `admin_fijar_credito(cliente,
  días, tope)` (null o 0 en días quita el crédito; en tope, sin tope).
- `ventas.credito_vence date`.
- `vender_a_credito(...)`: arriba. Rechaza sin sesión, sin crédito, sin su
  ficha, con algo fuera del catálogo que no diga qué es (lo repite
  `registrar_venta`), y si pasa el tope.
- `credito_de_clienta(cliente)`, de las dos caras: días, tope, lo que debe
  hoy, cuánto le queda del tope, cuántos vencidos y desde cuándo. Es lo que el
  mostrador enseña. Ninguna cifra de costo.
- Disparadores `venta_credito_anular` (en `ventas`, al pasar a anulada) y
  `venta_credito_quitar` (en `venta_items`, al cambiar la cantidad): si la
  venta es a crédito y quien lo hace tiene sesión y no es administrador, no.
- `v_credito`, solo admin (`where es_admin()`): una fila por venta por partes
  abierta con clienta: clienta, cédula, teléfono, su descuento, la fecha, el
  total, lo que falta (`falta_bcv_de`), `credito_vence`, si está vencida, y lo
  pagado. Las piezas se leen de `v_ventas_por_verificar` (ya trae foto, precio
  cobrado y lo que costaba sin oferta) más la etiqueta, que se añade al final
  de esa vista (`precio_lista_bs`).
- `creditos_vencidos()`, solo admin: el número para el menú.
- `v_ventas_por_verificar` gana al final `credito_vence` y `precio_lista_bs`.
  `v_clientes` gana al final `credito_dias` y `credito_tope_usd`.
- `admin_fusionar_clientes` (misma firma) lleva también el crédito: si la que
  se queda no tiene, el de la que se va.
- El respaldo: `admin_respaldo` copia filas enteras (`to_jsonb(t)`), así que
  las columnas nuevas van solas. No hay tablas nuevas.

## El navegador

- **Ficha de la clienta** (`Clientes.tsx`, componente `CreditoClienta`, junto
  a `DescuentoClienta`): el administrador pone los días y el tope; la
  vendedora lo ve escrito ("Crédito de 10 días, hasta $150 BCV").
- **Mostrador**: con una clienta elegida por su ficha y con crédito, un
  tercer camino en el cobro, **"A crédito"**, junto a "Cobrar" y "Lo aparta".
  Dice "Se lleva las piezas hoy y paga hasta el 3/12", lo que debe ya, lo que
  le queda del tope y, si tiene un vencido, el aviso. El pago del día es
  opcional (forma de pago y monto). Sin la clienta con crédito, el botón no
  sale. Sin el #71, tampoco.
- **Pedidos**: la venta a crédito dice "A crédito · vence el 3/12" (o
  "Vencido desde el 3/12", en alerta) en vez de "Pago por partes". Para la
  vendedora, "Anular" y "Quitar" no salen en una venta a crédito, y se dice
  por qué.
- **Crédito** (`/admin/credito`, nueva, solo admin; en el menú tras Caja):
  una fila por clienta con deuda, las vencidas primero: cuánto debe en $ BCV
  y en bolívares de hoy, desde cuándo, cuándo vence o "vencido", su descuento
  y su tope. Al abrirla, cada venta con sus piezas (foto, precio cobrado y
  etiqueta), sus abonos (`ListaAbonos`) y "Cargar un pago" (`CargarAbono`).
  Arriba, el total que se debe a la tienda.
- **Menú**: "Crédito" lleva "2 vencidos" cuando hay (`creditos_vencidos()`,
  al entrar y al volver a la pestaña). El `EnlaceNav` gana un aviso opcional.

## Seguridad

- `clientes.credito_*` solo por `admin_fijar_credito`.
- `v_credito` y `creditos_vencidos` solo para el administrador.
- `vender_a_credito` y `credito_de_clienta` piden sesión de personal activo;
  sin sesión, nada. No dan costo ni piso.
- `verificar`: la vendedora no lee `v_credito`, no llama
  `admin_fijar_credito` ni `creditos_vencidos`; sin sesión no llama
  `vender_a_credito` ni `credito_de_clienta`.

## No entra

El crédito en el panel del revendedor (fase 5, si se decide), recargo por
mora, recordatorios automáticos, y devolver una pieza de una venta a crédito
con nota de crédito (se hace con "Quitar" por el administrador mientras no
esté pagada; ya pagada, la devolución de siempre).

## Prueba

PGlite con la instalación entera: venta a crédito sin pago y con pago del
día; con descuento de clienta y con tramo; la caja (sin la venta, con cada
abono); el tope (justo, pasado, con otra deuda abierta); la clienta sin
crédito o escrita como ficha nueva; la vendedora sin poder anular ni quitar,
el administrador sí; cerrar al pagar completo; vencida; `v_credito` vacía para
la vendedora; el `.sql` corrido dos veces.
