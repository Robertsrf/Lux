import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarClientas, clientaConDato, conciliarCarrito, cuentasDe, digitosTelefono, faltaParaSeguir, montoQueCubre,
  ordenarPiezas,
} from '../../src/paginas/revendedor/panel/vender/cuentas.ts';
import { abonoEnBcv, faltaTrasAbono, margenDeAbono } from '../../src/lib/dinero.ts';

// Vender desde el panel del revendedor (fase 7): las cuentas y lo que falta
// para seguir, sin React ni red. La base manda (`rv_vender`); esto enseña
// antes de guardar lo mismo que ella va a hacer.

const pieza = (id, nombre, extra = {}) => ({
  id, sku: `SKU${id}`, nombre, categoria: 'Cadena', variantes_nota: null, foto_path: null, foto_thumb_path: null,
  familia: id, variante: null, disponible: 3, etiqueta_usd: 25, precio_lux_usd: 20, minimo_usd: 25.1,
  precio_usd: 30, precio_propio: 30, ganancia_usd: 10, ...extra,
});

const clienta = (id, nombre, extra = {}) => ({
  id, nombre, apellido: null, cedula: null, telefono: null, notas: null, creado_en: '2026-11-01',
  abiertos: 0, compras: 0, comprado_usd: 0, falta_usd: 0, ultima: null, ...extra,
});

const vacio = () => ({
  carrito: new Map(), clientaId: null,
  nueva: { nombre: '', telefono: '', apellido: '', cedula: '' },
  cobro: null, metodo: 'pago_movil', monto: '', referencia: '',
});

const tasa = { tasa_bcv: 100, tasa_venta: 120 };

test('lo suyo va primero, y "Tuyas" deja solo lo suyo', () => {
  const piezas = [pieza(1, 'Anillo'), pieza(2, 'Zarcillo', { mias: 2 }), pieza(3, 'Brazalete')];
  assert.deepEqual(ordenarPiezas(piezas, 'todas', '').map((p) => p.id), [2, 1, 3]);
  assert.deepEqual(ordenarPiezas(piezas, 'tuyas', '').map((p) => p.id), [2]);
});

test('buscar no mira tildes ni mayúsculas', () => {
  const piezas = [pieza(1, 'Cadena Fígaro'), pieza(2, 'CADENA'), pieza(3, 'Anillo', { categoria: 'Anillo' })];
  assert.deepEqual(ordenarPiezas(piezas, 'todas', 'cadena').map((p) => p.id).sort(), [1, 2]);
  assert.deepEqual(ordenarPiezas(piezas, 'todas', 'figaro').map((p) => p.id), [1]);
  assert.deepEqual(ordenarPiezas(piezas, 'todas', 'sku3').map((p) => p.id), [3]);
});

test('lo que le paga a Lux cuenta solo lo que no es suyo', () => {
  const piezas = [pieza(1, 'Cadena', { mias: 1 })];
  assert.deepEqual(cuentasDe(piezas, new Map([[1, 2]])), { piezas: 2, cobras: 60, lux: 20, todasTuyas: false });
  assert.deepEqual(cuentasDe(piezas, new Map([[1, 1]])), { piezas: 1, cobras: 30, lux: 0, todasTuyas: true });
  assert.equal(cuentasDe(piezas, new Map()).todasTuyas, false, 'un carrito vacío no es "todas tuyas"');
});

test('el carrito guardado se ajusta a lo que hay ahora', () => {
  const piezas = [pieza(1, 'Cadena', { disponible: 1 }), pieza(2, 'Anillo')];
  const r = conciliarCarrito(piezas, new Map([[1, 3], [2, 1], [9, 1]]));
  assert.deepEqual([...r.carrito], [[1, 1], [2, 1]]);
  assert.deepEqual(r.quitadas, ['SKU9']);
  assert.deepEqual(r.bajadas, ['Cadena']);
  const sinLibres = conciliarCarrito([pieza(1, 'Cadena', { disponible: 0 })], new Map([[1, 2]]));
  assert.deepEqual([...sinLibres.carrito], []);
  assert.deepEqual(sinLibres.quitadas, ['Cadena']);
});

test('el teléfono se reconoce por sus diez últimos dígitos', () => {
  assert.equal(digitosTelefono('0412-123.45.67'), '4121234567');
  assert.equal(digitosTelefono('+58 412 1234567'), '4121234567');
  assert.equal(digitosTelefono(null), '');
});

test('reconoce a una suya por su teléfono o su cédula, escritos de otra forma', () => {
  const clientas = [
    clienta(1, 'María', { telefono: '584121234567' }),
    clienta(2, 'Ana', { cedula: '12345678', telefono: '04245556677' }),
  ];
  assert.equal(clientaConDato(clientas, '', '0412-123.45.67')?.id, 1);
  assert.equal(clientaConDato(clientas, 'V-12.345.678', '')?.id, 2);
  assert.equal(clientaConDato(clientas, '', '0412123'), null, 'un teléfono a medias no reconoce a nadie');
  assert.equal(clientaConDato(clientas, '123', ''), null);
});

