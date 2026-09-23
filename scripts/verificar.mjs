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
  'v_plan_ventas',
];

/** Funciones que revelan costo. Tienen que rechazarla. */
const FUNCIONES_CERRADAS = [
  ['costo_operativo_por_pieza', {}],
  ['costo_total_bcv', { p_costo_puesto_usd: 1 }],
  ['calcular_flete_unitario', { p_lote_id: 1 }],
  ['gastos_fijos_mes_bcv', {}],
  // Las dos fuentes unicas de esquema-cuentas-claras.sql: gastos partida
  // por partida y el plan de ventas. Revocadas a todos.
  ['gastos_fijos_partidas', {}],
  ['plan_ventas', {}],
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

  // El maestro de clientas es de las dos caras: ella lo necesita con la
  // clienta delante. Lo que hay que vigilar no es que lo vea, es que por
  // ahi no se cuele una cifra de costo — `v_cliente_compras` sale de
  // `venta_items`, que guarda el costo congelado de cada linea.
  const cl = await V.from('v_clientes').select('id, nombre_completo, compras, servicio_vigente').limit(1);
  dice(!cl.error, 'v_clientes, el maestro', cl.error ? 'ERROR ' + cl.error.code : 'responde');
  const hist = await V.from('v_cliente_compras').select('venta_id, nombre, cantidad, servicio_hasta').limit(1);
  dice(!hist.error, 'v_cliente_compras, el historico', hist.error ? 'ERROR ' + hist.error.code : 'responde');
  const fugaCli = await V.from('v_cliente_compras').select('costo_puesto_usd_snap').limit(1);
  dice(!!fugaCli.error, 'ninguna columna de costo en el historico',
    fugaCli.error ? 'no existe la columna' : 'LA COLUMNA ESTA AHI');
  // Las envolturas del administrador le devuelven nada a ella.
  const envGastos = await V.rpc('gastos_fijos_admin');
  dice(!envGastos.error && envGastos.data === null, 'gastos_fijos_admin() le da null',
    envGastos.error ? 'error ' + envGastos.error.code : JSON.stringify(envGastos.data));
  // Su meta SI es de ella: piezas y fechas. Dos cosas que mirar: que
  // responda, y que entre lo que devuelve no venga ni una cifra de dinero.
  const metaV = await V.rpc('meta_vendedora');
  dice(!metaV.error && Array.isArray(metaV.data), 'meta_vendedora(), su meta de piezas',
    metaV.error ? 'ERROR ' + metaV.error.code : JSON.stringify(metaV.data?.[0] ?? null));
  const columnasMeta = Object.keys(metaV.data?.[0] ?? {});
  const dinero = columnasMeta.filter((c) => /costo|gasto|ganancia|contrib|margen|precio|bcv|usd|bs$/.test(c));
  dice(!metaV.error && dinero.length === 0, 'meta_vendedora() sin cifras de dinero',
    dinero.length ? 'TRAE ' + dinero.join(', ') : columnasMeta.length + ' columnas, todas de piezas o fechas');

  // Lo que puede negociar SI lo ve; los margenes NO. Con el margen minimo y
  // el precio minimo de cada pieza, que ya ve, despejaria el costo.
  const suRebaja = await V.from('configuracion').select('valor').eq('clave', 'descuento_max_mostrador_pct');
  dice(!suRebaja.error && (suRebaja.data?.length ?? 0) === 1, 'lee cuanto puede rebajar',
    suRebaja.error ? 'ERROR ' + suRebaja.error.code : (suRebaja.data?.length ?? 0) + ' fila(s)');
  const margenes = await V.from('configuracion').select('clave')
    .in('clave', ['margen_minimo_pct', 'margen_piso_pct', 'margen_objetivo_pct', 'ganancia_mensual_objetivo_usd']);
  dice(!margenes.error && (margenes.data?.length ?? 0) === 0, 'no lee margenes ni la meta de ganancia',
    margenes.error ? 'ERROR ' + margenes.error.code
      : (margenes.data?.length ?? 0) === 0 ? '0 filas' : 'LEE ' + margenes.data.map((f) => f.clave).join(', '));

  // Juntar dos fichas reescribe ventas ya registradas: no es de mostrador.
  const fus = await V.rpc('admin_fusionar_clientes', { p_se_va: -1, p_se_queda: -2 });
  dice(!!fus.error, 'admin_fusionar_clientes() le dice que no',
    fus.error ? 'rechazada' : 'LA DEJO PASAR');

  console.log('\nEL ADMINISTRADOR SI VE LO SUYO');
  const oa = await A.rpc('costo_operativo_admin');
  dice(!oa.error && Number(oa.data) > 0, 'costo_operativo_admin() le da el numero',
    oa.error ? 'error ' + oa.error.code : String(oa.data));
  for (const v of ['v_catalogo_admin', 'v_valor_inventario', 'v_recuperacion', 'v_gastos_desglose', 'v_diagnostico', 'v_plan_ventas']) {
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
