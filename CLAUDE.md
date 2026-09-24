# Lux by Emory — léeme antes de tocar nada

Sistema de inventario, punto de venta y catálogo de una joyería hipoalergénica en
Sabana de Mendoza, Venezuela. Vite + React 19 + TypeScript estricto + CSS plano,
Supabase detrás y GitHub Pages delante.

**Este archivo se actualiza en el mismo commit que el cambio que lo desactualiza.**
No es documentación de cortesía: es lo primero que se lee al empezar, y si miente
cuesta más que si no existiera. Al final está la lista de qué archivo tocar según
lo que cambies.

---

## Las cinco reglas que mandan sobre todo

1. **La vendedora no puede ver un solo número de costo.** Es regla de negocio, no
   preferencia visual. El sitio es estático: cualquiera abre la consola y consulta
   la base con su sesión. Por eso los costos se protegen en Postgres (tablas
   revocadas, vistas de definidor, funciones revocadas), nunca en React.
2. **El dólar es la unidad ancla; el bolívar es una vista.** Se guarda USD y se
   calcula Bs al mostrar. Excepción: `ventas` y `venta_items` guardan Bs porque son
   hechos históricos congelados.
3. **Primero el SQL, después el navegador.** El SQL corre en un segundo y el
   despliegue tarda minutos; en esos minutos la tienda está abierta con la versión
   vieja del navegador. Nunca quites un parámetro de una función que el navegador ya
   llama: se queda y se ignora, con un comentario que diga por qué.
4. **Nunca inventes una cifra de negocio.** Precios, descuentos, metas, mermas,
   plazos: los carga el administrador o viven en `configuracion`.
5. **Todo texto a 4,5:1 medido, no estimado.** La tienda tiene luz fuerte y el
   teléfono es de gama baja.

Las tres skills de `.claude/skills/` son la fuente larga de todo esto:
`lux-codigo` (dinero, seguridad, migraciones), `lux-ui` (paleta, tipografía,
densidad) y `anthropic-skills:lux-by-emory`. Se activan solas al tocar el código.

---

## Los archivos de contexto, y cuál responde qué

| Archivo | Responde |
|---|---|
| **CLAUDE.md** (este) | Cómo está hecho todo y dónde está cada cosa |
| **PRODUCT.md** | Para quién es, cómo habla, qué no se hace |
| **DESIGN.md** + `.impeccable/design.json` | El sistema visual: tokens, componentes, reglas |
| **ESTADO.md** | Cómo mantenerlo sano: respaldos, dependencias, lo que caduca |
| **INSTALACION.md** | Puesta en marcha desde cero y **el orden de los SQL** |
| **PLAN.md** | Por qué es como es: las fases y las decisiones de origen |
| `.claude/skills/lux-codigo/SKILL.md` | Convenciones de código, dinero y seguridad |
| `.claude/skills/lux-ui/SKILL.md` | El sistema de diseño, con las medidas que lo justifican |

---

## Cómo está armado

```
src/
  lib/          supabase.ts, auth.ts, dinero.ts, fotos.ts, tipos.ts, familias.ts
  hooks/        useSesion, useTasa, useCatalogos, useCarrito, useClientes,
                useInventario, useTextos, useFrases, useConsejos
  componentes/  Disposicion (armazón y navegación), Piezas (Aviso, Campo,
                Cargando, Vacio, Filtros, Ayuda), Iconos, Marca, VisorFoto
                (detalle que pasa de pieza), ElegirVariante (la hoja de
                medidas), TusDatos (el pedido público empieza por la
                cédula), Graficos, Progreso, Recordatorio, CompartirCatalogo,
                BuscadorCliente, RutaProtegida
  paginas/
    admin/      Inventario, FormularioModelo, Lotes, Grupos, Tramos,
                Costos, Inversiones, Reportes, Textos
    venta/      Mostrador, Pedidos, Tablero, Cierre, ConteoSemanal, Guia
    publico/    Catalogo, Reserva          (sin sesión)
    Clientes, Tasas, CatalogoPdf, Vitrina, Entrar, Verificacion   (las de las dos caras)
  estilos/      tokens.css (paleta), base.css, vitrina.css, impresion.css
```

