# Auditoría de las cuentas — plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (el dueño pidió que Claude construya en el chat, sin un agente por tarea). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un informe de cada fórmula de dinero, los errores arreglados, y una sola cuenta "Salió / Entró / Queda" en $ Binance y $ BCV.

**Architecture:** se lee cada fórmula en su última versión (orden de `INSTALACION.md`) y se anota en el informe; cada error se reproduce en PGlite antes de arreglarlo en `esquema-cuentas-del-flujo.sql` (#75). La cuenta del flujo es `flujo_negocio(desde, hasta)`, revocada, que lee `caja_flujo` (no la copia), `lotes`, `inversiones`, `existencias`, `por_llegar` y `falta_bcv_de`; `admin_flujo` la envuelve.

**Tech Stack:** Postgres (Supabase), PGlite 0.3 para probar, Node para `verificar`.

**Spec:** `docs/superpowers/specs/2026-11-24-auditoria-de-cuentas-design.md`

## Global Constraints

- Cada cifra del flujo en `bs`, `binance` y `bcv`, convertida con las tasas **de su día**, nunca las de hoy (salvo lo que es "hoy": la mercancía a la etiqueta y lo que te deben).
- Una cifra, un sitio: `flujo_negocio` llama a `caja_flujo`.
- `flujo_negocio` revocada a `public, anon, authenticated`; `admin_flujo` con `if not es_admin() then raise`, abierta a `authenticated`.
- Nada escribe en producción; ninguna cifra de negocio inventada; el informe sin datos reales.
- Los lotes se anotan **solo en Lotes**: la Caja "Mercancía" y "Transporte" son otros gastos.
- Ficheros en CRLF. Primero el SQL, después el navegador (aquí no hay navegador).

## Review Focus

- Un lote anterior a la primera tasa cargada: su $ BCV usa la tasa más antigua, no da null.
- Un pedido con abonos que no se ha entregado: su dinero está en "Entró" y su pieza en la mercancía; "si se vende todo" no lo cuenta dos veces.
- Una nota de crédito y una venta anulada: no suman en "Entró" (lo garantiza `caja_flujo`; se prueba).
- Un movimiento de Caja anulado o un abono "no llegó": no suma.
- Un lote en camino: su dinero salió, su mercancía va aparte ("en camino"), no en la de la tienda.

---

### Task 1: Banco de pruebas

**Files:**
- Create: `<scratchpad>/pg/` (copia de `.../2680af7e-.../scratchpad/pg`: `node_modules`, `base73`, `instalar.mjs`)
- Create: `<scratchpad>/pg/hacer74.mjs` → `base74` (base73 + `esquema-panel-revendedor.sql`)

- [ ] Copiar la carpeta, crear `base74` y comprobar `select count(*) from pg_proc where proname='rv_vender'` = 1.

### Task 2: El informe — lo que entra

**Files:** Create `docs/auditoria/2026-11-24-cuentas.md`

Por cada fórmula: qué hace (una línea), versión leída (archivo), veredicto (bien / error / se entiende mal / menor) y, si no está bien, ejemplo con cifras inventadas y propuesta.

- [ ] `caja_flujo` (última: `esquema-credito.sql`) y `admin_caja_por_metodo`, `admin_caja_por_dia`, `admin_caja_por_categoria`.
- [ ] `falta_bcv_de`, `saldo_padre_bcv`, `montos_de_abono`, `v_credito`, `deuda_de_clienta`, `deuda_comprobada_de`.
- [ ] Pantallas `Caja.tsx`, `Credito.tsx`: lo que calculan en el navegador.

### Task 3: El informe — lo invertido y la mercancía

- [ ] `v_recuperacion` (última: `esquema-dijes.sql` o posterior), `v_capex_lote`, `v_valor_inventario`, `lotes.flete_mercancia_usd`, el flete por bulto.
- [ ] Pantallas `Inversiones.tsx`, `Inventario.tsx`, `Lotes.tsx`, `LoteEnCamino.tsx`.

### Task 4: El informe — la ganancia y el plan

- [ ] `v_margen_ventas`, `v_ventas_por_dia`, `v_cobertura_mes`, `gastos_fijos_partidas`, `plan_ventas`, `volumen_mensual_estimado`, `volumen_real`, `meta_vendedora`.
- [ ] Pantallas `Reportes.tsx`, `Costos.tsx`; `lib/dinero.ts` entero.

### Task 5: El informe — el precio

- [ ] `costo_bcv_con`, `costo_total_bcv`, `costo_bcv_pieza`, `piso_margen_con`, `piso_margen_de`, `precio_minimo_de`, `admin_sugerir_precio`, `partes_de_linea`, `precio_de_linea`, `tramo_de_carrito`, `rv_precio_lux`, `v_rebajas`, `v_ofertas_mes`.
- [ ] Cerrar el informe: resumen arriba (errores primero), y qué pasa a la fase 9.

### Task 6: #75 — los errores

**Files:**
- Create: `esquema-cuentas-del-flujo.sql` (cabecera como la del #74: por qué, qué hace, debería dar, depende del #74, se puede correr varias veces)
- Test: `<scratchpad>/pg/prueba-75.mjs` (estilo de `prueba-74.mjs`: `dice`, `como`, `falla`, sobre copia de `base74`)

Por cada error del informe que sea de la base:
- [ ] Una comprobación en `prueba-75.mjs` que lo reproduce (falla sin el arreglo).
- [ ] El arreglo en el #75, con la misma firma (las vistas: columnas nuevas al final).
- [ ] Pasa.

### Task 7: #75 — la cuenta del flujo

**Interfaces:**
- Produces: `caja_flujo(date, date)` con una columna más al final, `binance numeric` (bs ÷ `tasa_venta` de la fila; en la venta, `total_usd`). Se borra y se crea (cambia el tipo de retorno); antes, comprobar que ninguna vista depende de ella y que sus tres lectoras nombran columnas.
- Produces: `flujo_negocio(p_desde date default null, p_hasta date default null) returns table (orden int, grupo text, concepto text, bs numeric, binance numeric, bcv numeric)`; null = desde el principio / hasta hoy (Venezuela).
- Produces: `admin_flujo(p_desde date default null, p_hasta date default null)`, misma salida.

Filas (`grupo` · `concepto`):
- `salio` · `mercancia` (costo + `flete_mercancia_usd`), `exhibidores` (+ su flete), `mobiliario` (`inversiones` activas, en su `moneda`), `caja:<categoria>` (salidas de `caja_flujo` con origen `anotado`). El día de un lote: `least(fecha_llegada, creado_en en Venezuela)`; su Bs = $ × `tasa_binance_compra`; su $ BCV = Bs ÷ `tasa_bcv` de la tasa más reciente con `fecha <=` ese día (sin ninguna, la más antigua).
- `entro` · `ventas`, `abonos`, `caja:<categoria>` (entradas anotadas).
- `nota` · `entro_sin_comprobar` (lo de `entro` con `por_verificar`; no suma).
- `queda` · `dinero` (entró − salió), `mercancia_costo` (existencia × costo puesto, a las tasas de su lote), `mercancia_en_camino` (`por_llegar` sin liberar, igual), `mercancia_etiqueta` (existencia × etiqueta de hoy), `abonado_sin_entregar` (en negativo: abonos vivos de pedidos y apartados abiertos), `te_deben` (`falta_bcv_de` de las ventas por partes abiertas), `si_se_vende` (dinero + mercancía a la etiqueta + abonado_sin_entregar + te_deben).

- [ ] Comprobaciones en `prueba-75.mjs` con un escenario de cifras redondas (tasa 100 BCV / 120 Binance; lote de $100 + $20 flete a 120; una venta de $20 BCV; un pedido con 40 % abonado; un gasto de Caja; una venta anulada; una nota de crédito; un abono anulado; un lote en camino; un lote anterior a toda tasa) con el valor exacto de cada fila.
- [ ] La vendedora y `anon` no ejecutan `flujo_negocio` ni sacan filas de `admin_flujo`.
- [ ] Implementar; correr el #75 dos veces; pasa todo, también `prueba-74.mjs` contra la base con el #75.

### Task 8: Verificar, documentos y entrega

**Files:** Modify `scripts/verificar.mjs`, `CLAUDE.md`, `INSTALACION.md`, `docs/fases/2026-11-revendedores/README.md`, `src/paginas/Verificacion.tsx` si lista funciones revocadas.

- [ ] `verificar`: `flujo_negocio` rechazada a la vendedora; `admin_flujo` lanza error a la vendedora.
- [ ] CLAUDE.md: `flujo_negocio`/`admin_flujo` junto a `caja_flujo`, la regla "la cuenta del flujo" y la trampa que salga de la auditoría; INSTALACION.md fila #75; README estado de la fase 8 y "próximo SQL libre #76".
- [ ] `npm run pruebas` y `npm run build` pasan.
- [ ] Commit en la rama `fase-8-auditoria`; el dueño corre el #75 y después `npm run verificar`.
