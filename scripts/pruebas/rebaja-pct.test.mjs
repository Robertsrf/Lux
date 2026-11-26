import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPorcentaje, precioConRebajaPct } from '../../src/lib/dinero.ts';

// La rebaja en porcentaje del cobro: la etiqueta menos el %, nunca por
// debajo del mínimo de la pieza (la base lo vigila igual).
test('una rebaja que la pieza admite', () => {
  assert.deepEqual(precioConRebajaPct(20, 18, 5), { usd: 19, enMinimo: false });
});

test('justo en el mínimo cuenta como en su mínimo', () => {
  assert.deepEqual(precioConRebajaPct(20, 18, 10), { usd: 18, enMinimo: true });
});

test('más de lo que admite: se queda en su mínimo', () => {
  assert.deepEqual(precioConRebajaPct(20, 18, 20), { usd: 18, enMinimo: true });
});

test('una pieza que no admite rebaja se queda en su etiqueta', () => {
  assert.deepEqual(precioConRebajaPct(20, 20, 10), { usd: 20, enMinimo: true });
});

test('a cuatro decimales, como el precio a mano', () => {
  assert.deepEqual(precioConRebajaPct(13.33, 10, 7), { usd: 12.3969, enMinimo: false });
});

test('lo que no es una rebaja no cambia nada', () => {
  assert.equal(precioConRebajaPct(20, 18, 0), null);
  assert.equal(precioConRebajaPct(20, 18, -5), null);
  assert.equal(precioConRebajaPct(20, 18, 100), null);
  assert.equal(precioConRebajaPct(20, 18, Number.NaN), null);
  assert.equal(precioConRebajaPct(0, 0, 10), null);
});

test('el porcentaje se lee como se escribe aquí', () => {
  assert.equal(leerPorcentaje('10'), 10);
  assert.equal(leerPorcentaje(' 7,5 '), 7.5);
  assert.equal(leerPorcentaje('7.5'), 7.5);
  assert.equal(leerPorcentaje('10 %'), 10);
  assert.equal(leerPorcentaje('10%'), 10);
});

test('lo que no es un porcentaje de rebaja no se lee', () => {
  for (const t of ['', '0', '100', '1.500', 'diez', '-5', '5,555', '%']) {
    assert.equal(leerPorcentaje(t), null, t);
  }
});
