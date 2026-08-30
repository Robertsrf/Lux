import cremaUrl from '../marca/wordmark-crema.webp';
import verdeUrl from '../marca/wordmark-verde.webp';
import arenaUrl from '../marca/wordmark-arena.webp';
import selloUrl from '../marca/sello-arena.webp';

/**
 * Los logotipos reales de la casa, optimizados por scripts/preparar-logos.mjs
 * desde los originales de marca-original/. Nunca se redibujan con CSS ni se
 * deforman: se elige el archivo del color que toca y se le da alto.
 *
 * Que version usar:
 *   crema  -> sobre verde profundo (barra lateral, acceso, catalogo publico)
 *   verde  -> sobre crema o blanco (portada del catalogo impreso)
 *   arena  -> sobre fondos oscuros donde el oro deba destacar
 *
 * El oro sobre crema en piezas pequenas es ilegible: por eso el wordmark
 * verde es el unico permitido sobre papel.
 */

export type TonoMarca = 'crema' | 'verde' | 'arena';

const FUENTES: Record<TonoMarca, string> = {
  crema: cremaUrl,
  verde: verdeUrl,
  arena: arenaUrl,
};

export function Wordmark({ alto = 34, tono = 'crema' }: { alto?: number; tono?: TonoMarca }) {
  return (
    <img
      className="wordmark"
      src={FUENTES[tono]}
      alt="Lux by Emory"
      style={{ height: alto }}
      width={alto * 1.76}
      height={alto}
    />
  );
}

/** El monograma L como sello, sobre verde profundo. */
export function Monograma({ tamano = 40 }: { tamano?: number }) {
  return (
    <span className="monograma" style={{ width: tamano, height: tamano }}>
      <img src={selloUrl} alt="" aria-hidden="true" style={{ height: Math.round(tamano * 0.58) }} />
    </span>
  );
}

/** Las dos lineas finas del wordmark, reutilizadas como divisor. */