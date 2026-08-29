import { Children, cloneElement, isValidElement, useEffect, useRef } from 'react';
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

/**
 * Resumen de errores de un formulario. Se lleva el foco al aparecer, para que
 * quien navega con teclado o lector de pantalla sepa que fallo sin buscarlo.
 * No sustituye a los errores por campo: van juntos.
 */
export function ResumenErrores({ titulo, children }: { titulo: string; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => { caja.current?.focus(); }, []);
  return (
    <div className="aviso aviso--error" role="alert" tabIndex={-1} ref={caja}>
      <strong>{titulo}</strong>
      {children}
    </div>
  );
}

export function Cargando({ texto = 'Cargando' }: { texto?: string }) {
  return <p className="cargando" role="status" aria-busy="true">{texto}</p>;
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <h3>{titulo}</h3>
      {children}
    </div>
  );
}

/**
 * Campo de formulario. El error va DEBAJO del control y queda enlazado con
 * aria-describedby, y el control se marca aria-invalid: asi el error se lee
 * junto al campo que lo causa, no solo en un resumen arriba.
 */
export function Campo({ etiqueta, pista, error, children, htmlFor }: {
  etiqueta: string;
  pista?: string;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) {
  const idPista = pista && htmlFor ? `${htmlFor}-pista` : undefined;
  const idError = error && htmlFor ? `${htmlFor}-error` : undefined;
  const descrito = [idError, idPista].filter(Boolean).join(' ') || undefined;

  const hijo = Children.only(children);
  const control = isValidElement(hijo)
    ? cloneElement(hijo as React.ReactElement<Record<string, unknown>>, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': descrito,
      })
    : hijo;

  return (
    <div className={error ? 'campo campo--con-error' : 'campo'}>
      <label htmlFor={htmlFor}>{etiqueta}</label>
      {control}
      {error ? <span className="campo__error" id={idError}>{error}</span> : null}
      {pista ? <span className="campo__pista" id={idPista}>{pista}</span> : null}
    </div>
  );
}
