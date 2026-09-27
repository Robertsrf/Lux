import { useState } from 'react';
import {
  abonoEnBcv, binanceDesdeBs, bsDeBcv, centavoArriba, faltaTrasAbono, formatearBcv,
  formatearBs, margenDeAbono,
} from '../lib/dinero';
import type { Tasas } from '../lib/dinero';
import { METODOS_EN_DOLARES, METODOS_PAGO, PIDE_REFERENCIA } from '../lib/tipos';
import type { MetodoPago } from '../lib/tipos';

/**
 * El abono siguiente de una deuda: forma de pago, cuánto y la referencia.
 * Antes de guardarlo dice cuánto va a faltar, con la misma cuenta que la
 * base (`anotar_abono` y `rv_abonar`): en dólares BCV, y en bolívares a la
 * tasa de hoy.
 *
 * Vivía dentro de Pedidos. Salió cuando el revendedor necesitó cargar los
 * abonos de su clienta: la misma deuda en dólares BCV, la misma tolerancia
 * y el mismo botón "Lo que falta". Quién guarda lo decide la pantalla.
 */
export function CargarAbono({ id, falta, tasa, titulo = 'Cargar otro abono', registrar, alGuardar }: {
  /** Para que los campos de dos tarjetas no compartan id. */
  id: number;
  /** Lo que falta, en dólares BCV. */
  falta: number;
  tasa: Tasas;
  titulo?: string;
  /** Guarda en la base y devuelve lo que falta después, o lanza el error ya dicho. */
  registrar: (metodo: MetodoPago, monto: number, referencia: string | null) => Promise<number>;
  alGuardar: (resta: number) => void;
}) {
  const [metodo, setMetodo] = useState<MetodoPago>('pago_movil');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enDolares = METODOS_EN_DOLARES.includes(metodo);
  const valor = Number(monto.replace(',', '.'));
  const hayMonto = Number.isFinite(valor) && valor > 0;
  const pagado = hayMonto ? abonoEnBcv(valor, enDolares, tasa) : null;
  const despues = pagado ? faltaTrasAbono(falta, pagado.bcv, margenDeAbono(enDolares, tasa)) : null;
  const faltaBs = bsDeBcv(falta, tasa.tasa_bcv);
  // Lo que falta, escrito en la moneda de esta forma de pago: el boton
  // "Lo que falta" lo pone en el campo sin sacar cuentas. En dolares, al
  // centavo hacia arriba: hacia abajo dejaria debiendo unos centimos.
  const enDolaresFalta = binanceDesdeBs(faltaBs, tasa.tasa_venta);
  const faltaEnSuMoneda = enDolares
    ? (enDolaresFalta === null ? null : centavoArriba(enDolaresFalta))
    : faltaBs;

  async function guardar() {
    if (!hayMonto || despues?.pasa) return;
    setGuardando(true);
    setError(null);
    try {
      const resta = await registrar(metodo, valor, PIDE_REFERENCIA.includes(metodo) ? referencia.trim() || null : null);
      setGuardando(false);
      alGuardar(resta);
    } catch (e) {
      setGuardando(false);
      setError(e instanceof Error ? e.message : 'No se pudo guardar el abono.');
    }
  }

  return (
    <div className="cargar-abono">
      <h3 className="cargar-abono__titulo">{titulo}</h3>
      <div className="fila">
        <div className="campo">
          <label htmlFor={`ab-metodo-${id}`}>Cómo pagó</label>
          <select id={`ab-metodo-${id}`} value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS_PAGO.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor={`ab-monto-${id}`}>{enDolares ? 'Cuánto · $' : 'Cuánto · Bs'}</label>
          <input
            id={`ab-monto-${id}`}
            inputMode="decimal"
            autoComplete="off"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            aria-describedby={`ab-pista-${id}`}
          />
          <button
            type="button"
            className="boton boton--secundario boton--pequeno cargar-abono__todo"
            onClick={() => setMonto(faltaEnSuMoneda !== null ? faltaEnSuMoneda.toFixed(2) : '')}
          >
            Lo que falta
          </button>
        </div>
      </div>
      {PIDE_REFERENCIA.includes(metodo) ? (
        <div className="campo">
          <label htmlFor={`ab-ref-${id}`}>Referencia</label>
          <input
            id={`ab-ref-${id}`}
            inputMode="numeric"
            autoComplete="off"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </div>
      ) : null}

      <p className="campo__pista" id={`ab-pista-${id}`} aria-live="polite">
        {!despues
          ? `Faltan ${formatearBcv(falta)}, hoy ${formatearBs(faltaBs)}.`
          : despues.pasa
            ? `Es más de lo que falta: faltan ${formatearBs(faltaBs)}.`
            : despues.falta > 0
              ? `Después de este abono faltarán ${formatearBcv(despues.falta)}, hoy ${formatearBs(bsDeBcv(despues.falta, tasa.tasa_bcv))}.`
              : 'Con este abono queda pagada completa.'}
      </p>

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        <button
          type="button"
          className="boton boton--secundario"
          disabled={guardando || !hayMonto || Boolean(despues?.pasa)}
          onClick={() => void guardar()}
        >
          {guardando ? 'Guardando' : 'Cargar abono'}
        </button>
      </div>
    </div>
  );
}
