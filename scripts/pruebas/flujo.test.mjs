import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparFlujo, nombreConcepto, periodo } from '../../src/lib/flujo.ts';

// La pantalla Flujo (fase 9) pinta lo que devuelve admin_flujo (#75): aquí
// solo se agrupa y se nombra. Los totales de salió y entró suman renglones
// de la misma moneda; lo que queda es la fila "dinero", no una suma.

const f = (orden, grupo, concepto, bs, binance, bcv) => ({ orden, grupo, concepto, bs, binance, bcv });
const FILAS = [
  f(10, 'salio', 'mercancia', 18500, 160, 185),
  f(10, 'salio', 'exhibidores', 250, 5, 2.5),
  f(30, 'salio', 'caja:alquiler', 3000, 25, 30),
  f(40, 'entro', 'ventas', 2000, 16.67, 20),
  f(41, 'entro', 'abonos', 1800, 15, 18),
  f(50, 'nota', 'entro_sin_comprobar', 1000, 8.33, 10),
  f(60, 'queda', 'dinero', -17950, -158.33, -179.5),
  f(61, 'queda', 'mercancia_costo', 11520, 96, 115.2),
  f(65, 'queda', 'abonado_sin_entregar', -800, -6.67, -8),
  f(67, 'queda', 'si_se_vende', -7750, -73.33, -77.5),
];

test('salió y entró: sus renglones y su total en cada moneda', () => {
  const g = agruparFlujo(FILAS);
  assert.deepEqual(g.salio.filas.map((x) => x.concepto), ['mercancia', 'exhibidores', 'caja:alquiler']);
  assert.deepEqual(g.salio.total, { bs: 21750, binance: 190, bcv: 217.5 });
  assert.deepEqual(g.entro.total, { bs: 3800, binance: 31.67, bcv: 38 });
});

test('queda: su total es la fila "dinero"; "si se vende" y "sin comprobar" van aparte', () => {
  const g = agruparFlujo(FILAS);
  assert.deepEqual(g.queda.total, { bs: -17950, binance: -158.33, bcv: -179.5 });
  assert.deepEqual(g.queda.filas.map((x) => x.concepto), ['mercancia_costo', 'abonado_sin_entregar']);
  assert.deepEqual(g.siSeVende, { bs: -7750, binance: -73.33, bcv: -77.5 });
  assert.deepEqual(g.sinComprobar, { bs: 1000, binance: 8.33, bcv: 10 });
});

test('sin movimientos no revienta', () => {
  const vacio = agruparFlujo([]);
  assert.deepEqual(vacio.salio, { filas: [], total: { bs: 0, binance: 0, bcv: 0 } });
  assert.deepEqual(vacio.queda.total, { bs: 0, binance: 0, bcv: 0 });
  assert.equal(vacio.siSeVende, null);
  assert.equal(vacio.sinComprobar, null);
  const soloQueda = agruparFlujo(FILAS.filter((x) => x.grupo === 'queda'));
  assert.deepEqual(soloQueda.entro.total, { bs: 0, binance: 0, bcv: 0 });
});

test('las cifras llegan como texto desde la base y se leen como números', () => {
  const g = agruparFlujo([f(10, 'salio', 'mercancia', '100.50', '1', '1.2'), f(10, 'salio', 'exhibidores', '0.25', '0', null)]);
  assert.deepEqual(g.salio.total, { bs: 100.75, binance: 1, bcv: 1.2 });
});

test('el nombre de cada concepto', () => {
  assert.equal(nombreConcepto('mercancia'), 'Mercancía, con su flete');
  assert.equal(nombreConcepto('caja:alquiler'), 'Caja · Alquiler');
  assert.equal(nombreConcepto('caja:xyz'), 'Caja · xyz');
  assert.equal(nombreConcepto('caja:null'), 'Caja · sin categoría');
  assert.equal(nombreConcepto('abonado_sin_entregar'), 'Lo ya abonado de pedidos sin entregar');
  assert.equal(nombreConcepto('algo_nuevo'), 'algo_nuevo');
});

test('los períodos', () => {
  assert.deepEqual(periodo('mes', '2026-11-24'), { desde: '2026-11-01', hasta: '2026-11-24' });
  assert.deepEqual(periodo('anio', '2026-11-24'), { desde: '2026-01-01', hasta: '2026-11-24' });
  assert.deepEqual(periodo('todo', '2026-11-24'), { desde: null, hasta: null });
});