- **TypeScript estricto, sin `any`.** Dominio en español, API de React en inglés:
  `precioUsd`, `costoPuesto`, pero `useState`, `handleClick`.
- **CSS plano sobre variables de `tokens.css`.** Sin Tailwind, sin CSS-in-JS.
- **`HashRouter`**: GitHub Pages no reescribe rutas.
- **Toda lógica de dinero vive en `lib/dinero.ts`.** Si un componente multiplica un
  precio con un `*` suelto, se mueve a la librería.
- **Todos los `useMemo` van antes del primer `return` temprano**, o React lanza el
  error 310 en producción y no en desarrollo.
- **Los ficheros del repo están en CRLF.** Un reemplazo que busque `\n` no encuentra
  nada: trabaja por líneas.

### Las dos caras

| | Mostrador (vendedora) | Administración |
|---|---|---|
| Dónde | Android de gama baja, una mano, luz de tienda | Escritorio, y también el teléfono |
| Densidad | Táctil: 56 px, texto 18 px | Tabular: 40 px, texto 15 px |
| Navegación | Abajo en el teléfono, lateral en escritorio | Igual |

Por debajo de 900 px la navegación vive **abajo**: barra de cuatro columnas con las
tres secciones diarias y un botón "Más". No es una hamburguesa arriba a la
izquierda, y no por moda: esa esquina es la que peor alcanza el pulgar de quien
sostiene el teléfono con una mano y joyas con la otra.

---

## La base de datos

Supabase (Postgres). **La seguridad real vive en RLS y en los permisos**, no en el
navegador. Los `.sql` de la raíz se corren en orden; `INSTALACION.md` tiene la tabla
completa y cada archivo dice en su cabecera de qué depende.

### Las tablas que importan

`perfiles` · `tasas` · `lotes` · `grupos_precio` · `modelos` · `ubicaciones` ·
`existencias` · `ventas` · `venta_items` · `clientes` · `reservas` ·
`reserva_items` · `tramos_mayoreo` · `configuracion` · `conteos` · `inversiones` ·
`gastos_mes` · `frases`

### Las vistas, que es por donde entra la vendedora

| Vista | Qué da | Quién |
|---|---|---|
| `v_catalogo_venta` | El catálogo **sin una sola columna de costo** | vendedora y admin |
| `v_venta_ubicacion` | Lo mismo, desglosado por ubicación | vendedora y admin |
| `v_disponible_publico` | El catálogo público, menos lo reservado. La ubicación va **en clave** (`V1 · BG`), nunca con el nombre | cualquiera, sin sesión |
| `v_catalogo_admin` | Agrega costo y margen; filtra con `es_admin()` | solo admin |
| `v_clientes` | El maestro de clientes con su resumen de compras | vendedora y admin |
| `v_cliente_compras` | Qué se llevó cada clienta y cuándo | vendedora y admin |
| `v_pedido_vendedora` | Los pedidos del catálogo, con dónde está cada pieza | vendedora y admin |
| `v_plan_ventas` | Cuántas piezas hay que vender: lo que deja cada pieza contra los gastos fijos | solo admin |
| `v_tasas` | El histórico de tasas con el nombre de quien fijó cada una | vendedora y admin |
| `v_rebajas` | Cada pieza vendida por debajo de su etiqueta: cuánto, por qué (regateo o tramo) y quién | solo admin |
| `v_margen_ventas`, `v_diagnostico`, `v_capex_lote` | Ganancia y costos | solo admin |

`modelos`, `lotes` y `venta_items` están **revocadas** para `authenticated`: se leen
por sus vistas. Nunca hagas que el frontend de la vendedora consulte `modelos`
directamente, ni "solo para leer el nombre".

### Las funciones que escriben

