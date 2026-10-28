# Puesta en marcha

Todo lo que el sistema necesita para existir en una cuenta nueva. Si ya está
funcionando, esto sirve como referencia del orden de los SQL.

---

## 1. Supabase

Crea el proyecto y anota de **Project Settings → API**:

- **Project URL**
- **anon public key** — es pública por diseño: vive en el navegador y la protege
  RLS, no el secreto.

La **service_role key jamás** entra al repo, ni al navegador, ni a un chat. Si
alguna vez se filtra, se rota desde el panel de Supabase.

## 2. Los SQL, en este orden

En **SQL Editor**, uno por uno. Cada archivo dice en su cabecera de qué depende.

| # | Archivo | Qué trae |
|---|---|---|
| 1 | `esquema.sql` | Tablas, RLS, grupos de precio, tasas |
| 2 | `esquema-complemento.sql` | Vistas de admin y RPC de escritura |
| 3 | `esquema-seguridad-01.sql` | Cierra tres fugas de costo a la vendedora |
| 4 | `esquema-fase2.sql` | Ventas, cierre de caja, conteo |
| 5 | `esquema-parche-mayoreo.sql` | Arregla el mínimo de mayoreo |
| 6 | `esquema-fase3.sql` | Catálogo público, reservas, pedidos |
| 7 | `esquema-precios-bcv.sql` | Precio anclado al BCV y brecha |
| 8 | `esquema-descuentos.sql` | Tramos y kits por porcentaje |
| 9 | `esquema-regateo.sql` | Margen de negociación del mostrador |
| 10 | `esquema-parche-piso.sql` | Repara el catálogo caído por un permiso |
| 11 | `esquema-guia.sql` | La Guía del Colaborador dentro del sistema |
| 12 | `esquema-costos.sql` | Gastos del negocio dentro del precio |
| 13 | `esquema-inversiones.sql` | Vitrinas, muebles y barras de recuperación |
| 14 | `esquema-flete-y-gastos.sql` | **El modelo de costos vigente** |
| 15 | `esquema-grupos-nuevos.sql` | La escalera de siete grupos |
| 16 | `esquema-frases.sql` | Quita consejos duplicados y pone su llave única |
| 17 | `esquema-banco-frases.sql` | Las 222 frases del banco de la casa |
| 18 | `esquema-mensaje-catalogo.sql` | El texto que acompaña al enlace del catálogo |
| 19 | `esquema-pedido-completo.sql` | Datos del cliente, envío y pago en el pedido |
| 20 | `esquema-gastos-desglose.sql` | Los gastos del mes, partida por partida |
| 21 | `esquema-cobertura-mes.sql` | Cuánto del mes ya cubrieron las ventas |
| 22 | `esquema-valor-inventario.sql` | Cuánto vale lo que hay en vitrina |
| 23 | `esquema-parche-valor.sql` | Cierra una fila que se le escapaba a la vendedora |
| 24 | `esquema-reasignar-grupos.sql` | Botón para reacomodar precios tras cargar un lote |
| 25 | `esquema-piso-precio.sql` | El grupo se elige por el margen que deja |
| 26 | `esquema-recuperacion-bcv.sql` | La recuperación, toda en la misma moneda |
| 27 | `esquema-respaldo.sql` | Poder sacar un respaldo completo por HTTPS |
| 28 | `esquema-costos-cerrados.sql` | Cierra las funciones de costo a la vendedora |
| 29 | `esquema-indices-fk.sql` | Los índices que las claves foráneas no traen |
| 30 | `esquema-correcciones-datos.sql` | Arregla datos concretos; en base nueva no hace nada |
| 31 | `esquema-categorias-publicas.sql` | El filtro del catálogo, sin traerse mil filas |
| 32 | `esquema-tramos-en-mostrador.sql` | Fuera kits: el descuento por cantidad lo aplica el mostrador solo |
| 33 | `esquema-ubicacion-en-catalogo.sql` | Dónde está cada pieza, en el catálogo PDF y en clave en la vitrina |
| 34 | `esquema-clientes.sql` | El maestro de clientas: histórico, garantía y meses de servicio |
| 35 | `esquema-limpieza-kits.sql` | Suelta la función de venta de kits, que ya no llama nadie |
| 36 | `esquema-ubicacion-en-publico.sql` | El catálogo público también dice dónde está la pieza, en clave |
| 37 | `esquema-cuentas-claras.sql` | Una sola fórmula de gastos y de piezas a vender; arregla Costos, Reportes e Inversiones |
| 38 | `esquema-meta-vendedora.sql` | La meta de la vendedora, del día y del mes, sacada de las cuentas |
| 39 | `esquema-variantes-y-mostrador.sql` | Variantes, la tasa que fija la vendedora, el tramo que sí baja y por qué se rebajó cada pieza |
| 40 | `esquema-cedula-en-catalogo.sql` | El pedido del catálogo empieza por la cédula y reconoce a la clienta, enmascarada |
| 41 | `esquema-variantes-en-tabla.sql` | Las variantes se cargan en una tabla del formulario, en el mismo guardar |
| 42 | `esquema-pedidos-y-mover.sql` | Catálogo desde una pieza, mover piezas de ubicación, ventas por verificar, pedidos que se cobran y vitrina sin sesión |
| 43 | `esquema-apartadas-en-mostrador.sql` | El mostrador descuenta lo apartado por los pedidos, ubicación por ubicación |
| 44 | `esquema-datos-pago-e-historico.sql` | Los datos del pago móvil para copiar, las ventas y los pedidos que no se borran, y el crédito en la ficha de la clienta |
| 45 | `esquema-abonos.sql` | Pagar por partes: la venta queda por verificar diciendo cuánto falta, y cada abono se carga con su referencia |
| 46 | `esquema-revendedores.sql` | Revendedores: su catálogo con su precio, apartados de 15 días que salen de lo libre, su panel con su código, el tope por niveles y el cobro al retirar en Pedidos |
| 47 | `esquema-vendedoras.sql` | Las vendedoras del local, cada una con su número y su código; su meta y "Mi día" sin lo que retiran los revendedores. Necesita además la función de servidor `vendedoras` (sección 3.1) |
| 48 | `esquema-caja.sql` | La caja: lo que sale de la tienda se anota, lo que entra (ventas y abonos) entra solo; día por día y mes por mes, por forma de pago. Solo el administrador |
| 49 | `esquema-abonos-y-apartados.sql` | El apartado: se paga al menos el 40 % y hay 15 días para terminar (en el catálogo y en el mostrador, donde reemplaza a "Pagó una parte"); todo pedido recibe abonos con su referencia, que se corrigen con historial; el precio de cada pieza se congela al apartar; la venta nace al entregar; cerrar con dinero es del administrador (devolución a la caja). Amplía el respaldo |
| 50 | `esquema-revendedores-plazos.sql` | El pedido del revendedor en dos plazos: 2 horas para que su clienta le pague a él (a su pago móvil), 1 día desde que él confirma para pagarle a Lux, la tienda aprueba y ahí se registra la venta a nombre de su clienta, que entra al maestro. Vender desde su panel y sus días de crédito |
| 51 | `esquema-abonos-pedidos-de-antes.sql` | Los pedidos que ya estaban abiertos antes del apartado también reciben abonos: les congela el precio a cada pieza repartiendo su total de siempre en proporción a la etiqueta |
| 52 | `esquema-abonos-ventas-por-verificar.sql` | Las ventas que quedaron por verificar reciben abonos: el primero las vuelve por partes y la caja cuenta lo que de verdad llegó |
| 53 | `esquema-visitas-catalogo.sql` | Cuánta gente abre el catálogo en línea: un teléfono por día, sin sesión y sin datos de nadie; lo ven la vendedora y el administrador en la pantalla Catálogo, con los pedidos que entraron por él |
| 54 | `esquema-guia-revendedores.sql` | La guía pública para quien quiere ser revendedor: `rv_programa()` le da sin sesión las cifras del programa (ninguna de costo), y tres textos nuevos (WhatsApp, dirección y horario de la tienda) que se llenan en Textos |
| 55 | `esquema-fuera-de-catalogo.sql` | Al cobrar se puede sumar algo que no está en el catálogo (el dije de una cadena): los bolívares y qué es quedan en la venta y van en su total; no es pieza (ni existencia, ni tramo, ni meta) y no cuenta en lo que dejó la venta, porque no se sabe lo que costó |
| 56 | `esquema-conteo-y-cotizar.sql` | **Auditoría del 14/10/2026.** El conteo nuevo (`registrar_conteo`): solo lo contado, contra la foto de lo FÍSICO, y lo que se vendió mientras se contaba vuelve para contarlo otra vez; el viejo borraba lo apartado y ya no escribe. Los conteos anteriores (`v_conteos`, `v_conteo_detalle`). El total del catálogo público con la regla del pedido (`cotizar_pedido`). No se retira una pieza que un pedido aparta. Y nadie escribe `existencias`, `conteos` ni `conteo_detalle` en crudo: solo por sus funciones |
| 57 | `esquema-devoluciones.sql` | **Devoluciones.** Quitar una pieza de un pedido que no se ha entregado (`quitar_de_pedido`, de las dos caras; si sobra dinero ya comprobado, solo el administrador, que dice si se devuelve o se queda a favor), con su historia en `pedido_cambios`. Devolver una pieza ya entregada (`admin_devolver_pieza`): una nota de crédito con las tasas de la venta, la pieza vuelve a la existencia y el dinero, si se devuelve, sale de la caja como "Devolución". Las vistas y la caja no cuentan las notas de crédito como ventas. Depende del 56 |
| 58 | `esquema-quitar-por-verificar.sql` | Quitar una pieza de una venta **por verificar** (`quitar_de_venta`, de las dos caras): la línea baja (en cero queda "quitada", no se borra), la pieza vuelve a su ubicación y el total se recalcula con sus precios congelados; la historia queda en `venta_cambios`. Si es por partes y lo pagado pasa del total nuevo, decide el administrador. Las vistas que listan líneas se saltan las quitadas. Depende del 57 |
| 59 | `esquema-lote-en-camino.sql` | **El lote en camino.** Un lote se registra "en camino" y se le carga todo antes de que llegue: lo que trae va a `por_llegar`, nunca a `existencias`, así que no se vende, no se cuenta y no sale en la vitrina (un disparador no deja que una pieza de un lote en camino tenga existencia). Los productos nuevos salen como "Próximamente" en el Inventario y, para las clientas, en `v_proximamente`. La reposición (más piezas de uno que ya se vende) con `admin_guardar_por_llegar`. Liberar (`admin_liberar_lote`) suma a la existencia lo que de verdad llegó y deja escrito lo esperado. `v_catalogo_venta` y `v_catalogo_admin` cuelgan ahora de `v_catalogo_base`. Amplía el respaldo. Depende del 58 |
| 60 | `esquema-dijes.sql` | **Los dijes y las bases para armar.** Una pieza se marca dije o base (`modelos.armado`). El dije va sin lo de tienda (empaque y gastos del mes) y cae en su propia escalera de precios (`grupos_precio.escalera`, que carga el dueño en Grupos): base + dije cuesta lo que una pieza con los dos costos sumados. Cada línea de venta congela si era un dije (`venta_items.es_dije`, por un disparador) y, si lo era, lo de tienda en cero. El tramo se decide línea por línea en `tramo_de_carrito`: los dijes no cuentan, y solo lo reciben los que van con una base. El volumen del mes, `plan_ventas`, la meta y "Mi día" cuentan piezas sin dijes; el empaque de Reportes se resta sin ellos. El pedido del catálogo guarda qué dije va en qué base (`reserva_armados`, `v_pedido_armado`). `admin_sugerir_precio`, `admin_guardar_modelo` y `crear_reserva` ganan un parámetro al final. Amplía el respaldo. Depende del 59 |
| 61 | `esquema-catalogo-claro.sql` | **El catálogo que se entiende.** Claves nuevas de `textos` (`mapa_tienda`, `instagram_tienda`, `pago_movil_titular`, vacías) y `reglas_pedido()` sin sesión (el mínimo del apartado, sus días y los minutos que se guardan las piezas, nada más), para que el catálogo diga cómo se pide con cifras de verdad. Cierra tres puertas: un tope de pedidos del catálogo sin pagar por cédula o teléfono (`pedidos_sin_pagar_max`, 2, en `configuracion`; un disparador en `reservas`); un pago que no llegó suelta las piezas (`pedido_al_dia` devuelve el pedido a esperar el pago si lo pagado baja del mínimo, que queda congelado en `reservas.apartado_pct`); y `reportar_pago`, el reporte de antes, ya no confirma sin pagar un pedido con precio. Al correrlo suelta los que ya habían quedado apartados con un pago que no llegó. El navegador funciona con y sin él. Depende del 60 |
| 62 | `esquema-lote-y-grupos.sql` | **Borrar de un lote en camino, y reacomodar sin agotar el tiempo.** `admin_eliminar_de_lote` borra un producto que se cargó mal en un lote que todavía no llega, con todas sus medidas y lo que se esperaba de él (lo que ya llegó no se borra: se retira); si tuviera historia, no borra nada y lo dice. `admin_reasignar_grupos` ("Poner cada una en su grupo") con la misma regla y la misma respuesta, pero calcula lo de tienda, la brecha y la merma una vez y el costo de cada pieza otra vez: antes los repetía por cada grupo de la escalera y la base cortaba la llamada por tiempo (probado: 162 s antes, 83 ms después, con 302 piezas y 40 grupos). La fórmula del costo queda sola en `costo_bcv_con` (revocada a todos), y `costo_total_bcv` y `costo_bcv_pieza` la llaman con las mismas cifras: dan lo mismo. Sin él, el botón "Eliminar" dice que falta correrlo. Depende del 61 |
| 63 | `esquema-precio-esencial.sql` | **El precio lleva lo esencial.** `gastos_fijos_partidas` (misma firma) cuenta solo la operación: alquiler, sueldos, servicios y otros; los muebles y los exhibidores se pagan con la ganancia y los sigue Inversiones (antes se sumaban cada mes para siempre, también los de un lote en camino). La meta de piezas al mes del dueño (`piezas_mes_meta`, nueva en `configuracion`, en 0) reparte lo de tienda; sin meta, lo vendido, como antes (`volumen_real()`, nueva, es la cuenta de siempre). `v_volumen` dice 'meta' y gana `piezas_mes_reales` al final. Con los datos del 28/10/2026 y sin meta, lo de tienda baja de $6,13 a unos $5,89. Depende del 62 |

