# Fase 5 — El inventario propio del revendedor (diseño)

23/11/2026. Fase 5 de `docs/fases/2026-11-revendedores/`. SQL **#72**,
`esquema-inventario-revendedor.sql`. Depende del #71.

## Por qué

El dueño, 18/11/2026: "Si alguien, incluso ella, nos compra y había una sola
unidad de esa en nuestro inventario, se le desaparece a ella, lo cual es
ilógico porque nos compró para vender en su negocio. Esas prendas en crédito
o compradas a nosotros tienen que estar disponibles con sus unidades en su
catálogo."

Hoy el catálogo del revendedor (`rv_catalogo_publico`) enseña solo lo libre
de la tienda. Lo que él ya compró no existe para el sistema.

## Lo que decidió el dueño (23/11/2026)

1. **Se elige en cada venta.** Al elegir en el mostrador la ficha de una
   clienta que es revendedor, el cobro trae marcado "Para su inventario"; la
   vendedora lo desmarca si es para ella misma. Vale en "Pagó todo", "Dejar
   por verificar" y "A crédito".
2. **Cuenta para la meta de la vendedora** y para "Mi día": la vendió una
   vendedora en el local. Por eso esa venta **no** lleva
   `ventas.revendedor_id` (esa columna la saca de la meta); lleva una
   columna nueva.
3. **Él corrige su inventario en las dos direcciones**, con un motivo, y
   queda anotado.
4. **Se devuelve con el "Devolver" de siempre** (la nota de crédito de la
   ficha). La pieza sale de su inventario y vuelve a la tienda, solo si
   todavía la tiene libre.

## Lo que decidí yo (el dueño puede corregirlo)

- **El pedido de su clienta toma primero de lo suyo**, que ya pagó; lo que
  falte, de la tienda.
- **Precio de sus piezas propias:** el mismo de Precios
  (`revendedor_precios`), con el mismo mínimo (etiqueta +
  `revendedor_sobre_etiqueta_usd`). Una pieza suya sale en su catálogo
  aunque la tienda ya no la tenga, aunque el piso no deje rebaja para lo de
  la tienda, y aunque la tienda la haya retirado.
- **Pausado**, su inventario se queda guardado; su catálogo se apaga como
  hoy.
- **No entra por el apartado del mostrador** ("Lo aparta"): solo por una
  venta. Lo que él aparta en la tienda se lo lleva al entregarse; si lo
  quiere en su inventario, se le vende.
- **Las piezas de los pedidos de sus clientas que Lux aprueba no entran**:
  ya tienen dueña (como dice el plan de la fase).
- El administrador **ve** el inventario de cada revendedor (Revendedores y
  Crédito); no lo corrige desde su pantalla. Si hiciera falta, el
  revendedor lo corrige en su panel.

## Enfoques

**A. Lo que tiene sale de los hechos que ya existen (elegido).** Su
inventario no se guarda como un número ni como una copia: se calcula.

    tiene = lo que se le vendió para su inventario (líneas de ventas sin
            anular, notas de crédito en negativo)
          + sus ajustes a mano (tabla nueva)
          − lo que vendió de lo suyo (líneas de sus pedidos ya cerrados)
    apartadas = lo suyo en sus pedidos abiertos que no han vencido
    libre = tiene − apartadas

Si la tienda anula una venta, le quita una pieza o le devuelve una, su
inventario cambia solo, sin que nadie recuerde corregirlo. Es la regla de
la casa: una cifra, un sitio.

**B. Un libro donde se escribe cada movimiento.** Cada función que vende,
anula, quita, devuelve o cierra un pedido escribe su fila. Son siete
funciones grandes que habría que reescribir, y cada una que se olvide deja
el libro mal sin un error (la trampa de "una fórmula copiada").

**C. Partir el pedido de su clienta en dos pedidos** (uno de lo suyo y otro
de la tienda). La clienta vería dos enlaces y dos pagos por una compra.
Descartado: se parte por línea dentro del mismo pedido.

## El diseño

### Base de datos (#72)

**`ventas.inventario_de`** (revendedor, null: no). La pone una función de
la venta, nunca el navegador a mano. Un disparador exige que la ficha de la
venta sea la de ese revendedor (`revendedores.cliente_id = ventas.cliente_id`).
Una nota de crédito no la lleva: se mira la de la venta que devuelve.

**`revendedor_ajustes`** (revendedor, pieza, cantidad con signo, motivo
obligatorio, cuándo, quién: `revendedor` o `tienda`). Revocada a todos;
nunca se borra (`historico_no_se_borra`). Entra al respaldo.

**`apartado_items.de_su_inventario boolean not null default false`.** Una
línea dice de dónde salen sus unidades. Si una pieza sale en parte de lo
suyo y en parte de la tienda, son dos líneas. Una línea de lo suyo guarda
`precio_lux_usd = 0` (un `check` lo exige): **no le debe nada a Lux**, y
así todas las cuentas que ya suman `precio_lux_usd × cantidad` (lo que le
paga a Lux, su tope, su nivel, Revendedores) dan bien sin tocarlas.

**Las cuentas del inventario** (revocadas a todos, una regla cada una):
`rv_inventario(revendedor)` → por pieza: `compradas`, `ajustes`,
`vendidas`, `apartadas`, `tiene`, `libre`. La leen el catálogo, el pedido,
su panel, la vista del dueño y los disparadores.

