import { Children, cloneElement, Component, isValidElement, useEffect, useRef } from 'react';
import type { ErrorInfo } from 'react';
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

  // Se marca SOLO el primer elemento: es el control. Un campo puede traer
  // mas de un hijo — un input y su datalist, por ejemplo — y aqui no se
  // puede exigir uno solo: Children.only lanza y deja la pantalla en blanco.
  let marcado = false;
  const control = Children.toArray(children).map((hijo) => {
    if (marcado || !isValidElement(hijo)) return hijo;
    marcado = true;
    return cloneElement(hijo as React.ReactElement<Record<string, unknown>>, {
      'aria-invalid': error ? true : undefined,
      'aria-describedby': descrito,
    });
  });

  return (
    <div className={error ? 'campo campo--con-error' : 'campo'}>
      <label htmlFor={htmlFor}>{etiqueta}</label>
      {control}
      {error ? <span className="campo__error" id={idError}>{error}</span> : null}
      {pista ? <span className="campo__pista" id={idPista}>{pista}</span> : null}
    </div>
  );
}

/**
 * Red de seguridad. Sin esto, cualquier excepcion durante el render deja la
 * pantalla COMPLETAMENTE en blanco y sin pista de que paso: fue exactamente
 * lo que ocurrio cuando un campo con dos hijos hizo reventar a Children.only.
 *
 * Ahora el fallo se ve, se puede reportar y el resto del sistema sigue en pie.
 */
export class LimiteDeError extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fallo de la interfaz', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="pagina pagina--angosta">
        <Aviso tono="error" titulo="Esta pantalla fallo">
          <p>
            No se pudo dibujar esta parte del sistema. El resto sigue en pie:
            entra a otra seccion por el menu y esta se rearma sola cuando
            vuelvas.
          </p>
          <p className="campo__pista">Detalle tecnico: {this.state.error.message}</p>
        </Aviso>
        <div className="acciones acciones--sueltas">
          <button type="button" className="boton" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Ayuda de la pantalla. Va cerrada para no estorbar a quien ya sabe, y
 * abierta a un toque para quien se perdio. Usa <details> nativo: funciona
 * con teclado y con lector de pantalla sin que haya que programarlo.
 */
export function Ayuda({ titulo, children, abierta = false }: {
  titulo: string;
  children: ReactNode;
  abierta?: boolean;
}) {
  return (
    <details className="ayuda" open={abierta}>
      <summary className="ayuda__titulo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.5M12 16.5h.01" />
        </svg>
        {titulo}
      </summary>
      <div className="ayuda__cuerpo">{children}</div>
    </details>
  );
}
