---
name: lux-codigo
description: >-
  Convenciones de código, manejo de dinero y tasas, seguridad RLS, fotos y
  estructura del sistema de inventario y ventas de Lux by Emory (Vite + React +
  TypeScript + Supabase sobre GitHub Pages). Úsala SIEMPRE que escribas, revises
  o modifiques código, consultas SQL, políticas de seguridad, subida de imágenes
  o cálculos de precio, costo, margen o conversión bolívar/dólar en el sistema de
  Lux. Actívala aunque el usuario solo pida "agrega esta función" o "arregla este
  bug"; basta con que la tarea toque el código del sistema.
---

# Lux by Emory — Convenciones de código

## Contexto que condiciona todo

Sitio **estático** en GitHub Pages. No hay servidor propio, no hay API intermedia, no hay secretos ocultos. **Toda la seguridad real vive en las políticas RLS de Supabase.**

Consecuencia práctica: cualquier validación escrita solo en React es una comodidad para el usuario, **nunca una protección**. Toda regla que importe (mínimos de mayoreo, quién ve costos, quién edita qué) debe existir también como restricción, trigger o política en la base de datos.

---

## Reglas de dinero — las más importantes del proyecto

### 1. Nunca uses `float` para dinero
En la base: `numeric(12,4)`. En TypeScript, trabaja en enteros o usa las utilidades del proyecto; nunca acumules sumas en punto flotante.

### 2. El dólar es la unidad ancla. El bolívar es una vista
Se **guarda** el precio en USD. Se **calcula** el precio en Bs al mostrar.

```ts
precioBs = precioUsd * tasaVenta
```

Nunca guardes un precio en Bs en la tabla `modelos`. Si lo haces, mover la tasa obliga a reeditar 150 filas a mano y el sistema muere de mantenimiento.

**Única excepción:** `ventas` y `venta_items` guardan Bs porque son un hecho histórico congelado.

### 3. Hay DOS monedas en el costo, y la brecha solo toca una

Corregido por el dueño el 30/08/2026, después de que el sistema inflara cada
pieza unos $0,57 durante toda la fase de pruebas.

| Qué | En qué dólar nace | ¿Se multiplica por la brecha? |
|---|---|---|
| Mercancía y su flete | **Binance** (se compra afuera) | **Sí** |
| Exhibidores importados | **Binance** | **Sí** |
| Alquiler, sueldos, servicios, empaque | **BCV** (se paga aquí) | **No** |
| Muebles comprados aquí | **BCV** | **No** |

```
costo BCV = costo_puesto * brecha * merma  +  gastos_de_tienda
precio    = costo BCV / (1 - margen)
```

La brecha responde a **una sola pregunta**: cuántos dólares BCV hacen falta
para volver a comprar esa pieza a tasa Binance. No es un multiplicador
general de costos. Aplicársela al alquiler es cobrarle al cliente una
conversión que nunca ocurre.

**Corolario:** el margen y las ganancias se reportan **en dólares BCV**. Antes
daba igual —costo y precio vivían en la misma moneda y el porcentaje no cambia
al dividir arriba y abajo por lo mismo—; ahora el costo es mixto y ya no da
igual. Aparte se muestra la ganancia en dólares reales, que son los
recomprables. `inversiones.moneda` dice en cuál se pagó cada una.

### 4. El flete se reparte por bulto, nunca por peso ni por valor

El flete no cobra por lo que vale la caja ni por lo que pesa un anillo: cobra
por traerla. Se divide entre **todo** lo que vino, exhibidores incluidos.

```
flete por unidad = costo_flete / (piezas_mercancia + unidades_exhibidores)
```

El reparto por valor le cargaba $0,89 de flete a un collar de $10,97 y
$0,07 a un brazalete de $0,92 que viajó en la misma caja. **El peso ya no
existe en el sistema**: ni columna, ni campo, ni pregunta. No lo reintroduzcas.

### 5. Nunca inventes una merma ni un volumen

Un 5 % de merma supuesto encarece todas las piezas todos los meses aunque no
se dañe nada. Se cuentan piezas: `piezas_danadas_mes`, y si es 0 el factor es
1 y no encarece nada.

