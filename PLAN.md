> **Histórico.** Documento de construcción original, de agosto de 2026. El sistema
> ya está construido y el modelo de costos cambió varias veces desde entonces.
> Para poner en marcha una instalación nueva, usa **INSTALACION.md**.
> Esto se conserva porque explica por qué el sistema es como es.

# Sistema de Inventario y Ventas — Lux by Emory

Documento de construcción para Claude Code. Léelo completo antes de escribir código.
Construye **por fases**. No avances a la siguiente fase hasta que la actual pase su checklist de verificación con datos reales.

---

## 1. Qué es esto

Un sistema de inventario y punto de venta para una tienda de joyería hipoalergénica en Sabana de Mendoza, Venezuela. Opera venta al detal (mostrador + redes) y venta al mayor (kits para revendedoras).

**Escala actual:** ~400 piezas físicas, ~150 modelos distintos, 1 tienda física.
**Escala objetivo:** que aguante 4.000 piezas sin cambiar de arquitectura.

**Usuarios:** 2 administradores (dueño + socio) y 1 vendedora de mostrador.

---

## 2. Stack y restricciones

| Pieza | Decisión |
|---|---|
| Frontend | Vite + React + TypeScript |
| Estilos | CSS plano con variables (`tokens.css`). Sin Tailwind. |
| Base de datos / Auth / Storage | Supabase (plan gratuito) |
| Hosting | GitHub Pages (sitio **estático**) |
| Repo | GitHub |

### Restricciones que condicionan el diseño

1. **No hay servidor propio.** GitHub Pages solo sirve archivos estáticos. No hay API intermedia, no hay secretos del lado servidor. **Toda la seguridad real vive en las políticas RLS de Supabase.** Nunca confíes en una validación hecha solo en el navegador.
2. **Plan gratuito de Supabase:** 500 MB de base de datos, 1 GB de Storage. El texto no es problema; **las fotos sí**. Ver §7.
3. **La vendedora trabaja desde un teléfono Android de gama baja.** Todo el punto de venta debe ser usable con una mano, con dedos, y con internet lento.
4. **Los costos y márgenes son información confidencial del dueño.** La vendedora no debe poder verlos ni siquiera consultando la base directamente.

### Routing en GitHub Pages
Es un SPA sobre hosting estático: usa `HashRouter` de React Router (rutas tipo `/#/ventas`). Evita el truco de copiar `index.html` a `404.html`; el hash router es más simple y no falla.

---

## 3. El modelo de datos conceptual (lee esto antes del SQL)

Cuatro decisiones estructurales. Si te desvías de alguna, el sistema se rompe más adelante.

### 3.1 Se inventarían MODELOS con cantidad, no piezas individuales

No existe "la pieza #247". Existe "cadena cubana dorada" de la que **quedan 18**.

Motivo: etiquetar 400 joyas con QR es inviable físicamente (el sticker es más grande que el anillo) y no escala a 4.000. Y el catálogo en PDF muestra modelos con foto, no piezas.

Variantes menores (grosor, largo) **no crean modelos nuevos** si cuestan y se venden igual. Se anotan en el campo `variantes_nota` como texto libre, para que la vendedora sepa qué hay sin ir a mirar la vitrina.

### 3.2 Cada lote de compra sella su tasa — y no se toca nunca más

Cuando entra mercancía importada, se registra un **lote** con la tasa Binance del día de compra. Ese costo queda **congelado en dólares para siempre**. Es un hecho histórico.

Si el próximo lote entra a otra tasa, sella la suya. Así se puede comparar honestamente si un lote costó más o menos que el anterior.

**Nunca recalcules el costo de un lote viejo con una tasa nueva.**

### 3.3 El precio de venta se ancla en dólares y se convierte al vuelo

El precio se fija en **dólares reales que el negocio quiere conservar** (`precio_objetivo_usd`). El precio en bolívares **no se guarda por modelo**: se calcula al mostrar, multiplicando por la tasa vigente.

```
precio_bs = precio_objetivo_usd × tasa_venta_actual
```

