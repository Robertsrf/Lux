# Fase 3 — Descuento de revendedores y clienta con descuento fijo · Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (el dueño pidió construir en la sesión, sin un agente por tarea). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revendedores al 20 % (tope = el general) y clientas con un descuento fijo que el mostrador cobra en venta y apartado.

**Architecture:** Un `.sql` (#70) que cambia la configuración, pone el tope, enlaza revendedor↔clienta y hace que `registrar_venta` y `apartar_en_tienda` pasen a `partes_de_linea` el mayor entre el tramo de la línea y el % de la clienta, con motivo `cliente`. El carrito repite la misma cuenta con `precioConTramo`.

**Tech Stack:** Postgres (Supabase), PGlite para probar, React 19 + TS estricto.

**Spec:** `docs/superpowers/specs/2026-11-23-descuento-y-clienta-especial-design.md`

## Global Constraints

- Ninguna cifra de negocio en el código: el 20 sale de `configuracion.revendedor_descuento_pct`; el tope del propio es el general.
- Mismas firmas de `registrar_venta`, `apartar_en_tienda`, `admin_fusionar_clientes`, `rv_descuento_de`.
- El navegador funciona sin el #70 (lee `descuento_pct` aparte y, si falla, null).
- Ninguna respuesta nueva a la vendedora o al revendedor trae el piso.
- Ficheros en CRLF.

## Review Focus

- Clienta con descuento + tramo mayor → manda el tramo, motivo `tramo` (prueba en PGlite).
- Clienta con descuento + código de mayor % → manda el código, `motivo_sin_oferta` = `cliente` (PGlite).
- Ficha nueva escrita con la cédula de la clienta → sin descuento, igual que el carrito (PGlite).
- Pieza cuyo piso no deja el 20 % → cobra el piso, nunca menos (PGlite).
- Correr el `.sql` dos veces no baja nada más ni falla (PGlite).

---

### Task 1: SQL #70 `esquema-descuento-clienta.sql`, probado en PGlite

**Files:** Create `esquema-descuento-clienta.sql`; prueba desechable en el scratchpad.

**Produces:**
- `clientes.descuento_pct numeric(5,2)` (null, o >0 y <100).
- `revendedores.cliente_id bigint references clientes(id)`, índice único parcial.
- `descuento_de_clienta(p_cliente_id bigint) returns numeric` (0 sin descuento; revocada a todos).
- `admin_descuento_cliente(p_cliente_id bigint, p_pct numeric) returns void` (authenticated; `es_admin()` dentro).
- `admin_enlazar_cliente_revendedor(p_revendedor_id bigint, p_cliente_id bigint) returns void` (ídem; null suelta).
- `rv_descuento_de` = `least(coalesce(propio, general), general)`.
- Disparador `revendedor_descuento_tope` (before insert or update of descuento_pct).
- `v_clientes` + `descuento_pct`, `es_revendedor` al final; `v_revendedores` + `cliente_id`, `cliente_nombre` al final.
- `registrar_venta`, `apartar_en_tienda` con el % de clienta (solo si `p_cliente_id` no es null); motivo `cliente` cuando el % de clienta > tramo de la línea.
- Checks `motivo_rebaja`/`motivo_sin_oferta` con `'cliente'`.
- `admin_fusionar_clientes` mueve el enlace y el descuento.

- [ ] Step 1: Harness PGlite con la instalación entera en el orden de INSTALACION.md (stubs de `auth`, roles, `storage` si hace falta).
- [ ] Step 2: Pruebas (fallan antes del #70): general 20; propio 25 → null; guardar propio 25 rechaza; venta a clienta 20 % sin tramo = `lista*0.8` con motivo `cliente`; con tramo 15 % sigue 20 % (`cliente`); clienta 5 % con tramo 10 → `tramo`; pieza de piso alto → piso; ficha nueva con la cédula → sin descuento; apartado en tienda con el descuento; vendedora (es_admin falso) no puede `admin_descuento_cliente`; correr dos veces.
- [ ] Step 3: Escribir el `.sql`; correr pruebas → todas bien.
- [ ] Step 4: Fila 70 en INSTALACION.md; commit.

### Task 2: Carrito y Mostrador

**Files:** `src/hooks/useCarrito.ts`, `src/paginas/venta/Mostrador.tsx`, `src/lib/tipos.ts`.

**Consumes:** `v_clientes.descuento_pct`.

- [ ] `useCarrito(tasa, descuentoClientaPct: number | null = null)`: por línea, `pct = max(tramo, clienta)`; `motivo: 'cliente'` si gana la clienta y queda rebajada; `en_tramo` true con cualquiera de los dos; `por_clienta: boolean`; `piezasParaLaBase` no manda precio a mano con descuento de clienta. `LineaCobro.motivo` gana `'cliente'`.
- [ ] Mostrador: al elegir ficha con id, leer `v_clientes.descuento_pct` (error → null); aviso "Clienta con N % de descuento" bajo la clienta y en el encabezado; pista de línea "descuento de clienta".
- [ ] `npm run build` → OK. Commit.

### Task 3: Ficha de clienta, Revendedores y Reportes

**Files:** `src/paginas/Clientes.tsx`, `src/hooks/useClientes.ts` (si hace falta), `src/paginas/admin/Revendedores.tsx`, `src/paginas/admin/Reportes.tsx`, `src/lib/tipos.ts`.

- [ ] Ficha: el admin pone/quita el % (`admin_descuento_cliente`, con `leerCifra`); la vendedora lo lee; "Es la revendedora X".
- [ ] Revendedores: el propio no pasa del general (aviso antes de guardar); enlazar/soltar su ficha (búsqueda con `useBuscarClientes`).
- [ ] Reportes: `cliente: 'Clienta con descuento'` en `MOTIVO` y el desglose.
- [ ] `npm run build`, `npm run pruebas` → OK. Commit.

### Task 4: Verificar, revisión de seguridad y documentos

- [ ] `scripts/verificar.mjs`: vendedora no puede `admin_descuento_cliente` ni `admin_enlazar_cliente_revendedor`; sin sesión `v_clientes` vacía/denegada.
- [ ] Revisión del SQL (funciones nuevas abiertas a authenticated).
- [ ] CLAUDE.md (reglas, tablas, funciones), README de la fase (estado), PRODUCT.md si dice 25 %. Commit.
