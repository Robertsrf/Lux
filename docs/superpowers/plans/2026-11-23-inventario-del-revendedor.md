# El inventario propio del revendedor — plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (el dueño pidió construir en el chat, sin agente por tarea). Steps use checkbox (`- [ ]`) syntax.

**Goal:** que lo que un revendedor le compra a Lux para su inventario salga en su catálogo con sus unidades, se venda a sus clientas sin pasar por Lux y se corrija desde su panel.

**Architecture:** su inventario se calcula (ventas `inventario_de` + `revendedor_ajustes` − líneas de lo suyo en pedidos cerrados), nunca se guarda como número. Un pedido de su clienta parte cada pieza en una línea de lo suyo (`de_su_inventario`, `precio_lux_usd = 0`) y otra de la tienda. Un solo SQL, #72.

**Tech Stack:** Postgres (Supabase), PGlite para probar, Vite + React 19 + TS estricto.

**Spec:** `docs/superpowers/specs/2026-11-23-inventario-del-revendedor-design.md`

## Global Constraints

- SQL #72 `esquema-inventario-revendedor.sql`, depende del #71, se puede correr varias veces.
- Ninguna firma que el navegador ya llama pierde un parámetro; si cambia lo que devuelve una función, `drop` + `create` dentro de `begin; … commit;` y se vuelven a dar los permisos.
- El revendedor sin sesión de Supabase: todo lo suyo por `rv_*` con `rv_de_sesion(p_sesion)` primero.
- Nada de costo, piso ni lo que paga a Lux en lo que devuelve su catálogo.
- La venta "para su inventario" NO lleva `ventas.revendedor_id` (cuenta para la meta, decisión del dueño).
- Él corrige su inventario en las dos direcciones, con motivo obligatorio; nunca por debajo de lo apartado ni de cero.
- Devolver / anular / quitar de una venta para su inventario: solo si él lo tiene LIBRE.
- Ficheros en CRLF; TS sin `any`; textos 4,5:1; `leerCifra` para cifras escritas.

## Review Focus

1. Pedido de una pieza con 1 suya y 2 de la tienda pidiendo 3: dos líneas; Lux cobra solo 2; `apartadas_de` aparta solo 2.
2. Dos pedidos sin sesión a la vez por la última suya: el segundo dice cuántas quedan (candado de su fila).
3. Un pedido de solo lo suyo confirmado: queda `retirado` y entregado, no aparece en Pedidos de la tienda, y lo suyo baja.
4. Pieza retirada por la tienda (`activo = false`) que él tiene: sale en su catálogo y se puede pedir.
5. Devolver con la nota de crédito una pieza que él ya vendió: error claro, nada cambia.

---

### Task 1: SQL — el inventario, la venta para su inventario y los guardias

**Files:** Create `esquema-inventario-revendedor.sql` (§1–§4). Test: `<scratchpad>/pg/prueba-72.mjs` (copia de `base71`).

**Interfaces — Produces:**
- `ventas.inventario_de bigint references revendedores(id)`; disparador `venta_inventario_de_valida` (before insert/update of inventario_de, cliente_id): exige `revendedores.cliente_id = new.cliente_id`.
- `revendedor_ajustes(id, revendedor_id, modelo_id, cantidad int <> 0, motivo text not null, quien text in ('revendedor','tienda'), perfil_id uuid, creado_en)`; revocada; `historico_no_se_borra`.
- `apartado_items.de_su_inventario boolean not null default false` + check `not de_su_inventario or precio_lux_usd = 0` (lo usa la Task 2).
- `rv_inventario(p_revendedor_id bigint) returns table (modelo_id bigint, compradas int, ajustes int, vendidas int, apartadas int, tiene int, libre int)` — revocada a todos.
- `vender_para_inventario(p_tipo text, p_metodo text, p_items jsonb, p_cliente_id bigint, p_por_verificar boolean default false, p_pago_referencia text default null, p_extra_bs numeric default null, p_extra_nota text default null, p_codigos text[] default null) returns bigint` — authenticated.
- `vender_a_credito(..., p_para_inventario boolean default false)` — una sola firma (10 args).
- Guardias: `ventas` before update of anulada; `venta_items` before update of cantidad (baja); `venta_items` before insert con `devuelve_item_id` → exigen `libre >= piezas que salen` de su inventario.
- `v_inventario_revendedores` (revendedor_id, revendedor, modelo_id, sku, nombre, variante, foto_thumb_path, tiene, apartadas, libre) con `es_admin()`.

- [ ] Step 1: prueba-72 §1: correr #72 dos veces; venta para inventario de 3 A a JADU (revendedor enlazado) → `rv_inventario` tiene 3; a crédito con `p_para_inventario` 2 C → tiene 2; para ANA (no revendedor) → error "revendedor"; vendedora no puede `update ventas set inventario_de`; anular (admin) la de A → tiene 0; nota de crédito de 1 C (admin_devolver_pieza) → tiene 1; `v_inventario_revendedores` vacía para la vendedora. Ventas para inventario sin `revendedor_id` y `meta_vendedora` las cuenta.
- [ ] Step 2: correr → FALLA (función no existe).
- [ ] Step 3: escribir §1–§4.
- [ ] Step 4: correr → pasa; prueba-71 sigue pasando sobre base71+#72 (no se rompe el crédito).
- [ ] Step 5: commit `fase 5: el inventario del revendedor en la base (#72, §1–4)`.

