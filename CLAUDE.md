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
  lib/          supabase.ts, auth.ts, dinero.ts, fotos.ts, tipos.ts, familias.ts,
                revendedor.ts (su sesión, sus enlaces, las paletas),
                vendedoras.ts (llama a la función de servidor de las cuentas),
                visitas.ts (el catálogo público cuenta su visita)
  hooks/        useSesion, useTasa, useCatalogos, useCarrito, useClientes,
                useInventario, useTextos, useFrases, useConsejos,
                useTemaRv (viste la página con la paleta de un revendedor)
  componentes/  Disposicion (las secciones de la tienda), Armazon (la barra
                lateral y la de abajo, de la tienda y del revendedor), Piezas
                (Aviso, Campo, Cargando, Vacio, Filtros, Ayuda), Iconos,
                Marca, VisorFoto (detalle que pasa de pieza), ElegirVariante
                (la hoja de medidas), VisitasCatalogo (cuánta gente abre el
                catálogo, en la pantalla Catálogo), TusDatos (el pedido público empieza por
                la cédula), MoverUbicacion (pasar piezas de una ubicación a
                otra), CargarAbono (un abono en dólares BCV, de la tienda y
                del revendedor), ListaAbonos (cada abono con lo que quedaba
                después, verificar, corregir con historial y "no llegó"),
                ReportarPago (un pago a distancia con su referencia, sin
                sesión o del revendedor), PagoMovil (datos para copiar, de
                Lux o del revendedor), Graficos, Progreso, Recordatorio,
                CompartirCatalogo, BuscadorCliente, RutaProtegida
  paginas/
    admin/      Inventario, FormularioModelo, Lotes, Grupos, Tramos,
                Costos, Inversiones, Reportes, Textos, Revendedores, Vendedoras,
                Caja (lo que entra y lo que sale, día por día y mes por mes),
                CapacitacionRv ("Capacitación revendedores": el enlace de la guía
                y de dónde saca cada dato)
    venta/      Mostrador, Pedidos, Tablero, Cierre, ConteoSemanal, Guia
    publico/    Catalogo, Reserva, GuiaRevendedor (/guia-revendedor, la guía
                para quien quiere ser revendedor) con GuiaRevendedorPiezas
                (calculadora, recorrido, manual, preguntas, solicitud)
                                           (sin sesión)
    revendedor/ CatalogoRevendedor (/r/:usuario), ApartadoPublico
                (/apartado/:token)         (sin sesión, como el catálogo)
                EntrarRevendedor (/rv/entrar), Panel (/rv) con panel/
                InicioRv, ApartadosRv ("Pedidos", por fase), VenderRv,
                ClientesRv, PreciosRv, MiCatalogoRv (con su pago móvil)
                                           (con SU código, no con Supabase)
    Vitrina                                (sin sesión, como el catálogo)
    Clientes, Tasas, CatalogoPdf, Entrar, Verificacion   (las de las dos caras)
  estilos/      tokens.css (paleta), base.css, vitrina.css, impresion.css,
                revendedor.css (las seis paletas de su catálogo, medidas),
                guia-revendedor.css (la guía pública)
supabase/functions/vendedoras   crea, pausa y cambia el PIN de las vendedoras
                del local con la llave maestra, en el servidor de Supabase.
                Se publica aparte (INSTALACION.md, 3.1); no va en el build.
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

La del mostrador la usan **las vendedoras del local**, cada una con su código de
ocho dígitos (su número y su PIN), creadas por el dueño en la pantalla
Vendedoras. Hacen todas lo mismo; el código es para saber quién vendió qué.

| | Mostrador (vendedora) | Administración |
|---|---|---|
| Dónde | Android de gama baja, una mano, luz de tienda | Escritorio, y también el teléfono |
| Densidad | Táctil: 56 px, texto 18 px | Tabular: 40 px, texto 15 px |
| Navegación | Abajo en el teléfono, lateral en escritorio | Igual |

Por debajo de 900 px la navegación vive **abajo**: barra de cuatro columnas con las
tres secciones diarias y un botón "Más". No es una hamburguesa arriba a la
izquierda, y no por moda: esa esquina es la que peor alcanza el pulgar de quien
sostiene el teléfono con una mano y joyas con la otra.

### Y fuera de la tienda: los revendedores

Personas elegidas por el dueño que venden las joyas a su propia clientela. Cada
uno tiene su catálogo (`/#/r/<usuario>`, con su nombre y su paleta) y su panel
(`/#/rv`), con el mismo armazón que la tienda vestido de sus colores. **No es una
tercera cara con sesión de Supabase**: entra con un código que le da el dueño, y
para la base es alguien sin sesión (ver "Los revendedores" en las reglas).

---

## La base de datos