### Los que NO se corren

Cuatro archivos están **sellados**: lanzan una excepción en su primera línea.
Se quedan en el repo como historia de por qué el modelo es como es.

- `esquema-margen-real.sql`, `esquema-diagnostico.sql`, `esquema-objetivo-bcv.sql`
  — los reemplaza `esquema-flete-y-gastos.sql`. Correrlos revertiría las
  fórmulas **en silencio**.
- `esquema-limpieza-pruebas.sql` — **borra todos los datos**. Se escribió para
  limpiar las pruebas de las tres fases y ya cumplió.

## 3. Los usuarios de la tienda

Los administradores se crean a mano, una vez. Las vendedoras del local, **no**:
se crean desde la pantalla **Vendedoras** (sección 3.1). En **Authentication →
Users**, crea estos con correo sintético:

| Correo | Contraseña | Rol |
|---|---|---|
| `admin@lux.local` | larga y real, nunca un PIN | admin |
| `socio@lux.local` | larga y real | admin |

Luego, en `perfiles`, ponle a cada uno su `rol` y su `nombre`.

`vendedora@lux.local` (con `node scripts/derivar-pin.mjs <PIN>` de cuatro
dígitos) es la cuenta de antes. Sigue entrando mientras exista; en una
instalación nueva no hace falta crearla. Desde Vendedoras se le da su código
propio y pasa a ser una más.

