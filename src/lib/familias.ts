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

/** "45 cm · 60 cm". Vacio si ninguna tiene nombre de variante. */
export function etiquetasDe<T extends ConFamilia>(familia: Familia<T>): string {
  return familia.variantes
    .map((v) => v.variante?.trim())
    .filter((v): v is string => !!v)
    .join(' · ');
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
