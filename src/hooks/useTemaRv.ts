import { useEffect } from 'react';
import { claseTema } from '../lib/revendedor';

/**
 * Viste la página entera con la paleta de un revendedor mientras esta
 * pantalla esté abierta, y la quita al salir.
 *
 * Va en <html> y no en un contenedor: la hoja de elegir variante, el visor
 * de la foto y el fondo del body cuelgan de la raíz, y con la clase en un
 * contenedor se habrían quedado con los colores de Lux.
 */
export function useTemaRv(paleta: string | null | undefined) {
  useEffect(() => {
    if (!paleta) return;
    const clases = claseTema(paleta).split(' ');
    const raiz = document.documentElement;
    raiz.classList.add(...clases);
    return () => raiz.classList.remove(...clases);
  }, [paleta]);
}
