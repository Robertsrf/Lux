import type { Letra, Plantilla, TemaResuelto } from './tema';

/*
  LAS LETRAS DEL CATÁLOGO DE UN REVENDEDOR

  Van dentro del sitio (`@fontsource`): la CSP solo deja letras propias
  (`font-src 'self'`), así que Google Fonts no sirve. Cada una es un
  `import()` con su ruta escrita: Vite la parte en su propio archivo y
  cada catálogo baja solo la de sus títulos y la de texto de su plantilla.
  Nada de esto va en main.tsx: la tienda no las baja nunca.

  Las familias (el nombre y su respaldo) viven en tema.ts.
*/

const TITULOS: Record<Letra, () => Promise<unknown>> = {
  elegante: () => import('@fontsource/bodoni-moda/latin-500.css'),
  moderna: () => import('@fontsource/outfit/latin-700.css'),
  clasica: () => import('@fontsource/marcellus/latin-400.css'),
  revista: () => import('@fontsource/playfair-display/latin-600.css'),
  amable: () => import('@fontsource/nunito/latin-700.css'),
};

const TEXTO: Record<Plantilla, () => Promise<unknown>> = {
  editorial: () => Promise.all([import('@fontsource/manrope/latin-400.css'), import('@fontsource/manrope/latin-700.css')]),
  tienda: () => Promise.all([import('@fontsource/dm-sans/latin-400.css'), import('@fontsource/dm-sans/latin-700.css')]),
  lookbook: () => Promise.all([import('@fontsource/figtree/latin-400.css'), import('@fontsource/figtree/latin-700.css')]),
};

/** La letra de sus títulos y la de texto de su plantilla. Si falla, queda el respaldo. */
export async function cargarLetras(t: TemaResuelto): Promise<void> {
  await Promise.allSettled([TITULOS[t.letra](), TEXTO[t.plantilla]()]);
}

/** Las cinco de títulos, para enseñarlas en el panel cada una en su letra. */
export async function cargarTodasLasTitulos(): Promise<void> {
  await Promise.allSettled(Object.values(TITULOS).map((f) => f()));
}
