import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export interface OpcionVariante {
  id: number;
  /** "45 cm". */
  etiqueta: string;
  /** Una linea corta debajo: "Quedan 3 · minimo Bs 1.215,00". */
  detalle?: string | null;
  /** Los precios ya formateados por la pantalla: cada cara ensena los suyos. */
  precios: ReactNode;
  deshabilitada?: boolean;
  /** Cuantas de esta ya van en la venta o el pedido. */
  llevas?: number;
}

/**
 * Elegir una variante: la hoja que sale al tocar un producto que tiene
 * varias (una cadena de 45 y otra de 60 cm).
 *
 * POR QUE UNA HOJA Y NO FICHAS EN LA TARJETA
 * En el mostrador un toque agrega la pieza. Con dos medidas, ese toque no
 * sabe cual, asi que hace falta un segundo toque que lo diga, y ese segundo
 * toque necesita un blanco de 56 px. En una tarjeta de 160 px de ancho no
 * caben tres fichas de ese tamano sin volverla una lista; en una hoja que
 * sube desde abajo, al alcance del pulgar, caben todas con su precio y lo
 * que queda. Un toque para abrir, otro para elegir, y la hoja se cierra
 * sola: dos toques, que es lo minimo cuando hay que decidir algo.
 *
 * En escritorio es la misma hoja, centrada.
 *
 * Se cierra con Escape, con el fondo o con el boton, y devuelve el foco a
 * la tarjeta que la abrio.
 */
export function ElegirVariante({
  titulo, subtitulo, opciones, alElegir, alCerrar,
}: {
  titulo: string;
  subtitulo?: string | null;
  opciones: OpcionVariante[];
  alElegir: (id: number) => void;
  alCerrar: () => void;
}) {
  const idTitulo = useId();
  const primera = useRef<HTMLButtonElement>(null);
  const previo = useRef<Element | null>(null);
  // En una referencia, para que el efecto corra UNA vez al abrir: si
  // dependiera de la funcion, cada render de la pantalla le robaria el foco
  // a la opcion en la que esta el teclado.
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  useEffect(() => {
    previo.current = document.activeElement;
    primera.current?.focus();
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar.current(); };
    document.addEventListener('keydown', alTeclear);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflow;
      (previo.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const primeraLibre = opciones.findIndex((o) => !o.deshabilitada);

  return (
    <div className="elegir-fondo" onClick={alCerrar}>
      <div
        className="elegir"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="elegir__asa" aria-hidden="true" />
        <div className="elegir__cabeza">
          <div>
            <h2 className="elegir__titulo" id={idTitulo}>{titulo}</h2>
            {subtitulo ? <p className="elegir__subtitulo">{subtitulo}</p> : null}
          </div>
          <button type="button" className="elegir__cerrar" onClick={alCerrar} aria-label="Cerrar sin elegir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="elegir__opciones">
          {opciones.map((o, i) => (
            <button
              key={o.id}
              ref={i === primeraLibre ? primera : undefined}
              type="button"
              className="opcion-variante"
              disabled={o.deshabilitada}
              onClick={() => alElegir(o.id)}
            >
              <span className="opcion-variante__nombre">
                <span className="opcion-variante__etiqueta">{o.etiqueta}</span>
                {o.detalle ? <span className="opcion-variante__detalle">{o.detalle}</span> : null}
              </span>
              <span className="opcion-variante__precios">{o.precios}</span>
              {o.llevas ? <span className="opcion-variante__llevas" aria-label={`Llevas ${o.llevas}`}>{o.llevas}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
