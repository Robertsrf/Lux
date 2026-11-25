import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando } from '../../componentes/Piezas';
import { Banda } from '../../componentes/Banda';
import { agruparFlujo, nombreConcepto, periodo } from '../../lib/flujo';
import type { ClavePeriodo, FilaFlujo, GrupoFlujo, Montos } from '../../lib/flujo';
import { fechaVenezuelaMas, formatearBcv, formatearBinance, formatearBs, formatearMonto } from '../../lib/dinero';

interface LoteSinRastro {
  lote_id: number | null;
  codigo: string | null;
  comprado: number;
  vendido: number;
  en_tienda: number;
  en_camino: number;
  sin_rastro: number;
}

const PERIODOS: { clave: ClavePeriodo; texto: string }[] = [
  { clave: 'mes', texto: 'Este mes' },
  { clave: 'anio', texto: 'Este año' },
  { clave: 'todo', texto: 'Desde el principio' },
];

const n = (v: number | string | null) => (v === null ? 0 : Number(v) || 0);

/**
 * Flujo (fase 9; la cuenta es del #75): lo que salió, lo que entró y lo que
 * queda, con $ Binance y $ BCV lado a lado (decisión del dueño de la fase
 * 8) y los bolívares a un toque. Cada movimiento con la tasa de su día; lo
 * que queda, con la de hoy. Esta pantalla no cuenta: pinta `admin_flujo`.
 *
 * "Mercancía sin rastro" abre su detalle por lote (`admin_sin_rastro_lotes`,
 * #76). Sin el #76 no hay detalle, y el resto sigue igual.
 */
