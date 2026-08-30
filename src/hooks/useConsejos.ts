import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Consejo } from '../lib/tipos';

/**
 * La guia del colaborador, dentro del sistema. Vive en la base para que el
 * dueno la edite sin desplegar nada.
 *
 * Se traen todos de una: son unas cuarenta frases cortas, pesan nada, y asi
 * la vendedora no espera una consulta con la clienta delante.
 */
export function useConsejos() {
  const [consejos, setConsejos] = useState<Consejo[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('consejos')
        .select('id, momento, etiqueta, texto, nota, orden')
        .eq('activo', true)
        .order('momento')
        .order('orden');
      setConsejos((data as Consejo[] | null) ?? []);
      setCargando(false);
    })();
  }, []);

  const por = (momento: string) => consejos.filter((c) => c.momento === momento);

  return { consejos, por, cargando };
}
