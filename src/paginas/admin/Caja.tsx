import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { useTasa } from '../../hooks/useTasa';
import {
  abonoEnBcv, formatearBcv, formatearBinance, formatearBs, formatearMonto, formatearPorcentaje,
  restarCifras, sumarCifras,
} from '../../lib/dinero';
import type { Tasas } from '../../lib/dinero';
import { CATEGORIAS_CAJA, METODOS_EN_DOLARES, METODOS_PAGO, PIDE_REFERENCIA } from '../../lib/tipos';
import type {
  CajaPorCategoria, CajaPorDia, CajaPorMetodo, MetodoPago, MovimientoCaja, TipoCaja,
} from '../../lib/tipos';

/**
 * La caja: lo que entra y lo que sale de la tienda, día por día y mes por
 * mes (esquema-caja.sql).
 *
 * LO QUE ENTRA NO SE ANOTA
 * Las ventas y los abonos ya están en la base con su forma de pago. Aquí se
 * anota lo que sale (el agua, el delivery, la luz, el sueldo) y lo poco que
 * entra sin ser venta (el dueño mete dinero a la caja). Las cuentas las
 * hace la base con una sola regla (`caja_flujo`); esta pantalla las enseña.
 *
 * POR FORMA DE PAGO, EN SU MONEDA
 * La pregunta de todos los días es "¿cuadra la gaveta?", y la gaveta no
 * está en dólares BCV: tiene bolívares en efectivo y dólares en efectivo.
 * Por eso cada forma de pago va en su moneda, y el total al pie en dólares
 * BCV, que es la unidad ancla, y en bolívares.
 *
 * NO ES LA GANANCIA
 * Lo que entró menos lo que salió es dinero que se movió. La ganancia sigue
 * en Reportes, y Costos sigue con los gastos que el dueño escribe allí.
 */

type Vista = 'dia' | 'mes';

const dos = (n: number) => String(n).padStart(2, '0');

/** El día de hoy en el teléfono o la computadora, que están en Venezuela. */
function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** "2026-09-27" como fecha local, sin que la zona horaria la corra un día. */
function aFecha(dia: string): Date {
  const [a = 1970, m = 1, d = 1] = dia.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function sumarDias(dia: string, n: number): string {
  const f = aFecha(dia);
  f.setDate(f.getDate() + n);
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
}

function rangoDeMes(mes: string): { desde: string; hasta: string } {
  const [a = 1970, m = 1] = mes.split('-').map(Number);
  return { desde: `${mes}-01`, hasta: `${mes}-${dos(new Date(a, m, 0).getDate())}` };
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "sábado 27 de septiembre". */
function nombreDia(dia: string): string {
  return new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(aFecha(dia)).replace(',', '');
}

/** "sáb 27": la columna del día por día. */
function diaCorto(dia: string): string {
  return new Intl.DateTimeFormat('es-VE', { weekday: 'short', day: 'numeric' })
    .format(aFecha(dia)).replace(',', '').replace('.', '');
}

function nombreMes(mes: string): string {
  return mayuscula(new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(aFecha(`${mes}-01`)));
}

/** Este mes y los once anteriores: lo que se puede pedir de una vez. */
function ultimosMeses(hoy: string): string[] {
  const [a = 1970, m = 1] = hoy.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const f = new Date(a, m - 1 - i, 1);
    return `${f.getFullYear()}-${dos(f.getMonth() + 1)}`;
  });
}

const textoMetodo = (m: MetodoPago) => METODOS_PAGO.find((x) => x.valor === m)?.texto ?? m;
const textoCategoria = (c: string) => CATEGORIAS_CAJA.find((x) => x.valor === c)?.texto ?? c;

/**
 * Una cifra del libro en la moneda de su forma de pago. En dólares va la
 * cifra sola: el renglón dice "En dólares Binance" una vez, como la
 * cabecera de una columna. Repetirlo en cada celda no cabía en tres
 * columnas al lado del formulario.
 */
