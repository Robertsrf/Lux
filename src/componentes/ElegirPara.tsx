/**
 * "Todas · Dama · Caballero" (pedido del dueño del 17/11/2026: "una
 * selección de piezas de caballero y de dama, y también mezcladas").
 *
 * La usan el catálogo de la tienda y el de cada revendedor. La elección va
 * en la ruta (`?para=dama`): atrás y un enlace compartido la conservan. Lo
 * unisex sale en las dos (`paraQueVe`). Tres partes iguales a todo el
 * ancho, 48 px: es lo primero que elige quien entra, con el pulgar.
 */

export type Para = 'dama' | 'caballero';

const OPCIONES: readonly [Para | null, string][] = [[null, 'Todas'], ['dama', 'Dama'], ['caballero', 'Caballero']];

/** Lo que dice la ruta, o null (todas) si no dice nada que se entienda. */
export function paraDeRuta(valor: string | null): Para | null {
  return valor === 'dama' || valor === 'caballero' ? valor : null;
}

/** Los valores de `para` que ve quien eligió "Dama" o "Caballero". */
export function paraQueVe(para: Para): string[] {
  return [para, 'unisex'];
}

export function ElegirPara({ para, alElegir }: { para: Para | null; alElegir: (p: Para | null) => void }) {
  return (
    <div className="para-quien" role="group" aria-label="Joyas para">
      {OPCIONES.map(([valor, etiqueta]) => (
        <button
          key={etiqueta} type="button" className="para-quien__opcion"
          aria-pressed={para === valor} onClick={() => alElegir(valor)}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
