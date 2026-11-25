import type { ReactNode } from 'react';
import { nombreDeTipo } from '../../../lib/familias';
import type { Familia } from '../../../lib/familias';
import { formatearEntero } from '../../../lib/dinero';
import type { ModeloPublico } from '../../../lib/tipos';
import type { CatalogoLux, Orden } from '../useCatalogoLux';
import { IcoVolver } from './iconos';

/**
 * La lista de un tipo, de "Todas las joyas" o de una búsqueda (fase 10):
 * volver, el título, los tipos (en fichas desde 900 px; "Ver" en el
 * teléfono), el orden a la vista, la rejilla y "Ver más" con cuántas faltan.
 */
export function Lista({ c, tarjeta, aviso, listas }: {
  c: CatalogoLux;
  tarjeta: (f: Familia<ModeloPublico>) => ReactNode;
  /** El error, "Trayendo el catálogo" o "Ninguna pieza". */
  aviso: ReactNode;
  /** Las filas que hay ya son de esta consulta. */
  listas: boolean;
}) {
  const { categoria, texto, para, categorias, orden } = c;
  const buscando = texto.trim();
  const quedanPorVer = Math.max(0, c.total - c.modelos.length);
  const titulo = categoria ? nombreDeTipo(categoria) : buscando ? `Buscaste “${buscando}”` : para ? `Joyas de ${para}` : 'Todas las joyas';
  const conTipos = categorias.length > 1 && !buscando;

  return (
    <div className="pub-contenedor pub-lista">
      <button type="button" className="pub-enlace pub-volver" onClick={c.alInicio}>
        <IcoVolver /> Volver al inicio
      </button>
      <h1 className="pub-titulo pub-titulo--grande pub-lista__titulo" ref={c.tituloLista} tabIndex={-1}>{titulo}</h1>

      {conTipos ? (
        <nav className="pub-fichas" aria-label="Ver otro tipo de joya">
          <button type="button" className="pub-ficha" aria-pressed={!categoria} onClick={c.irATodas}>Todas</button>
          {categorias.map((t) => (
            <button key={t} type="button" className="pub-ficha" aria-pressed={categoria === t} onClick={() => c.setCategoria(t)}>
              {nombreDeTipo(t)}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="pub-lista__controles">
        {conTipos ? (
          <label className="pub-selector pub-selector--tipo">
            <span>Ver</span>
            <select value={categoria ?? ''} onChange={(e) => (e.target.value ? c.setCategoria(e.target.value) : c.irATodas())}>
              <option value="">Todas las joyas</option>
              {categorias.map((t) => <option key={t} value={t}>{nombreDeTipo(t)}</option>)}
            </select>
          </label>
        ) : null}
        <label className="pub-selector">
          <span>Ordenar</span>
          <select value={orden} onChange={(e) => c.setOrden(e.target.value as Orden)}>
            <option value="nombre">Por tipo</option>
            <option value="menor">Más baratas primero</option>
            <option value="mayor">Más caras primero</option>
          </select>
        </label>
      </div>

      {aviso}

      {listas ? (
        <>
          <div className="pub-rejilla">{c.familias.map((f) => tarjeta(f))}</div>
          {quedanPorVer > 0 ? (
            <div className="pub-mas">
              <p className="pub-secundario">Viendo {formatearEntero(c.modelos.length)} de {formatearEntero(c.total)}</p>
              <button type="button" className="pub-boton pub-boton--claro" disabled={c.cargandoMas} onClick={() => void c.cargarMas()}>
                {c.cargandoMas ? 'Trayendo más' : `Ver más joyas · faltan ${formatearEntero(quedanPorVer)}`}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
