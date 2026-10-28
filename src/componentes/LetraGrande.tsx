import { useLetraGrande } from '../hooks/useLetraGrande';

/**
 * "Letra grande", en la cabecera del catálogo y de la página del pedido: el
 * mismo botón en las dos, para que quien la puso en una la encuentre en la
 * otra. El nombre no cambia: el botón queda marcado mientras está puesta.
 */
export function BotonLetraGrande() {
  const { grande, alternar } = useLetraGrande();
  return (
    <button
      type="button"
      className="boton boton--secundario barra__contacto barra__letra"
      aria-pressed={grande}
      onClick={alternar}
    >
      <span aria-hidden="true" className="barra__letra-a">A</span>
      Letra grande
    </button>
  );
}
