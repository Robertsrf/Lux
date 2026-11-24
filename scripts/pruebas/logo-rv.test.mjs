import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGO_MAX_BYTES, rutaDeLogo, tipoDeImagen } from '../../supabase/functions/logo-revendedor/reglas.ts';

// El logo que sube un revendedor desde su panel (#73, fase 6): el servidor
// mira el tipo por los primeros bytes, no por lo que dice el navegador, y
// arma la ruta él mismo. `rv_poner_logo` vuelve a exigir esa forma.

const bytes = (...b) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const texto = (s) => new TextEncoder().encode(s);

test('reconoce WebP, PNG y JPEG por sus primeros bytes', () => {
  const webp = new Uint8Array([...texto('RIFF'), 0x10, 0, 0, 0, ...texto('WEBPVP8 '), 0, 0, 0, 0]);
  assert.equal(tipoDeImagen(webp), 'webp');
  assert.equal(tipoDeImagen(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'png');
  assert.equal(tipoDeImagen(bytes(0xff, 0xd8, 0xff, 0xe0)), 'jpeg');
});

test('no acepta otra cosa', () => {
  assert.equal(tipoDeImagen(new Uint8Array([...texto('GIF89a'), 0, 0, 0, 0])), null);
  assert.equal(tipoDeImagen(texto('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(tipoDeImagen(texto('hola, esto es texto')), null);
  assert.equal(tipoDeImagen(new Uint8Array([...texto('RIFF'), 0, 0, 0, 0, ...texto('AVI LIST')])), null, 'un RIFF que no es WebP');
  assert.equal(tipoDeImagen(new Uint8Array([0xff, 0xd8])), null, 'muy corto');
  assert.equal(tipoDeImagen(new Uint8Array([])), null);
});

test('la ruta la arma el servidor, con la extensión de su tipo', () => {
  assert.equal(rutaDeLogo('jadujoyas', 1763900000000, 'webp'), 'revendedores/jadujoyas/1763900000000.webp');
  assert.equal(rutaDeLogo('jadu-joyas', 1763900000000, 'png'), 'revendedores/jadu-joyas/1763900000000.png');
  assert.equal(rutaDeLogo('jadujoyas', 1763900000000, 'jpeg'), 'revendedores/jadujoyas/1763900000000.jpg');
  assert.throws(() => rutaDeLogo('../x', 1763900000000, 'webp'));
  assert.throws(() => rutaDeLogo('Jadu', 1763900000000, 'webp'));
});

test('el tope es de 300 KB', () => {
  assert.equal(LOGO_MAX_BYTES, 300_000);
});
