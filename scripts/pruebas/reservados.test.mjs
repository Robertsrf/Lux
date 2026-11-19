import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { USUARIOS_RESERVADOS } from '../../src/lib/dominio.ts';

/*
  Los nombres reservados viven dos veces: en la base (usuario_rv_valido,
  esquema-dominio.sql), que manda, y en el navegador (lib/dominio.ts), que
  avisa antes de guardar. Si alguien cambia una sin la otra, esto falla.
*/
test('la lista de reservados de la base es la del navegador', () => {
  const sql = readFileSync(new URL('../../esquema-dominio.sql', import.meta.url), 'utf8');
  const linea = sql.split(/\r?\n/).find((l) => l.includes('-- RESERVADOS'));
  assert.ok(linea, 'esquema-dominio.sql no tiene la línea marcada con -- RESERVADOS');
  const enLaBase = [...linea.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(enLaBase, [...USUARIOS_RESERVADOS]);
});
