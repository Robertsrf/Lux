import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { nombreConVariante } from '../lib/familias';

interface Fila {
  revendedor_id: number;
  modelo_id: number;
  sku: string;
  nombre: string;
  variante: string | null;
  tiene: number;
  apartadas: number;
}

/**
 * Lo que un revendedor tiene en la mano de lo que compró para revender
 * (`v_inventario_revendedores`, esquema-inventario-revendedor.sql, #72).
 * Es mercancía ya vendida: no es inventario de la tienda. Solo para el
 * dueño; sin el #72, o sin nada en su inventario, no dice nada.
 *
 * Se le da el revendedor, o la ficha de clienta (Crédito agrupa por
 * clienta): entonces busca primero de qué revendedor es esa ficha.
 */
export function InventarioDeRevendedor({ revendedorId, clienteId }: { revendedorId?: number; clienteId?: number }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);

  useEffect(() => {
    let vigente = true;
    setFilas(null);
    void (async () => {
      let id = revendedorId ?? null;
      if (id === null && clienteId !== undefined) {
        const { data } = await supabase.from('v_revendedores').select('id').eq('cliente_id', clienteId).maybeSingle();
        id = (data as { id: number } | null)?.id ?? null;
      }
      if (id === null) return;
      const { data, error } = await supabase
        .from('v_inventario_revendedores')
        .select('revendedor_id, modelo_id, sku, nombre, variante, tiene, apartadas')
        .eq('revendedor_id', id)
        .order('nombre');
      if (!vigente || error) return;
      setFilas(((data as Fila[] | null) ?? []).filter((f) => Number(f.tiene) > 0));
    })();
    return () => { vigente = false; };
  }, [revendedorId, clienteId]);

  if (!filas || filas.length === 0) return null;
  const piezas = filas.reduce((n, f) => n + Number(f.tiene), 0);
  const enPedidos = filas.reduce((n, f) => n + Number(f.apartadas), 0);

  return (
    <details className="ficha-persona__dato" style={{ marginTop: 'var(--e-3)' }}>
      <summary>
        En su inventario: {piezas} {piezas === 1 ? 'pieza' : 'piezas'}
        {enPedidos > 0 ? ` (${enPedidos} en pedidos de sus clientas)` : ''}
      </summary>
      <ul className="cambios-pedido">
        {filas.map((f) => (
          <li key={f.modelo_id}>
            {nombreConVariante(f.nombre, f.variante)} · {f.sku} · {Number(f.tiene)}
            {Number(f.apartadas) > 0 ? ` (${Number(f.apartadas)} en pedidos)` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}
