import { formatearDescuento } from '../../../lib/dinero';
import type { OfertaCombo } from '../../../lib/ofertas';
import { BotonOferta, Miniaturas, PrecioDeOferta, nombreDePieza, type AccionesOferta } from './PiezasOferta';
import { Titulo } from './Titulo';

/**
 * Combos de la semana y "Para regalar": son el mismo dibujo (un combo es un
 * conjunto de 2 a 4 piezas que la base arma y rearma). Cada tarjeta enseña
 * las piezas, lo que valen juntas y lo que valen con la oferta; "Lo quiero"
 * pide el código y las mete al pedido. Sin combos, no sale.
 */
export function Combos({ id, titulo, texto, combos, origen, acciones }: {
  id: string;
  titulo: string;
  texto: string | null;
  combos: OfertaCombo[];
  origen: 'combo' | 'regalo';
  acciones: AccionesOferta;
}) {
  if (combos.length === 0) return null;
  return (
    <section className="lp-oferta" aria-labelledby={id}>
      <Titulo id={id} texto={texto}>{titulo}</Titulo>
      <ul className="lp-ofertas">
        {combos.map((c) => (
          <li key={c.id} className="lp-oferta__tarjeta">
            <Miniaturas piezas={c.piezas} />
            <span className="lp-oferta__cinta">{formatearDescuento(c.pct)} menos</span>
            <ul className="lp-oferta__piezas">
              {c.piezas.map((p) => <li key={p.modelo_id}>{nombreDePieza(p)}</li>)}
            </ul>
            <PrecioDeOferta lista={c.total_lista_usd} oferta={c.total_oferta_usd} tasa={acciones.tasa} />
            <BotonOferta
              texto="Lo quiero"
              acciones={acciones}
              origen={origen}
              modelos={c.piezas.map((p) => p.modelo_id)}
              id={c.id}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
