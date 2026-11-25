import { createContext, useContext, type ReactNode } from 'react';
import { irA } from '../caras/ComoPedir';
import type { BotonLanding } from '../../../hooks/useLanding';

/**
 * Lo que un botón de la landing necesita saber para llevar a su destino.
 * Los destinos los elige el dueño en el panel (`landing_destino_valido`):
 * `todas`, `ofertas`, `proximamente`, `whatsapp`, `tipo:<categoria>` y
 * `seccion:<tipo>`. Un destino que hoy no lleva a ningún lado (no hay
 * ofertas, la sección está escondida, no hay número de WhatsApp) no dibuja
 * el botón: nunca un botón muerto.
 */
export interface ContextoLanding {
  irATodas: () => void;
  irATipo: (categoria: string) => void;
  /** El chat de WhatsApp de la tienda, o null sin número válido. */
  whatsapp: string | null;
  /** Los tipos de sección que hoy se dibujan. */
  seccionesVisibles: ReadonlySet<string>;
  /** El id de la primera sección de ofertas que se ve, o null. */
  idOfertas: string | null;
  hayProximas: boolean;
}

const Contexto = createContext<ContextoLanding | null>(null);

export function ProveedorLanding({ valor, children }: { valor: ContextoLanding; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useContextoLanding(): ContextoLanding {
  const c = useContext(Contexto);
  if (!c) throw new Error('useContextoLanding fuera de <Landing>');
  return c;
}

/** El id con que se encuentra una sección en la página. */
export const idSeccion = (tipo: string): string => `seccion-${tipo}`;

/**
 * El botón de una diapositiva o de una sección. `variante` es el aspecto:
 * sobre verde va relleno en oro, sobre crema es el primario de siempre.
 */
export function BotonDestino({ boton, sobreVerde = false }: { boton: BotonLanding | null | undefined; sobreVerde?: boolean }) {
  const c = useContextoLanding();
  if (!boton || !boton.texto.trim()) return null;
  const clase = sobreVerde ? 'pub-boton pub-boton--crema lp-boton' : 'pub-boton lp-boton';
  const d = boton.destino;

  if (d === 'whatsapp') {
    return c.whatsapp ? (
      <a className={clase} href={c.whatsapp} target="_blank" rel="noopener noreferrer">{boton.texto}</a>
    ) : null;
  }

  let alTocar: (() => void) | null = null;
  if (d === 'todas') alTocar = c.irATodas;
  else if (d === 'ofertas') alTocar = c.idOfertas ? () => irA(c.idOfertas!) : null;
  else if (d === 'proximamente') alTocar = c.hayProximas ? () => irA(idSeccion('proximamente')) : null;
  else if (d.startsWith('tipo:')) {
    const tipo = d.slice(5);
    alTocar = tipo ? () => c.irATipo(tipo) : null;
  } else if (d.startsWith('seccion:')) {
    const tipo = d.slice(8);
    alTocar = c.seccionesVisibles.has(tipo) ? () => irA(idSeccion(tipo)) : null;
  }
  return alTocar ? <button type="button" className={clase} onClick={alTocar}>{boton.texto}</button> : null;
}
