import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarCodigo, codigoCompleto, codigosQueAplican, vigente,
  parejaParaOfrecer, faltanParaTramo, sumarMirada, motivoDeCodigo,
} from '../../src/lib/ofertas.ts';

const pieza = (modelo_id, cantidad = 1) => ({
  modelo_id, nombre: `p${modelo_id}`, variante: null, categoria: null,
  foto_thumb: null, foto_url: null, precio_lista_usd: 10, precio_oferta_usd: 9, cantidad,
});
const codigo = (cod, piezas, vence_en = '2999-01-01T00:00:00Z') =>
  ({ codigo: cod, origen: 'combo', pct: 5, vence_en, piezas });
const COLLAR = 1;
const ARETES = 2;

test('normalizarCodigo lee mayusculas, espacios, guiones y prefijo', () => {
  assert.equal(normalizarCodigo(' lux 7k2m9p '), 'LUX-7K2M9P');
  assert.equal(normalizarCodigo('LUX7K2M9P'), 'LUX-7K2M9P');
  assert.equal(normalizarCodigo('7K2-M9P'), 'LUX-7K2M9P');
});

test('normalizarCodigo rechaza lo que no es codigo', () => {
  assert.equal(normalizarCodigo('LUX-7K2M9O'), null);
  assert.equal(normalizarCodigo('LUX-7K2M9'), null);
});

test('codigosQueAplican cubre solo las unidades del codigo', () => {
  const c = codigo('LUX-AAAAAA', [pieza(COLLAR), pieza(ARETES)]);
  const m = codigosQueAplican([c], new Map([[COLLAR, 2], [ARETES, 1]]));
  assert.equal(m.get(COLLAR).unidades, 1);
  assert.equal(m.get(ARETES).unidades, 1);
  assert.equal(m.get(COLLAR).codigo, 'LUX-AAAAAA');
});

test('dos codigos que comparten una pieza: solo el primero', () => {
  const a = codigo('LUX-AAAAAA', [pieza(COLLAR), pieza(ARETES)]);
  const b = codigo('LUX-BBBBBB', [pieza(COLLAR), pieza(3)]);
  const carrito = new Map([[COLLAR, 1], [ARETES, 1], [3, 1]]);
  const m = codigosQueAplican([a, b], carrito);
  assert.equal(m.get(COLLAR).codigo, 'LUX-AAAAAA');
  assert.equal(m.has(3), false);
  assert.equal(motivoDeCodigo(b, [a, b], carrito), 'comparte_pieza');
  assert.equal(motivoDeCodigo(a, [a, b], carrito), null);
});

test('codigoCompleto es falso si falta una pieza', () => {
  const c = codigo('LUX-AAAAAA', [pieza(COLLAR), pieza(ARETES)]);
  assert.equal(codigoCompleto(c, new Map([[COLLAR, 1]])), false);
  assert.equal(codigoCompleto(c, new Map([[COLLAR, 1], [ARETES, 1]])), true);
  assert.equal(motivoDeCodigo(c, [c], new Map([[COLLAR, 1]])), 'faltan_piezas');
});

test('parejaParaOfrecer toma las dos que mas pasan del umbral', () => {
  const m = { 1: 25000, 2: 21000, 3: 5000 };
  assert.deepEqual(parejaParaOfrecer(m, 20, new Set()), [1, 2]);
  assert.equal(parejaParaOfrecer(m, 20, new Set(['1-2'])), null);
  assert.equal(parejaParaOfrecer({ 1: 25000, 3: 5000 }, 20, new Set()), null);
});

test('sumarMirada suma sin tocar lo anterior', () => {
  const a = { 1: 1000 };
  const b = sumarMirada(a, 1, 500);
  assert.equal(b[1], 1500);
  assert.equal(a[1], 1000);
});

test('faltanParaTramo', () => {
  const tramos = [{ piezas_min: 6, descuento_pct: 5 }, { piezas_min: 12, descuento_pct: 10 }];
  assert.deepEqual(faltanParaTramo(4, tramos), { faltan: 2, pct: 5 });
  assert.equal(faltanParaTramo(12, tramos), null);
});

test('vigente', () => {
  const ayer = new Date(Date.now() - 86400000).toISOString();
  assert.equal(vigente(codigo('LUX-AAAAAA', [pieza(1)], ayer)), false);
  assert.equal(vigente(codigo('LUX-AAAAAA', [pieza(1)])), true);
});

test('efectoDeRomperCodigo: las otras piezas del codigo vuelven a su precio', async () => {
  const { efectoDeRomperCodigo, tieneOferta } = await import('../../src/lib/ofertas.ts');
  const lineas = [
    { modelo_id: 1, cantidad: 1, precio: 9, precio_sin_oferta: 10, oferta_codigo: 'LUX-AAAAAA' },
    { modelo_id: 2, cantidad: 2, precio: 4.5, precio_sin_oferta: 5, oferta_codigo: 'LUX-AAAAAA' },
    { modelo_id: 3, cantidad: 1, precio: 7, precio_sin_oferta: 7, oferta_codigo: null },
  ];
  assert.deepEqual(efectoDeRomperCodigo(lineas, 1), { codigo: 'LUX-AAAAAA', piezas: 2, sube: 1 });
  // Sin oferta (ya roto o sin codigo), quitarla no rompe nada.
  assert.equal(efectoDeRomperCodigo(lineas, 3), null);
  assert.equal(efectoDeRomperCodigo([{ ...lineas[0], precio: 10 }, lineas[1]], 1), null);
  assert.equal(tieneOferta({ precio: 5, precio_sin_oferta: null }), false);
});

import { valorDevueltoBcv } from '../../src/lib/dinero.ts';

test('valorDevueltoBcv: sin efecto del codigo devuelve el valor bruto', () => {
  assert.equal(valorDevueltoBcv(10, 1000, 0), 10);
  assert.equal(valorDevueltoBcv(10, 0, 50), 10);
});

test('valorDevueltoBcv: descuenta la parte que pierden las otras piezas, con tope', () => {
  assert.equal(valorDevueltoBcv(10, 1000, 250), 7.5);
  assert.equal(valorDevueltoBcv(10, 1000, 5000), 0);
});