El volumen tampoco se pregunta ni se supone para siempre: arranca del objetivo
de inventario entre los meses de rotación, y **en cuanto hay un mes cumplido
desde la primera venta pasa a medirse de las ventas reales**. `v_volumen.origen`
dice cuál de las dos está mandando.

### 6. Tres tasas, tres trabajos — no las confundas

| Tasa | Vive en | Se usa para | ¿Cambia? |
|---|---|---|---|
| `tasa_binance_compra` | Cada **lote** | Costo real del lote | **Nunca.** Es historia. |
| `tasa_venta` | Registro maestro vigente | Convertir USD → Bs al cobrar | Sí, la fija el admin |
| `tasa_bcv` | Registro maestro vigente | Mostrar referencia en $ | Sí, la fija el admin |

**Nunca recalcules el costo de un lote viejo con una tasa nueva.** Si aparece código que hace eso, es un bug grave: borra la historia real de la inversión.

### 7. Congela al momento del hecho
Al registrar una venta, guarda en el registro: `tasa_venta_usada`, `tasa_bcv_usada`, `precio_unitario_usd`, `precio_unitario_bs`, `costo_puesto_usd_snap` y `costo_operativo_usd_snap`.

Motivo: el margen histórico debe seguir siendo exacto aunque la tasa cambie mañana. Si el reporte de ganancia de enero cambia porque hoy movieron la tasa, el sistema está mintiendo.

### 8. El margen se mide en dólares, y son los BCV
```
ganancia_bcv = (total_bs / tasa_bcv_usada)
             − Σ((costo_puesto_usd_snap × brecha_congelada + costo_operativo_usd_snap) × cantidad)
```
donde `brecha_congelada = tasa_venta_usada / tasa_bcv_usada`. La brecha del día
de la venta, no la de hoy: si el reporte de enero cambia porque hoy movieron la
tasa, el sistema está mintiendo.

Nunca reportes ganancia en bolívares como cifra principal: la inflación la
vuelve ilegible en semanas. Y no mezcles monedas dentro de una resta — es el
error que estuvo vivo toda la fase de pruebas.

### 9. Costo puesto, no costo pelado
El costo de una pieza es `costo_unitario_usd + flete_unitario_usd`. Es columna generada en la base; **no la calcules a mano en el frontend**.

### 10. Los exhibidores no son inventario
Su costo y su parte del flete van a CAPEX de tienda (`v_capex_lote`), **jamás al
costo de las joyas**.

Ojo con la sutileza: los exhibidores **sí** pagan flete y lo pagan igual que
cualquier otro bulto (regla 4). Lo que nunca ocurre es que esa parte se le cargue
a las joyas. Reparto parejo entre bultos, destinos distintos.

### 11. El mayoreo es una regla, no una lista

**Los kits ya no existen.** Se quitaron en septiembre de 2026, con sus dos
pantallas. La única forma de vender al mayor son los **tramos**: 6 piezas 5 %,
12 piezas 10 %, 20 piezas 15 %, configurables desde la pantalla de Tramos.

La escalera vive en `tramos_mayoreo` y la resuelve `descuento_para(piezas)`. Se
aplica en tres sitios y **los tres tienen que decir lo mismo**:

- `registrar_venta` — la que manda. Calcula el tramo por el **total de piezas de
  la venta**, no por línea, así que hay que sumarlas antes de recorrer nada.
- El carrito del mostrador — solo para que la vendedora vea lo que va a cobrar.
- El catálogo público — para que la clienta vea su precio al armar el pedido.

Tres reglas que no se negocian:

1. **El tramo nunca baja del piso.** `greatest(lista * (1 - desc/100), precio_minimo_de(modelo))`.
   Sin ese `greatest`, un 15 % sobre una pieza de margen fino vende a pérdida y
   nadie se entera hasta el cierre del mes.
2. **Si la vendedora ya regateó, manda su precio** y el tramo no se le suma
   encima. Sumar los dos es descontar dos veces la misma pieza.
