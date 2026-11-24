# Auditoría de las cuentas — diseño (fase 8)

Pedido del dueño del 24/11/2026: "quiero que revises todos los cálculos,
encuentres forma de entender lo que entra, las inversiones, la mercancía, lo
que hay si se vende". Y después: "quiero entender cuánto se ha gastado y con
lo que se ha vendido cuánto queda; es como un flujo de sale y entra. Se ha
gastado también en mercancía, en los envíos, etc."

## Por qué

Dos cosas a la vez (el dueño eligió "todo lo anterior"): que las cifras
estén bien y que se entiendan. Hoy cada pantalla contesta una parte con su
propia unidad: Caja (lo que entra y sale, sin los lotes), Inversiones (lo
invertido y lo recuperado, en $ BCV a la brecha de hoy), Reportes (lo que
dejaron las ventas), Costos (el plan). Ninguna contesta "salió tanto, entró
tanto, queda tanto".

## Qué entrega

1. **Un informe** (`docs/auditoria/2026-11-24-cuentas.md`): cada fórmula de
   dinero revisada, con lo que hace, si está bien, y cada hallazgo con su
   gravedad (error / se entiende mal / menor), un ejemplo con cifras y la
   propuesta. Sin datos reales de la tienda (el repositorio es público).
2. **Los errores que salgan, arreglados** en un SQL (#75), probado en PGlite
   con la instalación entera. Lo que sea de presentación pasa a la fase 9.
3. **Una sola cuenta del flujo** en la base: `flujo_negocio(desde, hasta)`,
   revocada a todos, con su envoltura `admin_flujo(desde, hasta)` que
   rechaza a quien no sea administrador. La pantalla se hace en la fase 9.

## La cuenta del flujo

Cada cifra **en $ Binance y en $ BCV, una al lado de la otra** (decisión del
dueño), y en bolívares. Cada movimiento se convierte con las tasas **de su
día**, nunca con las de hoy (ver Trampas: "Dos tasas en una resta").

- **Salió**
  - Mercancía y su flete (de `lotes`; nacen en $ Binance; a BCV con la
    brecha del día del lote).
  - Exhibidores y su flete (de `lotes`).
  - Muebles e inversiones del local (de `inversiones`, en su moneda).
  - Gastos anotados en la Caja, por categoría (de `caja_movimientos`, sin
    anulados), y las devoluciones.
- **Entró**
  - Lo cobrado: ventas completas por su total, por partes abono por abono
    (la regla de `caja_flujo`, no una copia), y lo que entró a la Caja sin
    ser venta (aportes).
- **Queda**
  - En dinero: entró − salió.
  - En mercancía: lo que hay en la tienda a lo que costó ($ Binance, y a
    BCV) y a la etiqueta (Bs y $ BCV de hoy; $ Binance a la tasa de hoy).
  - Lo que te deben: ventas por partes y a crédito abiertas
    (`falta_bcv_de`).
  - **Si se vende todo**: dinero + mercancía a la etiqueta + lo que te deben.

El dueño anota los lotes **solo en Lotes** (24/11/2026): las categorías
"Mercancía" y "Transporte" de la Caja son otros gastos y se suman aparte.
Si un día anota un lote también en la Caja, saldría dos veces: el informe lo
dice y la fase 9 lo avisa en pantalla.

## Qué se audita

Primero lo que contesta la pregunta del dueño: `caja_flujo` y sus
envolturas, `v_recuperacion`, `v_capex_lote`, `v_valor_inventario`,
`v_margen_ventas`, `v_ventas_por_dia`, `v_cobertura_mes`,
`gastos_fijos_partidas`, `plan_ventas`, `volumen_mensual_estimado`,
`falta_bcv_de` y `v_credito`; y las pantallas Caja, Inversiones, Reportes,
Costos e Inventario (lo que calculan en el navegador, `lib/dinero.ts`).
Después, el precio: `costo_bcv_con`, `piso_margen_con`, `precio_minimo_de`,
`admin_sugerir_precio`, `partes_de_linea`, `tramo_de_carrito`,
`rv_precio_lux`, `v_ofertas_mes`, `v_rebajas`. Cada fórmula, en su última
versión según el orden de `INSTALACION.md`.

## Enfoques considerados

- **Solo el informe**: no toca nada; todo lo construido a la fase 9. Más
  rápido, pero la fase 9 diseñaría pantallas sobre una cuenta que no existe.
- **Informe + la cuenta del flujo** (elegido por el dueño): la cifra queda
  bien hecha y en un solo sitio antes de dibujarla.
- **Informe + cuenta + pantalla**: una pantalla que se rehace en la fase 9.

## Restricciones

- Se audita leyendo el código: el dueño no quiso auditar con un respaldo de
  la base. Las pruebas, con datos inventados en PGlite.
- Nada escribe en producción. Ninguna cifra de negocio se inventa.
- Una cifra, un sitio: la cuenta del flujo llama a `caja_flujo`, no la copia.
- `npm run verificar` gana la comprobación de que `flujo_negocio` está
  revocada y `admin_flujo` no da nada a la vendedora.

## Lo que queda a quien construye

El nombre exacto de las columnas, de qué fecha sale el "día" de un lote
(compra o llegada; se mira en `lotes`), y cómo se reparte el informe.
