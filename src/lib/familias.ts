/**
 * Variantes: varias piezas que son el mismo producto con otra medida, otra
 * talla u otro color. Una cadena cubana de 45 cm y otra de 60 cm.
 *
 * En la base cada variante sigue siendo un modelo completo (su SKU, su
 * existencia, su precio, su foto). Lo que las junta es `familia`, que las
 * vistas publican siempre: el id de la cabeza, o el propio si la pieza va
 * suelta. Por eso agrupar no pregunta nada mas: una pieza suelta es una
 * familia de una.
 *
 * Lo usan el mostrador, el catalogo publico, la vitrina y el catalogo en
 * PDF. Si cada pantalla agrupara a su manera, una diria "45 cm · 60 cm" y
 * otra "60 cm · 45 cm", o una contaria la existencia de las dos y otra no.
 */

interface ConFamilia {
  familia: number;
  variante: string | null;
}

export interface Familia<T> {
  clave: number;
  /** La que da el nombre: la primera en el orden en que llegaron. */
  cabeza: T;
  /** Todas, la cabeza incluida, en orden natural: 45 cm antes que 60 cm. */
  variantes: T[];
}

const natural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/**
 * Junta las filas por familia sin cambiar el orden en que llegaron: la
 * familia ocupa el sitio de su primera fila. Asi un catalogo ordenado por
 * nombre sigue ordenado por nombre.
 */
export function agruparPorFamilia<T extends ConFamilia>(filas: T[]): Familia<T>[] {
  const porClave = new Map<number, Familia<T>>();
  const salida: Familia<T>[] = [];
  filas.forEach((fila, i) => {
    // `familia` nunca llega null de la vista. Si llegara, la pieza va sola:
    // mejor suelta que pegada a otra que no es su hermana.
    const clave = Number.isFinite(fila.familia) ? fila.familia : -(i + 1);
    const ya = porClave.get(clave);
    if (ya) {
      ya.variantes.push(fila);
      return;
    }
    const nueva: Familia<T> = { clave, cabeza: fila, variantes: [fila] };
    porClave.set(clave, nueva);
    salida.push(nueva);
  });
  for (const f of salida) {
    if (f.variantes.length > 1) {
      f.variantes.sort((a, b) => natural.compare(a.variante ?? '', b.variante ?? ''));
    }
  }
  return salida;
}

function nombresDe<T extends ConFamilia>(familia: Familia<T>): string[] {
  return familia.variantes
    .map((v) => v.variante?.trim())
    .filter((v): v is string => !!v);
}

/**
 * La lista entera si cabe en `caben` letras; si no, las primeras y cuantas
 * mas: "Azul · Negra · Roja y 2 más". Si ni la primera cabe, "52 opciones".
 * Una sola va entera aunque no quepa: la corta el CSS.
 */
export function listaCorta(partes: string[], caben: number): string {
  const entera = partes.join(' · ');
  if (entera.length <= caben || partes.length === 1) return entera;
  const conResto = (n: number) => `${partes.slice(0, n).join(' · ')} y ${partes.length - n} más`;
  let van = 0;
  while (van + 1 < partes.length && conResto(van + 1).length <= caben) van += 1;
  return van === 0 ? `${partes.length} opciones` : conResto(van);
}

/**
 * Las etiquetas para donde hay poco sitio: la tarjeta, que mide 160 px, la
 * ficha del PDF, la vitrina. El dije de letra burbuja trae 52 ("A DORADO ·
 * A PLATEADO · ..."): enteras alargaban su tarjeta a 1.316 px y la de al
 * lado, estirada a la misma fila, quedaba chiquita en medio del blanco
 * (lo reporto el dueño el 22/10/2026). Todas salen al tocar la pieza.
 */
export function etiquetasCortas<T extends ConFamilia>(familia: Familia<T>, caben = 28): string {
  return listaCorta(nombresDe(familia), caben);
}

/**
 * Las variantes juntas por precio, en el orden en que aparecen, cada grupo
 * con sus etiquetas en corto y una pieza que da el precio. Con un precio
 * por medida es lo de siempre, un renglon por medida; con 26 letras
 * doradas a un precio y 26 plateadas a otro son dos renglones, no 52.
 */
export function porPrecio<T extends { variante: string | null; sku: string; precio_bs: number | null }>(
  variantes: T[], caben = 40,
): { etiqueta: string; pieza: T }[] {
  const grupos = new Map<string, T[]>();
  for (const v of variantes) {
    const clave = String(v.precio_bs);
    grupos.set(clave, [...(grupos.get(clave) ?? []), v]);
  }
  return [...grupos.values()].map((vs) => ({
    etiqueta: listaCorta(vs.map((v) => v.variante?.trim() || v.sku), caben),
    pieza: vs[0]!,
  }));
}

