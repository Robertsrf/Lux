import { useState } from 'react';
import { useAparecer } from '../../../hooks/useAparecer';
import { formatearDescuento } from '../../../lib/dinero';
import type { OfertasPublicas } from '../../../lib/ofertas';

/**
 * Lo que dice la cinta, a partir de las ofertas del momento. Las cifras
 * salen de la base (`ofertas_publicas()`), nunca de aquí: sin una cifra, la
 * frase que la lleva no sale.
 */
export function frasesDeCinta(o: OfertasPublicas | null): string[] {
  if (!o || !o.encendidas) return [];
  const frases: string[] = [];
  if (o.pareja_pct) frases.push(`Llévate dos y ahorra ${formatearDescuento(o.pareja_pct)}`);
  if (o.combos.length > 0) {
    const mas = Math.max(...o.combos.map((c) => c.pct));
    frases.push(`Combos de la semana, hasta ${formatearDescuento(mas)} menos`);
  }
  if (o.seleccion && o.seleccion.piezas.length > 0) {
    frases.push(`Selección de la casa: ${formatearDescuento(o.seleccion.pct)} menos`);
  }
  if (o.regalo.length > 0) frases.push('Conjuntos para regalar, con descuento');
  for (const c of o.casa) frases.push(`${c.nombre}: ${formatearDescuento(c.pct)} menos`);
  return frases;
}

/**
 * Una franja fina de oro sobre verde que pasa despacio con las ofertas del
 * momento. Con `prefers-reduced-motion` no corre: las frases se quedan
 * quietas y bajan de línea. Sin ofertas, no sale.
 *
 * La lista va dos veces para que el bucle no tenga salto; la segunda copia
 * está oculta para el lector de pantalla.
 */
export function Cintas({ ofertas }: { ofertas: OfertasPublicas | null }) {
  const frases = frasesDeCinta(ofertas);
  const [parada, setParada] = useState(false);
  // Fuera de pantalla no corre: no gasta batería ni fotogramas.
  const [ref, visible] = useAparecer<HTMLDivElement>(true);
  if (frases.length === 0) return null;
  return (
    <div ref={ref} className={parada || !visible ? 'lp-cinta lp-cinta--parada' : 'lp-cinta'} role="region" aria-label="Ofertas del momento">
      <button type="button" className="lp-cinta__pausa" aria-pressed={parada} onClick={() => setParada((p) => !p)}>
        {parada ? 'Mover las ofertas' : 'Parar las ofertas'}
      </button>
      <div className="lp-cinta__pista">
        {[0, 1].map((copia) => (
          <ul key={copia} className="lp-cinta__lista" aria-hidden={copia === 1 ? 'true' : undefined}>
            {frases.map((f, n) => (
              <li key={`${n}-${f}`} className="lp-cinta__frase">{f}</li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
