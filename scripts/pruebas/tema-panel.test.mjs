import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMAS_LISTOS, contraste, mezclar, temaResuelto } from '../../src/paginas/revendedor/catalogo/tema.ts';
import { tokensDelPanel } from '../../src/paginas/revendedor/panel/temaPanel.ts';

// El panel del revendedor se viste con el tema de su catálogo (fase 7): los
// tokens de Lux que usan el Armazón, las Piezas y las tablas salen de sus
// colores, y todo lo que se lee tiene que leerse a 4,5:1 con cualquiera.

function seLee(tk, etiqueta) {
  const pares = [
    ['--texto', '--papel'], ['--texto', '--blanco'], ['--texto', '--panel'], ['--texto', '--panel-hondo'],
    ['--texto', '--crema'], ['--texto', '--verde-suave'],
    ['--texto-secundario', '--papel'], ['--texto-secundario', '--blanco'], ['--texto-secundario', '--panel'],
    ['--texto-secundario', '--panel-hondo'], ['--texto-secundario', '--crema'],
    ['--oro-texto', '--papel'], ['--oro-texto', '--blanco'], ['--verde-profundo', '--papel'], ['--verde-profundo', '--blanco'],
    ['--error', '--papel'], ['--error', '--blanco'], ['--exito', '--papel'], ['--exito', '--blanco'],
    ['--alerta-texto', '--papel'], ['--alerta-texto', '--blanco'],
    // La barra y el botón principal: lo que va encima del ancla.
    ['--crema', '--verde-profundo'], ['--texto-sobre-verde', '--verde-profundo'], ['--oro-arena', '--verde-profundo'],
    ['--tinta', '--oro-arena'], ['--crema', '--tinta'],
  ];
  for (const [a, b] of pares) {
    const r = contraste(tk[a], tk[b]);
    assert.ok(r >= 4.5, `${etiqueta}: ${a} sobre ${b} da ${r.toFixed(2)} (${tk[a]} / ${tk[b]})`);
  }
  // El texto más suave de la barra: crema al 62 % sobre el ancla.
  const suave = mezclar(tk['--crema'], tk['--verde-profundo'], 0.38);
  assert.ok(contraste(suave, tk['--verde-profundo']) >= 4.5, `${etiqueta}: crema al 62 % sobre el ancla`);
  // La sección activa de la barra de abajo (fase 9): oro sobre el ancla
  // llevada hacia la tinta (--verde-hondo de base.css).
  const hondo = mezclar(tk['--verde-profundo'], tk['--tinta'], 0.7);
  assert.ok(contraste(tk['--oro-arena'], hondo) >= 4.5, `${etiqueta}: oro sobre la sección activa (${tk['--oro-arena']} / ${hondo})`);
  // Los bordes de los campos se ven (3:1).
  assert.ok(contraste(tk['--salvia'], tk['--blanco']) >= 3, `${etiqueta}: salvia sobre blanco`);
  for (const [k, v] of Object.entries(tk)) {
    assert.match(k, /^--/);
    if (/^#/.test(v)) assert.match(v, /^#[0-9A-F]{6}$/, `${etiqueta}: ${k} = ${v}`);
  }
}

test('los seis temas listos y los dos de más se leen en el panel', () => {
  for (const t of TEMAS_LISTOS) {
    seLee(tokensDelPanel(temaResuelto({ principal: t.principal, fondo: t.fondo }, null)), t.id);
  }
});

test('sin tema, el panel sale con los colores de su paleta', () => {
  for (const p of ['lux', 'noche', 'vino', 'grafito', 'ciruela', 'oliva']) {
    seLee(tokensDelPanel(temaResuelto(null, p)), `paleta ${p}`);
  }
});

test('un color feo también se lee: amarillo claro sobre blanco, rosa sobre negro', () => {
  seLee(tokensDelPanel(temaResuelto({ principal: '#FFE600', fondo: '#FFFFFF' }, null)), 'amarillo');
  seLee(tokensDelPanel(temaResuelto({ principal: '#FF66CC', fondo: '#111111' }, null)), 'rosa');
  seLee(tokensDelPanel(temaResuelto({ principal: '#777777', fondo: '#808080' }, null)), 'gris sobre gris');
});

test('trae la letra, las esquinas y las variables de su catálogo', () => {
  const tk = tokensDelPanel(temaResuelto({ letra: 'elegante', esquinas: 'rectas' }, 'lux'));
  assert.match(tk['--fuente-display'], /Bodoni/);
  assert.equal(tk['--radio'], '0');
  assert.ok(tk['--rvc-fondo']);
});
