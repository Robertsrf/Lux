# Cobro: crédito al momento y rebaja en % — plan

> **Para quien lo ejecuta:** superpowers:executing-plans, en la sesión (preferencia del dueño). Pasos con `- [ ]`.

**Objetivo:** dar crédito en el cobro del Mostrador sin pasar por la ficha, y rebajar en % por pieza o a toda la venta.

**Arquitectura:** `vender_a_credito` gana `p_dias` al final (#77); el cobro lo manda y, con clienta nueva, la guarda antes con `guardar_cliente`. La rebaja en % es de la pantalla: `lib/dinero.ts` pasa el % a precio en $ BCV sin bajar del mínimo y el carrito lo guarda como el precio a mano de siempre.

**Stack:** Postgres (Supabase), PGlite para probar (fuera del repo), React 19 + TS estricto, `node --test`.

**Diseño:** `docs/superpowers/specs/2026-11-26-cobro-credito-y-rebaja-pct-design.md`

## Restricciones

- Primero el SQL: el navegador viejo manda 10 argumentos y sigue entrando (una sola firma, `p_dias` al final con `default null`).
- Ninguna cifra inventada: sin máximo de días (decisión del dueño), el tope es el de la ficha.
- Toda cuenta de dinero en `lib/dinero.ts`; cifras escritas con `leerCifra`, campos `type="text"` + `inputMode`.
- Ficheros en CRLF.

## A vigilar

1. `p_dias` 0, negativo o vacío: error claro, no vende.
2. Clienta nueva con cédula que ya existe: `guardar_cliente` lo dice y no se vende.
3. Guardar la clienta y que la venta falle: la ficha queda (es una ficha válida); el reintento usa el id ya guardado, no crea otra.
4. % mayor que la rebaja máxima: la pieza en su mínimo y lo dice; % ≥ 100 o ilegible: no cambia nada.
5. Pieza con tramo, código o descuento de clienta: el % global no la toca.

---

### Tarea 1: `vender_a_credito(..., p_dias)` (#77)

**Archivos:** crear `esquema-credito-al-cobrar.sql`; `INSTALACION.md` (fila 77); CLAUDE.md ("El crédito" y la firma).

- [ ] Prueba en PGlite (base #1–#76): con `p_dias = 5` y ficha SIN crédito vende y vence hoy+5; con ficha de 10 días y `p_dias = 3` vence hoy+3 y la ficha sigue en 10; sin `p_dias` y ficha sin crédito, el error de siempre; `p_dias = 0` → error; con tope y `p_dias`, pasar el tope → error; la vendedora puede; una sola `vender_a_credito`; la llamada de 10 argumentos sigue sirviendo.
- [ ] Correrla sin el #77: falla.
- [ ] Escribir el `.sql`: se borra la firma de 10 y se crea la de 11 (cuerpo del #72 más `p_dias`), `revoke`/`grant` como antes.
- [ ] Correrla con el #77: pasa.

### Tarea 2: la rebaja en % (`lib/dinero.ts` y el carrito)

**Archivos:** `src/lib/dinero.ts`, `src/hooks/useCarrito.ts`, `scripts/pruebas/rebaja-pct.test.mjs`.

**Produce:** `precioConRebajaPct(listaUsd: number, minimoUsd: number, pct: number): { usd: number; enMinimo: boolean } | null` (null si pct ≤ 0, ≥ 100 o no finito; `usd` a 4 decimales, nunca bajo `minimoUsd`); `carrito.rebajarPct(modeloId, ubicacionId, pct)`, `carrito.rebajarTodoPct(pct): number` (cuántas piezas quedaron en su mínimo) y `carrito.quitarRebajas()`.

- [ ] Pruebas: 10 % de 20 con mínimo 18 → 18, no en mínimo… (18 es el mínimo exacto → `enMinimo` true); 5 % de 20 con mínimo 18 → 19, false; 20 % de 20 con mínimo 18 → 18, true; 0, 100, NaN → null; mínimo ≥ lista → lista con `enMinimo` true.
- [ ] Fallan; implementar; pasan.
- [ ] El carrito: `rebajarTodoPct` toca solo líneas sin tramo, sin código y sin descuento de clienta que admiten rebaja.

### Tarea 3: el cobro del Mostrador

**Archivos:** `src/paginas/venta/Mostrador.tsx`, `src/hooks/useCarrito.ts` (`venderACredito` gana `dias`), CSS si hace falta (`base.css`).

- [ ] "A crédito" sale con clienta (de la lista o nueva), no con "sin cliente". Campo "Días para pagar" (empieza en los de su ficha); "paga hasta el …"; tope y deuda si su ficha los tiene (`credito_de_clienta` se pide aunque no tenga días).
- [ ] Clienta nueva: `guardarCliente` y luego `venderACredito` con ese id; el id se guarda en `cliente` para un reintento.
- [ ] Editor de pieza: "Rebaja %" y "Cobras · Bs", enlazados.
- [ ] "Rebaja a toda la venta · %" con Aplicar y Quitar; aviso de cuántas quedaron en su mínimo.
- [ ] `npm run build`, `npm run pruebas`; mirarlo en el navegador a 360 px.

### Tarea 4: cerrar

- [ ] CLAUDE.md, INSTALACION.md; revisión simple del diff contra el diseño; commit (sin push hasta que el dueño corra el #77).
