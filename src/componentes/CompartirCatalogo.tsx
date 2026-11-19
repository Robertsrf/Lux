import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTextos } from '../hooks/useTextos';
import { urlTienda } from '../lib/dominio';
import { direcciones } from '../lib/direccion';

/**
 * El enlace del catalogo publico, listo para mandarlo por WhatsApp.
 *
 * Hasta ahora la vendedora no tenia forma de conseguirlo: habria tenido que
 * saberse la direccion de memoria y escribirla a mano en el telefono, con la
 * clienta esperando. Aqui se copia de un toque.
 *
 * El enlace sale de la regla de direcciones (lib/dominio.ts), no de una
 * escrita a mano: el dominio lo pone el despliegue (VITE_DOMINIO_BASE).
 */

const MENSAJE_POR_DEFECTO =
  'Hola, te comparto el catalogo de Lux by Emory. Puedes ver las piezas '
  + 'disponibles y apartar las que te gusten desde ahi:';

/**
 * También lo usan el QR de la vitrina y el del catálogo PDF: un enlace, un
 * sitio. Con el dominio es la raíz (luxbyemory.com), aunque se pida desde
 * entrar.luxbyemory.com; sin él (desarrollo), /publico en la misma dirección.
 */
export function enlacePublico(): string {
  const d = direcciones();
  return urlTienda(d, d.base ? '/' : '/publico');
}

export function CompartirCatalogo({ titulo = 'Enviar el catálogo', enlace: propio, mensaje: suyo, pista }: {
  titulo?: string;
  /** Otro enlace: el catálogo de un revendedor. Por defecto, el de la tienda. */
  enlace?: string;
  /** El texto que va antes del enlace. Por defecto, el de Textos. */
  mensaje?: string;
  /** Lo que se lee debajo de los botones. */
  pista?: ReactNode;
}) {
  const textos = useTextos();
  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);

  const deLaTienda = useMemo(enlacePublico, []);
  const enlace = propio ?? deLaTienda;
  const mensaje = `${suyo?.trim() || textos.mensaje_whatsapp?.trim() || MENSAJE_POR_DEFECTO}\n\n${enlace}`;

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
          aria-label="Enlace del catálogo"
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
          {pista ?? 'La clienta ve las piezas disponibles y aparta las que quiera. Lo que aparte te aparece aquí, en Pedidos.'}
        </p>
      )}
    </section>
  );
}
