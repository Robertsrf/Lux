import { fuenteFoto } from '../../../lib/fotos';
import { conFoto, etiquetasCortas, nombreConVariante, rangoDe } from '../../../lib/familias';
import type { Familia } from '../../../lib/familias';
import { formatearBcv, formatearBs } from '../../../lib/dinero';
import { IcoMas, IcoMenos } from './iconos';

/** Lo que la tarjeta necesita de una pieza: sin costo. */
export interface PiezaTarjeta {
  id: number;
  familia: number;
  nombre: string;
  variante: string | null;
  variantes_nota: string | null;
  foto_path: string | null;
  foto_thumb_path: string | null;
  precio_bs: number | null;
  precio_usd: number | null;
}

/** Lo que la tarjeta hace con el pedido. Sin esto es de Próximamente: se mira, no se pide. */
export interface PedidoTarjeta {
  llevas: (id: number) => number;
  disponible: (id: number) => number;
  alAgregar: (id: number) => void;
  alCambiar: (id: number, cantidad: number) => void;
  /** Una pieza con medidas: abre la hoja de elegir. */
  alElegir: () => void;
}

/**
 * La tarjeta del estilo A (fase 10): la foto alta (4:5) es el botón que
 * abre la pieza; el "+" redondo, su hermano encima de la foto, la agrega (con
 * medidas, abre la hoja de elegir) y se vuelve contador cuando ya va en el
 * pedido. Nunca un botón dentro de otro. Debajo, el nombre en Garamond y los
 * dos precios del mismo tamaño.
 */
export function Tarjeta<T extends PiezaTarjeta>({ familia, alVer, pedido, proxima = false, oferta, ancho = 'rejilla' }: {
  familia: Familia<T>;
  alVer: () => void;
  pedido?: PedidoTarjeta;
  proxima?: boolean;
  /** La cinta de oferta ("Oferta"). */
  oferta?: string;
  /** En un estante la tarjeta tiene ancho fijo; en la rejilla, el de su columna. */
  ancho?: 'estante' | 'rejilla';
}) {
  const m = familia.cabeza;
  const unica = familia.variantes.length === 1;
  const portada = conFoto(familia.variantes) ?? m;
  const foto = fuenteFoto(portada.foto_path, portada.foto_thumb_path, ancho === 'estante' ? '(max-width: 640px) 64vw, 280px' : '(max-width: 640px) 46vw, 280px');
  const bs = rangoDe(familia.variantes, (v) => v.precio_bs);
  const bcv = rangoDe(familia.variantes, (v) => v.precio_usd);
  const etiquetas = etiquetasCortas(familia);
  const nombre = unica ? nombreConVariante(m.nombre, m.variante) : m.nombre;
  const quedan = pedido ? familia.variantes.reduce((n, v) => n + pedido.disponible(v.id), 0) : 0;
  const puestas = pedido ? familia.variantes.reduce((n, v) => n + pedido.llevas(v.id), 0) : 0;
  const agotado = pedido ? familia.variantes.every((v) => pedido.llevas(v.id) >= pedido.disponible(v.id)) : true;

  return (
    <article className={`pub-tarjeta pub-tarjeta--${ancho}${proxima ? ' pub-tarjeta--proxima' : ''}`}>
      <div className="pub-tarjeta__caja">
        <button type="button" className="pub-tarjeta__ver" onClick={alVer} aria-label={`Ver ${nombre}${proxima ? ', próximamente' : ''}`}>
          {foto ? <img className="pub-tarjeta__foto" data-familia={familia.clave} {...foto} alt="" loading="lazy" /> : <span className="pub-tarjeta__foto" />}
        </button>
        {oferta ? <span className="pub-tarjeta__cinta">{oferta}</span> : null}
        {proxima ? <span className="pub-tarjeta__cinta pub-tarjeta__cinta--proxima">Próximamente</span> : null}
        {pedido && unica && puestas > 0 ? (
          <div className="pub-contador pub-tarjeta__accion" key="contador">
            <button type="button" className="pub-icono" aria-label={`Quitar una de ${nombre}`} onClick={() => pedido.alCambiar(m.id, puestas - 1)}><IcoMenos /></button>
            <span className="pub-contador__n" aria-live="polite"><span className="pub-rebota" key={puestas}>{puestas}</span></span>
            <button type="button" className="pub-icono" aria-label={`Agregar otra de ${nombre}`} disabled={agotado} onClick={() => pedido.alCambiar(m.id, puestas + 1)}><IcoMas /></button>
          </div>
        ) : pedido ? (
          <button
            type="button" key="mas"
            className="pub-icono pub-tarjeta__mas pub-tarjeta__accion"
            disabled={agotado}
            onClick={unica ? () => pedido.alAgregar(m.id) : pedido.alElegir}
            {...(unica ? {} : { 'aria-haspopup': 'dialog' as const })}
            aria-label={unica ? `Agregar ${nombre} a mi pedido` : `Elegir medida de ${m.nombre}${puestas > 0 ? `, llevas ${puestas}` : ''}`}
          >
            <IcoMas />
            {!unica && puestas > 0 ? <span className="pub-bolsa__n" aria-hidden="true">{puestas}</span> : null}
          </button>
        ) : null}
      </div>
      <div className="pub-tarjeta__cuerpo">
        <h3 className="pub-tarjeta__nombre">{m.nombre}</h3>
        {etiquetas ? <p className="pub-tarjeta__medidas">{etiquetas}</p> : null}
        {unica && m.variantes_nota ? <p className="pub-tarjeta__medidas">{m.variantes_nota}</p> : null}
        <p className="pub-tarjeta__precio">
          {bs.min !== bs.max ? <span className="pub-tarjeta__desde">desde </span> : null}
          <span className="pub-precio">{formatearBs(bs.min)}</span>
          <span className="pub-tarjeta__sep pub-secundario"> · </span>
          <span className="pub-precio pub-secundario">{formatearBcv(bcv.min)}</span>
        </p>
        {pedido && !proxima ? (
          <p className="pub-tarjeta__quedan">{quedan === 1 ? 'Última pieza' : `Quedan ${quedan}`}</p>
        ) : null}
      </div>
    </article>
  );
}