**Funciones que cambian:**

| Función | Cambio |
|---|---|
| `vender_para_inventario(...)` (nueva, de las dos caras) | Los mismos argumentos que el mostrador manda a `registrar_venta` para cobrar; la llama tal cual y le pone `inventario_de`. Solo con la ficha de un revendedor. |
| `vender_a_credito` | Gana `p_para_inventario boolean default false` al final (se borra la firma de 9 y queda una sola; el navegador viejo sigue funcionando). |
| `rv_crear_apartado` | Por pieza: primero de lo suyo libre (sumado por pieza, con el candado de su fila que ya toma), lo demás de lo libre de la tienda. La pieza solo tiene que estar "en su catálogo" (que el piso deje rebaja) si algo sale de la tienda. El tope cuenta solo lo de la tienda. |
| `rv_confirmar_de` | Si el pedido no trae nada de la tienda, al confirmar **se cierra**: `retirado`, entregado (ya lo tiene él), sin venta de Lux. |
| `apartadas_de` | No cuenta las líneas de lo suyo (no apartan nada en la tienda). |
| `aprobar_apartado` | La venta de Lux lleva solo las líneas de la tienda. |
| `v_apartados_revendedor` | Las piezas y totales, solo lo de la tienda (mismas columnas). |
| `rv_catalogo_publico` | Suma lo suyo libre a lo libre de la tienda. Misma firma y mismas columnas: su clienta no sabe de dónde sale cada unidad. |
| `rv_piezas` | `disponible` = lo de la tienda + lo suyo; al final `mias` (lo suyo libre). Incluye sus piezas aunque la tienda no las tenga. |
| `rv_fijar_precios` | Acepta piezas que él tiene aunque no estén en lo libre de la tienda. |
| `rv_resumen` | La ganancia del mes no cuenta las líneas de lo suyo (no se sabe lo que pagó por cada unidad); las piezas y lo vendido, sí. |
| `rv_apartados` | Cada línea dice `de_su_inventario`. |

**Nuevas con testigo:** `rv_mi_inventario(sesion)` (cada pieza que tiene o
tuvo: foto, nombre, tiene, apartadas, libre, su precio, y lo último que se
movió) y `rv_ajustar_inventario(sesion, pieza, cantidad, motivo)` (con
signo; nunca deja `tiene` por debajo de lo apartado ni de cero; motivo
obligatorio; tope de 999 por ajuste).

**Del administrador:** `v_inventario_revendedores` (por revendedor y pieza:
tiene, apartadas, libre; `es_admin()`), para Revendedores y Crédito.

**Los guardias** (disparadores, sin reescribir las funciones de siempre):
anular una venta para su inventario, quitarle una pieza o devolverla
(nota de crédito) solo si él todavía la tiene **libre**; si no, el error
dice cuántas le quedan. Así nunca queda debiendo piezas.

### Navegador

- **Mostrador** (`useCarrito`, el cobro): con la ficha de un revendedor
  elegida, "Para su inventario" marcado. Pagó todo / Dejar por verificar →
  `vender_para_inventario`; A crédito → `vender_a_credito(..., true)`. Sin
  el #72, la casilla no sale.
- **Panel del revendedor:** pantalla nueva **"Mi inventario"** (lista con
  foto, cuántas tiene, cuántas en pedidos, "Corregir" con más/menos y el
  motivo). Vender y Precios ven sus piezas propias. En Pedidos, la línea de
  lo suyo dice "De tu inventario" y no suma a "Pagar a Lux". Diseño
  funcional: la fase 7 rehace el panel.
- **Catálogo del revendedor:** sin cambios de pantalla (lo cambia la base).
- **Revendedores** (admin): "En su inventario: N piezas", y la lista al
  abrirlo. **Crédito:** a la clienta que es revendedor, la misma línea.
- **Guía del revendedor** y CLAUDE.md, INSTALACION.md, `verificar`.

## Lo que no se toca

- Nada del inventario de Lux: lo del revendedor no está en `existencias`,
  así que el conteo, `v_valor_inventario`, el cierre y las metas no lo ven.
- El revendedor sigue sin sesión de Supabase.
- Su clienta no ve de dónde sale cada pieza ni cuántas son de él.

## Seguridad

- Toda función nueva con testigo empieza por `rv_de_sesion`. Ningún
  revendedor ve ni toca el inventario de otro.
- Un pedido sin sesión no saca de lo suyo más de lo que tiene libre, sumado
  por pieza, con el candado de su fila (el mismo del tope).
- Lo que devuelve su catálogo sigue sin un costo, un piso ni lo que paga a
  Lux. `verificar` vigila la tabla nueva, las funciones y que el catálogo no
  suelte una columna más.
- Revisión de seguridad de lo que se abre sin sesión o al revendedor
  (`rv_crear_apartado`, `rv_catalogo_publico`, `rv_ajustar_inventario`).

## Lo que queda al constructor

Los textos exactos, la forma de "Mi inventario" (funcional), y el orden de
las tareas. Probado en PGlite con la instalación entera, con las cifras
esperadas en la cabecera del #72.