function enSuMoneda(bs: number, usd: number | null, enDolares: boolean): string {
  return enDolares ? formatearMonto(usd ?? 0) : formatearBs(bs);
}

/** La parte de un total, en por ciento. Solo para leer: no entra en ninguna cuenta. */
function parteDe(parte: number, total: number): string {
  return total > 0 ? formatearPorcentaje((parte / total) * 100, 0) : '—';
}

export function Caja() {
  const hoy = hoyLocal();
  const { tasa } = useTasa();
  const [vista, setVista] = useState<Vista>('dia');
  const [dia, setDia] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [porMetodo, setPorMetodo] = useState<CajaPorMetodo[]>([]);
  const [porDia, setPorDia] = useState<CajaPorDia[]>([]);
  const [porCategoria, setPorCategoria] = useState<CajaPorCategoria[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [conceptos, setConceptos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { desde, hasta } = vista === 'dia' ? { desde: dia, hasta: dia } : rangoDeMes(mes);

  const cargar = useCallback(async () => {
    setCargando(true);
    const periodo = { p_desde: desde, p_hasta: hasta };
    const [pm, pd, pc, mv] = await Promise.all([
      supabase.rpc('admin_caja_por_metodo', periodo),
      supabase.rpc('admin_caja_por_dia', periodo),
      supabase.rpc('admin_caja_por_categoria', periodo),
      supabase.from('v_caja')
        .select('id, tipo, fecha, categoria, concepto, metodo, monto_bs, monto_usd, monto_bcv, referencia, registrado_por, registrado_en, anulado_en, anulado_por, anulado_motivo')
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('registrado_en', { ascending: false }),
    ]);
    // Cuatro consultas, cuatro errores que mirar: una que falle callada deja
    // la caja cuadrando con la mitad de los datos.
    const fallo = pm.error ?? pd.error ?? pc.error ?? mv.error;
    setError(fallo ? mensajeDeError(fallo) : null);
    setPorMetodo((pm.data as CajaPorMetodo[] | null) ?? []);
    setPorDia((pd.data as CajaPorDia[] | null) ?? []);
    setPorCategoria((pc.data as CajaPorCategoria[] | null) ?? []);
    setMovimientos((mv.data as MovimientoCaja[] | null) ?? []);
    setCargando(false);
  }, [desde, hasta]);

  // Lo que ya se escribió antes, para no volver a teclear "Agua potable"
  // todos los días: el campo lo sugiere.
  const cargarConceptos = useCallback(async () => {
    const { data } = await supabase.from('v_caja').select('concepto')
      .order('registrado_en', { ascending: false }).limit(300);
    const vistos = new Set<string>();
    for (const f of (data as { concepto: string }[] | null) ?? []) vistos.add(f.concepto);
    setConceptos([...vistos]);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { void cargarConceptos(); }, [cargarConceptos]);

  const totales = useMemo(() => {
    const entroBcv = sumarCifras(porMetodo.map((f) => f.entro_bcv));
    const salioBcv = sumarCifras(porMetodo.map((f) => f.salio_bcv));
    const entroBs = sumarCifras(porMetodo.map((f) => f.entro_bs));
    const salioBs = sumarCifras(porMetodo.map((f) => f.salio_bs));
    return {
      entroBcv, salioBcv, quedaBcv: restarCifras(entroBcv, salioBcv),
      entroBs, salioBs, quedaBs: restarCifras(entroBs, salioBs),
      porVerificarBcv: sumarCifras(porMetodo.map((f) => f.por_verificar_bcv)),
      porVerificarBs: sumarCifras(porMetodo.map((f) => f.por_verificar_bs)),
    };
  }, [porMetodo]);

  const salidas = useMemo(() => porCategoria.filter((c) => c.tipo === 'salida'), [porCategoria]);
  const entradasAparte = useMemo(() => porCategoria.filter((c) => c.tipo === 'entrada'), [porCategoria]);
  const totalSalidas = useMemo(() => sumarCifras(salidas.map((c) => c.bcv)), [salidas]);
  const meses = useMemo(() => ultimosMeses(hoy), [hoy]);

  function verDia(fecha: string) {
    setVista('dia');
    setDia(fecha);
  }

  /** Tras anotar, la caja enseña el período donde cayó lo anotado. */
  async function alAnotar(fecha: string) {
    if (vista === 'dia' && fecha !== dia) setDia(fecha);
    else if (vista === 'mes' && !fecha.startsWith(mes)) setMes(fecha.slice(0, 7));
    else await cargar();
    void cargarConceptos();
  }

  async function anular(m: MovimientoCaja) {
    const cifra = m.monto_usd !== null ? formatearBinance(m.monto_usd) : formatearBs(m.monto_bs);
    const motivo = window.prompt(
      `¿Anular "${m.concepto}", ${cifra}?\n\nDeja de contar en la caja y se queda en la lista como anulado. Si quieres, escribe por qué:`,
      '',
    );
    if (motivo === null) return;
    const { error: err } = await supabase.rpc('admin_anular_caja', { p_id: m.id, p_motivo: motivo.trim() || null });
    if (err) setError(mensajeDeError(err));
    else await cargar();
  }

  const titulo = vista === 'mes'
    ? nombreMes(mes)
    : dia === hoy
      ? `Hoy, ${nombreDia(dia)}`
      : dia === sumarDias(hoy, -1)
        ? `Ayer, ${nombreDia(dia)}`
        : mayuscula(nombreDia(dia));

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Caja</h1>
          <p>Lo que entra y lo que sale de la tienda. Las ventas y los abonos entran solos; los gastos los anotas tú.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="Algo no cuadró">{error}</Aviso> : null}

      <div className="caja">
        <div className="caja__anotar">
          <AnotarMovimiento hoy={hoy} tasa={tasa} conceptos={conceptos} alAnotar={alAnotar} />

          <Ayuda titulo="Qué se anota y qué no">
            <p>
              <strong>Las ventas no se anotan.</strong> Cada venta y cada abono ya entran solos, con
              su forma de pago. Anotarlos aquí sería contarlos dos veces.
            </p>
            <p>
              <strong>Se anota lo que sale:</strong> un gasto, un pago, un sueldo, un retiro tuyo. Y
              lo que entra sin ser venta, como el dinero que metes a la caja.
            </p>
            <p>
              <strong>Un gasto de otro día</strong> se pasa a dólares con la tasa de ese día, no con
              la de hoy.
            </p>
            <p>
              <strong>Esto no es la ganancia.</strong> Es el dinero que se movió. La ganancia sigue
              en <Link to="/admin/reportes">Reportes</Link>, y los precios siguen saliendo de los
              gastos que escribes en <Link to="/admin/costos">Costos</Link>.
            </p>
            <p>
              <strong>Nada se borra.</strong> Si te equivocaste, anúlalo y vuelve a anotarlo: el
              anulado deja de contar y se queda en la lista.
            </p>
          </Ayuda>
        </div>

        <div className="caja__cuentas">
          <div className="caja__periodo">
            <div className="metodos-pago caja__vista" role="group" aria-label="Qué ver">
              <button type="button" aria-pressed={vista === 'dia'} onClick={() => setVista('dia')}>Un día</button>
              <button type="button" aria-pressed={vista === 'mes'} onClick={() => setVista('mes')}>Un mes</button>
            </div>
            {vista === 'dia' ? (
              <input
                type="date"
                className="caja__fecha"
                aria-label="Qué día"
                max={hoy}
                value={dia}
                onChange={(e) => { if (e.target.value) setDia(e.target.value); }}
              />
            ) : (
              <select className="caja__fecha" aria-label="Qué mes" value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
              </select>
            )}
          </div>

          {cargando ? <Cargando texto="Sacando las cuentas" /> : porMetodo.length === 0 ? (
            <Vacio titulo={titulo}>
              <p>
                {vista === 'dia' && dia === hoy
                  ? 'Todavía no ha entrado ni salido nada hoy. Cuando se cobre una venta o anotes un gasto, aparece aquí.'
                  : 'No hubo ventas, abonos ni nada anotado.'}
              </p>
            </Vacio>
          ) : (
            <section className="tarjeta" aria-labelledby="caja-titulo">
              <h2 id="caja-titulo">{titulo}</h2>
              <div className="libro-envoltura">
              <table className="libro">
                <thead>
                  <tr>
                    <th scope="col">Forma de pago</th>
                    <th scope="col" className="num solo-ancho">Entró</th>
                    <th scope="col" className="num solo-ancho">Salió</th>
                    <th scope="col" className="num">Queda</th>
                  </tr>
                </thead>
                <tbody>
                  {porMetodo.map((f) => {
                    const entro = enSuMoneda(f.entro_bs, f.entro_usd, f.en_dolares);
                    const salio = enSuMoneda(f.salio_bs, f.salio_usd, f.en_dolares);
                    const queda = f.en_dolares
                      ? formatearMonto(restarCifras(f.entro_usd, f.salio_usd))
                      : formatearBs(restarCifras(f.entro_bs, f.salio_bs));
                    const sinVerificar = f.en_dolares ? (f.por_verificar_usd ?? 0) > 0 : f.por_verificar_bs > 0;
                    return (
                      <tr key={f.metodo}>
                        <th scope="row">
                          <span className="libro__forma">{textoMetodo(f.metodo)}</span>
                          {f.en_dolares ? <span className="libro__nota">En dólares Binance</span> : null}
                          {/* En el teléfono se caen las dos columnas del medio:
                              lo que entró y salió baja aquí, en una línea. */}
                          <span className="libro__nota libro__detalle">
                            {f.entro_bs > 0 ? <>Entró <span>{entro}</span></> : null}
                            {f.entro_bs > 0 && f.salio_bs > 0 ? ' · ' : null}
                            {f.salio_bs > 0 ? <>{f.entro_bs > 0 ? 'salió' : 'Salió'} <span>{salio}</span></> : null}
                          </span>
                          {f.cobros > 0 ? (
                            <span className="libro__nota">{f.cobros} {f.cobros === 1 ? 'cobro' : 'cobros'}</span>
                          ) : null}
                          {sinVerificar ? (
                            <span className="libro__nota libro__nota--alerta">
                              {enSuMoneda(f.por_verificar_bs, f.por_verificar_usd, f.en_dolares)} por verificar
                            </span>
                          ) : null}
                        </th>
                        <td className="num libro__cifra solo-ancho">{f.entro_bs > 0 ? entro : '—'}</td>
                        <td className="num libro__cifra solo-ancho">{f.salio_bs > 0 ? salio : '—'}</td>
                        <td className="num libro__cifra libro__cifra--queda">{queda}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">En dólares BCV</th>
                    <td className="num libro__cifra solo-ancho">{formatearMonto(totales.entroBcv)}</td>
                    <td className="num libro__cifra solo-ancho">{formatearMonto(totales.salioBcv)}</td>
                    <td className="num libro__cifra libro__cifra--queda">{formatearMonto(totales.quedaBcv)}</td>
                  </tr>
                  <tr>
                    <th scope="row">En bolívares</th>
                    <td className="num libro__cifra solo-ancho">{formatearBs(totales.entroBs)}</td>
                    <td className="num libro__cifra solo-ancho">{formatearBs(totales.salioBs)}</td>
                    <td className="num libro__cifra libro__cifra--queda">{formatearBs(totales.quedaBs)}</td>
                  </tr>
                </tfoot>
              </table>
              </div>

              {/* En el teléfono el pie solo dice lo que queda: esto dice
                  de dónde sale, en una línea. */}
              <p className="libro__resumen">
                Entró <strong>{formatearBcv(totales.entroBcv)}</strong> y salió{' '}
                <strong>{formatearBcv(totales.salioBcv)}</strong>.
              </p>

              {totales.porVerificarBcv > 0 ? (
                <p className="caja__verificar">
                  De lo que entró, {formatearBcv(totales.porVerificarBcv)} ({formatearBs(totales.porVerificarBs)})
                  {' '}son de ventas que falta verificar en el banco. Se verifican en{' '}
                  <Link to="/venta/pedidos">Pedidos</Link>.
                </p>
              ) : null}
            </section>
          )}

          {!cargando && vista === 'mes' && salidas.length + entradasAparte.length > 0 ? (
            <section className="tarjeta" aria-labelledby="caja-categorias">
              <h2 id="caja-categorias">En qué se fue</h2>
              {salidas.length > 0 ? (
                <ul className="caja-partes">
                  {salidas.map((c) => (
                    <li key={c.categoria} className="caja-partes__fila">
                      <span className="caja-partes__nombre">
                        {textoCategoria(c.categoria)}
                        <span className="libro__nota">{c.movimientos} {c.movimientos === 1 ? 'vez' : 'veces'}</span>
                      </span>
                      <span className="libro__cifra">{formatearBcv(c.bcv)}</span>
                      <span className="caja-partes__parte">{parteDe(c.bcv, totalSalidas)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="campo__pista">Este mes no se anotó ninguna salida.</p>}
              {entradasAparte.length > 0 ? (
                <div className="panel">
                  <span className="panel__titulo">Lo que entró sin ser venta</span>
                  <ul className="caja-partes">
                    {entradasAparte.map((c) => (
                      <li key={c.categoria} className="caja-partes__fila">
                        <span className="caja-partes__nombre">{textoCategoria(c.categoria)}</span>
                        <span className="libro__cifra">{formatearBcv(c.bcv)}</span>
                        <span className="caja-partes__parte" />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {!cargando && vista === 'mes' && porDia.length > 0 ? (
            <section className="tarjeta" aria-labelledby="caja-dias">
              <h2 id="caja-dias">Día por día</h2>
              <div className="libro-envoltura">
              <table className="libro">
                <thead>
                  <tr>
                    <th scope="col">Día</th>
                    <th scope="col" className="num">Entró · $ BCV</th>
                    <th scope="col" className="num">Salió · $ BCV</th>
                    <th scope="col" className="num solo-ancho">Queda · $ BCV</th>
                  </tr>
                </thead>
                <tbody>
                  {porDia.map((d) => (
                    <tr key={d.fecha}>
                      <th scope="row">
                        <button type="button" className="libro__dia" onClick={() => verDia(d.fecha)}>
                          {diaCorto(d.fecha)}
                        </button>
                      </th>
                      <td className="num libro__cifra">{d.entro_bcv > 0 ? formatearMonto(d.entro_bcv) : '—'}</td>
                      <td className="num libro__cifra">{d.salio_bcv > 0 ? formatearMonto(d.salio_bcv) : '—'}</td>
                      <td className="num libro__cifra solo-ancho">{formatearMonto(restarCifras(d.entro_bcv, d.salio_bcv))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <p className="campo__pista">Toca un día para ver cada forma de pago y lo anotado.</p>
            </section>
          ) : null}

          {!cargando && movimientos.length > 0 ? (
            <section className="tarjeta" aria-labelledby="caja-anotado">
              <h2 id="caja-anotado">Lo anotado</h2>
              <ul className="caja-lista">
                {movimientos.map((m) => {
                  const enDolares = m.monto_usd !== null;
                  const signo = m.tipo === 'salida' ? -1 : 1;
                  const cifra = enDolares
                    ? formatearBinance(signo * (m.monto_usd ?? 0))
                    : formatearBs(signo * m.monto_bs);
                  return (
                    <li key={m.id} className={m.anulado_en ? 'caja-mov caja-mov--anulado' : 'caja-mov'}>
                      <div className="caja-mov__cabeza">
                        <span className="caja-mov__concepto">{m.concepto}</span>
                        <span className="caja-mov__monto">{m.tipo === 'entrada' && !cifra.startsWith('−') ? '+' : ''}{cifra}</span>
                      </div>
                      <div className="caja-mov__pie">
                        <span className="caja-mov__meta">
                          {m.tipo === 'entrada' ? <span className="etiqueta">Entrada</span> : null}
                          {m.anulado_en ? <span className="etiqueta etiqueta--error">Anulado</span> : null}
                          {' '}{textoCategoria(m.categoria)} · {textoMetodo(m.metodo)}
                          {m.referencia ? ` · ref. ${m.referencia}` : ''}
                          {vista === 'mes' ? ` · ${diaCorto(m.fecha)}` : ''}
                          {m.registrado_por ? ` · ${m.registrado_por}` : ''}
                          {` · ${formatearBcv(m.monto_bcv)}`}
                        </span>
                        {m.anulado_en ? null : (
                          <button type="button" className="boton boton--peligro boton--pequeno" onClick={() => void anular(m)}>
                            Anular
                          </button>
                        )}
                      </div>
                      {m.anulado_en ? (
                        <p className="caja-mov__anulado">
                          Anulado{m.anulado_por ? ` por ${m.anulado_por}` : ''}{m.anulado_motivo ? `: ${m.anulado_motivo}` : ''}.
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * El formulario de anotar. Se queda con el tipo, la categoría, la forma de
 * pago y el día después de guardar: el que anota tres gastos seguidos del
 * mismo día en efectivo no los vuelve a elegir.
 */
function AnotarMovimiento({ hoy, tasa, conceptos, alAnotar }: {
  hoy: string;
  tasa: Tasas | null;
  conceptos: string[];
  alAnotar: (fecha: string) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoCaja>('salida');
  const [categoria, setCategoria] = useState('otro_gasto');
  const [concepto, setConcepto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo_bs');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const categorias = CATEGORIAS_CAJA.filter((c) => c.tipo === tipo);
  const enDolares = METODOS_EN_DOLARES.includes(metodo);
  const valor = Number(monto.replace(',', '.'));
  const hayMonto = Number.isFinite(valor) && valor > 0;
  const hayConcepto = concepto.trim().length >= 2;
  const falta = [!hayConcepto ? 'qué fue' : null, !hayMonto ? 'cuánto' : null].filter(Boolean);
  const equivale = hayMonto && tasa && fecha === hoy ? abonoEnBcv(valor, enDolares, tasa) : null;

  function cambiarTipo(t: TipoCaja) {
    setTipo(t);
    setCategoria(t === 'salida' ? 'otro_gasto' : 'aporte');
    setHecho(null);
  }

  async function anotar(ev: React.FormEvent) {
    ev.preventDefault();
    if (falta.length > 0 || guardando) return;
    setGuardando(true);
    setError(null);
    setHecho(null);
    const { error: err } = await supabase.rpc('admin_anotar_caja', {
      p_tipo: tipo,
      p_fecha: fecha,
      p_categoria: categoria,
      p_concepto: concepto.trim(),
      p_metodo: metodo,
      p_monto: valor,
      p_referencia: PIDE_REFERENCIA.includes(metodo) ? referencia.trim() || null : null,
    });
    setGuardando(false);
    if (err) {
      setError(mensajeDeError(err));
      return;
    }
    const cifra = enDolares ? formatearBinance(valor) : formatearBs(valor);
    setHecho(`${tipo === 'salida' ? 'Salida anotada' : 'Entrada anotada'}: ${concepto.trim()}, ${cifra}.`);
    setConcepto('');
    setMonto('');
    setReferencia('');
    await alAnotar(fecha);
  }

  return (
    <form className="tarjeta caja-anotar" onSubmit={(e) => void anotar(e)} noValidate>
      <h2>Anotar</h2>

      <div className="metodos-pago caja__vista" role="group" aria-label="Qué pasó con el dinero">
        <button type="button" aria-pressed={tipo === 'salida'} onClick={() => cambiarTipo('salida')}>Salió dinero</button>
        <button type="button" aria-pressed={tipo === 'entrada'} onClick={() => cambiarTipo('entrada')}>Entró dinero</button>
      </div>
      <p className="campo__pista caja-anotar__que">
        {tipo === 'salida'
          ? 'Un gasto, un pago o un retiro.'
          : 'Solo lo que no es una venta, como el dinero que metes a la caja. Las ventas entran solas.'}
      </p>

      <Campo etiqueta="Qué fue" htmlFor="caja-concepto">
        <input
          id="caja-concepto"
          list="caja-conceptos"
          maxLength={120}
          autoComplete="off"
          value={concepto}
          onChange={(e) => { setConcepto(e.target.value); setHecho(null); }}
        />
        <datalist id="caja-conceptos">
          {conceptos.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Campo>

      <div className="fila">
        <Campo etiqueta="Categoría" htmlFor="caja-categoria">
          <select id="caja-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {categorias.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
          </select>
        </Campo>
        <Campo
          etiqueta="Qué día"
          htmlFor="caja-fecha"
          pista={fecha !== hoy ? 'Se pasa a dólares con la tasa de ese día.' : undefined}
        >
          <input
            id="caja-fecha"
            type="date"
            max={hoy}
            value={fecha}
            onChange={(e) => setFecha(e.target.value || hoy)}
          />
        </Campo>
      </div>

      <div className="fila">
        <Campo etiqueta={tipo === 'salida' ? 'Cómo se pagó' : 'Cómo entró'} htmlFor="caja-metodo">
          <select id="caja-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS_PAGO.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={enDolares ? 'Cuánto · $' : 'Cuánto · Bs'} htmlFor="caja-monto">
          <input
            id="caja-monto"
            inputMode="decimal"
            autoComplete="off"
            value={monto}
            onChange={(e) => { setMonto(e.target.value); setHecho(null); }}
          />
        </Campo>
      </div>

      {PIDE_REFERENCIA.includes(metodo) ? (
        <Campo etiqueta="Referencia" htmlFor="caja-referencia" pista="Si la tienes a mano. No es obligatoria.">
          <input
            id="caja-referencia"
            inputMode="numeric"
            autoComplete="off"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </Campo>
      ) : null}

      <p className="campo__pista caja-anotar__equivale" aria-live="polite">
        {!hayMonto
          ? ' '
          : fecha !== hoy
            ? 'Al guardarlo se pasa a dólares BCV con la tasa de ese día.'
            : !tasa
              ? 'No hay tasa vigente: fíjala en Tasas antes de anotar.'
              : equivale
                ? `Son ${formatearBs(equivale.bs)}, ${formatearBcv(equivale.bcv)} a la tasa de hoy.`
                : ' '}
      </p>

      {error ? <p className="campo__error" role="alert">{error}</p> : null}

      <div className="acciones">
        <button type="submit" className="boton" disabled={guardando || falta.length > 0}>
          {guardando ? 'Anotando' : tipo === 'salida' ? 'Anotar salida' : 'Anotar entrada'}
        </button>
      </div>
      {falta.length > 0 && !hecho ? (
        <p className="campo__pista">Falta: {falta.join(' y ')}.</p>
      ) : null}
      {hecho ? <Aviso tono="exito">{hecho}</Aviso> : null}
    </form>
  );
}
