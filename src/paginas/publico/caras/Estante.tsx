import { useId } from 'react';
import { useAparecer } from '../../../hooks/useAparecer';
import type { ReactNode } from 'react';
import type { fuenteFoto } from '../../../lib/fotos';
import { nombreDeTipo } from '../../../lib/familias';
import { formatearEntero } from '../../../lib/dinero';

/** Cuántas piezas lleva un estante del inicio antes de "Ver los N". */
export const POR_ESTANTE = 8;

/**
 * Un estante del estilo A: título grande, "Ver los N" y una fila que se
 * desliza de lado con el dedo (`scroll-snap`). La fila es `position:
 * relative`: un texto oculto dentro de una fila con scroll se escapa y corre
 * la página de lado (ver Trampas en CLAUDE.md).
 */
export function Estante({ titulo, id, cuantas, alVerTodas, nota, children }: {
  titulo: string;
  id?: string;
  cuantas?: number;
  alVerTodas?: () => void;
  nota?: ReactNode;
  children: ReactNode;
}) {
  const idTitulo = useId();
  // Las tarjetas entran escalonadas la primera vez que el estante se ve.
  const [ref, visible] = useAparecer<HTMLElement>();
  return (
    <section ref={ref} className={visible ? 'pub-estante pub-estante--visto' : 'pub-estante pub-estante--espera'} id={id} aria-labelledby={idTitulo}>
      <div className="pub-contenedor pub-estante__cabeza">
        <h2 className="pub-titulo pub-titulo--medio" id={idTitulo}>{titulo}</h2>
        {alVerTodas ? (
          <button type="button" className="pub-enlace" onClick={alVerTodas}>
            {cuantas ? `Ver los ${formatearEntero(cuantas)}` : 'Ver todas'}<span className="visualmente-oculto"> de {titulo}</span>
          </button>
        ) : null}
      </div>
      {nota ? <p className="pub-contenedor pub-estante__nota pub-secundario">{nota}</p> : null}
      <div className="pub-estante__fila">{children}</div>
    </section>
  );
}

/** Un cuadro de "Elige por tipo": la foto de una de sus piezas, su nombre y cuántas hay. */
export interface TipoVitrina {
  nombre: string;
  cuantas: number;
  foto: ReturnType<typeof fuenteFoto>;
}

/**
 * "Elige por tipo": tres por fila en el teléfono, con foto alta y el nombre
 * debajo. El primero, "Todas las joyas" con las fotos de cuatro tipos (pedido
 * del dueño del 27/10/2026: verlo todo junto).
 */
export function TiposConFoto({ tipos, alElegir, id: idSeccion, todas, titulo = 'Elige por tipo' }: {
  tipos: TipoVitrina[];
  alElegir: (tipo: string) => void;
  id?: string;
  todas?: { cuantas: number; alVer: () => void };
  titulo?: string;
}) {
  const id = useId();
  if (tipos.length < 2) return null;
  return (
    <section className="pub-contenedor pub-tipos" id={idSeccion} aria-labelledby={id}>
      <h2 className="pub-titulo pub-titulo--medio" id={id}>{titulo}</h2>
      <ul className="pub-tipos__lista">
        {todas ? (
          <li>
            <button type="button" className="pub-tipo" onClick={todas.alVer}>
              <span className="pub-tipo__foto pub-tipo__mosaico" aria-hidden="true">
                {tipos.slice(0, 4).map((t) => (t.foto ? <img key={t.nombre} {...t.foto} alt="" loading="lazy" /> : <span key={t.nombre} />))}
              </span>
              <span className="pub-tipo__nombre">Todas las joyas</span>
              <span className="pub-tipo__cuantas">{todas.cuantas === 1 ? '1 pieza' : `${formatearEntero(todas.cuantas)} piezas`}</span>
            </button>
          </li>
        ) : null}
        {tipos.map((t) => (
          <li key={t.nombre}>
            <button type="button" className="pub-tipo" onClick={() => alElegir(t.nombre)}>
              {t.foto ? <img className="pub-tipo__foto" {...t.foto} alt="" loading="lazy" /> : <span className="pub-tipo__foto" />}
              <span className="pub-tipo__nombre">{nombreDeTipo(t.nombre)}</span>
              <span className="pub-tipo__cuantas">{t.cuantas === 1 ? '1 pieza' : `${formatearEntero(t.cuantas)} piezas`}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
