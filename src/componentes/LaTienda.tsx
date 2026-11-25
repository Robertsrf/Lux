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
    <section className="pub-tienda" id={id} aria-labelledby={idTitulo}>
      <div className="pub-tienda__interior">
        <p className="pub-tienda__etiqueta">Visítanos</p>
        <h2 className="pub-tienda__titulo" id={idTitulo}>La tienda</h2>
        <div className="pub-tienda__datos">
          {direccion || mapa ? (
            <div className="pub-tienda__dato">
              <span className="pub-tienda__rotulo">Dónde estamos</span>
              {direccion ? <p className="pub-tienda__texto">{direccionConCiudad(direccion, textos.ciudad)}</p> : null}
              {mapa ? (
                <a className="pub-boton pub-boton--crema pub-boton--chico" href={mapa} target="_blank" rel="noopener noreferrer">
                  Cómo llegar<span className="visualmente-oculto"> (abre Google Maps)</span>
                </a>
              ) : null}
            </div>
          ) : null}
          {horario ? (
            <div className="pub-tienda__dato">
              <span className="pub-tienda__rotulo">Horario</span>
              <p className="pub-tienda__texto pub-tienda__texto--lineas">{horario}</p>
            </div>
          ) : null}
          {whatsapp || instagram ? (
            <div className="pub-tienda__dato">
              <span className="pub-tienda__rotulo">Escríbenos</span>
              {whatsapp ? (
                <a className="pub-boton pub-boton--crema pub-boton--chico" href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              ) : null}
              {instagram ? (
                <a className="pub-tienda__enlace" href={instagram.url} target="_blank" rel="noopener noreferrer">@{instagram.usuario} en Instagram</a>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Plegado: pagar va después de apartar, que es cuando se sabe el
            monto. Abierto arriba invitaba a pagar sin pedido. */}
        {hayPago ? (
          <details className="pub-tienda__pago">
            <summary>Cómo pagar</summary>
            <p className="pub-tienda__pista">
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
      </div>
    </section>
  );
}