Motivo: la brecha se mueve constantemente. Si el precio en Bs estuviera tecleado en cada modelo, mover la tasa obligaría a reeditar 150 filas a mano. Con una sola tasa maestra, todo el catálogo se repricia al instante.

Hay **tres tasas** y cada una tiene un trabajo distinto:

| Tasa | Dónde vive | Para qué sirve |
|---|---|---|
| `tasa_binance_compra` | Congelada en cada **lote** | Saber cuánto costó de verdad ese lote |
| `tasa_venta` | Registro maestro **vigente** | Convertir precio USD → Bs al cobrar |
| `tasa_bcv` | Registro maestro **vigente** | Mostrar el equivalente de referencia en $ |

La `tasa_venta` la fija el administrador a mano. El sistema muestra la brecha calculada (`tasa_venta / tasa_bcv - 1`) como dato informativo, pero **no la impone**.

### 3.4 Cada venta congela la tasa que usó

Igual que el lote. Al registrar una venta se guarda `tasa_venta_usada` y `tasa_bcv_usada` en el registro. Así el margen histórico es exacto aunque la tasa cambie mañana.

**Margen realizado de una venta** = `(total_bs / tasa_venta_usada) − suma(costo_puesto_usd)`.

---

## 4. Costeo: flete prorrateado y exhibidores

El costo real de una pieza no es lo que costó la pieza. Es **costo puesto** = costo unitario + su parte del flete.

### Regla crítica: los exhibidores NO son inventario

Los exhibidores importados son **inversión de tienda (CAPEX)**, no mercancía. Su costo y su parte del flete van a una cuenta aparte, **nunca se cargan al costo de las joyas**. Si se mezclan, cada anillo carga un peso que no le toca y el margen se ve peor de lo que es.

### Prorrateo del flete

**Método preferido: por peso.** Los exhibidores pesan mucho y las joyas casi nada. Repartir por valor haría que la joyería liviana absorba flete causado por exhibidores pesados.

```
flete_a_mercancia = flete_total_usd × (peso_mercancia_g / peso_total_g)
flete_por_gramo   = flete_a_mercancia / peso_mercancia_g
flete_unitario(i) = peso_unitario_g(i) × flete_por_gramo
costo_puesto(i)   = costo_unitario_usd(i) + flete_unitario(i)
```

**Método alterno: por valor** (si no se tienen los pesos):
```
flete_unitario(i) = flete_a_mercancia × (costo_unitario_usd(i) / costo_mercancia_total_usd)
```

El lote guarda cuál método se usó en `metodo_prorrateo`. El administrador elige al registrar el lote.

### Ejemplo verificable (úsalo como caso de prueba)

Lote: mercancía $1.000, exhibidores $200, flete $150. Peso mercancía 2.000 g, exhibidores 8.000 g.

- `flete_a_mercancia` = 150 × (2000/10000) = **$30**
- `flete_a_exhibidores` = **$120** → va a CAPEX, no a las joyas
- `flete_por_gramo` = 30 / 2000 = **$0,015/g**
- Una cadena de 12 g con costo $2,50 → flete $0,18 → **costo puesto $2,68**
- CAPEX de tienda del lote = 200 + 120 = **$320**

---

## 5. Esquema de base de datos

El SQL completo y ejecutable está en **`esquema.sql`**. Pégalo en el SQL Editor de Supabase. Resumen de tablas:

| Tabla | Rol |
|---|---|
| `perfiles` | Extiende `auth.users` con nombre y rol (`admin` / `vendedora`) |
| `tasas` | Histórico de tasas; una sola marcada `vigente` |
| `lotes` | Cada importación, con su tasa Binance sellada y datos de flete |
| `grupos_precio` | G9, G11, G13, G20, G28 — precio en USD por grupo |
| `modelos` | El catálogo: nombre, foto, costo, grupo, peso, variantes |
| `ubicaciones` | Vitrina 1, Vitrina 2, Exhibidor aéreo, Mostrador, Bodega |
| `existencias` | Cantidad de cada modelo en cada ubicación |
| `ventas` + `venta_items` | Ventas con tasas y costos congelados |
| `kits` + `kit_items` | Kits fijos para mayoreo |
| `conteos` + `conteo_detalle` | Cuadre diario por ubicación y conteo semanal detallado |
| `reservas` + `reserva_items` | Fase 3: apartado temporal del catálogo público |

