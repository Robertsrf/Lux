import { formatearBs, formatearDescuento, precioEnBs } from '../../../lib/dinero';
import type { CatalogoLux } from '../useCatalogoLux';

/**
 * La barra del pedido (fase 10): una píldora verde que flota abajo con
 * cuántas joyas van y el total que da la base (`cotizar_pedido`), el tramo y
 * lo que falta para el siguiente. Encima, la primera vez, el aviso de dónde
 * quedó la pieza.
 */
export function BarraPedido({ c }: { c: CatalogoLux }) {
  const r = c.resumen;
  if (r.piezas === 0) return null;
  const extra = [
    r.descuento ? `${formatearDescuento(r.descuento)} menos` : null,
    r.conOferta ? 'con tu oferta' : null,
    r.siguiente ? `Te faltan ${r.siguiente.faltan} para ${formatearDescuento(r.siguiente.pct)} en todo` : null,
  ].filter(Boolean).join(' · ');
  return (
    <>
      {c.recienAgregada ? (
        <p className="pub-aviso-agregado" role="status">
          <strong>Listo, está en tu pedido.</strong> Sigue eligiendo; cuando termines, toca «Ver mi pedido» aquí abajo.
        </p>
      ) : null}
      <div className="pub-barra">
        <div className="pub-barra__resumen">
          <span className="pub-barra__total" aria-live="polite" aria-busy={r.calculando}>
            {r.piezas} joya{r.piezas === 1 ? '' : 's'} · <span className="pub-precio">{formatearBs(precioEnBs(r.totalUsd, c.tasa))}</span>
          </span>
          {extra ? <span className="pub-barra__extra">{extra}</span> : null}
        </div>
        <button type="button" className="pub-enlace pub-barra__vaciar" onClick={c.vaciar}>Vaciar</button>
        <button type="button" className="pub-boton pub-boton--crema pub-boton--chico" onClick={() => c.setPaso('pedido')}>
          Ver mi pedido
        </button>
      </div>
    </>
  );
}
