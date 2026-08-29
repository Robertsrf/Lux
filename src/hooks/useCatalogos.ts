import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import type { GrupoPrecio, Ubicacion } from '../lib/tipos';

/** Grupos de precio y ubicaciones: listas cortas que casi todas las pantallas usan. */
export function useGrupos() {
  const [grupos, setGrupos] = useState<GrupoPrecio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('grupos_precio')
      .select('id, nombre, precio_usd, orden, activo')
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });

    setError(err ? mensajeDeError(err) : null);
    setGrupos((data as GrupoPrecio[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);
  return { grupos, cargando, error, recargar };
}

export function useUbicaciones() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('ubicaciones')
      .select('id, nombre, tipo, orden, cuenta_en_cuadre, activo')
      .eq('activo', true)
      .order('orden', { ascending: true });

    setError(err ? mensajeDeError(err) : null);
    setUbicaciones((data as Ubicacion[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);
  return { ubicaciones, cargando, error, recargar };
}
