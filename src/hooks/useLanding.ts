import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Los 19 tipos de sección de la landing (landing_tipo_valido en la base). */
export type TipoSeccion =
  | 'portada' | 'cintas' | 'tipos' | 'estuche' | 'combos' | 'nosotros'
  | 'seleccion' | 'estantes' | 'escote' | 'materiales' | 'regalo' | 'galeria'
  | 'como_pedir' | 'proximamente' | 'video' | 'buscamos' | 'redes' | 'tienda'
  | 'casa';

/** A dónde lleva un botón: `todas`, `ofertas`, `proximamente`, `whatsapp`, `tipo:<categoria>`, `seccion:<tipo>`. */
export interface BotonLanding {
  texto: string;
  destino: string;
}

/** Una diapositiva o una tarjeta: lo que no se llena, no se dibuja. */
export interface ElementoLanding {
  /** Ruta del sitio (`landing/x.webp`) o del bucket. */
  foto?: string | null;
  poster?: string | null;
  video?: string | null;
  frase?: string | null;
  titulo?: string | null;
  texto?: string | null;
  alt?: string | null;
  icono?: string | null;
  boton?: BotonLanding | null;
}

export interface DatosLanding extends ElementoLanding {
  diapositivas?: ElementoLanding[] | null;
  tarjetas?: ElementoLanding[] | null;
}

export interface SeccionLanding {
  id: number;
  tipo: TipoSeccion;
  orden: number;
  titulo: string | null;
  texto: string | null;
  datos: DatosLanding;
}

/**
 * Las secciones de la landing, de `v_landing` (esquema-landing-y-ofertas.sql):
 * solo las visibles, en su orden. `secciones` es null mientras llegan y
 * si falla o el SQL todavía no se corrió: el inicio se ve como siempre y
 * no se enseña ningún error.
 */
export function useLanding(): { secciones: SeccionLanding[] | null; cargando: boolean } {
  const [secciones, setSecciones] = useState<SeccionLanding[] | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    // Si tarda más de ~2,5 s se enseña el inicio de siempre y no se espera más.
    const limite = window.setTimeout(() => { if (vivo) setCargando(false); }, 2500);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('v_landing')
          .select('id, tipo, orden, titulo, texto, datos')
          .order('orden', { ascending: true })
          .order('id', { ascending: true });
        if (!vivo) return;
        if (error || !data || data.length === 0) {
          setSecciones(null);
        } else {
          setSecciones(
            (data as SeccionLanding[]).map((s) => ({
              ...s,
              datos: s.datos && typeof s.datos === 'object' ? s.datos : {},
            })),
          );
        }
      } catch {
        if (vivo) setSecciones(null);
      } finally {
        window.clearTimeout(limite);
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; window.clearTimeout(limite); };
  }, []);

  return { secciones, cargando };
}
