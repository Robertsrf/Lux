import type { ReactNode } from 'react';

/**
 * Piezas compartidas. Voz de la interfaz: sentence case, verbos planos, sin
 * relleno. Un estado vacio es una invitacion a actuar, no un lamento. Un error
 * dice que paso y como arreglarlo, sin disculparse.
 */

export type TonoAviso = 'neutro' | 'exito' | 'alerta' | 'error';

export function Aviso({ tono = 'neutro', titulo, children }: {
  tono?: TonoAviso;
  titulo?: string;
  children: ReactNode;
}) {
  const clase = tono === 'neutro' ? 'aviso' : `aviso aviso--${tono}`;
  return (
    <div className={clase} role={tono === 'error' ? 'alert' : 'status'}>
      {titulo ? <strong>{titulo}</strong> : null}
      {children}
    </div>
  );
}

export function Cargando({ texto = 'Cargando' }: { texto?: string }) {
  return <p className="cargando">{texto}</p>;
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <h3>{titulo}</h3>
      {children}
    </div>
  );
}

export function Campo({ etiqueta, pista, children, htmlFor }: {
  etiqueta: string;
  pista?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="campo">
      <label htmlFor={htmlFor}>{etiqueta}</label>
      {children}
      {pista ? <span className="campo__pista">{pista}</span> : null}
    </div>
  );
}
