import { useState } from 'react';
import { Campo } from './Piezas';
import { FilaPago, montoDePago, textoMetodo } from './ListaAbonos';
import {
  abonoEnBcv, binanceDesdeBs, bsDeBcv, centavoArriba, faltaTrasAbono, formatearBcv, formatearBs,
  formatearFecha, margenDeAbono,
} from '../lib/dinero';
import type { Tasas } from '../lib/dinero';
import { METODOS_EN_DOLARES, PIDE_REFERENCIA } from '../lib/tipos';
import type { MetodoPago, PagoPublico } from '../lib/tipos';

export interface PagoReportado {
  metodo: MetodoPago;
  monto: number;
  referencia: string;
  fecha: string;
  cedula: string | null;
  telefono: string | null;
}

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Reportar un pago hecho a distancia: por pago movil, transferencia o
 * Binance, con su referencia. Es un aviso: quien recibe el dinero lo
 * comprueba en su banco. El efectivo no se reporta: se entrega en persona.
 *
 * Tres usos, la misma cuenta: la clienta que paga su pedido a la tienda,
 * la clienta que le paga al revendedor, y el revendedor que le paga a Lux.
 * Antes de enviar dice cuanto va a faltar, en dolares BCV y en bolivares
 * de hoy (`abonoEnBcv`, la receta de la base).
 */
