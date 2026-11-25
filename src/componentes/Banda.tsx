import type { ReactNode } from 'react';

/**
 * La Banda del Estuche (fase 9): la cifra que manda en una pantalla, en
 * grande y sobre el verde. Una por pantalla como mucho: es el
 * protagonista. Una pantalla sin una cifra que mande no la lleva.
 *
 * Recibe las cifras ya formateadas (cada "$" diciendo cuál es): la Banda
 * solo dibuja, no cuenta.
 */
export function Banda({ etiqueta, cifra, moneda, detalle, progreso, cuadritos, children }: {
  /** Qué es la cifra: "Noviembre, hasta hoy". En oro, en mayúsculas. */
  etiqueta: string;
  /** La cifra, ya formateada: "$2.200,00". */
  cifra: string;
  /** La moneda detrás de la cifra, más chica: "BCV vendido". */
  moneda?: string;
  detalle?: ReactNode;
  /** Una barra de avance: lo que dice y cuánto (0 a 100; se recorta). */
  progreso?: { texto: string; valor: string; pct: number } | null;
  /** Hasta cuatro cifras de apoyo. */
  cuadritos?: { etiqueta: string; valor: ReactNode }[];
  children?: ReactNode;
}) {
  const pct = progreso ? Math.max(0, Math.min(100, progreso.pct)) : 0;
  return (
    <section className="banda" aria-label={etiqueta}>
      <div>
        <span className="banda__etiqueta">{etiqueta}</span>
        <span className="banda__cifra">
          {cifra}
          {moneda ? <span className="banda__moneda">{moneda}</span> : null}
        </span>
      </div>
      {detalle ? <div className="banda__detalle">{detalle}</div> : null}
      {progreso ? (
        <div className="banda__progreso">
          <div className="banda__progreso-texto"><span>{progreso.texto}</span><strong className="cifra">{progreso.valor}</strong></div>
          <div className="banda__barra" role="presentation"><span style={{ width: `${pct}%` }} /></div>
        </div>
      ) : null}
      {cuadritos && cuadritos.length > 0 ? (
        <dl className="banda__cuadritos">
          {cuadritos.slice(0, 4).map((c) => (
            <div key={c.etiqueta} className="banda__cuadrito">
              <dt>{c.etiqueta}</dt>
              <dd>{c.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </section>
  );
}