3. **El navegador no decide el precio.** El mostrador manda
   `precio_unitario_usd` solo cuando ella rebajó a mano; el descuento por
   cantidad lo calcula la base. Si lo mandara el navegador, el precio lo estaría
   fijando el cliente.

---

## Migraciones SQL — la lista antes de entregar un archivo

Escrita el 30/08/2026 después de mandar dos migraciones que fallaron a mitad.
Ninguna falló por no saber SQL: fallaron por no revisar qué dependía de lo que
se estaba borrando. **Recórrela entera antes de decir "corre esto".**

### 1. ¿Qué depende de cada columna que borras?

En Postgres dependen de una columna, y bloquean el `DROP COLUMN`:

- **Vistas** que la nombren, aunque sea con `select *`.
- **Triggers** que la nombren **en su cláusula `WHEN`** ← el que se olvida.
- **Columnas generadas** que la usen en su expresión.
- Índices, constraints `CHECK`, políticas RLS.

```bash
grep -rn "nombre_columna" *.sql          # incluye la clausula WHEN de los triggers
grep -n "create trigger" -A 12 *.sql     # leelas: el WHEN no salta a la vista
```

**El orden correcto siempre es:** borrar vistas → borrar triggers → borrar
funciones → `ALTER TABLE` → recrear en el orden inverso.

### 2. ¿Se puede volver a correr entero?

Va a fallar a la mitad alguna vez, y entonces hay que poder repetirlo sin
limpiar nada a mano. `if exists` / `if not exists` en todo. Una columna
generada nueva se borra justo antes de crearse.

### 3. `create or replace view` solo sabe añadir columnas AL FINAL

Tres cosas le están prohibidas, y las tres dan error:

- **Quitar** una columna → `ERROR 42P16: cannot drop columns from view`.
- **Cambiar el tipo** de una que ya existe.
- **Meter una nueva en medio.** Al correr las demás de sitio, Postgres lo lee
  como un renombrado: `cannot change name of view column "x" to "y"`.

Una columna nueva va **al final del select**, siempre, aunque quede lejos de
sus compañeras temáticas. Ese es el precio de poder añadirla sin borrar la
vista.

Si de verdad hay que reordenar o quitar, es `drop view ... cascade` y
`create view` — y entonces **hay que volver a otorgar el `grant select`**,
que se fue con la vista.

### 4. Los archivos que quedan obsoletos se sellan

Un `create or replace` viejo no siempre falla: a veces revierte las fórmulas
en silencio. Al archivo superado se le pone en la primera línea:

```sql
do $guarda$
begin
  raise exception 'Este archivo quedo obsoleto: corre <el nuevo> en su lugar.';
end
$guarda$;
```

### 5. Comprueba contra la base real, no contra la cabeza

Hay acceso con la anon key y el código del admin. Antes de entregar, y otra vez
después de que el dueño corra el archivo:

```js
const db = createClient(url, anonKey);
await db.auth.signInWithPassword({ email: 'admin@lux.local', password: '<codigo>' });
const { data } = await db.from('v_diagnostico').select('*');
```

El script va en `prueba-temporal.mjs`, que está en `.gitignore`, y **se borra
al terminar**. PostgREST solo expone `public`, así que **no se puede consultar
`pg_depend` ni correr DDL desde aquí**: las dependencias se revisan leyendo los
`.sql`, no preguntándoselas a la base.

### 6. Dale las cifras esperadas junto con el archivo

"Debería darte margen 44,4 % y ganancia $741,10." Si no cuadra, se descubre en
minutos y no en un mes de precios mal puestos.

### 7. Nunca cambies la FIRMA de una función que el navegador ya llama

Escrita el 08/09/2026, antes de romperlo.

El SQL corre en un segundo. El despliegue de GitHub Pages tarda minutos. En esos
minutos la tienda está abierta y el navegador que hay en el teléfono de la
vendedora es el **viejo**. Si le quitas un parámetro a una función, esa versión
vieja la llama con un parámetro que ya no existe, PostgREST no encuentra ninguna
función que encaje, y ella no puede cobrar. Con una clienta delante.

