import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENLACES_ADMIN, PRINCIPALES_ADMIN, agruparEnlaces } from '../../src/lib/menu.ts';

// El menú del administrador, por grupos (fase 9, decisión del dueño del
// 24/11/2026). Una ruta en un solo sitio, y ninguna de las de antes se pierde.

const DE_ANTES = [
  '/admin/inventario', '/venta', '/venta/pedidos', '/admin/caja', '/admin/credito', '/venta/cierre',
  '/venta/conteo', '/venta/codigo', '/admin/reportes', '/clientes', '/admin/vendedoras',
  '/admin/revendedores', '/admin/capacitacion', '/admin/lotes', '/admin/grupos', '/admin/tramos',
  '/admin/costos', '/admin/inversiones', '/tasas', '/admin/landing', '/admin/textos', '/catalogo',
  '/vitrina', '/verificacion',
];

test('cada ruta del administrador aparece una sola vez', () => {
  const rutas = ENLACES_ADMIN.map((e) => e.a);
  assert.equal(new Set(rutas).size, rutas.length);
});

test('están todas las de antes, más Inicio y Flujo', () => {
  const rutas = new Set(ENLACES_ADMIN.map((e) => e.a));
  for (const r of [...DE_ANTES, '/admin', '/admin/flujo']) assert.ok(rutas.has(r), `falta ${r}`);
  assert.equal(rutas.size, DE_ANTES.length + 2);
});

test('los grupos, en el orden que eligió el dueño', () => {
  const g = agruparEnlaces(ENLACES_ADMIN);
  assert.deepEqual(g.map((x) => x.titulo), ['', 'Vender', 'Dinero', 'Mercancía', 'Gente', 'En línea', 'Sistema']);
  assert.deepEqual(g[0].enlaces.map((e) => e.a), ['/admin']);
  assert.deepEqual(g[2].enlaces.map((e) => e.a),
    ['/admin/flujo', '/admin/caja', '/admin/credito', '/admin/reportes', '/admin/costos', '/admin/inversiones']);
  assert.deepEqual(g[3].enlaces.map((e) => e.a),
    ['/admin/inventario', '/admin/lotes', '/admin/grupos', '/admin/tramos', '/tasas']);
});

test('las tres de abajo del administrador: Inicio, Mostrador y Pedidos', () => {
  assert.deepEqual(PRINCIPALES_ADMIN, ['/admin', '/venta', '/venta/pedidos']);
  const rutas = new Set(ENLACES_ADMIN.map((e) => e.a));
  for (const r of PRINCIPALES_ADMIN) assert.ok(rutas.has(r));
});

test('sin grupos (el panel del revendedor, la vendedora): un solo grupo con todo', () => {
  const enlaces = [
    { a: '/rv', texto: 'Inicio', icono: 'inicio' },
    { a: '/rv/vender', texto: 'Vender', icono: 'mostrador' },
  ];
  const g = agruparEnlaces(enlaces);
  assert.equal(g.length, 1);
  assert.equal(g[0].titulo, '');
  assert.deepEqual(g[0].enlaces, enlaces);
});

test('un grupo vacío no sale, y el orden de llegada se respeta', () => {
  assert.deepEqual(agruparEnlaces([]), []);
  const g = agruparEnlaces([
    { a: '/b', texto: 'B', icono: 'mas', grupo: 'Dos' },
    { a: '/a', texto: 'A', icono: 'mas', grupo: 'Uno' },
    { a: '/c', texto: 'C', icono: 'mas', grupo: 'Dos' },
  ]);
  assert.deepEqual(g.map((x) => [x.titulo, x.enlaces.map((e) => e.a)]), [['Dos', ['/b', '/c']], ['Uno', ['/a']]]);
});
