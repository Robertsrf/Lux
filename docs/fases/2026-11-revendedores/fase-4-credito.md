# Fase 4 — El crédito con Lux y la pantalla Crédito

## Lo que pidió el dueño (18/11/2026)

JaduJoyas puede llevarse piezas **a crédito, de 7 a 10 días sin problema**.
En el panel del administrador, una sección **Crédito**: la clienta, lo que se
llevó y cuánto debe, con su descuento.

## Cómo está hoy

- **En la tienda ya no se vende a crédito** (decisión del 30/09/2026): "Pagó
  una parte" se reemplazó por el apartado; la pieza se queda hasta pagarla.
  Lo que queda de crédito son las ventas por partes de antes
  (`ventas.pago_parcial`, abonos con `abonar_venta`, lo que falta con
  `falta_bcv_de`).
- **El revendedor paga a Lux en 24 horas** desde que confirma un pedido de
  su clienta (`revendedor_horas_para_pagar`), y la pieza no sale de la
  tienda hasta que la tienda aprueba el pago (`aprobar_apartado`).
- Ninguno de los dos caminos es "se lleva la pieza hoy y paga en 10 días".

## Qué se hace

1. **Crédito es un permiso de la clienta, no de la venta**:
   `clientes.credito_dias` (null: sin crédito) y, si el dueño quiere,
   `clientes.credito_tope_usd` (lo máximo que puede deber a la vez, en $
   BCV). Lo fija el administrador en la ficha. Para JaduJoyas, de 7 a 10:
   preguntar el número exacto.
2. **La venta a crédito**: en el mostrador, con una clienta con crédito,
   "A crédito" junto a "Cobrar" y "Lo aparta". La pieza **sale del
   inventario y se entrega** (es lo que la hace distinta del apartado). Es
   una venta por partes (reusar `pago_parcial`, `abonos`, `falta_bcv_de`;
   un solo camino, ver Trampas "Dos caminos a la venta") con
   `ventas.vence_en` = hoy + sus días. Con su descuento de la fase 3 ya
   aplicado.
3. **La caja** cuenta cada abono el día que llega, como ya hace con una
   venta por partes. La venta a crédito no entra entera el día que se vende.
   Reportes sí la cuenta como vendida ese día (el dinero se debe, la pieza
   se fue).
4. **La pantalla Crédito** (`/admin/credito`, nueva): una fila por clienta
   con deuda: cuánto debe en $ BCV y en bolívares de hoy, desde cuándo,
   cuándo vence y si está vencida. Al abrirla: cada venta a crédito con sus
   piezas (foto, precio con su descuento, precio de etiqueta), los abonos
   (`ListaAbonos`) y "Cargar un pago" (`CargarAbono`). Una vista nueva,
   `v_credito`, solo admin; lo que falta sale de `falta_bcv_de`, no se
   recalcula.
5. **Aviso de vencido**: en el Tablero del administrador, "N créditos
   vencidos". Nada automático más allá de eso (no hay recargo por mora salvo
   que el dueño lo pida, y la cifra la pone él).
6. **El tope**: si la clienta tiene tope, el mostrador no deja una venta a
   crédito que lo pase, y lo dice. Lo comprueba la base.

## Decisiones abiertas (preguntar al empezar)

- ¿Quién puede vender a crédito: cualquier vendedora (a una clienta que el
  dueño ya habilitó) o solo el administrador? Recomendación: cualquiera,
  porque el permiso está en la clienta; el dueño lo ve en Crédito.
- ¿Días exactos de JaduJoyas? ¿Tope en dólares? (Regla 4: no se inventa.)
- ¿Con crédito vencido puede llevarse más? Recomendación: no, hasta pagar.
- **El crédito del revendedor en sus pedidos**: hoy paga a Lux en 24 h lo
  que su clienta le pidió. ¿Para JaduJoyas esas 24 h pasan a ser sus días de
  crédito? Puede ser `revendedores.horas_para_pagar` propio (null: el
  general). Se cruza con la fase 5: decidir aquí si sus compras para
  inventario van solo por el mostrador o también desde su panel.

## Seguridad

- `clientes.credito_*` solo los escribe una `admin_*`.
- `v_credito` con `es_admin()` (y `having` si agrega; ver Trampas).
- `verificar`: que la vendedora no lea `v_credito` y no pueda darle crédito
  a una clienta.

## Archivos (orientativo)

- SQL #70 (p. ej. `esquema-credito.sql`): columnas, `registrar_venta` con
  `p_credito boolean default null` **al final**, `v_credito`,
  `admin_fijar_credito`. Amplía el respaldo.
- `src/paginas/admin/Credito.tsx` (nueva), `Mostrador.tsx`, `Clientes.tsx`,
  `Tablero.tsx`, `Armazon` (el menú).
- CLAUDE.md (reglas, vistas, funciones, árbol), INSTALACION.md, PRODUCT.md.