Así que un parámetro que sobra **se queda y se ignora**, con un comentario que
diga por qué. Cuesta una línea. La ventana costaría ventas. Se limpia otro día,
con la tienda cerrada.

De ahí sale el orden de siempre: **primero el SQL, después el navegador.** Al
revés la pantalla enseña algo que la base todavía no hace, y en este sistema
"algo" suele ser un precio.

### 8. Antes de publicar, `npm run verificar`

37 comprobaciones con las dos sesiones: que la vendedora no ve costos, que sí
puede trabajar, que el administrador sí ve lo suyo y que la clienta solo ve el
catálogo. Sale con código 1 si algo se abrió.

Lo que vigila no lo mira el compilador: un `revoke` que se cae, un
`where es_admin()` que alguien quita al reescribir una vista, un `having` que
vuelve a ser `where`. Nada de eso rompe el build.

---

## Trampas que ya mordieron

Ninguna da error al escribirla. Por eso están aquí.

**Una vista no te presta su permiso para ejecutar funciones.** Postgres comprueba
el `EXECUTE` contra **quien consulta**. Dentro de una función `security definer`,
en cambio, lo comprueba contra **el dueño**. De ahí sale el patrón de
`costo_operativo_admin()`: revocar la función cruda a secas habría dejado al
administrador sin sus propias pantallas, porque él también es `authenticated`.

**`es_admin()` mira `auth.uid()`, no el rol de Postgres.** Sigue dando falso
dentro de una función de definidor. Poner el guardián dentro de una función que
usa la venta rompe la venta.

**Un agregado sin `GROUP BY` devuelve una fila aunque no entre ninguna.** Un
`where es_admin()` no alcanza: hace falta `having es_admin()`. Así se le escapaba
una fila a la vendedora en `v_valor_inventario`.

**Los heredoc de Bash se comen las barras invertidas.** Así entró `/^d{4}$/`
donde iba `/^\d{4}$/`: un patrón que busca la palabra "dddd" y jamás coincide con
un PIN. Para editar código con barras invertidas, la herramienta de edición, no
un heredoc.

**Todos los `useMemo` van antes del primer `return` temprano.** Si no, React
lanza el error 310 en producción y no en desarrollo.

**Los ficheros del repo están en CRLF.** Un reemplazo que busque `\n` no
encuentra nada. Trabaja por líneas.

---

## Seguridad

### Bloqueo de costos
RLS filtra filas, no columnas. Por eso:
- Las tablas `modelos` y `lotes` tienen `REVOKE` para `authenticated`.
- La vendedora consulta **solo** `v_catalogo_venta`, que no expone ninguna columna de costo.
- `v_catalogo_admin` filtra internamente con `es_admin()`.

**Nunca hagas que el frontend de la vendedora consulte `modelos` directamente**, ni siquiera "solo para leer el nombre". Si necesitas un campo nuevo del lado de la vendedora, agrégalo a la vista.

### PIN de 4 dígitos
Supabase Auth usa correo + contraseña; se arma un correo sintético (`vendedora@lux.local`) y la contraseña se deriva del PIN.

Sé honesto sobre la limitación en comentarios del código: 4 dígitos son 10.000 combinaciones y el código es público. Por eso:
- **Los administradores usan contraseña larga real**, no PIN.
- El PIN es solo para la vendedora, cuyo alcance máximo es leer el catálogo de venta y registrar ventas.
- Rate limiting de Auth activado en Supabase.

No escribas código que "compense" esto con validaciones en el navegador. No compensan nada.

### Claves
La `anon key` de Supabase es pública por diseño y va en el repo sin problema. La **`service_role` key jamás entra al repo ni al navegador.**

---

## Fotos

Comprimir en el navegador **antes** de subir, sin excepción. El plan gratuito da 1 GB y una foto sin comprimir pesa 3–4 MB.

- Lado mayor a **1200 px**, WebP, calidad ~0,8 → objetivo < 200 KB
- Thumbnail de **300 px** → objetivo < 30 KB
- Rechazar la subida si supera 400 KB, mostrando el peso al usuario
- Usar `browser-image-compression`
- Guardar `foto_path` y `foto_thumb_path`; la cuadrícula de venta carga **siempre el thumb**

