# Cobro: crédito al momento y rebaja en porcentaje

Pedido del dueño del 26/11/2026. Cambio pequeño.

## Por qué

- **Crédito.** Hoy "A crédito" solo sale si la ficha ya tiene días, y esos días
  los pone el administrador en Clientes. Para venderle a crédito a alguien hay
  que registrarla, ir a su ficha, ponerle el crédito y volver al cobro. Es un
  fastidio. Se quiere decidir en el mismo cobro, al elegir la clienta.
- **Rebaja.** Hoy la rebaja se escribe como el precio de cada pieza en Bs. Se
  quiere escribirla en % por pieza, y también un % para toda la venta.

## Lo que decidió el dueño

1. Dan crédito desde el cobro **el administrador y las vendedoras**.
2. El crédito del cobro vale **solo para esa venta**: la ficha no cambia.
3. **Sin máximo de días**: los escribe quien cobra. Se vigila en Crédito.
4. **El tope de la ficha manda**: si la clienta tiene tope y con esta venta lo
   pasa, no se vende. Sin tope en la ficha, no hay tope.
5. Un % que pasa la rebaja máxima de una pieza **la deja en su mínimo y lo dice**.

## Enfoques

- **Crédito:** (a) el cobro llama a `admin_fijar_credito` y después vende:
  descartado, es solo del administrador y cambia la ficha (el dueño quiere que
  solo valga esa venta). (b) **`vender_a_credito` recibe los días de esta
  venta** (elegido): un parámetro más al final, una sola transacción, la ficha
  no se toca.
- **Rebaja en %:** (a) una regla nueva en la base: descartado, la base ya
  valida el piso de cada precio a mano. (b) **La pantalla pasa el % a precio**
  (elegido) y manda el precio a mano de siempre; `registrar_venta` sigue
  vigilando el mínimo. Sin SQL.

## El diseño

### Base (`esquema-credito-al-cobrar.sql`, #77)

- `vender_a_credito` gana `p_dias int default null` al final. Se borra la firma
  de 10; una sola, el navegador viejo sigue entrando.
- Con `p_dias`: entero ≥ 1 (si no, error claro), vence hoy en Venezuela más
  esos días, aunque la ficha no tenga crédito. Sin `p_dias`: como hoy (los días
  de la ficha, o el error de siempre).
- El tope de la ficha (`credito_tope_usd`) se aplica igual en los dos casos.
- Sigue de las dos caras (`es_personal()`). Anular y quitar una pieza de una
  venta a crédito sigue siendo del administrador.
- INSTALACION.md (#77), CLAUDE.md ("El crédito" y la firma), `verificar` si
  hace falta.

### Cobro del Mostrador

- **"A crédito"** sale siempre que haya clienta (de la lista o nueva), no con
  "sin cliente". Al tocarlo: un campo **"Días para pagar"**, que empieza en los
  días de su ficha si tiene, y debajo "paga hasta el …", lo que ya debe y lo que
  le queda de su tope (si tiene).
- **Clienta nueva**: al cobrar se guarda su ficha con `guardar_cliente` y luego
  se vende a crédito con ese id. Si guardar falla, no se vende y se dice.
- Lo demás del crédito (pago del día, aviso de vencidas, tope) como hoy.

### Rebaja en %

- **Por pieza**: el editor de la pieza lleva dos campos enlazados, **"Rebaja %"**
  y **"Cobras · Bs"**. Escribir uno actualiza el otro. Pista con el máximo que
  admite esa pieza.
- **A toda la venta**: sobre las líneas, **"Rebaja a toda la venta · %"** con
  "Aplicar" y "Quitar". Se aplica a cada pieza que admite rebaja y no tiene
  tramo, código ni descuento de clienta. Cada una baja ese % o hasta su mínimo,
  y la que llegó a su mínimo lo dice ("llegó a su mínimo: 10 %"). Una pieza que
  se cambia a mano después se queda con lo suyo.
- La cuenta va en `lib/dinero.ts` (precio desde la etiqueta en $ BCV menos el %,
  sin bajar del mínimo), y el carrito guarda el precio a mano de siempre.
- Con tramo, manda el tramo (el aviso de hoy ya lo dice).

## Lo que queda a quien lo construye

- Textos exactos de la pantalla, con la voz de Lux.
- Qué hace `guardar_cliente` con una cédula que ya existe (se mira y se respeta).
