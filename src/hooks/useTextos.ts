import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type ClaveTexto =
  | 'materiales_largo' | 'materiales_corto' | 'catalogo_intro' | 'catalogo_pie'
  | 'mensaje_whatsapp' | 'ciudad' | 'estado';

/**
 * Textos de marca. Viven en la base para que el dueno los cambie sin tocar
 * codigo, y los lee cualquiera: tambien el catalogo publico sin sesion.
 */
export function useTextos() {
  const [textos, setTextos] = useState<Partial<Record<ClaveTexto, string>>>({});

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('textos').select('clave, valor');
      const mapa: Partial<Record<ClaveTexto, string>> = {};
      for (const t of (data as { clave: ClaveTexto; valor: string }[] | null) ?? []) {
        if (t.valor.trim()) mapa[t.clave] = t.valor;
      }
      setTextos(mapa);
    })();
  }, []);

  return textos;
}
