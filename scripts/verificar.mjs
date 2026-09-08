#!/usr/bin/env node
/**
 * Lux by Emory — comprobar que las puertas siguen cerradas.
 *
 *   npm run verificar
 *
 * POR QUÉ EXISTE
 * La regla que manda en este sistema es una sola: la vendedora no puede ver
 * un número de costo, y no basta con esconderlo de la pantalla — no debe
 * poder sacarlo ni consultando la base directamente.
 *
 * Esa regla la sostienen cosas que no se ven al programar: un `revoke` en
 * una función, un `where es_admin()` dentro de una vista, un `having` en vez
 * de un `where`. Nada de eso lo protege el compilador. Se rompen en silencio
 * y no te enteras hasta que ya se enteró otro.
 *
 * Durante la auditoría comprobé todo esto a mano, con scripts que borré. Eso
 * era el error: la comprobación valía más que el hallazgo. Aquí queda.
 *
 * CUÁNDO CORRERLO
 * Después de tocar una vista, un permiso, una función o una política. Y antes
 * de publicar. Tarda unos segundos y no escribe nada: son todo lecturas.
 *
 * QUÉ NO HACE
 * No registra una venta de prueba. Eso escribiría en producción, y una
 * comprobación que ensucia los datos que vigila no sirve. Lo que sí hace es
 * mirar `precio_minimo_de`, que por dentro llama a una función revocada: si
 * esa responde, la mecánica que necesita `registrar_venta` para cobrar está
 * sana.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const RAIZ = path.resolve(import.meta.dirname, '..');

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

/** Sin dibujarlo en pantalla: esto se corre con gente alrededor. */
function pedir(etiqueta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const alEscribir = (c) => { if (c !== '\r' && c !== '\n') rl.output.write('*'); };
    rl.output.write(etiqueta);
    rl.input.on('data', alEscribir);
    rl.question('', (res) => {
      rl.input.off('data', alEscribir);
      rl.output.write('\n');
      rl.close();
      resolve(res.trim());
    });
  });
}

const env = leerEnv();
const cliente = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

let fallos = 0;
const dice = (bien, etiqueta, detalle) => {
  if (!bien) fallos++;
  console.log('  ' + (bien ? '  ok  ' : ' MAL  ') + etiqueta.padEnd(44) + (detalle ?? ''));
};

async function entrar(correo, clave, quien) {
  const db = cliente();
  const { error } = await db.auth.signInWithPassword({ email: correo, password: clave });
  if (error) {
    console.error('\nNo entro como ' + quien + ': ' + error.message);
    process.exit(1);
  }
  return db;
}

/** Las vistas que llevan costo dentro. Ninguna puede darle una fila a ella. */
const VISTAS_DE_COSTO = [
  'v_catalogo_admin', 'v_valor_inventario', 'v_valor_por_categoria', 'v_recuperacion',
  'v_gastos_desglose', 'v_diagnostico', 'v_margen_ventas', 'v_rotacion_modelo',
  'v_lotes_admin', 'v_capex_lote', 'v_ventas_por_dia', 'v_mezcla_grupo',
  'v_cobertura_mes', 'v_equilibrio', 'v_volumen', 'v_descuentos_mostrador',
];

/** Funciones que revelan costo. Tienen que rechazarla. */
const FUNCIONES_CERRADAS = [
  ['costo_operativo_por_pieza', {}],
  ['costo_total_bcv', { p_costo_puesto_usd: 1 }],
  ['calcular_flete_unitario', { p_lote_id: 1 }],
  ['gastos_fijos_mes_bcv', {}],
];