test('buscar clientas por nombre, teléfono o cédula', () => {
  const clientas = [
    clienta(1, 'María', { apellido: 'González', telefono: '0412-1234567' }),
    clienta(2, 'Ana', { cedula: 'V-98.765.432' }),
  ];
  assert.deepEqual(buscarClientas(clientas, 'gonzalez').map((c) => c.id), [1]);
  assert.deepEqual(buscarClientas(clientas, '1234567').map((c) => c.id), [1]);
  assert.deepEqual(buscarClientas(clientas, '98.765').map((c) => c.id), [2]);
  const muchas = Array.from({ length: 30 }, (_, i) => clienta(i + 1, `Clienta ${i}`));
  assert.equal(buscarClientas(muchas, '').length, 20);
});

test('"Pagó todo" en dólares cubre el total sin pasarse', () => {
  const monto = montoQueCubre(10, 'efectivo_usd', tasa);
  assert.equal(monto, 8.34);
  const abono = abonoEnBcv(monto, true, tasa);
  const tras = faltaTrasAbono(10, abono.bcv, margenDeAbono(true, tasa));
  assert.equal(tras.falta, 0);
  assert.equal(tras.pasa, false);
  assert.equal(montoQueCubre(10, 'pago_movil', tasa), 1000);
});

test('qué falta para seguir, paso por paso', () => {
  const resumen = { dias_credito: null, inicial_pct: 40 };
  const s = vacio();
  assert.equal(faltaParaSeguir(1, s, resumen, tasa, 0), 'Elige al menos una pieza.');
  s.carrito = new Map([[1, 1]]);
  assert.equal(faltaParaSeguir(1, s, resumen, tasa, 30), null);

  assert.equal(faltaParaSeguir(2, s, resumen, tasa, 30), 'Elige una de tus clientas o escribe una nueva.');
  s.nueva.telefono = '0412';
  assert.equal(faltaParaSeguir(2, s, resumen, tasa, 30), 'Falta su nombre.');
  s.nueva.nombre = 'Ana';
  assert.equal(faltaParaSeguir(2, s, resumen, tasa, 30), 'Falta su teléfono con el código, por ejemplo 0412 1234567.');
  s.nueva.telefono = '041212345';
  assert.equal(faltaParaSeguir(2, s, resumen, tasa, 30), 'Falta su teléfono con el código, por ejemplo 0412 1234567.');
  s.nueva.telefono = '0412 1234567';
  assert.equal(faltaParaSeguir(2, s, resumen, tasa, 30), null);

  assert.equal(faltaParaSeguir(3, s, resumen, tasa, 30), 'Elige si ya te pagó.');
  s.cobro = 'no';
  assert.equal(faltaParaSeguir(3, s, resumen, tasa, 30), null);
  s.cobro = 'todo';
  s.monto = '4000';
  assert.equal(faltaParaSeguir(3, s, resumen, tasa, 30), 'Es más que el total.');
  s.monto = '3000';
  assert.equal(faltaParaSeguir(3, s, resumen, tasa, 30), null);
  s.monto = '2000';
  assert.match(faltaParaSeguir(3, s, resumen, tasa, 30), /Es menos que el total/);
  s.monto = '';
  assert.equal(faltaParaSeguir(3, s, resumen, tasa, 30), 'Escribe cuánto te pagó.');
  s.cobro = 'parte';
  s.monto = '1000';
  assert.match(faltaParaSeguir(3, s, resumen, tasa, 30), /tiene que pagarte el total/);
  assert.match(faltaParaSeguir(3, s, { dias_credito: 7, inicial_pct: 40 }, tasa, 30), /al menos \$12,00\sBCV/);
  s.monto = '1200';
  assert.equal(faltaParaSeguir(3, s, { dias_credito: 7, inicial_pct: 40 }, tasa, 30), null);
});

test('una clienta elegida sin teléfono pide el teléfono', () => {
  const s = vacio();
  s.carrito = new Map([[1, 1]]);
  s.clientaId = 5;
  const resumen = { dias_credito: null, inicial_pct: 40 };
  assert.equal(
    faltaParaSeguir(2, s, resumen, tasa, 30, clienta(5, 'Ana')),
    'Falta su teléfono con el código, por ejemplo 0412 1234567.',
  );
  assert.equal(faltaParaSeguir(2, s, resumen, tasa, 30, clienta(5, 'Ana', { telefono: '04121234567' })), null);
  s.nueva.telefono = '04121234567';
  assert.equal(faltaParaSeguir(2, s, resumen, tasa, 30, clienta(5, 'Ana')), null);
});

test('el monto puesto en el campo se lee igual', async () => {
  const { cifraParaCampo } = await import('../../src/paginas/revendedor/panel/vender/cuentas.ts');
  const { leerCifra } = await import('../../src/lib/dinero.ts');
  assert.equal(cifraParaCampo(1104.5), '1104,50');
  assert.equal(leerCifra(cifraParaCampo(1104.5)), 1104.5);
  assert.equal(leerCifra(cifraParaCampo(8.34)), 8.34);
});
