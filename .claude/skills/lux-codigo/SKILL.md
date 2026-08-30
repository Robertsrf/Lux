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
- ~~Definir el precio de kit como porcentaje de descuento sobre el detal.~~
  **Revertido en agosto de 2026.** La objeción original era que "al mover la tasa el
  descuento se descuadra solo", y era cierta mientras el precio se anclaba en dólares
  reales y se convertía con la tasa de venta. Con el precio anclado en **dólares BCV**
  el porcentaje se aplica sobre un subtotal que no se mueve al cambiar la tasa, así que
  el descuadre ya no existe. Kits y tramos usan **porcentaje de descuento**.

  Lo que sí hay que vigilar: un porcentaje no conoce el costo. Un descuento grande sobre
  una pieza de margen fino la deja por debajo del costo y la base no lo impide. La
  pantalla de Tramos calcula el peor margen del catálogo y avisa.
- Confiar en validación del navegador para reglas de negocio.