async function main() {
  const codigoAdmin = process.env.LUX_ADMIN || await pedir('Codigo de administrador: ');
  const pinVend = process.env.LUX_VEND || await pedir('Codigo de la vendedora:  ');

  const V = await entrar('vendedora@lux.local', pinVend, 'vendedora');
  const A = await entrar('admin@lux.local', codigoAdmin, 'administrador');
  const P = cliente();

  console.log('\nLA VENDEDORA NO VE COSTOS');
  for (const [fn, args] of FUNCIONES_CERRADAS) {
    const { data, error } = await V.rpc(fn, args);
    dice(!!error, fn + '()', error ? 'rechazada ' + error.code : 'RESPONDIO ' + JSON.stringify(data));
  }
  const envoltura = await V.rpc('costo_operativo_admin');
  dice(envoltura.data === null, 'costo_operativo_admin() le da null',
    envoltura.error ? 'error ' + envoltura.error.code : JSON.stringify(envoltura.data));
  for (const v of VISTAS_DE_COSTO) {
    const { data, error } = await V.from(v).select('*').limit(1);
    dice(!error && (data?.length ?? 0) === 0, v, error ? 'ERROR ' + error.code : (data?.length ?? 0) + ' filas');
  }
  const tablas = await V.from('modelos').select('costo_unitario_usd').limit(1);
  dice(!!tablas.error, 'la tabla modelos, en crudo', tablas.error ? 'rechazada ' + tablas.error.code : 'RESPONDIO');

  console.log('\nLA VENDEDORA SI PUEDE TRABAJAR');
  const cv = await V.from('v_catalogo_venta').select('id, precio_usd, precio_minimo_usd').limit(5);
  const conPiso = (cv.data ?? []).filter((r) => r.precio_minimo_usd !== null).length;
  // Esta es la importante: precio_minimo_de() llama por dentro a
  // costo_total_bcv(), que ella no puede ejecutar. Si responde, una funcion
  // de definidor si puede llamar a otra revocada, que es lo que necesita
  // registrar_venta para cobrar.
  dice(!cv.error && conPiso > 0, 'v_catalogo_venta con su piso de regateo',
    cv.error ? 'ERROR ' + cv.error.code : conPiso + ' de ' + (cv.data?.length ?? 0));
  const vu = await V.from('v_venta_ubicacion').select('modelo_id').limit(1);
  dice(!vu.error && (vu.data?.length ?? 0) > 0, 'v_venta_ubicacion, su mostrador',
    vu.error ? 'ERROR ' + vu.error.code : 'con piezas');
  const tab = await V.from('v_tablero_dia').select('*').limit(1);
  dice(!tab.error, 'v_tablero_dia, su dia', tab.error ? 'ERROR ' + tab.error.code : 'responde');

  console.log('\nEL ADMINISTRADOR SI VE LO SUYO');
  const oa = await A.rpc('costo_operativo_admin');
  dice(!oa.error && Number(oa.data) > 0, 'costo_operativo_admin() le da el numero',
    oa.error ? 'error ' + oa.error.code : String(oa.data));
  for (const v of ['v_catalogo_admin', 'v_valor_inventario', 'v_recuperacion', 'v_gastos_desglose', 'v_diagnostico']) {
    const { data, error } = await A.from(v).select('*').limit(1);
    dice(!error && (data?.length ?? 0) > 0, v, error ? 'ERROR ' + error.code : 'con datos');
  }

  console.log('\nLA CLIENTA VE EL CATALOGO Y NADA MAS');
  const pub = await P.from('v_disponible_publico').select('id, precio_usd').limit(1);
  dice(!pub.error && (pub.data?.length ?? 0) > 0, 'v_disponible_publico sin sesion',
    pub.error ? 'ERROR ' + pub.error.code : 'con piezas');
  const cat = await P.rpc('categorias_publicas');
  dice(!cat.error && (cat.data?.length ?? 0) > 0, 'categorias_publicas() sin sesion',
    cat.error ? 'ERROR ' + cat.error.code : (cat.data?.length ?? 0) + ' categorias');
  // Lo que importa es que no le llegue ni una fila. Hay dos formas de
  // conseguirlo y las dos valen: que el permiso la rechace de entrada, o
  // que la vista la deje pasar y no le de nada. La primera es mas fuerte
  // —ni siquiera llega a ejecutarse la consulta— y es la que hay hoy.
  for (const v of ['v_catalogo_admin', 'v_catalogo_venta', 'v_diagnostico']) {
    const { data, error } = await P.from(v).select('*').limit(1);
    dice(!!error || (data?.length ?? 0) === 0, v + ' sin sesion',
      error ? 'rechazada ' + error.code : (data?.length ?? 0) + ' filas');
  }
  const fuga = await P.from('v_disponible_publico').select('costo_puesto_usd').limit(1);
  dice(!!fuga.error, 'ninguna columna de costo en lo publico',
    fuga.error ? 'no existe la columna' : 'LA COLUMNA ESTA AHI');

  console.log('');
  if (fallos) {
    console.log(fallos + ' COMPROBACION(ES) MAL. No publiques hasta entender por que.');
    process.exit(1);
  }
  console.log('Todo cerrado. ' + 0 + ' fallos.');
}

main().catch((e) => { console.error('\n' + e.message); process.exit(1); });
