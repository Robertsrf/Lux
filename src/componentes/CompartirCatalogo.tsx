import { useCallback, useMemo, useState } from 'react';
import { useTextos } from '../hooks/useTextos';

/**
 * El enlace del catalogo publico, listo para mandarlo por WhatsApp.
 *
 * Hasta ahora la vendedora no tenia forma de conseguirlo: habria tenido que
 * saberse la direccion de memoria y escribirla a mano en el telefono, con la
 * clienta esperando. Aqui se copia de un toque.
 *
 * El enlace se arma con la direccion donde ESTE corriendo la aplicacion, no
 * con una escrita a mano: asi funciona igual en GitHub Pages, en local y en
 * cualquier dominio que se le ponga manana, sin tocar codigo.
 */

const MENSAJE_POR_DEFECTO =
  'Hola, te comparto el catalogo de Lux by Emory. Puedes ver las piezas '
  + 'disponibles y apartar las que te gusten desde ahi:';

function enlacePublico(): string {
  const { origin, pathname } = window.location;
  // En GitHub Pages la ruta puede terminar en index.html: se recorta para
  // no dejar un enlace feo con el archivo a la vista.
  const base = pathname.replace(/index\.html$/, '');
  return `${origin}${base}#/publico`;
}

export function CompartirCatalogo({ titulo = 'Enviar el catalogo' }: { titulo?: string }) {
  const textos = useTextos();
  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);

  const enlace = useMemo(enlacePublico, []);
  const mensaje = `${textos.mensaje_whatsapp?.trim() || MENSAJE_POR_DEFECTO}\n\n${enlace}`;

  const copiar = useCallback(() => {
    void (async () => {
      setFallo(false);
      try {
        await navigator.clipboard.writeText(enlace);
        setCopiado(true);
        window.setTimeout(() => setCopiado(false), 2500);
      } catch {
        // El telefono de la tienda puede ser viejo, o el navegador puede
        // negar el portapapeles. En vez de fallar en silencio, se marca el
        // texto para que se pueda copiar a mano.
        setFallo(true);
      }
    })();
  }, [enlace]);

  return (
    <section className="panel compartir">
      <span className="panel__titulo">{titulo}</span>

      <p className="compartir__enlace">
        {/* Seleccionable y de solo lectura: si el portapapeles falla,
            siempre queda copiarlo con el dedo. */}
        <input
          type="text"
          readOnly
          value={enlace}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Enlace del catalogo"
        />
      </p>

      <div className="grupo-botones">
        <a
          className="boton boton--confirmar"
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Enviar por WhatsApp
        </a>
        <button type="button" className="boton boton--secundario" onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar enlace'}
        </button>
      </div>

      {fallo ? (
        <p className="campo__pista">
          Este navegador no dejo copiar solo. Toca el enlace de arriba, se
          selecciona completo, y copialo a mano.
        </p>
      ) : (
        <p className="campo__pista">
          La clienta ve las piezas disponibles y aparta las que quiera. Lo que
          aparte te aparece aqui, en Pedidos.
        </p>
      )}
    </section>
  );
}
