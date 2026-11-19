import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveDeSugerencia, grupoTrasSugerencia } from '../../src/lib/grupoSugerido.ts';
import { leerCifra } from '../../src/lib/dinero.ts';

// Lo que llega de admin_sugerir_precio, solo lo que mira la regla.
const sug = (grupo_id, escalera = 'pieza') => ({ grupo_id, escalera });
const estado = (cambios = {}) => ({
  grupo: '', quien: 'maquina', tipoCambiado: false, escalera: 'pieza',
  costo: 12.5, hayPrecioPropio: false, alDia: true, ...cambios,
});

test('la maquina sigue al costo: G3, luego G5, luego G3 otra vez', () => {
  let e = estado();
  let r = grupoTrasSugerencia(sug(3), e);
  assert.deepEqual(r, { grupo: '3', quien: 'maquina' });
  e = estado({ grupo: r.grupo, quien: r.quien });
  r = grupoTrasSugerencia(sug(5), e);
  assert.deepEqual(r, { grupo: '5', quien: 'maquina' });
  e = estado({ grupo: r.grupo, quien: r.quien });
  r = grupoTrasSugerencia(sug(3), e);
  assert.deepEqual(r, { grupo: '3', quien: 'maquina' });
});

test('el grupo que eligio el dueno no se mueve', () => {
  assert.deepEqual(grupoTrasSugerencia(sug(5), estado({ grupo: '3', quien: 'dueno' })), { grupo: '3', quien: 'dueno' });
});

test('"Sin grupo" elegido por el dueno tampoco se rellena', () => {
  assert.deepEqual(grupoTrasSugerencia(sug(5), estado({ grupo: '', quien: 'dueno' })), { grupo: '', quien: 'dueno' });
});

test('una sugerencia de la otra escalera no toca nada', () => {
  assert.equal(grupoTrasSugerencia(sug(5, 'pieza'), estado({ escalera: 'dije', grupo: '3' })), null);
  // Sin escalera en la respuesta (base de antes del #60) es la de las piezas.
  assert.equal(grupoTrasSugerencia({ grupo_id: 5 }, estado({ escalera: 'dije' })), null);
});

test('cambiar el tipo reemplaza el grupo del dueno y lo pasa a la maquina', () => {
  const e = estado({ grupo: '3', quien: 'dueno', tipoCambiado: true, escalera: 'dije' });
  assert.deepEqual(grupoTrasSugerencia(sug(40, 'dije'), e), { grupo: '40', quien: 'maquina' });
});

test('cambiar el tipo sin grupo en la escalera nueva conserva el de antes', () => {
  const e = estado({ grupo: '3', quien: 'dueno', tipoCambiado: true, escalera: 'dije' });
  assert.deepEqual(grupoTrasSugerencia(sug(null, 'dije'), e), { grupo: '3', quien: 'maquina' });
});

test('cambiar el tipo con precio propio no cambia el grupo', () => {
  const e = estado({ grupo: '3', quien: 'dueno', tipoCambiado: true, escalera: 'dije', hayPrecioPropio: true });
  assert.deepEqual(grupoTrasSugerencia(sug(40, 'dije'), e), { grupo: '3', quien: 'maquina' });
});

test('con precio propio la maquina no mueve el grupo', () => {
  assert.deepEqual(grupoTrasSugerencia(sug(5), estado({ grupo: '3', hayPrecioPropio: true })), { grupo: '3', quien: 'maquina' });
});

test('con costo cero la maquina no asigna', () => {
  assert.deepEqual(grupoTrasSugerencia(sug(1), estado({ costo: 0 })), { grupo: '', quien: 'maquina' });
});

test('sin grupo sugerido la maquina deja el que hay', () => {
  assert.deepEqual(grupoTrasSugerencia(sug(null), estado({ grupo: '3' })), { grupo: '3', quien: 'maquina' });
});

test('el precio propio se lee como el resto del sistema', () => {
  assert.equal(leerCifra('12,5'), 12.5);
  assert.equal(leerCifra('12.50'), 12.5);
  assert.equal(leerCifra('1.500,50'), 1500.5);
  assert.equal(leerCifra('12,5,0'), null);
  assert.equal(leerCifra('0'), null);
});

test("una sugerencia de otro costo no se aplica: se espera la del costo escrito", () => {
  assert.equal(grupoTrasSugerencia(sug(5), estado({ alDia: false })), null);
  // Tampoco cierra un cambio de tipo: ese espera la suya.
  assert.equal(grupoTrasSugerencia(sug(40, "dije"), estado({ alDia: false, tipoCambiado: true, escalera: "dije" })), null);
});

test("la clave de una sugerencia es la de lo escrito", () => {
  assert.equal(claveDeSugerencia("7", "12.50", "", false), claveDeSugerencia("7", "12.5", "", false));
  assert.equal(claveDeSugerencia("", "", "", false), claveDeSugerencia("", "0", "", false));
  assert.notEqual(claveDeSugerencia("7", "12.5", "", false), claveDeSugerencia("7", "1", "", false));
  assert.notEqual(claveDeSugerencia("7", "12.5", "", false), claveDeSugerencia("7", "12.5", "", true));
  assert.notEqual(claveDeSugerencia("7", "12.5", "", false), claveDeSugerencia("8", "12.5", "", false));
  assert.notEqual(claveDeSugerencia("7", "12.5", "", false), claveDeSugerencia("7", "12.5", "50", false));
});