Supabase (Postgres). **La seguridad real vive en RLS y en los permisos**, no en el
navegador. Los `.sql` de la raíz se corren en orden; `INSTALACION.md` tiene la tabla
completa y cada archivo dice en su cabecera de qué depende.

### Las tablas que importan

`perfiles` · `tasas` · `lotes` · `grupos_precio` · `modelos` · `ubicaciones` ·
`existencias` · `ventas` · `venta_items` · `clientes` · `reservas` ·
`reserva_items` · `tramos_mayoreo` · `configuracion` · `conteos` · `inversiones` ·
`frases` · `movimientos` (quién movió qué pieza de una ubicación a otra) ·
`abonos` (cada pago de un pedido de la tienda, de lo que un revendedor le paga
a Lux o de una venta por partes de antes; verificado o no, anulado si no llegó,
nunca borrado) · `abono_cambios` (lo que decía un abono antes de cada
corrección, quién y por qué; revocada, se lee por `v_abono_cambios`) ·
`caja_movimientos` (lo que
sale de la tienda, y lo que entra sin ser venta, anotado por el dueño; revocada
a todos, se lee por `v_caja`, se anula y no se borra) ·
`catalogo_visitas` (un teléfono por día que abrió el catálogo público, con un
número al azar que guarda su navegador; revocada a todos, se escribe por
`registrar_visita` y se lee por `visitas_catalogo`).
Los gastos fijos del mes no son una tabla: son claves de `configuracion` que lee
`gastos_fijos_partidas()`.
`perfiles.numero_vendedora` es el número de cada vendedora del local (los dos
primeros dígitos de su código); null en los administradores y en la cuenta de
antes.

De los revendedores, todas revocadas a `anon` y `authenticated` (se tocan por sus
funciones): `revendedores` (con la huella de su código, nunca el código) ·
`revendedor_sesiones` · `revendedor_precios` (el que él le pone a cada pieza) ·
`revendedor_clientes` (sus clientas; entran al maestro de la tienda cuando se
aprueba su pedido) · `apartados` (su pedido: `expira_en` es el plazo de la fase
en que va) · `apartado_items` (los tres precios congelados: etiqueta, lo que
paga a Lux y lo que cobra a su clienta) · `apartado_abonos` (lo que su clienta
le paga a ÉL; lo que ella reporta es un aviso hasta que él lo confirma).
`reservas` y `reserva_items` guardan el precio congelado de cada pieza y ya no
se escriben con ninguna sesión: solo por sus funciones.
`apartados`, sus líneas y sus abonos no se borran, como las ventas.
`ventas.revendedor_id` dice qué venta fue a un revendedor.
`ventas.extra_bs` y `ventas.extra_nota` son lo que se sumó al cobro fuera del
catálogo (un dije) y qué era; ya va dentro de `total_bs`.

### Las vistas, que es por donde entra la vendedora

| Vista | Qué da | Quién |
|---|---|---|
| `v_catalogo_venta` | El catálogo **sin una sola columna de costo** | vendedora y admin |
| `v_venta_ubicacion` | Lo mismo, desglosado por ubicación | vendedora y admin |
| `v_disponible_publico` | El catálogo público, menos lo reservado. La ubicación va **en clave** (`V1 · BG`), nunca con el nombre | cualquiera, sin sesión |
| `v_catalogo_admin` | Agrega costo y margen; filtra con `es_admin()` | solo admin |
| `v_clientes` | El maestro de clientes con su resumen de compras | vendedora y admin |
| `v_cliente_compras` | Qué se llevó cada clienta y cuándo | vendedora y admin |
| `v_pedido_vendedora` | Los pedidos del catálogo y los apartados del mostrador que siguen abiertos, con dónde está cada pieza, su fase, lo pagado, lo verificado y lo que falta; y los vencidos con dinero, para archivarlos | vendedora y admin |
| `v_abonos_detalle` | Cada abono con su padre, si se verificó, si no llegó, si se corrigió y lo que faltaba después de él | vendedora y admin |
| `v_abono_cambios` | Lo que decía un abono antes de cada corrección, quién la hizo y por qué | vendedora y admin |
| `v_ventas_por_verificar` | Las ventas cobradas sin comprobar el pago: quién vendió, cómo pagó, la referencia, lo sumado fuera del catálogo y, si es por partes, cuánto falta | vendedora y admin |
| `v_abonos` | Cada abono de una venta por partes: cuándo, cómo, cuánto, la referencia y quién lo cargó | vendedora y admin |
| `v_existencia_libre` | Por pieza y ubicación: lo que hay, lo apartado por pedidos y lo libre | vendedora y admin |
| `v_plan_ventas` | Cuántas piezas hay que vender: lo que deja cada pieza contra los gastos fijos | solo admin |
| `v_tasas` | El histórico de tasas con el nombre de quien fijó cada una | vendedora y admin |
| `v_rebajas` | Cada pieza vendida por debajo de su etiqueta: cuánto, por qué (regateo, tramo o revendedor) y quién | solo admin |
| `v_apartados_revendedor` | Los pedidos de revendedores desde que él confirma: su fase, lo que le paga a Lux, lo pagado y lo que falta, la clienta (cédula y teléfono) y dónde está cada pieza; los aprobados hasta que se los lleva. Nada de lo que él cobra a su clienta | vendedora y admin |
| `v_revendedores` | Cómo va cada revendedor: su nivel, su tope, lo apartado, lo que pagó en el mes | solo admin |
| `v_vendedoras` | Cómo va cada vendedora del local: sus piezas de hoy y del mes, en $ BCV, y su última venta. Sin lo que retiran los revendedores | solo admin |
| `v_caja` | Cada movimiento anotado en la caja, con quién lo anotó y, si se anuló, quién y por qué | solo admin |
| `v_margen_ventas`, `v_diagnostico`, `v_capex_lote` | Ganancia y costos | solo admin |

