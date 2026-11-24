# Fase 7 — El panel del revendedor, y Vender fácil

Diseño del 24/11/2026. Plan por fases en `docs/fases/2026-11-revendedores/`
(fase 7). Pedido del dueño del 18/11/2026: "mejorar la usabilidad y la forma
en que tienen para vender dentro de su panel, porque es muy engorroso; debe
ser más fácil. Para su panel también se ignoran las reglas de diseño de Lux."

## Por qué

Vender (`panel/VenderRv.tsx`) es una página larga en tres bloques y la base
exige siempre cédula, nombre, apellido y teléfono. Medido hoy, una venta
típica (una pieza, clienta conocida, ya pagada) pide **4 campos escritos**
(buscar, cédula, monto, referencia) y **unos 6 toques**; con una clienta
nueva, **7 campos**. El revendedor vende **por WhatsApp y en persona por
igual** (dueño, 24/11): en persona con la pieza en la mano, todo eso es
demasiado.

**Meta:** la venta típica en **0–1 campos y unos 4 toques**; con una clienta
nueva, 2 campos más (nombre y teléfono).

## Lo decidido por el dueño (24/11/2026)

1. **Sirve a los dos casos**, WhatsApp y en persona, sin alargar ninguno.
2. **La cédula de su clienta nunca es obligatoria** al vender desde el panel.
3. **Lo mínimo de una clienta nueva: nombre y teléfono.** Apellido y cédula,
   opcionales.
4. **El panel entero se viste con el tema de su catálogo** (fase 6): sus
   colores, su letra de títulos y sus esquinas, medidos a 4,5:1 con
   `tema.ts`. Las seis paletas dejan de vestir el panel (siguen siendo lo que
   da el tema a quien no tiene uno, como en su catálogo).
5. **Camino A**: Vender en tres pasos con una barra fija abajo.

## Enfoques considerados

- **A. Tres pasos con barra fija (elegido).** Piezas → Clienta → Cobro, el
  total siempre a la vista. Cada paso cabe en una pantalla de teléfono y
  solo pregunta lo suyo.
- **B. Una página compacta con secciones plegables.** Menos cambio, pero en
  el teléfono sigue siendo larga y el botón final queda lejos.
- **C. Como su catálogo** (sus tarjetas y el cobro en una hoja). Bonito, pero
  sus tarjetas no dicen lo que le paga a Lux ni qué es suyo, y mezcla lo que
  ve la clienta con lo que ve él.

## No-metas

- **Sin vender fuera de línea** (mi decisión, recomendada en el plan): pide
  cola y conflictos de existencia. Si la red falla, se dice y no se pierde el
  carrito.
- **El catálogo de su clienta sigue pidiendo cédula** (`rv_apartar`): ahí la
  cédula es la forma de reconocerla sin sesión (`rv_buscar_cliente`).