### Reglas no negociables del esquema

- **Dinero en `numeric(12,4)`**, nunca `float`. Los flotantes acumulan error en centavos.
- **`costo_puesto_usd` es columna generada**, no editable a mano.
- **Nunca guardes precios en Bs por modelo.** Solo se guardan Bs en `ventas` (histórico congelado).
- **La existencia siempre es por ubicación.** No hay un "stock total" guardado; se suma.

---

## 6. Roles y seguridad (RLS)

| Puede | Admin | Vendedora |
|---|---|---|
| Ver costos, flete, márgenes, lotes | Sí | **No** |
| Crear/editar modelos, lotes, tasas, kits | Sí | No |
| Ver catálogo con fotos, precios de venta y existencias | Sí | Sí |
| Registrar ventas | Sí | Sí |
| Ver ventas históricas de todos | Sí | Solo las del día en curso |
| Hacer conteos y cuadre | Sí | Sí |
| Ver reportes de ganancia | Sí | No |

### Cómo se implementa el bloqueo de costos

RLS filtra **filas**, no columnas. Para que la vendedora no vea costos:

1. `REVOKE SELECT ON modelos FROM authenticated` — nadie lee la tabla directo.
2. Crear la vista `v_catalogo_venta` que expone **solo** columnas seguras (id, sku, nombre, categoría, foto, grupo, precio_usd, variantes_nota).
3. Crear la vista `v_catalogo_admin` con todo, protegida por una función `es_admin()`.
4. El frontend de la vendedora consulta **únicamente** `v_catalogo_venta`.

### Autenticación con PIN de 4 dígitos

Supabase Auth trabaja con correo + contraseña. Se usa un correo sintético:

- La vendedora escribe usuario `vendedora` y PIN `1234`.
- El cliente arma `vendedora@lux.local` + contraseña derivada del PIN.

**Sé honesto sobre esto en el código y con el usuario:** un PIN de 4 dígitos son 10.000 combinaciones. Como el sitio es estático, cualquiera con el código puede intentar fuerza bruta contra Supabase. Mitigaciones obligatorias:

- Los **administradores usan contraseña larga real**, no PIN. Ahí viven los costos.
- El PIN es solo para la vendedora, cuyo alcance máximo es ver el catálogo de venta y registrar ventas — no puede leer costos ni borrar nada.
- Activar rate limiting de Auth en Supabase.
- Rotar el PIN cuando cambie el personal.

---

## 7. Fotos: la única restricción real del plan gratuito

1 GB de Storage. Una foto directa del teléfono pesa 3–4 MB → 250 fotos llenan el plan. Una foto de catálogo bien comprimida pesa 100–200 KB → 250 fotos usan **~40 MB (4 % del plan)**.

**Comprime siempre en el navegador antes de subir. Sin excepción.**

- Redimensionar el lado mayor a **1200 px**
- Convertir a **WebP**, calidad ~0,8
- Generar además un **thumbnail de 300 px** para la cuadrícula del punto de venta
- Objetivo: < 200 KB la grande, < 30 KB el thumb
- Usar `browser-image-compression` o `canvas` nativo
- Rechazar la subida si el resultado supera 400 KB, mostrando el peso

El bucket es público de lectura (las fotos van al catálogo público en Fase 3), pero **solo el admin puede escribir**.

> **Nota sobre pausa por inactividad:** el plan gratuito pausa el proyecto tras ~7 días sin actividad. Si la tienda vende a diario, nunca ocurre. Si ocurre, se reactiva con un clic sin perder datos. No requiere código.

---

## 8. FASE 1 — Cimientos e inventario

**Objetivo:** que el administrador pueda cargar todo el inventario real y generar el catálogo en PDF.

### Alcance

