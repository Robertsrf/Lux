import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tarjetaDe, urlLogo, reescribeAqui } from '../../cloudflare/tarjeta.mjs';

const SB = 'https://abc.supabase.co';

test('tarjetaDe con perfil: su nombre manda y Lux va en pequeño', () => {
  const t = tarjetaDe({ catalogo_nombre: 'JaduJoyas', logo_path: 'revendedores/jadujoyas/1.webp' }, SB);
  assert.equal(t.titulo, 'JaduJoyas');
  assert.match(t.descripcion, /JaduJoyas/);
  assert.match(t.descripcion, /Joyas Lux by Emory/);
  assert.equal(t.imagen, 'https://abc.supabase.co/storage/v1/object/public/fotos/revendedores/jadujoyas/1.webp');
});

test('tarjetaDe sin logo no pone ninguna imagen (nunca la de Lux)', () => {
  const t = tarjetaDe({ catalogo_nombre: 'Pedro', logo_path: null }, SB);
  assert.equal(t.imagen, null);
});

test('tarjetaDe sin perfil es neutra: no nombra a Lux', () => {
  const t = tarjetaDe(null, SB);
  assert.equal(t.titulo, 'Catálogo de joyas');
  assert.doesNotMatch(`${t.titulo} ${t.descripcion}`, /Lux/);
  assert.equal(t.imagen, null);
});

test('urlLogo codifica la ruta y no deja salir del bucket', () => {
  assert.equal(urlLogo(SB, 'revendedores/a b/1.webp'), 'https://abc.supabase.co/storage/v1/object/public/fotos/revendedores/a%20b/1.webp');
  assert.equal(urlLogo(SB, '../otro/x.webp'), null);
  assert.equal(urlLogo(SB, null), null);
});

test('reescribeAqui: solo el HTML del subdominio de un revendedor', () => {
  const rv = { tipo: 'revendedor', usuario: 'jadujoyas' };
  assert.equal(reescribeAqui(rv, '/'), true);
  assert.equal(reescribeAqui(rv, '/apartado/t1'), true);
  assert.equal(reescribeAqui({ tipo: 'ninguno' }, '/'), true);
  assert.equal(reescribeAqui(rv, '/assets/index.js'), false);
  assert.equal(reescribeAqui({ tipo: 'tienda' }, '/'), false);
  assert.equal(reescribeAqui({ tipo: 'entrar' }, '/'), false);
});
