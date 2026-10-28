/*
  QUÉ VA CON QUÉ

  Las reglas de estilo con que la vitrina arma un conjunto (pedido del
  dueño del 27/10/2026: "no hay reglas que se apliquen cuando hay más
  prendas"). Antes "Para combinar" eran las tres piezas que tocaban en la
  cola, fueran lo que fueran. Ahora un conjunto es lo que se lleva junto:
  una pieza para cada parte del cuerpo (cuello, orejas, muñeca, mano), del
  mismo tono si el nombre lo dice. Son consejos de estilo de uso común, no
  cifras del negocio: se pueden reescribir aquí sin tocar nada más.

  Medido en el catálogo en línea el 27/10/2026: de 152 piezas, solo 21
  dicen su tono en el nombre o la medida ("dorado", "plateado", "rosado").
  Por eso un tono que no se sabe va con cualquiera: la regla solo separa
  lo que se sabe que no combina.
*/

import type { Familia } from './familias';

/** La parte del cuerpo donde va una pieza. Un set (collar y aretes) es del cuello y de las orejas. */
export type Zona = 'cuello' | 'orejas' | 'muneca' | 'mano' | 'tobillo' | 'cintura' | 'cabello' | 'otra';
export type Tono = 'dorado' | 'plateado' | 'rosado';

export interface PiezaCombinable {
  id: number;
  familia: number;
  nombre: string;
  categoria: string | null;
  variante: string | null;
  variantes_nota: string | null;
  foto_path: string | null;
  foto_thumb_path: string | null;
}

/** Sin tildes y en minúsculas, para comparar lo que escribe el dueño. */
export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Por el comienzo de la categoría: "collar" encuentra "collar" y "collares". */
const ZONAS: [Zona, string[]][] = [
  ['cuello', ['collar', 'cadena', 'gargantilla', 'choker', 'set']],
  ['orejas', ['arete', 'zarcillo', 'topito', 'pendiente', 'argolla', 'candonga']],
  ['muneca', ['pulsera', 'brazalete', 'esclava']],
  ['mano', ['anillo', 'sortija']],
  ['tobillo', ['tobillera']],
  ['cintura', ['cintura']],
  ['cabello', ['cabello', 'pinza', 'gancho']],
];

export function zonaDe(categoria: string | null): Zona {
  const c = sinTildes(categoria ?? '');
  return ZONAS.find(([, de]) => de.some((x) => c.startsWith(x)))?.[0] ?? 'otra';
}

/**
 * Lo que la pieza cubre. Un set dice en su nombre lo que trae ("Set collar
 * + pulsera"); si no lo dice, es el de siempre: collar y aretes.
 */
export function zonasDe(p: Pick<PiezaCombinable, 'categoria' | 'nombre'>): Zona[] {
  if (!sinTildes(p.categoria ?? '').startsWith('set')) return [zonaDe(p.categoria)];
  const nombre = sinTildes(p.nombre);
  const trae = ZONAS.filter(([, de]) => de.some((x) => x !== 'set' && nombre.includes(x))).map(([z]) => z);
  return trae.length > 0 ? trae : ['cuello', 'orejas'];
}

/** Una alianza de matrimonio no es pieza de un conjunto de moda. */
const deConjunto = (p: Pick<PiezaCombinable, 'nombre'>) => !/alianza|matrimonio/.test(sinTildes(p.nombre));

/** El tono, si el nombre, la medida o la nota lo dicen. Null si no: va con cualquiera. */
export function tonoDe(p: Pick<PiezaCombinable, 'nombre' | 'variante' | 'variantes_nota'>): Tono | null {
  const t = sinTildes(`${p.nombre} ${p.variante ?? ''} ${p.variantes_nota ?? ''}`);
  if (/dorad|\boro\b|gold/.test(t)) return 'dorado';
  if (/rosad|\brose\b/.test(t)) return 'rosado';
  if (/platead|\bplata\b|silver/.test(t)) return 'plateado';
  return null;
}

export const vanJuntos = (a: Tono | null, b: Tono | null) => a === null || b === null || a === b;

/** El orden en que se arma un conjunto: lo que más se ve primero. */
const LOOK: Zona[] = ['cuello', 'orejas', 'muneca', 'mano'];

/**
 * Un conjunto que empieza en la familia `desde` (cada vez que sale, otra):
 * esa pieza y, para cada parte del cuerpo que le falte (cuello, orejas,
 * muñeca, mano, en ese orden), la primera que encuentre del mismo tono.
 * Hasta `cuantas`. Si no salen al menos dos piezas, no hay conjunto: vacío.
 *
 * Solo empieza en una pieza del look (no en una tobillera o una pinza del
 * cabello): se busca la siguiente que sí lo sea.
 */
export function armarConjunto<T extends PiezaCombinable>(
  familias: Familia<T>[],
  desde: number,
  cuantas = 3,
  portada: (f: Familia<T>) => T = (f) => f.cabeza,
): T[] {
  const n = familias.length;
  if (n < 2) return [];
  const sirve = (f: Familia<T>) => deConjunto(f.cabeza) && zonasDe(f.cabeza).some((z) => LOOK.includes(z));
  let inicio = -1;
  for (let k = 0; k < n; k++) {
    const i = (((desde + k) % n) + n) % n;
    if (sirve(familias[i]!)) { inicio = i; break; }
  }
  if (inicio < 0) return [];

  const ancla = familias[inicio]!;
  const tono = tonoDe(ancla.cabeza);
  const cubiertas = new Set<Zona>(zonasDe(ancla.cabeza));
  const elegidas: Familia<T>[] = [ancla];
  for (const zona of LOOK) {
    if (elegidas.length >= cuantas) break;
    if (cubiertas.has(zona)) continue;
    for (let k = 1; k < n; k++) {
      const f = familias[(inicio + k) % n]!;
      const zonas = zonasDe(f.cabeza);
      if (!sirve(f) || !zonas.includes(zona) || zonas.some((z) => cubiertas.has(z))) continue;
      if (!vanJuntos(tono, tonoDe(f.cabeza))) continue;
      elegidas.push(f);
      zonas.forEach((z) => cubiertas.add(z));
      break;
    }
  }
  if (elegidas.length < 2) return [];
  // Se enseñan de arriba abajo, como se llevan: el cuello, las orejas, la muñeca, la mano.
  const lugar = (f: Familia<T>) => Math.min(...zonasDe(f.cabeza).map((z) => LOOK.indexOf(z)).filter((i) => i >= 0));
  return elegidas.sort((a, b) => lugar(a) - lugar(b)).map(portada);
}
