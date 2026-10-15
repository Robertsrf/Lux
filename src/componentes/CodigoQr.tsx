import { useMemo } from 'react';
import { encode } from 'uqr';

/**
 * Un código QR dibujado con un solo trazo de SVG.
 *
 * Lo calcula `uqr` (MIT, sin dependencias, fijado en 0.1.2: la 0.1.3 salió
 * en 2026 tras dos años y medio sin versiones, y un paquete que despierta
 * así se revisa antes de entrar). Aquí solo se dibuja: cada renglón junta
 * sus módulos oscuros seguidos en un rectángulo, y todo va en un `path`.
 * Un televisor con un navegador lento pinta un trazo, no setecientos.
 *
 * Los colores los pone quien lo usa: el fondo con `background` y los
 * módulos con `color`. Un lector de QR necesita módulos oscuros sobre fondo
 * claro; en la vitrina son verde profundo sobre crema.
 */
export function CodigoQr({ texto, etiqueta, className }: {
  texto: string;
  /** Lo que dice un lector de pantalla: el código en sí no se lee. */
  etiqueta: string;
  className?: string;
}) {
  const { trazo, lado } = useMemo(() => {
    // Corrección M: aguanta un 15 % del código tapado o borroso, que es lo
    // que pasa con el brillo de un televisor.
    const qr = encode(texto, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((fila, y) => {
      let x = 0;
      while (x < fila.length) {
        if (!fila[x]) { x++; continue; }
        const desde = x;
        while (x < fila.length && fila[x]) x++;
        d += `M${desde} ${y}h${x - desde}v1h${desde - x}z`;
      }
    });
    return { trazo: d, lado: qr.size };
  }, [texto]);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${lado} ${lado}`}
      role="img"
      aria-label={etiqueta}
      shapeRendering="crispEdges"
    >
      <path d={trazo} fill="currentColor" />
    </svg>
  );
}
