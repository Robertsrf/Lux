import type { CSSProperties } from 'react';

/*
  LAS FILIGRANAS DE LA VITRINA

  Línea fina de oro que se dibuja sola: el estuche que se abre. Cada trazo
  lleva `pathLength="1"`, así el CSS lo dibuja de 0 a 1 sin saber cuánto
  mide (vitrina.css, `.trazo`). Son adorno: van ocultas para el lector de
  pantalla, y con movimiento reducido salen ya dibujadas.

  Sin `vector-effect`: con el trazo que no escala, algunos navegadores
  calculan mal el guion de la línea y el dibujo sale a saltos. Por eso los
  marcos guardan la proporción de su caja (el arco es siempre 3:4).
*/

type Retraso = { retraso?: number };

const conRetraso = (s: number | undefined): CSSProperties | undefined =>
  (s ? ({ '--retraso': `${s}s` } as CSSProperties) : undefined);

/** Una mitad del divisor; la otra es la misma, en espejo. */
function MitadDivisor() {
  return (
    <>
      <path className="trazo" pathLength={1} d="M14 20 L132 20" />
      <path className="trazo trazo--tarde" pathLength={1} d="M132 20 C146 20 152 9 162 9 C171 9 174 18 168 22 C163 25 157 21 160 17" />
      <path className="trazo trazo--tarde" pathLength={1} d="M148 20 C157 24 159 31 168 31 C174 31 176 27 173 25" />
      <circle className="filigrana__punto" cx="180" cy="20" r="1.8" />
    </>
  );
}

/** La línea con volutas y el rombo al centro: separa el nombre del precio. */
export function FiligranaDivisor({ className = '', retraso }: { className?: string } & Retraso) {
  // Dentro de un div: la vitrina mide sus cajas con offsetTop y offsetHeight,
  // que un SVG no tiene.
  return (
    <div className={`filigrana-divisor ${className}`} aria-hidden="true" style={conRetraso(retraso)}>
      <svg className="filigrana filigrana--divisor" viewBox="0 0 400 40">
        <g fill="none">
          <MitadDivisor />
          <g transform="translate(400 0) scale(-1 1)"><MitadDivisor /></g>
          <path className="trazo trazo--ultimo" pathLength={1} d="M186 20 L200 7 L214 20 L200 33 Z" />
        </g>
      </svg>
    </div>
  );
}

/** Una esquina: el marco que se abre alrededor de una frase. */
function Esquina({ donde }: { donde: 'si' | 'sd' | 'ii' | 'id' }) {
  return (
    <svg className={`filigrana filigrana--esquina filigrana--${donde}`} viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none">
        <path className="trazo" pathLength={1} d="M3 97 L3 30 C3 15 15 3 30 3 L97 3" />
        <path className="trazo trazo--tarde" pathLength={1} d="M14 80 L14 36 C14 23 23 14 36 14 L80 14" />
        <path className="trazo trazo--ultimo" pathLength={1} d="M24 24 C32 16 46 20 44 31 C42 40 31 38 33 31 C34 27 38 27 39 30" />
      </g>
    </svg>
  );
}

/** Las cuatro esquinas, sobre la caja que las contiene. */
export function FiligranaMarco({ retraso }: Retraso) {
  return (
    <div className="filigrana-marco" aria-hidden="true" style={conRetraso(retraso)}>
      <Esquina donde="si" />
      <Esquina donde="sd" />
      <Esquina donde="ii" />
      <Esquina donde="id" />
    </div>
  );
}

/**
 * El arco de vitrina alrededor de una foto: dos líneas, la de fuera y una
 * más fina por dentro, que se dibujan desde abajo. La caja es 3:4.
 */
export function FiligranaArco({ retraso }: Retraso) {
  return (
    <svg className="filigrana filigrana--arco" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true" style={conRetraso(retraso)}>
      <g fill="none">
        <path className="trazo trazo--lento" pathLength={1} d="M2 400 L2 150 A148 148 0 0 1 298 150 L298 400" />
        <path className="trazo trazo--lento trazo--tarde filigrana__fina" pathLength={1} d="M14 400 L14 150 A136 136 0 0 1 286 150 L286 400" />
      </g>
    </svg>
  );
}
