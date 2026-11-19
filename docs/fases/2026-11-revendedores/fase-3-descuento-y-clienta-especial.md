# Fase 3 — 20 % para revendedores y la clienta con descuento fijo

## Lo que pidió el dueño (18/11/2026)

- Todos los revendedores, y todo lo que diga "revendedor", a **20 % de
  descuento máximo** (hoy `revendedor_descuento_pct` = 25).
- JaduJoyas tiene **20 % fijo**, sea como revendedora (su catálogo, su panel)
  o comprando en la tienda (mostrador).
- Preguntó: ¿el 20 % es sobre la ganancia o sobre el total?

## Sobre qué se aplica hoy: sobre el TOTAL (la etiqueta), con un piso

`rv_precio_lux(modelo, %)` (`esquema-revendedores.sql`) hace:

```
lo que paga el revendedor = la etiqueta − el %, nunca por debajo de piso_margen_de
```

`piso_margen_de` es el precio que todavía deja el margen mínimo, con la
mercancía a la brecha, el flete, la merma, el empaque y lo de tienda. Así
que en una pieza con margen holgado el revendedor recibe el % entero; en una
apretada recibe menos, y si el piso no deja ninguna rebaja, la pieza no sale
en su catálogo. Por eso "máximo" es la palabra justa.

Ejemplo, **con cifras de ejemplo, no de la tienda**: etiqueta $20 BCV, la
pieza le cuesta a Lux $10 BCV con todo.

| | Paga el revendedor | Le queda a Lux |
|---|---|---|
| Sin descuento | $20 | $10 |
| 20 % sobre el total (lo de hoy) | $16 | $6 |
| 20 % sobre la ganancia | $18 | $8 |

Sobre el total es lo que un revendedor entiende por "20 % de descuento" y
lo que dice la guía. Sobre la ganancia sería un descuento distinto en cada
pieza (y para calcularlo habría que enseñarle cuánto gana Lux, que no se
hace). **Decidido por el dueño el 18/11/2026: sobre el total, con el piso,
como hoy.**

Preguntó también si con el 20 % hay alguna pieza en la que Lux no gane. Por
construcción, no: lo que paga el revendedor nunca baja de `piso_margen_de`,
que deja el `margen_minimo_pct`. Las piezas donde el 20 % entero se comería
ese margen reciben menos del 20 %, y aquellas donde no cabe ninguna rebaja
no salen en su catálogo. Dos salvedades: si `margen_minimo_pct` fuera 0, el
piso sería el costo y esas piezas dejarían 0; y el costo lleva lo de tienda
repartido entre la meta de piezas del mes, así que en un mes que se venda
menos de la meta la ganancia real de esas piezas es más fina. Con los datos
de verdad se comprueba con esta consulta (solo lee; SQL Editor):

```sql
with p as (
  select m.sku, m.nombre,
         coalesce(m.precio_override_usd, g.precio_usd) as etiqueta,
         costo_bcv_pieza(m.costo_puesto_usd, coalesce(m.armado = 'dije', false)) as costo,
         rv_precio_lux(m.id, 20) as paga
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
   where m.activo
)
select count(*)                                                          as piezas,
       count(*) filter (where paga <= ceil(etiqueta * 0.8 * 100) / 100)  as con_el_20_entero,
       count(*) filter (where paga >  ceil(etiqueta * 0.8 * 100) / 100
                          and paga < etiqueta)                           as con_menos_del_20,
       count(*) filter (where paga >= etiqueta)                          as sin_rebaja_no_salen,
       count(*) filter (where paga - costo <= 0)                         as sin_ganancia,
       min(round((paga - costo) / nullif(paga, 0) * 100, 1))             as margen_mas_bajo_pct,
       (select valor from configuracion where clave = 'margen_minimo_pct') as margen_minimo_pct
  from p
 where etiqueta is not null;
```

