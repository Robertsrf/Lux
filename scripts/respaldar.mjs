#!/usr/bin/env node
/**
 * Respaldo completo de Lux by Emory, por HTTPS.
 *
 * El plan gratuito de Supabase no deja descargar respaldos y `pg_dump`
 * necesita el puerto 5432, que esta red bloquea. Esto saca los datos por el
 * mismo camino que usa la aplicación, que es el único que pasa.
 *
 *   node scripts/respaldar.mjs             datos y esquema
 *   node scripts/respaldar.mjs --fotos     además descarga las fotos
 *
 * DÓNDE ESCRIBE, Y POR QUÉ AHÍ
 * En una carpeta HERMANA del proyecto, nunca dentro. El repositorio es
 * público: un respaldo lleva cédulas y teléfonos de clientas, costos y
 * márgenes. Fuera del repositorio no hay forma de subirlo por descuido.
 *
 * LO QUE NO HACE
 * No restaura. Restaurar es una operación que borra, y esa se piensa el día
 * que haga falta, mirando el respaldo, no automatizada de antemano.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DESTINO = path.resolve(RAIZ, '..', 'Respaldos Lux');

/** Las que se leen directo. */
const TABLAS = [
  'configuracion', 'consejos', 'conteo_detalle', 'conteos', 'existencias',
  'frases', 'frases_categorias', 'grupos_precio', 'inversiones', 'kit_items',
  'kits', 'perfiles', 'reserva_items', 'reservas', 'tasas', 'textos',
  'tramos_mayoreo', 'ubicaciones', 'ventas',
];

/** Las revocadas: van por admin_respaldo(), que sí trae las filas retiradas. */
const POR_FUNCION = ['modelos', 'lotes', 'venta_items'];

function leerEnv() {
  const f = path.join(RAIZ, '.env');
  if (!fs.existsSync(f)) {
    console.error('No encuentro .env. Copia .env.example y rellenalo.');
    process.exit(1);
  }
  const env = {};
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = l.indexOf('=');
    if (i > 0 && !l.trimStart().startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return env;
}

/** Pide el codigo sin dibujarlo en pantalla: queda gente mirando la tienda. */
function pedirCodigo() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const alEscribir = (c) => { if (c !== '\r' && c !== '\n') rl.output.write('*'); };
    rl.output.write('Codigo de administrador: ');
    rl.input.on('data', alEscribir);
    rl.question('', (res) => {
      rl.input.off('data', alEscribir);
      rl.output.write('\n');
      rl.close();
      resolve(res.trim());
    });
  });
}

const kb = (n) => (n / 1024).toFixed(0) + ' KB';