1. Repo, proyecto Vite + React + TS, deploy automático a GitHub Pages con GitHub Actions.
2. Esquema completo de `esquema.sql` aplicado en Supabase, con RLS activo y probado.
3. Login con usuario + PIN/contraseña para los 3 perfiles.
4. **Panel de tasas:** fijar `tasa_venta` y `tasa_bcv` vigentes; ver la brecha calculada; histórico de cambios.
5. **Gestión de lotes:** registrar lote con tasa Binance sellada, costo de mercancía, costo de exhibidores, flete, pesos y método de prorrateo. El sistema calcula y muestra el flete asignado a mercancía vs. CAPEX.
6. **Grupos de precio:** CRUD de G9, G11, G13, G20, G28 con su precio en USD.
7. **Carga de modelos:** formulario con foto (comprimida en el navegador), nombre, categoría, SKU autogenerado, lote, costo unitario, peso, grupo de precio, nota de variantes, y cantidad inicial por ubicación.
8. **Vista de inventario:** tabla filtrable por categoría, grupo, ubicación y lote. Muestra costo puesto, precio, margen $ y margen %.
9. **Catálogo PDF:** vista imprimible que lista los modelos **con existencia > 0**, con foto, nombre, variantes y precio en Bs y $. Se genera con una hoja de estilos `@media print` y el "Guardar como PDF" del navegador — sin librerías, con control total de la marca.

### SKU: cómo se genera

`{CATEGORIA}-{GRUPO}-{correlativo}` → `CAD-G13-007`, `ANI-G9-032`.
Autogenerado al crear el modelo, editable por el admin, único.

### Checklist de verificación de Fase 1

- [ ] Los 3 usuarios entran con sus credenciales.
- [ ] Con sesión de vendedora, una consulta directa a `modelos` **falla**; a `v_catalogo_venta` funciona y **no trae ninguna columna de costo**.
- [ ] Se carga el lote de ejemplo de §4 y el costo puesto de la cadena da **$2,68**, y el CAPEX da **$320**.
- [ ] Se cargan 10 modelos reales con foto; cada foto subida pesa < 200 KB (verificado en el bucket).
- [ ] Cambiar la `tasa_venta` en el panel cambia el precio en Bs de **todos** los modelos, sin editar ninguno.
- [ ] El PDF del catálogo sale con la identidad de Lux y omite los modelos en cero.
- [ ] El sitio carga en GitHub Pages desde un teléfono.

---

## 9. FASE 2 — Punto de venta y cuadre

**Objetivo:** que la vendedora registre ventas en el momento y que el inventario cuadre.

### Alcance

1. **Cuadrícula de venta:** fotos grandes tocables, filtro por ubicación y por grupo de precio, buscador por nombre. Cada tarjeta muestra foto, nombre, precio en Bs y existencia en esa ubicación. **Diseñada para tocar, no para leer.**
2. **Registrar venta al detal:** tocar foto → elegir cantidad → método de pago → confirmar. Descuenta de la ubicación seleccionada. Muestra total en Bs (y el equivalente en $ BCV como referencia).
   - Métodos de pago: punto de venta, pago móvil, transferencia, efectivo Bs, efectivo $.
   - Congela `tasa_venta_usada`, `tasa_bcv_usada` y `costo_puesto_usd` de cada ítem.
3. **Venta al mayor con kits fijos:** seleccionar kit → confirmar → descuenta todos los modelos del kit de una vez. **Un solo movimiento, no 50 toques.**
   - El precio del kit se define como **$ por pieza**, nunca como porcentaje de descuento sobre el detal (si se define como %, al mover la tasa el descuento se descuadra solo).
   - Mínimos de mayoreo: **6 piezas o $30**, lo que se cumpla primero. Validado en base de datos, no solo en el navegador.
