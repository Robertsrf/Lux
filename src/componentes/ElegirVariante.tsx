import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { cuadroDe, MUCHAS_OPCIONES } from '../lib/familias';

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
  /** Cuantas quedan. Con muchas opciones, es lo unico que dice cada ficha. */
  quedan?: number;
  /**
   * Las opciones con la misma clave cuestan lo mismo, y `detalle` es lo que
   * dicen todas las de ese precio (en el mostrador, el minimo). Con muchas
   * opciones la hoja dice el precio una vez y las pone en fichas.
   */
  precio?: { clave: string; detalle?: string | null };
}

interface Grupo {
  nombre: string | null;
  opciones: { indice: number; corta: string }[];
}

/**
 * Las opciones en fichas, si se puede: mas de MUCHAS_OPCIONES, todas con lo
 * que queda y su precio, y un solo precio en cada grupo. Si no, null y van
 * en renglones.
 */
function enFichas(opciones: OpcionVariante[]): Grupo[] | null {
  if (opciones.length <= MUCHAS_OPCIONES) return null;
  if (opciones.some((o) => o.quedan === undefined || !o.precio)) return null;
  const grupos: Grupo[] = cuadroDe(opciones.map((o) => o.etiqueta))
    ?? [{ nombre: null, opciones: opciones.map((o, indice) => ({ indice, corta: o.etiqueta })) }];
  const unPrecio = grupos.every((g) => new Set(g.opciones.map((x) => opciones[x.indice]!.precio!.clave)).size === 1);
  return unPrecio ? grupos : null;
}

function quedanTexto(n: number): string {
  return n === 1 ? 'Queda 1' : `Quedan ${n}`;
}

/**
 * El precio de un grupo de fichas, con lo que dicen todas las de ese precio.
 * Cada ficha lo nombra con `aria-describedby`: el foco cae en la primera y
 * el lector de pantalla no pasa por aqui.
 */
function PrecioComun({ opcion, id }: { opcion: OpcionVariante; id: string }) {
  return (
    <div className="elegir__precio" id={id}>
      <span className="elegir__precio-cifras">{opcion.precios}</span>
      {opcion.precio?.detalle ? <span className="opcion-variante__detalle">{opcion.precio.detalle}</span> : null}
    </div>
  );
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
 * CON MUCHAS, FICHAS
 * El dije de letra burbuja trae 52 opciones del mismo precio: en
 * renglones de 64 px era una hoja de 3.700 px para encontrar la "Z". Con
 * mas de MUCHAS_OPCIONES y un precio por grupo, el precio se dice una vez y
 * cada opcion es una ficha con su nombre y lo que queda; si son un cuadro
 * ("A DORADO", "A PLATEADO"...), van partidas en "Dorado" y "Plateado" con
 * una letra por ficha.
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
  const idPrecio = useId();
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

  const grupos = enFichas(opciones);
  // La primera libre en el orden en que se VEN: en fichas partidas por
  // color, "A PLATEADO" va despues de toda la fila dorada. Si el foco cayera
  // ahi (porque ya se lleva la unica "A DORADO"), la hoja se desplazaria y
  // esconderia el titulo, el precio y el grupo dorado entero.
  const orden = grupos ? grupos.flatMap((g) => g.opciones.map((x) => x.indice)) : opciones.map((_, i) => i);
  const primeraLibre = orden.find((i) => !opciones[i]!.deshabilitada) ?? -1;
  // Un solo precio en toda la hoja: se dice una vez, arriba. Si cada grupo
  // tiene el suyo, va sobre sus fichas.
  const unoArriba = grupos !== null
    && new Set(opciones.map((o) => o.precio!.clave)).size === 1;
  // Una letra por ficha caben cuatro en un telefono de 360 px (tres en uno
  // de 320); un nombre largo, tres.
  const cortas = grupos !== null && grupos.every((g) => g.opciones.every((x) => x.corta.length <= 3));

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

        {grupos ? (
          <div className="elegir__grupos">
            {unoArriba ? <PrecioComun opcion={opciones[0]!} id={`${idPrecio}-arriba`} /> : null}
            {grupos.map((g, n) => {
              const conPrecio = !unoArriba ? opciones[g.opciones[0]!.indice]! : null;
              const suPrecio = unoArriba ? `${idPrecio}-arriba` : `${idPrecio}-${n}`;
              return (
                <section key={g.nombre ?? n} className="elegir__grupo">
                  {g.nombre || conPrecio ? (
                    <div className="elegir__grupo-cabeza">
                      {g.nombre ? <h3 className="elegir__grupo-nombre">{g.nombre}</h3> : null}
                      {conPrecio ? <PrecioComun opcion={conPrecio} id={suPrecio} /> : null}
                    </div>
                  ) : null}
                  <div className={cortas ? 'elegir__fichas elegir__fichas--cortas' : 'elegir__fichas'}>
                    {g.opciones.map(({ indice, corta }) => {
                      const o = opciones[indice]!;
                      return (
                        <button
                          key={o.id}
                          ref={indice === primeraLibre ? primera : undefined}
                          type="button"
                          className="ficha-variante"
                          disabled={o.deshabilitada}
                          onClick={() => alElegir(o.id)}
                          aria-label={`${o.etiqueta}. ${quedanTexto(o.quedan!)}${o.llevas ? `. Llevas ${o.llevas}` : ''}`}
                          aria-describedby={suPrecio}
                        >
                          <span className="ficha-variante__nombre">{corta}</span>
                          <span className="ficha-variante__quedan">{quedanTexto(o.quedan!)}</span>
                          {o.llevas ? <span className="opcion-variante__llevas" aria-hidden="true">{o.llevas}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
