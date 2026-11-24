import { Campo } from '../../../../componentes/Piezas';
import { formatearBcv, formatearBs, bsDeBcv, minimoParaApartar, restarCifras } from '../../../../lib/dinero';
import type { Tasas } from '../../../../lib/dinero';
import { METODOS_EN_DOLARES, METODOS_PAGO, PIDE_REFERENCIA } from '../../../../lib/tipos';
import type { MetodoPago, ResumenRevendedor } from '../../../../lib/tipos';
import { cifraParaCampo, montoQueCubre, pagoDe } from './cuentas';
import type { Cobro, EstadoVender } from './cuentas';

/**
 * ③ Cobro: pagó todo, una parte (solo si él da crédito) o todavía no. Con
 * "Pagó todo" el monto ya viene puesto en la moneda del método.
 */
export function PasoCobro({ estado, total, lux, todasTuyas, tasa, resumen, alCambiar }: {
  estado: EstadoVender;
  total: number;
  lux: number;
  todasTuyas: boolean;
  tasa: Tasas | null;
  resumen: ResumenRevendedor | null;
  alCambiar: (cambio: Partial<EstadoVender>) => void;
}) {
  const diasCredito = resumen?.dias_credito ?? null;
  const montoDe = (m: MetodoPago) => (tasa ? cifraParaCampo(montoQueCubre(total, m, tasa)) : '');

  function elegirCobro(c: Cobro) {
    alCambiar({ cobro: c, monto: c === 'todo' ? montoDe(estado.metodo) : '' });
  }
  function elegirMetodo(m: MetodoPago) {
    // Mientras el monto sea el que se puso solo, sigue a la moneda del método.
    const puesto = estado.cobro === 'todo' && estado.monto === montoDe(estado.metodo);
    alCambiar({ metodo: m, ...(puesto ? { monto: montoDe(m) } : {}) });
  }

  const enDolares = METODOS_EN_DOLARES.includes(estado.metodo);
  const pago = tasa ? pagoDe(estado, total, tasa) : null;
  const pct = Number(resumen?.inicial_pct ?? 0);
  const minimo = pct > 0 ? minimoParaApartar(total, pct) : total;

  return (
    <section aria-labelledby="vrv-cobro">
      <h2 id="vrv-cobro" className="vrv-titulo">¿Ya te pagó?</h2>
      <div className="vrv-opciones" role="group" aria-label="Ya te pagó">
        <button type="button" aria-pressed={estado.cobro === 'todo'} onClick={() => elegirCobro('todo')}>Pagó todo</button>
        {diasCredito ? (
          <button type="button" aria-pressed={estado.cobro === 'parte'} onClick={() => elegirCobro('parte')}>Una parte</button>
        ) : null}
        <button type="button" aria-pressed={estado.cobro === 'no'} onClick={() => elegirCobro('no')}>Todavía no</button>
      </div>

      {estado.cobro === 'no' ? (
        <p className="vrv-nota">
          Sus piezas quedan apartadas {resumen?.horas_pago ?? ''} horas. Le mandas su enlace y ahí ve cómo pagarte.
        </p>
      ) : null}

      {estado.cobro === 'todo' || estado.cobro === 'parte' ? (
        <div className="panel vrv-pago">
          <div className="vrv-metodos" role="group" aria-label="Cómo te pagó">
            {METODOS_PAGO.map((m) => (
              <button key={m.valor} type="button" aria-pressed={estado.metodo === m.valor} onClick={() => elegirMetodo(m.valor)}>{m.texto}</button>
            ))}
          </div>
          <Campo etiqueta={enDolares ? 'Cuánto · $' : 'Cuánto · Bs'} htmlFor="vrv-monto">
            <input id="vrv-monto" type="text" inputMode="decimal" autoComplete="off" value={estado.monto} onChange={(e) => alCambiar({ monto: e.target.value })} />
          </Campo>
          {PIDE_REFERENCIA.includes(estado.metodo) ? (
            <Campo etiqueta="Referencia (opcional)" htmlFor="vrv-ref" pista="Para ubicar el pago en tu banco.">
              <input id="vrv-ref" inputMode="numeric" autoComplete="off" value={estado.referencia} onChange={(e) => alCambiar({ referencia: e.target.value })} />
            </Campo>
          ) : null}
          {estado.cobro === 'parte' && tasa ? (
            <p className="campo__pista" aria-live="polite">
              Para apartar, al menos {formatearBcv(minimo)} (hoy {formatearBs(bsDeBcv(minimo, tasa.tasa_bcv))}).
              {pago && pago.falta > 0 && !pago.pasa
                ? ` Te quedará debiendo ${formatearBcv(pago.falta)} y tiene ${diasCredito} días para pagarte.`
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="vrv-resumen-lux">
        {todasTuyas
          ? 'Todas son tuyas: no le debes nada a Lux.'
          : <>Le pagas a Lux <strong>{formatearBcv(lux)}</strong> · ganas <strong>{formatearBcv(restarCifras(total, lux))}</strong></>}
      </p>
    </section>
  );
}
