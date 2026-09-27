import { createContext, useContext } from 'react';
import type { ResumenRevendedor } from '../../lib/tipos';

export interface ContextoPanelRv {
  /** Quién es, su tope y cómo va el mes. Null mientras llega. */
  resumen: ResumenRevendedor | null;
  recargar: () => Promise<void>;
  /**
   * Si el error es que su sesión se cerró, lo manda a entrar y devuelve
   * true. Cada pantalla lo llama en su `catch` antes de enseñar un error.
   */
  siSeCerro: (e: unknown) => boolean;
}

export const ContextoRv = createContext<ContextoPanelRv>({
  resumen: null,
  recargar: async () => {},
  siSeCerro: () => false,
});

export const usePanelRv = () => useContext(ContextoRv);

/** El texto de un error, para enseñarlo. */
export const textoDeError = (e: unknown) => (e instanceof Error ? e.message : 'Algo falló. Intenta otra vez.');
