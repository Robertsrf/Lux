import type { ReactNode } from 'react';

/**
 * Los gráficos del sistema, en HTML y CSS. Sin librería.
 *
 * Una librería de gráficos pesa más que todo el resto del paquete junto, y
 * aquí hacen falta dos formas: barras apiladas y barras horizontales. En
 * CSS son cuarenta líneas, se ven igual en el Android de la tienda, y la
 * paleta es la de la casa sin pelear con la de nadie.
 *
 * LOS COLORES ESTÁN MEDIDOS, NO ELEGIDOS A OJO
 * Salvia (#7F9492) para el costo y verde (#2E5A61) para la ganancia pasan
 * separación por daltonismo (ΔE 20,2 protan), umbral de visión normal y
 * contraste contra el blanco. El oro se descartó por esto mismo: contra la
 * salvia da ΔE 14,5, o sea que se confunden incluso con vista perfecta.
 *
 * Lo único que no cumple la regla general es la saturación, y es a
 * propósito: la paleta de Lux es apagada porque el lujo aquí no se grita.
 */

/* ------------------------------------------------------------ cifra suelta */

/** Un número protagonista. Cuando el dato es uno solo, un gráfico estorba. */
export function Cifra({ etiqueta, valor, nota, tono }: {
  etiqueta: string;
  valor: string;
  nota?: string;
  tono?: 'positivo' | 'negativo';
}) {
  return (
    <div className="cifra">
      <span className="cifra__etiqueta">{etiqueta}</span>
      <div className={`cifra__valor${tono ? ` cifra__valor--${tono}` : ''}`}>{valor}</div>
      {nota ? <div className="cifra__nota">{nota}</div> : null}
    </div>
  );
}

/* ------------------------------------------------- barras apiladas por día */

export interface Columna {
  clave: string;
  etiqueta: string;
  costo: number;
  ganancia: number;
  /** Lo que se lee al pasar por encima. */
  detalle: string;
}

/**
 * Costo y ganancia apilados: juntos son el ingreso del día.
 *
 * Apilarlos y no ponerlos lado a lado es a propósito. Así el alto total de
 * la columna ES lo cobrado, y de un vistazo se ve la proporción entre lo
 * que costó y lo que quedó. Dos ejes distintos para dos medidas —el error
 * clásico— aquí ni se plantea: las dos son dólares.
 */
export function BarrasApiladas({ columnas, formato, vacio }: {
  columnas: Columna[];
  formato: (n: number) => string;
  vacio: ReactNode;
}) {
  if (columnas.length === 0) return <div className="gráfico-vacio">{vacio}</div>;

  const tope = Math.max(...columnas.map((c) => c.costo + c.ganancia), 0);
  if (tope <= 0) return <div className="gráfico-vacio">{vacio}</div>;

  return (
    <figure className="grafico">
      <div className="leyenda">
        <span className="leyenda__punto leyenda__punto--costo" aria-hidden="true" />
        <span>Costo</span>
        <span className="leyenda__punto leyenda__punto--ganancia" aria-hidden="true" />
        <span>Ganancia</span>
      </div>

      <div className="grafico__lienzo" role="list">
        {columnas.map((c) => {
          const total = c.costo + c.ganancia;
          return (
            <div className="columna" key={c.clave} role="listitem" tabIndex={0}>
              <div className="columna__pila" style={{ height: `${(total / tope) * 100}%` }}>
                {/* La ganancia va arriba: es lo que se busca al mirar. */}
                <div
                  className="columna__parte columna__parte--ganancia"
                  style={{ flexBasis: `${total > 0 ? (c.ganancia / total) * 100 : 0}%` }}
                />
                <div
                  className="columna__parte columna__parte--costo"
                  style={{ flexBasis: `${total > 0 ? (c.costo / total) * 100 : 0}%` }}
                />
              </div>
              <span className="columna__etiqueta">{c.etiqueta}</span>
              <div className="globo" role="tooltip">
                <strong>{c.etiqueta}</strong>
                <span>Cobrado {formato(total)}</span>
                <span>Ganancia {formato(c.ganancia)}</span>
                <span>Costo {formato(c.costo)}</span>
                {c.detalle ? <span>{c.detalle}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/* ------------------------------------------ barras horizontales por partida */

export interface Partida {
  clave: string;
  etiqueta: string;
  valor: number;
  nota?: string;
}

/**
 * Magnitudes por categoría: gastos, ganancia por grupo, lo que sea.
 *
 * Un solo color a propósito. Lo que dice cuánto es el LARGO de la barra;
 * pintarlas de siete colores distintos no añade nada y obliga a mirar una
 * leyenda para leer lo que ya está escrito al lado.
 *
 * Horizontales y no verticales porque las etiquetas son palabras, y en
 * vertical hay que torcer la cabeza o el texto.
 */
export function BarrasHorizontales({ partidas, formato, vacio }: {
  partidas: Partida[];
  formato: (n: number) => string;
  vacio: ReactNode;
}) {
  if (partidas.length === 0) return <div className="gráfico-vacio">{vacio}</div>;

  const tope = Math.max(...partidas.map((p) => p.valor), 0);
  if (tope <= 0) return <div className="gráfico-vacio">{vacio}</div>;

  return (
    <ul className="barras">
      {partidas.map((p) => (
        <li className="barra" key={p.clave}>
          <span className="barra__etiqueta">{p.etiqueta}</span>
          <span className="barra__valor">
            {formato(p.valor)}
            {p.nota ? <small className="barra__nota">{p.nota}</small> : null}
          </span>
          <span className="barra__pista">
            <span className="barra__relleno" style={{ width: `${(p.valor / tope) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