Toda operación que toque varias tablas va en una RPC transaccional, no en tres
llamadas desde React: `registrar_venta`, `guardar_cliente`, `crear_reserva`,
`reportar_pago`, `cerrar_dia`, `fijar_tasa`, `admin_guardar_modelo`,
`admin_separar_variante`, `admin_reasignar_grupos`, `admin_fusionar_clientes`.

`buscar_cliente_publico` es la única que lee el maestro de clientas sin sesión:
el catálogo la usa para reconocer a una clienta por su cédula. Devuelve
**enmascarado** (primer nombre, inicial del apellido, dos últimos dígitos del
teléfono) porque las cédulas son correlativas y con datos completos cualquiera se
llevaría la lista. Lo que la clienta confirmada no escribe lo rellena
`crear_reserva` por dentro, y `ver_reserva` lo devuelve enmascarado también.
`verificar` vigila que no devuelva una clave más.

`fijar_tasa` es de las dos caras (la tasa se mueve durante el día y quien está
en la tienda es ella). `admin_fijar_tasa` sigue viva solo para el navegador viejo
del administrador; la pantalla ya no la llama.

Las `admin_*` llevan `if not es_admin() then raise` por dentro. **Ese guardián nunca
va en una función que la vendedora necesite**: `es_admin()` mira `auth.uid()` y sigue
dando falso dentro de una función de definidor, así que pondría la venta de rodillas.

### Las dos fórmulas de las que sale toda cifra de dinero

Desde `esquema-cuentas-claras.sql` hay **una** fórmula por cifra, y todas las
pantallas leen de ella. Antes estaban copiadas en tres sitios cada una, y cada copia
derivó por su lado: Costos y Reportes decían gastos distintos, y tres pantallas
contestaban "cuántas piezas para no perder" con tres números.

| Función | Da | La leen |
|---|---|---|
| `gastos_fijos_partidas()` | Los gastos fijos del mes, partida por partida, en $ BCV | `gastos_fijos_mes_bcv()`, Reportes, Inversiones |
| `plan_ventas()` | Lo que deja cada pieza y cuántas hay que vender | Costos, Reportes, Inversiones, `meta_vendedora()` |

Las dos están revocadas a todo el mundo. Las vistas del administrador las llaman
por sus envolturas `*_admin()`, que devuelven nada a quien no lo sea. **Si una
pantalla nueva necesita una de estas cifras, la lee de ahí; no la recalcula.**

`meta_vendedora()` es la única ventana de la vendedora a esa cuenta: le da su meta
de piezas del día y del mes, lo vendido por la tienda y el calendario. **Solo piezas
y fechas**: ni gastos, ni lo que deja cada pieza, ni la meta de ganancia del dueño.
`verificar` comprueba que ninguna columna suya hable de dinero.

---

## Las reglas de negocio vivas

- **Dos monedas en el costo.** La mercancía y su flete nacen en dólares Binance y se
  multiplican por la brecha; el alquiler, los sueldos y el empaque nacen en BCV y no.
  El margen se reporta en dólares BCV, y aparte la ganancia en dólares reales.
- **Cada "$" en pantalla dice cuál es.** `formatearBcv` ("$20,00 BCV") y
  `formatearBinance` ("$14,50 Binance"), de `lib/dinero.ts`. `formatearMonto` da la
  cifra sola y **solo** va en celdas de tabla cuya cabecera dice la moneda
  ("Costo · $ Binance"). El viejo `formatearUsd`, que imprimía "$" pelado, no existe.
- **Gasto fijo y gasto variable no se mezclan.** Fijo: se paga vendas o no
  (alquiler, sueldos, servicios, la parte del mes de muebles y exhibidores). Variable:
  se paga por pieza (mercancía y empaque). Lo que deja cada pieza = precio − mercancía
  − empaque; piezas para no perder = gastos fijos ÷ eso. El empaque nunca va entre los
  gastos del mes.
- **La ganancia de verdad es la del mes.** Lo que dejaron las ventas del mes contra
  los gastos del mes entero (`v_cobertura_mes`). Las columnas `ganancia_usd` de
  `v_ventas_por_dia` y compañía restan el alquiler repartido con las piezas que se
  ESPERABA vender: no se enseñan como ganancia. Las pantallas usan `contribucion_usd`.
