import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dondeEstoy, usuarioValido, USUARIOS_RESERVADOS, urlTienda, urlEntrar, urlRevendedor,
  rutaDeHashViejo, destinoDeRuta, destinoDeApartado, usuarioDesdeNombre,
} from '../../src/lib/dominio.ts';

const B = 'luxbyemory.com';
const D = { base: B, origen: 'https://luxbyemory.com' };
const TIENDA = { tipo: 'tienda' };
const ENTRAR = { tipo: 'entrar' };
const JADU = { tipo: 'revendedor', usuario: 'jadujoyas' };
const UNICA = { tipo: 'unica' };

test('dondeEstoy reconoce la tienda, con www, mayusculas y punto final', () => {
  assert.deepEqual(dondeEstoy('luxbyemory.com', B), TIENDA);
  assert.deepEqual(dondeEstoy('www.luxbyemory.com', B), TIENDA);
  assert.deepEqual(dondeEstoy('LuxByEmory.com.', B), TIENDA);
});

test('dondeEstoy reconoce entrar y al revendedor por su usuario', () => {
  assert.deepEqual(dondeEstoy('entrar.luxbyemory.com', B), ENTRAR);
  assert.deepEqual(dondeEstoy('JaduJoyas.luxbyemory.com', B), JADU);
});

test('dondeEstoy no abre catalogo para un subdominio que no puede ser revendedor', () => {
  for (const h of ['a.b.luxbyemory.com', 'admin.luxbyemory.com', 'xn--abc.luxbyemory.com', 'jadu-.luxbyemory.com']) {
    assert.deepEqual(dondeEstoy(h, B), { tipo: 'ninguno' }, h);
  }
});

test('dondeEstoy sin dominio base, o fuera de el, es una sola direccion', () => {
  assert.deepEqual(dondeEstoy('localhost', null), UNICA);
  assert.deepEqual(dondeEstoy('robertsrf.github.io', B), UNICA);
  assert.deepEqual(dondeEstoy('otroluxbyemory.com', B), UNICA);
});

test('usuarioValido acepta nombres de subdominio y rechaza los reservados', () => {
  assert.equal(usuarioValido('jadujoyas'), true);
  assert.equal(usuarioValido('pedro-2'), true);
  for (const u of ['ab', '-pedro', 'pedro-', 'xn--pedro', 'entrar', 'www', 'Pedro', 'a'.repeat(31)]) {
    assert.equal(usuarioValido(u), false, u);
  }
  assert.ok(USUARIOS_RESERVADOS.includes('entrar'));
  assert.ok(USUARIOS_RESERVADOS.includes('www'));
});

test('las direcciones con dominio base', () => {
  assert.equal(urlRevendedor(D, 'jadujoyas', '/'), 'https://jadujoyas.luxbyemory.com/');
  assert.equal(urlEntrar(D, '/venta'), 'https://entrar.luxbyemory.com/venta');
  assert.equal(urlTienda(D, '/rv'), 'https://luxbyemory.com/rv');
});

test('las direcciones conservan protocolo y puerto del origen (desarrollo)', () => {
  const dev = { base: 'lux.localhost', origen: 'http://jadujoyas.lux.localhost:5173' };
  assert.equal(urlTienda(dev, '/'), 'http://lux.localhost:5173/');
  assert.equal(urlEntrar(dev, '/venta'), 'http://entrar.lux.localhost:5173/venta');
});

test('las direcciones sin dominio base usan el origen y /r/ para el revendedor', () => {
  const dev = { base: null, origen: 'http://localhost:5173' };
  assert.equal(urlRevendedor(dev, 'jadujoyas', '/'), 'http://localhost:5173/r/jadujoyas');
  assert.equal(urlRevendedor(dev, 'jadujoyas', '/apartado/t1'), 'http://localhost:5173/apartado/t1');
  assert.equal(urlEntrar(dev, '/venta'), 'http://localhost:5173/venta');
});

test('rutaDeHashViejo convierte el enlace viejo y conserva la busqueda', () => {
  assert.equal(rutaDeHashViejo('#/publico?tipo=Collares&para=dama'), '/publico?tipo=Collares&para=dama');
  assert.equal(rutaDeHashViejo('#/'), '/');
  assert.equal(rutaDeHashViejo('#seccion'), null);
  assert.equal(rutaDeHashViejo(''), null);
});

