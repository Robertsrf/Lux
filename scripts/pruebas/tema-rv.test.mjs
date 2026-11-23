import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANTILLAS, TEMAS_LISTOS, avisoContraste, contraste, elegirPortada, normalizarTema, temaResuelto, variablesCss,
} from '../../src/paginas/revendedor/catalogo/tema.ts';

// El catálogo del revendedor (#73, fase 6): él elige sus colores, y el
// texto tiene que leerse a 4,5:1 con cualquiera, al sol y en un teléfono
// barato. La garantía está al dibujar, no solo en el panel.

const cerca = (a, b, d = 0.02) => Math.abs(a - b) <= d;

test('el contraste es el de WCAG', () => {
  assert.ok(cerca(contraste('#000000', '#FFFFFF'), 21, 0.01));
  assert.ok(cerca(contraste('#777777', '#FFFFFF'), 4.48));
  assert.ok(cerca(contraste('#ffffff', '#000000'), 21, 0.01), 'el orden no importa, ni las minúsculas');
});

function todoSeLee(colores, etiqueta) {
  const pares = [
    ['texto', 'fondo'], ['textoSuave', 'fondo'], ['texto', 'superficie'], ['textoSuave', 'superficie'],
    ['sobreBoton', 'boton'], ['acento', 'fondo'], ['acento', 'superficie'],
  ];
  for (const [a, b] of pares) {
    const r = contraste(colores[a], colores[b]);
    assert.ok(r >= 4.5, `${etiqueta}: ${a} sobre ${b} da ${r.toFixed(2)} (${colores[a]} / ${colores[b]})`);
  }
  for (const v of Object.values(colores)) assert.match(v, /^#[0-9A-F]{6}$/);
}

test('los seis temas listos se leen en las tres plantillas', () => {
  for (const listo of TEMAS_LISTOS) {
    for (const p of PLANTILLAS) {
      const t = temaResuelto({ plantilla: p.id, principal: listo.principal, fondo: listo.fondo }, null);
      todoSeLee(t.colores, `${listo.nombre} en ${p.nombre}`);
    }
  }
});

test('los colores feos también se leen', () => {
  const feos = [
    { principal: '#F7C948', fondo: '#FFFFFF' },   // amarillo sobre blanco
    { principal: '#808080', fondo: '#808080' },   // gris sobre gris
    { principal: '#000000', fondo: '#000000' },   // negro sobre negro
    { principal: '#FFFFFF', fondo: '#FFFFFF' },   // blanco sobre blanco
    { principal: '#2B3FD1', fondo: '#111111' },   // la Tienda con fondo oscuro
    { principal: '#FF00FF', fondo: '#00FF00' },
    { principal: '#777777', fondo: '#767676' },
  ];
  for (const f of feos) {
    for (const p of PLANTILLAS) todoSeLee(temaResuelto({ ...f, plantilla: p.id }, null).colores, `${f.principal}/${f.fondo} en ${p.id}`);
  }
});

test('el panel avisa del amarillo y no del cobalto', () => {
  const amarillo = avisoContraste('#F7C948', '#FFFFFF');
  assert.ok(amarillo.razon < 2, `razón ${amarillo.razon}`);
  assert.notEqual(amarillo.ajustado, null);
  assert.ok(contraste(amarillo.ajustado, '#FFFFFF') >= 4.5);
  const cobalto = avisoContraste('#2B3FD1', '#FFFFFF');
  assert.equal(cobalto.ajustado, null);
});

test('sin tema sale su paleta, en la plantilla Tienda', () => {
  const t = temaResuelto(null, 'vino');
  assert.equal(t.plantilla, 'tienda');
  assert.equal(t.letra, 'moderna');
  assert.equal(t.esquinas, 'suaves');
  const vino = TEMAS_LISTOS.find((x) => x.id === 'vino');
  assert.equal(t.colores.fondo, vino.fondo.toUpperCase());
  todoSeLee(t.colores, 'vino sin tema');
  const lux = temaResuelto(undefined, undefined);
  assert.equal(lux.plantilla, 'tienda');
  todoSeLee(lux.colores, 'sin nada');
});

test('lo que falta sale de la plantilla', () => {
  const t = temaResuelto({ plantilla: 'lookbook' }, 'noche');
  assert.equal(t.letra, 'clasica');
  assert.equal(t.esquinas, 'redondas');
  assert.ok(contraste(t.colores.fondo, '#000000') < 2, 'el Lookbook sin fondo propio es oscuro');
  const e = temaResuelto({ plantilla: 'editorial', letra: 'amable', frase: 'Hola' }, null);
  assert.equal(e.letra, 'amable');
  assert.equal(e.esquinas, 'rectas');
  assert.equal(e.frase, 'Hola');
});

test('normalizar tira lo que no sirve y guarda lo que sí', () => {
  assert.deepEqual(normalizarTema({ plantilla: 'x', principal: 'red', frase: 'a'.repeat(91), extra: 1 }), {});
  assert.deepEqual(normalizarTema(null), {});
  assert.deepEqual(normalizarTema('tienda'), {});
  assert.deepEqual(normalizarTema([1]), {});
  assert.deepEqual(
    normalizarTema({ plantilla: 'lookbook', principal: '#aabbcc', fondo: '#000000', letra: 'revista', esquinas: 'rectas', portada: 12, frase: 'Brillo', otra: 2 }),
    { plantilla: 'lookbook', principal: '#AABBCC', fondo: '#000000', letra: 'revista', esquinas: 'rectas', portada: 12, frase: 'Brillo' },
  );
  assert.deepEqual(normalizarTema({ portada: -3, frase: 'uno\ndos', principal: '#abc;}body{' }), {});
  // Los invisibles que la base también rechaza (revisión de seguridad del 23/11/2026).
  assert.deepEqual(normalizarTema({ frase: 'hola​mundo' }), {});
  assert.deepEqual(normalizarTema({ frase: '‮odnum' }), {});
  assert.deepEqual(normalizarTema({ portada: 1.5 }), {});
  assert.deepEqual(normalizarTema({ frase: 'Joyas ✨ con ñ' }), { frase: 'Joyas ✨ con ñ' });
});

test('las variables de CSS solo llevan colores y medidas', () => {
  const v = variablesCss(temaResuelto({ plantilla: 'editorial', principal: '#7A1E3A' }, null));
  for (const [k, valor] of Object.entries(v)) {
    assert.match(k, /^--rvc-/);
    assert.doesNotMatch(valor, /[;{}<>]/);
  }
  assert.equal(v['--rvc-radio'], '0');
  assert.equal(variablesCss(temaResuelto({ esquinas: 'redondas' }, null))['--rvc-radio-boton'], '999px');
});

test('la portada: la elegida si está, otra con foto si no, la misma durante la visita', () => {
  const piezas = [
    { id: 1, foto_path: 'a.webp' }, { id: 2, foto_path: null }, { id: 3, foto_path: 'c.webp' }, { id: 4, foto_path: 'd.webp' },
  ];
  assert.equal(elegirPortada(piezas, 3, 7)?.id, 3);
  const otra = elegirPortada(piezas, 99, 7);
  assert.ok(otra && otra.foto_path);
  assert.equal(elegirPortada(piezas, 99, 7)?.id, otra.id, 'misma semilla, misma pieza');
  const sinFoto = elegirPortada(piezas, 2, 7);
  assert.ok(sinFoto && sinFoto.foto_path, 'la elegida sin foto no sirve de portada');
  assert.equal(elegirPortada([{ id: 1, foto_path: null }], null, 1), null);
  assert.equal(elegirPortada([], 5, 1), null);
});