- **Precio en los catálogos: bolívares y $ BCV, del mismo tamaño.** Mostrador,
  catálogo público, catálogo PDF y vitrina del televisor.
- **La meta de la vendedora sale de las cuentas.** La del mes son las piezas para la
  meta de ganancia del dueño (o, sin meta, para cubrir el mes); la del día, eso entre
  los días que abre la tienda (`configuracion.dias_abiertos_mes`). La ve en "Tu día"
  y en el Mostrador. Sin el dato de días ve solo la del mes; nunca un número viejo.
  La meta de piezas premium y su umbral los fija el dueño en Costos.
- **Lo que puede negociar, ella lo ve; los márgenes, no.** `descuento_max_mostrador_pct`
  (cuánto puede rebajar de la etiqueta) está en su lista de claves legibles; cada
  tarjeta del mostrador dice su mínimo y en el cobro escribe lo que cobra por pieza. `margen_minimo_pct` **nunca** entra en esa
  lista: con él y el mínimo de cada pieza, que ya ve, despejaría el costo. `verificar`
  lo vigila. Los tres porcentajes (rebaja máxima, margen mínimo, margen para elegir
  grupo) se fijan en Costos.
- **El flete se reparte por bulto**, nunca por peso ni por valor. El peso ya no
  existe en el sistema: no lo reintroduzcas.
- **Los exhibidores no son inventario**: su costo va a CAPEX de tienda. Sí pagan
  flete, y esa parte nunca se le carga a las joyas.
- **El mayoreo es una regla, no una lista.** Tramos configurables (6 piezas 5 %,
  12 piezas 10 %, 20 piezas 15 %) que se aplican en tres sitios y **los tres dicen lo
  mismo**: `registrar_venta` manda, el carrito lo enseña con la misma cuenta
  (`precioConTramo`) y `crear_reserva` cobra igual. Los kits se retiraron en
  septiembre de 2026.
- **Dos pisos, dos trabajos.** `piso_margen_de` es lo que todavía deja el margen
  mínimo: es el piso del TRAMO. `precio_minimo_de` es el mayor entre ese y la
  etiqueta menos la rebaja máxima: es el piso del REGATEO. Antes el tramo usaba el
  del regateo y el 15 % se quedaba en el 10 % de la vendedora.
- **Con tramo manda el tramo.** El regateo es para cerrar una venta de menos piezas
  que el primer tramo; desde ahí el precio a mano se ignora y se cobra el tramo.
  Cada línea guarda por qué salió más barata (`venta_items.motivo_rebaja`:
  `regateo` o `tramo`), y `v_rebajas` se lo enseña al dueño en Reportes.
- **Variantes.** Una cadena de 45 cm y otra de 60 cm son el mismo producto con dos
  opciones. Cada variante sigue siendo un modelo completo (SKU, existencia, grupo,
  costo, foto); las junta `modelos.familia_id` y las distingue `modelos.variante`.
  Las vistas publican `familia` (nunca null) y todas las pantallas agrupan con
  `agruparPorFamilia` de `lib/familias.ts`: una tarjeta por producto, que al tocarla
  abre la hoja de elegir. `variantes_nota` quedó como nota libre de la pieza.
- **El tercer precio, en $ Binance.** Lo que se cobra si pagan en dólares, en
  efectivo o por Binance: bolívares entre la tasa Binance (`binanceDesdeBs`), la
  misma cuenta con la que la base guarda `ventas.total_usd`. Solo en el mostrador y
  en la administración; nunca en el catálogo público, el PDF ni la vitrina.
  "Binance" es también forma de pago.
- **Clientes.** Cada venta puede quedar a nombre de una clienta del maestro, que se
  busca por cédula o por nombre. De ahí salen el histórico, la garantía (qué se llevó
  y cuándo) y los meses de lavado y abrillantado que le tocan por compra
  (`configuracion.meses_servicio`, que el administrador fija en Costos).
  Al pedir por el catálogo, la clienta escribe primero su cédula: si ya está en el
  maestro se reconoce ("María G.") y confirma sin escribir nada más; si no, llena
  sus datos. El catálogo **no crea** clientas ni cambia su ficha: una clienta nace
  cuando alguien le cobra. La reserva guarda `cliente_id` y en Pedidos sale "Ya es
  clienta".