**Resultado del 18/11/2026** (margen mínimo 25 %): 489 piezas activas; 414
con el 20 % entero, 74 con menos, 1 sin rebaja (no sale en su catálogo) y
**1 sin ganancia, con margen −5,3 %**. Casi seguro es la misma pieza: su
etiqueta ya está por debajo de su costo, así que pierde también vendida en
la tienda. No es cosa del descuento. Es **OTR-SG-001, Caja de terciopelo**:
precio propio $6, costo $6,32 BCV. Casi todo ese costo es lo de tienda (una
parte del alquiler y los sueldos, como cualquier joya), no la caja. Queda en
manos del dueño: dejarla así, subirle el precio, o (más adelante) un tipo
"complemento" que no cargue lo de tienda, como el dije.

## Qué se hace

1. **El general a 20 %**: `revendedor_descuento_pct` = 20 en
   `configuracion`, y un tope: `revendedores.descuento_pct` (el propio de
   cada uno) no puede pasar del 20 % (check, más el formulario de
   Revendedores). Hay que ver qué revendedores tienen hoy uno propio mayor
   y qué pasa con ellos (preguntar). Los pedidos ya confirmados conservan
   sus precios congelados (`apartado_items`): no se tocan.
2. **El revendedor es también una clienta del maestro**:
   `revendedores.cliente_id` → `clientes`. Para JaduJoyas, se enlaza con su
   ficha (o se crea). Sus compras en la tienda salen en su ficha.
3. **La clienta con descuento fijo**: `clientes.descuento_pct` (null: sin
   descuento). La pone el administrador en la ficha de la clienta, no la
   vendedora. En el mostrador, al elegir esa clienta, cada pieza sale a la
   etiqueta menos ese %, nunca por debajo de `piso_margen_de` (la misma
   cuenta que `rv_precio_lux`: llamarla, no copiarla). Lo aplica
   **`registrar_venta`**, no el navegador: la vendedora no puede regalar el
   descuento a otra clienta, y un descuento mayor que
   `descuento_max_mostrador_pct` pasa porque lo autorizó el dueño en la ficha.
   La línea guarda `motivo_rebaja = 'cliente'` (nuevo valor) y `v_rebajas` lo
   enseña.
4. **Con el tramo y con un código de oferta**: no se suman. Manda el mayor
   de los tres, como ya hacen tramo y oferta (`partes_de_linea`).
5. **La guía y los textos**: `rv_programa()` ya lee el % de `configuracion`;
   revisar textos de la guía, de PRODUCT.md y de la skill `lux-by-emory`
   que digan 25 %.

## Decisiones abiertas (preguntar al empezar)

- ¿El 20 % es el descuento de todos o el tope de todos, con la mayoría en
  menos? (Hoy el general es uno solo, 25 %.)
- ¿Revendedores que hoy tienen un % propio mayor del 20 %? ¿Se bajan ya?
- ¿El descuento de clienta lo puede ver la vendedora en el mostrador?
  Recomendación: sí, "Clienta con 20 %", sin el piso.
- ¿Solo JaduJoyas o cualquier clienta que el dueño marque? Recomendación:
  cualquiera que él marque; es un campo, no un nombre escrito en el código.

## Seguridad

- `clientes.descuento_pct` solo lo escribe una función `admin_*`.
- Ninguna respuesta a la vendedora ni a un revendedor dice el piso.
- `verificar`: sumar que `margen_minimo_pct` sigue fuera de las claves
  legibles y que la vendedora no puede fijar el descuento de una clienta.

## Archivos (orientativo)

- SQL #69 (nombre a decidir, p. ej. `esquema-descuento-clienta.sql`).
- `src/paginas/venta/Mostrador.tsx`, el carrito (`useCarrito`), la ficha de
  `Clientes.tsx`, `admin/Revendedores.tsx`, `lib/dinero.ts` (si el carrito
  enseña el precio con descuento, con la misma regla que la base: mejor
  preguntarle a la base, como `cotizar_pedido`).
- CLAUDE.md (reglas: revendedores, clientes, motivos de rebaja),
  INSTALACION.md, PRODUCT.md.
