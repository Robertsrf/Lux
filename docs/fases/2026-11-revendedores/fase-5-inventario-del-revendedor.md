# Fase 5 — El inventario propio del revendedor

## Lo que pidió el dueño (18/11/2026)

> Si alguien, incluso ella, nos compra y había una sola unidad de esa en
> nuestro inventario, se le desaparece a ella, lo cual es ilógico porque nos
> compró para vender en su negocio. Esas prendas en crédito o compradas a
> nosotros tienen que estar disponibles con sus unidades en su catálogo.

## Cómo está hoy

El catálogo del revendedor (`rv_catalogo_publico`, último en
`esquema-dama-caballero-revendedor.sql`) enseña **lo libre de la tienda** a
su precio. No sabe nada de lo que el revendedor ya compró: si compra la
última, la tienda queda en 0 y la pieza sale de los dos catálogos. Lo que
el revendedor tiene en la mano no existe para el sistema.

## La idea

El revendedor tiene **su propio inventario**, aparte del de Lux. Entra
cuando Lux le vende piezas **para su inventario** (de contado o a crédito,
fase 4) y sale cuando él las vende. Su catálogo enseña la suma: lo libre de
Lux más lo suyo.

1. **Un libro, no un número**: `revendedor_movimientos` (revendedor, pieza,
   cantidad con signo, por qué: `compra`, `venta`, `ajuste`; la venta de
   Lux de donde vino; quién y cuándo). Lo que tiene sale de la suma
   (`v_revendedor_existencias` o una función). Revocada a todos, como lo
   demás del revendedor. Nunca se borra.
2. **Cómo entra**: al registrar en la tienda una venta a un revendedor
   marcada "para su inventario" (en el mostrador, al elegir una clienta que
   es revendedor, o una pantalla del administrador). Esa venta lleva
   `revendedor_id` y su descuento (fase 3). **No** entran las piezas de los
   pedidos de sus clientas que Lux aprueba (`aprobar_apartado`): esas ya
   tienen dueña.
3. **Su catálogo**: `rv_catalogo_publico` suma lo suyo a lo libre de la
   tienda. Una pieza que la tienda ya no tiene sigue saliendo si él tiene.
   Su clienta no ve de dónde sale cada unidad.
4. **Cuando su clienta pide**: el pedido se parte por línea. Lo que sale de
   **su inventario** (primero, porque ya lo pagó; confirmar) no aparta nada
   en Lux, no le debe nada a Lux y no pasa por la aprobación de la tienda:
   es venta suya, y al entregarla él, sale de su libro. Lo que sale **de la
   tienda** sigue el camino de hoy (aparta, paga a Lux, la tienda aprueba).
5. **En su panel**: "Mi inventario", lo que tiene de cada pieza, con foto, y
   un ajuste a mano ("vendí 1 en persona", "se dañó") que queda en el libro
   con su motivo.
6. **Para el dueño**: en Revendedores y en Crédito, lo que cada uno tiene en
   la mano. Es mercancía ya vendida: **no cuenta** en el inventario de Lux,
   en el conteo, en `v_valor_inventario` ni en las metas.

## Decisiones abiertas (preguntar al empezar)

- ¿Toda compra de un revendedor va a su inventario, o se elige en cada
  venta? (¿Puede comprar algo para ella misma?) Recomendación: se elige,
  con "para su inventario" marcado por defecto si la clienta es revendedor.
- Si una pieza está en su inventario y en la tienda, ¿de cuál sale primero
  el pedido de su clienta? Recomendación: del suyo.
- ¿Se le puede devolver a Lux algo de su inventario? (Cruza con
  `admin_devolver_pieza`.)
- Si deja de ser revendedor, ¿qué pasa con su inventario?
- ¿Qué precio le pone a sus piezas propias? Recomendación: el mismo que ya
  fija en PreciosRv (`revendedor_precios`), con el mismo mínimo.

## Seguridad

- Toda función nueva empieza por `rv_de_sesion(p_sesion)`; las de su
  catálogo, sin testigo, no devuelven nada de su libro más que cuántas hay
  (y quizás ni eso: "disponible" como hoy).
- Ningún revendedor ve el inventario de otro.
- Revisión de seguridad con el agente `backend-security-coder`: un pedido
  sin sesión no puede sacar más de lo que él tiene (sumado por pieza, como
  `crear_reserva` desde el #60).
- `verificar` vigila la nueva tabla y las funciones.

## Archivos (orientativo)

- SQL #71 (p. ej. `esquema-inventario-revendedor.sql`):
  `revendedor_movimientos`, cambios en `rv_catalogo_publico` (borrar y crear
  en una transacción si cambia lo que devuelve, como el #68), `rv_apartar`,
  `rv_vender`, `rv_confirmar`; `rv_mi_inventario`, `rv_ajustar_inventario`;
  la marca en la venta de la tienda. Amplía el respaldo.
- `CatalogoRevendedor.tsx`, `panel/VenderRv.tsx`, una pantalla nueva en
  `panel/`, `Mostrador.tsx`, `admin/Revendedores.tsx`.
- CLAUDE.md ("Los revendedores", tablas, funciones), INSTALACION.md,
  la guía del revendedor (`GuiaRevendedorPiezas`, dice cómo funciona).
