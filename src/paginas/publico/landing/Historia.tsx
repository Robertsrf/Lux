import { fotoDeLanding } from '../../../lib/fotos';
import type { SeccionLanding } from '../../../hooks/useLanding';
import { BotonDestino } from './contexto';
import { Titulo } from './Titulo';

/** Los párrafos de un texto: una línea en blanco separa uno de otro. */
function Parrafos({ texto, clase }: { texto: string; clase: string }) {
  return (
    <>
      {texto.split(/\n{2,}/).map((p) => (p.trim() ? <p key={p} className={clase}>{p.trim()}</p> : null))}
    </>
  );
}

/**
 * "Quiénes somos": la foto y el texto, lado a lado en pantallas anchas y
 * uno sobre otro en el teléfono. Sin foto, el texto ocupa todo el ancho.
 */
export function Nosotros({ seccion }: { seccion: SeccionLanding }) {
  const foto = fotoDeLanding(seccion.datos.foto, '(min-width: 900px) 440px, 100vw');
  if (!seccion.titulo && !seccion.texto && !foto) return null;
  return (
    <section className={foto ? 'lp-nosotros' : 'lp-nosotros lp-nosotros--sin-foto'} aria-labelledby={`t-${seccion.id}`}>
      {foto ? (
        <div className="lp-nosotros__foto">
          <img {...foto} alt={seccion.datos.alt ?? ''} loading="lazy" decoding="async" width={800} height={1000} />
        </div>
      ) : null}
      <div className="lp-nosotros__cuerpo">
        {seccion.titulo ? <Titulo id={`t-${seccion.id}`}>{seccion.titulo}</Titulo> : null}
        {seccion.texto ? <Parrafos texto={seccion.texto} clase="lp-texto" /> : null}
        <BotonDestino boton={seccion.datos.boton} />
      </div>
    </section>
  );
}

/**
 * "Lo que buscamos": lo que la marca quiere para la clienta, dicho en
 * grande sobre verde profundo, con dos líneas finas de oro. Va bien sin
 * foto (así viene sembrada); con foto, la lleva como fondo apagado.
 */
export function Buscamos({ seccion }: { seccion: SeccionLanding }) {
  const foto = fotoDeLanding(seccion.datos.foto, '(min-width: 1180px) 1180px, 100vw');
  if (!seccion.texto) return null;
  return (
    <section className="lp-buscamos" aria-labelledby={`t-${seccion.id}`}>
      {foto ? <img className="lp-buscamos__foto" {...foto} alt="" loading="lazy" decoding="async" /> : null}
      <div className="lp-buscamos__cuerpo">
        <span className="lp-buscamos__linea" aria-hidden="true" />
        {seccion.titulo ? <h2 className="lp-buscamos__titulo" id={`t-${seccion.id}`}>{seccion.titulo}</h2> : null}
        <Parrafos texto={seccion.texto} clase="lp-buscamos__texto" />
        <span className="lp-buscamos__linea" aria-hidden="true" />
        <BotonDestino boton={seccion.datos.boton} sobreVerde />
      </div>
    </section>
  );
}
