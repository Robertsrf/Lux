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
/** La fecha de hoy en Venezuela (UTC-4, sin horario de verano). */
const hoyVe = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
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
  // No lleva costo, pero es del dueno: cuanto se dejo de cobrar y quien.
  'v_rebajas',
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
  // Los abonos se escriben por sus funciones y se leen por `v_abonos`.
  const abCrudo = await V.from('abonos').select('id').limit(1);
  dice(!!abCrudo.error, 'la tabla abonos, en crudo', abCrudo.error ? 'rechazada ' + abCrudo.error.code : 'RESPONDIO');

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
  // Lo que necesita el carrito para ensenar el tramo y las variantes. Sin
  // estas columnas el descuento por cantidad no se veia.
  const vuNuevo = await V.from('v_venta_ubicacion').select('familia, variante, precio_minimo_usd, piso_tramo_usd').limit(1);
  dice(!vuNuevo.error, 'su mostrador trae pisos y variantes',
    vuNuevo.error ? 'ERROR ' + vuNuevo.error.code : 'responde');
  // Fija la tasa del dia. Con ceros la funcion dice que no sin escribir
  // nada; ese "no" prueba que la pudo ejecutar.
  const ft = await V.rpc('fijar_tasa', { p_tasa_venta: 0, p_tasa_bcv: 0 });
  dice(!!ft.error && /mayores que cero/i.test(ft.error.message), 'puede fijar la tasa (fijar_tasa)',
    ft.error ? ft.error.message : 'ACEPTO CEROS');
  const vt = await V.from('v_tasas').select('id, registrado_por_nombre').limit(1);
  dice(!vt.error && (vt.data?.length ?? 0) > 0, 'v_tasas, el historico con quien',
    vt.error ? 'ERROR ' + vt.error.code : (vt.data?.length ?? 0) + ' fila(s)');
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
  // La ficha cuenta el credito: lo que quedo por verificar, cuando se
  // comprobo y lo que se anulo porque el pago no llego.
  const credito = await V.from('v_cliente_compras')
    .select('por_verificar, verificada_en, anulada_sin_pago, pago_referencia, pago_parcial, falta_bcv').limit(1);
  dice(!credito.error, 'el historico cuenta el credito', credito.error ? 'ERROR ' + credito.error.code : 'responde');
  // Las ventas y los pedidos no se borran, ni con la sesion del
  // administrador. El filtro no toca ninguna fila (no hay id negativo): lo
  // que se mira es que Postgres niegue el permiso de borrar.
  for (const [quien, S] of [['ella', V], ['el administrador', A]]) {
    for (const tabla of ['ventas', 'reservas']) {
      const borrar = await S.from(tabla).delete().eq('id', -1);
      dice(!!borrar.error, `${tabla}: ${quien} no puede borrar`,
        borrar.error ? 'rechazada ' + borrar.error.code : 'LO PERMITIO');
    }
  }
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

  // Mueve piezas entre ubicaciones. Con el mismo origen y destino la
  // funcion dice que no sin tocar nada; ese "no" prueba que la puede usar.
  const mv = await V.rpc('mover_existencia', { p_modelo_id: 1, p_desde_id: 1, p_hacia_id: 1, p_cantidad: 1 });
  dice(!!mv.error && /otra ubicaci/i.test(mv.error.message), 'puede mover piezas (mover_existencia)',
    mv.error ? mv.error.message : 'MOVIO SIN ORIGEN NI DESTINO');
  // Cobra pedidos del catalogo. Con un pedido que no existe dice que no.
  const cp = await V.rpc('cobrar_pedido', { p_reserva_id: -1, p_metodo: 'punto', p_pago_referencia: null });
  dice(!!cp.error && /no existe/i.test(cp.error.message), 'puede cobrar pedidos (cobrar_pedido)',
    cp.error ? cp.error.message : 'COBRO UN PEDIDO QUE NO EXISTE');
  // Las ventas por verificar: las ve, y sin una columna de costo.
  const vv = await V.from('v_ventas_por_verificar').select('venta_id, vendedora, total_bs').limit(1);
  dice(!vv.error, 'v_ventas_por_verificar, sus pendientes', vv.error ? 'ERROR ' + vv.error.code : 'responde');
  const vvCosto = await V.from('v_ventas_por_verificar').select('costo_puesto_usd_snap').limit(1);
  dice(!!vvCosto.error, 'ninguna columna de costo en por verificar', vvCosto.error ? 'no existe la columna' : 'LA COLUMNA ESTA AHI');
  // Su mostrador ve lo libre y lo apartado: sin esas columnas venderia
  // piezas apartadas por pedidos del catalogo.
  const libre = await V.from('v_venta_ubicacion').select('cantidad, existencia, apartadas').limit(1);
  dice(!libre.error, 'su mostrador trae lo libre y lo apartado', libre.error ? 'ERROR ' + libre.error.code : 'responde');

  // Quien movio que es del administrador.
  const movs = await V.from('movimientos').select('id').limit(1);
  dice(!movs.error && (movs.data?.length ?? 0) === 0, 'movimientos: 0 filas para ella',
    movs.error ? 'ERROR ' + movs.error.code : (movs.data?.length ?? 0) + ' filas');

  // Separar variantes cambia el catalogo: tampoco es de mostrador.
  const sep = await V.rpc('admin_separar_variante', { p_id: -1 });
  dice(!!sep.error, 'admin_separar_variante() le dice que no',
    sep.error ? 'rechazada' : 'LA DEJO PASAR');

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
  // Puede no haber rebajas todavia: lo que se mira es que responda.
  const rebA = await A.from('v_rebajas').select('venta_id, motivo_rebaja').limit(1);
  dice(!rebA.error, 'v_rebajas', rebA.error ? 'ERROR ' + rebA.error.code : 'responde');

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
  // Los pisos son de mostrador: con ellos y un poco de paciencia se
  // adivina el margen de cada pieza.
  for (const col of ['precio_minimo_usd', 'piso_tramo_usd']) {
    const f = await P.from('v_disponible_publico').select(col).limit(1);
    dice(!!f.error, col + ' no sale en lo publico', f.error ? 'no existe la columna' : 'LA COLUMNA ESTA AHI');
  }
  const fam = await P.from('v_disponible_publico').select('familia, variante').limit(1);
  dice(!fam.error, 'las variantes si salen en lo publico', fam.error ? 'ERROR ' + fam.error.code : 'responde');
  // La busqueda por cedula del catalogo: responde sin sesion, pero NUNCA
  // con el apellido entero ni el telefono completo. Si devolviera mas, se
  // podria sacar la lista de clientas probando cedulas.
  const bc = await P.rpc('buscar_cliente_publico', { p_cedula: '00000001' });
  const clavesBc = Object.keys(bc.data ?? {});
  const permitidas = ['encontrada', 'nombre', 'inicial', 'telefono_final', 'faltan'];
  const deMas = clavesBc.filter((c) => !permitidas.includes(c));
  dice(!bc.error && deMas.length === 0, 'buscar_cliente_publico() enmascarada',
    bc.error ? 'ERROR ' + bc.error.code : deMas.length ? 'DEVUELVE ' + deMas.join(', ') : 'solo ' + clavesBc.join(', '));
  // La vitrina se abre sin sesion: lee sus frases de marca, y nada de las
  // ventas ni de los movimientos.
  const frasesP = await P.from('frases').select('id').limit(1);
  dice(!frasesP.error, 'la vitrina lee sus frases sin sesion', frasesP.error ? 'ERROR ' + frasesP.error.code : (frasesP.data?.length ?? 0) + ' fila(s)');
  const vvP = await P.from('v_ventas_por_verificar').select('venta_id').limit(1);
  dice(!!vvP.error || (vvP.data?.length ?? 0) === 0, 'v_ventas_por_verificar sin sesion',
    vvP.error ? 'rechazada ' + vvP.error.code : (vvP.data?.length ?? 0) + ' filas');
  // La clienta que va a pagar ve a donde: cedula, telefono y banco.
  const pagoP = await P.from('textos').select('clave, valor').like('clave', 'pago_movil_%');
  dice(!pagoP.error && (pagoP.data?.length ?? 0) === 3, 'los datos del pago movil, sin sesion',
    pagoP.error ? 'ERROR ' + pagoP.error.code : (pagoP.data?.length ?? 0) + ' de 3');
  // Los abonos: ella los lee (son su trabajo en Pedidos); sin sesion, nada.
  const abV = await V.from('v_abonos').select('venta_id, monto_bs, monto_bcv, referencia').limit(1);
  dice(!abV.error, 'v_abonos, los pagos por partes', abV.error ? 'ERROR ' + abV.error.code : 'responde');
  const faltaV = await V.from('v_ventas_por_verificar').select('pago_parcial, falta_bcv').limit(1);
  dice(!faltaV.error, 'por verificar dice cuanto falta', faltaV.error ? 'ERROR ' + faltaV.error.code : 'responde');
  const abP = await P.from('v_abonos').select('venta_id').limit(1);
  dice(!!abP.error || (abP.data?.length ?? 0) === 0, 'v_abonos sin sesion',
    abP.error ? 'rechazada ' + abP.error.code : (abP.data?.length ?? 0) + ' filas');
  const abonoP = await P.rpc('registrar_abono', { p_venta_id: -1, p_metodo: 'pago_movil', p_monto: 1 });
  dice(!!abonoP.error && !/ya no est/i.test(abonoP.error.message), 'registrar_abono() sin sesion, rechazada',
    abonoP.error ? 'rechazada ' + (abonoP.error.code ?? '') : 'LA DEJO PASAR');
  const libreP = await P.from('v_existencia_libre').select('modelo_id').limit(1);
  dice(!!libreP.error || (libreP.data?.length ?? 0) === 0, 'v_existencia_libre sin sesion',
    libreP.error ? 'rechazada ' + libreP.error.code : (libreP.data?.length ?? 0) + ' filas');
  const mvP = await P.rpc('mover_existencia', { p_modelo_id: 1, p_desde_id: 1, p_hacia_id: 2, p_cantidad: 1 });
  dice(!!mvP.error && !/otra ubicaci|hay /i.test(mvP.error.message), 'mover_existencia() sin sesion, rechazada',
    mvP.error ? 'rechazada ' + (mvP.error.code ?? '') : 'LA DEJO PASAR');
  const ftP = await P.rpc('fijar_tasa', { p_tasa_venta: 0, p_tasa_bcv: 0 });
  dice(!!ftP.error && !/mayores que cero/i.test(ftP.error.message), 'fijar_tasa() sin sesion, rechazada',
    ftP.error ? 'rechazada ' + (ftP.error.code ?? '') : 'LA DEJO PASAR');

  /*
    LOS REVENDEDORES (esquema-revendedores.sql)

    Para la base un revendedor es alguien SIN sesión con la llave de su
    cajón: todo lo de arriba sobre la clienta le aplica a él. Aquí se mira
    lo nuevo: que sus tablas no se abran a nadie en crudo, que las fórmulas
    que llevan el piso de margen no respondan fuera de las funciones de
    definidor, que la vendedora cobre sus apartados y no toque lo demás, y
    que su catálogo público no traiga ni lo que él le paga a Lux.
  */
  console.log('\nLOS REVENDEDORES');
  for (const [quien, S] of [['sin sesion', P], ['ella', V]]) {
    for (const tabla of ['revendedores', 'revendedor_sesiones', 'apartados', 'apartado_items', 'revendedor_clientes']) {
      const { data, error } = await S.from(tabla).select('*').limit(1);
      dice(!!error || (data?.length ?? 0) === 0, `${tabla} en crudo: ${quien}`,
        error ? 'rechazada ' + error.code : (data?.length ?? 0) + ' filas');
    }
    const lux = await S.rpc('rv_precio_lux', { p_modelo_id: 1, p_descuento_pct: 25 });
    dice(!!lux.error, `rv_precio_lux(): ${quien}, rechazada`, lux.error ? 'rechazada ' + lux.error.code : 'RESPONDIO ' + lux.data);
    const adm = await S.rpc('admin_guardar_revendedor', { p_id: null, p_nombre: 'Prueba', p_usuario: 'prueba-verificar' });
    dice(!!adm.error, `admin_guardar_revendedor(): ${quien}, rechazada`, adm.error ? 'rechazada' : 'LO CREO');
    const lista = await S.from('v_revendedores').select('id').limit(1);
    dice(!!lista.error || (lista.data?.length ?? 0) === 0, `v_revendedores: ${quien}`,
      lista.error ? 'rechazada ' + lista.error.code : (lista.data?.length ?? 0) + ' filas');
  }
  // Ella cobra los apartados que se retiran en la tienda.
  const enTienda = await V.from('v_apartados_revendedor').select('id, total_usd, items').limit(1);
  dice(!enTienda.error, 'v_apartados_revendedor, su trabajo', enTienda.error ? 'ERROR ' + enTienda.error.code : 'responde');
  const cobroRv = await V.rpc('cobrar_apartado', { p_apartado_id: -1, p_metodo: 'punto' });
  dice(!!cobroRv.error && /no existe/i.test(cobroRv.error.message), 'puede cobrar apartados (cobrar_apartado)',
    cobroRv.error ? cobroRv.error.message : 'COBRO UNO QUE NO EXISTE');
  const enTiendaP = await P.from('v_apartados_revendedor').select('id').limit(1);
  dice(!!enTiendaP.error || (enTiendaP.data?.length ?? 0) === 0, 'v_apartados_revendedor sin sesion',
    enTiendaP.error ? 'rechazada ' + enTiendaP.error.code : (enTiendaP.data?.length ?? 0) + ' filas');
  const cobroP = await P.rpc('cobrar_apartado', { p_apartado_id: -1, p_metodo: 'punto' });
  dice(!!cobroP.error && !/no existe/i.test(cobroP.error.message), 'cobrar_apartado() sin sesion, rechazada',
    cobroP.error ? 'rechazada ' + (cobroP.error.code ?? '') : 'LA DEJO PASAR');
  // El dueño ve cómo va cada uno y la escalera del tope.
  const listaA = await A.from('v_revendedores').select('id, nivel, tope_usd').limit(1);
  dice(!listaA.error, 'v_revendedores para el administrador', listaA.error ? 'ERROR ' + listaA.error.code : 'responde');
  const esc = await A.rpc('rv_escalera');
  dice(!esc.error && (esc.data?.length ?? 0) > 0, 'rv_escalera(), los niveles',
    esc.error ? 'ERROR ' + esc.error.code : (esc.data?.length ?? 0) + ' niveles');
  // Su catálogo público: responde sin sesión y no trae lo que él paga a Lux.
  const catRv = await P.rpc('rv_catalogo_publico', { p_usuario: 'nadie-con-este-usuario' }).select('id, precio_usd').limit(1);
  dice(!catRv.error, 'rv_catalogo_publico() sin sesion', catRv.error ? 'ERROR ' + catRv.error.code : 'responde');
  for (const col of ['precio_lux_usd', 'costo_puesto_usd', 'piso_tramo_usd']) {
    const f = await P.rpc('rv_catalogo_publico', { p_usuario: 'nadie-con-este-usuario' }).select(col).limit(1);
    dice(!!f.error, col + ' no sale en su catalogo', f.error ? 'no existe la columna' : 'LA COLUMNA ESTA AHI');
  }
  // Sin un testigo de verdad, su panel no abre.
  const panel = await P.rpc('rv_resumen', { p_sesion: 'f'.repeat(64) });
  dice(!!panel.error && panel.error.code === '28000', 'rv_resumen() con un testigo inventado',
    panel.error ? 'rechazada ' + panel.error.code : 'ABRIO UN PANEL');

  /*
    LOS APARTADOS Y LOS ABONOS (esquema-abonos-y-apartados.sql y
    esquema-revendedores-plazos.sql).

    Un pedido guarda ahora su precio congelado: nadie con sesión puede
    reescribir `reservas` ni `reserva_items` en crudo. Un abono se corrige
    solo por sus funciones, que dejan escrito el cambio; sin sesión no se
    toca ninguno. Y las funciones por dentro (la que registra la venta con
    precios congelados, la que anota un abono, la que da el precio de cada
    pieza con su costo) no responden a nadie. Todas las llamadas van con
    datos que la función rechaza antes de escribir.
  */
  console.log('\nLOS APARTADOS Y LOS ABONOS');
  for (const [tabla, cambio] of [['reservas', { cliente_nombre: 'x' }], ['reserva_items', { cantidad: 1 }]]) {
    const { error } = await V.from(tabla).update(cambio).eq('id', -1);
    dice(error?.code === '42501', `${tabla}: ella no la reescribe`, error ? 'rechazada ' + error.code : 'LA DEJO ESCRIBIR');
  }
  const detV = await V.from('v_abonos_detalle').select('id, falta_despues_bcv, verificado_en').limit(1);
  dice(!detV.error, 'v_abonos_detalle, su trabajo', detV.error ? 'ERROR ' + detV.error.code : 'responde');
  for (const vista of ['v_abonos_detalle', 'v_abono_cambios']) {
    const { data, error } = await P.from(vista).select('id').limit(1);
    dice(!!error || (data?.length ?? 0) === 0, `${vista} sin sesion`, error ? 'rechazada ' + error.code : (data?.length ?? 0) + ' filas');
  }
  const cambiosV = await V.from('abono_cambios').select('id').limit(1);
  dice(!!cambiosV.error, 'abono_cambios en crudo: ella', cambiosV.error ? 'rechazada ' + cambiosV.error.code : 'RESPONDIO');
  for (const [fn, args] of [
    ['editar_abono', { p_abono_id: -1, p_metodo: 'pago_movil', p_monto: 1, p_referencia: null }],
    ['anular_abono', { p_abono_id: -1 }],
    ['verificar_abono', { p_abono_id: -1 }],
    ['abonar_pedido', { p_reserva_id: -1, p_metodo: 'pago_movil', p_monto: 1 }],
    ['entregar_pedido', { p_reserva_id: -1 }],
    ['apartar_en_tienda', { p_items: [], p_pagos: [] }],
    ['aprobar_apartado', { p_apartado_id: -1 }],
    ['abonar_apartado', { p_apartado_id: -1, p_metodo: 'pago_movil', p_monto: 1 }],
    ['admin_cerrar_pedido', { p_reserva_id: -1, p_devolver: false }],
  ]) {
    const { error } = await P.rpc(fn, args);
    dice(error?.code === '42501', `${fn}() sin sesion, rechazada`,
      error ? 'rechazada ' + (error.code ?? '') : 'LA DEJO PASAR');
  }
  // Ella sí corrige y aprueba: con un id que no existe, la base lo dice.
  const corrigeV = await V.rpc('editar_abono', { p_abono_id: -1, p_metodo: 'pago_movil', p_monto: 1, p_referencia: null });
  dice(!!corrigeV.error && /no existe/i.test(corrigeV.error.message), 'puede corregir abonos (editar_abono)',
    corrigeV.error ? corrigeV.error.message : 'CORRIGIO UNO QUE NO EXISTE');
  const apruebaV = await V.rpc('aprobar_apartado', { p_apartado_id: -1 });
  dice(!!apruebaV.error && /no existe/i.test(apruebaV.error.message), 'puede aprobar pedidos de revendedor',
    apruebaV.error ? apruebaV.error.message : 'APROBO UNO QUE NO EXISTE');
  // Un abono a una venta por verificar (esquema-abonos-ventas-por-verificar.sql):
  // ella sí, sin sesión no.
  const abVentaV = await V.rpc('abonar_venta', { p_venta_id: -1, p_metodo: 'pago_movil', p_monto: 1 });
  dice(!!abVentaV.error && /ya no est/i.test(abVentaV.error.message), 'puede abonar a una venta por verificar',
    abVentaV.error ? abVentaV.error.message : 'ABONO A UNA QUE NO EXISTE');
  const abVentaP = await P.rpc('abonar_venta', { p_venta_id: -1, p_metodo: 'pago_movil', p_monto: 1 });
  dice(abVentaP.error?.code === '42501', 'abonar_venta() sin sesion, rechazada',
    abVentaP.error ? 'rechazada ' + (abVentaP.error.code ?? '') : 'LA DEJO PASAR');
  const cierraV = await V.rpc('admin_cerrar_pedido', { p_reserva_id: -1, p_devolver: false });
  dice(!!cierraV.error && /administrador/i.test(cierraV.error.message), 'admin_cerrar_pedido(): ella no cierra con dinero',
    cierraV.error ? cierraV.error.message : 'LO CERRO');
  for (const [fn, args] of [
    ['precio_de_linea', { p_modelo_id: 1, p_pedido: null, p_desc: 0, p_tasa_bcv: 1 }],
    ['vender_congelado', { p_tipo: 'detal', p_metodo: 'punto', p_lineas: [], p_cliente_id: null, p_cliente_nombre: null, p_cliente_telefono: null, p_notas: null, p_usuario: null, p_revendedor_id: null, p_pago_referencia: null }],
    ['cliente_de_revendedor', { p_apartado_id: -1 }],
  ]) {
    const { error } = await V.rpc(fn, args);
    dice(error?.code === '42501', `${fn}(): cerrada para ella`, error ? 'rechazada ' + (error.code ?? '') : 'RESPONDIO');
  }
  // La clienta reporta su pago desde su enlace, sin sesion.
  const repP = await P.rpc('reportar_abono', {
    p_token: '00000000-0000-0000-0000-000000000000', p_metodo: 'pago_movil', p_monto: 1,
    p_referencia: '1', p_fecha: hoyVe(), p_cedula: null, p_telefono: null,
  });
  dice(!!repP.error && /no existe/i.test(repP.error.message), 'reportar_abono() responde sin sesion',
    repP.error ? repP.error.message : 'ACEPTO UN PEDIDO QUE NO EXISTE');
  // Su panel nuevo tampoco abre sin un testigo de verdad.
  for (const fn of ['rv_confirmar', 'rv_pagar_lux', 'rv_vender']) {
    const args = fn === 'rv_confirmar' ? { p_apartado_id: -1 }
      : fn === 'rv_pagar_lux' ? { p_apartado_id: -1, p_metodo: 'pago_movil', p_monto: 1, p_referencia: '1', p_fecha: hoyVe() }
        : { p_items: [], p_cedula: '0' };
    const { error } = await P.rpc(fn, { p_sesion: 'f'.repeat(64), ...args });
    dice(!!error && error.code === '28000', `${fn}() con un testigo inventado`, error ? 'rechazada ' + error.code : 'LO DEJO PASAR');
  }
  // El mostrador lee el minimo y los dias del apartado.
  const reglaV = await V.from('configuracion').select('clave, valor').in('clave', ['apartado_inicial_pct', 'apartado_dias']);
  dice(!reglaV.error && (reglaV.data?.length ?? 0) === 2, 'ella lee las cifras del apartado',
    reglaV.error ? 'ERROR ' + reglaV.error.code : (reglaV.data?.length ?? 0) + ' de 2');

  /*
    LAS VISITAS AL CATALOGO (esquema-visitas-catalogo.sql). El catalogo
    publico cuenta sin sesion; la cuenta la leen las dos caras, solo
    cifras. La visita se prueba con un visitante vacio, que la funcion
    ignora: asi verificar no infla la cifra de la tienda.
  */
  console.log('\nLAS VISITAS AL CATALOGO');
  const visitaP = await P.rpc('registrar_visita', { p_visitante: null });
  dice(!visitaP.error, 'registrar_visita() abre sin sesion', visitaP.error ? 'ERROR ' + visitaP.error.code : 'responde');
  const cuentaP = await P.rpc('visitas_catalogo', { p_dias: 7 });
  dice(cuentaP.error?.code === '42501', 'visitas_catalogo() cerrada sin sesion',
    cuentaP.error ? 'rechazada ' + (cuentaP.error.code ?? '') : 'RESPONDIO');
  const tablaP = await P.from('catalogo_visitas').select('dia').limit(1);
  dice(tablaP.error?.code === '42501', 'catalogo_visitas cerrada sin sesion',
    tablaP.error ? 'rechazada ' + (tablaP.error.code ?? '') : 'SE LEYO');
  const tablaV = await V.from('catalogo_visitas').select('dia').limit(1);
  dice(tablaV.error?.code === '42501', 'catalogo_visitas cerrada tambien con sesion (solo por su funcion)',
    tablaV.error ? 'rechazada ' + (tablaV.error.code ?? '') : 'SE LEYO');
  const cuentaV = await V.rpc('visitas_catalogo', { p_dias: 7 });
  const clavesVisita = Object.keys(cuentaV.data?.[0] ?? {}).sort().join(',');
  dice(!cuentaV.error && cuentaV.data?.length === 7 && clavesVisita === 'dia,pedidos,veces,visitantes',
    'ella lee siete dias de visitas, solo cifras',
    cuentaV.error ? 'ERROR ' + cuentaV.error.code : `${cuentaV.data?.length} dias · ${clavesVisita}`);

  /*
    LA GUIA DE REVENDEDORES (esquema-guia-revendedores.sql). Publica: cualquiera
    lee las cifras del programa. Solo las de la oferta; una clave de mas podria
    ser un margen o un piso, que con el descuento despejan el costo.
  */
  console.log('\nLA GUIA DE REVENDEDORES');
  const progP = await P.rpc('rv_programa');
  dice(!progP.error && !!progP.data, 'rv_programa() abre sin sesion', progP.error ? 'ERROR ' + progP.error.code : 'responde');
  const clavesProg = Object.keys(progP.data ?? {}).sort().join(',');
  dice(clavesProg === 'descuento_pct,dias_ventana,escalera,horas_pago,horas_para_pagar,inicial_pct,sobre_etiqueta_usd,vencidos_para_bajar,vueltas_para_subir',
    'rv_programa() da solo la oferta, ninguna cifra de costo', clavesProg || 'sin claves');

  /*
    LA CAJA (esquema-caja.sql). Enseña cuánto vende la tienda, en qué
    gasta y el sueldo de cada una: solo el dueño. Las llamadas que escriben
    se prueban con datos que la función rechaza antes de escribir (monto
    cero): si responde ese "no", la pudo ejecutar.
  */
  console.log('\nLA CAJA, SOLO EL DUENO');
  const hoy = new Date().toISOString().slice(0, 10);
  for (const [quien, S, filas] of [['sin sesion', P, false], ['ella', V, false], ['el administrador', A, true]]) {
    const { data, error } = await S.from('v_caja').select('id, concepto, monto_bcv').limit(1);
    const bien = filas ? !error : (!!error || (data?.length ?? 0) === 0);
    dice(bien, `v_caja: ${quien}`, error ? (filas ? 'ERROR ' : 'rechazada ') + error.code : (data?.length ?? 0) + ' fila(s)');
  }
  for (const [quien, S, abre] of [['sin sesion', P, false], ['ella', V, false], ['el administrador', A, true]]) {
    const { error } = await S.rpc('admin_caja_por_metodo', { p_desde: hoy, p_hasta: hoy });
    dice(abre ? !error : !!error, `admin_caja_por_metodo(): ${quien}`,
      error ? (abre ? 'ERROR ' + error.message : 'rechazada') : 'responde');
  }
  for (const [quien, S] of [['ella', V], ['el administrador', A]]) {
    const crudo = await S.from('caja_movimientos').select('id').limit(1);
    dice(!!crudo.error, `caja_movimientos en crudo: ${quien}`, crudo.error ? 'rechazada ' + crudo.error.code : 'RESPONDIO');
  }
  const flujo = await A.rpc('caja_flujo', { p_desde: hoy, p_hasta: hoy });
  dice(!!flujo.error, 'caja_flujo() cerrada hasta para el dueno', flujo.error ? 'rechazada ' + flujo.error.code : 'RESPONDIO');
  const anotar = (S) => S.rpc('admin_anotar_caja', {
    p_tipo: 'salida', p_fecha: null, p_categoria: 'otro_gasto', p_concepto: 'verificar',
    p_metodo: 'efectivo_bs', p_monto: 0, p_referencia: null,
  });
  const anotaElla = await anotar(V);
  dice(!!anotaElla.error && /Solo un administrador/.test(anotaElla.error.message), 'admin_anotar_caja(): ella no anota',
    anotaElla.error ? anotaElla.error.message : 'LO ACEPTO');
  const anotaEl = await anotar(A);
  dice(!!anotaEl.error && /mayor que cero/.test(anotaEl.error.message), 'admin_anotar_caja(): el dueno si (monto cero)',
    anotaEl.error ? anotaEl.error.message : 'ACEPTO UN CERO');

  /*
    LAS VENDEDORAS DEL LOCAL (esquema-vendedoras.sql y la función de
    servidor `vendedoras`). La vista es del dueño; la función crea cuentas
    con la llave maestra, así que tiene que decirle que no a todos menos a
    él. 'listar' no toca nada: solo responde si el permiso deja pasar.
  */
  console.log('\nLAS VENDEDORAS DEL LOCAL');
  for (const [quien, S, filas] of [['sin sesion', P, false], ['ella', V, false], ['el administrador', A, true]]) {
    const { data, error } = await S.from('v_vendedoras').select('id, numero_vendedora').limit(1);
    const bien = filas ? !error : (!!error || (data?.length ?? 0) === 0);
    dice(bien, `v_vendedoras: ${quien}`, error ? (filas ? 'ERROR ' : 'rechazada ') + error.code : (data?.length ?? 0) + ' fila(s)');
  }
  const estadoFn = async (S) => {
    const { error } = await S.functions.invoke('vendedoras', { body: { accion: 'listar' } });
    return error ? (error.context?.status ?? 0) : 200;
  };
  for (const [quien, S, esperado] of [['sin sesion', P, 401], ['ella', V, 403], ['el administrador', A, 200]]) {
    const estado = await estadoFn(S);
    dice(estado === esperado, `funcion vendedoras: ${quien} (${esperado})`,
      estado === 404 ? 'NO ESTA PUBLICADA: ver INSTALACION.md' : 'responde ' + estado);
  }

  // Con el código de un revendedor de prueba (LUX_REVENDEDOR en el entorno),
  // se entra como él y se mira lo que ve. Sin la variable, se salta.
  if (process.env.LUX_REVENDEDOR) {
    const R = cliente();
    const ent = await R.rpc('rv_entrar', { p_codigo: process.env.LUX_REVENDEDOR });
    dice(!ent.error, 'el revendedor entra con su codigo', ent.error ? ent.error.message : ent.data?.nombre);
    if (!ent.error) {
      const s = ent.data.sesion;
      const piezas = await R.rpc('rv_piezas', { p_sesion: s }).limit(1);
      const claves = Object.keys(piezas.data?.[0] ?? {});
      const deCosto = claves.filter((c) => /costo|piso|margen|operativo/.test(c));
      dice(!piezas.error && deCosto.length === 0, 'rv_piezas() sin costo, piso ni margen',
        piezas.error ? 'ERROR ' + piezas.error.code : deCosto.length ? 'TRAE ' + deCosto.join(', ') : claves.length + ' columnas');
      const res = await R.rpc('rv_resumen', { p_sesion: s });
      dice(!res.error && res.data?.tope, 'rv_resumen(), su panel', res.error ? 'ERROR ' + res.error.code : 'responde');
      // Sus pedidos traen lo que le paga a Lux (es suyo), pero nada de costo.
      const ped = await R.rpc('rv_apartados', { p_sesion: s });
      const clavesPed = (ped.data ?? []).flatMap((a) => Object.keys(a));
      const deCostoPed = [...new Set(clavesPed.filter((c) => /costo|piso|margen|operativo/.test(c)))];
      dice(!ped.error && deCostoPed.length === 0, 'rv_apartados() sin costo, piso ni margen',
        ped.error ? 'ERROR ' + ped.error.code : deCostoPed.length ? 'TRAE ' + deCostoPed.join(', ') : 'limpio');
      const ajeno = await R.from('v_catalogo_venta').select('id').limit(1);
      dice(!!ajeno.error || (ajeno.data?.length ?? 0) === 0, 'el revendedor no lee el catalogo de venta',
        ajeno.error ? 'rechazada ' + ajeno.error.code : (ajeno.data?.length ?? 0) + ' filas');
      await R.rpc('rv_salir', { p_sesion: s });
    }
  } else {
    console.log('  (sin LUX_REVENDEDOR: se saltan las que entran como revendedor)');
  }

  console.log('');
  if (fallos) {
    console.log(fallos + ' COMPROBACION(ES) MAL. No publiques hasta entender por que.');
    process.exit(1);
  }
  console.log('Todo cerrado. ' + 0 + ' fallos.');
}

main().catch((e) => { console.error('\n' + e.message); process.exit(1); });
