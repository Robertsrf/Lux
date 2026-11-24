import { formatearBcv, formatearBs } from '../../../../lib/dinero';
import { fuenteFoto } from '../../../../lib/fotos';
import { conFoto, rangoDe } from '../../../../lib/familias';
import type { Familia } from '../../../../lib/familias';
import type { ModeloRevendedor } from '../../../../lib/tipos';
import type { CatalogoRv } from '../tipos';

export type FormaTarjeta = 'grande' | 'normal' | 'fila';

const TAMANOS: Record<FormaTarjeta, string> = {
  grande: '(max-width: 640px) 92vw, 600px',
  normal: '(max-width: 640px) 46vw, 300px',
  fila: '(max-width: 640px) 60vw, 300px',
};

/** El precio de un producto: el de la medida más barata, "Desde" si varían. */
export function Precio({ familia }: { familia: Familia<ModeloRevendedor> }) {
  const bs = rangoDe(familia.variantes, (v) => v.precio_bs);
  const bcv = rangoDe(familia.variantes, (v) => v.precio_usd);
  const desde = bs.min !== bs.max;
  return (
    <span className="rvc-precio">
      {desde ? <span className="rvc-precio__desde">Desde </span> : null}
      <span className="rvc-precio__cifra">{formatearBs(bs.min)}</span>
      <span className="rvc-precio__cifra">{formatearBcv(bcv.min)}</span>
    </span>
  );
}

/** Lo que se hace con una pieza desde su tarjeta: agregar, contar o elegir medida. */
export function AccionPieza({ c, familia }: { c: CatalogoRv; familia: Familia<ModeloRevendedor> }) {
  const nombre = familia.cabeza.nombre;
  if (familia.variantes.length > 1) {
    const llevas = familia.variantes.reduce((s, v) => s + c.llevas(v.id), 0);
    return (
      <button type="button" className={llevas ? 'rvc-boton rvc-boton--hecho' : 'rvc-boton'} onClick={() => c.abrirFicha(familia.clave)}>
        {llevas ? `${llevas} en tu pedido · Elegir` : 'Elegir medida'}
        <span className="rvc-oculto"> de {nombre}</span>
      </button>
    );
  }
  const id = familia.cabeza.id;
  const llevas = c.llevas(id);
  const hay = c.disponible(id);
  if (llevas > 0) {
    return (
      <div className="rvc-contador" role="group" aria-label={`${nombre}: ${llevas} en tu pedido`}>
        <button type="button" aria-label={`Quitar una de ${nombre}`} onClick={() => c.cambiar(id, llevas - 1)}>−</button>
        <span aria-live="polite">{llevas}</span>
        <button type="button" aria-label={`Agregar otra de ${nombre}`} disabled={llevas >= hay} onClick={() => c.cambiar(id, llevas + 1)}>+</button>
      </div>
    );
  }
  return (
    <button type="button" className="rvc-boton" disabled={hay <= 0} onClick={() => c.agregar(id)}>
      Agregar<span className="rvc-oculto"> {nombre}</span>
    </button>
  );
}

/**
 * Una pieza. Un `<article>` con botones hermanos, nunca un botón dentro de
 * otro: la foto abre su ficha y la acción agrega.
 */
export function Tarjeta({ c, familia, forma = 'normal' }: { c: CatalogoRv; familia: Familia<ModeloRevendedor>; forma?: FormaTarjeta }) {
  const portada = conFoto(familia.variantes);
  const foto = portada ? fuenteFoto(portada.foto_path, portada.foto_thumb_path, TAMANOS[forma]) : null;
  const nombre = familia.cabeza.nombre;
  return (
    <article className={`rvc-tarjeta rvc-tarjeta--${forma}`}>
      <button type="button" className="rvc-tarjeta__foto" onClick={() => c.abrirFicha(familia.clave)} aria-label={`Ver ${nombre}`}>
        {foto
          ? <img src={foto.src} srcSet={foto.srcSet} sizes={foto.sizes} alt="" loading="lazy" decoding="async" />
          : <span className="rvc-tarjeta__sin-foto" aria-hidden="true">{nombre.slice(0, 1)}</span>}
      </button>
      <div className="rvc-tarjeta__cuerpo">
        <h3 className="rvc-tarjeta__nombre">{nombre}</h3>
        <Precio familia={familia} />
        <AccionPieza c={c} familia={familia} />
      </div>
    </article>
  );
}
