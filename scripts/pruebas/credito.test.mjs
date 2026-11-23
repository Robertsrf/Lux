import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaVenezuelaMas } from '../../src/lib/dinero.ts';

// El vencimiento de una venta a crédito sale del día de Caracas (UTC−4),
// como en `vender_a_credito`, no del reloj del teléfono ni de UTC.
test('a las 22:00 de Caracas sigue siendo el mismo día, aunque en UTC ya es mañana', () => {
  const ahora = new Date('2026-11-24T02:00:00Z'); // 23/11 a las 22:00 en Caracas
  assert.equal(fechaVenezuelaMas(0, ahora), '2026-11-23');
  assert.equal(fechaVenezuelaMas(10, ahora), '2026-12-03');
});

test('cruza el mes y el año', () => {
  const ahora = new Date('2026-12-25T15:00:00Z');
  assert.equal(fechaVenezuelaMas(7, ahora), '2027-01-01');
});
