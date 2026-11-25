import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piezaDeRuta, rutaDePieza, textoParaCompartir, enlaceCompartirPieza } from '../../src/lib/pieza.ts';

test('piezaDeRuta: solo un entero positivo escrito como entero', () => {
  assert.equal(piezaDeRuta('12'), 12);
  for (const malo of ['0', '-3', '1.5', '12abc', '', null, '1e3', ' 12', '012x', '99999999999999999999']) {
    assert.equal(piezaDeRuta(malo), null, String(malo));
  }
});

test('rutaDePieza: en la tienda, en desarrollo y con para quién', () => {
  assert.equal(rutaDePieza('/', 12, null), '/?pieza=12');
  assert.equal(rutaDePieza('/publico', 7, 'caballero'), '/publico?pieza=7&para=caballero');
  assert.equal(rutaDePieza('/', 3, 'dama'), '/?pieza=3&para=dama');
});

test('textoParaCompartir: el nombre y el enlace, sin precio', () => {
  const t = textoParaCompartir('Collar Cubana', 'https://luxbyemory.com/?pieza=1');
  assert.equal(t, 'Mira esta joya de Lux by Emory: Collar Cubana\nhttps://luxbyemory.com/?pieza=1');
  assert.ok(!t.includes('Bs') && !t.includes('$'));
});

test('enlaceCompartirPieza: wa.me con el texto codificado', () => {
  const url = 'https://luxbyemory.com/?pieza=1';
  const e = enlaceCompartirPieza('Collar & co', url);
  assert.ok(e.startsWith('https://wa.me/?text='));
  assert.equal(decodeURIComponent(e.slice('https://wa.me/?text='.length)), textoParaCompartir('Collar & co', url));
});