---

## Estructura y estilo

```
src/
  lib/          supabase.ts, auth.ts, dinero.ts, fotos.ts
  hooks/        useTasa, useCatalogo, useExistencias
  componentes/  compartidos entre las dos caras
  paginas/
    admin/      lotes, modelos, tasas, reportes
    venta/      cuadricula, cobro, cierre
    publico/    catalogo, armador   (Fase 3)
  estilos/      tokens.css, base.css
```

- **TypeScript estricto.** `strict: true`, sin `any`.
- **Dominio en español, código en inglés.** `precioUsd`, `costoPuesto`, `existencias` — pero `useState`, `handleClick`. Los nombres del negocio deben coincidir con los de la base y con cómo habla el dueño.
- **Tipos generados de Supabase** (`supabase gen types typescript`). No escribas los tipos de las tablas a mano.
- **Toda lógica de dinero vive en `lib/dinero.ts`.** Si un componente calcula un precio con `*` suelto, muévelo a la librería.
- CSS plano con variables de `tokens.css`. Sin Tailwind, sin CSS-in-JS.
- `HashRouter` de React Router — GitHub Pages no reescribe rutas.

---

## Consultas

- Selecciona solo las columnas que uses; nunca `select('*')` en la cuadrícula de venta.
- Paginación desde el inicio: el catálogo llegará a 4.000 piezas.
- Toda operación que toque varias tablas (venta + ítems + descuento de existencia) va en una **función RPC transaccional** en Postgres, no en tres llamadas seguidas desde React. Si falla a la mitad, el inventario queda corrupto.
- Índices ya definidos en `esquema.sql`; añade uno nuevo solo con motivo medido.

---

## Proceso

1. **Una fase a la vez.** Verifica con el checklist de `PLAN.md` antes de continuar.
2. Cada fase queda desplegada y usable en GitHub Pages antes de pasar a la siguiente.
3. Commits en español, imperativos y concretos: `agrega prorrateo de flete por peso`.
4. Prueba en un teléfono real, no solo en el modo responsive del navegador. La usuaria principal trabaja en un Android de gama baja.
5. **Nunca inventes cifras** de precios, kits, descuentos o metas. Todo valor de negocio lo carga el administrador en la aplicación o vive en la tabla `configuracion`.

## Errores que ya se decidieron evitar

- Etiquetar piezas individuales con QR — inviable en joyería, no escala.
- Guardar precios en bolívares por modelo.
- Recalcular costos históricos con la tasa de hoy.
- Cargar flete a los exhibidores dentro del costo de las joyas.
- **Los kits.** Retirados en septiembre de 2026 con sus dos pantallas. Un kit era
  una lista que había que armar y mantener a mano, y solo servía para la
  combinación exacta que alguien hubiera previsto. Los tramos son una regla:
  valen para cualquier carrito, no hay nada que mantener, y la vendedora no
  cambia de pantalla para que la clienta reciba lo que le toca. Ver la regla 11.

  Lo que sobrevivió del razonamiento de los kits, y sigue vigente: el descuento
  se expresa en **porcentaje**, no en precio fijo. Con el precio anclado en
  dólares BCV, un porcentaje se aplica sobre un subtotal que no se mueve al
  cambiar la tasa. Y lo que había que vigilar sigue siendo verdad: un porcentaje
  no conoce el costo. Por eso `registrar_venta` lo corta contra
  `precio_minimo_de` y la pantalla de Tramos avisa del peor margen del catálogo.
- Confiar en validación del navegador para reglas de negocio.
- **Mirar el error de una sola consulta cuando lanzas varias.** El catálogo
  público pedía dos cosas en paralelo y solo comprobaba el error de la primera.
  La segunda —los tramos— llevaba una columna que no existía, devolvía 400, y el
  `?? []` la dejaba en una lista vacía. Resultado: **ninguna clienta al mayor
  recibió su descuento**, durante semanas, y la página se veía perfecta. Si
  lanzas N consultas, miras N errores.
