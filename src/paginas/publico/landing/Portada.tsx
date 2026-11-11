import { useCallback, useEffect, useRef, useState } from 'react';
import { Icono } from '../../../componentes/Iconos';
import { fotoDeLanding } from '../../../lib/fotos';
import { useAparecer } from '../../../hooks/useAparecer';
import type { ElementoLanding } from '../../../hooks/useLanding';
import { BotonDestino } from './contexto';

/** Cada cuánto pasa sola la diapositiva. */
const CADA_MS = 6000;

function sinMovimiento(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * La portada: un slider de fotos de ambiente, una frase y un botón por
 * diapositiva. Es lo primero que ve quien abre la página, así que la
 * primera foto carga ya (`fetchpriority="high"`, sin `lazy`) y las demás
 * esperan.
 *
 * El movimiento es poco y se puede parar:
 * - pasa sola cada 6 s, pero se detiene para siempre en cuanto la clienta
 *   la toca, la desliza o navega con el teclado, mientras no se ve la
 *   portada y cuando la pestaña está en segundo plano;
 * - hay un botón de pausa (quien lee despacio no tiene que perseguirla);
 * - con `prefers-reduced-motion` no pasa sola ni se acerca la foto;
 * - el acercamiento lento de la foto (Ken Burns) es solo `transform`.
 *
 * En el teléfono la foto va arriba y el texto debajo, sobre verde
 * profundo: la joya queda a la vista y el contraste no depende de qué
 * parte de la foto haya detrás. En pantallas anchas el texto va sobre la
 * foto, con un velo de verde profundo que lo sostiene a 4,5:1.
 */
export function Portada({ diapositivas }: { diapositivas: ElementoLanding[] }) {
  const lista = diapositivas.filter((d) => d.foto);
  const pista = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);
  // Parada: la tocó, la deslizó o apretó la pausa. Desde ahí no pasa sola.
  const [parada, setParada] = useState(false);
  const [ref, visible] = useAparecer<HTMLElement>(true);
  const [segundoPlano, setSegundoPlano] = useState(false);
  const quieto = useRef(sinMovimiento());

  // Con la pestaña en segundo plano no pasa.
  useEffect(() => {
    const alCambiar = () => setSegundoPlano(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);

  const irA = useCallback((n: number, suave: boolean) => {
    const el = pista.current;
    if (!el) return;
    el.scrollTo({ left: n * el.clientWidth, behavior: suave && !quieto.current ? 'smooth' : 'auto' });
  }, []);

  // Cuál se ve, a partir de cuánto se ha deslizado.
  const alDeslizar = useCallback(() => {
    const el = pista.current;
    if (!el || el.clientWidth === 0) return;
    setActual(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  const pasaSola = lista.length > 1 && !parada && visible && !segundoPlano && !quieto.current;
  useEffect(() => {
    if (!pasaSola) return;
    const id = window.setInterval(() => {
      const el = pista.current;
      if (!el) return;
      const siguiente = (Math.round(el.scrollLeft / el.clientWidth) + 1) % lista.length;
      irA(siguiente, true);
    }, CADA_MS);
    return () => window.clearInterval(id);
  }, [pasaSola, lista.length, irA]);

  if (lista.length === 0) return null;
  const alTocar = () => setParada(true);

  return (
    <section
      className="lp-portada"
      ref={ref}
      aria-roledescription="carrusel"
      aria-label="Lux by Emory"
    >
      <div className="lp-portada__pista" ref={pista} onScroll={alDeslizar} onPointerDown={alTocar} onKeyDown={alTocar}>
        {lista.map((d, n) => {
          const foto = fotoDeLanding(d.foto, '(min-width: 1180px) 1180px, 100vw');
          const esta = n === actual;
          return (
            <article
              key={d.foto ?? n}
              className={esta ? 'lp-portada__diapositiva lp-portada__diapositiva--viva' : 'lp-portada__diapositiva'}
              aria-roledescription="diapositiva"
              aria-label={`${n + 1} de ${lista.length}`}
              inert={!esta}
            >
              <div className="lp-portada__foto">
                {foto ? (
                  <img
                    {...foto}
                    alt={d.alt ?? ''}
                    loading={n === 0 ? 'eager' : 'lazy'}
                    fetchPriority={n === 0 ? 'high' : 'auto'}
                    decoding={n === 0 ? 'sync' : 'async'}
                    width={1600}
                    height={1067}
                  />
                ) : null}
              </div>
              <div className="lp-portada__texto">
                {d.frase ? <h2 className="lp-portada__frase">{d.frase}</h2> : null}
                {d.texto ? <p className="lp-portada__parrafo">{d.texto}</p> : null}
                <BotonDestino boton={d.boton} sobreVerde />
              </div>
            </article>
          );
        })}
      </div>

      {lista.length > 1 ? (
        <div className="lp-portada__mandos">
          <div className="lp-portada__puntos" role="group" aria-label="Elegir diapositiva">
            {lista.map((d, n) => (
              <button
                key={d.foto ?? n}
                type="button"
                className="lp-portada__punto"
                aria-label={`Diapositiva ${n + 1} de ${lista.length}`}
                aria-current={n === actual ? 'true' : undefined}
                onClick={() => { setParada(true); irA(n, true); }}
              />
            ))}
          </div>
          {!quieto.current ? (
            <button
              type="button"
              className="lp-portada__pausa"
              aria-label={parada ? 'Hacer que las fotos pasen solas' : 'Detener el paso automático de las fotos'}
              onClick={() => setParada((p) => !p)}
            >
              <Icono nombre={parada ? 'reproducir' : 'pausa'} className="icono icono--sm" />
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