`modelos`, `lotes` y `venta_items` están **revocadas** para `authenticated`: se leen
por sus vistas. Nunca hagas que el frontend de la vendedora consulte `modelos`
directamente, ni "solo para leer el nombre".

### Las funciones que escriben

Toda operación que toque varias tablas va en una RPC transaccional, no en tres
llamadas desde React: `registrar_venta`, `guardar_cliente`, `crear_reserva`,
`reportar_pago`, `cerrar_dia`, `fijar_tasa`, `mover_existencia`,
`verificar_venta`, `anular_venta_por_verificar`, `cobrar_pedido`,
`cancelar_pedido`, `cobrar_con_abono` (ya no la llama la pantalla),
`registrar_abono`, `abonar_venta` (un abono a una venta por verificar: el
primero la vuelve por partes), `admin_guardar_modelo`,
`admin_separar_variante`, `admin_reasignar_grupos`, `admin_fusionar_clientes`,
`cobrar_apartado` (la del navegador viejo: pasa por la aprobación),
`admin_guardar_revendedor`, `admin_codigo_revendedor`, `admin_cancelar_apartado`,
`admin_anotar_caja`, `admin_anular_caja`.

`registrar_visita(visitante)` la llama el catálogo público al abrirse, sin
sesión; con sesión no cuenta (es alguien de la tienda). `visitas_catalogo(días)`
da un renglón por día (personas, veces que lo abrieron y pedidos que entraron
por el catálogo), solo a quien es personal activo: `es_personal()`, no
`es_admin()`, porque la vendedora también la ve.

Las del apartado (`esquema-abonos-y-apartados.sql`): `apartar_en_tienda` (el
mostrador aparta), `abonar_pedido`, `entregar_pedido` (la venta nace aquí, con
los precios congelados), `editar_abono`, `anular_abono`, `verificar_abono`
(cada cambio queda en `abono_cambios`), `cerrar_pedido_vencido` (archiva un
apartado vencido: el dinero se queda) y `admin_cerrar_pedido` (cerrar con
dinero: se devuelve, y sale de la caja como "devolución", o se queda). Sin
sesión, `reportar_abono` (la clienta reporta un pago desde su enlace). Las del
pedido del revendedor en la tienda (`esquema-revendedores-plazos.sql`):
`abonar_apartado`, `aprobar_apartado` (registra la venta a nombre de su
clienta), `marcar_entregado` y `admin_cerrar_apartado`.

Por dentro, revocadas: `precio_de_linea` (el tramo y el regateo, la regla de
`registrar_venta`, `crear_reserva` y `apartar_en_tienda`), `vender_congelado`
(la única que registra una venta con precios que no son los de hoy),
`anotar_abono_en` y `montos_de_abono` (la receta de un abono), `pedido_al_dia`
y `apartado_al_dia` (mueven el plazo), `cliente_de_revendedor`. Lo que falta
sale de `saldo_padre_bcv` (y de `falta_bcv_de`, `falta_pedido_bcv`); la fase, de
`fase_pedido` y `rv_fase_de`; lo que quedaba tras cada abono, de las vistas
internas `abonos_saldo` y `apartado_abonos_saldo`.

`caja_flujo(desde, hasta)` es la única regla de qué dinero entró y salió: las
ventas cobradas completas por su total, las ventas por partes abono por abono y
lo anotado en la caja, sin anuladas, con los días cortados en la hora de
Venezuela. Revocada a todos; la leen `admin_caja_por_metodo`,
`admin_caja_por_dia` y `admin_caja_por_categoria`, que rechazan a quien no sea
administrador.

