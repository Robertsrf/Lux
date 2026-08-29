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

### 3. Tres tasas, tres trabajos — no las confundas

| Tasa | Vive en | Se usa para | ¿Cambia? |
|---|---|---|---|
| `tasa_binance_compra` | Cada **lote** | Costo real del lote | **Nunca.** Es historia. |
| `tasa_venta` | Registro maestro vigente | Convertir USD → Bs al cobrar | Sí, la fija el admin |
| `tasa_bcv` | Registro maestro vigente | Mostrar referencia en $ | Sí, la fija el admin |

**Nunca recalcules el costo de un lote viejo con una tasa nueva.** Si aparece código que hace eso, es un bug grave: borra la historia real de la inversión.

### 4. Congela al momento del hecho
Al registrar una venta, guarda en el registro: `tasa_venta_usada`, `tasa_bcv_usada`, `precio_unitario_usd`, `precio_unitario_bs` y `costo_puesto_usd_snap`.

Motivo: el margen histórico debe seguir siendo exacto aunque la tasa cambie mañana. Si el reporte de ganancia de enero cambia porque hoy movieron la tasa, el sistema está mintiendo.

### 5. El margen siempre se mide en dólares
```
ganancia_usd = (total_bs / tasa_venta_usada) − Σ(costo_puesto_usd_snap × cantidad)
```
Nunca reportes ganancia en bolívares como cifra principal. La inflación la vuelve ilegible en semanas.

### 6. Costo puesto, no costo pelado
El costo de una pieza es `costo_unitario_usd + flete_unitario_usd`. Es columna generada en la base; **no la calcules a mano en el frontend**.

### 7. Los exhibidores no son inventario
Su costo y su parte del flete van a CAPEX de tienda (`v_capex_lote`), **jamás al costo de las joyas**. Si aparece código que reparte flete entre todo por igual, está mal.

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
