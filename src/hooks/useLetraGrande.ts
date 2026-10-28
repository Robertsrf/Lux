import { useCallback, useEffect, useState } from 'react';

const CLAVE = 'lux-letra-grande';

const leer = () => {
  try { return localStorage.getItem(CLAVE) === 'si'; } catch { return false; }
};

/**
 * "Letra grande", en el catálogo en línea y en la página del pedido (pedido
 * del dueño del 27/10/2026: "piensa que eres una persona mayor o que maneja
 * poco la tecnología"). Un botón en la cabecera agranda todo el texto: la
 * escala de la casa sube un paso (base.css, `html.letra-grande`).
 *
 * Se recuerda en el teléfono de quien lo tocó: si vuelve mañana por el
 * mismo enlace, lo encuentra como lo dejó. Si el navegador no deja guardar
 * (modo privado), vale solo esta vez. La clase vive en <html> para que la
 * alcancen también la hoja de medidas y el visor, y se quita al salir de la
 * página: el mostrador y la administración tienen su propia escala.
 */
export function useLetraGrande() {
  const [grande, setGrande] = useState(leer);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.toggle('letra-grande', grande);
    return () => raiz.classList.remove('letra-grande');
  }, [grande]);

  const alternar = useCallback(() => {
    setGrande((antes) => {
      const ahora = !antes;
      try { localStorage.setItem(CLAVE, ahora ? 'si' : 'no'); } catch { /* solo esta vez */ }
      return ahora;
    });
  }, []);

  return { grande, alternar };
}
