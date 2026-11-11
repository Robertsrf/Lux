import { useCallback, useRef } from 'react';
import { Icono } from '../../../componentes/Iconos';
import { fotoDeLanding } from '../../../lib/fotos';
import type { SeccionLanding } from '../../../hooks/useLanding';
import { Titulo } from './Titulo';

/**
 * "Así se llevan": fotos de ambiente en un carrusel horizontal. Se desliza
 * con el dedo y también tiene dos flechas siempre a la vista: un gesto sin
 * botón es un camino que nadie encuentra. La barra del carrusel se deja
 * ver, para que quien no desliza sepa que hay más.
 */
export function Galeria({ seccion }: { seccion: SeccionLanding }) {
  const pista = useRef<HTMLUListElement>(null);
  const fotos = (seccion.datos.diapositivas ?? []).filter((d) => d.foto);

  const mover = useCallback((paso: 1 | -1) => {
    const el = pista.current;
    if (!el) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: paso * el.clientWidth * 0.85, behavior: quieto ? 'auto' : 'smooth' });
  }, []);

  if (fotos.length === 0) return null;
  return (
    <section className="lp-galeria" aria-labelledby={`t-${seccion.id}`}>
      {seccion.titulo ? <Titulo id={`t-${seccion.id}`} texto={seccion.texto}>{seccion.titulo}</Titulo> : null}
      <ul className="lp-galeria__pista" ref={pista} tabIndex={0} aria-label="Fotos, desliza para ver más">
        {fotos.map((d, n) => {
          const foto = fotoDeLanding(d.foto, '(min-width: 900px) 300px, 70vw');
          return foto ? (
            <li key={d.foto ?? n} className="lp-galeria__foto">
              <img {...foto} alt={d.alt ?? ''} loading="lazy" decoding="async" width={800} height={800} />
            </li>
          ) : null;
        })}
      </ul>
      <div className="lp-galeria__flechas">
        <button type="button" className="lp-flecha" aria-label="Ver las fotos anteriores" onClick={() => mover(-1)}>
          <Icono nombre="atras" />
        </button>
        <button type="button" className="lp-flecha" aria-label="Ver más fotos" onClick={() => mover(1)}>
          <Icono nombre="adelante" />
        </button>
      </div>
    </section>
  );
}
