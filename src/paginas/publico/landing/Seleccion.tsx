import { useState } from 'react';
import { fuenteFoto } from '../../../lib/fotos';
import { formatearDescuento } from '../../../lib/dinero';
import type { PiezaOferta } from '../../../lib/ofertas';
import { BotonOferta, PrecioDeOferta, nombreDePieza, type AccionesOferta } from './PiezasOferta';
import { Titulo } from './Titulo';

/** Cuántas salen antes de "Ver más": cuatro, dos filas de dos en el teléfono. */
const VISIBLES = 4;

/**
 * Selección de la casa: piezas sueltas con su descuento, cada una con
 * "Pídela con X %". La página nunca dice por qué están ahí. Sin piezas, no
 * sale.
 */
export function Seleccion({ id, titulo, texto, pct, piezas, acciones }: {
  id: string;
  titulo: string;
  texto: string | null;
  pct: number;
  piezas: PiezaOferta[];
  acciones: AccionesOferta;
}) {
  const [todas, setTodas] = useState(false);
  if (piezas.length === 0) return null;
  const vistas = todas ? piezas : piezas.slice(0, VISIBLES);
  return (
    <section className="lp-oferta" aria-labelledby={id}>
      <Titulo id={id} texto={texto}>{titulo}</Titulo>
      <ul className="lp-ofertas lp-ofertas--piezas">
        {vistas.map((p) => {
          const foto = fuenteFoto(p.foto_url, p.foto_thumb, '(max-width: 640px) 46vw, 240px');
          return (
            <li key={p.modelo_id} className="lp-oferta__tarjeta lp-oferta__tarjeta--pieza">
              {foto ? <img className="lp-oferta__foto" {...foto} alt="" loading="lazy" /> : <span className="lp-oferta__foto" />}
              <span className="lp-oferta__cinta">{formatearDescuento(pct)} menos</span>
              <h3 className="lp-oferta__nombre lp-oferta__nombre--pieza">{nombreDePieza(p)}</h3>
              <PrecioDeOferta lista={p.precio_lista_usd} oferta={p.precio_oferta_usd} tasa={acciones.tasa} />
              <BotonOferta
                texto={`Pídela con ${formatearDescuento(pct)}`}
                acciones={acciones}
                origen="seleccion"
                modelos={[p.modelo_id]}
              />
            </li>
          );
        })}
      </ul>
      {piezas.length > VISIBLES ? (
        <div className="lp-oferta__mas">
          <button type="button" className="pub-boton pub-boton--claro lp-boton" onClick={() => setTodas((x) => !x)}>
            {todas ? 'Ver menos' : `Ver las ${piezas.length}`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

