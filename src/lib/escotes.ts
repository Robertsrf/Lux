/*
  QUÉ JOYA VA CON CADA ESCOTE

  La guía que pasa en la vitrina del televisor (pedida por el dueño el
  15/10/2026): cada escote, en una frase, y las piezas de la tienda que le
  van. Son consejos de estilo de uso común, no cifras del negocio: se pueden
  reescribir aquí sin tocar nada más. Si un escote no tiene piezas en la
  tienda que le vayan, esa escena no sale.

  REHECHA EL 27/10/2026 (el dueño: "para cierto tipo de cuello salen
  aretes, cuando deberían salir collares"). Tenía razón, y por dos causas:
   - Las piezas llegan ordenadas por categoría, y "arete" va antes que
     "cadena" y "collar". En los escotes que admitían aretes (cuello alto,
     barco, camisa) las tres primeras que encajaban eran aretes.
   - El largo se buscaba en la medida ("45 cm"), y en la tienda ningún
     collar lo dice ahí: lo dice la nota ("Largo: 45 cm") o el nombre
     ("Gargantilla", "collar en forma de Y").
  La regla de ahora: un escote es una pregunta de COLLAR. Salen primero
  los collares que le van, del largo que le va. Los aretes salen de dos
  maneras, y la pantalla dice cuál:
   - de complemento ("Y para completar"), una pareja al lado del collar;
   - en su lugar, si no hay ningún collar que le vaya (lo pidió el dueño:
     "o si no hay, decir que esos combinan"): la escena lo dice ("Estos
     aretes combinan"), con el consejo de aretes de ese escote, y el
     dibujo no pinta una cadena que no está.

  Los largos, como los cuentan las guías de joyería: hasta 45 cm, corto
  (gargantilla, clavícula, princesa); hasta 55, medio; más, largo
  (matiné, ópera).
*/

import { agruparPorFamilia } from './familias';
import type { Familia } from './familias';
import { sinTildes, zonasDe } from './combinar';
import type { PiezaCombinable } from './combinar';

export type ClaveEscote = 'v' | 'redondo' | 'alto' | 'barco' | 'corazon' | 'camisero';
export type Largo = 'corto' | 'medio' | 'largo';

export interface Escote {
  clave: ClaveEscote;
  titulo: string;
  /** El consejo con collar, en una frase. */
  consejo: string;
  /** Lo que se dibuja en oro sobre la silueta, dicho en palabras para el lector de pantalla. */
  joya: string;
  /** Los largos de collar que le van; el primero es el que mejor le va. */
  largos: Largo[];
  /** El consejo cuando no hay collar que le vaya y salen aretes en su lugar. */
  consejoAretes: string;
}

export const ESCOTES: Escote[] = [
  {
    clave: 'v', titulo: 'Escote en V',
    consejo: 'Un dije que caiga siguiendo la V, sin pasar del borde.',
    joya: 'una cadena con dije que sigue la línea del escote',
    largos: ['medio', 'corto'],
    consejoAretes: 'Unos aretes que caigan alargan la línea de la V.',
  },
  {
    clave: 'redondo', titulo: 'Cuello redondo',
    consejo: 'Un collar corto, por encima del borde: deja respirar la prenda.',
    joya: 'un collar corto por encima del cuello redondo',
    largos: ['corto'],
    consejoAretes: 'Unos aretes con brillo iluminan la cara sobre el cuello redondo.',
  },
  {
    clave: 'alto', titulo: 'Cuello alto',
    consejo: 'Por fuera de la tela, una cadena larga que alargue la figura.',
    joya: 'una cadena larga por fuera del cuello alto',
    largos: ['largo'],
    consejoAretes: 'El cuello ya viste: unos aretes que se vean son suficiente.',
  },
  {
    clave: 'barco', titulo: 'Escote barco',
    consejo: 'Con los hombros a la vista, un collar que llene el espacio.',
    joya: 'un collar ceñido al cuello',
    largos: ['corto', 'medio'],
    consejoAretes: 'Con los hombros a la vista, unos aretes con presencia se llevan la mirada.',
  },
  {
    clave: 'corazon', titulo: 'Escote corazón',
    consejo: 'Un collar ceñido al cuello enmarca la forma del escote.',
    joya: 'un collar ceñido con una piedra al centro',
    largos: ['corto'],
    consejoAretes: 'Unos aretes delicados acompañan la forma del escote.',
  },
  {
    clave: 'camisero', titulo: 'Cuello de camisa',
    consejo: 'Una cadena fina por dentro del cuello de la camisa.',
    joya: 'una cadena fina dentro del cuello de la camisa',
    largos: ['corto'],
    consejoAretes: 'Unos topitos discretos van con cualquier camisa.',
  },
];

function largoDeCm(cm: number): Largo {
  if (cm <= 45) return 'corto';
  if (cm <= 55) return 'medio';
  return 'largo';
}

/**
 * Los largos que ofrece una pieza de cuello: por los centímetros que diga
 * (en la medida, el nombre o la nota: "Largo disponible: 60 cm y 45 cm"
 * son dos), y si no dice ninguno, por su forma. Vacío si no se sabe.
 */
