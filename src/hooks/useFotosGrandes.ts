import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * La foto grande de unas piezas, para verlas en el visor y asegurarse de qué
 * es lo que se apartó o se vendió.
 *
 * Las vistas de Pedidos traen solo la miniatura (600 px): basta para la
 * tabla y se queda corta para distinguir dos anillos parecidos. Esto la pide
 * aparte, en una consulta, a `v_catalogo_venta`, que ven las dos caras y no
 * lleva costos. Una pieza retirada no sale ahí: el visor usa su miniatura.
 */
export function useFotosGrandes(ids: number[]) {
  const [fotos, setFotos] = useState<Map<number, string | null>>(new Map());
  // La lista como texto, para no volver a pedir en cada dibujo.
  const clave = useMemo(() => [...new Set(ids)].sort((a, b) => a - b).join(','), [ids]);

  useEffect(() => {
    if (!clave) { setFotos(new Map()); return; }
    let vigente = true;
    void (async () => {
      const { data } = await supabase
        .from('v_catalogo_venta')
        .select('id, foto_path')
        .in('id', clave.split(',').map(Number));
      if (!vigente) return;
      // Si falla, el visor sigue con la miniatura: no se avisa por una foto.
      setFotos(new Map(((data as { id: number; foto_path: string | null }[] | null) ?? []).map((f) => [f.id, f.foto_path])));
    })();
    return () => { vigente = false; };
  }, [clave]);

  return fotos;
}