async function main() {
  const arranque = Date.now();
  const conFotos = process.argv.includes('--fotos');
  const env = leerEnv();
  const codigo = process.env.LUX_ADMIN || await pedirCodigo();

  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { error: eAuth } = await db.auth.signInWithPassword({
    email: 'admin@lux.local', password: codigo,
  });
  if (eAuth) {
    console.error('\nNo entro: ' + eAuth.message);
    process.exit(1);
  }

  // La fecha va en el nombre para poder ordenarlos y saber cual es cual.
  const ahora = new Date();
  const sello = ahora.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const carpeta = path.join(DESTINO, sello);
  fs.mkdirSync(path.join(carpeta, 'datos'), { recursive: true });

  console.log('\nRespaldo en  ' + carpeta + '\n');
  let filasTotal = 0, bytes = 0;
  const resumen = {};
  const fallos = [];

  const guardar = (nombre, filas) => {
    const j = JSON.stringify(filas, null, 1);
    const f = path.join(carpeta, 'datos', nombre + '.json');
    fs.writeFileSync(f, j);
    filasTotal += filas.length;
    bytes += Buffer.byteLength(j);
    resumen[nombre] = filas.length;
    console.log('  ' + nombre.padEnd(20) + String(filas.length).padStart(6) + ' filas');
  };

  for (const t of TABLAS) {
    const { data, error } = await db.from(t).select('*');
    if (error) { fallos.push(t + ': ' + error.message); console.log('  ' + t.padEnd(20) + '   FALLO'); continue; }
    guardar(t, data ?? []);
  }

  for (const t of POR_FUNCION) {
    const { data, error } = await db.rpc('admin_respaldo', { p_tabla: t });
    if (error) { fallos.push(t + ': ' + error.message); console.log('  ' + t.padEnd(20) + '   FALLO'); continue; }
    guardar(t, data ?? []);
  }

  // El esquema, para poder reconstruir la base y no solo repoblarla.
  const esquema = {};
  for (const [k, rpc] of [['tablas', 'admin_esquema_tablas'], ['vistas', 'admin_esquema_vistas'], ['permisos', 'admin_esquema_permisos']]) {
    const { data, error } = await db.rpc(rpc);
    if (error) fallos.push(k + ': ' + error.message); else esquema[k] = data;
  }
  const primera = await db.rpc('admin_esquema_funciones', { p_desde: 0, p_cuantas: 1 });
  if (!primera.error) {
    esquema.funciones = [];
    for (let d = 0; d < primera.data.total; d += 20) {
      const r = await db.rpc('admin_esquema_funciones', { p_desde: d, p_cuantas: 20 });
      if (!r.error) esquema.funciones.push(...r.data.funciones);
    }
  }
  const je = JSON.stringify(esquema, null, 1);
  fs.writeFileSync(path.join(carpeta, 'esquema.json'), je);
  bytes += Buffer.byteLength(je);
  console.log('\n  esquema.json         ' + (esquema.tablas?.length ?? 0) + ' tablas, '
    + (esquema.vistas?.length ?? 0) + ' vistas, ' + (esquema.funciones?.length ?? 0) + ' funciones');

  // Las fotos viven en Storage, no en ninguna tabla: sin ellas el respaldo
  // repuebla el inventario pero deja el catalogo mudo.
  let fotos = 0;
  if (conFotos) {
    console.log('\n  descargando fotos...');
    fs.mkdirSync(path.join(carpeta, 'fotos'), { recursive: true });
    const { data: carpetas } = await db.storage.from('fotos').list('modelos', { limit: 2000 });
    const total = (carpetas ?? []).length;
    let hechas = 0;
    for (const c of carpetas ?? []) {
      const { data: archivos } = await db.storage.from('fotos').list('modelos/' + c.name, { limit: 100 });
      for (const a of archivos ?? []) {
        const ruta = 'modelos/' + c.name + '/' + a.name;
        const { data: blob, error } = await db.storage.from('fotos').download(ruta);
        if (error) { fallos.push(ruta + ': ' + error.message); continue; }
        const destino = path.join(carpeta, 'fotos', c.name);
        fs.mkdirSync(destino, { recursive: true });
        const buf = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(path.join(destino, a.name), buf);
        bytes += buf.length;
        fotos++;
      }
      hechas++;
      const barra = '#'.repeat(Math.round(hechas / total * 20)).padEnd(20, '.');
      process.stdout.write('\r  [' + barra + '] ' + hechas + '/' + total
        + ' modelos · ' + fotos + ' fotos   ');
    }
    console.log('');
  }

  fs.writeFileSync(path.join(carpeta, 'LEEME.txt'),
    'Respaldo de Lux by Emory\n'
    + 'Sacado el ' + ahora.toLocaleString('es-VE') + '\n\n'
    + 'datos/       una tabla por archivo, en JSON\n'
    + 'esquema.json tablas, vistas, funciones y permisos\n'
    + (conFotos ? 'fotos/       las fotos del catalogo\n' : 'fotos/       NO INCLUIDAS. Corre con --fotos para traerlas.\n')
    + '\nCONTIENE DATOS PERSONALES DE CLIENTAS Y TUS COSTOS.\n'
    + 'No lo subas a ningun repositorio ni lo compartas.\n'
    + '\nFilas por tabla:\n'
    + Object.entries(resumen).map(([k, v]) => '  ' + k.padEnd(20) + v).join('\n') + '\n'
    + (fallos.length ? '\nFALLOS:\n  ' + fallos.join('\n  ') + '\n' : ''));

  const seg = Math.round((Date.now() - arranque) / 1000);
  console.log('\n' + filasTotal + ' filas' + (conFotos ? ', ' + fotos + ' fotos' : '')
    + ', ' + kb(bytes) + ', en ' + (seg < 60 ? seg + ' s' : Math.floor(seg / 60) + ' min ' + (seg % 60) + ' s'));
  if (fallos.length) {
    console.log('\nCON ' + fallos.length + ' FALLO(S) — el respaldo esta INCOMPLETO:');
    for (const f of fallos) console.log('  ' + f);
    process.exit(1);
  }
  console.log('Respaldo completo.');
  if (!conFotos) console.log('Sin las fotos. Para incluirlas: node scripts/respaldar.mjs --fotos');
}

main().catch((e) => { console.error('\n' + e.message); process.exit(1); });
