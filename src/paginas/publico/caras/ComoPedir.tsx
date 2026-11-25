import { useId } from 'react';
import type { ReactNode } from 'react';

export interface PasoPedido {
  titulo: string;
  texto: ReactNode;
}

/**
 * Cómo se pide, entero y con las cifras de verdad (fase 10, estilo A): los
 * números grandes en Fraunces y el texto en Garamond. Las cifras las pasa la
 * página, de la base; nunca escritas aquí.
 */
export function ComoPedir({ id, pasos, pie }: { id?: string; pasos: PasoPedido[]; pie?: ReactNode }) {
  const idTitulo = useId();
  return (
    <section className="pub-bloque pub-como" id={id} aria-labelledby={idTitulo}>
      <h2 className="pub-titulo" id={idTitulo}>Así pides</h2>
      <ol className="pub-como__pasos">
        {pasos.map((p, n) => (
          <li key={p.titulo} className="pub-como__paso">
            <span className="pub-como__n" aria-hidden="true">{n + 1}</span>
            <div>
              <h3 className="pub-como__titulo">{p.titulo}</h3>
              <p className="pub-como__texto">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
      {pie ? <p className="pub-como__pie pub-secundario">{pie}</p> : null}
    </section>
  );
}

/** Ir a una sección de la página sin tocar la ruta ni la búsqueda (?tipo=, ?para=). */
export function irA(id: string) {
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
}
