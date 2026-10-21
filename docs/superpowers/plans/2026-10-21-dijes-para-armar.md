# Dijes y bases para armar — plan de construcción

> **Para quien lo ejecute:** se ejecuta en esta sesión (Native, superpowers:executing-plans) y al final un revisor independiente revisa toda la rama. Pasos con casillas (`- [ ]`).

**Objetivo:** que un dije cueste su mercancía con el margen (sin lo de tienda), que base + dije cueste lo que una pieza con los dos costos sumados, y que las cuentas de piezas, empaque, tramo y meta no se descuadren.

**Arquitectura:** una migración `esquema-dijes.sql` (#60) con tres piezas centrales: la marca `modelos.armado` y la escalera `grupos_precio.escalera`; `tramo_de_carrito(items)`, la única regla de qué línea recibe el tramo (la usan las cuatro funciones que cobran o cotizan); y un disparador en `venta_items` que congela `es_dije` y pone lo de tienda en cero. Las funciones largas que cambian se copian de su versión vigente con parches pequeños y comprobados (un generador en el scratchpad asegura que cada parche cae exactamente una vez). El navegador repite la regla del tramo en `lib/dinero.ts`.

**Tecnologías:** Postgres (Supabase) + PGlite para probar, React 19 + TypeScript estricto.

**Diseño:** `docs/superpowers/specs/2026-10-21-dijes-para-armar-design.md`

## Restricciones generales

- Primero el SQL, después el navegador; ninguna firma que el navegador llama pierde un parámetro (lo nuevo al final, con valor por omisión; la firma vieja se suelta antes de crear la nueva).
- `create or replace view`: columnas nuevas solo al final.
- Toda función nueva: `revoke` explícito (Supabase otorga EXECUTE por omisión).
- Ninguna cifra de negocio sembrada: la escalera de dijes la carga el dueño.
- Archivos del repo en CRLF.
- Cifras escritas: `type="text"` + `leerCifra`. Texto a 4,5:1, `lux-ui`.

## Lo que más puede morder (y su prueba)

1. **Un carrito con dijes da un total distinto en la barra del catálogo, en el mostrador y en la base.** Prueba: mismo carrito mixto en `cotizar_pedido`, `crear_reserva`, `registrar_venta` y en `descuentosDeCarrito` (TS) da los mismos precios por línea.
2. **El volumen del mes cambia al vender dijes** (abarataría todo el catálogo). Prueba: vender dijes no mueve `v_volumen.piezas_vendidas` ni las piezas de `plan_ventas`.
3. **El navegador viejo deja de guardar productos o de sugerir precios.** Prueba: `admin_guardar_modelo` con 16 parámetros y `admin_sugerir_precio` con 3 siguen funcionando.
4. **El catálogo público cae** porque una vista nueva evalúa un piso. Prueba: `v_disponible_publico` abre sin sesión y trae `armado`.
5. **Sin escalera de dijes cargada**, un dije queda sin precio o con un grupo de piezas. Prueba: `admin_sugerir_precio(..., true)` sin escalera devuelve `grupo_id` nulo y el formulario lo dice.

---

### Tarea 1: la migración #60 y sus pruebas en PGlite

**Archivos:** crear `esquema-dijes.sql` (generado por `scratchpad/generar-60.mjs`); prueba `scratchpad/prueba-60.mjs`.

**Produce:**
- `modelos.armado text` (`null` | `'dije'` | `'base'`), `grupos_precio.escalera text not null default 'pieza'` (`'pieza'` | `'dije'`), `venta_items.es_dije boolean not null default false`, `reserva_items.va_en_modelo_id bigint`.
- `costo_bcv_pieza(p_costo_puesto_usd numeric, p_es_dije boolean) returns numeric` (cerrada).
- `tramo_de_carrito(p_items jsonb) returns jsonb` → `{"piezas": int, "descuento_pct": numeric, "por_modelo": {"<id>": numeric}}` (cerrada).
- `admin_sugerir_precio(p_lote_id, p_costo_usd, p_margen_pct, p_es_dije boolean default false)`, que devuelve también `escalera`.
- `admin_guardar_modelo(..., p_variantes jsonb, p_armado text default null)`: `null` = como estaba; `'pieza'` | `'dije'` | `'base'`.
- Columna `armado` al final de `v_catalogo_base`, `v_catalogo_admin`, `v_catalogo_venta`, `v_venta_ubicacion` y `v_disponible_publico`.
- Vista `v_pedido_armado (reserva_id, modelo_id, va_en_modelo_id)` para el personal.
- `crear_reserva` acepta `va_en` (modelo de la base) en cada línea de dije.

- [ ] Escribir `prueba-60.mjs` con los casos A–J (precio del dije, tramo con y sin base, foto de la línea, volumen, meta, Mi día, navegador viejo, catálogo público, reacomodar, unión del pedido, nota de crédito) y correrla contra la instalación sin el #60: falla.
- [ ] Escribir el generador y producir `esquema-dijes.sql`.
- [ ] Correr la prueba con el #60: todo `ok`. Correr también la prueba del #59 encima del #60, para ver que no se rompió nada.

### Tarea 2: la regla del tramo en el navegador

**Archivos:** `src/lib/dinero.ts`, `src/lib/tipos.ts`.

**Produce:** `descuentosDeCarrito(tramos, lineas: {modelo_id, cantidad, armado}[]) → { piezas, descuento, porModelo: Map<number, number | null> }`, con la misma cuenta que `tramo_de_carrito`. `armado?: 'dije' | 'base' | null` en los tipos de las vistas.

- [ ] Prueba con Node (bundle del scratchpad): los mismos carritos de la Tarea 1 dan los mismos descuentos por modelo.

### Tarea 3: el mostrador

**Archivos:** `src/hooks/useCarrito.ts`, `src/paginas/venta/Mostrador.tsx`.

- [ ] El carrito usa `descuentosDeCarrito`: el tramo por línea, el regateo solo en las líneas sin tramo, "te faltan N piezas" sin dijes y el apartado igual.
- [ ] La tarjeta de un dije y la de una base lo dicen.

### Tarea 4: administración

**Archivos:** `src/paginas/admin/FormularioModelo.tsx`, `src/paginas/admin/Grupos.tsx`, `src/hooks/useCatalogos.ts`, `src/paginas/admin/Inventario.tsx`.

- [ ] Formulario: "Tipo de pieza" (normal, base para armar, dije); `admin_sugerir_precio` con `p_es_dije`; los grupos de la lista son los de su escalera; sin escalera de dijes lo avisa; manda `p_armado`.
- [ ] Grupos: las dos escaleras por separado, y "Agregar" en cada una.
- [ ] Inventario: el dije y la base se distinguen.

### Tarea 5: el catálogo de la tienda y Pedidos

**Archivos:** `src/paginas/publico/Catalogo.tsx` (y su detalle), `src/paginas/venta/Pedidos.tsx`.

- [ ] La cuenta local de piezas para el tramo, sin dijes (la barra sigue diciendo el total de `cotizar_pedido`).
- [ ] En el detalle de una base: "Agrégale un dije", la lista de dijes con foto y precio; al elegir, entran las dos y la línea del dije lleva `va_en`.
- [ ] Pedidos: "Va en: <la base>" en la línea del dije (`v_pedido_armado`).

### Tarea 6: el catálogo del revendedor y la vitrina

**Archivos:** `src/paginas/revendedor/CatalogoRevendedor.tsx`, `src/paginas/Vitrina.tsx`.

- [ ] Revendedor: "Agrégale un dije" en el detalle de una base (sin unión guardada).
- [ ] Vitrina: un dije no es pieza estelar, ni de "tres para combinar", ni de la colección.

### Tarea 7: vigilancia, documentos y entrega

**Archivos:** `scripts/verificar.mjs`, `CLAUDE.md`, `INSTALACION.md`, `PRODUCT.md`.

- [ ] `verificar`: `tramo_de_carrito` y `costo_bcv_pieza` cerradas a las dos sesiones y sin sesión; `v_pedido_armado` cerrada sin sesión; `v_disponible_publico` sin claves de costo.
- [ ] Documentos: la regla nueva, las funciones, la tabla de INSTALACION (#60), el árbol de `src/`.
- [ ] `npm run build` limpio.
- [ ] Revisión de toda la rama (agente revisor) y de seguridad; corregir lo que encuentren.
- [ ] Commit; el dueño corre el #60 en Supabase; después, push.