Las cuentas de las vendedoras del local no se tocan desde SQL: las crea, pausa y
les cambia el PIN la función de servidor `supabase/functions/vendedoras`, con la
llave maestra, después de comprobar que quien llama es administrador activo.
Solo actúa sobre perfiles `vendedora`. Su receta de contraseña es la de
`contrasenaDesdePin()` (`src/lib/auth.ts`): si cambia una, cambia la otra.

Las del revendedor se llaman `rv_*` y reciben `p_sesion` delante: `rv_entrar`
(código → testigo), `rv_salir`, `rv_resumen`, `rv_piezas`, `rv_fijar_precios`,
`rv_apartados`, `rv_abonar`, `rv_cancelar_apartado`, `rv_clientes`,
`rv_guardar_cliente`, `rv_ajustes`, `rv_confirmar`, `rv_revisar_pago`,
`rv_pagar_lux`, `rv_vender` y `rv_datos_pago` (su pago móvil y sus días de
crédito; aparte de `rv_ajustes` para que el navegador viejo no los borre).
Todas empiezan por `rv_de_sesion(p_sesion)`,
que dice quién es o lanza el error `28000`. Las de su catálogo no llevan testigo:
`rv_perfil_publico`, `rv_catalogo_publico`, `rv_buscar_cliente` (enmascarada,
con las mismas claves que `buscar_cliente_publico`), `rv_apartar`,
`rv_ver_apartado` y `rv_reportar_pago` (su clienta le avisa que pagó). Y
`rv_programa()`, la de la guía pública: las cifras del programa desde
`configuracion` (descuento, mínimo sobre la etiqueta, plazos, el 40 %, la
escalera del tope), ninguna de costo; `verificar` vigila que no suelte una
clave más.

Tres fórmulas, una vez cada una, revocadas a todos: `rv_precio_lux(modelo, %)` (la
etiqueta menos su descuento, sin bajar de `piso_margen_de`, al centavo hacia
arriba), `rv_minimo_clienta(lista)` (etiqueta + `revendedor_sobre_etiqueta_usd`)
y `rv_falta_de(apartado)`. El tope sale de `rv_escalera()` (los niveles, desde
`configuracion`) y `rv_tope(revendedor)`; la pantalla del dueño enseña la
escalera, no la recalcula.

`falta_bcv_de(venta)` es la única cuenta de cuánto falta de una venta cobrada por
partes, en dólares BCV. La leen `v_ventas_por_verificar`, `v_cliente_compras`,
`registrar_abono` y `verificar_venta`; la pantalla repite la cuenta para enseñarla
antes de guardar (`abonoEnBcv`, `faltaTrasAbono` de `lib/dinero.ts`).

`apartadas_de(modelo)` es la única regla de qué piezas aparta un pedido: el
abierto que no ha vencido; el confirmado mientras esté pagado (con dinero
verificado), mientras le corra su plazo de apartado o si es de antes del
apartado; y el pedido de un revendedor que sigue abierto y cuyo `expira_en` no
ha pasado (ese plazo ya es el de su fase). Sin sumar abonos: mira columnas que
mantienen `pedido_al_dia` y `apartado_al_dia`, porque se evalúa por cada pieza
del catálogo público. La usan el catálogo público, `crear_reserva`,
`cobrar_pedido`, `apartar_en_tienda`, `rv_apartar` y la entrega.

`admin_guardar_modelo` recibe también `p_variantes`: la tabla de variantes del
formulario entera, que `guardar_variantes_de` (revocada, por dentro) guarda en la
misma transacción que el producto.

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
  **Se mide con lo vendido en el local**: lo que un revendedor retira y paga no
  cuenta ni en su meta ni en "Mi día" (`ventas.revendedor_id is null`). Para el
  dueño sí es dinero de la tienda y sigue en Reportes y Costos (decisión del
  27/09/2026: vendedoras del local y revendedores son dos cosas aparte).
- **Las vendedoras del local.** Todas hacen lo mismo que la vendedora de siempre;
  cada una con su código para saber quién vendió qué. El dueño las crea, les
  cambia el PIN y las pausa en Vendedoras; pausada no entra y sus ventas se
  quedan. PIN de seis dígitos: con varias vendedoras hay varias puertas, y una
  sesión de vendedora toca existencias y lee el maestro de clientas. La cuenta
  de antes (`vendedora@lux.local`, cuatro dígitos) sigue entrando hasta que el
  dueño le dé su código propio.
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
  **Se cargan en una tabla dentro del formulario del producto**: nombre, cantidad y
  costo solo si es distinto. Con el costo vacío la variante vale lo mismo que el
  producto; con uno propio se le busca el grupo con `admin_sugerir_precio`, la misma
  cuenta de siempre, y "Sale en" lo enseña antes de guardar. Si su costo no cambió,
  su precio se respeta. Nombre, categoría, nota, lote y foto son del producto y se
  copian solos a todas.
