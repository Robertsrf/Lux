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

/**
 * Las categorias que ya existen, para no escribirlas a mano cada vez.
 *
 * Se unifican por minusculas y sin espacios sobrantes: "Anillo", "anillo" y
 * " Anillo " son la misma cosa, y verlas tres veces en una lista es lo que
 * hace que terminen siendo tres cosas distintas en la base. La base tambien
 * las normaliza al guardar (`lower(trim())` en admin_guardar_modelo), asi
 * que esto es la misma regla contada de este lado.
 *
 * La semilla asegura que una tienda recien instalada no arranque con la
 * lista vacia.
 */
const SEMILLA = [
  'anillo', 'arete', 'brazalete', 'cadena', 'collar',
  'pulsera', 'set', 'tobillera', 'cabello',
];

export function useCategorias() {
  const [categorias, setCategorias] = useState<string[]>(SEMILLA);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('v_catalogo_admin').select('categoria').limit(1000);
      const vistas = new Set(SEMILLA);
      for (const x of (data as { categoria: string | null }[] | null) ?? []) {
        const limpia = (x.categoria ?? '').trim().toLowerCase();
        if (limpia) vistas.add(limpia);
      }
      setCategorias([...vistas].sort());
    })();
  }, []);

  return categorias;
}
