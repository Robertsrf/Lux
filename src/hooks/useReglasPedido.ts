import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Las reglas del pedido que se le dicen a la clienta antes de apartar. */
export interface ReglasPedido {
  /** Cuánto paga como mínimo para apartar: 40. */
  apartado_inicial_pct: number;
  /** Cuántos días tiene para pagar lo demás: 15. */
  apartado_dias: number;
  /** Cuántos minutos se guardan sus piezas mientras paga: 60. */
  reserva_minutos: number;
}

/**
 * Las cifras del pedido, de `reglas_pedido()` (esquema-catalogo-claro.sql).
 * Viven en `configuracion`, que una clienta sin sesión no lee: esta función
 * da esas tres y ninguna más (`verificar` lo vigila). Null mientras llegan,
 * si falla o si el SQL todavía no se corrió: la pantalla dice entonces los
 * pasos sin cifras, como antes. Nunca una cifra escrita aquí.
 */
export function useReglasPedido(): ReglasPedido | null {
  const [reglas, setReglas] = useState<ReglasPedido | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('reglas_pedido');
      if (error || !data) return;
      const r = data as Partial<Record<keyof ReglasPedido, number | string | null>>;
      const pct = Number(r.apartado_inicial_pct);
      const dias = Number(r.apartado_dias);
      const minutos = Number(r.reserva_minutos);
      if ([pct, dias, minutos].every((n) => Number.isFinite(n) && n > 0)) {
        setReglas({ apartado_inicial_pct: pct, apartado_dias: dias, reserva_minutos: minutos });
      }
    })();
  }, []);

  return reglas;
}

/** "una hora", "90 minutos", "2 horas": como se dice un plazo corto. */
export function decirMinutos(minutos: number): string {
  if (minutos === 60) return 'una hora';
  if (minutos % 60 === 0) return `${minutos / 60} horas`;
  return `${minutos} minutos`;
}