- **El tercer precio, en $ Binance.** Lo que se cobra si pagan en dólares, en
  efectivo o por Binance: bolívares entre la tasa Binance (`binanceDesdeBs`), la
  misma cuenta con la que la base guarda `ventas.total_usd`. Solo en el mostrador y
  en la administración; nunca en el catálogo público, el PDF ni la vitrina.
  "Binance" es también forma de pago.
- **El catálogo acepta pedidos desde una pieza.** El mínimo de mayoreo (6 piezas o
  $30) se quitó en septiembre de 2026; el mayoreo es solo el descuento por cantidad.
- **Mover una pieza de ubicación** es un toque: el botón "Mover" del Inventario
  (junto a Editar) y el de cada tarjeta del Mostrador, de las dos caras. Lo hace
  `mover_existencia` en una transacción y queda en `movimientos`.
- **Vender y dejarlo por verificar.** Al cobrar, "Dejar por verificar" registra la
  venta igual (la pieza sale del inventario; nadie más la vende) con
  `ventas.por_verificar`, y aparece en Pedidos con quién la vendió, cómo pagó y la
  referencia. La verifica cualquiera de las dos caras; si el pago no llega, se anula
  y las piezas vuelven. Si pagó solo una parte, "Cargar un pago" (`abonar_venta`,
  de las dos caras): el primer abono la vuelve una venta por partes y la caja
  cuenta lo que de verdad llegó, no el total que se anotó. Anular una venta ya
  verificada sigue siendo del administrador. **El administrador también vende**: Mostrador y Pedidos están en
  su menú.
- **Lo de fuera del catálogo** (pedido del dueño del 02/10/2026). Al cobrar, las
  dos caras pueden sumar algo que no está cargado (el dije de una cadena):
  "Sumar algo fuera del catálogo", cuántos bolívares y qué es, y la pantalla dice
  cuánto es en $ BCV. Entra a la venta (`ventas.extra_bs`, `extra_nota`, dentro de
  `total_bs`), así lo cuentan solos la caja, "Mi día", lo que falta de una venta
  por verificar y lo vendido en Reportes. **No es una pieza**: no descuenta
  existencia, no cuenta para el tramo ni para la meta, no lleva descuento, no se
  aparta y no va solo (la venta sigue necesitando una pieza del catálogo). **No
  cuenta en lo que dejó la venta** (`v_ventas_por_dia`, `v_margen_ventas`): no se
  sabe lo que costó, y contarlo entero sería inventar un costo de cero; así "Te
  dejaron" y "El mes" dicen lo mismo. `registrar_venta` no acepta un extra
  negativo (sería una rebaja que se salta el mínimo) ni uno sin decir qué es. Si
  algo se vende a menudo así, lo que toca es cargarlo al catálogo.
- **Las ventas y los pedidos no se borran.** Se verifican, se anulan, se cancelan
  o vencen, y se quedan. Por verificar es también el crédito de la clienta: la
  ficha dice qué debe, cuándo se comprobó cada pago y cuánto tardó, y lo que se
  anuló porque el pago no llegó. La base lo impide dos veces (sin permiso de
  `delete` ni `truncate` para nadie con sesión, y el disparador
  `historico_no_se_borra` en `ventas`, `venta_items`, `reservas` y
  `reserva_items`, que para también al SQL Editor). No lo quites para "limpiar
  pruebas": las pruebas se anulan.
- **A dónde paga la clienta.** Cédula, teléfono y banco del pago móvil viven en
  `textos` (`pago_movil_cedula`, `pago_movil_telefono`, `pago_movil_banco`) y se
  cambian en Textos. La página del pedido los enseña con un botón de copiar cada
  uno; se copian limpios (solo dígitos, y del banco solo el código).
- **La guía para revendedores** (pedida por el dueño el 30/09/2026). Una página
  pública (`/#/guia-revendedor`) que el dueño manda desde "Capacitación
  revendedores" a quien quiera serlo: qué es, qué hace y qué no el sistema, sus
  enlaces, cuánto le sale cada pieza (con una calculadora), cómo se le paga a
  Lux, el tope, el manual del panel paso a paso, un pedido de principio a fin,
  las reglas, preguntas y palabras. **Ninguna cifra escrita a mano**: las del
  programa salen de `rv_programa()` y las de la tienda de `textos`
  (`whatsapp_tienda`, `direccion_tienda`, `horario_tienda`, que el dueño llena en
  Textos; vacías, la guía no inventa: dice "la tienda" y que pregunten). El
  único número de ejemplo ($20 de etiqueta) va dicho como ejemplo. Al final,
  "Quiero ser revendedor" arma un mensaje de WhatsApp con los datos de
  Revendedores (nombre, cédula, WhatsApp, ciudad, catálogo, usuario libre,
  colores, logo): **no se guarda nada en la base**, así no hay una puerta sin
  sesión que escriba datos personales. Si cambia el panel del revendedor, la
  guía se cambia con él: dice los nombres de los botones tal como salen.