### 3.1 La función de servidor `vendedoras`

Crear la cuenta de una vendedora, cambiarle el PIN o pausarla pide la llave
maestra de Supabase, que no puede estar en el sitio. Lo hace
`supabase/functions/vendedoras/index.ts`, que corre en el servidor de Supabase
y comprueba que quien la llama es administrador. Se publica **una vez** (y otra
cada vez que cambie ese archivo), de una de estas dos formas:

```bash
npx supabase functions deploy vendedoras --use-api
```

o en el panel: **Edge Functions → Deploy a new function → Via editor**, nombre
`vendedoras`, pega el contenido del archivo y **Deploy**. Deja activado "Verify
JWT". No hace falta ponerle secretos: Supabase le da sola la URL y la llave.

Sin publicarla, la pantalla Vendedoras lo dice al intentar crear una, y
`npm run verificar` marca sus tres comprobaciones como "NO ESTA PUBLICADA".

**El código de una vendedora** son ocho dígitos: su número (dos) y su PIN
(seis). La cuenta es `vendedoraNN@lux.local` y la contraseña sale del PIN con la
misma receta de `src/lib/auth.ts`. Se enseña una sola vez al crearla o al darle
PIN nuevo.

**El código del administrador ve costos, márgenes y puede retirar inventario, y
este sitio es estático.** Tiene que ser largo y no solo dígitos: seis cifras
numéricas son un millón de combinaciones y se prueban enteras. Activa además el
rate limiting de Auth en Supabase.

