# Fase 3 — 20 % para revendedores y la clienta con descuento fijo

Fecha: 23/11/2026. Pedido del dueño del 18/11/2026; fase 3 de
`docs/fases/2026-11-revendedores/`. SQL **#70**, `esquema-descuento-clienta.sql`
(depende del #69).

## Por qué

JaduJoyas será revendedora y es clienta especial: 20 % fijo, compre como
revendedora o en la tienda. Y el dueño baja a todos los revendedores del 25 %
al 20 %. Se aplica sobre la etiqueta, nunca por debajo del piso de margen
(decidido el 18/11): Lux gana en cada pieza.

## Lo que decidió el dueño (23/11/2026)

1. **20 % para todos los revendedores.** El general pasa de 25 a 20; a uno en
   particular se le puede poner menos, **nunca más que el general**.
2. **Un revendedor con un % propio mayor que el general se baja ya** al correr
   el SQL. Los pedidos ya confirmados conservan sus precios congelados.
3. **La clienta con descuento fijo lo recibe en la venta y en el apartado del
   mostrador.** No en el catálogo en línea (cualquiera que sepa su cédula se lo
   llevaría).
4. **La vendedora lo ve**: al elegir la clienta sale "Clienta con 20 %" y cada
   pieza con su precio rebajado. No ve el piso.

## Mis decisiones (para corregir)

- **Cualquier clienta que el dueño marque**, no un nombre en el código:
  `clientes.descuento_pct`.
- **El tope de un revendedor es el general, no un 20 escrito en el código**
  (regla 4): si el dueño cambia el general, el tope cambia con él.
  `rv_descuento_de` devuelve `least(propio, general)`, así nadie pasa del
  general aunque el dueño lo baje después.
- **Al bajar a un revendedor, su % propio queda vacío** (sigue el general,
  20 %), en vez de escribirle un 20 propio.
- **El descuento llega cuando se elige SU ficha** en el mostrador (por
  `p_cliente_id`). Si la vendedora la escribe como ficha nueva con su cédula,
  no hay descuento: así el carrito y la base dicen siempre lo mismo.
- **Funciona como el tramo**: se aplica a cada pieza (los dijes también),
  nunca por debajo de `piso_margen_de`, y con él el precio a mano se ignora.
  Con tramo o código, manda el mayor de los tres; no se suman.
- **El revendedor se enlaza con su ficha de clienta** en Revendedores
  (`revendedores.cliente_id`). En esta fase solo se enlaza y se enseña en los
  dos lados; lo usan las fases 4 y 5. Su descuento de clienta se pone en su
  ficha, aparte (son dos cifras distintas aunque hoy valgan lo mismo).

## Cómo se construye (el camino elegido)

Hay una sola forma sensata. El precio de cada línea ya sale de
`partes_de_linea` → `precio_de_linea`, que con un % aplica "la etiqueta menos
el %, nunca bajo el piso de margen", la misma cuenta que `rv_precio_lux` y que
el carrito repite con `precioConTramo` y `piso_tramo_usd`. Así que
`registrar_venta` y `apartar_en_tienda` le pasan **el mayor entre el tramo de
la línea y el % de la clienta**, y si ganó el de la clienta cambian el motivo
de `'tramo'` a `'cliente'`.

Descartadas: llamar a `rv_precio_lux` como una tercera rama (repetiría la
regla de tramo contra oferta y redondea al centavo hacia arriba, distinto del
carrito); cambiar la firma de `precio_de_linea` (la llaman cinco funciones).

## La base (#70)

- `configuracion.revendedor_descuento_pct` = 20.
- Los revendedores con un propio mayor que el general → null; el `.sql` los
  lista al final.
- Disparador `revendedor_descuento_tope` en `revendedores`: no deja guardar un
  propio mayor que el general ("No puede pasar del general, 20 %").
- `rv_descuento_de` = `least(coalesce(propio, general), general)`.
- `revendedores.cliente_id` → `clientes` (único). `admin_enlazar_cliente_revendedor
  (revendedor, cliente)`, null para soltarlo. `v_revendedores` gana al final
  `cliente_id` y `cliente_nombre`.
- `clientes.descuento_pct` (null o entre 0 y 100, sin los extremos). Solo lo
  escribe `admin_descuento_cliente(cliente, pct)`; la tabla ya no tiene permiso
  de escritura para nadie con sesión. `v_clientes` gana al final
  `descuento_pct` y `es_revendedor` (el nombre del revendedor que ES esa
  clienta; `revendedor` sigue diciendo de quién es clienta).
- `registrar_venta` y `apartar_en_tienda`: misma firma, con la regla de arriba.
- `motivo_rebaja` de `venta_items` y `motivo_sin_oferta` de `venta_items` y
  `reserva_items` aceptan `'cliente'`. `v_rebajas` lo enseña sin cambiar.
- `admin_fusionar_clientes` lleva también el enlace del revendedor y, si la
  que se queda no tiene descuento, el de la que se va.

## El navegador

- **Mostrador** (`useCarrito`, `Mostrador.tsx`): al elegir una ficha se lee su
  `descuento_pct` aparte (sin el #70, null y todo como hoy). Arriba del cobro,
  "Clienta con 20 % de descuento"; en cada línea, el precio fijo con "descuento
  de clienta". Mismo orden que la base.
- **Ficha de la clienta** (`Clientes.tsx`): el administrador pone o quita su
  descuento fijo; la vendedora lo ve escrito. Si es revendedora, lo dice.
- **Revendedores**: el % propio no pasa del general (lo dice antes de guardar),
  y cada revendedor se enlaza con su ficha de clienta (buscar y elegir).
- **Reportes**: el motivo `cliente` como "Clienta con descuento".

## Seguridad

- `clientes.descuento_pct` y el enlace, solo por funciones `admin_*`.
- Ninguna respuesta nueva a la vendedora o al revendedor trae el piso.
- `verificar`: la vendedora no puede llamar `admin_descuento_cliente` ni
  `admin_enlazar_cliente_revendedor`; sin sesión, `v_clientes` no responde;
  `margen_minimo_pct` sigue fuera de las claves legibles.

## No entra

Crédito (fase 4), inventario del revendedor (fase 5), el descuento en el
catálogo en línea, y la "Caja de terciopelo" que pierde vendida (decisión
aparte del dueño).

## Prueba

PGlite con la instalación entera: una venta a una clienta del 20 % sin tramo,
con tramo menor y mayor, con código mayor, un dije sin base, apartado en
tienda, la vendedora sin poder fijarlo, el tope del revendedor, y el `.sql`
corrido dos veces.
