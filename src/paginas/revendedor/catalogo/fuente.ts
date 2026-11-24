import { supabase, mensajeDeError } from '../../../lib/supabase';
import { paraQueVe, type Para } from '../../../componentes/ElegirPara';
import type { ModeloRevendedor, PerfilRevendedor } from '../../../lib/tipos';

/*
  DE DÓNDE SACA SUS DATOS EL CATÁLOGO

  En la tienda, de Supabase (`fuenteSupabase`). En desarrollo, además, de
  una muestra (`demo.ts`, `?demo=1`): un revendedor inventado con las
  piezas públicas de la vitrina, para ver las tres plantillas con datos
  feos sin crear nada en la base. El cerebro no sabe cuál usa.
*/

export interface ConsultaPiezas {
  categoria: string | null;
  para: Para | null;
  texto: string;
}

export interface Respuesta<T> {
  data: T;
  error: string | null;
}

export interface FuenteCatalogoRv {
  perfil: () => Promise<Respuesta<PerfilRevendedor | null>>;
  categorias: () => Promise<Respuesta<string[]>>;
  piezas: (q: ConsultaPiezas, limite: number) => Promise<Respuesta<ModeloRevendedor[]>>;
  /** Qué es dije y qué es base. Null si no llegó: solo no sale "Agrégale un dije". */
  armados: () => Promise<Map<number, 'dije' | 'base'> | null>;
  dijes: (ids: number[], limite: number) => Promise<Respuesta<ModeloRevendedor[]>>;
}

export const COLUMNAS = 'id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, disponible, familia, variante';

/** Lo de siempre: `rv_perfil_publico` y `rv_catalogo_publico`, sin costo ni piso. */
export function fuenteSupabase(usuario: string): FuenteCatalogoRv {
  return {
    async perfil() {
      const { data, error } = await supabase.rpc('rv_perfil_publico', { p_usuario: usuario });
      return { data: (data as PerfilRevendedor | null) ?? null, error: error ? mensajeDeError(error) : null };
    },
    async categorias() {
      const { data, error } = await supabase.rpc('rv_catalogo_publico', { p_usuario: usuario }).select('categoria');
      const lista = ((data as { categoria: string | null }[] | null) ?? [])
        .map((x) => x.categoria?.trim())
        .filter((x): x is string => !!x);
      return { data: [...new Set(lista)].sort((a, b) => a.localeCompare(b, 'es')), error: error ? mensajeDeError(error) : null };
    },
    async piezas({ categoria, para, texto }, limite) {
      let consulta = supabase
        .rpc('rv_catalogo_publico', { p_usuario: usuario })
        .select(COLUMNAS)
        .order('categoria', { ascending: true })
        .order('nombre', { ascending: true })
        .limit(limite);
      if (categoria) consulta = consulta.eq('categoria', categoria);
      if (para) consulta = consulta.in('para', paraQueVe(para));
      if (texto.trim()) {
        const t = texto.trim().replace(/[%,()"\\:]/g, ' ');
        consulta = consulta.or(`nombre.ilike.%${t}%,categoria.ilike.%${t}%,variante.ilike.%${t}%`);
      }
      const { data, error } = await consulta;
      return { data: (data as unknown as ModeloRevendedor[] | null) ?? [], error: error ? mensajeDeError(error) : null };
    },
    async armados() {
      const { data, error } = await supabase
        .from('v_disponible_publico')
        .select('id, armado')
        .not('armado', 'is', null)
        .limit(2000);
      if (error) return null;
      const mapa = new Map<number, 'dije' | 'base'>();
      for (const f of (data as { id: number; armado: 'dije' | 'base' | null }[] | null) ?? []) {
        if (f.armado) mapa.set(f.id, f.armado);
      }
      return mapa;
    },
    async dijes(ids, limite) {
      if (ids.length === 0) return { data: [], error: null };
      const { data, error } = await supabase
        .rpc('rv_catalogo_publico', { p_usuario: usuario })
        .select(COLUMNAS)
        .in('id', ids)
        .order('nombre', { ascending: true })
        .limit(limite);
      return { data: (data as unknown as ModeloRevendedor[] | null) ?? [], error: error ? mensajeDeError(error) : null };
    },
  };
}
