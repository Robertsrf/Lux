import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Frase, FraseCategoria, Superficie } from '../lib/tipos';

/**
 * El banco de frases de la casa, con sus reglas.
 *
 * El banco trae 222 frases con ID estable y trae escritas sus propias
 * reglas de uso. Estas dos son las que manda el documento y las que
 * resuelve este hook:
 *
 *   1. En el televisor NUNCA salen dos frases de la misma categoria
 *      seguidas. Se alterna.
 *   2. Una frase no se repite hasta agotar su categoria.
 *
 * Ambas se cumplen con lo mismo: barajar dentro de cada categoria y
 * luego repartir por turnos entre categorias. Recorrer esa secuencia de
 * principio a fin no repite ninguna y no pone dos vecinas del mismo
 * grupo, salvo que quede una sola categoria con frases.
 */

/** Baraja sin tocar el original. Sirve para que el orden no sea el mismo
 *  cada vez que se enciende el televisor. */
function barajar<T>(lista: T[]): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Reparte por turnos entre categorias: A1 B1 C1 A2 B2 C2 A3… */
function alternar(frases: Frase[]): Frase[] {
  const grupos = new Map<string, Frase[]>();
  for (const f of frases) {
    if (!grupos.has(f.categoria)) grupos.set(f.categoria, []);
    grupos.get(f.categoria)!.push(f);
  }
  const pilas = barajar([...grupos.values()].map(barajar));
  const salida: Frase[] = [];
  let quedan = frases.length;
  while (quedan > 0) {
    for (const pila of pilas) {
      const f = pila.shift();
      if (f) { salida.push(f); quedan--; }
    }
  }
  return salida;
}

export function useFrases(superficie: Superficie) {
  const [frases, setFrases] = useState<Frase[]>([]);
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [categorias, setCategorias] = useState<FraseCategoria[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    void (async () => {
      const [f, t, c] = await Promise.all([
        supabase.from('frases').select('id, categoria, superficie, texto, orden')
          .eq('activo', true).contains('superficie', [superficie]),
        supabase.from('textos').select('clave, valor'),
        supabase.from('frases_categorias').select('codigo, nombre, tono, nota'),
      ]);
      setCategorias((c.data as FraseCategoria[] | null) ?? []);
      setFrases((f.data as Frase[] | null) ?? []);
      const mapa: Record<string, string> = {};
      for (const x of (t.data as { clave: string; valor: string }[] | null) ?? []) {
        if (x.valor?.trim()) mapa[x.clave] = x.valor.trim();
      }
      setDatos(mapa);
      setCargando(false);
    })();
  }, [superficie]);

  /**
   * Las frases con hueco sin rellenar se DESCARTAN, no se muestran a
   * medias. Lo dice el propio banco, y con razon: "De {CIUDAD} a donde
   * estes" en un televisor de tienda es peor que una frase menos.
   */
  const listas = useMemo(() => {
    const rellenos: Record<string, string | undefined> = {
      CIUDAD: datos.ciudad,
      ESTADO: datos.estado,
      PALABRA_CLAVE: datos.palabra_clave,
    };
    const salida: Frase[] = [];
    for (const f of frases) {
      const huecos = [...f.texto.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]!);
      if (huecos.some((h) => !rellenos[h])) continue;
      const texto = huecos.reduce((t, h) => t.split('{' + h + '}').join(rellenos[h]!), f.texto);
      salida.push({ ...f, texto });
    }
    return salida;
  }, [frases, datos]);

  // Se baraja una sola vez por sesion: si se recalculara en cada pintado,
  // la frase cambiaria sola al mover el raton.
  const secuencia = useMemo(() => alternar(listas), [listas]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, Frase[]>();
    for (const f of listas) {
      if (!m.has(f.categoria)) m.set(f.categoria, []);
      m.get(f.categoria)!.push(f);
    }
    return m;
  }, [listas]);

  return { secuencia, porCategoria, categorias, cargando };
}
