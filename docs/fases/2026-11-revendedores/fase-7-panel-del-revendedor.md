# Fase 7 — El panel del revendedor, y Vender fácil

## Lo que pidió el dueño (18/11/2026)

> Mejorar la usabilidad y la forma en que tienen para vender dentro de su
> panel (creo que es el mostrador), porque es muy engorroso; debe ser más
> fácil. Para su panel también se ignoran las reglas de diseño de Lux.

## Cómo está hoy

- Panel en `/#/rv` (`Panel.tsx`) con el armazón de la tienda vestido de su
  paleta: Inicio, Pedidos (`ApartadosRv`), Vender (`VenderRv`), Clientes,
  Precios, Mi catálogo.
- **Vender** (`panel/VenderRv.tsx`, 305 líneas) es una sola página larga en
  tres bloques: "Piezas" (buscar y sumar), "Para quién" (cédula, nombre,
  apellido, teléfono, siempre) y "¿Ya te pagó?" (método, monto,
  referencia). Al final crea un pedido que **aparta de la tienda** y, si ya
  pagó, lo deja confirmado. Por eso pide tanto: cada venta es un pedido
  completo con todos los datos.

## Qué se hace

1. **Medir antes de cambiar**: contar toques y campos de una venta típica
   hoy (una pieza, clienta conocida, pagada) y ponerse una meta (p. ej. la
   mitad). Pedirle al dueño, o a JaduJoyas, cómo vende de verdad: ¿en
   persona, por WhatsApp, con la pieza en la mano?
2. **Vender en pasos cortos, con el total siempre visible**: piezas (con
   fotos grandes, un toque suma, y **lo de su inventario primero**, fase 5)
   → clienta (buscar entre las suyas; una nueva solo con nombre y teléfono
   si la base lo permite) → cobro (pagó todo / una parte / todavía no). Una
   barra fija abajo con el total y "Seguir".
3. **Venta de su inventario = un toque más**: si todas las piezas son
   suyas, no hay pedido a Lux ni plazos: se anota y listo (fase 5).
4. **El resto del panel** con el mismo lenguaje visual nuevo de la fase 6
   (su tema, su plantilla): Inicio dice lo urgente primero (qué le deben,
   qué debe a Lux y cuándo vence, lo que espera su confirmación). "Mi
   inventario" (fase 5) y "Mi catálogo" (colores, plantilla, logo, fase 6).
5. **Navegación de pulgar**: abajo en el teléfono, como la tienda (esa regla
   es de usabilidad, no de estética: se queda).
6. **La guía del revendedor** (`/guia-revendedor`, `GuiaRevendedorPiezas`)
   dice los nombres de los botones tal como salen: se actualiza con el
   panel, en el mismo commit (ya es regla en CLAUDE.md).

## Orquestación

- `superpowers:brainstorming` con el flujo dibujado (maqueta por paso).
- `disenio-web-pro`, `frontend-design`, `ui-ux-pro-max`; `break-ui` con una
  clienta sin cédula, 30 piezas en el carrito, sin conexión a medias.
- `webapp-testing` para recorrer una venta completa en el navegador.

## Decisiones abiertas (preguntar al empezar)

- ¿La cédula de su clienta sigue siendo obligatoria? Hoy sí; la tienda la
  usa para el maestro cuando Lux aprueba. Con una venta solo de su
  inventario quizás no hace falta.
- ¿Él puede vender sin internet y sincronizar después? Recomendación: no en
  esta fase.

## Archivos (orientativo)

- `src/paginas/revendedor/Panel.tsx` y `panel/*`, `estilos/revendedor.css`
  (o los estilos nuevos de la fase 6).
- Si alguna `rv_*` cambia lo que pide, parámetros nuevos **al final** y con
  valor por defecto.
- CLAUDE.md (árbol), la guía del revendedor.
