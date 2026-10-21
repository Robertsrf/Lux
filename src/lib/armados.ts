/**
 * Las piezas armadas del catálogo: qué dije va en qué cadena o pulsera
 * (esquema-dijes.sql). Una regla, un sitio: la usan el catálogo de la
 * tienda y el de cada revendedor.
 *
 * Una pareja es una unidad: el dije A en la cadena X. Las parejas no
 * deciden ningún precio (eso lo hace el tramo, en la base, contando las
 * bases del pedido); son para que quien prepara el pedido no adivine.
 * Por eso, si la clienta quita una pieza, las parejas que ya no caben se
 * caen solas, igual que las deja fuera `guardar_armados` en la base.
 */

/** Un dije en una base: una unidad de cada uno. */
export interface ParArmado {
  dije: number;
  base: number;
}

/**
 * Las parejas que caben en lo que lleva el pedido, en el orden en que se
 * armaron: nunca más parejas de un dije o de una base que piezas de ellos.
 */
export function paresVigentes(pares: ParArmado[], seleccion: ReadonlyMap<number, number>): ParArmado[] {
  const usados = new Map<number, number>();
  const vigentes: ParArmado[] = [];
  for (const p of pares) {
    const dijes = usados.get(p.dije) ?? 0;
    const bases = usados.get(p.base) ?? 0;
    if (dijes < (seleccion.get(p.dije) ?? 0) && bases < (seleccion.get(p.base) ?? 0)) {
      vigentes.push(p);
      usados.set(p.dije, dijes + 1);
      usados.set(p.base, bases + 1);
    }
  }
  return vigentes;
}

/** Como las pide `crear_reserva(..., p_armados)`: una fila por pareja distinta, con cuántas. */
export function armadosParaLaBase(pares: ParArmado[]): { dije_id: number; base_id: number; cantidad: number }[] {
  const juntos = new Map<string, { dije_id: number; base_id: number; cantidad: number }>();
  for (const p of pares) {
    const clave = `${p.dije}-${p.base}`;
    const previo = juntos.get(clave);
    if (previo) previo.cantidad += 1;
    else juntos.set(clave, { dije_id: p.dije, base_id: p.base, cantidad: 1 });
  }
  return [...juntos.values()];
}

/**
 * Colgarle un dije a una base del pedido. Si todas las bases de esa pieza
 * ya llevan su dije, entra una base más; el dije entra siempre. Null si no
 * quedan piezas para hacerlo (de la base o del dije).
 */
export function armar(
  seleccion: ReadonlyMap<number, number>,
  pares: ParArmado[],
  base: number,
  dije: number,
  disponible: (id: number) => number,
): { seleccion: Map<number, number>; pares: ParArmado[] } | null {
  const vigentes = paresVigentes(pares, seleccion);
  const bases = seleccion.get(base) ?? 0;
  const conDije = vigentes.filter((p) => p.base === base).length;
  const nueva = new Map(seleccion);
  if (conDije >= bases) {
    if (bases + 1 > disponible(base)) return null;
    nueva.set(base, bases + 1);
  }
  const dijes = nueva.get(dije) ?? 0;
  if (dijes + 1 > disponible(dije)) return null;
  nueva.set(dije, dijes + 1);
  return { seleccion: nueva, pares: [...vigentes, { dije, base }] };
}
