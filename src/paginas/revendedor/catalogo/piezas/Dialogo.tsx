import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Una hoja que sube desde abajo (en el teléfono) o se centra (en la
 * computadora), con el `<dialog>` del navegador: atrapa el foco, Escape la
 * cierra y lo de atrás no se puede tocar. Se cierra también tocando fuera.
 */
export function Dialogo({ abierto, alCerrar, titulo, children, clase = '' }: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  children: ReactNode;
  clase?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  // Mientras está abierta, la página de atrás no se desplaza.
  useEffect(() => {
    if (!abierto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      className={`rvc-dialogo ${clase}`}
      aria-label={titulo}
      onCancel={(e) => { e.preventDefault(); alCerrar(); }}
      onClick={(e) => { if (e.target === ref.current) alCerrar(); }}
    >
      {abierto ? <div className="rvc-dialogo__caja">{children}</div> : null}
    </dialog>
  );
}