**Los revendedores no son usuarios de Supabase y no se crean aquí.** Se crean en
la pantalla **Revendedores** del administrador, que da a cada uno su código de
doce caracteres una sola vez. No tocan Authentication: para la base son
visitantes sin sesión con la llave de su propio panel (ver la cabecera de
`esquema-revendedores.sql`). No crees nunca una cuenta de Supabase para un
revendedor: con sesión vería todo lo que ve la vendedora.

## 4. El bucket de fotos

**Storage → New bucket** llamado `modelos`, **público**. Las fotos del catálogo
se comparten por enlace; no hay nada privado en ellas.

## 5. Local

```bash
cp .env.example .env      # y rellena URL y anon key
npm install
npm run logos             # regenera los assets de marca
npm run dev
```

## 5.1 Los dos comandos que hay que acordarse de correr

```bash
npm run respaldo          # saca los datos. Escribe FUERA del repositorio.
npm run verificar         # comprueba que la vendedora sigue sin ver costos.
```

Si en el entorno hay `LUX_REVENDEDOR` con el código de un revendedor de prueba,
también entra como él y mira que su panel no traiga costos; sin la variable, esas
cinco se saltan. Es lo único que escribe: la sesión que abre, y la cierra al
terminar.

`verificar` pide los dos códigos y no escribe nada: son todo lecturas. Córrelo
**después de tocar una vista, un permiso, una función o una política**, y antes
de publicar. Sale con código 1 si algo se abrió, así que sirve igual dentro de
un hook o de un workflow.

Lo que vigila no lo protege el compilador: un `revoke` que se cae, un
`where es_admin()` que alguien quita al reescribir una vista, un `having` que
vuelve a ser `where`. Esas cosas no rompen el build. Se rompen calladas.

## 6. GitHub Pages

En **Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

En **Settings → Pages**, source **GitHub Actions**. Cada push a `main` despliega
con `.github/workflows/desplegar.yml`.

---

## Comprobar que quedó bien

Abre **Verificación**, que es de administrador. Son treinta y cuatro pruebas en vivo con
la sesión que tengas abierta: tablas revocadas, vistas de costo, la nómina
rechazada para todos, el maestro de clientas sin costo congelado y que
`registrar_venta` siga siendo una sola, también para un navegador que aún no se
ha actualizado. No escribe nada.

Es la comprobación que se puede hacer desde el teléfono. La fuerte sigue siendo
`npm run verificar`, que entra con **las dos sesiones** y prueba lo que esta
pantalla no puede: que a la vendedora, de verdad, no le llegue nada.

**Si falla una de las de fuga, no sigas.** Significa que la vendedora está
viendo algo que no debería.
