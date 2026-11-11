import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** El codigo de oferta con que se cobro un pedido o una venta. */
export interface CodigoDeCobro {
  codigo: string;
  pct: number | null;
  /** Se quito una de sus piezas: ya no rebaja las demas. */
  roto: boolean;
}

/** Lo que dice cada linea, si la vista la trae (columnas opcionales). */
export function codigoDeLineas(
  lineas: readonly { oferta_codigo?: string | null; oferta_pct?: number | null }[],
  respaldo?: CodigoDeCobro,
): CodigoDeCobro | null {
  const l = lineas.find((x) => x.oferta_codigo);
  if (l?.oferta_codigo) return { codigo: l.oferta_codigo, pct: l.oferta_pct ?? respaldo?.pct ?? null, roto: respaldo?.roto ?? false };
  return respaldo ?? null;
}

/** "Código LUX-ABC234 · 5 %", y si ya no rebaja, dicho. */
export function textoDeCodigo(c: CodigoDeCobro): string {
  return `Código ${c.codigo}${c.pct !== null ? ` · ${c.pct} %` : ''}${c.roto ? ' · se quitó una pieza y ya no rebaja' : ''}`;
}

/**
 * Con que codigo se cobro cada pedido y cada venta de la pantalla. Sale de
 * `v_ofertas`, que solo lee el administrador: para la vendedora llega vacio,
 * y el codigo se lo dicen las lineas (`oferta_codigo`) si la vista las trae.
 * Sin el #65, o si falla, nada: la pantalla es la de siempre.
 */
export function useCodigosDePedidos(reservaIds: number[], ventaIds: number[]) {
  const [dePedido, setDePedido] = useState<Map<number, CodigoDeCobro>>(new Map());
  const [deVenta, setDeVenta] = useState<Map<number, CodigoDeCobro>>(new Map());
  const llave = `${reservaIds.join(',')}|${ventaIds.join(',')}`;

  useEffect(() => {
    if (reservaIds.length === 0 && ventaIds.length === 0) { setDePedido(new Map()); setDeVenta(new Map()); return; }
    let vivo = true;
    void (async () => {
      try {
        const filtro = [
          reservaIds.length ? `reserva_id.in.(${reservaIds.join(',')})` : null,
          ventaIds.length ? `venta_id.in.(${ventaIds.join(',')})` : null,
        ].filter(Boolean).join(',');
        const { data, error } = await supabase
          .from('v_ofertas').select('codigo, pct, reserva_id, venta_id, roto_en, estado').or(filtro);
        if (!vivo || error) return;
        const filas = (data as { codigo: string; pct: number; reserva_id: number | null; venta_id: number | null; roto_en: string | null; estado: string }[] | null) ?? [];
        const p = new Map<number, CodigoDeCobro>();
        const v = new Map<number, CodigoDeCobro>();
        for (const f of filas) {
          if (f.estado === 'anulado') continue;
          const c: CodigoDeCobro = { codigo: f.codigo, pct: f.pct, roto: f.roto_en !== null };
          if (f.reserva_id !== null) p.set(f.reserva_id, c);
          if (f.venta_id !== null) v.set(f.venta_id, c);
        }
        setDePedido(p);
        setDeVenta(v);
      } catch {
        // Sin la vista o sin red: se sigue sin la etiqueta.
      }
    })();
    return () => { vivo = false; };
    // La llave resume las dos listas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave]);

  return { dePedido, deVenta };
}

/** Lo que devuelven `quitar_de_pedido` y `quitar_de_venta` cuando se rompe un codigo. */
export interface CodigoRoto {
  codigo: string;
  piezas: number;
  total_antes: number;
  total_despues: number;
  moneda: 'usd' | 'bs';
}

/** `codigo_roto` de la respuesta, o null si no se rompio nada. */
export function codigoRotoDe(respuesta: unknown): CodigoRoto | null {
  const r = respuesta as { codigo_roto?: CodigoRoto | null } | null;
  const c = r?.codigo_roto;
  return c && typeof c === 'object' && c.codigo ? c : null;
}
