/*
  QUÉ JOYA VA CON CADA ESCOTE

  La guía que pasa en la vitrina del televisor (pedida por el dueño el
  15/10/2026): cada escote, en una frase, y las piezas de la tienda que le
  van. Son consejos de estilo de uso común, no cifras del negocio: se pueden
  reescribir aquí sin tocar nada más. Si un escote no tiene piezas en la
  tienda que le vayan, esa escena no sale.

  `categorias` se compara contra la categoría de la pieza por su comienzo
  ("collar" encuentra "collar" y "collares"). `largo` mira la medida de la
  variante ("45 cm"): una cadena de 60 cm no va con un cuello redondo. Una
  pieza sin medida escrita vale para cualquier largo.
*/

import { agruparPorFamilia } from './familias';
import type { Familia } from './familias';

export type ClaveEscote = 'v' | 'redondo' | 'alto' | 'barco' | 'corazon' | 'camisero';
export type Largo = 'corto' | 'medio' | 'largo';

export interface Escote {
  clave: ClaveEscote;
  titulo: string;
  consejo: string;
  /** Lo que se dibuja en oro sobre la silueta, dicho en palabras para el lector de pantalla. */
  joya: string;
  categorias: string[];
  /** Para las cadenas y collares. Los aretes no tienen largo. */
  largo: Largo | null;
}

const COLLARES = ['collar', 'cadena', 'gargantilla', 'choker', 'set'];
const ARETES = ['arete', 'zarcillo', 'topito'];

export const ESCOTES: Escote[] = [
  {
    clave: 'v', titulo: 'Escote en V',
    consejo: 'Un dije que caiga siguiendo la V, con la cadena a media altura.',
    joya: 'una cadena con dije que sigue la línea del escote',
    categorias: COLLARES, largo: 'medio',
  },
  {
    clave: 'redondo', titulo: 'Cuello redondo',
    consejo: 'Un collar corto, por encima del escote, deja respirar la prenda.',
    joya: 'un collar corto por encima del cuello redondo',
    categorias: COLLARES, largo: 'corto',
  },
  {
    clave: 'alto', titulo: 'Cuello alto',
    consejo: 'Por fuera de la tela: una cadena larga, o aretes que se vean.',
    joya: 'una cadena larga por fuera del cuello alto',
    categorias: [...COLLARES, ...ARETES], largo: 'largo',
  },
  {
    clave: 'barco', titulo: 'Escote barco',
    consejo: 'Con los hombros a la vista, una gargantilla y aretes con presencia.',
    joya: 'una gargantilla ceñida al cuello',
    categorias: [...COLLARES, ...ARETES], largo: 'corto',
  },
  {
    clave: 'corazon', titulo: 'Escote corazón',
    consejo: 'Un collar ceñido al cuello enmarca la forma del escote.',
    joya: 'un collar ceñido con una piedra al centro',
    categorias: COLLARES, largo: 'corto',
  },
  {
    clave: 'camisero', titulo: 'Cuello de camisa',
    consejo: 'Una cadena fina dentro del cuello y unos topitos discretos.',
    joya: 'una cadena fina dentro del cuello de la camisa',
    categorias: [...COLLARES, ...ARETES], largo: 'corto',
  },
];

interface PiezaConMedida {
  id: number;
  familia: number;
  categoria: string | null;
  variante: string | null;
  foto_path: string | null;
  foto_thumb_path: string | null;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function esDe(pieza: PiezaConMedida, categorias: string[]): string | null {
  const c = sinTildes(pieza.categoria ?? '');
  return categorias.find((x) => c.startsWith(x)) ?? null;
}

/** "45 cm" → 45. Null si la variante no dice centímetros. */
function centimetros(variante: string | null): number | null {
  const m = /(\d{2,3})\s*cm/i.exec(variante ?? '');
  return m ? Number(m[1]) : null;
}

function largoDe(cm: number): Largo {
  if (cm <= 45) return 'corto';
  if (cm <= 55) return 'medio';
  return 'largo';
}

/**
 * Las piezas de la tienda que van con un escote: hasta `cuantas`, una por
 * producto y en la medida que le va. Empieza en `desde` para que cada vuelta
 * de la vitrina enseñe otras. Si el escote admite aretes y hay, al menos uno
 * de los que salen es un arete: el consejo los nombra.
 */
export function piezasParaEscote<T extends PiezaConMedida>(
  escote: Escote,
  piezas: T[],
  desde = 0,
  cuantas = 3,
): T[] {
  const familias: Familia<T>[] = agruparPorFamilia(piezas);
  const elegidas: { pieza: T; tipo: string }[] = [];
  for (const f of familias) {
    const tipo = esDe(f.cabeza, escote.categorias);
    if (!tipo) continue;
    const conFoto = f.variantes.filter((v) => v.foto_path || v.foto_thumb_path);
    if (conFoto.length === 0) continue;
    const esCollar = COLLARES.includes(tipo) && tipo !== 'set';
    if (!esCollar || !escote.largo) {
      elegidas.push({ pieza: conFoto[0]!, tipo });
      continue;
    }
    const medidas = conFoto.map((v) => ({ v, cm: centimetros(v.variante) }));
    const sinMedida = medidas.every((m) => m.cm === null);
    const queVa = medidas.find((m) => m.cm !== null && largoDe(m.cm) === escote.largo);
    if (queVa) elegidas.push({ pieza: queVa.v, tipo });
    else if (sinMedida) elegidas.push({ pieza: conFoto[0]!, tipo });
  }
  if (elegidas.length === 0) return [];

  const n = elegidas.length;
  const inicio = ((desde % n) + n) % n;
  const enOrden = [...elegidas.slice(inicio), ...elegidas.slice(0, inicio)];
  const salida = enOrden.slice(0, cuantas);
  const quiereAretes = escote.categorias.some((c) => ARETES.includes(c));
  if (quiereAretes && !salida.some((e) => ARETES.includes(e.tipo))) {
    const arete = enOrden.find((e) => ARETES.includes(e.tipo));
    if (arete && salida.length < cuantas) salida.push(arete);
    else if (arete) salida[salida.length - 1] = arete;
  }
  return salida.map((e) => e.pieza);
}
