# Lux by Emory — léeme antes de tocar nada

Sistema de inventario, punto de venta y catálogo de una joyería hipoalergénica en
Sabana de Mendoza, Venezuela. Vite + React 19 + TypeScript estricto + CSS plano,
Supabase detrás y Cloudflare delante (desde la fase 2, 19/11/2026): Lux en
`luxbyemory.com`, el personal en `entrar.luxbyemory.com` y cada revendedor en
`<usuario>.luxbyemory.com`.

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
                pieza.ts (la página de una pieza del catálogo, `?pieza=`:
                leer la ruta, su ruta y el texto para compartirla, sin precio),
                escotes.ts (qué collar va con cada escote, por su largo, y
                cuándo los aretes completan o lo reemplazan; para la vitrina),
                combinar.ts (qué va con qué: la parte del cuerpo y el tono
                de cada pieza, y `armarConjunto` para la vitrina),
                vendedoras.ts (llama a la función de servidor de las cuentas),
                visitas.ts (el catálogo público cuenta su visita),
                armados.ts (qué dije va en qué base, en los dos catálogos),
                enlaces.ts (WhatsApp, Maps e Instagram estrictos: sin un
                dato válido no hay enlace; la referencia "LX-3F9A2C" y el
                aviso de un pedido por WhatsApp),
                ofertas.ts (las ofertas sin red: normalizar un código, qué
                códigos aplican a un carrito, `faltanParaTramo`, la pareja que
                se ofrece, `efectoDeRomperCodigo`, `estadoDeCasa`),
                ofertasApi.ts (llama a `ofertas_publicas`, `emitir_oferta`,
                `ver_oferta` y manda las miradas con `keepalive`)
                grupoSugerido.ts (qué grupo de precio pone la máquina en el
                formulario de una pieza: sigue al costo hasta que el dueño elige),
                menu.ts (el menú del administrador por grupos y sus tres de
                abajo: Inicio, Mostrador, Pedidos; `agruparEnlaces`),
                inicio.ts ("Para hoy" del Inicio desde `admin_inicio`),
                flujo.ts (agrupa y nombra lo que da `admin_flujo`; los períodos),
                dominio.ts (LA regla de direcciones, pura: en qué dirección
                está la app, qué ruta se abre ahí y a dónde lleva la que no,
                las direcciones de cada cosa, los usuarios reservados y el
                enlace viejo con `#/`), direccion.ts (lo único que lee el host
                y `VITE_DOMINIO_BASE`; la ruta del catálogo en cada dirección)
  hooks/        useSesion, useTasa, useCatalogos, useCarrito, useClientes,
                useInventario (pagina por PRODUCTO: una familia nunca queda
                partida entre dos páginas), useTextos, useFrases, useConsejos,
                useReglasPedido (el mínimo del apartado, sus días y los
                minutos de un pedido, de `reglas_pedido()`; null sin el #61),
                useFotosGrandes (la foto grande de piezas que solo traen su
                miniatura: pedidos, compras de una clienta),
                useLetraGrande ("Letra grande" del catálogo y del pedido:
                sube la escala un paso, se recuerda en el teléfono),
                useLanding (las secciones de `v_landing`; null sin el #65),
                useOfertas (lo que ofrece la base y los códigos de la clienta,
                en `lux-codigos-v1`; se llama UNA vez, en Catalogo, y se pasa
                hacia abajo), useMiradas (cuánto mira una pieza y cuándo
                ofrecerle la pareja), useAparecer (algo entra al verse),
                useCodigosDePedidos (el código de cada línea, para Pedidos)
  componentes/  Disposicion (las secciones de la tienda), Armazon (la barra
                lateral y la de abajo, de la tienda y del revendedor), Piezas
                (Aviso, Campo, Cargando, Vacio, Filtros, Ayuda), Iconos,
                Marca, VisorFoto (detalle que pasa de pieza; abre en la
                medida que se tocó; una segunda acción, "Agrégale un
                dije", en las bases), MiniaturaTocable (la foto pequeña que
                se toca para verla en grande), ElegirVariante
                (la hoja de medidas; con muchas, en fichas), ArmarDije (la hoja de "Agrégale un
                dije", sobre ElegirVariante), VisitasCatalogo (cuánta gente abre el
                catálogo, en la pantalla Catálogo), TusDatos (el pedido público empieza por
                la cédula), MoverUbicacion (pasar piezas de una ubicación a
                otra), CargarAbono (un abono en dólares BCV, de la tienda y
                del revendedor), ListaAbonos (cada abono con lo que quedaba
                después, verificar, corregir con historial y "no llegó"),
                ReportarPago (un pago a distancia con su referencia, sin
                sesión o del revendedor), PagoMovil (datos para copiar, de
                Lux o del revendedor), Graficos, Progreso, Recordatorio,
                Banda (la cifra que manda en verde, una por pantalla del
                administrador: el Estuche de la fase 9),
                CompartirCatalogo (y `enlacePublico`, el enlace del
                catálogo), CodigoQr (el QR de la vitrina, con `uqr`),
                Filigrana (las líneas de oro de la vitrina que se dibujan),
                SiluetaEscote (el busto de cada escote, a línea),
                BuscadorCliente, RutaProtegida, DescuentoClienta (el
                descuento fijo en la ficha de una clienta), CreditoClienta
                (sus días de crédito y su tope, en su ficha), FichaDeRevendedor
                (enlaza un revendedor con su ficha de clienta),
                InventarioDeRevendedor (lo que tiene en la mano, en
                Revendedores y Crédito),
                LaTienda (dirección con "Cómo llegar", horario, WhatsApp,
                Instagram y "Cómo pagar"; SOLO en el de la tienda, en la
                banda verde del estilo A),
                LetraGrande (el botón "Letra grande" de la cabecera del
                catálogo y del pedido), ElegirPara ("Todas · Dama ·
                Caballero", de los dos catálogos en línea)
  paginas/
    admin/      Inicio (/admin: el dueño entra aquí; la Banda del mes y
                "Para hoy", lo pendiente con su botón), Flujo (/admin/flujo:
                salió, entró y queda, $ Binance y $ BCV lado a lado, y la
                mercancía sin rastro por lote),
                Inventario (un producto por fila; sus medidas se abren
                debajo; "Próximamente" lo que no ha llegado),
                FormularioModelo, Lotes ("Todavía no ha llegado"),
                LoteEnCamino (/admin/lotes/:id: lo que viene en un lote,
                la reposición, "Eliminar" lo nuevo que se cargó mal y
                "Revisar y liberar"; liberado, lo que llegó), Grupos, Tramos,
                Costos, Inversiones, Reportes, Textos, Revendedores, Vendedoras,
                Caja (lo que entra y lo que sale, día por día y mes por mes),
                Credito (/admin/credito: quién le debe a la tienda, venta por
                venta, con sus pagos y "Cargar un pago"),
                Landing (/admin/landing: Secciones, Ofertas y Resultados;
                con admin/landing/: secciones, ofertas y resultados),
                CapacitacionRv ("Capacitación revendedores": el enlace de la guía
                y de dónde saca cada dato)
    venta/      Mostrador, Pedidos ("Quitar" una pieza de un pedido sin
                entregar o de una venta por verificar, con su historia),
                Codigo (/venta/codigo: la tienda revisa un código de oferta y
                lo pasa al cobro, de las dos caras),
                Tablero, Cierre, Guia,
                ConteoSemanal (el conteo de inventario: a ciegas, contra la
                foto de lo FÍSICO, con borrador en el teléfono, cada producto
                con sus medidas dentro y los conteos anteriores; no cambia el
                inventario: lo que no cuadra lo ajusta, lo deja o lo deshace
                el administrador ahí mismo)
    publico/    Catalogo (la ruta: elige qué dibujar; el inicio: portada,
                tipos con foto y "Todas las joyas", un estante por tipo,
                "Así pides", Próximamente y la tienda; `?tipo=`,
                `?ver=todas`, una búsqueda o el orden por precio abren la
                lista; `?pieza=` la página de una pieza; `?paso=pedido` el
                pedido), useCatalogoLux (el cerebro: TODA la lógica que
                vivía en Catalogo, movida tal cual en la fase 10; no
                dibuja), caras/ (lo que se ve, estilo A de la fase 10:
                Cabecera con el buscador siempre en el mismo nodo y
                BotonLetra, BarraPedido, Tarjeta, Estante y TiposConFoto,
                Lista, PaginaPieza, Pedido, ComoPedir con `irA`, iconos),
                Reserva (con "Avisar a la tienda por WhatsApp"),
                GuiaRevendedor (/guia-revendedor, la guía
                para quien quiere ser revendedor) con GuiaRevendedorPiezas
                (calculadora, recorrido, manual, preguntas, solicitud)
    publico/landing/  Landing (arma las secciones de `v_landing`; sin ellas,
                el inicio de siempre), Puertas (una fila de enlaces bajo la cabecera),
                Portada (el slider), Cintas, Historia (Nosotros y Buscamos),
                Materiales, Galeria, VideoLanding, Redes, SeccionesCatalogo,
                Estuche, Combos (y Regalo), Seleccion, OfertasCasa, Escote,
                TusCodigos, Completalo (la pareja y "Complétalo"),
                VentanaOferta (el código para guardar) y PiezasOferta
                                           (sin sesión)
    revendedor/ catalogo/ (su catálogo, /r/:usuario o su subdominio,
                FUERA del sistema visual de Lux, fase 6): CatalogoRv (la
                ruta: aplica su tema y monta su plantilla), useCatalogoRv
                (el cerebro: toda la lógica, no dibuja), fuente.ts (de
                dónde saca los datos; en desarrollo `?demo=1` usa demo.ts,
                un revendedor de muestra que no llega al build), tema.ts
                (normalizar, contraste a 4,5:1, colores derivados, temas
                listos), letras.ts (las cinco letras de títulos y la de
                texto de cada plantilla, `import()` al pedirlas),
                plantillas/ (Editorial, Tienda, Lookbook, cada una con su
                CSS), piezas/ (Marca, Buscador, Tarjeta, Ficha, el pedido
                en una hoja, la línea de Lux), catalogo-rv.css,
                EditorTemaRv (el editor del tema, de su panel y de
                Revendedores); ApartadoPublico (/apartado/:token, con su
                tema)                      (sin sesión, como el catálogo)
                EntrarRevendedor (/rv/entrar), Panel (/rv) con panel/
                InicioRv (lo urgente primero, cada cosa con su botón),
                ApartadosRv ("Pedidos", por fase), VenderRv (Vender en
                tres pasos, Piezas → Clienta → Cobro, con barra fija; sus
                piezas en vender/: cuentas.ts, la lógica pura y probada,
                PasoPiezas, PasoClienta, PasoCobro, BarraVender, Listo),
                InventarioRv ("Mi inventario": lo que compró para
                revender, y corregirlo con un motivo),
                ClientesRv, PreciosRv, MiCatalogoRv (su pago móvil, su
                logo y su tema), temaPanel.ts (el panel se viste con el
                tema de su catálogo: deriva los tokens de Lux, medidos a
                4,5:1) y panel-rv.css (densidad táctil)
                                           (con SU código, no con Supabase)
    Vitrina (el escenario y el riel del QR; escenas: pieza, conjunto,
    colección, para regalar, de cerca, frase, escote, así de fácil y
    próximamente)                          (sin sesión, como el catálogo)
    Clientes (la ficha: cada compra con su foto y, para el
    administrador, "Devolver"), Tasas, CatalogoPdf (con "Próximamente"
    en su página al final), Entrar,
    Verificacion                           (las de las dos caras)
  estilos/      tokens.css (paleta), base.css, vitrina.css, impresion.css,
                revendedor.css (las seis paletas de su panel, medidas; su
                catálogo tiene su propio CSS en revendedor/catalogo/),
                guia-revendedor.css (la guía pública),
                publico.css (lo público de Lux en el estilo A de la fase 10,
                todo bajo `.pub`), landing.css (la landing y sus ofertas,
                también estilo A, clases `lp-*`), panel-landing.css,
                codigo.css (la pantalla Código)
public/landing/ las fotos de la landing, en dos anchos (1600 y 800 px); las
                prepara `scripts/preparar-landing.mjs` (ESTADO.md)
supabase/functions/vendedoras   crea, pausa y cambia el PIN de las vendedoras
                del local con la llave maestra, en el servidor de Supabase.
                Se publica aparte (INSTALACION.md, 3.1); no va en el build.
supabase/functions/logo-revendedor   el revendedor sube su logo desde su
                panel: mira su testigo, que sea WebP, PNG o JPEG de menos de
                300 KB (reglas.ts) y lo guarda con la llave maestra
                (INSTALACION.md, 3.2).
wrangler.jsonc  Cloudflare: sirve dist/ (cualquier ruta → index.html), los
                dominios y el comodín *.luxbyemory.com
cloudflare/     worker.js (solo cambia la tarjeta de vista previa en el
                subdominio de un revendedor) y tarjeta.mjs (qué dice, puro)
reenvio-github/ lo único que sirve ya GitHub Pages: robertsrf.github.io/Lux/#/x
                → luxbyemory.com/x (hay imágenes publicadas con la vieja)
```

- **TypeScript estricto, sin `any`.** Dominio en español, API de React en inglés:
  `precioUsd`, `costoPuesto`, pero `useState`, `handleClick`.
- **CSS plano sobre variables de `tokens.css`.** Sin Tailwind, sin CSS-in-JS.
- **`BrowserRouter`, rutas sin `#`** (desde el 19/11/2026: el dueño quiso
  `luxbyemory.com/rv`, no `/#/rv`). Cloudflare devuelve `index.html` en
  cualquier ruta y la vista previa de WhatsApp ve un 200. Antes era
  `HashRouter` porque GitHub Pages no sabía. **Ninguna pantalla arma una
  dirección a mano**: todo sale de `lib/dominio.ts` (`urlTienda`,
  `urlEntrar`, `urlRevendedor`) y `lib/direccion.ts`; `PorDireccion`
  (`App.tsx`) lleva cada ruta a la dirección que le toca. Un enlace viejo
  con `#/` se convierte en `main.tsx` antes de montar el router.
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
tres secciones diarias y un botón "Más" (las del administrador, Inicio, Mostrador y
Pedidos desde la fase 9; su menú va por grupos, en `lib/menu.ts`). **El estilo
Estuche** (fase 9) vive dentro de `.armazon`, la cara con sesión y el panel del
revendedor: las páginas públicas usan el mismo `base.css` y se rehacen en la fase 10. No es una hamburguesa arriba a la
izquierda, y no por moda: esa esquina es la que peor alcanza el pulgar de quien
sostiene el teléfono con una mano y joyas con la otra.

### Y fuera de la tienda: los revendedores

Personas elegidas por el dueño que venden las joyas a su propia clientela. Cada
uno tiene su catálogo (`<usuario>.luxbyemory.com`, con su nombre y su paleta) y su
panel (`luxbyemory.com/rv`), con el mismo armazón que la tienda vestido de sus
colores. **No es una
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
`registrar_visita` y se lee por `visitas_catalogo`) ·
`reserva_armados` (qué dije va en qué base en un pedido del catálogo, con
cuántas; revocada a todos, se escribe por `crear_reserva(..., p_armados)` y se
lee por `v_pedido_armado`).
`modelos.para` dice para quién es el producto: `dama`, `caballero` o `unisex`
(null: sin marcar); lo llevan todas sus medidas (`modelo_hereda_para` se lo
copia a una medida nueva) y lo cambia `admin_fijar_para` (#67).
`modelos.armado` dice si la pieza es un **dije** o una **base** para armar
(null: una pieza como cualquiera); `grupos_precio.escalera`, si el grupo es de
la escalera de las piezas o de la de los dijes; `venta_items.es_dije`, si la
línea era un dije al venderse (lo congela el disparador `venta_items_dije`).
Los gastos fijos del mes no son una tabla: son claves de `configuracion` que lee
`gastos_fijos_partidas()`.
`lotes.en_camino` dice que el lote todavía no llega (`liberado_en` y
`liberado_por`, cuándo y quién lo puso a la venta) · `por_llegar` (lo que
viene en un lote en camino: pieza, ubicación a la que va, cuántas se esperan
y, al liberar, cuántas llegaron; revocada a todos, se lee por `v_por_llegar`).
**Una pieza cuyo lote está en camino no tiene existencia**: lo suyo vive en
`por_llegar`, y el disparador `existencia_no_en_camino` no deja escribirle
existencia por ningún camino (ni el conteo ni el SQL Editor). Otro,
`modelo_no_pasa_a_lote_en_camino`, no deja mover a un lote en camino una
pieza que ya tiene piezas en la tienda.
`perfiles.numero_vendedora` es el número de cada vendedora del local (los dos
primeros dígitos de su código); null en los administradores y en la cuenta de
antes.
`existencias`, `conteos` y `conteo_detalle` no se escriben en crudo con
ninguna sesión, tampoco la del administrador (desde
`esquema-conteo-y-cotizar.sql`): solo por sus funciones de definidor, que
dejan rastro. Leer sí. Una función nueva que escriba existencias tiene que
ser de definidor.

**La landing y las ofertas** (#65, #66). Todas revocadas a todos, ni el
administrador las lee en crudo (se leen por sus vistas y se escriben por sus
funciones): `landing_secciones` (cada sección: tipo, orden, visible, título,
texto y `datos`) · `catalogo_miradas` (por día y pieza: veces y segundos, sin
visitante; con `on delete cascade` a `modelos` para no impedir
`admin_eliminar_de_lote`) · `ofertas_casa` y `oferta_casa_items` (las ofertas
que crea el dueño) · `seleccion_manual` (piezas metidas o sacadas a mano de la
Selección) · `combos_rearmados`, `combos_semana` y `combo_semana_items` (los
combos de la semana, armados por el navegador del administrador) ·
`ofertas_codigos` (cada código: origen, porcentaje, visitante, vencimiento,
estado `emitido`, `tomado`, `usado` o `anulado`, el pedido o la venta que lo
tiene y `roto_en`) · `ofertas_codigo_items` (sus piezas). Las líneas de
pedidos y ventas ganan `oferta_codigo_id`, `precio_sin_oferta_usd`,
`motivo_sin_oferta` (y en la venta `precio_sin_oferta_bs`);
`venta_items.motivo_rebaja` acepta `oferta`.
Las diez cifras de las ofertas viven en `configuracion` (`claves_ofertas()`
las lista): `ofertas_encendidas` (el interruptor), `oferta_pareja_pct`,
`oferta_min_pct`, `oferta_max_pct`, `seleccion_pct`, `seleccion_dias_sin_venta`,
`regalo_tope_usd`, `oferta_dias_validez`, `oferta_codigos_dia_max` y
`oferta_mirada_segundos`. **Solo ellas pueden quedar vacías** (una restricción
lo dice): sin una cifra, la oferta que depende de ella no sale. Ninguna la
inventa el código.

De los revendedores, todas revocadas a `anon` y `authenticated` (se tocan por sus
funciones): `revendedores` (con la huella de su código, nunca el código, y
`cliente_id`, su ficha en el maestro de clientas, desde el #70, y `tema`,
cómo se ve su catálogo, desde el #73, con `check (rv_tema_valido(tema))`) ·
`revendedor_sesiones` · `revendedor_precios` (el que él le pone a cada pieza) ·
`revendedor_clientes` (sus clientas; entran al maestro de la tienda cuando se
aprueba su pedido) · `apartados` (su pedido: `expira_en` es el plazo de la fase
en que va) · `apartado_items` (los tres precios congelados: etiqueta, lo que
paga a Lux y lo que cobra a su clienta; `de_su_inventario` si la línea sale
de lo suyo, con `precio_lux_usd` en 0, #72) · `apartado_abonos` (lo que su
clienta le paga a ÉL; lo que ella reporta es un aviso hasta que él lo
confirma) · `revendedor_ajustes` (lo que él corrige a mano en su inventario,
con signo y motivo; no se borra, #72).
`reservas` y `reserva_items` guardan el precio congelado de cada pieza y ya no
se escriben con ninguna sesión: solo por sus funciones.
`reservas.apartado_pct` es el % mínimo con que se confirmó un apartado,
congelado por `pedido_al_dia` (desde `esquema-catalogo-claro.sql`): si lo
pagado sin anular baja de ahí, el pedido se suelta; si el dueño cambia el
40 %, los que ya estaban no se sueltan solos.
`apartados`, sus líneas y sus abonos no se borran, como las ventas.
`ventas.revendedor_id` dice qué venta fue a un revendedor.
`ventas.inventario_de` dice que la venta fue PARA EL INVENTARIO de un
revendedor (#72): sus piezas salen en su catálogo. No es `revendedor_id`
(esa saca la venta de la meta; esta cuenta, decisión del dueño).
`ventas.credito_vence` dice que la venta es A CRÉDITO y hasta qué día (de
Venezuela) tiene la clienta para pagarla (#71); `clientes.credito_dias` y
`clientes.credito_tope_usd` son su permiso (solo `admin_fijar_credito`).
`ventas.extra_bs` y `ventas.extra_nota` son lo que se sumó al cobro fuera del
catálogo (un dije) y qué era; ya va dentro de `total_bs`.
`ventas.devolucion_de` dice que esa "venta" es una NOTA DE CRÉDITO de otra:
sus líneas van en negativo (`venta_items.devuelve_item_id`, la línea que
devuelven), con las tasas de la venta original. Un disparador
(`venta_items_signo`) solo deja cantidades negativas ahí.
`pedido_cambios` (revocada, se lee por `v_pedido_cambios`) es la historia
de lo que se quitó de un pedido: antes, después, total, el dinero, quién y
por qué. Una línea quitada de `reserva_items` queda en cero, no se borra.
`venta_cambios` (revocada, se lee por `v_venta_cambios`) es lo mismo para
una venta por verificar. Una línea de `venta_items` puede quedar en cero
SOLO en una venta por verificar (lo vigila `venta_items_signo`); en una
verificada, ninguna línea baja a cero, ni desde el SQL Editor.

### Las vistas, que es por donde entra la vendedora

| Vista | Qué da | Quién |
|---|---|---|
| `v_catalogo_venta` | El catálogo **sin una sola columna de costo**, y sin lo que no ha llegado | vendedora y admin |
| `v_venta_ubicacion` | Lo mismo, desglosado por ubicación | vendedora y admin |
| `v_disponible_publico` | El catálogo público, menos lo reservado. La ubicación va **en clave** (`V1 · BG`), nunca con el nombre | cualquiera, sin sesión |
| `v_catalogo_admin` | Agrega costo y margen; filtra con `es_admin()`. Trae también lo próximo (`proximamente`, `por_llegar`, `por_llegar_lotes`) | solo admin |
| `v_catalogo_base` | Las fórmulas del catálogo, con lo próximo dentro: de ella cuelgan `v_catalogo_venta` (sin lo próximo) y `v_catalogo_admin` (con todo) | nadie: la leen las otras vistas |
| `v_proximamente` | Lo nuevo de un lote en camino: foto, nombre, precio. Sin cantidad, ubicación ni pisos. La leen el catálogo en línea, el PDF y la vitrina | cualquiera, sin sesión |
| `v_por_llegar` | Lo que viene en cada lote, línea por línea: nueva o reposición (y cuántas hay ya), a dónde va, cuántas se esperan y cuántas llegaron | solo admin |
| `v_clientes` | El maestro de clientes con su resumen de compras, su descuento fijo (`descuento_pct`), qué revendedor ES esa clienta (`es_revendedor`; `revendedor` es de quién es clienta) y su crédito (`credito_dias`, `credito_tope_usd`) | vendedora y admin |
| `v_cliente_compras` | Qué se llevó cada clienta y cuándo, con cuántas devolvió de cada línea (las notas de crédito no salen como compra) | vendedora y admin |
| `v_pedido_cambios` | Lo que se quitó de cada pedido: cuántas había y cuántas quedaron, el total antes y después, qué pasó con el dinero, quién y por qué | vendedora y admin |
| `v_venta_cambios` | Lo mismo para una venta por verificar, con los totales en bolívares | vendedora y admin |
| `v_pedido_armado` | Qué dije va en qué cadena o pulsera, en cada pedido del catálogo | vendedora y admin |
| `v_pedido_vendedora` | Los pedidos del catálogo y los apartados del mostrador que siguen abiertos, con dónde está cada pieza, su fase, lo pagado, lo verificado y lo que falta; y los vencidos con dinero, para archivarlos | vendedora y admin |
| `v_abonos_detalle` | Cada abono con su padre, si se verificó, si no llegó, si se corrigió y lo que faltaba después de él | vendedora y admin |
| `v_abono_cambios` | Lo que decía un abono antes de cada corrección, quién la hizo y por qué | vendedora y admin |
| `v_ventas_por_verificar` | Las ventas cobradas sin comprobar el pago: quién vendió, cómo pagó, la referencia, lo sumado fuera del catálogo y, si es por partes, cuánto falta; y al final (#71) `credito_vence` y la etiqueta de cada línea (`precio_lista_bs`) | vendedora y admin |
| `v_credito` | Cada venta por partes abierta con clienta (a crédito, o de antes sin plazo): la clienta, su descuento y su crédito, total, pagado, lo que falta (`falta_bcv_de`), cuándo vence y si venció | solo admin |
| `v_abonos` | Cada abono de una venta por partes: cuándo, cómo, cuánto, la referencia y quién lo cargó | vendedora y admin |
| `v_existencia_libre` | Por pieza y ubicación: lo que hay, lo apartado por pedidos y lo libre | vendedora y admin |
| `v_plan_ventas` | Cuántas piezas hay que vender: lo que deja cada pieza contra los gastos fijos | solo admin |
| `v_tasas` | El histórico de tasas con el nombre de quien fijó cada una | vendedora y admin |
| `v_rebajas` | Cada pieza vendida por debajo de su etiqueta: cuánto, por qué (regateo, tramo, revendedor, oferta o cliente), quién vendió y a nombre de quién (`cliente_id`, `cliente`, desde el #70) | solo admin |
| `v_apartados_revendedor` | Los pedidos de revendedores desde que él confirma: su fase, lo que le paga a Lux, lo pagado y lo que falta, la clienta (cédula y teléfono) y dónde está cada pieza; los aprobados hasta que se los lleva. Nada de lo que él cobra a su clienta | vendedora y admin |
| `v_revendedores` | Cómo va cada revendedor: su nivel, su tope, lo apartado, lo que pagó en el mes, y su ficha de clienta (`cliente_id`, `cliente_nombre`) | solo admin |
| `v_inventario_revendedores` | Lo que cada revendedor tiene de lo que compró para revender, por pieza: cuántas, cuántas en pedidos de sus clientas y cuántas libres (#72) | solo admin |
| `v_vendedoras` | Cómo va cada vendedora del local: sus piezas de hoy y del mes, en $ BCV, y su última venta. Sin lo que retiran los revendedores | solo admin |
| `v_caja` | Cada movimiento anotado en la caja, con quién lo anotó y, si se anuló, quién y por qué | solo admin |
| `v_conteos` | Cada conteo de inventario: cuándo, qué ubicación, quién, cuántas piezas y cuántas faltaron o sobraron | vendedora y admin |
| `v_conteo_detalle` | Las líneas de un conteo: lo que esperaba el sistema y lo que se contó. Sin costo | vendedora y admin |
| `v_margen_ventas`, `v_diagnostico`, `v_capex_lote` | Ganancia y costos | solo admin |
| `v_landing` | Las secciones visibles de la landing, en orden, sin una cifra de dinero. Solo `select` (sin el `revoke` previo, cualquiera podía escribir en ella) | cualquiera, sin sesión |
| `v_landing_admin` | Todas las secciones, las escondidas también, con si se repiten y quién las tocó | solo admin |
| `v_miradas` | Lo más mirado en 30 días (veces, segundos) y cuántas se vendieron | solo admin |
| `v_ofertas` | Cada código con su estado de verdad y sus piezas | solo admin |
| `v_ofertas_mes` | Por mes y origen: códigos dados y usados, lo vendido y lo rebajado en $ BCV | solo admin |
| `v_seleccion_admin` | La Selección de la casa entera, con por qué está (automática, metida o sacada) | solo admin |
| `v_ofertas_casa_admin` | Todas las ofertas de la casa (futuras, terminadas, apagadas), con sus piezas y sus códigos (#66) | solo admin |
| `v_combos_admin` | Los combos del último rearmado, se enseñen o no hoy (#66) | solo admin |

`v_pedido_vendedora`, `v_ventas_por_verificar` y `v_cliente_compras` ganaron al
final (#66) `oferta_codigo`, `oferta_pct` y el precio sin oferta de cada línea
(null sin código; ninguna de costo): con eso Pedidos dice "Código LUX-… · 5 %"
y avisa cuánto sube el resto antes de quitar o devolver.

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
`admin_anotar_caja`, `admin_anular_caja`, `registrar_conteo` (el conteo de
inventario, de las dos caras), `quitar_de_pedido` (una pieza fuera de un
pedido sin entregar, de las dos caras), `quitar_de_venta` (una pieza fuera
de una venta por verificar, de las dos caras), `admin_devolver_pieza` (la
nota de crédito de una pieza ya entregada), `admin_guardar_por_llegar` (la
reposición: cuántas más de una pieza que ya se vende vienen en un lote en
camino), `admin_liberar_lote` (lo que llegó, a la existencia) y
`admin_eliminar_de_lote` (borra un producto que se cargó mal en un lote que
todavía no llega, con todas sus medidas y lo que se esperaba; nada de un lote
que ya llegó, y si tiene historia no borra nada y lo dice) y
`admin_fijar_para(modelos, para)` (dama, caballero o unisex, a familias
enteras; la llaman el formulario después de `admin_guardar_modelo` y el
selector de cada producto en el Inventario), `admin_descuento_cliente(cliente, %)`
(el descuento fijo de una clienta; null o 0 lo quita) y
`admin_enlazar_cliente_revendedor(revendedor, cliente)` (su ficha; null la
suelta; una ficha es de un solo revendedor), `admin_fijar_credito(cliente,
días, tope)` (0 o null en días quita el crédito y el tope) y
`vender_a_credito(items, cliente, método, pago, referencia, verificado,
extra, nota, códigos)` (de las dos caras; ver "El crédito") y
`admin_anular_credito(venta, devolver, método, monto, motivo)` (la devolvió
entera: con pagos, se dice qué pasa con el dinero) y
`vender_para_inventario(...)` (los mismos argumentos que `registrar_venta`:
la llama tal cual y le pone `inventario_de`; solo con la ficha de un
revendedor; `vender_a_credito` gana `p_para_inventario` al final, #72, y
`p_dias` después, #77: los días de esa venta, aunque su ficha no tenga
crédito; una sola firma).

`admin_reasignar_grupos` ("Poner cada una en su grupo", desde
`esquema-lote-y-grupos.sql`) calcula lo de tienda, la brecha y la merma una
vez, y el costo de cada pieza con `costo_bcv_con(costo, es_dije, brecha,
merma, tienda)`: la fórmula sola, revocada a todos, que también llaman
`costo_total_bcv` y `costo_bcv_pieza` con las cifras de hoy. Una función que
costee muchas piezas de una vez hace lo mismo: las cifras comunes una vez,
nunca `costo_bcv_pieza` por fila dentro de otra búsqueda (ver Trampas).

`admin_guardar_modelo` (y `guardar_variantes_de`) guardan la cantidad con
`guardar_cantidades_de`, por dentro: a `existencias` si el lote de la pieza
ya llegó, a `por_llegar` si no. El navegador manda lo mismo de siempre; la
base decide dónde va. Si a una pieza que venía en un lote en camino se le
pone uno que ya llegó, sale a la venta con lo que diga el formulario (la
pantalla lo avisa antes de guardar). `admin_guardar_lote` ganó `p_en_camino`
al final (null: como estaba); el estado solo se cambia ahí mientras el lote
no tenga nada cargado.

`admin_liberar_lote(lote, llegaron)` recibe una fila por CADA línea de lo
que viene (pieza activa y ubicación) con lo que llegó: si falta una o sobra
una, alguien cargó algo mientras se revisaba y no libera a medias, pide
recargar. Primero el lote deja de estar en camino (si no, el disparador no
dejaría escribir la existencia), después SUMA lo que llegó (en una
reposición ya había piezas) y la fecha de llegada del lote pasa a ser la de
hoy en Venezuela. Lo esperado y lo que llegó quedan en `por_llegar`.

`registrar_conteo(ubicación, detalle, notas)` recibe solo lo contado, cada
línea con `contada` y `vista` (la existencia FÍSICA que la pantalla vio al
empezar). Si al guardar ya no es esa (se vendió o se movió mientras se
contaba), esa línea no se toca y vuelve en `cambiaron` para contarla otra
vez; las demás se guardan. Toma el mismo candado por pieza que la venta.
**Desde `esquema-conteo-autorizado.sql` no escribe el inventario**: anota, y
lo que no cuadra queda `conteo_detalle.ajuste = 'pendiente'` (y `por_revisar`
en la respuesta). Lo decide el dueño con `admin_resolver_conteo(conteo,
líneas, aplicar, nota)`: aplicar suma la DIFERENCIA a la existencia de hoy
(lo vendido después del conteo sigue vendido), nunca por debajo de cero ni
del total que apartan los pedidos (esas líneas vuelven en `rechazadas` con su
porqué); no aplicar la deja 'descartado'. `admin_deshacer_conteo(conteo,
nota)` vuelve atrás lo que un conteo ajustó ('aplicado' → 'revertido'), por
la misma diferencia. Las líneas de antes que no cuadraban quedaron
'aplicado': las ajustó la función vieja, y así se pueden deshacer.
`registrar_conteo_semanal`, la de antes, ya no escribe: rechaza con un aviso
de recargar (borraba lo apartado; ver Trampas).

`cotizar_pedido(items)` es el total del carrito del catálogo público, sin
sesión: llama a `precio_de_linea` con el tramo, igual que `crear_reserva`,
así la barra dice lo que el pedido congela. Devuelve el total y cada línea a
su precio, ninguna clave de costo (`verificar` lo vigila). Una pieza retirada
o sin precio sale en `sin_precio` y no tumba la cuenta. **No cotiza más piezas
de las que hay libres** (sumadas por pieza), igual que `crear_reserva`: cuando
el piso de margen manda, el precio de la línea es el piso, y sin ese tope
cualquiera sin sesión sacaba el piso de todo el catálogo pidiendo "20 de una
pieza que tiene 1" (revisión de seguridad del 14/10/2026). Con el tope no
enseña nada que no enseñe un pedido que se podría apartar. Ojo: hasta el #60
`crear_reserva` miraba lo libre **línea por línea**, no sumado, así que veinte
líneas de "1" de una pieza que tiene 1 pasaban y llegaban al tramo (revisión de
seguridad del 21/10/2026). Desde `esquema-dijes.sql` lo mira sumado por pieza,
con el mismo tope de 300 líneas.

Del catálogo claro (`esquema-catalogo-claro.sql`, revisión de seguridad del
24/10/2026):
- `reglas_pedido()`, sin sesión: `apartado_inicial_pct`, `apartado_dias` y
  `reserva_minutos`, nada más (`configuracion` sigue cerrada a `anon`: ahí
  está el margen mínimo). `verificar` vigila las tres claves.
- **El tope de pedidos sin pagar**: el disparador `reservas_tope_sin_pagar`
  no deja más de `pedidos_sin_pagar_max` (2, en `configuracion`; 0 sin tope)
  pedidos del catálogo esperando el pago con la misma cédula o el mismo
  teléfono (sus diez últimos dígitos). Esperan el pago los abiertos y
  también los apartados cuyo dinero COMPROBADO no llega al mínimo: un 40 %
  reportado e inventado no saca un pedido de la cuenta. Un disparador y no
  otra copia de `crear_reserva`, para no tener dos versiones de doscientas
  líneas. Toma un candado de dos llaves por cédula y por teléfono, aparte del
  de las piezas. Antes, cualquiera sin sesión podía apartar lo libre de todo
  el catálogo una hora, cada hora. **No frena** a quien inventa otra cédula y
  otro teléfono en cada pedido: eso pediría una puerta con servidor.
- **Un pago que no llegó suelta las piezas**: `pedido_al_dia`, además de
  confirmar, devuelve a "abierta" un pedido confirmado cuyo pagado sin
  anular baja de su `apartado_pct`, **con `reserva_minutos` desde ahora** para
  completar el pago (si no, vence y las piezas vuelven a la venta). Sin esa
  hora moría en el acto: un apartado del mostrador nace con su plazo ya
  pasado, y ni se podía cargar el pago corregido. Antes del #61, si la
  tienda decía "no llegó", el pedido seguía apartado 15 días. Un pedido de
  antes del apartado (reportó por el `reportar_pago` viejo antes de su
  primer abono) vuelve a "reportado", como estaba.
- **`reportar_pago` solo para los pedidos de antes**: con un pedido con
  precio congelado responde "se paga por partes". Antes, con "efectivo al
  retirar" y sin referencia, cualquiera dejaba un pedido nuevo confirmado y
  sin plazo: apartado para siempre sin pagar nada.

`admin_desactivar_modelo` no retira una pieza que un pedido tiene apartada.

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

De los dijes (`esquema-dijes.sql`), revocadas a todos: `tramo_de_carrito(items)`
(la única regla de qué línea recibe el tramo: la llaman `registrar_venta`,
`apartar_en_tienda`, `crear_reserva` y `cotizar_pedido`; el carrito la repite
con `descuentosDeCarrito` de `lib/dinero.ts`), `costo_bcv_pieza(costo, es_dije)`
(el costo en $ BCV, sin lo de tienda si es un dije; la usan `piso_margen_de` y
`admin_reasignar_grupos`), `guardar_armados` (las parejas dije–base que cuadran
con el pedido) y el disparador `venta_items_dije`, que congela `es_dije` en
cada línea de venta (también la de una nota de crédito, que copia la de la
línea que devuelve) y, si es un dije, pone lo de tienda en cero.
`admin_sugerir_precio` ganó `p_es_dije` al final (sin lo de tienda y en la
escalera de dijes; sin escalera de dijes cargada no da grupo, nunca uno de las
piezas), `admin_guardar_modelo` ganó `p_armado` (null: como estaba; lo llevan
todas las medidas del producto) y `crear_reserva` ganó `p_armados`.

`caja_flujo(desde, hasta)` es la única regla de qué dinero entró y salió: las
ventas cobradas completas por su total, las ventas por partes abono por abono y
lo anotado en la caja, sin anuladas, con los días cortados en la hora de
Venezuela. Revocada a todos; la leen `admin_caja_por_metodo`,
`admin_caja_por_dia` y `admin_caja_por_categoria`, que rechazan a quien no sea
administrador. Desde el #75 trae también `binance` al final (cada fila en
dólares Binance, a la tasa de su día).

`flujo_negocio(desde, hasta)` es la cuenta del flujo (fase 8, #75): lo que
SALIÓ (mercancía y exhibidores de Lotes con su flete, mobiliario de
Inversiones, las salidas de la Caja por categoría), lo que ENTRÓ (lo de
`caja_flujo`, que llama y no copia) y lo que QUEDA (dinero, mercancía a lo que
costó, en camino, sin rastro y a la etiqueta de hoy, lo abonado de pedidos sin
entregar en negativo, lo que te deben y "si se vende todo"), en Bs, $ Binance
y $ BCV. Cada movimiento con las tasas de SU día (`tasas_del_dia`: la última
cargada ese día o antes; antes de toda tasa, la más antigua); lo de un lote,
con su `tasa_binance_compra` y el día más temprano entre su llegada y cuándo se
cargó. Lo de "hoy" (la etiqueta, lo que te deben), con la tasa vigente. Revocada
a todos; `admin_flujo` la envuelve para el administrador. Los lotes se anotan
SOLO en Lotes (decisión del dueño): si uno se anota también en la Caja como
"Mercancía", sale dos veces.

`sin_rastro_por_lote()` (#76, revocada a todos) parte por lote, en $ Binance,
la misma regla de `mercancia_sin_rastro`: la suma de sus renglones es esa cifra
(lo prueba PGlite). `admin_sin_rastro_lotes()` la envuelve; la lee el Flujo.
`admin_inicio()` (#76, solo administrador) es el Inicio: un json de nueve
cifras que solo CUENTA sobre las vistas de siempre (`v_ventas_por_verificar`,
`v_abonos_detalle`, `v_pedido_vendedora`, `v_apartados_revendedor`,
`v_credito`, `v_conteos`); no copia ninguna regla.

**El día y el mes son los de Venezuela** (#75): toda cuenta que corte "hoy" o
"este mes" usa `hoy_ve()`, `dia_ve(momento)` e `inicio_mes_ve()`, nunca
`current_date`, `fecha::date` ni `date_trunc('month', now())`: la base corre en
UTC y desde las 8 de la noche de Venezuela eso ya es mañana (ver Trampas).

Las cuentas de las vendedoras del local no se tocan desde SQL: las crea, pausa y
les cambia el PIN la función de servidor `supabase/functions/vendedoras`, con la
llave maestra, después de comprobar que quien llama es administrador activo.
Solo actúa sobre perfiles `vendedora`. Su receta de contraseña es la de
`contrasenaDesdePin()` (`src/lib/auth.ts`): si cambia una, cambia la otra.

Las del revendedor se llaman `rv_*` y reciben `p_sesion` delante: `rv_entrar`
(código → testigo), `rv_salir`, `rv_resumen` (con `tema` y `vence_lux_en`
al final desde el #74: su panel se viste con su tema y su Inicio dice
cuándo vence lo que le debe a Lux), `rv_piezas`, `rv_fijar_precios`,
`rv_apartados`, `rv_abonar`, `rv_cancelar_apartado`, `rv_clientes`,
`rv_guardar_cliente`, `rv_ajustes`, `rv_confirmar`, `rv_revisar_pago`,
`rv_pagar_lux`, `rv_vender` (con `p_cliente_id` al final desde el #74: la
clienta que eligió de su lista, que tiene que ser suya; desde su panel la
cédula y el apellido son opcionales y reconoce a una suya por su teléfono,
los 10 últimos dígitos), `rv_datos_pago` (su pago móvil y sus días de
crédito; aparte de `rv_ajustes` para que el navegador viejo no los borre),
`rv_mi_inventario` y `rv_ajustar_inventario` (#72) y `rv_guardar_tema`
(#73: su tema; la portada tiene que ser de su catálogo; null vuelve a su
paleta). El dueño lo cambia con `admin_tema_revendedor(revendedor, tema)`.
La regla del tema es UNA, `rv_tema_valido` (revocada a todos: el `check`
corre dentro de funciones de definidor): solo siete claves, colores
`#rrggbb`, letra, plantilla y esquinas de su lista, portada un entero
escrito como entero, frase de 1 a 90 sin controles ni invisibles (ancho
cero, cambios de dirección). El logo desde su panel lo guardan
`rv_usuario_para_logo` y `rv_poner_logo` (la ruta tiene que ser
`revendedores/<su usuario>/<número>.webp|png|jpg`), que SOLO ejecuta
`service_role`: las llama la función de servidor `logo-revendedor`.
Todas empiezan por `rv_de_sesion(p_sesion)`,
que dice quién es o lanza el error `28000`. Las de su catálogo no llevan testigo:
`rv_perfil_publico` (con `tema` al final desde el #73; de ahí lo leen
también el pedido de su clienta y su panel), `rv_catalogo_publico`, `rv_buscar_cliente` (enmascarada,
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

### La landing y las ofertas (esquema-landing-y-ofertas.sql, #65)

Sin sesión: `ofertas_publicas()` (lo que la landing enseña: combos, regalo,
selección, ofertas de la casa y `en_oferta`, ningún costo, piso ni margen en
ningún nivel), `emitir_oferta(origen, piezas, ref, visitante)` (un código de
un solo uso con sus piezas, su porcentaje y su vencimiento; el mismo pedido
da el mismo código; hasta `oferta_codigos_dia_max` por visitante al día) y
`registrar_miradas(visitante, miradas)` (con sesión no cuenta, como las
visitas). La tienda revisa un código con `ver_oferta(codigo)`, de las dos
caras: dice `sirve`, `usado`, `vencido`, `anulado`, `pieza_no_disponible` o
`no_existe`, con las piezas y dónde hay libres.

Del administrador (todas con `if not es_admin() then raise` dentro):
`admin_guardar_seccion`, `admin_ordenar_secciones`, `admin_borrar_seccion`,
`admin_guardar_oferta_casa`, `admin_seleccion` (meter, sacar o volver a
automático), `admin_rearmar_combos` (descarta los que no aguantan el piso, un
dije sin base o una sola pieza, y dice por qué), `admin_anular_codigo`,
`admin_anular_codigos_de` (todos los de una oferta o un combo),
`admin_cifras_ofertas` y `admin_guardar_cifra_oferta` (las diez cifras).

Por dentro, revocadas a todos: `oferta_de_lineas(items, codigos, reserva)` (la
única regla de qué código vale para qué piezas), `partes_de_linea` (el precio de
una línea, en una o dos partes), `tomar_codigos`, `gastar_codigos`,
`soltar_codigos_de_venta`, `codigos_para_quien` (lo que se enseña de cada
código según quién pregunta), `estado_codigo` (el estado de verdad; usa
`fase_pedido` en vez de copiar la regla del pedido), `codigo_oferta_nuevo`,
`normalizar_codigo`, `aguanta_oferta`, `pisos_oferta`, `piezas_que_fallan`,
`seleccion_de_hoy`, `seleccion_ensenada`, `piso_margen_con` y las envolturas
`*_admin()` de sus vistas.

- **`piso_margen_con(lista, costo, margen)`** es la cuenta del piso, sola.
  `piso_margen_de` conserva su firma y su resultado (probado pieza por pieza) y
  la llama; así las ofertas costean muchas piezas con las cifras comunes
  calculadas una vez (`pisos_oferta`), como `costo_bcv_con`.
- **`cotizar_pedido`, `crear_reserva`, `registrar_venta` y `apartar_en_tienda`
  ganaron `p_codigos text[] default null` al final.** El navegador viejo no
  manda códigos y recibe lo de antes (`cotizar_pedido` suma `codigos: []` y a
  cada línea `oferta_codigo` y `precio_sin_oferta_usd` en null). Se borró la
  firma vieja de cada una: una sola de cada.
- **`quitar_de_pedido`, `quitar_de_venta` y `admin_devolver_pieza`** responden
  `codigo_roto` (null o `{codigo, piezas, total_antes, total_despues, moneda}`).
  `vender_congelado` y `entregar_pedido` copian el código de cada línea;
  `anular_venta_por_verificar` y `admin_anular_venta` lo devuelven.
- `admin_respaldo` gana las diez tablas.
### Las dos fórmulas de las que sale toda cifra de dinero

Desde `esquema-cuentas-claras.sql` hay **una** fórmula por cifra, y todas las
pantallas leen de ella. Antes estaban copiadas en tres sitios cada una, y cada copia
derivó por su lado: Costos y Reportes decían gastos distintos, y tres pantallas
contestaban "cuántas piezas para no perder" con tres números.

| Función | Da | La leen |
|---|---|---|
| `gastos_fijos_partidas()` | Los gastos fijos del mes, partida por partida, en $ BCV: alquiler, sueldos, servicios y otros. Sin muebles ni exhibidores desde `esquema-precio-esencial.sql`: se pagan con la ganancia | `gastos_fijos_mes_bcv()`, Reportes, Inversiones |
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
  (alquiler, sueldos, servicios, otros). Variable:
  se paga por pieza (mercancía y empaque). Lo que deja cada pieza = precio − mercancía
  − empaque; piezas para no perder = gastos fijos ÷ eso. El empaque nunca va entre los
  gastos del mes.
- **El precio lleva lo esencial: la mercancía y la operación** (decisión del dueño
  del 28/10/2026, en `esquema-precio-esencial.sql`: "no quiero sumarle tanto a la
  pieza sino lo esencial para tener buenos precios"). Mercancía con su flete a la
  brecha, merma, empaque, el alquiler, los sueldos y los servicios del mes, y el
  margen. **Los muebles y los exhibidores no van en el precio**: son inversión del
  local, se pagan con la ganancia, e Inversiones (`v_recuperacion`) lleva la cuenta
  de cuánto ha vuelto con lo que sobra tras la operación. Antes se sumaban a los
  gastos del mes, cada mes y para siempre (ver Trampas).
- **Lo de tienda se reparte entre la META de piezas al mes del dueño**
  (`piezas_mes_meta`, que escribe en Costos), y sin meta (0) entre lo que de
  verdad se vende: desde un mes después de la primera venta, las ventas reales;
  antes, el estimado de Costos o, sin él, lo que hay en la tienda entre los meses
  de rotación. `volumen_mensual_estimado()` decide (meta o `volumen_real()`), y
  `v_volumen` dice de dónde sale ('meta', 'ventas', 'estimado') con las de verdad
  al final. **Nunca entre las piezas que hay en la tienda como regla**: el alquiler
  del mes lo pagan las que salen ese mes; con 55 ventas y ~275 piezas en la tienda,
  repartirlo entre las de la tienda cubre $64 de $320. Por eso lo de tienda pasó de
  ~$3 a $6,13 el 26/10/2026 (al mes de la primera venta) sin sumar nada dos veces.
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
  tarjeta del mostrador dice su mínimo y en el cobro escribe lo que cobra por pieza,
  en bolívares o en % (desde el 26/11/2026), o un % a toda la venta ("Rebaja a toda
  la venta"): la pantalla pasa el % a precio con `precioConRebajaPct` (nunca bajo el
  mínimo; la que llega se queda ahí y se dice) y lo manda como el precio a mano de
  siempre, así la base no cambia. A las líneas con tramo, código o descuento de
  clienta no las toca. `margen_minimo_pct` **nunca** entra en esa
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
  septiembre de 2026. Desde el 21/10/2026 el tramo es **línea por línea**
  (`tramo_de_carrito`): los dijes no cuentan, y solo lo recibe el dije que va
  con una base (ver "Los dijes").
- **Dos pisos, dos trabajos.** `piso_margen_de` es lo que todavía deja el margen
  mínimo: es el piso del TRAMO. `precio_minimo_de` es el mayor entre ese y la
  etiqueta menos la rebaja máxima: es el piso del REGATEO. Antes el tramo usaba el
  del regateo y el 15 % se quedaba en el 10 % de la vendedora.
- **Con tramo manda el tramo.** El regateo es para cerrar una venta de menos piezas
  que el primer tramo; desde ahí el precio a mano se ignora y se cobra el tramo.
  Cada línea guarda por qué salió más barata (`venta_items.motivo_rebaja`:
  `regateo`, `tramo`, `revendedor`, `oferta` o `cliente`), y `v_rebajas` se lo
  enseña al dueño en Reportes.
- **La clienta con descuento fijo** (pedido del dueño del 18/11/2026, por
  JaduJoyas; `esquema-descuento-clienta.sql`, #70). `clientes.descuento_pct`,
  que pone SOLO el administrador en la ficha de la clienta
  (`admin_descuento_cliente`; la vendedora lo lee). En el mostrador, al elegir
  **su ficha** (`p_cliente_id`), `registrar_venta` y `apartar_en_tienda` cobran
  cada pieza, dijes incluidos, a la etiqueta menos ese %, nunca bajo
  `piso_margen_de`: le pasan a `partes_de_linea` el mayor entre el tramo de la
  línea y el de la clienta, y si ganó el de ella el motivo es `cliente`
  (`motivo_con_clienta`). Con tramo o código manda el mayor, no se suman; el
  precio a mano se ignora. El carrito lo repite (`useCarrito(tasa, %)`) y el
  cobro dice "Clienta con 20 % de descuento". Escrita como ficha nueva con su
  cédula no hay descuento (el carrito no lo sabría). **No en el catálogo en
  línea**: cualquiera que sepa su cédula se lo llevaría.
- **El crédito** (pedido del dueño del 18/11/2026, por JaduJoyas; decidido el
  23/11/2026, `esquema-credito.sql`, #71). La clienta se lleva las piezas HOY
  y paga en sus días: lo contrario del apartado. Es un permiso de la clienta,
  no de la venta: `clientes.credito_dias` y, si el dueño quiere,
  `credito_tope_usd` (lo máximo que puede deber a la vez, en $ BCV), que pone
  SOLO él en su ficha (`admin_fijar_credito`); ninguna cifra en el código.
  **Lo vende cualquier vendedora**, en el cobro del mostrador, con "A crédito"
  junto a "Pagó todo" y "Lo aparta". **Y desde el #77 (26/11/2026) se decide
  en el cobro** (el dueño: "registrarlo primero y darle crédito y luego ir a
  ponerle el crédito es fastidioso"): "A crédito" sale con cualquier clienta,
  de la lista o escrita como nueva (su ficha se guarda con `guardar_cliente`
  al cobrar), y quien cobra, vendedora o administrador, escribe **"Días para
  pagar"** de ESA venta (`vender_a_credito(..., p_dias)`); empiezan en los de
  su ficha si tiene, **la ficha no cambia** y no hay máximo de días (decisión
  del dueño). El tope de su ficha manda igual. Lo que su ficha dice sigue
  sirviendo para empezar el campo y para el navegador viejo, que no manda
  días. **Una venta a crédito ES una venta por partes por
  verificar** con `ventas.credito_vence` (hoy en Venezuela más sus días):
  `vender_a_credito` llama a `registrar_venta` tal cual (precio, tramo,
  descuento de clienta y códigos de siempre), la deja `pago_parcial` y carga
  el pago del día, si lo hay, con `abonar_venta`; todo en una transacción.
  Por eso la caja cuenta cada abono el día que llega y no la venta, Reportes
  y la meta la cuentan vendida ese día, lo que falta sale de `falta_bcv_de` y
  se cierra con "Pago verificado". Pagada entera no es crédito ("cóbralo como
  venta"). **El tope cuenta todo lo que debe** (`deuda_de_clienta`: sus ventas
  por partes abiertas, también las de antes) después del pago del día; si lo
  pasa, no se vende; cuenta solo los pagos COMPROBADOS (`deuda_comprobada_de`):
  un "ya te transferí" que no llega no hace sitio. **Con un crédito vencido sí puede llevarse más**
  (decisión del dueño): el mostrador solo avisa. **Anular y quitar una pieza
  de una venta a crédito son del administrador**: la pieza ya salió con la
  clienta, y la base no deja que otra sesión lo haga (disparadores
  `venta_credito_anular` y `venta_credito_quitar`; sin sesión, el SQL Editor
  sí). Con pagos, ni él la anula a secas: `admin_anular_credito` pide decir si
  el dinero se le devuelve (sale de la caja hoy, "Devolución") o se queda, y
  deja `ventas.credito_cierre`; con eso `caja_flujo` sigue contando sus abonos
  el día que llegaron, como en `admin_cerrar_pedido`. Los pagos se cargan en Pedidos (las dos caras, "A crédito · vence
  el…") y en **Crédito** (`/admin/credito`, `v_credito`), que agrupa por
  clienta, las vencidas primero. El menú dice "Crédito · 2 vencidos"
  (`creditos_vencidos()`). Lo que el mostrador enseña de ella sale de
  `credito_de_clienta`. **No en el panel del revendedor**: sus pedidos
  siguen pagándose a Lux en 24 horas.
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
  **Y se ven como un producto también donde se administran** (pedido del dueño
  del 14/10/2026: "es ilógico que me aparezcan como si fuesen otros
  productos"). El Inventario enseña una fila por producto, con cada cifra de
  la medida más baja a la más alta y la existencia sumada, y sus medidas se
  abren debajo; pagina por producto, así una familia nunca se parte entre dos
  páginas. El conteo semanal cuenta cada producto con sus medidas dentro. Al
  tocar la foto de una medida, el visor abre en esa medida.
  **Muchas opciones no alargan nada** (reportado por el dueño el 22/10/2026:
  las 52 letras del dije, "A DORADO · A PLATEADO · ...", hacían una tarjeta
  de 1.316 px y encogían a su vecina de fila). Donde hay poco sitio (la
  tarjeta, la ficha del PDF, la vitrina, la fila del Inventario) la lista va
  en corto, `etiquetasCortas` ("A DORADO y 51 más"); con más de
  `MUCHAS_OPCIONES` (8) la hoja de elegir las pone en fichas con el precio
  una vez, y si son un cuadro de dos ejes (`cuadroDe`: letra × color, cada
  combinación una vez) la hoja y el visor las parten en "Dorado" y
  "Plateado", una letra por ficha. El PDF y la vitrina listan una línea por
  PRECIO (`porPrecio`), no por medida. Todo en `lib/familias.ts`.
- **Los dijes y las bases para armar** (pedido del dueño del 21/10/2026: un dije
  de $0,88 salía en $9). Una pieza se marca en su formulario como **dije** o
  como **base** (la cadena o pulsera que se trajo para colgarle uno). La base es
  una pieza como cualquiera. El dije lleva su mercancía (con brecha y merma) y el
  margen, **sin lo de tienda**, empaque incluido: eso ya lo paga la base. Como el
  margen es un porcentaje, base + dije cuesta lo mismo que una pieza con los dos
  costos sumados, salvo el redondeo de las escaleras. El dije cae en **su propia
  escalera** (`grupos_precio.escalera = 'dije'`), que el dueño carga en Grupos:
  nunca se siembra una cifra, y sin ella un dije no tiene precio sugerido.
  - **Un solo precio.** Se vende solo (para una cadena propia o una que ya
    compró) o puesto en una base, al mismo precio.
  - **Solo, cuenta en las estadísticas** (lo vendido, la caja, la ganancia, las
    piezas de Reportes) **pero no para el tramo ni para la meta** de la
    vendedora. **Con una base es una joya**: cuenta como una pieza (la base) y el
    tramo le llega también. Qué dije "va con base" lo dice `tramo_de_carrito`:
    las bases de la venta, repartidas entre los dijes por modelo, de menor a
    mayor id; el que no cabe entero, no lo recibe. Un dije sin base en una venta
    con tramo se cobra a su etiqueta o se regatea hasta su mínimo.
  - **Las cuentas que cuentan piezas las cuentan sin dijes**, por
    `venta_items.es_dije`: el volumen del mes (que reparte lo de tienda; si
    contara los dijes, abarataría todo el catálogo), `plan_ventas` (las piezas;
    el dinero sí con ellos), la meta, "Mi día", Vendedoras, y el empaque que
    restan "Te dejaron", la mezcla por grupo y la recuperación.
  - En los catálogos (el de la tienda y el de cada revendedor), la ficha de una
    base dice **"Agrégale un dije"**; en el de la tienda el pedido guarda qué
    dije va en qué base (`reserva_armados`) y Pedidos lo dice ("Para armar").
    En el del revendedor solo mete las dos piezas: lo arma él. En el mostrador
    se tocan las dos y listo. La vitrina no enseña dijes sueltos.
  - Los pisos (`piso_margen_de`, `precio_minimo_de`) y el precio del revendedor
    miden al dije igual, sin lo de tienda.
- **El tercer precio, en $ Binance.** Lo que se cobra si pagan en dólares, en
  efectivo o por Binance: bolívares entre la tasa Binance (`binanceDesdeBs`), la
  misma cuenta con la que la base guarda `ventas.total_usd`. Solo en el mostrador y
  en la administración; nunca en el catálogo público, el PDF ni la vitrina.
  "Binance" es también forma de pago.
- **El catálogo acepta pedidos desde una pieza.** El mínimo de mayoreo (6 piezas o
  $30) se quitó en septiembre de 2026; el mayoreo es solo el descuento por cantidad.
  Desde el 14/10/2026, tocar una pieza abre su detalle (desde la fase 10, su
  página con enlace, `?pieza=`) y cada tarjeta lleva "Agregar" (desde la fase
  10, un "+" sobre la foto; un contador cuando ya va en el pedido); antes un toque la metía al
  pedido y dos abrían el detalle. Trae las piezas de a 120 con "Ver más" y dice
  cuántas faltan (antes cortaba en 400 sin aviso), se ordena por tipo o por
  precio, y el total de la barra es el de `cotizar_pedido`. En el mostrador, un
  toque sigue agregando: ahí manda la velocidad. En las dos, la tarjeta es un
  `<article>` con botones hermanos, nunca un botón dentro de otro. El
  catálogo de cada revendedor hace lo mismo desde el 15/10/2026 (se había
  quedado con el doble toque y la lupa dentro del botón), trae hasta 400 y
  lo dice si llega al tope, y recuerda las piezas elegidas aunque la
  clienta busque otra cosa, como el de la tienda.
- **El catálogo se entiende y dice dónde está la tienda** (pedido del dueño
  del 24/10/2026: "no luce atractivo o entendible para quedarse más tiempo o
  saber cómo ordenar"; diseño en
  `docs/superpowers/specs/2026-10-24-catalogo-claro-design.md`). Medido antes
  en un teléfono de 360 px: el 62 % de la pantalla se iba antes de la primera
  foto, las categorías vivían plegadas en "Filtrar", "Ver más" dejaba tipos
  enteros fuera y la página no decía dónde estaba la tienda ni cómo se pedía
  hasta dar la cédula.
  - **El inicio** es una vitrina: una portada (de dónde es, los materiales y
    "Así pides" en tres pasos), los tipos con foto, **un estante por tipo**
    (cuatro piezas y "Ver todas"; trae todo lo que se vende de una vez, hasta
    1.000 filas), "Cómo pedir" con las cifras de la base (`reglas_pedido()`
    y los tramos; sin ellas, los pasos sin cifras), Próximamente como estante
    y **"La tienda"**. Un tipo (`?tipo=`, en la ruta: atrás vuelve al inicio),
    una búsqueda o el orden por precio abren la lista de siempre, con "Ver
    más". El buscador está siempre en el mismo sitio, para que el teléfono no
    cierre el teclado al cambiar de vista.
  - **La tarjeta de vitrina** (`Tarjeta` de `publico/caras/`; el catálogo del
    revendedor tiene la suya desde la fase 6) ya no
    repite el material ni la clave de bodega (la clave pasa al detalle:
    "En tienda: V1 · BG"). Cuántas quedan va en tono neutro, también
    "Última pieza": "Quedan 2" en alerta salía en 82 de cada 100 tarjetas,
    y "Última pieza" en 25 de las 42 del inicio. Una alerta en todas no
    avisa de nada.
  - **"La tienda"** sale de Textos: dirección con "Cómo llegar" (un enlace a
    Google Maps, `mapa_tienda` o la búsqueda de la dirección; nunca un mapa
    incrustado, que pesa y que la CSP bloquea), horario, WhatsApp, Instagram
    y "Cómo pagar" plegado (el pago móvil con su titular, para cotejarlo en
    el banco). Lo vacío no sale; sin nada, no sale la sección. **Nunca en el
    catálogo de un revendedor**: ahí el contacto es el suyo.
  - **El pedido llega también a WhatsApp, con un toque de la clienta**: la
    página del pedido lleva "Avisar a la tienda por WhatsApp", un enlace
    `wa.me` al `whatsapp_tienda` con la referencia ("LX-3F9A2C", sacada del
    token; Pedidos la enseña), el nombre como lo da la base, hasta diez
    piezas, el total del sistema, la entrega y el enlace del pedido. Nunca
    cédula, teléfono ni dirección. Es un aviso: la tienda se fía del sistema,
    no de la cifra del mensaje. Un enlace y no una ventana que se abre sola
    (el navegador la bloquea después de la espera de apartar). Sin número
    válido no hay botón. El aviso automático (la API de WhatsApp Business) se
    dejó fuera: pide un servidor y se paga por mensaje.
  - "Tu pedido" vuelve arriba al entrar, conserva la cabecera, numera sus
    tres partes y dice "Qué pasa al apartar" con las cifras antes del botón.
  - **Para todos** (pedido del dueño del 27/10/2026: "no hay una sección
    para ver todo" y "piensa que eres una persona mayor o que maneja poco la
    tecnología: guiable desde que entra"). **"Todas las joyas"** (`?ver=todas`,
    en la ruta), juntas y sin separar: un botón en la portada (con "O elige
    por tipo"), el primer cuadro de los tipos y una tarjeta al final de los
    estantes. En la lista, "Ver" y "Ordenar" a la vista, no plegados (en
    pantallas anchas, los tipos en fichas). Tras la primera pieza, un aviso
    que dice dónde quedó y cómo se sigue ("toca «Ver mi pedido»"). La ayuda
    por WhatsApp en la portada, para quien no quiere pedir solo. Y **"Letra
    grande"** en la cabecera del catálogo y del pedido (`useLetraGrande`): la
    escala sube un paso en `<html>`, se recuerda en el teléfono y se quita al
    salir de esas páginas. El catálogo de los revendedores no lo tiene todavía.
- **La landing** (pedido del dueño del 09/11/2026: "que la dirección del
  catálogo sea una landing de Lux, con motion, sliders y fotografías"; diseño
  en `docs/superpowers/specs/2026-11-09-landing-y-ofertas-design.md`). El
  inicio del catálogo (`luxbyemory.com`; en desarrollo `/publico`) ya no está escrito a mano: son secciones
  de 19 tipos que el dueño pone, esconde y ordena en el panel **Landing**
  (`/admin/landing`). Sin sesión se leen por `v_landing`; el panel, por
  `v_landing_admin`.
  - **`admin_guardar_seccion` pide todo, siempre**: título, texto y datos
    completos. Lo que llega null se borra; solo `p_visible` null es "como
    estaba". Las 12 secciones de la base (Elige por tipo, Cómo pedir, La
    tienda...) se esconden y no se borran ni se repiten; portada, materiales,
    galería, nosotros y redes sí. El tipo de una sección no cambia.
  - **Ni una cifra de dinero**: precios y porcentajes salen de las vistas de
    siempre y de `ofertas_publicas()`. Lo sembrado no nombra proveedores. La
    base comprueba `datos` (`landing_datos_error`): fotos del sitio
    (`landing/x.webp`) o del bucket, y botones con un destino de la lista.
  - **Sin el #65 el inicio es el de siempre** (`secciones === null`: la portada
    de hoy, el buscador y los estantes). Una sección de oferta sin datos no se
    dibuja ni cuenta para la puerta "Ofertas" (`seDibuja`).
  - **La portada nunca lleva texto sobre la foto**: arriba en el teléfono (la
    foto debajo, a sangre), dos columnas desde 900 px. El contraste no depende de la foto que ponga el
    dueño. Cada foto lleva su texto alternativo, que el panel pide.
  - **El video sale escondido** hasta que el dueño sube uno: una sección
    visible vacía no aporta.
  - **Las miradas** (`useMiradas`): el detalle de una pieza abierto cuenta
    segundos por día y pieza, sin guardar quién. Si alguien mira un rato dos
    (`oferta_mirada_segundos`) se le ofrece la pareja con `oferta_pareja_pct`,
    una vez por visita. La landing no está en el catálogo del revendedor ni en
    la vitrina.
- **Las ofertas con código** (pedido del dueño del 09/11/2026: ofertas "por
  todos lados", con la voz de la casa, y "un código aleatorio de un solo uso que
  se verifique en la tienda"). **Un solo mecanismo** para todo lo que baja un
  precio en la landing: el código `LUX-XXXXXX`, seis letras de 31 posibles
  (`codigo_oferta_nuevo`), de **un solo uso**, que cubre un conjunto de piezas a
  un porcentaje y vence en `oferta_dias_validez` días. Su origen dice de dónde
  salió: `dos_vistas` (la pareja que miraste), `complemento` ("Complétalo"),
  `estuche`, `combo`, `regalo`, `seleccion`, `casa` y `escote`.
  - **Un código es un conjunto**: vale solo si TODAS sus piezas están en el
    pedido y libres. Cada pieza va en un solo código, y una pieza que ya cubre
    uno no se cubre con otro.
  - **No se suma al tramo**: en las piezas del código manda el MAYOR entre el
    tramo y la oferta (`partes_de_linea`); el precio a mano se ignora. Si el
    tramo gana o empata, el código se gasta igual. Si la línea pide más
    unidades de las que cubre el código, se parte en dos.
  - **Nunca baja de `piso_margen_de`**: ni al darlo (`aguanta_oferta`) ni al
    cobrarlo. Si el costo sube entre tanto, el código se respeta y manda el piso
    (se cobra el piso, no el precio de la oferta). **Un código dado se respeta
    hasta que vence**, aunque apaguen las ofertas; solo `admin_anular_codigo`
    lo quita antes.
  - **Quitar o devolver una pieza rompe el código** (`roto_en`): las otras
    vuelven a lo que costaban sin él (`precio_sin_oferta_*`) y la respuesta
    dice `codigo_roto`. Si la pieza ya se entregó, la nota de crédito cobra, en
    `extra_bs`, lo que las otras se ahorraron, nunca más de lo que vale la
    pieza. Pedidos lo avisa antes de quitar.
  - **Pedido toma, venta usa.** Un pedido toma el código (`tomado`); si se cancela
    o vence sin dinero, lo suelta; la venta (o la entrega) lo usa. Anular la
    venta lo devuelve. Un pedido vencido CON dinero lo retiene hasta archivarse
    o cancelarse (ver Trampas).
  - **La Selección de la casa** son las piezas libres que llevan
    `seleccion_dias_sin_venta` días sin venderse (el dueño mete o saca a mano).
    La landing enseña **24 al día, que rotan** (semilla: la fecha de
    Venezuela): con todas, cada visita pesaba 58 KB y casi todo el catálogo salía
    en cinta. 24 es de carga, no del negocio. Los dijes no entran.
  - **Los combos de la semana los arma el navegador del administrador**
    (`rearmarCombos`, al abrir el panel o el Inventario) con `armarConjunto`, y
    la base los acepta o los descarta (`admin_rearmar_combos`): el porcentaje
    sube con las piezas, del mínimo (2 piezas) al máximo (4), entre
    `oferta_min_pct` y `oferta_max_pct`. Sin armarlos, no hay combos. **El estuche** da cada día
    un código distinto por visitante, una vez al día.
  - **La tienda revisa el código en "Código"** (`/venta/codigo`, de las dos
    caras): lo escribe tal cual (mayúsculas, espacios y guiones no importan),
    ve los seis estados dichos y "Pasar al cobro" lo mete al Mostrador. Sin
    palabra "piso", "margen" ni "costo".
  - **Sin sesión nunca se sabe qué códigos existen**: `cotizar_pedido` responde
    `no_vale` y sin porcentaje a todo código que no aplica, sea cual sea el
    motivo (para la tienda el motivo es el de verdad). El navegador calcula
    por su cuenta "faltan piezas" y "comparte pieza", porque conoce las piezas
    de sus códigos.
  - **Reportes**: `v_ofertas_mes` (Reportes, "Ventas con oferta") y la columna
    `oferta` en las rebajas. Las diez cifras se cambian en el panel (Ofertas).
- **Lo público, en el estilo A** (fase 10, 24/11/2026; diseño en
  `docs/superpowers/specs/2026-11-24-landing-catalogo-pedido-design.md`,
  maquetas en https://claude.ai/artifact/Y9HXj71jv7A3ttnT1xAYNJ). La landing,
  el catálogo, la página de la pieza y el pedido salen del sistema visual de
  Lux por decisión del dueño: solo conservan sus colores y sus letras
  (Fraunces ligera y cursiva, EB Garamond, Jost). Fondo papel, títulos
  grandes, fotos a sangre, estantes que se deslizan, botones píldora. **Todo
  bajo `.pub`**: los componentes que comparte con la tienda (`TusDatos`,
  `PagoMovil`, `ReportarPago`) se visten desde ahí sin cambiar su marcado, así
  la tienda y el revendedor no cambian. El reinicio de `h1`–`h3` va con
  `:where(.pub) h2`: pesa como un elemento, le gana a base.css y pierde ante
  cualquier clase (ver Trampas). **La pieza tiene su página** (`?pieza=<id>`,
  `PaginaPieza`): atrás vuelve al catálogo en el mismo sitio; un enlace a una
  pieza que ya no se vende dice que no está disponible, y una que viene en
  camino sale como Próximamente; "Compártela por WhatsApp" manda el nombre y
  el enlace, sin precio. El movimiento es CSS y `useAparecer` (la foto de la
  portada entra, los estantes suben escalonados, el contador rebota, la foto
  de la tarjeta crece hasta la página con View Transitions) y se apaga con
  `prefers-reduced-motion`. Los 19 tipos de sección no cambiaron.
  Pedidos del dueño del 25/11/2026: **"Ver todas las joyas juntas"** va en un
  botón ancho justo después de la portada (el sitio de la landing donde iba
  el buscador) y como primera puerta, rellena; **la portada se adapta a la
  foto que se ve** (su proporción real, hasta 3/4 de la pantalla, y la fila
  del slider toma el alto de esa diapositiva); y **Próximamente** enseña un
  estante y "Ver todas las que vienen", que las abre en cuadrícula para
  bajar (con 140, de lado era inviable).
- **Dama, caballero o unisex** (pedido del dueño del 17/11/2026, cuando
  llegó la joyería de caballero). Cada producto dice para quién es
  (`modelos.para`). El catálogo en línea lleva arriba, en el buscador (el
  mismo sitio en la landing y en la lista), **"Todas · Dama · Caballero"**:
  va en la ruta (`?para=dama`), se conserva al cambiar de tipo y filtra la
  lista, los estantes, los tipos y Próximamente; **lo unisex sale en las
  dos**. El #67 marcó lo que ya estaba cargado por reglas de nombre
  (hombre, negro, anubis... caballero; zarcillos, perla, corazón... dama;
  cadena cubana o fígaro, unisex; sin señal, dama) y el dueño corrige en el
  Inventario, con el selector de cada producto. Un producto nuevo no se
  guarda sin elegir. El formulario y el Inventario leen `para` aparte de sus
  columnas de siempre: sin el #67 cargan igual y el selector no sale. El
  selector es `ElegirPara` (`componentes/ElegirPara.tsx`, con `paraDeRuta` y
  `paraQueVe`), y lo lleva también **el catálogo de cada revendedor**, que
  filtra en `rv_catalogo_publico` (gana `para` en el #68). **La vitrina**
  dice para quién es cada pieza junto a su categoría ("Collar · Caballero";
  lo unisex, "Dama y caballero") y sus controles eligen "Todas · Dama ·
  Caballero" por televisor (`lux-vitrina-para`); con un filtro y nada que
  enseñar, ofrece volver a todas. El mostrador y el PDF no filtran.
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
  verificada sigue siendo del administrador, y también una por partes con un
  pago ya comprobado (#75): "Anular con sus pagos" (`admin_anular_credito`, que
  vale para toda venta por partes) dice si el dinero se devuelve o se queda;
  antes la anulaba cualquiera y el dinero que llegó salía de la caja. **El administrador también vende**: Mostrador y Pedidos están en
  su menú, y también cierra y cuenta: Cierre y Conteo (desde el 28/10/2026;
  antes solo llegaba escribiendo la dirección).
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
  pública (`luxbyemory.com/guia-revendedor`) que el dueño manda desde "Capacitación
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
  parte"**: ya no se vende a crédito a cualquiera (la pieza se llevaba
  debiendo; desde el #71 solo a la clienta que el dueño habilita, ver "El
  crédito"); con
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
  - **Un pago que no llegó suelta las piezas** (desde el #61). Si al anular
    o corregir un abono lo pagado baja del mínimo con que se apartó, el
    pedido vuelve a esperar el pago, con la hora de siempre para cargar el
    pago bueno; si no llega, vence y las piezas vuelven a la venta. Y una
    clienta no puede tener más de `pedidos_sin_pagar_max` pedidos del
    catálogo esperando el pago (con dinero comprobado, ya no espera).
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
- **Las devoluciones** (pedidas por el dueño el 14/10/2026, por un cliente
  que devolvió un anillo). Son dos casos y no se parecen:
  - **El pedido no se ha entregado:** la pieza nunca salió de la tienda.
    "Quitar" en Pedidos (`quitar_de_pedido`) baja esa línea a cero, la pieza
    queda libre en el acto (mostrador y catálogo) y el total baja con su
    precio congelado. Las demás piezas conservan el suyo aunque el pedido
    baje de un tramo: se congeló al apartar, y la pantalla lo avisa. Lo hacen
    las dos caras; si lo pagado y comprobado pasa del total nuevo, solo el
    administrador, que dice si se devuelve (sale de la caja como
    "Devolución") o se queda a favor. Con pagos sin revisar que sobrarían, se
    revisan primero. La última pieza no se quita: eso es cancelar el pedido.
    Cada cambio queda en `pedido_cambios`, y Pedidos lo enseña.
  - **La pieza ya se entregó:** solo el administrador, desde la ficha de la
    clienta ("Devolver"). `admin_devolver_pieza` registra una NOTA DE
    CRÉDITO: una venta que dice de cuál es (`devolucion_de`), con las MISMAS
    tasas de la original y la pieza en negativo. Así cada suma (reportes,
    meta, ganancia del mes, la ficha) se compensa sola el día de la
    devolución por la cifra exacta que la pieza sumó, sin reescribir el día
    en que se vendió. La pieza vuelve a la ubicación que él elija. El dinero
    va aparte, por la caja, nunca más de lo que valía; la nota de crédito no
    cuenta en `caja_flujo`, para no restarlo dos veces. No se devuelve de una
    venta por verificar (primero se verifica o se anula), una venta con
    devoluciones no se anula entera y una nota de crédito no se anula.
  - **La venta está por verificar** (15/10/2026): todavía no es un hecho
    cerrado, es lo que se espera cobrar. "Quitar" en Pedidos
    (`quitar_de_venta`) hace lo mismo que en un pedido: la línea baja (en
    cero queda "quitada"), la pieza vuelve a la ubicación de donde salió y
    el total se recalcula con los bolívares congelados de cada línea más lo
    de fuera del catálogo, como lo calcula `registrar_venta`. No es una nota
    de crédito porque la caja cuenta la venta por su total y "lo que falta"
    de una por partes sale de su total: con una nota los dos seguirían en el
    total viejo. De las dos caras; si es por partes y lo pagado y
    comprobado pasa del total nuevo, el administrador decide (se devuelve
    por la caja o se queda). La última pieza no se quita: se anula la venta.
    Las vistas que listan líneas una por una (`v_ventas_por_verificar`,
    `v_cliente_compras`, `v_rebajas`, `v_rotacion_modelo`) se saltan las de
    cero; las que suman multiplican por la cantidad y no cambian.
  - Las devoluciones de los pedidos de revendedores no están: lo suyo se
    sigue cerrando con `admin_cerrar_apartado`.
- **Lo apartado no se vende en el mostrador.** Un pedido dice "2 de esta cadena",
  no de dónde; lo apartado se asigna a las ubicaciones empezando por donde hay más
  (normalmente la bodega), que es el mismo orden en que la entrega las toma.
  `v_existencia_libre` hace el reparto; `v_venta_ubicacion.cantidad` es lo LIBRE
  (con `existencia` y `apartadas` al final) y `registrar_venta` no deja vender lo
  apartado. Mover una pieza apartada sí se puede: sigue siendo del pedido.
- **La vitrina se abre sin sesión**, como el catálogo: lee `v_disponible_publico`
  y sus frases de marca ('TV') son públicas. No enseña nada que no esté ya en el
  enlace de WhatsApp. **Se refresca sola cada 5 minutos** (y al volver a la
  pestaña) sin perder la pieza en que va: el televisor pasa la tarde encendido y
  antes enseñaba lo vendido y los bolívares de la tasa de la mañana. Si la red
  falla, sigue con lo último que llegó; si falla la primera carga, reintenta
  sola. Intercala las categorías, salta las piezas sin foto (si hay alguna con
  foto), dice "Última pieza" y lleva el QR del catálogo en línea (se quita desde
  los controles; `CodigoQr`, con `uqr` fijado en 0.1.2, ver ESTADO.md).
  **Desde el 15/10/2026 es un guion de seis escenas** (pieza estelar en un arco,
  tres para combinar, colección de una categoría, de cerca con los materiales,
  frase, y qué joya va con cada escote), con filigranas de oro que se dibujan y
  una entrada distinta por escena. Cada escena dura los segundos de los
  controles por su factor (`FACTOR` en `Vitrina.tsx`). La guía de escotes son
  consejos de estilo en `lib/escotes.ts`, no cifras del negocio: sus piezas
  salen de la tienda, filtradas por categoría y por la medida de la variante
  ("45 cm"), y un escote sin piezas que le vayan no sale. Lo que se dibuja
  está en `SiluetaEscote.tsx`. **Desde el 20/10/2026 hay una séptima,
  "Próximamente"**: la pieza estelar de un lote que no ha llegado, con el
  sello "Próximamente" en vez de la categoría, "Viene en camino" en vez de
  "Última pieza" y sin la clave de ubicación. Sale dos veces por vuelta del
  patrón, rota entre todas las próximas y se refresca con lo demás; si esa
  lectura falla, se queda la de antes. El ajuste de letra mide con `offsetTop` y no
  con `scrollHeight`: Chrome cuenta en scrollHeight lo desplazado por una
  animación de entrada y encogía la letra sin que nada se saliera.
  **Desde el 27/10/2026** (el dueño: "el QR se superpone a las prendas", "para
  cierto tipo de cuello salen aretes" y "que sea irresistible y que la
  entienda cualquiera"; diseño e investigación en
  `docs/superpowers/specs/2026-10-27-vitrina-y-catalogo-para-todos-design.md`):
  - **El QR vive en su riel**, a la derecha y a todo el alto, con la marca, cómo
    se escanea en tres pasos y un mensaje que rota. Las escenas se dibujan en
    el escenario de al lado, que recorta lo que se salga: ya no hay escena que
    pase por debajo del código. Lo que depende del ancho se mide contra
    `--v-ancho`, lo que de verdad le queda al escenario.
  - **"Para combinar" es un conjunto**: `armarConjunto` (`lib/combinar.ts`), una
    pieza por parte del cuerpo (cuello, orejas, muñeca, mano), del mismo tono
    si el nombre lo dice, cada una diciendo dónde va, y lo que cuesta todo
    junto (la suma de las etiquetas con `sumarCifras`; no promete descuento).
  - **Un escote es una pregunta de collar** (`lib/escotes.ts`): collares del
    largo que le va (la medida, la nota "Largo: 45 cm" o la forma); aretes de
    complemento ("Y para completar") o, si no hay collar que le vaya, en su
    lugar y dicho ("Estos aretes combinan", con el consejo de aretes de ese
    escote), sin cadena en el dibujo. Medido: ningún collar de la tienda dice
    su largo en la medida. Una "y" suelta en el nombre es la conjunción, no
    la forma: solo "en forma de Y", "en Y" o "Y-Necklace" dicen collar en Y.
  - **Dos escenas nuevas**: "Para regalar" (el cuarto más barato, "desde")
    y "Así de fácil" (cómo se compra, en tres pasos, para cualquiera). Y un
    brillo de gema en la pieza estelar. "Últimas piezas" no entró: 93 de 128
    productos tienen una sola pieza.
- **El conteo de inventario** (rehecho en la auditoría del 14/10/2026). Se
  cuenta lo FÍSICO, las piezas apartadas también, a ciegas (la pantalla no dice
  cuánto espera el sistema mientras se cuenta), y solo se guarda lo que se
  contó: una fila vacía no se toca. Antes de guardar, una revisión enseña lo
  que no cuadra, cuántas faltan o sobran y si una pieza de un pedido no
  aparece. Lo contado vive en el teléfono (`lux-conteo-v2-<ubicación>`) hasta
  guardarlo. Los conteos anteriores salen en la misma pantalla.
  **El conteo no cambia el inventario; lo ajusta el dueño** (pedido del dueño
  del 28/10/2026: "el conteo debe servir para hacer un chequeo e inventario y
  ver dónde están las piezas hasta que coincidan con el inventario; no pueden
  descontar del inventario las piezas a menos que autorice el admin"). Se
  dejaban en 0 las piezas de los pedidos ("ya no son del local"), el conteo
  ponía la existencia en 0 y el pedido no se podía entregar. Ahora lo que no
  cuadra queda "Por revisar" y el administrador, en la misma pantalla, lo
  ajusta o lo deja como está, pieza por pieza o todo el conteo, y puede
  deshacer lo que un conteo ajustó (lo que se hizo con el conteo de antes del
  cambio). Arriba, dos avisos lo llevan con un toque al conteo ya abierto, de
  cualquier ubicación: los que esperan su revisión y los cuatro últimos que
  ajustaron el inventario, para deshacerlos (antes "Deshacer" vivía al final
  de la lista de piezas, dentro de la fila del conteo, y el dueño no lo
  encontró). Nunca deja una pieza por debajo de lo que apartan los pedidos.
  **El cierre del día también es a ciegas** (desde el 15/10/2026): antes decía
  "Espera 38" junto al campo. La cifra del sistema sale al guardar, y es la
  que esperaba AL CONTAR (`contada − diferencia`), no la existencia de ahora.
- **Las cifras que escribe una persona se leen con `leerCifra`** (`lib/dinero.ts`):
  coma decimal y punto de miles cuando le siguen tres cifras, como se escribe
  aquí ("1.500,50"). Nunca `Number(texto.replace(',', '.'))`: leía "1.500"
  como 1,5 y no podía leer "1.500,50". Y el campo es `type="text"` con
  `inputMode="decimal"`, no `type="number"` (ver Trampas). Lo que no se
  entiende no se guarda, y se dice; nunca cuenta como cero. Las dos
  excepciones llevan 4 decimales y su propia red: las tasas (confirmación
  "antes → después" y aviso de salto) y el costo de una pieza en el
  formulario (con punto decimal, y vacío no se guarda).
- **El lote en camino** (pedido del dueño del 20/10/2026: cargar un lote
  antes de que llegue sin que confunda a las clientas). Se registra en Lotes
  con "Todavía no ha llegado" y se le carga todo en su pantalla, "Lo que
  viene": productos nuevos (el formulario de siempre, con el lote puesto) y
  reposición de los que ya se venden. **Nada de eso existe para la venta**:
  ni mostrador, ni catálogo de la vendedora, ni el del revendedor, ni conteo,
  ni cierre, ni las estadísticas que cuentan inventario o modelos
  (`v_valor_inventario`, `v_diagnostico`, `v_rotacion_modelo`). No porque
  cada pantalla lo filtre: porque no tiene existencia (vive en `por_llegar`),
  y todo lo que vende o cuenta mira la existencia. El dueño lo ve en el
  Inventario como "Próximamente · llegan 6" (sin alerta de "quedan pocas") y
  la reposición como "+5 en camino". **Lo NUEVO se enseña para antojar,
  nunca para pedir** (lo pidió el dueño el 20/10/2026, "para crear esa
  sensación de quererlo reservar"): en el catálogo en línea, al final, con
  foto y precio y sin botón; en el catálogo PDF, en su propia página tras una
  franja verde, con "Próximamente" donde las demás fichas dicen cuántas
  quedan; y en la vitrina, en una escena propia. Las tres leen
  `v_proximamente`, aparte de lo que se vende: nunca se mezcla en un trío,
  una colección o un escote. El mostrador no lo enseña. Cuando llega,
  **Revisar y liberar**: cada línea empieza en lo esperado, se cambia lo que
  no cuadre (el mismo contador del conteo) y al liberar entra a la venta lo
  contado. Desde ahí es inventario como cualquier otro, y la rotación cuenta
  sus días desde que se liberó. El dinero del lote no cambia: ya se pagó.
  Una medida nueva de un producto que ya se vende: se crea en su ficha con
  cantidad 0 y se suma en el lote como reposición. **Lo nuevo que se cargó
  mal se borra** ("Eliminar", desde el 27/10/2026, `admin_eliminar_de_lote`):
  el producto entero con sus medidas y lo que se esperaba, mientras el lote
  no llegue. No pierde historia: nunca tuvo existencia. Lo que ya llegó no se
  borra; se retira desde su ficha.
- **Cada pantalla dice la misma existencia.** Lo que se puede vender es lo
  LIBRE (`v_venta_ubicacion.cantidad`, `v_disponible_publico.disponible`): el
  mostrador, el catálogo, el del revendedor, la vitrina y el catálogo PDF, que
  va a las clientas. Lo que hay es lo FÍSICO (`existencia`, `existencia_total`):
  el conteo, el cierre del día y mover de ubicación. El Inventario del
  administrador enseña lo físico y, al lado, cuántas están apartadas.
- **Las visitas al catálogo** (pedido del dueño del 30/09/2026). La pantalla
  Catálogo, de las dos caras, dice cuántas personas abrieron el catálogo en
  línea hoy, en 7 y en 30 días, y cuántos pedidos entraron por él. Una visita es
  un teléfono en un día; lo que abre la tienda con su sesión no cuenta. Es solo
  una cuenta: no guarda de quién, y no se le enseña a la clienta. Los catálogos
  de los revendedores no cuentan aquí. **Con el dominio** (23/11/2026) la sesión
  vive en `entrar.` y en `luxbyemory.com` el personal no la tiene: cuando salta
  de `entrar.` a la tienda (la vitrina, "Ver la landing") el salto lleva
  `?lux_tienda=1`, y ese teléfono queda marcado (`lux-de-la-tienda`,
  `esDeLaTienda()` de `lib/direccion.ts`): sus visitas y sus miradas no suman.
  El QR del catálogo PDF no la lleva: lo escanean las clientas.
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
  - **Lo que le sale:** la etiqueta menos `revendedor_descuento_pct` (20 % desde el
    23/11/2026; era 25 %), nunca
    por debajo de `piso_margen_de`, el piso del tramo, que ya trae mercancía a la
    brecha de hoy, flete, merma, empaque, la parte del mes de alquiler y sueldos y
    el margen mínimo. Las piezas donde el piso no deja rebaja no salen en su
    catálogo. Puede tener un descuento propio (`revendedores.descuento_pct`),
    **menor, nunca mayor que el general**: el general es el tope (decisión del
    dueño del 23/11/2026). No se guarda uno mayor (disparador
    `revendedor_descuento_tope`) y `rv_descuento_de` nunca da más que el
    general, aunque el dueño lo baje después.
  - **También es una clienta** (`revendedores.cliente_id`, se enlaza en
    Revendedores): lo que compra en la tienda sale en su ficha. Su descuento de
    clienta es otra cifra y va en su ficha.
  - **Lo que cobra:** lo pone él, nunca menos que la etiqueta más
    `revendedor_sobre_etiqueta_usd` ($0,10). No le hace la competencia a la tienda.
    Si la etiqueta sube por encima de su precio, manda el mínimo.
  - **El pedido, en dos plazos** (decisión del 30/09/2026, en la cabecera de
    `esquema-revendedores-plazos.sql`). Su clienta pide desde `<usuario>.luxbyemory.com`
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
  - **Su dirección es su subdominio** (fase 2, 19/11/2026): `jadujoyas.luxbyemory.com`
    abre su catálogo en la raíz y `/apartado/<token>` el pedido de su clienta;
    cualquier otra ruta ahí lleva a su catálogo: su clienta nunca cae en una
    pantalla de Lux. Nace solo al crearlo (el comodín de Cloudflare), sin `www`
    delante (el certificado gratis cubre un nivel). Su panel NO va ahí: es
    `luxbyemory.com/rv`, el mismo para todos. Por eso su usuario es un nombre de
    subdominio: `usuario_rv_valido` (#69, el `check` y `admin_guardar_revendedor`)
    rechaza los reservados (`entrar`, `www`, `admin`...), los que terminan en
    guion y los `xn--`; `USUARIOS_RESERVADOS` de `lib/dominio.ts` repite la
    lista y `scripts/pruebas/reservados.test.mjs` vigila que digan lo mismo.
    Pausado o inexistente, su subdominio dice "Este catálogo no está
    disponible" sin nombrar a Lux. La tarjeta que enseñan WhatsApp y la pestaña
    es la suya (su nombre y su logo, "Joyas Lux by Emory" en pequeño): la pone
    `cloudflare/worker.js` leyendo `rv_perfil_publico`.
  - **Su inventario** (pedido del dueño del 18/11/2026: "esas prendas en
    crédito o compradas a nosotros tienen que estar disponibles con sus
    unidades en su catálogo"; fase 5, #72, decidido el 23/11/2026). Lo que
    le compra a Lux para revender es suyo y sale en su catálogo aunque la
    tienda se quede sin la pieza, la retire o el piso no deje rebaja.
    **No se guarda como un número**: `rv_inventario` (revocada, una sola
    regla) suma las ventas `inventario_de` (sin anuladas, las notas de
    crédito en negativo) y sus ajustes, y resta lo que vendió de lo suyo; lo
    apartado son sus pedidos abiertos que no han vencido. Así anular, quitar
    o devolver lo corrige solo.
    - **Entra por una venta del mostrador** con su ficha elegida: el cobro
      trae marcado "Para su inventario" (se desmarca si es para ella misma),
      en Pagó todo, Dejar por verificar y A crédito; no en "Lo aparta".
      **Cuenta para la meta** de la vendedora (no lleva `revendedor_id`).
      Las piezas de los pedidos de sus clientas que Lux aprueba no entran:
      ya tienen dueña.
    - **Anular, quitar o devolver** (el "Devolver" de la ficha, decisión del
      dueño) de una venta para su inventario, solo si él tiene esas piezas
      LIBRES: si ya las vendió o están en un pedido, la base lo dice.
    - **El pedido de su clienta toma primero de lo suyo** (ya lo pagó): cada
      pieza se parte en una línea de lo suyo (`de_su_inventario`,
      `precio_lux_usd` 0) y otra de la tienda. Lo suyo no aparta nada en la
      tienda, no le debe nada a Lux ni pasa por la aprobación, y no cuenta
      para su tope. Un pedido sin nada de la tienda se cierra al confirmarlo
      (`retirado` y entregado, sin venta de Lux). Su clienta no sabe de
      dónde sale cada unidad. El precio es el de Precios, con el mismo
      mínimo. La ganancia del mes de su panel no cuenta lo suyo (no se sabe
      lo que pagó por cada unidad).
    - **"Mi inventario"** en su panel: cuántas, cuántas en pedidos, lo que
      pasó, y corregir **en las dos direcciones** (decisión del dueño) con
      un motivo, nunca por debajo de lo apartado ni de cero. Sumar, solo a
      una pieza que alguna vez compró (ver Trampas).
    - **No es inventario de Lux**: no está en `existencias`, así que el
      conteo, el valor del inventario y el cierre no lo ven. El dueño lo ve
      en Revendedores y en Crédito.
  - **Su catálogo es de su marca** (fase 6, #73, decidido el 23/11/2026).
    Fuera del sistema visual de Lux: su logo grande arriba, Lux solo en el
    pie y en la ficha de cada pieza con un texto exacto («Joyería
    hipoalergénica Lux by Emory · acero 316L, titanio y baño de oro 18K ·
    certificada SGS», `TEXTO_LUX`), ningún contacto de Lux. **Un cerebro,
    tres caras**: `useCatalogoRv` tiene toda la lógica de antes y cada
    plantilla (Editorial, Tienda, Lookbook) solo dibuja; una plantilla nueva
    es otro archivo y un valor más en `rv_tema_valido`. Su **tema**
    (`revendedores.tema`: plantilla, color principal y de fondo, letra de
    títulos de una lista de cinco, esquinas, pieza de portada y frase de 1 a
    90 letras) lo cambian él (Mi catálogo, `rv_guardar_tema`) y el dueño
    (Revendedores, `admin_tema_revendedor`); sin tema sale la plantilla
    Tienda con los colores de su paleta. **Color libre, medido al dibujar**:
    `tema.ts` deriva texto, botón, acento, error y éxito para que todo se lea
    a 4,5:1 sea cual sea el color guardado (lo prueban los seis temas listos
    y colores feos), y el panel avisa antes de guardar. La portada es una
    pieza de SU catálogo (si se agota, otra al azar, fija durante la visita).
    El pedido va en una hoja (cédula y "Apartar" sin salir), con "Letra
    grande". El pedido de su clienta se viste con su tema, no con su
    plantilla. Su logo lo sube él (`logo-revendedor`) o el dueño, como antes.
  - **Su panel** (fase 7, #74, decidido el 24/11/2026). **Se viste con el
    tema de su catálogo**, fuera del sistema de Lux: `temaPanel.ts` deriva
    de sus colores los tokens de tokens.css que usan el Armazón, las Piezas
    y las tablas, y los pone en `<html>` mientras el panel está abierto.
    Lo que en Lux es el verde (la barra, el botón principal) es su color
    llevado hasta que se lea como letra y aguante la crema al 62 % encima;
    cada texto se mide contra todos los fondos donde cae (lo prueba
    `tema-panel.test.mjs`, con amarillo sobre blanco y rosa sobre negro).
    Densidad táctil (48 px, 17 px; 18 px en Vender). Las seis paletas de
    `estilos/revendedor.css` ya no visten el panel: quedan como muestras y
    como el tema de quien no tiene uno. **Vender en tres pasos** (Piezas →
    Clienta → Cobro) con el total siempre abajo: lo suyo primero, un toque
    suma; su clienta de la lista con un toque o una nueva con **nombre y
    teléfono: desde su panel la cédula nunca es obligatoria** (el catálogo
    de su clienta sí la pide: ahí es como se la reconoce sin sesión); al
    aprobar, una clienta sin cédula entra al maestro una sola vez
    (`cliente_de_revendedor` busca la ficha de un pedido suyo anterior). El
    carrito vive en el teléfono (`lux-rv-vender-v1`) y el paso en la ruta
    (`?paso=2`), así "atrás" vuelve un paso. **Inicio dice lo urgente
    primero**: pagos por confirmar, lo que debe a Lux y cuándo vence,
    aprobados por retirar y lo que le deben.

---

## Antes de publicar

```bash
npm run verificar     # 430 comprobaciones con las dos sesiones (437 con LUX_REVENDEDOR). Sale 1 si algo se abrió.
npm run pruebas       # lo que no es base: `lib/ofertas.ts`, `lib/dominio.ts`, el tema del revendedor y su logo, la tarjeta y el reenvío, y los guiones de scripts/
npm run build         # tsc --noEmit + vite build
npx wrangler@4.157.0 deploy --dry-run   # si tocaste wrangler.jsonc o cloudflare/
```

Publicar es hacer push a `main`: el flujo prueba, construye, publica en
Cloudflare y, si salió y el dominio responde, deja el reenvío de github.io.
**Cloudflare es una sola tienda**: otra rama solo se publica con "Run
workflow" marcando `publicar_rama`, y lo que se publica ahí lo ven las
clientas (primero el SQL que pida). Se usó una vez, para encender el dominio
antes de fusionar la fase 2. Se publica desde una carpeta sin `package.json`
(`publicar/`): así instalar wrangler no corre los scripts de las dependencias
del sitio con el token de Cloudflare a la vista.

`verificar` es obligatorio después de tocar **una vista, un permiso, una función o
una política**. Si no hay terminal a mano, la pantalla **Verificación** hace setenta y dos
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
- **La base corre en UTC.** `current_date`, `v.fecha::date` y
  `date_trunc('month', now())` cortan el día cuatro horas antes que Venezuela:
  desde las 8 de la noche, "hoy" ya era mañana. Reportes por día, "Mi día", la
  meta, Vendedoras y "El mes" lo hacían, y la Caja no: una venta de las 22:30
  salía en días distintos en Reportes y en la Caja. Visto en la auditoría del
  24/11/2026 (#75). Se corta con `hoy_ve()`, `dia_ve()` e `inicio_mes_ve()`.
  Quedan con la fecha del servidor `tasas.fecha` y `conteos.fecha` (el cuadre
  compara la misma fecha con la misma, y es coherente).

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
- **Un texto oculto se escapa de una fila con scroll.** El texto para el
  lector de pantalla (`position: absolute`) dentro de una fila que se
  desliza de lado (`overflow-x: auto`) no se recorta si la fila no es
  `position: relative`: se ubica respecto a la página, y la página entera se
  corría 355 px de lado en el teléfono (Lookbook, fase 6). Ni la captura de
  Edge sin ventana lo enseña: esa ventana no baja de ~500 px de ancho, hay
  que emularla (CDP `Emulation.setDeviceMetricsOverride`).
- **base.css le pone a todo `input` el ancho y el alto de un campo de texto.**
  Un radio sin estilo propio sale como una caja vacía de 360 px, y uno
  escondido con `position: absolute` sin contenedor `relative` corre la
  página de lado: el editor del tema de la fase 6 hacía las dos cosas (Mi
  catálogo medía 603 px en un teléfono de 360) y nadie lo vio hasta mirarlo
  en la fase 7. Un radio lleva su `width`/`height` y su contenedor.
- **Un reinicio de estilos con la clase raíz delante empata con las clases.**
  `.pub :where(h2)` pesa lo mismo que `.lp-portada__frase`, y como
  publico.css se carga después que landing.css, el título de la portada salía
  en Jost. Sin peso (`:where(.pub) :where(h2)`) perdía ante `h1, h2, h3` de
  base.css y "La tienda" salía verde sobre verde. Lo que funciona:
  `:where(.pub) h2`, el peso de un elemento solo (fase 10). Y un `<a>` con
  clase de botón necesita su color en `:hover`: el `a:hover` de base.css
  pesa más que la clase sola.
- **base.css de Lux le pone su letra a `h1`–`h3`.** Una pantalla fuera del
  sistema de Lux (el catálogo del revendedor) lo deshace con
  `.rvc :where(h1, h2, h3...)`: con `:where`, cualquier clase suya gana.
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
- **El conteo semanal borraba lo apartado** durante semanas, sin un error.
  Cuando `v_venta_ubicacion.cantidad` pasó a ser lo libre, el mostrador se
  actualizó y el conteo no: decía "el sistema espera 3" donde había 5 (2 de un
  pedido), y guardar sin tocar la fila dejaba 3. Cada semana otra vez.
  Encontrado en la auditoría del 14/10/2026 y reproducido en PGlite (7 piezas
  antes, 5 después). Cuando una columna cambia de significado, se buscan TODAS
  las pantallas que la leen, no solo la que motivó el cambio.
  **Y volvió por la mano de quien cuenta** (28/10/2026): con la pantalla bien,
  la vendedora dejaba en 0 las piezas de los pedidos, y el conteo, que
  escribía la existencia, las borraba igual; el pedido ya no se podía
  entregar. Una regla que depende de que la persona cuente "bien" no es una
  regla: desde `esquema-conteo-autorizado.sql` el conteo no escribe, y el
  ajuste lo autoriza el dueño, nunca por debajo de lo apartado.
- **`manualChunks` con un paquete arrastra sus dependencias.** Al nombrar
  `recharts`, React entró en ese trozo; la entrada necesitaba React y precargaba
  los 392 KB de gráficos en todas las pantallas, el catálogo público incluido.
  Se ve en los `<link rel="modulepreload">` de `dist/index.html`, no en el
  código. Las pantallas perezosas ya se parten solas: no hace falta nombrarlas.
- **Una librería puede cargar código de otro sitio en caliente.** La
  compresión de fotos, con `useWebWorker`, bajaba su trabajador de
  cdn.jsdelivr.net en cada subida. Ahora se le da la copia del propio sitio
  (`libURL`, en `lib/fotos.ts`), y la política de seguridad de contenido
  (`vite.config.ts`) bloquea cualquier otro origen que no sea Supabase.
- **Un campo `type="number"` lee "1.500" como 1,5.** El navegador toma el
  punto como decimal, y "12,5" con coma lo deja VACÍO. En el regateo del
  mostrador, "1.500" bolívares bajaba la pieza a su mínimo; en Lotes, un
  flete de "1.200" eran $1,20 repartidos entre todas las piezas; en
  Inversiones, una vitrina de $1.500 se guardaba en $1,50; en Costos, lo
  ilegible contaba como cero y se guardaba un alquiler de cero. Todo en
  silencio. Corregido en la revisión del 15/10/2026: texto + `leerCifra`.
- **Una nota de crédito es una fila de `ventas`.** Lo que SUMA dinero se
  compensa solo (sus líneas van en negativo), pero lo que CUENTA ventas no:
  una devolución sumaría una venta más en "ventas de hoy", le renovaría el
  lavado a la clienta y saldría como su última compra. Toda vista o pantalla
  nueva que cuente ventas, o busque la última, filtra
  `devolucion_de is null`; la caja ya la deja fuera en `caja_flujo`.
- **Una cuenta de piezas tiene que saber qué es una pieza.** El volumen del mes
  reparte lo de tienda entre las piezas vendidas (`sum(venta_items.cantidad)`).
  Si los dijes, que no llevan lo de tienda, contaran como piezas, lo de tienda
  por pieza bajaría y todo el catálogo se abarataría sin un error. Por eso cada
  línea congela `es_dije` y toda cuenta que CUENTA piezas (o resta empaque por
  pieza) la filtra; las que SUMAN dinero, no. Visto antes de construir, en la
  revisión del diseño de los dijes (21/10/2026).
- **Una función cara dentro de una subconsulta se repite por cada fila que
  compara.** "Poner cada una en su grupo" calculaba el costo de cada pieza
  (que suma todas las ventas de la historia para lo de tienda) dentro de la
  búsqueda de su grupo; Postgres metió el cálculo en la subconsulta y lo
  repitió por cada grupo de la escalera. Con 302 piezas y 40 grupos, 162 s
  en PGlite; la base corta a los 8 s y el botón decía "tardó mucho" sin
  mover nada, peor mientras más grupos cargaba el dueño. Arreglado en
  `esquema-lote-y-grupos.sql` (83 ms, el mismo resultado): las cifras
  comunes una vez y el costo en un `with ... as materialized`. Reportado
  por el dueño el 27/10/2026.
- **Una amortización sin fin cobra lo que ya se pagó.** Los gastos del mes
  sumaban los exhibidores de todos los lotes y los muebles de Inversiones,
  cada uno entre sus meses, pero cada mes y para siempre: un exhibidor de 24
  meses se seguía cobrando el mes 25, y el lote en camino desde el día que se
  registraba. Nadie lo veía porque la cifra era chica y subía despacio con
  cada lote. Visto en el diagnóstico de lo de tienda del 27/10/2026; el dueño
  decidió sacarlos del precio (`esquema-precio-esencial.sql`).
- **Ordenar por categoría no es elegir por categoría.** La guía de escotes
  tomaba las tres primeras piezas que encajaban, y como llegaban en orden
  alfabético, "arete" iba antes que "cadena" y "collar": en cuello alto,
  barco y camisa salían tres aretes donde el dibujo pintaba una cadena
  (reportado por el dueño el 27/10/2026). Cuando una regla elige "las
  primeras N", se mira qué orden traen.
- **Lo que mide el total tiene que ser lo que cobra la base.** El carrito
  público multiplicaba el subtotal por el tramo, sin el piso de cada pieza:
  $88,35 en la barra y $91,35 en el pedido (probado en PGlite). Si una regla
  no se puede enseñar sin abrir un dato, se le pregunta a la base
  (`cotizar_pedido`), no se aproxima en el navegador.
- **Una petición que se repite al escribir puede volver fuera de orden.**
  El formulario de una pieza pedía `admin_sugerir_precio` con cada cambio y
  guardaba la respuesta que llegara; además ponía el grupo una sola vez, con
  la primera. La cadena y el grupo se quedaban con un costo viejo o a medio
  escribir, y "se arreglaba" cambiando el tipo a Dije y volviendo (reportado
  por el dueño el 18/11/2026). Ahora cada sugerencia lleva la clave de lo
  que se pidió (lote, costo, margen, tipo) y solo mueve el grupo la de lo
  escrito AHORA; el grupo sigue al costo hasta que el dueño lo elige
  (`lib/grupoSugerido.ts`) y un error se dice en vez de callarse.
- **Escribir en `configuracion` ejecuta `claves_ofertas()`.** El `check` que
  deja vacías solo las diez cifras de las ofertas la llama en cada `insert` o
  `update`, de cualquier clave y de cualquier sesión, así que está abierta a
  `authenticated` (como `piso_margen_de`). Si se revoca, Costos deja de poder
  guardar. Se vio en la revisión de la Tarea 3 (09/11/2026).
- **Un código tomado no puede volver a `emitido` mientras su pedido pueda
  entregarse.** Primera versión: vencer el pedido soltaba el código. Un abono
  verificado después revivía el pedido (`pedido_al_dia` pone `pagado_en` aunque
  esté vencido), y el mismo código quedaba en dos pedidos. Ahora solo se suelta
  en un estado terminal (`estado_codigo`): cancelado, cerrado, o vencido sin un
  solo abono vivo. Y `entregar_pedido` lo repite como defensa: las líneas cuyo
  código ya no es de ese pedido se cobran a `precio_sin_oferta_*`. Revisión de
  seguridad del 11/11/2026.
- **Un motivo distinto por código es un oráculo.** `cotizar_pedido` está abierta
  sin sesión y recibe hasta 20 códigos por llamada: con motivos distintos
  (`no_existe` contra `faltan_piezas`) cualquiera averiguaba cuáles existen.
  Tras dos arreglos (S2 y S2b), para quien no es de la tienda todo código que no
  aplica es `no_vale`, sin porcentaje, y `codigos_para_quien` es el único sitio
  que decide qué se enseña. **Una función sin sesión que dé detalle por código
  debe pasar por ella.** Sigue la fuerza bruta (31^6, unos 887 millones, un uso,
  tres días): aceptado.
- **El tope por visitante lo elige el cliente.** `emitir_oferta` cuenta los
  códigos por el `uuid` que manda el navegador; quien cambia de uuid esquiva el
  tope. Aceptado (S4): lo acotan el porcentaje (5 % la pareja, hasta 10 % el
  combo), el piso, el uso único y los tres días, y un tope por IP bloquearía a
  clientas reales detrás de la misma red. Para frenar a una sola fuente existe
  un freno global de 20.000 códigos al día, y quien cambie de visitante puede
  agotarlo: las ofertas del día se apagan para todos.
- **Retener un código ajeno se puede, y cuesta una hora.** Quien conozca un
  código (se lo mandaron, lo vio en una captura) puede ponerlo en un pedido
  falso: queda tomado hasta que el pedido vence (`reserva_minutos`), con el
  tope de 2 pedidos sin pagar por cédula y teléfono. Con un abono sin verificar
  y a propósito, hasta que se archive. El administrador cancela el pedido y el
  código se suelta. Por diseño: el código es de una persona, no un secreto.
- **El cobro de más de una devolución se reconoce por un texto.**
  `v_ofertas_mes` descuenta del rebajado lo que `admin_devolver_pieza` cobra de
  más, y lo encuentra por `extra_nota like 'Descuento del código…'`. Si alguien
  cambia ese texto, la cifra deja de compensar sin error.
- **Una línea con código roto conserva su `oferta_codigo_id`.** Con el precio ya
  sin oferta. Una pantalla que lea "tiene código" como "tiene oferta" miente:
  se compara `precio_usd < precio_sin_oferta_usd` (`tieneOferta`).
- **El navegador guarda por dirección.** `luxbyemory.com`, `entrar.` y cada
  subdominio tienen su propio almacenamiento: la sesión del personal vive en
  `entrar.`, la del revendedor en `luxbyemory.com`, el carrito de su clienta
  en su subdominio. Al pasar de github.io al dominio (19/11/2026) todos
  entraron una vez más y el borrador de un conteo a medias se quedaba atrás:
  por eso el cambio se hizo sin conteos abiertos. Si una dirección cambia
  otra vez, lo mismo.
- **Una ruta de `wrangler dev` no es la del dominio.** En local, `request.url`
  dice `localhost` aunque se mande otro `Host`: para probar el Worker como un
  subdominio, `wrangler dev --local-upstream jadujoyas.luxbyemory.com`. Y la
  `compatibility_date` no puede pasar la que soporta la versión fijada de
  wrangler (falla al arrancar, no al publicar).

- **Lo que el revendedor "paga a Lux" es el piso donde el piso manda.**
  `rv_precio_lux` no baja de `piso_margen_de`: en una pieza cuyo piso pasa
  la rebaja, lo que le sale ES el piso. Por eso su catálogo solo trae lo
  que deja rebaja. En la primera versión del #72, `rv_piezas` enseñaba
  también sus piezas propias con ese precio, y como él podía sumarse
  cualquier pieza con un ajuste, leía el piso de todo el catálogo, una por
  una (revisión de seguridad del 23/11/2026). Ahora `rv_piezas` no da ese
  precio fuera de su catálogo de la tienda, y él solo suma piezas que
  compró. **Toda pantalla nueva del revendedor que enseñe lo que paga a
  Lux lo enseña solo de piezas donde `lux < etiqueta`.**
- **Su inventario se puede apartar con pedidos falsos.** Cualquiera sin
  sesión puede pedir lo suyo con cédulas inventadas y reportar un pago
  falso: el pedido espera a que él lo confirme. Lo de la tienda lo acota
  su tope; lo suyo no (no le debe nada a Lux). Aceptado como el tope por
  cédula del catálogo de la tienda: él lo suelta con "no llegó" o
  cancelando. Frenarlo de verdad pediría una puerta con servidor.

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