- **El apartado** (decisión del dueño del 30/09/2026). Toda clienta puede
  apartar pagando al menos `apartado_inicial_pct` (40 %) de su pedido; tiene
  `apartado_dias` (15) para pagar lo demás, abono por abono con su referencia.
  Si no termina a tiempo, **lo abonado no se devuelve** y las piezas vuelven a
  la venta solas. Vale en el catálogo (la clienta reporta sus pagos desde su
  enlace, `reportar_abono`) y en el mostrador, donde **reemplazó a "Pagó una
  parte"**: ya no se vende a crédito (la pieza se llevaba debiendo); con
  "Lo aparta" la pieza se queda (`apartar_en_tienda`). Las ventas por partes
  que ya existían siguen recibiendo abonos hasta pagarse.
  - **El pedido aparta, los abonos lo pagan, la venta nace al entregar.** Los
    precios se congelan al apartar (`reserva_items.precio_usd`); `entregar_pedido`
    registra la venta con ellos, `pago_parcial`, y le enlaza los abonos: la caja
    cuenta cada abono el día que llegó y nunca el total otra vez. Se entrega solo
    con todo el dinero verificado.
  - **Lo que reporta alguien sin sesión es un aviso**, no dinero: no entra a la
    caja hasta que alguien de la tienda lo verifica ("Llegó"). El efectivo y el
    punto no se reportan: los carga la tienda, y quedan verificados.
  - **Lo que falta se cuenta en dólares BCV**: un pedido de $10 a tasa 100 son
    Bs 1.000; si abona Bs 400 faltan $6, que a tasa 110 son Bs 660. Un abono en
    dólares se pasa a bolívares a la tasa Binance del día. Tolerancia: medio
    centavo de dólar BCV, o un centavo de dólar si paga en dólares.
  - **Los abonos se corrigen, no se borran.** La tienda corrige (`editar_abono`)
    o dice que no llegó (`anular_abono`) un abono SIN verificar mientras su
    pedido siga abierto; verificado o cerrado, solo el administrador. La
    vendedora no anula un abono en efectivo ni lo pasa a otra forma de pago (el
    efectivo es lo que se puede esconder). Se recalcula con las tasas del día
    del abono. Cada cambio queda en `abono_cambios` y Pedidos lo enseña.
  - **Cancelar con dinero es del administrador** (`admin_cerrar_pedido`,
    `admin_cerrar_apartado`): se devuelve (sale de la caja como "Devolución",
    el día que se devuelve) o se queda. Un apartado vencido lo archiva
    cualquiera: el dinero se queda, como dice la regla.
- **La caja** (pedida por el dueño el 27/09/2026). Lo que entra y lo que sale de
  la tienda, día por día y mes por mes, en la pantalla Caja del administrador.
  **Lo que entra no se anota: entra solo** (ventas y abonos, por `caja_flujo`);
  se anota lo que sale y lo poco que entra sin ser venta (el dueño mete dinero a
  la caja). Cada movimiento se congela con la receta de un abono: en su moneda,
  en bolívares a la tasa Binance y en dólares BCV, con **la tasa del día del
  movimiento**, no la de hoy. Por forma de pago en su moneda, para cuadrar la
  gaveta, y el total en $ BCV y bolívares. Las categorías son una lista fija, en
  `caja_categoria_valida()` y en `CATEGORIAS_CAJA` a la vez (con "devolucion",
  la que anota sola `admin_cerrar_pedido` al devolver un pedido con dinero).
  Los abonos entran solos, sin anular y, si los reportó alguien sin sesión,
  solo después de verificarse. **No es la
  ganancia** (esa sigue en Reportes) **ni toca Costos**: los precios siguen
  saliendo de los gastos fijos que el dueño escribe allí. Uno es el plan, el
  otro es lo que pasó. Solo el administrador; se anula, no se borra.
- **Los pedidos se cierran.** En Pedidos se entregan (`entregar_pedido`, con las
  piezas de donde haya existencia) o se cancelan. Uno pagado sigue apartando sus
  piezas hasta que se entrega. Los que ya estaban abiertos antes del apartado se
  congelaron con `esquema-abonos-pedidos-de-antes.sql` (`congelar_pedido_de_antes`:
  su total de siempre repartido entre sus piezas en proporción a la etiqueta) y
  reciben abonos como los nuevos, de la vendedora y del administrador. Solo uno
  que no se pudo repartir (una pieza sin precio) se sigue cobrando completo con
  `cobrar_pedido`; esa misma función, con un pedido congelado, pasa por
  `entregar_pedido`: hay un solo camino de pedido a venta.
