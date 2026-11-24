# Fase 8 — Auditoría de las cuentas

## Lo que pidió el dueño (24/11/2026)

> "Quiero que revises todos los cálculos, encuentres forma de entender lo
> que entra, las inversiones, la mercancía, lo que hay si se vende; hacer
> realmente una auditoría y revisión y rediseño de todo."

Es la primera de tres (8 auditoría, 9 administrativo, 10 landing, catálogo
y pedido). El dueño eligió ese orden: si una cifra está mal, se sabe antes
de rediseñar nada.

## Qué es

Un **informe**, no un cambio. Se revisa cada cálculo de dinero del sistema
y se contesta, con las cifras reales de la tienda, lo que el dueño quiere
entender:

- **Lo que entra**: ventas, abonos, crédito, caja.
- **Las inversiones**: lotes (mercancía, flete, exhibidores), muebles,
  cuánto ha vuelto.
- **La mercancía**: lo que hay, lo que costó, lo que vale a la etiqueta.
- **Lo que hay si se vende**: lo que dejaría el inventario de hoy.

Cada hallazgo dice qué fórmula, qué está mal o se entiende mal, con qué
cifra se ve, y qué se propone. Los arreglos de SQL que salgan van en esta
fase si son errores; lo que sea de presentación pasa a la fase 9.

## Dónde están las cuentas

`CLAUDE.md`: "Las dos fórmulas de las que sale toda cifra de dinero",
"Las reglas de negocio vivas" y "Trampas que ya mordieron". Funciones:
`gastos_fijos_partidas`, `plan_ventas`, `caja_flujo`, `falta_bcv_de`,
`costo_bcv_con`, `piso_margen_con`, `volumen_mensual_estimado`; vistas
`v_margen_ventas`, `v_diagnostico`, `v_capex_lote`, `v_cobertura_mes`,
`v_recuperacion`, `v_valor_inventario`, `v_plan_ventas`. Pantallas:
Costos, Reportes, Caja, Inversiones, Crédito, Inventario.

## Lo que no cambia

- Se audita con lecturas: nada escribe en producción.
- Ninguna cifra de negocio se inventa (regla 4).
- Los datos reales (cédulas, costos) no entran al repositorio.

## Estado

Ver la tabla del README.
