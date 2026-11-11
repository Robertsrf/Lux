import { fotoDeLanding } from '../../../lib/fotos';
import { formatearDescuento } from '../../../lib/dinero';
import type { OfertaCasa } from '../../../lib/ofertas';
import { BotonOferta, Miniaturas, PrecioDeOferta, nombreDePieza, totalDeLista, totalDeOferta, type AccionesOferta } from './PiezasOferta';
import { Titulo } from './Titulo';

/** "2026-11-30" -> "30/11/2026", sin pasar por una zona horaria que lo corra un día. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

/**
 * Las ofertas que arma el dueño en el panel: una foto de banner, su nombre
 * y su texto, las piezas y "Lo quiero". La única fecha que se dice es la
 * real: hasta cuándo dura. Sin ofertas, no sale.
 */
export function OfertasCasa({ id, titulo, texto, casas, acciones }: {
  id: string;
  titulo: string;
  texto: string | null;
  casas: OfertaCasa[];
  acciones: AccionesOferta;
}) {
  if (casas.length === 0) return null;
  return (
    <section className="lp-oferta" aria-labelledby={id}>
      <Titulo id={id} texto={texto}>{titulo}</Titulo>
      <ul className="lp-ofertas lp-ofertas--casa">
        {casas.map((c) => {
          const banner = fotoDeLanding(c.foto, '(max-width: 640px) 92vw, 560px');
          const lista = c.total_lista_usd ?? totalDeLista(c.piezas);
          const oferta = c.total_oferta_usd ?? totalDeOferta(c.piezas);
          const hasta = fechaCorta(c.hasta);
          return (
            <li key={c.id} className="lp-oferta__tarjeta lp-oferta__tarjeta--casa">
              {banner ? <img className="lp-oferta__banner" {...banner} alt="" loading="lazy" /> : null}
              <h3 className="lp-oferta__nombre">{c.nombre}</h3>
              {c.texto ? <p className="lp-oferta__texto">{c.texto}</p> : null}
              <Miniaturas piezas={c.piezas} />
              <span className="lp-oferta__cinta">{formatearDescuento(c.pct)} menos</span>
              <ul className="lp-oferta__piezas">
                {c.piezas.map((p) => <li key={p.modelo_id}>{nombreDePieza(p)}</li>)}
              </ul>
              <PrecioDeOferta lista={lista} oferta={oferta} tasa={acciones.tasa} />
              {hasta ? <p className="lp-oferta__hasta">Hasta el {hasta}</p> : null}
              <BotonOferta
                texto="Lo quiero"
                acciones={acciones}
                origen="casa"
                modelos={c.piezas.map((p) => p.modelo_id)}
                id={c.id}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
