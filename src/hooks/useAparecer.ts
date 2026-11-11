import { useEffect, useRef, useState, type RefObject } from 'react';

function sinMovimiento(): boolean {
  try {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Dice si un elemento ya entró en pantalla. Con `repetir` falso (lo normal,
 * para que algo aparezca) avisa una vez y se desconecta; con `repetir`
 * verdadero sigue la visibilidad (el slider se para cuando no se ve).
 *
 * Con `prefers-reduced-motion` o sin `IntersectionObserver` empieza en
 * `true`: lo que aparece tiene que verse siempre, quieto si hace falta.
 */
export function useAparecer<T extends Element>(repetir = false): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState<boolean>(
    () => typeof IntersectionObserver === 'undefined' || (!repetir && sinMovimiento()),
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            setVisible(true);
            if (!repetir) obs.disconnect();
          } else if (repetir) {
            setVisible(false);
          }
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [repetir]);

  return [ref, visible];
}
