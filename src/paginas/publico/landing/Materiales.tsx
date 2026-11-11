import { Icono, type NombreIcono } from '../../../componentes/Iconos';
import { fotoDeLanding } from '../../../lib/fotos';
import type { SeccionLanding } from '../../../hooks/useLanding';
import { Titulo } from './Titulo';

const ICONOS: ReadonlySet<string> = new Set<NombreIcono>(['acero', 'oro', 'sello']);

/**
 * "De qué están hechas": tres o cuatro tarjetas, cada una con su foto, su
 * icono y lo que ese material significa para la piel. Es lo que más
 * pregunta quien tiene la piel sensible, dicho sin tecnicismos.
 */
export function Materiales({ seccion }: { seccion: SeccionLanding }) {
  const tarjetas = (seccion.datos.tarjetas ?? []).filter((t) => t.titulo || t.texto);
  if (tarjetas.length === 0 && !seccion.texto) return null;
  return (
    <section className="lp-materiales" aria-labelledby={`t-${seccion.id}`}>
      {seccion.titulo ? <Titulo id={`t-${seccion.id}`} texto={seccion.texto}>{seccion.titulo}</Titulo> : null}
      <ul className="lp-materiales__lista">
        {tarjetas.map((t, n) => {
          const foto = fotoDeLanding(t.foto, '(min-width: 900px) 380px, 100vw');
          return (
            <li key={t.titulo ?? n} className="lp-material">
              {foto ? (
                <div className="lp-material__foto">
                  <img {...foto} alt={t.alt ?? ''} loading="lazy" decoding="async" width={800} height={800} />
                </div>
              ) : null}
              <div className="lp-material__cuerpo">
                {t.icono && ICONOS.has(t.icono) ? (
                  <span className="lp-material__icono"><Icono nombre={t.icono as NombreIcono} className="icono icono--lg" /></span>
                ) : null}
                {t.titulo ? <h3 className="lp-material__titulo">{t.titulo}</h3> : null}
                {t.texto ? <p className="lp-material__texto">{t.texto}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