export function largosDe(p: Pick<PiezaCombinable, 'nombre' | 'categoria' | 'variante' | 'variantes_nota'>): Largo[] {
  const deLaMedida = [...(p.variante ?? '').matchAll(/(\d{2,3})\s*cm/gi)].map((m) => largoDeCm(Number(m[1])));
  // La medida manda: una variante de 45 cm no es la de 60 aunque la nota diga las dos.
  if (deLaMedida.length > 0) return [...new Set(deLaMedida)];
  const texto = `${p.nombre} ${p.variantes_nota ?? ''}`;
  const cms = [...texto.matchAll(/(\d{2,3})\s*cm/gi)].map((m) => largoDeCm(Number(m[1])));
  if (cms.length > 0) return [...new Set(cms)];
  const t = sinTildes(`${p.categoria ?? ''} ${p.nombre}`);
  if (/gargantilla|choker|clavicula/.test(t)) return ['corto'];
  if (/\blarg[oa]s?\b|lariat/.test(t)) return ['largo'];
  // El collar en Y cae a media altura, en punta: el de la V. Solo dicho
  // como forma ("en forma de Y", "en Y", "Y-Necklace"): una "y" suelta es
  // la conjunción ("Set collar y aretes") y no dice nada del largo.
  if (/forma de y\b|\ben y\b|\by-necklace/.test(t)) return ['medio'];
  return [];
}

/** Lleva un colgante: va en una cadena de cualquier largo, y en la V sigue la línea del escote. */
const esColgante = (p: Pick<PiezaCombinable, 'nombre'>) => /colgante|\bdije\b|pendant|peddant/.test(sinTildes(p.nombre));

/**
 * Cuánto le va una pieza de cuello a un escote: 3 si su largo es el que
 * mejor le va, 2 si es otro que también le va (o, en la V, un colgante sin
 * largo dicho), 1 si no se sabe su largo (vale para los escotes que piden
 * corto o medio, que es lo común), 0 si no le va. Un cuello alto pide largo
 * de verdad: lo que no lo dice, no.
 */
function encaje(escote: Escote, largos: Largo[], colgante: boolean): number {
  if (largos.length === 0) {
    if (escote.largos.length === 1 && escote.largos[0] === 'largo') return 0;
    return colgante && escote.clave === 'v' ? 2 : 1;
  }
  if (largos.includes(escote.largos[0]!)) return 3;
  return largos.some((l) => escote.largos.includes(l)) ? 2 : 0;
}

export interface PiezasDeEscote<T> {
  /** "collar": salen collares (y quizá aretes para completar). "aretes": no hay collar que le vaya y salen aretes en su lugar. */
  modo: 'collar' | 'aretes';
  collares: T[];
  aretes: T[];
}

const conFotoDe = <T extends PiezaCombinable>(vs: T[]) => vs.filter((v) => v.foto_path || v.foto_thumb_path);

/**
 * Las piezas de la tienda que van con un escote. Una por producto y, de un
 * producto con medidas, la medida que le va. `desde` rota la elección para
 * que cada vuelta de la vitrina enseñe otras. Null si no hay nada que le
 * vaya: la escena no sale.
 *
 * Con collares: hasta dos, los que mejor le van primero, y una pareja de
 * aretes para completar; sin aretes en la tienda, hasta tres collares.
 * Sin collares que le vayan: aretes en su lugar (hasta tres).
 */
export function piezasParaEscote<T extends PiezaCombinable>(
  escote: Escote,
  piezas: T[],
  desde = 0,
): PiezasDeEscote<T> | null {
  const familias: Familia<T>[] = agruparPorFamilia(piezas);
  const collares: { pieza: T; nota: number }[] = [];
  const aretes: T[] = [];
  for (const f of familias) {
    // Un set con collar cuenta como collar; uno de solo aretes, como aretes.
    const zonas = zonasDe(f.cabeza);
    const fotos = conFotoDe(f.variantes);
    if (fotos.length === 0) continue;
    if (!zonas.includes('cuello')) {
      if (zonas.includes('orejas')) aretes.push(fotos[0]!);
      continue;
    }
    // La medida que mejor le va, de las que tienen foto.
    let mejor: { pieza: T; nota: number } | null = null;
    for (const v of fotos) {
      const nota = encaje(escote, largosDe(v), esColgante(v));
      if (nota > 0 && (!mejor || nota > mejor.nota)) mejor = { pieza: v, nota };
    }
    if (mejor) collares.push(mejor);
  }

  const rotar = <X,>(xs: X[], k: number) => {
    if (xs.length === 0) return xs;
    const i = ((k % xs.length) + xs.length) % xs.length;
    return [...xs.slice(i), ...xs.slice(0, i)];
  };

  if (collares.length > 0) {
    // Los que mejor le van primero; dentro de cada nota, rotando.
    const notas = [...new Set(collares.map((c) => c.nota))].sort((a, b) => b - a);
    const enOrden = notas.flatMap((nota) => rotar(collares.filter((c) => c.nota === nota), desde)).map((c) => c.pieza);
    const unArete = rotar(aretes, desde).slice(0, 1);
    return {
      modo: 'collar',
      collares: enOrden.slice(0, unArete.length > 0 ? 2 : 3),
      aretes: unArete,
    };
  }
  if (aretes.length > 0) {
    return { modo: 'aretes', collares: [], aretes: rotar(aretes, desde).slice(0, 3) };
  }
  return null;
}