- **Lo apartado no se vende en el mostrador.** Un pedido dice "2 de esta cadena",
  no de dónde; lo apartado se asigna a las ubicaciones empezando por donde hay más
  (normalmente la bodega), que es el mismo orden en que la entrega las toma.
  `v_existencia_libre` hace el reparto; `v_venta_ubicacion.cantidad` es lo LIBRE
  (con `existencia` y `apartadas` al final) y `registrar_venta` no deja vender lo
  apartado. Mover una pieza apartada sí se puede: sigue siendo del pedido.
- **La vitrina se abre sin sesión**, como el catálogo: lee `v_disponible_publico`
  y sus frases de marca ('TV') son públicas. No enseña nada que no esté ya en el
  enlace de WhatsApp.
- **Las visitas al catálogo** (pedido del dueño del 30/09/2026). La pantalla
  Catálogo, de las dos caras, dice cuántas personas abrieron el catálogo en
  línea hoy, en 7 y en 30 días, y cuántos pedidos entraron por él. Una visita es
  un teléfono en un día; lo que abre la tienda con su sesión no cuenta. Es solo
  una cuenta: no guarda de quién, y no se le enseña a la clienta. Los catálogos
  de los revendedores no cuentan aquí.
- **Clientes.** Cada venta puede quedar a nombre de una clienta del maestro, que se
  busca por cédula o por nombre. De ahí salen el histórico, la garantía (qué se llevó
  y cuándo) y los meses de lavado y abrillantado que le tocan por compra
  (`configuracion.meses_servicio`, que el administrador fija en Costos).
  Al pedir por el catálogo, la clienta escribe primero su cédula: si ya está en el
  maestro se reconoce ("María G.") y confirma sin escribir nada más; si no, llena
  sus datos. El catálogo **no crea** clientas ni cambia su ficha: una clienta nace
  cuando alguien le cobra. La reserva guarda `cliente_id` y en Pedidos sale "Ya es
  clienta".
- **Los revendedores** (decisiones del dueño del 27/09/2026, en la cabecera de
  `esquema-revendedores.sql`). Solo quien él crea en Revendedores: no es para todo
  el mundo, y por eso no importa que salgan más baratos que el tramo del 15 %.
  - **Lo que le sale:** la etiqueta menos `revendedor_descuento_pct` (25 %), nunca
    por debajo de `piso_margen_de`, el piso del tramo, que ya trae mercancía a la
    brecha de hoy, flete, merma, empaque, la parte del mes de alquiler y sueldos y
    el margen mínimo. Las piezas donde el piso no deja rebaja no salen en su
    catálogo. Puede tener un descuento propio (`revendedores.descuento_pct`).
  - **Lo que cobra:** lo pone él, nunca menos que la etiqueta más
    `revendedor_sobre_etiqueta_usd` ($0,10). No le hace la competencia a la tienda.
    Si la etiqueta sube por encima de su precio, manda el mínimo.
  - **El pedido, en dos plazos** (decisión del 30/09/2026, en la cabecera de
    `esquema-revendedores-plazos.sql`). Su clienta pide desde `/#/r/<usuario>`
    (o él vende desde su panel, `rv_vender`) y las piezas salen de lo libre
    `revendedor_horas_pago` (2) horas mientras ella le paga A ÉL, a su pago
    móvil. Cuando ella reporta el pago, las piezas siguen apartadas **hasta que
    él confirme** (el dueño lo eligió así: la clienta que pagó no pierde sus
    piezas). Al confirmar (`rv_confirmar`) el pedido llega a Pedidos y él tiene
    `revendedor_horas_para_pagar` (24) horas para pagarle a Lux, en uno o varios
    pagos (`rv_pagar_lux`). La tienda lo comprueba y lo **aprueba**
    (`aprobar_apartado`): ahí se registra la venta tipo `mayor` a su precio, con
    `revendedor_id`, `motivo_rebaja = 'revendedor'` y **a nombre de su clienta**,
    que entra al maestro si no estaba (sin tocar la ficha si estaba); la pieza
    sale del inventario y queda por entregar hasta que él se la lleva
    (`marcar_entregado`). Si se le pasa el día con un pago parcial, el pedido
    vence y el administrador decide si se le devuelve: pagar un centavo no aparta
    para siempre.
  - **`expira_en` es el plazo de la fase** (infinito mientras espera que alguien
    confirme un pago), así las comprobaciones de siempre siguen bien. Lo mueve
    `apartado_al_dia`; la fase la dice `rv_fase_de`.
  - **Dos deudas, separadas.** Lo que su clienta le paga a él lo lleva en su
    panel (`apartado_abonos`, en dólares BCV). Apartado para su clienta: al menos
    el 40 % y el plazo que él fija en su panel (`revendedores.dias_credito`; sin
    él, su clienta paga todo). Es su crédito: a Lux le paga todo en el día igual.
    Él carga cada pago de ella en su pedido ("Cargar un pago", `rv_abonar`),
    también después de retirar la pieza, hasta que no le deba nada; el que cargó
    mal lo quita (`rv_revisar_pago` con "no llegó": queda tachado, no se borra).
    Su Inicio dice cuánto le deben y lleva a "Te deben".
  - **El tope:** cuánto puede tener apartado a la vez, a lo que le paga a Lux.
    Empieza en $100, sube $50 por nivel hasta $200 cuando ha retirado y pagado dos
    veces la suma de sus topes anteriores ($200 para el 2, $500 para el 3), y baja
    un nivel mientras tenga dos vencidos en 30 días. Para bajar cuentan solo los
    que él dejó vencer después de confirmar, no los que su clienta no pagó en dos
    horas. Todo en `configuracion`, `revendedor_*`, y se cambia en Revendedores.
    El dueño puede fijarle uno a mano.
  - **No tiene sesión de Supabase, y no debe tenerla nunca.** Toda la base da por
    hecho que tener sesión es ser de la tienda (`existencias` acepta cambios de
    cualquier sesión, `clientes` se lee entera). Entra con un código de doce
    caracteres (59 bits, se guarda la huella) y cada `rv_*` recibe su testigo. Si
    alguna vez se piensa en darle una cuenta, primero hay que cerrar todo lo que
    hoy se abre a `authenticated`.
  - **Su paleta:** seis, medidas a 4,5:1 en `estilos/revendedor.css`. Es la única
    excepción a "ningún otro color", y no hay selector de color libre.

