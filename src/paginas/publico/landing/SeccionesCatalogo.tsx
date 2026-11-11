import type { ReactNode } from 'react';
import { ComoPedir, Estante, POR_ESTANTE, TarjetaPieza, TiposConFoto } from '../../../componentes/VitrinaPublica';
import type { PasoPedido, TipoVitrina } from '../../../componentes/VitrinaPublica';
import { nombreDeTipo } from '../../../lib/familias';
import type { Familia } from '../../../lib/familias';
import { formatearEntero } from '../../../lib/dinero';
import type { ModeloProximo, ModeloPublico } from '../../../lib/tipos';

/**
 * Lo que las secciones del catálogo necesitan de la página. Es el JSX que
 * antes estaba en línea en Catalogo.tsx, sin cambiarlo: la landing lo
 * coloca donde el dueño lo puso, y la lista de un tipo o una búsqueda lo
 * sigue usando igual.
 */
export interface PropsCatalogo {
  /** El inicio todavía no trae sus piezas. */
  cargando: boolean;
  tipos: TipoVitrina[];
  estantes: { categoria: string; familias: Familia<ModeloPublico>[] }[];
  /** Cuántas joyas hay, contadas como tarjetas: lo que se ve al tocar "Ver todas". */
  cuantasJoyas: number;
  /** Cuántas filas trajo el inicio y cuántas hay en la base. */
  traidas: number;
  totalEnBase: number;
  /** La tarjeta de una pieza, con lo que hace con el pedido. */
  tarjeta: (f: Familia<ModeloPublico>) => ReactNode;
  irATodas: () => void;
  irATipo: (categoria: string) => void;
  pasos: PasoPedido[];
  /** Lo que dice el pie de "Cómo pedir" (null: nada). */
  pieComoPedir: string | null;
  proximas: Familia<ModeloProximo>[];
  proximasVisibles: Familia<ModeloProximo>[];
  totalProximos: number;
  cargadosProximos: number;
  todosProximos: boolean;
  alternarProximos: () => void;
  alVerProxima: (f: Familia<ModeloProximo>) => void;
}

/** "Elige por tipo": los tipos con foto y "Todas las joyas". */
export function SeccionTipos({ c, id }: { c: PropsCatalogo; id?: string }) {
  if (c.cargando || c.estantes.length === 0) return null;
  return <TiposConFoto id={id ?? 'tipos'} tipos={c.tipos} alElegir={c.irATipo} todas={{ cuantas: c.cuantasJoyas, alVer: c.irATodas }} />;
}

/** Un estante por tipo, y al final "Ver todas las joyas". */
export function SeccionEstantes({ c }: { c: PropsCatalogo }) {
  if (c.cargando || c.estantes.length === 0) return null;
  return (
    <>
      {c.estantes.map((e) => (
        <Estante
          key={e.categoria}
          titulo={nombreDeTipo(e.categoria)}
          cuantas={e.familias.length}
          alVerTodas={e.familias.length > POR_ESTANTE ? () => c.irATipo(e.categoria) : undefined}
        >
          {e.familias.slice(0, POR_ESTANTE).map((f) => c.tarjeta(f))}
        </Estante>
      ))}
      {/* Con más piezas de las que trae el inicio, se dice: cortar sin
          avisar es lo que dejaba la pieza 401 sin salir nunca. */}
      {c.totalEnBase > c.traidas ? (
        <p className="paginacion__cuenta">
          Aquí salen las primeras {formatearEntero(c.traidas)} de {formatearEntero(c.totalEnBase)} piezas. Elige un tipo arriba para verlas todas.
        </p>
      ) : null}
      {/* Al final de los estantes, lo mismo que arriba: todas juntas. */}
      <div className="ver-todas">
        <p className="ver-todas__texto">¿Prefieres verlas todas juntas, sin separar por tipo?</p>
        <button type="button" className="boton ver-todas__boton" onClick={c.irATodas}>
          Ver todas las joyas · {formatearEntero(c.cuantasJoyas)}
        </button>
      </div>
    </>
  );
}

/** "Cómo pedir", con las cifras de la base. */
export function SeccionComoPedir({ c, id }: { c: PropsCatalogo; id?: string }) {
  if (c.cargando) return null;
  return <ComoPedir id={id ?? 'como-pedir'} pasos={c.pasos} pie={c.pieComoPedir ?? undefined} />;
}

/**
 * PRÓXIMAMENTE. Lo nuevo de un lote que todavía no llega: foto, nombre y
 * precio, y ningún botón de pedir. No dice cuántas vienen ni dónde van: eso
 * es de la tienda. Cuando el dueño libera el lote, estas piezas suben a la
 * vitrina con su "Agregar". Un estante de cuatro: antes eran 41 tarjetas, el
 * 27 % de la página.
 */
export function SeccionProximamente({ c, id }: { c: PropsCatalogo; id?: string }) {
  if (c.cargando || c.proximas.length === 0) return null;
  return (
    <section className="proximos" id={id} aria-labelledby="titulo-proximos">
      <div className="estante__cabeza">
        <h2 className="estante__titulo" id="titulo-proximos">
          Próximamente <span className="estante__cuantas">{c.proximas.length}</span>
        </h2>
      </div>
      <p className="proximos__nota">
        Vienen en camino. Todavía no se pueden pedir: cuando lleguen, salen arriba con su botón para agregar.
      </p>
      <div className="rejilla-venta">
        {c.proximasVisibles.map((f) => (
          <TarjetaPieza key={f.clave} familia={f} alVer={() => c.alVerProxima(f)} proxima />
        ))}
      </div>
      {/* Abre y cierra: abierto, las 48 alargaban la página 8.000 px y
          dejaban la tienda al fondo, sin manera de volver a plegarlas. */}
      {c.proximas.length > POR_ESTANTE ? (
        <div className="catalogo__mas">
          <button type="button" className="boton boton--secundario" aria-expanded={c.todosProximos} onClick={c.alternarProximos}>
            {c.todosProximos ? 'Ver menos' : `Ver las ${formatearEntero(c.proximas.length)} que vienen`}
          </button>
        </div>
      ) : null}
      {c.todosProximos && c.totalProximos > c.cargadosProximos ? (
        <p className="paginacion__cuenta">Y {formatearEntero(c.totalProximos - c.cargadosProximos)} más que vienen en camino.</p>
      ) : null}
    </section>
  );
}
