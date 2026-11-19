import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinoViejo } from '../../reenvio-github/reenvio.js';

/*
  github.io se vuelve un reenvío: el enlace viejo va a la misma ruta en
  luxbyemory.com, y ahí la regla de direcciones lo lleva a entrar. o al
  subdominio del revendedor. Así el reenvío no copia la regla.
*/
const B = 'luxbyemory.com';

test('destinoViejo lleva cada enlace con # a su ruta en el dominio', () => {
  assert.equal(destinoViejo('#/publico?tipo=Collares&para=dama', B), 'https://luxbyemory.com/publico?tipo=Collares&para=dama');
  assert.equal(destinoViejo('#/r/jadujoyas', B), 'https://luxbyemory.com/r/jadujoyas');
  assert.equal(destinoViejo('#/admin/inventario', B), 'https://luxbyemory.com/admin/inventario');
  assert.equal(destinoViejo('#/rv', B), 'https://luxbyemory.com/rv');
  assert.equal(destinoViejo('#/reserva/abc', B), 'https://luxbyemory.com/reserva/abc');
});

test('destinoViejo sin ruta lleva a la raiz', () => {
  assert.equal(destinoViejo('', B), 'https://luxbyemory.com/');
  assert.equal(destinoViejo('#seccion', B), 'https://luxbyemory.com/');
});

test('destinoViejo no se deja llevar a otro sitio', () => {
  assert.equal(destinoViejo('#//otro.com/x', B), 'https://luxbyemory.com/');
  assert.equal(destinoViejo('#/\\otro.com', B), 'https://luxbyemory.com/');
});
