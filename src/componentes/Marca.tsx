/**
 * Wordmark LUX con "By Emory" flanqueado por dos lineas finas, y el monograma
 * L como sello. Las dos lineas son el ornamento firma de la casa y se reutilizan
 * como divisor en toda la interfaz.
 *
 * Prohibido deformarlo, rotarlo, ponerle sombra o degradado, o sacarlo de la
 * paleta.
 */

export function Wordmark({ tamano = 28 }: { tamano?: number }) {
  return (
    <span className="wordmark" aria-label="Lux by Emory">
      <span className="wordmark__lux" style={{ fontSize: tamano }} aria-hidden="true">LUX</span>
      <span className="wordmark__emory" aria-hidden="true">
        <i className="wordmark__linea" />
        By Emory
        <i className="wordmark__linea" />
      </span>
    </span>
  );
}

export function Monograma({ tamano }: { tamano?: number }) {
  const estilo = tamano ? { width: tamano, height: tamano, fontSize: Math.round(tamano * 0.5) } : undefined;
  return <span className="monograma" style={estilo} aria-hidden="true">L</span>;
}

export function Divisor() {
  return <hr className="divisor" />;
}
