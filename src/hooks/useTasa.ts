import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import type { Tasa } from '../lib/tipos';

/**
 * La tasa vigente es un registro maestro unico. Todo el catalogo se repricia
 * cambiandola: no se toca ningun modelo.
 */
export function useTasa() {
  const [tasa, setTasa] = useState<Tasa | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('tasas')
      .select('id, fecha, tasa_venta, tasa_bcv, vigente, creado_en')
      .eq('vigente', true)
      .maybeSingle();

    if (err) setError(mensajeDeError(err));
    setTasa((data as Tasa | null) ?? null);
    setCargando(false);
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  return { tasa, cargando, error, recargar };
}