### Task 2: SQL — el pedido de su clienta toma de lo suyo

**Files:** `esquema-inventario-revendedor.sql` §5. Test: prueba-72 §2.

**Interfaces — Consumes:** `rv_inventario`, `apartado_items.de_su_inventario`. **Produces:** `rv_crear_apartado` (misma firma) parte líneas; `rv_confirmar_de` cierra un pedido sin nada de la tienda (`estado='retirado'`, `retirado_en`, `entregado_en = now()`, sin venta); `apartadas_de`, `aprobar_apartado`, `v_apartados_revendedor`, `rv_resumen` (ganancia sin lo suyo), `rv_apartados` (cada item con `de_su_inventario`).

- [ ] Step 1: prueba §2: con 1 A suya, pedido de 3 A → líneas (1 suya, precio_lux 0) y (2 tienda); `apartadas_de(A)` sube 2; libre suyo 0; Lux falta = 2 × lux. Pedido sin sesión de 1 A más con la tienda en 0 de A y él en 0 → error "quedan 0". Pedido de solo lo suyo + `rv_vender` con pago completo → `rv_fase_de` 'entregado', `tiene` baja, no sale en `v_apartados_revendedor`. Pedido mixto aprobado → la venta de Lux lleva solo 2 A. Pedido que vence → lo suyo vuelve a libre. Pieza `activo=false` que él tiene → se puede pedir de lo suyo; pedir de la tienda falla.
- [ ] Step 2: FALLA. Step 3: escribir §5. Step 4: pasa. Step 5: commit.

### Task 3: SQL — su catálogo, su panel y el respaldo

**Files:** `esquema-inventario-revendedor.sql` §6–§7. Test: prueba-72 §3.

**Produces:** `rv_catalogo_publico(text)` mismas columnas, suma lo suyo (incluye piezas solo suyas, con su precio); `rv_piezas(text)` + `mias int` al final, `disponible` = tienda + suyo; `rv_fijar_precios` acepta piezas suyas; `rv_mi_inventario(p_sesion text) returns jsonb` (array: modelo_id, sku, nombre, variante, foto_thumb_path, tiene, apartadas, libre, precio_usd, movimientos[últimos 10: fecha, cantidad, motivo, de]); `rv_ajustar_inventario(p_sesion text, p_modelo_id bigint, p_cantidad int, p_motivo text) returns jsonb` (tiene, libre); `admin_respaldo` con `revendedor_ajustes`.

- [ ] Step 1: prueba §3: catálogo con pieza solo suya (tienda 0) → sale con `disponible` = suya; columnas iguales a las del #68; `rv_piezas` `mias`; ajuste +2 "me las regaló" → tiene +2; −5 con 3 → error; motivo vacío → error; sesión de otro revendedor no ve ni ajusta lo del primero; sin sesión `rv_ajustar_inventario('x',…)` → 28000.
- [ ] Step 2: FALLA. Step 3: escribir §6–§7. Step 4: pasa. Step 5: commit.

### Task 4: verificar

**Files:** `scripts/verificar*` (donde viven las comprobaciones). Añadir: `revendedor_ajustes` revocada a anon y authenticated; `rv_inventario` no ejecutable por nadie; `rv_catalogo_publico` sin columnas nuevas; `v_inventario_revendedores` vacía para la vendedora; `vender_para_inventario` no ejecutable por anon. Commit.

### Task 5: Mostrador — "Para su inventario"

**Files:** `src/hooks/useCarrito.ts` (`cobrar` y `venderACredito` reciben `paraInventario?: boolean`; con true, `cobrar` llama `vender_para_inventario` con los mismos argumentos), el cobro en `src/paginas/venta/Mostrador.tsx` (casilla marcada por defecto si la ficha elegida tiene `es_revendedor`; dice "Sale en su catálogo"). Sin el #72 (error de función inexistente) no se ofrece. `npm run build` pasa. Commit.

### Task 6: Panel — Mi inventario

**Files:** Create `src/paginas/revendedor/panel/InventarioRv.tsx`; modify `Panel.tsx` (ruta y menú "Mi inventario"), `ApartadosRv.tsx` (línea "De tu inventario", no suma a Lux), `src/lib/revendedor.ts` (tipos). Corregir: más/menos y motivo obligatorio. Build pasa. Commit.

### Task 7: Administrador — lo que tiene cada uno

**Files:** `src/paginas/admin/Revendedores.tsx` ("En su inventario: N piezas", lista al abrir), `src/paginas/admin/Credito.tsx` (línea para la clienta que es revendedor). Lee `v_inventario_revendedores`; sin el #72, nada. Build. Commit.

### Task 8: Documentos, pruebas y revisión

CLAUDE.md (tablas, funciones, reglas "Los revendedores", árbol de src), INSTALACION.md (#72), la guía (`GuiaRevendedorPiezas`), README de las fases (estado), cabecera del #72 con cifras esperadas. `npm run pruebas`, `npm run build`. Revisión de seguridad con `backend-api-security:backend-api-security-backend-security-coder` de `rv_crear_apartado`, `rv_catalogo_publico`, `rv_mi_inventario`, `rv_ajustar_inventario`. Revisión simple propia del diff. Commit.