export function ReportarPago({ id, falta, minimo = null, tasa, pideTitular = true, boton, enviar }: {
  id: string;
  /** Lo que falta, en dolares BCV. */
  falta: number;
  /** Si todavia no llega al minimo para apartar: cuanto es, en dolares BCV. */
  minimo?: number | null;
  tasa: Tasas;
  /** Pedir la cedula y el telefono de quien pago (pago movil y transferencia). */
  pideTitular?: boolean;
  boton: string;
  /** Guarda en la base, o lanza el error ya dicho. */
  enviar: (pago: PagoReportado) => Promise<void>;
}) {
  const [metodo, setMetodo] = useState<MetodoPago>('pago_movil');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enDolares = METODOS_EN_DOLARES.includes(metodo);
  const conTitular = pideTitular && (metodo === 'pago_movil' || metodo === 'transferencia');
  const valor = Number(monto.replace(',', '.'));
  const hayMonto = Number.isFinite(valor) && valor > 0;
  const pagado = hayMonto ? abonoEnBcv(valor, enDolares, tasa) : null;
  const despues = pagado ? faltaTrasAbono(falta, pagado.bcv, margenDeAbono(enDolares, tasa)) : null;
  const faltaBs = bsDeBcv(falta, tasa.tasa_bcv);

  // Lo que falta y el minimo, escritos en la moneda de esta forma de pago:
  // un toque los pone en el campo. En dolares, al centavo hacia arriba.
  const enSuMoneda = (bcv: number) => {
    const bs = bsDeBcv(bcv, tasa.tasa_bcv);
    if (!enDolares) return bs;
    const usd = binanceDesdeBs(bs, tasa.tasa_venta);
    return usd === null ? null : centavoArriba(usd);
  };
  const faltaEnSuMoneda = enSuMoneda(falta);
  const minimoEnSuMoneda = minimo !== null && minimo < falta ? enSuMoneda(minimo) : null;

  const faltan = [
    !hayMonto ? 'cuánto pagaste' : null,
    !referencia.trim() ? 'la referencia' : null,
    !fecha ? 'la fecha' : null,
    conTitular && !cedula.trim() ? 'la cédula de quien pagó' : null,
    conTitular && !telefono.trim() ? 'su teléfono' : null,
  ].filter(Boolean);

  async function mandar() {
    if (faltan.length > 0 || despues?.pasa) return;
    setEnviando(true);
    setError(null);
    try {
      await enviar({
        metodo, monto: valor, referencia: referencia.trim(), fecha,
        cedula: conTitular ? cedula.trim() : null, telefono: conTitular ? telefono.trim() : null,
      });
      setMonto(''); setReferencia('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el pago.');
    }
    setEnviando(false);
  }

  return (
    <div className="reportar-pago">
      <div className="metodos-pago" role="group" aria-label="Cómo pagaste">
        {PIDE_REFERENCIA.map((m) => (
          <button key={m} type="button" aria-pressed={metodo === m} onClick={() => setMetodo(m)}>
            {textoMetodo(m)}
          </button>
        ))}
      </div>

      <div className="fila" style={{ marginTop: 'var(--e-4)' }}>
        <Campo etiqueta={enDolares ? 'Cuánto pagaste · $' : 'Cuánto pagaste · Bs'} htmlFor={`${id}-monto`}>
          <input
            id={`${id}-monto`} inputMode="decimal" autoComplete="off"
            value={monto} onChange={(e) => setMonto(e.target.value)}
            aria-describedby={`${id}-pista`}
          />
        </Campo>
        <Campo etiqueta="Número de referencia" htmlFor={`${id}-ref`}>
          <input id={`${id}-ref`} inputMode="numeric" autoComplete="off" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        </Campo>
      </div>
      <div className="reportar-pago__atajos">
        {faltaEnSuMoneda !== null ? (
          <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setMonto(faltaEnSuMoneda.toFixed(2))}>
            Todo lo que falta
          </button>
        ) : null}
        {minimoEnSuMoneda !== null ? (
          <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setMonto(minimoEnSuMoneda.toFixed(2))}>
            El mínimo para apartar
          </button>
        ) : null}
      </div>

      <div className="fila">
        <Campo etiqueta="Fecha del pago" htmlFor={`${id}-fecha`}>
          <input id={`${id}-fecha`} type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        {conTitular ? (
          <Campo etiqueta="Cédula de quien pagó" htmlFor={`${id}-ced`} pista="Puede ser otra persona, no hay problema.">
            <input id={`${id}-ced`} inputMode="numeric" autoComplete="off" value={cedula} onChange={(e) => setCedula(e.target.value)} />
          </Campo>
        ) : null}
      </div>
      {conTitular ? (
        <Campo etiqueta="Teléfono de quien pagó" htmlFor={`${id}-tel`}>
          <input id={`${id}-tel`} type="tel" autoComplete="off" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </Campo>
      ) : null}

      <p className="campo__pista" id={`${id}-pista`} aria-live="polite">
        {!despues
          ? `Falta ${formatearBcv(falta)}, hoy ${formatearBs(faltaBs)}.`
          : despues.pasa
            ? `Es más de lo que falta: faltan ${formatearBs(faltaBs)}.`
            : minimo !== null && pagado && pagado.bcv < minimo - 0.005
              ? `Con esto todavía no llegas al mínimo para apartar (${formatearBs(bsDeBcv(minimo, tasa.tasa_bcv))}). Si pagaste en dos partes, reporta la otra enseguida.`
              : despues.falta > 0
                ? `Después de este pago faltarán ${formatearBcv(despues.falta)}, hoy ${formatearBs(bsDeBcv(despues.falta, tasa.tasa_bcv))}.`
                : 'Con este pago queda pagado completo.'}
      </p>

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        <button
          type="button"
          className="boton boton--confirmar"
          disabled={enviando || faltan.length > 0 || Boolean(despues?.pasa)}
          onClick={() => void mandar()}
        >
          {enviando ? 'Enviando' : boton}
        </button>
      </div>
      {faltan.length > 0 ? <p className="campo__pista">Falta {faltan.join(', ')}.</p> : null}
    </div>
  );
}

/**
 * Los pagos que ya se reportaron o se cargaron, como los ve quien paga: el
 * monto, si llego, y cuanto faltaba despues. De la referencia, solo los
 * cuatro ultimos: el enlace lo puede abrir cualquiera que lo tenga.
 */
export function PagosHechos({ pagos, quienRevisa }: {
  pagos: PagoPublico[];
  /** "la tienda", o el nombre del revendedor. */
  quienRevisa: string;
}) {
  if (pagos.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="pagos-hechos">
      <span className="panel__titulo" id="pagos-hechos">Tus pagos</span>
      <ul className="abonos" style={{ marginTop: 'var(--e-3)' }}>
        {pagos.map((p, i) => (
          <FilaPago
            key={`${p.fecha}-${i}`}
            monto={montoDePago(p)}
            estado={p.estado}
            quedaba={p.falta_despues_bcv === null ? null : Number(p.falta_despues_bcv)}
            datos={[
              formatearFecha(p.fecha),
              textoMetodo(p.metodo),
              p.referencia_final ? `Ref. ···${p.referencia_final}` : null,
              p.estado === 'por_revisar' ? `${quienRevisa} lo comprueba en su banco` : null,
            ].filter(Boolean).join(' · ')}
          />
        ))}
      </ul>
    </section>
  );
}