4. **Cierre diario:** al final del día, la vendedora cuenta **solo cantidades** por ubicación. El sistema compara contra lo esperado (existencia inicial − ventas del día) y **alerta si no cuadra**. Rápido, sostenible.
5. **Conteo semanal detallado:** pieza por pieza, modelo por modelo, con ajuste de existencias y registro de la diferencia.
6. **Tablero del día (vendedora):** piezas vendidas hoy, ticket promedio, cuántas de $20+ lleva. Sin costos ni márgenes.
7. **Reportes (admin):** ventas por día/semana/mes, ganancia en $ real, mezcla por grupo de precio, rotación por modelo, y modelos dormidos (sin venta en 30/60 días).

### Nota sobre metas de venta

El tablero de la vendedora existe para empujar el **ticket promedio**, no el conteo de piezas. Vender 4 anillos de $9 cumple el número de piezas y falla en plata. La meta se muestra como dos cifras: piezas del día y **cuántas de esas fueron de $20 o más**.

Las metas concretas se calibrarán cuando el inventario real esté cargado. Deja los valores en una tabla de configuración editable por el admin, **no los quemes en el código**.

### Checklist de verificación de Fase 2

- [ ] Registrar una venta desde un teléfono toma **menos de 10 segundos**.
- [ ] Vender 2 unidades de un modelo baja la existencia **solo en la ubicación** elegida.
- [ ] Vender un kit fijo de 10 piezas descuenta los 10 modelos correctos de una sola vez.
- [ ] Intentar una venta al mayor de 4 piezas por $18 es **rechazada por la base de datos**, no solo por el formulario.
- [ ] Forzar un descuadre (quitar una pieza a mano) hace que el cierre diario lo detecte y lo reporte.
- [ ] Cambiar la tasa después de una venta **no altera** el margen histórico de esa venta.
- [ ] La vendedora no ve ninguna cifra de costo ni de ganancia en ninguna pantalla.

---

## 10. FASE 3 — Catálogo público y armador de kits

**No empezar hasta que el inventario esté cargado y confiable.** Un catálogo público con datos malos quema a la clienta.

### Alcance

1. **Enlace público de solo lectura** con los modelos disponibles: foto, nombre, variantes, precio. Sin login.
2. **Armador de kits:** la mayorista va tocando piezas; el sistema cuenta y calcula el total según las reglas (mínimo 6 piezas o $30, precio por tramo).
3. **Reserva temporal:** al confirmar la selección, las piezas quedan apartadas **60 minutos**. Si no confirma, se liberan solas.
   - Implementar con `expira_en` y una función que limpie reservas vencidas al consultar existencias. No depende de cron.
   - La existencia disponible que ve el público es `existencia − reservado_vigente`.
4. **El pedido llega estructurado a la vendedora:** lista con fotos y **ubicación de cada pieza**, para armarlo en orden y despacharlo sin errores.
5. Enlace compartible por WhatsApp con vista previa decente (etiquetas Open Graph).

### Checklist de verificación de Fase 3

- [ ] El catálogo público carga sin sesión y **no expone ningún costo** (verificado inspeccionando la respuesta de red).
- [ ] Armar un kit desde otro dispositivo genera una reserva visible para la vendedora.
- [ ] Una reserva sin confirmar libera sus piezas al pasar los 60 minutos.
- [ ] Dos personas no pueden reservar la última unidad del mismo modelo.
- [ ] El pedido que ve la vendedora incluye la ubicación de cada pieza.

---

## 11. Orden de trabajo y reglas de proceso

1. Trabaja una fase completa, verifícala con el checklist, **haz commit**, y solo entonces continúa.
2. Cada fase debe quedar desplegada y usable en GitHub Pages antes de pasar a la siguiente.
3. Ante cualquier duda de identidad visual, consulta la skill **`lux-ui`**.
4. Ante cualquier duda de convenciones de código, dinero o base de datos, consulta la skill **`lux-codigo`**.
5. **Nunca inventes cifras de precios, kits o descuentos.** Los valores reales los carga el administrador en la aplicación.

## 12. Fuera de alcance (por ahora)

Facturación fiscal, integración con pasarelas de pago, envíos y guías de despacho, app nativa, y kits de armado libre desde el mostrador. Se evaluarán después de que las tres fases estén en uso real.