export function Flujo() {
  const [params, setParams] = useSearchParams();
  const clave = (PERIODOS.find((p) => p.clave === params.get('periodo'))?.clave ?? 'mes') as ClavePeriodo;
  const [filas, setFilas] = useState<FilaFlujo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verBs, setVerBs] = useState(false);
  const [lotes, setLotes] = useState<LoteSinRastro[] | null>(null);
  const [lotesError, setLotesError] = useState<string | null>(null);
  const [verLotes, setVerLotes] = useState(false);

  const hoy = fechaVenezuelaMas(0);
  const { desde, hasta } = periodo(clave, hoy);

  useEffect(() => {
    let vigente = true;
    setFilas(null);
    setError(null);
    void (async () => {
      const { data, error: err } = await supabase.rpc('admin_flujo', { p_desde: desde, p_hasta: hasta });
      if (!vigente) return;
      if (err) setError(mensajeDeError(err));
      else setFilas((data as FilaFlujo[] | null) ?? []);
    })();
    return () => { vigente = false; };
  }, [desde, hasta]);

  useEffect(() => {
    if (!verLotes || lotes !== null) return;
    let vigente = true;
    void (async () => {
      const { data, error: err } = await supabase.rpc('admin_sin_rastro_lotes');
      if (!vigente) return;
      if (err) {
        setLotesError(err.code === 'PGRST202' || err.code === '42883'
          ? 'Falta instalar el SQL #76 (esquema-inicio-y-rastro.sql) para ver el detalle por lote.'
          : mensajeDeError(err));
        setLotes([]);
      } else {
        setLotes(((data as LoteSinRastro[] | null) ?? []).map((l) => ({
          ...l, comprado: n(l.comprado), vendido: n(l.vendido), en_tienda: n(l.en_tienda),
          en_camino: n(l.en_camino), sin_rastro: n(l.sin_rastro),
        })));
      }
    })();
    return () => { vigente = false; };
  }, [verLotes, lotes]);

  // Todos los useMemo antes del primer return (React 310).
  const flujo = useMemo(() => (filas ? agruparFlujo(filas) : null), [filas]);

  const elegir = (c: ClavePeriodo) => {
    const p = new URLSearchParams(params);
    if (c === 'mes') p.delete('periodo'); else p.set('periodo', c);
    setParams(p, { replace: true });
  };

  return (
    <div className="pagina flujo">
      <header className="encabezado-pagina">
        <div>
          <h1>Flujo</h1>
          <p>Lo que salió, lo que entró y lo que queda. Cada movimiento a la tasa de su día; lo que queda, a la de hoy.</p>
        </div>
        <div className="selector-periodo" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.clave} type="button" aria-pressed={clave === p.clave} onClick={() => elegir(p.clave)}>
              {p.texto}
            </button>
          ))}
        </div>
      </header>

      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {!flujo && !error ? <Cargando texto="Sacando las cuentas" /> : null}

      {flujo ? (
        <>
          {flujo.siSeVende ? (
            <Banda
              etiqueta="Si se vende todo, hoy"
              cifra={formatearBcv(flujo.siSeVende.bcv).replace(/\s*BCV$/, '')}
              moneda="BCV"
              detalle={(
                <>
                  <p className="flujo__equivale cifra">{formatearBinance(flujo.siSeVende.binance)} · {formatearBs(flujo.siSeVende.bs)}</p>
                  <p className="flujo__como">El dinero que queda, más la mercancía a la etiqueta de hoy, menos lo ya abonado de pedidos sin entregar, más lo que te deben.</p>
                </>
              )}
            />
          ) : null}

          <div className="flujo__ver">
            <button type="button" className="boton boton--secundario boton--pequeno" aria-pressed={verBs} onClick={() => setVerBs((v) => !v)}>
              {verBs ? 'Quitar los bolívares' : 'Ver en bolívares'}
            </button>
          </div>

          <div className="flujo__grupos">
            <TarjetaFlujo titulo="Salió" grupo={flujo.salio} verBs={verBs}
              pie="Lotes (mercancía y exhibidores), Inversiones y lo que salió por la Caja. Solo cuenta lo anotado: un gasto pagado y no anotado en la Caja no sale aquí." />
            <TarjetaFlujo titulo="Entró" grupo={flujo.entro} verBs={verBs}
              extra={flujo.sinComprobar && flujo.sinComprobar.bcv !== 0 ? { texto: 'De eso, sin comprobar', montos: flujo.sinComprobar } : null}
              pie="Ventas cobradas completas y cada abono el día que llegó. Lo reportado por una clienta entra cuando la tienda dice que llegó." />
            <TarjetaFlujo titulo="Queda" subtitulo="en dinero" grupo={flujo.queda} verBs={verBs}
              alTocar={{ concepto: 'mercancia_sin_rastro', abierto: verLotes, accion: () => setVerLotes((v) => !v) }}
              pie="Lo ya abonado de pedidos sin entregar va en negativo: ese dinero ya está en lo que entró y la pieza sigue en la tienda." />
          </div>

          {verLotes ? (
            <section className="tarjeta flujo__lotes" aria-labelledby="flujo-lotes">
              <h2 id="flujo-lotes">Mercancía sin rastro, lote por lote</h2>
              <p className="secundario">
                Lo que se compró y no está ni vendido, ni en la tienda, ni en camino: piezas perdidas, dañadas, regaladas
                o ajustadas en un conteo, o un lote cuyo total no cuadra con lo que se cargó. En $ Binance, como nace el lote.
              </p>
              {lotesError ? <Aviso tono="alerta">{lotesError}</Aviso> : null}
              {lotes === null ? <Cargando texto="Buscando lote por lote" /> : lotes.length > 0 ? (
                <div className="flujo__tabla-lotes">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Lote</th>
                        <th className="num">Comprado · $ Binance</th>
                        <th className="num">Vendido</th>
                        <th className="num">En la tienda</th>
                        <th className="num">En camino</th>
                        <th className="num">Sin rastro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotes.map((l) => (
                        <tr key={l.lote_id ?? 'sin-lote'}>
                          <td>{l.codigo ?? 'Piezas sin lote'}</td>
                          <td className="num">{formatearMonto(l.comprado)}</td>
                          <td className="num">{formatearMonto(l.vendido)}</td>
                          <td className="num">{formatearMonto(l.en_tienda)}</td>
                          <td className="num">{formatearMonto(l.en_camino)}</td>
                          <td className={l.sin_rastro !== 0 ? 'num flujo__destaca' : 'num'}>{formatearMonto(l.sin_rastro)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function TarjetaFlujo({ titulo, subtitulo, grupo, verBs, extra, pie, alTocar }: {
  titulo: string;
  subtitulo?: string;
  grupo: GrupoFlujo;
  verBs: boolean;
  extra?: { texto: string; montos: Montos } | null;
  pie: string;
  alTocar?: { concepto: string; abierto: boolean; accion: () => void };
}) {
  const id = `flujo-${titulo.toLowerCase()}`;
  return (
    <section className="tarjeta flujo__tarjeta" aria-labelledby={id}>
      <h2 id={id}>{titulo}</h2>
      <p className="flujo__total">
        <span className="flujo__total-cifra cifra">{formatearBcv(grupo.total.bcv)}</span>
        {subtitulo ? <span className="flujo__total-que"> {subtitulo}</span> : null}
      </p>
      <p className="flujo__total-otras cifra">{formatearBinance(grupo.total.binance)} · {formatearBs(grupo.total.bs)}</p>
      {grupo.filas.length === 0 ? (
        <p className="secundario">Nada en este período.</p>
      ) : (
        <table className="flujo__tabla">
          <thead>
            <tr>
              <th scope="col"><span className="visualmente-oculto">Concepto</span></th>
              <th scope="col" className="num">$ Binance</th>
              <th scope="col" className="num">$ BCV</th>
              {verBs ? <th scope="col" className="num">Bs</th> : null}
            </tr>
          </thead>
          <tbody>
            {grupo.filas.map((f) => (
              <tr key={f.concepto}>
                <th scope="row">
                  {alTocar && f.concepto === alTocar.concepto ? (
                    <button type="button" className="flujo__abrir" aria-expanded={alTocar.abierto} onClick={alTocar.accion}>
                      {nombreConcepto(f.concepto)}
                      <span className="flujo__abrir-que">{alTocar.abierto ? 'Cerrar' : 'Ver por lote'}</span>
                    </button>
                  ) : nombreConcepto(f.concepto)}
                </th>
                <td className="num">{formatearMonto(n(f.binance))}</td>
                <td className="num">{formatearMonto(n(f.bcv))}</td>
                {verBs ? <td className="num">{formatearBs(n(f.bs))}</td> : null}
              </tr>
            ))}
            {extra ? (
              <tr className="flujo__extra">
                <th scope="row">{extra.texto}</th>
                <td className="num">{formatearMonto(extra.montos.binance)}</td>
                <td className="num">{formatearMonto(extra.montos.bcv)}</td>
                {verBs ? <td className="num">{formatearBs(extra.montos.bs)}</td> : null}
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
      <p className="flujo__pie">{pie}</p>
    </section>
  );
}
