import { useCallback, useEffect, useState } from 'react';
import { cargarOfertasPublicas, emitirOferta } from '../lib/ofertasApi';
import { vigente, type CodigoOferta, type OfertasPublicas, type OrigenOferta } from '../lib/ofertas';

const CLAVE = 'lux-codigos-v1';

function leer(): CodigoOferta[] {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const lista: unknown = JSON.parse(crudo);
    if (!Array.isArray(lista)) return [];
    return (lista as CodigoOferta[]).filter(
      (c) => c && typeof c.codigo === 'string' && Array.isArray(c.piezas) && vigente(c),
    );
  } catch {
    return [];
  }
}

function guardar(codigos: CodigoOferta[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(codigos));
  } catch {
    // Almacenamiento bloqueado: los códigos viven en memoria mientras dure la visita.
  }
}

export interface UsoOfertas {
  /** Null mientras llegan, si falla o si el SQL todavía no se corrió. */
  ofertas: OfertasPublicas | null;
  /** Los códigos que esta clienta ganó y siguen vigentes, en orden de llegada. */
  codigos: CodigoOferta[];
  ganar: (origen: OrigenOferta, modelos: number[], ref?: number) => Promise<CodigoOferta>;
  quitar: (codigo: string) => void;
}

/**
 * Las ofertas del catálogo público y los códigos de esta clienta (guardados
 * en el teléfono con `lux-codigos-v1`; los vencidos se descartan al abrir).
 * Se llama una vez, en la página, y se pasa hacia abajo.
 */
export function useOfertas(): UsoOfertas {
  const [ofertas, setOfertas] = useState<OfertasPublicas | null>(null);
  const [codigos, setCodigos] = useState<CodigoOferta[]>(() => {
    const vivos = leer();
    guardar(vivos);
    return vivos;
  });

  useEffect(() => {
    let vivo = true;
    void cargarOfertasPublicas().then((o) => { if (vivo) setOfertas(o); });
    return () => { vivo = false; };
  }, []);

  const ganar = useCallback(
    async (origen: OrigenOferta, modelos: number[], ref?: number): Promise<CodigoOferta> => {
      const nuevo = await emitirOferta(origen, modelos, ref);
      setCodigos((previos) => {
        const lista = [...previos.filter((c) => c.codigo !== nuevo.codigo), nuevo];
        guardar(lista);
        return lista;
      });
      return nuevo;
    },
    [],
  );

  const quitar = useCallback((codigo: string): void => {
    setCodigos((previos) => {
      const lista = previos.filter((c) => c.codigo !== codigo);
      guardar(lista);
      return lista;
    });
  }, []);

  return { ofertas, codigos, ganar, quitar };
}
