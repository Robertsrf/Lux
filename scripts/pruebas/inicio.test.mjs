import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendientesDeInicio } from '../../src/lib/inicio.ts';
import { formatearBs } from '../../src/lib/dinero.ts';

// "Para hoy" del Inicio (fase 9): solo lo que tiene algo, lo vencido
// primero, cada cosa con su destino. Las cifras vienen de admin_inicio (#76).

const CERO = {
  ventas_por_verificar: 0, por_verificar_bs: 0, abonos_por_revisar: 0, pedidos_por_entregar: 0,
  pedidos_vencidos: 0, apartados_por_aprobar: 0, creditos_vencidos: 0, vencido_bcv: 0, conteos_por_revisar: 0,
};

test('sin el #76 (null) o sin nada pendiente, no hay nada', () => {
  assert.deepEqual(pendientesDeInicio(null), []);
  assert.deepEqual(pendientesDeInicio(CERO), []);
});

test('los créditos vencidos van primero, urgentes, a Crédito', () => {
  const p = pendientesDeInicio({ ...CERO, ventas_por_verificar: 3, por_verificar_bs: 18420, creditos_vencidos: 2, vencido_bcv: 85 });
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], {
    clave: 'creditos_vencidos', cuantos: 2, texto: '2 créditos vencidos',
    detalle: '$85,00 BCV por cobrar', a: '/admin/credito', urgente: true,
  });
  assert.equal(p[1].texto, '3 ventas por verificar');
  assert.equal(p[1].detalle, `${formatearBs(18420)} sin comprobar`);
  assert.equal(p[1].urgente, false);
});

test('singular y plural', () => {
  const p = pendientesDeInicio({ ...CERO, ventas_por_verificar: 1, por_verificar_bs: 2000, creditos_vencidos: 1, vencido_bcv: 16, conteos_por_revisar: 1 });
  assert.deepEqual(p.map((x) => x.texto), ['1 crédito vencido', '1 venta por verificar', '1 conteo por revisar']);
});

test('cada cosa va a su pantalla', () => {
  const p = pendientesDeInicio({
    ...CERO, ventas_por_verificar: 1, abonos_por_revisar: 2, pedidos_por_entregar: 1,
    pedidos_vencidos: 1, apartados_por_aprobar: 1, conteos_por_revisar: 1,
  });
  const a = Object.fromEntries(p.map((x) => [x.clave, x.a]));
  assert.equal(a.ventas_por_verificar, '/venta/pedidos');
  assert.equal(a.abonos_por_revisar, '/venta/pedidos');
  assert.equal(a.pedidos_por_entregar, '/venta/pedidos');
  assert.equal(a.pedidos_vencidos, '/venta/pedidos');
  assert.equal(a.apartados_por_aprobar, '/venta/pedidos');
  assert.equal(a.conteos_por_revisar, '/venta/conteo');
  assert.equal(p.find((x) => x.clave === 'abonos_por_revisar').texto, '2 pagos por revisar');
});

test('una cifra que no llega (null) cuenta como nada, no revienta', () => {
  assert.deepEqual(pendientesDeInicio({ ...CERO, creditos_vencidos: null, vencido_bcv: null }), []);
});
