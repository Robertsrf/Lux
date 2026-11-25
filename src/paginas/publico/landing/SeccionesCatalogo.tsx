import type { ReactNode } from 'react';
import { ComoPedir } from '../caras/ComoPedir';
import type { PasoPedido } from '../caras/ComoPedir';
import { Estante, POR_ESTANTE, TiposConFoto } from '../caras/Estante';
import type { TipoVitrina } from '../caras/Estante';
import { Tarjeta } from '../caras/Tarjeta';
import { irA } from '../caras/ComoPedir';
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
  tarjeta: (f: Familia<ModeloPublico>, ancho?: 'estante' | 'rejilla') => ReactNode;
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

/** Un estante por tipo, que se desliza de lado, y al final "Ver todas las joyas". */
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
          {e.familias.slice(0, POR_ESTANTE).map((f) => c.tarjeta(f, 'estante'))}
          {e.familias.length > POR_ESTANTE ? (
            <button type="button" className="pub-estante__final" onClick={() => c.irATipo(e.categoria)}>
              <span className="pub-titulo pub-titulo--medio">Ver los {formatearEntero(e.familias.length)}</span>
              <span className="pub-secundario">{nombreDeTipo(e.categoria)}</span>
            </button>
          ) : null}
        </Estante>
      ))}
      {/* Con más piezas de las que trae el inicio, se dice: cortar sin
          avisar es lo que dejaba la pieza 401 sin salir nunca. */}
      {c.totalEnBase > c.traidas ? (
        <p className="pub-contenedor pub-secundario">
          Aquí salen las primeras {formatearEntero(c.traidas)} de {formatearEntero(c.totalEnBase)} piezas. Elige un tipo arriba para verlas todas.
        </p>
      ) : null}
      {/* Al final de los estantes, lo mismo que arriba: todas juntas. */}
      <div className="pub-contenedor pub-ver-todas">
        <p className="pub-prosa">¿Prefieres verlas todas juntas, sin separar por tipo?</p>
        <button type="button" className="pub-boton" onClick={c.irATodas}>
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
 * vitrina con su "Agregar". Un estante de ocho que se desliza: antes eran 41 tarjetas, el
 * 27 % de la página.
 */
export function SeccionProximamente({ c, id }: { c: PropsCatalogo; id?: string }) {
  if (c.cargando || c.proximas.length === 0) return null;
  const nota = 'Vienen en camino. Todavía no se pueden pedir: cuando lleguen, salen arriba con su botón para agregar.';
  const tarjeta = (f: Familia<ModeloProximo>, ancho: 'estante' | 'rejilla') => (
    <Tarjeta key={f.clave} familia={f} alVer={() => c.alVerProxima(f)} proxima ancho={ancho} />
  );
  // Todas, para bajar y verlas (dueño, 25/11/2026: "de lado, 140 es
  // inviable"): una cuadrícula entera, con "Ver menos" que vuelve arriba.
  if (c.todosProximos) {
    return (
      <section className="pub-contenedor pub-proximas" id={id ?? 'proximas'} aria-labelledby="titulo-proximas">
        <h2 className="pub-titulo pub-titulo--medio" id="titulo-proximas">Próximamente · {formatearEntero(c.proximas.length)}</h2>
        <p className="pub-estante__nota pub-secundario">{nota}</p>
        <div className="pub-rejilla">{c.proximasVisibles.map((f) => tarjeta(f, 'rejilla'))}</div>
        {c.totalProximos > c.cargadosProximos
          ? <p className="pub-secundario">Y {formatearEntero(c.totalProximos - c.cargadosProximos)} más que vienen en camino.</p>
          : null}
        <div className="pub-estante__pie">
          <button type="button" className="pub-boton pub-boton--claro" aria-expanded="true"
            onClick={() => { c.alternarProximos(); requestAnimationFrame(() => irA(id ?? 'proximas')); }}>
            Ver menos
          </button>
        </div>
      </section>
    );
  }
  return (
    <Estante
      id={id ?? 'proximas'}
      titulo="Próximamente"
      nota={nota}
      pie={c.proximas.length > POR_ESTANTE ? (
        <button type="button" className="pub-boton" aria-expanded="false" onClick={c.alternarProximos}>
          Ver todas las que vienen · {formatearEntero(c.proximas.length)}
        </button>
      ) : null}
    >
      {c.proximasVisibles.map((f) => tarjeta(f, 'estante'))}
    </Estante>
  );
}
