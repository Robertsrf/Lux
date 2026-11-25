import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contraste, mezclar } from '../../src/paginas/revendedor/catalogo/tema.ts';

// El estilo Estuche del administrativo (fase 9): cada par de texto nuevo,
// medido contra el fondo donde cae (regla 5). Los colores salen de
// tokens.css y de base.css, no se copian aquí.

const tokens = readFileSync(new URL('../../src/estilos/tokens.css', import.meta.url), 'utf8');
const base = readFileSync(new URL('../../src/estilos/base.css', import.meta.url), 'utf8');
const tk = (n) => {
  const m = tokens.match(new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `falta --${n} en tokens.css`);
  return m[1];
};
// base.css declara las mezclas que usa el Estuche: que sigan siendo esas.
const declara = (n, re) => assert.match(base, re, `base.css: --${n} cambió; mide otra vez`);
const seLee = (texto, fondo, que) => {
  const r = contraste(texto, fondo);
  assert.ok(r >= 4.5, `${que}: ${r.toFixed(2)} (${texto} sobre ${fondo})`);
};

const verde = tk('verde-profundo'), crema = tk('crema'), oro = tk('oro-arena');
// Lo activo sobre el verde (la barra, los cuadritos de la Banda): el verde
// llevado hacia la tinta. Aclararlo con crema bajaba el oro a 4,13.
const hondo = mezclar(verde, tk('tinta'), 0.7);
declara('verde-hondo', /--verde-hondo:\s*color-mix\(in srgb, var\(--tinta\) 70%, var\(--verde-profundo\)\)/);
declara('urgente-fondo', /--urgente-fondo:\s*color-mix\(in srgb, var\(--error\) 10%, var\(--blanco\)\)/);

test('la Banda: crema y oro sobre el verde, y crema sobre sus cuadritos', () => {
  seLee(crema, verde, 'cifra crema sobre la banda');
  seLee(oro, verde, 'etiqueta oro sobre la banda');
  seLee(crema, hondo, 'crema sobre un cuadrito');
  seLee(oro, hondo, 'oro sobre un cuadrito');
});

test('la barra de abajo y la lateral', () => {
  // Inactivas: crema al 72 % (lateral) y al 74 % (barra).
  seLee(mezclar(crema, verde, 0.28), verde, 'sección inactiva de la lateral');
  seLee(mezclar(crema, verde, 0.26), verde, 'sección inactiva de la barra');
  seLee(oro, hondo, 'sección activa de la barra');
  // Activa en la lateral y en la hoja: verde sobre la píldora crema.
  seLee(verde, crema, 'sección activa en píldora crema');
  seLee(tk('error'), tk('blanco'), 'aviso de vencidos en la píldora activa');
});

test('las tablas y las tarjetas', () => {
  seLee(tk('salvia-texto'), tk('panel'), 'cabecera de tabla sobre panel');
  seLee(tk('salvia-texto'), tk('blanco'), 'texto secundario en tarjeta');
  seLee(tk('verde-profundo'), tk('papel'), 'título sobre papel');
});

test('los cuadritos de "Para hoy"', () => {
  seLee(tk('error'), mezclar(tk('blanco'), tk('error'), 0.10), 'vencido sobre su cuadrito');
  seLee(tk('verde-profundo'), tk('verde-suave'), 'número sobre su cuadrito');
});