- No cambian las reglas de dinero: plazos, tope, 40 %, lo que le paga a Lux,
  lo suyo primero (#72).
- Pedidos, Mi inventario, Clientas, Mis precios y Mi catálogo **no se
  rehacen**: cambian de ropa (el tema) y nada más.

## Anti-metas (sería un fracaso aunque funcione)

- Que el revendedor o su clienta vean un costo de Lux o el piso: lo que le
  paga a Lux sí lo ve, como hoy, y solo en piezas de su catálogo de la tienda
  (Trampas de CLAUDE.md, #72).
- Un color que no se lea a 4,5:1 en un teléfono de gama baja.
- Que la navegación suba a una hamburguesa: queda abajo en el teléfono.

---

## Vender, paso a paso

Un solo componente con el carrito en su estado; los pasos son vistas, no
rutas (atrás del teléfono, ver "Detalles"). Arriba, los tres pasos
numerados y tocables hacia atrás. **Abajo, una barra fija** con piezas,
total en $ BCV y Bs, y el botón del paso ("Seguir" / "Cobrar" / "Hacer el
pedido"). La barra respeta el área segura del teléfono y no tapa la
navegación del panel (va encima de ella).

```
┌────────────────────────────┐
│ ① Piezas · ② Clienta · ③ Cobro │
│ [Buscar........] Tuyas│Todas│
│ ┌────┐ ┌────┐              │
│ │foto│ │foto│  ● 2 tuyas    │
│ └────┘ └────┘              │
├────────────────────────────┤
│ 2 piezas  $24,00 · Bs 1.104 │
│                [ Seguir → ] │
└────────────────────────────┘
```

### ① Piezas

- Cuadrícula de fotos grandes (2 columnas en el teléfono, más en
  escritorio). **Un toque suma una**; con la pieza en el carrito, la tarjeta
  enseña un contador (− n +). Nunca un botón dentro de otro (`<article>` con
  botones hermanos, como los catálogos).
- **Lo suyo primero**: las piezas con `mias > 0` van arriba con una marca
  "Tuyas: 2". Un selector "Tuyas · Todas" filtra (empieza en "Todas" si no
  tiene inventario; en "Tuyas" si lo tiene — mi decisión: en persona vende
  lo que lleva encima).
- Cada tarjeta: foto, nombre con su medida, **a tu clienta** (su precio,
  grande) y, en pequeño, "te sale" (lo que le paga a Lux, solo si
  `precio_lux_usd` no es null) y cuántas hay libres.
- Buscar siempre arriba, en el mismo sitio. Muchas piezas: de a 60 con
  "Ver más" (hoy corta en 60 sin decirlo).
- Las medidas: una tarjeta por modelo, como hoy (cada medida es una línea de
  `rv_piezas`). Agrupar por familia queda al constructor si cabe sin una
  hoja nueva; si no, como hoy.

### ② Clienta

- **Buscar entre las suyas** por nombre, teléfono o cédula (las trae
  `rv_clientes`, ya en el navegador). Un toque la elige y enseña su tarjeta
  (nombre, teléfono) con "Cambiar".
- **"Clienta nueva"**: **nombre y teléfono**; "Más datos" despliega apellido
  y cédula, opcionales. Si el teléfono o la cédula escritos ya son de una
  suya, se le dice ("Es María G., ¿es ella?") y la elige con un toque.
- Si la clienta elegida no tiene teléfono válido, se pide (es lo mínimo).

### ③ Cobro

Tres botones grandes:

- **Pagó todo** → elige cómo (fichas: Pago móvil, Efectivo $, Efectivo Bs,
  Transferencia, Binance, Zelle…, la lista de `METODOS_PAGO`). **El monto ya
  está puesto** con lo que cubre el total en la moneda del método (Bs con la
  tasa BCV; en dólares, Bs entre la tasa Binance, la cuenta de siempre) y se
  puede cambiar. La referencia solo si el método la pide (`PIDE_REFERENCIA`).
- **Una parte** → solo si él da crédito (`dias_credito`): monto, con el
  mínimo dicho ("al menos $X, hoy Bs Y") y cuánto quedará debiendo y en
  cuántos días.
- **Todavía no** → "Sus piezas quedan apartadas N horas. Le mandas su enlace
  y ahí ve cómo pagarte."

Antes del botón, una línea con lo que pasará: "Le pagas a Lux $X · ganas
$Y" (como hoy), o "Todas son tuyas: no le debes nada a Lux".

### Listo

Una pantalla de cierre en vez del aviso de arriba de hoy:

- **Toda de su inventario y pagada**: "Venta anotada." (el pedido se cierra
  solo al confirmar, #72).
- **Pagada con piezas de la tienda**: "Confirmado: págale a Lux $X antes del
  [hora]" con "Pagarle a Lux" (a Pedidos).
- **Sin pagar o a medias**: "Mandarle su enlace por WhatsApp" (con su
  teléfono) y "Copiar enlace".
- Siempre: "Vender otra" (carrito vacío, paso ①).

### Detalles

- **Atrás del teléfono** vuelve un paso, no sale del panel: cada paso empuja
  un estado al historial (`?paso=2` en la ruta con `replace` donde toque).
  Mi decisión; el constructor puede elegir el mecanismo.
- **El carrito sobrevive** a cambiar de pantalla del panel y a recargar:
  `sessionStorage` (`lux-rv-vender-v1`), con try/catch; si una pieza ya no
  está, se quita y se dice.
- **Si falla la red** al hacer el pedido: el error en palabras, todo lo
  escrito se queda, "Intentar otra vez".
- **Doble toque** en "Hacer el pedido": el botón se apaga mientras guarda.

---

## Inicio: lo urgente primero

Arriba, **tarjetas de lo que espera algo de él**, cada una con su botón y
solo si aplica, en este orden:

1. Pagos de clientas por confirmar (N) → Pedidos.
2. Lo que debe a Lux y **cuándo vence el más próximo** → Pedidos.
3. Aprobados por retirar en la tienda (N) → Pedidos.
4. **Te deben** $X (hoy Bs Y) → "Cargar lo que te pagan".

Debajo, un botón grande **"Vender"** y "Mandar mi catálogo". Después lo de
hoy, sin cambiar sus cifras: ganancia del mes, su tope, sus meses y "Cómo
funciona". Si la fecha de vencimiento más próxima a Lux no viene en
`rv_resumen`, se agrega (ver Base).

## El panel vestido con su tema

- `rv_resumen` devuelve también `tema` (ver Base); el panel resuelve
  `temaResuelto(tema, paleta)` y pone en `<html>` las variables `--rvc-*`
  (`variablesCss`) y, **derivados de ellas, los tokens de Lux que usan los
  componentes compartidos** (fondo, superficie, texto, texto suave, línea,
  botón, acento, error, éxito, radios, letra de títulos). Así Aviso, Campo,
  tablas y Armazón cambian de ropa sin reescribirse. Se quita al salir del
  panel, como `useTemaRv` hoy. Las letras se cargan con `cargarLetras`.
- **Densidad táctil** en el panel: controles de 48 px como mínimo y texto
  base de 17–18 px en el teléfono (hoy hereda la densidad tabular de la
  administración).
- Navegación: el `Armazon` de siempre (abajo en el teléfono, lateral en
  escritorio), con las tres diarias Inicio · Pedidos · Vender y "Más".
- Lo que la pantalla escribe sobre su color se mide con lo derivado de
  `tema.ts` (texto sobre botón, acento sobre fondo): nada de colores a mano.
- `estilos/revendedor.css` (las seis paletas) deja de vestir el panel; se
  conserva mientras otra pantalla lo use (el editor del tema muestra las
  paletas como temas listos).

## Base: `esquema-panel-revendedor.sql` (#74)

Primero el SQL, después el navegador. Nada se quita de lo que el navegador
viejo manda.

1. **`rv_crear_apartado`** (revocada, por dentro): con `p_origen = 'panel'`
   la cédula es opcional y el apellido también; nombre y teléfono (10
   dígitos) siguen obligatorios. Con `'catalogo'`, igual que hoy.
   - Si llega una cédula y es de una suya, como hoy.
   - **Sin cédula**, reconoce a una suya **por el teléfono** (sus 10 últimos
     dígitos; si hay varias, la más reciente) y completa lo que falte sin
     pisar lo que ya tiene.
   - Una clienta nueva sin cédula entra a `revendedor_clientes` con
     `cedula` null (la tabla ya lo acepta).
2. **`rv_vender`** gana `p_cliente_id bigint default null` **al final**: la
   clienta que eligió de su lista. Tiene que ser suya (`revendedor_id`), si
   no, error. Con ella, nombre, apellido, cédula y teléfono que lleguen solo
   completan lo vacío. Se borra la firma vieja y se otorga la nueva a
   `anon, authenticated` (una sola de cada, como en el #65).
3. **`cliente_de_revendedor`** (al aprobar, al maestro): sin cédula, si la
   misma clienta suya ya entró al maestro en otro pedido aprobado
   (`apartados.cliente_maestro_id` de otro apartado con el mismo
   `cliente_id`), usa esa ficha en vez de crear otra. Con cédula, como hoy.
   No busca por teléfono en el maestro (podría juntar a dos personas).
4. **`rv_resumen`** agrega al final `tema` y `vence_lux_en` (el plazo más
   próximo de lo que debe a Lux, null si no debe nada). Es jsonb: claves
   nuevas no rompen al navegador viejo.
5. `verificar`: que `rv_vender` tenga una sola firma, que `rv_resumen` no
   suelte ninguna clave de costo nueva.

Pruebas en PGlite con la instalación entera (harness de las fases 5 y 6),
con las cifras esperadas en la cabecera: venta sin cédula; clienta
reconocida por teléfono; `p_cliente_id` ajeno rechazado; el catálogo sigue
pidiendo cédula; toda de su inventario sin cédula, pagada, queda cerrada;
dos aprobaciones de la misma clienta sin cédula dan una sola ficha en el
maestro. Revisión de seguridad con el agente de seguridad (es una `rv_*`).

## La guía del revendedor

`GuiaRevendedorPiezas` (el manual del panel) dice los botones tal como
salen: Vender en tres pasos, "Pagó todo · Una parte · Todavía no", "Clienta
nueva", la cédula opcional desde el panel. Mismo commit.

## Lo que queda al constructor

- Cómo se parte el código de Vender (un componente por paso dentro de
  `panel/vender/`, y la lógica pura de cuentas y validación en un archivo
  aparte y probado con `npm run pruebas`).
- El nombre exacto de los tokens de Lux que hay que derivar del tema (mirar
  qué usa `Armazon`, `Piezas` y las tablas).
- Si agrupar las medidas por familia en el paso ① cabe sin una hoja nueva.
- Las capturas de comprobación en un teléfono de 360 px con `mirar.mjs` y el
  revendedor de muestra (`?demo=1`), si el panel puede usarlo; si no, contra
  la base real con un revendedor de prueba.

## Documentos a tocar

CLAUDE.md (árbol de `revendedor/panel`, las reglas del revendedor: la cédula
opcional desde su panel, el panel con su tema; `rv_vender` con
`p_cliente_id`), INSTALACION.md (#74), DESIGN.md si cambia algo del panel,
la guía, y el estado de la fase 7 en el README de las fases.
