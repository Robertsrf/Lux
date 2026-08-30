import { useMemo, useState } from 'react';
import { useConsejos } from '../hooks/useConsejos';

/**
 * Un recordatorio de la guia, en el momento en que hace falta.
 *
 * La guia impresa se lee una vez y se guarda en un cajon. Esta frase
 * aparece con la clienta delante, que es cuando sirve. Una sola a la vez:
 * un muro de consejos no lo lee nadie.
 */
export function Recordatorio({ momento, titulo }: { momento: string; titulo: string }) {
  const { por } = useConsejos();
  const lista = useMemo(() => por(momento), [por, momento]);
  const [i, setI] = useState(0);

  if (lista.length === 0) return null;
  const c = lista[i % lista.length]!;

  return (
    <aside className="recordatorio">
      <div className="recordatorio__cabecera">
        <span className="recordatorio__titulo">{titulo}</span>
        {lista.length > 1 ? (
          <button
            type="button"
            className="recordatorio__otra"
            onClick={() => setI((n) => n + 1)}
            aria-label="Ver otra frase"
          >
            Otra
          </button>
        ) : null}
      </div>
      {c.etiqueta ? <span className="recordatorio__etiqueta">{c.etiqueta}</span> : null}
      <p className="recordatorio__frase">{c.texto}</p>
      {c.nota ? <p className="recordatorio__nota">{c.nota}</p> : null}
    </aside>
  );
}