---

## Antes de publicar

```bash
npm run verificar     # 164 comprobaciones con las dos sesiones (169 con LUX_REVENDEDOR). Sale 1 si algo se abrió.
npm run build         # tsc --noEmit + vite build
```

`verificar` es obligatorio después de tocar **una vista, un permiso, una función o
una política**. Si no hay terminal a mano, la pantalla **Verificación** hace treinta y cuatro
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

- **`v_venta_ubicacion.cantidad` es lo libre, no lo que hay.** Para mover piezas o
  contar el inventario físico se usa `existencia`. Confundirlas es mover solo lo
  libre o vender lo apartado.
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
- **Una variable de CSS que usa otra se resuelve donde se declara.** `--texto` vale
  `var(--verde-profundo)` en `:root`; cambiar `--verde-profundo` en un contenedor no
  cambia `--texto` ahí dentro. Por eso `.tema-rv` vuelve a derivar los tokens de
  texto y sombra, y `.tema-rv--lux` está en el bloque de `:root` de `tokens.css`: sin
  eso, la muestra "Lux" salía del color de la página donde estaba.
- **Dos caminos a la venta cuentan dos veces en la caja.** La caja cuenta el
  total de una venta cobrada completa, y abono por abono la de por partes. Si
  un pedido con abonos se cerrara por el `cobrar_pedido` de antes (una venta
  "completa"), su dinero entraría dos veces. Por eso hay UN camino de pedido a
  venta (`vender_congelado`, detrás de `entregar_pedido` y `aprobar_apartado`),
  las funciones viejas pasan por él, y un disparador en `abonos` no deja que un
  abono cuelgue de una venta que no sea por partes. Se vio en la revisión del
  30/09/2026, antes de publicar.
- **Una vista tampoco presta permiso a las funciones que llama por dentro.**
  `v_pedido_vendedora` y `v_abonos_detalle` usan `saldo_padre_bcv` y
  `total_padre_bcv`: si esas se revocan a `authenticated`, Pedidos entero
  responde "permission denied". Las que no llevan costo se abren a la tienda;
  las que sí (`precio_de_linea`, con el costo de la pieza) se quedan cerradas y
  solo las llaman funciones de definidor.
- **Dos erratas viejas impedían instalar desde cero**, y nadie lo sabía porque en
  producción ya estaba todo corrido: un `$` suelto en `esquema-fase2.sql` y la
  palabra `creoq` al principio de `esquema-descuentos.sql` (corregidas en
  septiembre de 2026). Salieron al montar la instalación entera en una base
  Postgres en memoria (PGlite) para probar `esquema-revendedores.sql`: es la
  forma de probar un `.sql` grande sin tocar la base de producción.

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