/** Desde cuantas opciones dejan de leerse en renglones y van en un cuadro. */
export const MUCHAS_OPCIONES = 8;

export interface GrupoDeOpciones {
  /** "DORADO", tal como lo escribio el dueño. */
  nombre: string;
  /** Cada opcion con su indice en la lista original y lo que queda sin el grupo: "A". */
  opciones: { indice: number; corta: string }[];
}

/**
 * Parte las opciones en grupos cuando son un cuadro de dos ejes: las letras
 * del dije son "A DORADO", "A PLATEADO", "B DORADO"... 26 letras por 2
 * colores. Una por una eran 52 renglones; en un cuadro son "Dorado" con 26
 * fichas de una letra y "Plateado" con otras 26.
 *
 * Solo si de verdad es un cuadro: mas de MUCHAS_OPCIONES, todas con dos o
 * mas palabras, la ultima palabra (o la primera) con 2 a 4 valores, dos o
 * mas opciones en cada grupo, cada combinacion una sola vez y al menos la
 * mitad de las casillas llenas. No hace falta que este completo: las
 * pantallas que venden solo traen lo que hay libre, y al venderse la
 * ultima "Q PLATEADO" el cuadro no puede deshacerse en 51 pildoras.
 * "45 cm · 60 cm" no se parte (un solo "cm"), ni "Talla 7 · Talla 7
 * Plateado" (no todas dicen el color). Null si no: la pantalla las enseña
 * una por una, como siempre.
 */
export function cuadroDe(etiquetas: (string | null | undefined)[]): GrupoDeOpciones[] | null {
  if (etiquetas.length <= MUCHAS_OPCIONES) return null;
  const palabras = etiquetas.map((e) => (e ?? '').trim().split(/\s+/));
  if (palabras.some((p) => p.length < 2)) return null;
  for (const lado of ['fin', 'inicio'] as const) {
    const partes = palabras.map((p) => (lado === 'fin'
      ? { grupo: p[p.length - 1]!, corta: p.slice(0, -1).join(' ') }
      : { grupo: p[0]!, corta: p.slice(1).join(' ') }));
    // Sin mirar mayusculas: "Dorado" y "DORADO" son el mismo color.
    const clave = (s: string) => s.toLocaleLowerCase('es');
    const grupos = new Set(partes.map((x) => clave(x.grupo)));
    const cortas = new Set(partes.map((x) => clave(x.corta)));
    const pares = new Set(partes.map((x) => `${clave(x.grupo)}\u0000${clave(x.corta)}`));
    if (grupos.size < 2 || grupos.size > 4 || cortas.size < 2) continue;
    if (pares.size !== partes.length || partes.length * 2 < grupos.size * cortas.size) continue;
    const salida = new Map<string, GrupoDeOpciones>();
    partes.forEach((x, indice) => {
      const k = clave(x.grupo);
      const g = salida.get(k) ?? { nombre: x.grupo, opciones: [] };
      g.opciones.push({ indice, corta: x.corta });
      salida.set(k, g);
    });
    const lista = [...salida.values()];
    if (lista.some((g) => g.opciones.length < 2)) continue;
    return lista;
  }
  return null;
}

/** La primera variante que tenga foto, para la tarjeta de la familia. */
export function conFoto<T extends { foto_path: string | null; foto_thumb_path: string | null }>(variantes: T[]): T | undefined {
  return variantes.find((v) => v.foto_path || v.foto_thumb_path) ?? variantes[0];
}

/**
 * El precio mas bajo y el mas alto de la familia. Si son iguales, la
 * tarjeta dice un precio; si no, dice "desde". Nunca un promedio: no hay
 * ninguna pieza que cueste eso.
 */
export function rangoDe<T>(variantes: T[], precio: (v: T) => number | null | undefined): { min: number | null; max: number | null } {
  const cifras = variantes.map(precio).filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
  if (cifras.length === 0) return { min: null, max: null };
  return { min: Math.min(...cifras), max: Math.max(...cifras) };
}

/** "Cadena cubana · 45 cm", para donde la pieza aparece sola: el cobro, un pedido, un recibo. */
export function nombreConVariante(nombre: string, variante: string | null | undefined): string {
  const v = variante?.trim();
  return v ? `${nombre} · ${v}` : nombre;
}
