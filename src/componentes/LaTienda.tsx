import { useId } from 'react';
import { PagoMovil } from './PagoMovil';
import { direccionConCiudad, enlaceInstagram, enlaceMapa, enlaceWhatsAppA } from '../lib/enlaces';
import type { useTextos } from '../hooks/useTextos';

/**
 * Dónde está la tienda, cuándo abre, cómo se le escribe y a dónde se paga,
 * al final del catálogo de la tienda (rediseño del 24/10/2026). Antes la
 * página terminaba en la última tarjeta: ni dirección, ni WhatsApp, ni
 * horario. Una tienda que no dice dónde está no da confianza.
 *
 * Todo sale de Textos, que llena el dueño. Lo que está vacío no sale, y si
 * no hay nada, no sale la sección: nunca se inventa una dirección.
 *
 * SOLO EN EL CATÁLOGO DE LA TIENDA. El de un revendedor nunca la enseña: su
 * clienta le paga a él, y con los datos de Lux a la vista se lo saltaría.
 */
export function LaTienda({ id, textos }: { id?: string; textos: ReturnType<typeof useTextos> }) {
  const idTitulo = useId();
  const direccion = textos.direccion_tienda?.trim() ?? '';
  const horario = textos.horario_tienda?.trim() ?? '';
  const mapa = enlaceMapa(textos.mapa_tienda, direccion, textos.ciudad);
  const whatsapp = enlaceWhatsAppA(textos.whatsapp_tienda, 'Hola, vengo del catálogo de Lux by Emory.');
  const instagram = enlaceInstagram(textos.instagram_tienda);
  const hayPago = Boolean(textos.pago_movil_cedula || textos.pago_movil_telefono || textos.pago_movil_banco);

  if (!direccion && !horario && !mapa && !whatsapp && !instagram && !hayPago) return null;

  return (
    <section className="la-tienda" id={id} aria-labelledby={idTitulo}>
      <h2 className="seccion-titulo" id={idTitulo}>La tienda</h2>
      <div className="la-tienda__tarjeta">
        {direccion || mapa ? (
          <div className="la-tienda__dato">
            <span className="la-tienda__etiqueta">Dónde estamos</span>
            {direccion ? (
              <p className="la-tienda__texto">{direccionConCiudad(direccion, textos.ciudad)}</p>
            ) : null}
            {mapa ? (
              <a className="boton boton--secundario la-tienda__boton" href={mapa} target="_blank" rel="noopener noreferrer">
                Cómo llegar<span className="visualmente-oculto"> (abre Google Maps)</span>
              </a>
            ) : null}
          </div>
        ) : null}

        {horario ? (
          <div className="la-tienda__dato">
            <span className="la-tienda__etiqueta">Horario</span>
            <p className="la-tienda__texto la-tienda__texto--lineas">{horario}</p>
          </div>
        ) : null}

        {whatsapp || instagram ? (
          <div className="la-tienda__dato">
            <span className="la-tienda__etiqueta">Escríbenos</span>
            {whatsapp ? (
              <a className="boton la-tienda__boton" href={whatsapp} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            ) : null}
            {instagram ? (
              <a className="la-tienda__enlace" href={instagram.url} target="_blank" rel="noopener noreferrer">
                @{instagram.usuario} en Instagram
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Plegado: pagar va después de apartar, que es cuando se sabe el
          monto. Abierto arriba invitaba a pagar sin pedido. */}
      {hayPago ? (
        <details className="la-tienda__pago">
          <summary>Cómo pagar</summary>
          <p className="campo__pista">
            Primero aparta tu pedido: ahí te decimos el monto exacto y reportas el pago con su referencia.
          </p>
          <PagoMovil
            cedula={textos.pago_movil_cedula ?? ''}
            telefono={textos.pago_movil_telefono ?? ''}
            banco={textos.pago_movil_banco ?? ''}
            titular={textos.pago_movil_titular ?? ''}
          />
        </details>
      ) : null}
    </section>
  );
}