---

## Antes de publicar

```bash
npm run verificar     # 61 comprobaciones con las dos sesiones. Sale 1 si algo se abrió.
npm run build         # tsc --noEmit + vite build
```

`verificar` es obligatorio después de tocar **una vista, un permiso, una función o
una política**. Si no hay terminal a mano, la pantalla **Verificación** hace veintidós
de esas comprobaciones desde el navegador, con la sesión abierta; es menos fuerte
porque no puede entrar como las dos, pero se corre desde el teléfono. Lo que vigila no lo mira el compilador: un `revoke` que se cae, un
`where es_admin()` que alguien quita al reescribir una vista, un `having` que vuelve
a ser `where`. Nada de eso rompe el build.

Comprueba también contra la base real antes de entregar un `.sql`, con el script
desechable `prueba-temporal.mjs` (está en `.gitignore` y se borra al terminar).
Y entrega las cifras esperadas junto al archivo: "debería darte margen 44,4 %".

---

## Trampas que ya mordieron

- **Una fórmula copiada es una fórmula que deriva.** Los gastos del mes estaban en
  tres sitios y "cuántas piezas para no perder" en otros tres; en septiembre de 2026
  ya daban números distintos en Costos, Reportes e Inversiones. Una cifra, un sitio.
- **Dos tasas en una resta.** Inventario restaba un costo en $ BCV de una venta en
  $ Binance, e Inversiones restaba lo invertido a la tasa de hoy menos lo vendido a
  la tasa de cada venta. Antes de restar, las dos partes en la misma moneda y a la
  misma tasa.

- **Una columna que la pantalla no pide es una regla que no se aplica.** El
  mostrador no pedía `precio_minimo_bs`; el carrito creía que el mínimo era la
  etiqueta y el descuento por cantidad salió en cero durante semanas, sin un error.
- **El catálogo público vive de que Postgres NO ejecute los pisos.** La clienta sin
  sesión no puede ejecutar `precio_minimo_de` ni `piso_margen_de`, y lee
  `v_catalogo_venta` sin pedir esas columnas: así no se evalúan. Van directas en la
  lista de columnas; en un lateral no hay esa garantía y el catálogo caería entero.
- **Una vista no te presta su permiso para ejecutar funciones.** Postgres comprueba
  el `EXECUTE` contra quien consulta, no contra el dueño de la vista.
- **Un agregado sin `GROUP BY` devuelve una fila aunque no entre ninguna.** Hace
  falta `having es_admin()`, no `where`.
- **`create or replace view` solo sabe añadir columnas AL FINAL.** Quitar una,
  cambiarle el tipo o meter una en medio da error: hay que `drop ... cascade` y
  volver a otorgar el `grant select`.
- **Si lanzas N consultas, miras N errores.** El catálogo público miraba solo la
  primera, y los tramos fallaron en silencio durante semanas: ninguna clienta al
  mayor recibió su descuento y la página se veía perfecta.
- **Los heredoc de Bash se comen las barras invertidas.** Para editar código con
  `\d`, la herramienta de edición, no un heredoc.

---

## Qué actualizar cuando cambias algo

| Si tocas… | Actualiza |
|---|---|
| Un `.sql` nuevo | `INSTALACION.md` (la tabla de orden) y este archivo si aparece una tabla, vista o función |
| Una vista o un permiso | Corre `npm run verificar` y anota aquí la vista nueva |
| Paleta, tipografía, un componente visual | `DESIGN.md` y `.impeccable/design.json` |
| Una pantalla o una ruta | El árbol de `src/` de este archivo |
| Una regla de negocio | La sección de reglas de aquí, y `PRODUCT.md` si cambia a quién sirve |
| Respaldos, dependencias, mantenimiento | `ESTADO.md` |