test('destinoDeRuta en la tienda', () => {
  assert.deepEqual(destinoDeRuta(TIENDA, '/publico?ver=todas', D), { ir: '/?ver=todas' });
  assert.deepEqual(destinoDeRuta(TIENDA, '/publico', D), { ir: '/' });
  assert.deepEqual(destinoDeRuta(TIENDA, '/admin/inventario', D), { ir: 'https://entrar.luxbyemory.com/admin/inventario' });
  assert.deepEqual(destinoDeRuta(TIENDA, '/entrar', D), { ir: 'https://entrar.luxbyemory.com/entrar' });
  assert.deepEqual(destinoDeRuta(TIENDA, '/r/jadujoyas', D), { ir: 'https://jadujoyas.luxbyemory.com/' });
  for (const r of ['/', '/?tipo=Collares', '/rv', '/rv/entrar', '/rv/vender', '/reserva/abc', '/guia-revendedor', '/vitrina', '/apartado/t1']) {
    assert.deepEqual(destinoDeRuta(TIENDA, r, D), { abrir: true }, r);
  }
});

test('destinoDeRuta en entrar', () => {
  assert.deepEqual(destinoDeRuta(ENTRAR, '/reserva/abc', D), { ir: 'https://luxbyemory.com/reserva/abc' });
  assert.deepEqual(destinoDeRuta(ENTRAR, '/publico', D), { ir: 'https://luxbyemory.com/' });
  assert.deepEqual(destinoDeRuta(ENTRAR, '/rv', D), { ir: 'https://luxbyemory.com/rv' });
  for (const r of ['/', '/entrar', '/venta', '/venta/pedidos', '/admin/inventario', '/clientes/3', '/tasas', '/catalogo', '/verificacion']) {
    assert.deepEqual(destinoDeRuta(ENTRAR, r, D), { abrir: true }, r);
  }
});

test('destinoDeRuta en el revendedor nunca abre una pantalla de Lux', () => {
  assert.deepEqual(destinoDeRuta(JADU, '/', D), { abrir: true });
  assert.deepEqual(destinoDeRuta(JADU, '/apartado/t1', D), { abrir: true });
  for (const r of ['/admin', '/entrar', '/venta', '/rv', '/publico', '/r/pedro']) {
    assert.deepEqual(destinoDeRuta(JADU, r, D), { ir: '/' }, r);
  }
  assert.deepEqual(destinoDeRuta({ tipo: 'ninguno' }, '/', D), { abrir: true });
  assert.deepEqual(destinoDeRuta({ tipo: 'ninguno' }, '/admin', D), { ir: '/' });
});

test('destinoDeRuta en una sola direccion lo abre todo', () => {
  const dev = { base: null, origen: 'http://localhost:5173' };
  for (const r of ['/cualquier', '/admin/inventario', '/r/jadujoyas', '/publico']) {
    assert.deepEqual(destinoDeRuta(UNICA, r, dev), { abrir: true }, r);
  }
});

test('destinoDeApartado lleva el pedido al subdominio de su revendedor', () => {
  assert.equal(destinoDeApartado(JADU, 'pedro', 't1', D), 'https://pedro.luxbyemory.com/apartado/t1');
  assert.equal(destinoDeApartado(JADU, 'jadujoyas', 't1', D), null);
  assert.equal(destinoDeApartado(TIENDA, 'pedro', 't1', D), 'https://pedro.luxbyemory.com/apartado/t1');
  assert.equal(destinoDeApartado(TIENDA, null, 't1', D), null);
  assert.equal(destinoDeApartado(UNICA, 'pedro', 't1', { base: null, origen: 'http://localhost:5173' }), null);
});

test('destinoDeApartado no salta a un usuario que no puede ser subdominio', () => {
  assert.equal(destinoDeApartado(JADU, 'entrar', 't1', D), null);
});

test('usuarioDesdeNombre no propone un nombre reservado', () => {
  assert.equal(usuarioDesdeNombre('María González'), 'maria-gonzalez');
  assert.equal(usuarioDesdeNombre('Lux'), 'lux-joyas');
  assert.equal(usuarioValido(usuarioDesdeNombre('Entrar')), true);
});
