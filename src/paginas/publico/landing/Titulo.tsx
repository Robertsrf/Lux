import type { ReactNode } from 'react';

/**
 * El título de una sección de la landing: Fraunces, y debajo dos líneas
 * finas de oro, el ornamento de la casa. `texto` es la frase corta que lo
 * acompaña.
 */
export function Titulo({ id, children, texto }: { id: string; children: ReactNode; texto?: string | null }) {
  return (
    <header className="lp-titulo">
      <h2 className="lp-titulo__h" id={id}>{children}</h2>
      <span className="lp-titulo__lineas" aria-hidden="true" />
      {texto ? <p className="lp-titulo__texto">{texto}</p> : null}
    </header>
  );
}
