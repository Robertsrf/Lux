import { useEffect, useRef } from 'react';
import { nombreDeTipo } from '../../../../lib/familias';
import type { CatalogoRv } from '../tipos';
import { Tarjeta } from './Tarjeta';
import type { FormaTarjeta } from './Tarjeta';

/** "Trayendo el catálogo", sin el aspecto de Lux. */
export function Cargando({ texto = 'Trayendo el catálogo' }: { texto?: string }) {
  return <p className="rvc-cargando" role="status">{texto}</p>;
}

/** Sin piezas: por qué, y cómo volver a ver algo. */
export function SinPiezas({ c }: { c: CatalogoRv }) {
  const buscando = Boolean(c.texto.trim());
  return (
    <div className="rvc-vacio">
      <h2 className="rvc-vacio__titulo">
        {buscando ? 'Ninguna pieza coincide' : c.para ? `Por ahora no hay piezas de ${c.para}` : 'Por ahora no hay piezas disponibles'}
      </h2>
      <p>{buscando ? 'Prueba con otra palabra, o mira todo el catálogo.' : `Vuelve pronto, o escríbele a ${c.primerNombre}.`}</p>
      {c.para && !buscando
        ? <button type="button" className="rvc-boton rvc-boton--claro" onClick={() => c.elegirPara(null)}>Ver todas las joyas</button>
        : c.enLista ? <button type="button" className="rvc-boton rvc-boton--claro" onClick={c.alInicio}>Ver todo el catálogo</button> : null}
    </div>
  );
}

/**
 * La lista de un tipo o de una búsqueda: título, "Todo el catálogo",
 * las piezas de 24 en 24 con "Ver más", y el aviso si llegó a las 400.
 */
export function Lista({ c, forma = 'normal' }: { c: CatalogoRv; forma?: FormaTarjeta }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (c.categoria) titulo.current?.focus({ preventScroll: true }); }, [c.categoria]);
  const faltan = c.familias.length - c.visibles;
  return (
    <section className="rvc-lista" aria-labelledby="rvc-lista-titulo">
      <div className="rvc-lista__cabeza">
        <button type="button" className="rvc-enlace" onClick={c.alInicio}>← Todo el catálogo</button>
        <h2 id="rvc-lista-titulo" className="rvc-titulo" ref={titulo} tabIndex={-1}>
          {c.categoria ? nombreDeTipo(c.categoria) : `Buscaste “${c.texto.trim()}”`}
        </h2>
      </div>
      {c.cargando ? <Cargando /> : c.familias.length === 0 ? <SinPiezas c={c} /> : (
        <>
          <div className="rvc-rejilla">
            {c.familias.slice(0, c.visibles).map((f) => <Tarjeta key={f.clave} c={c} familia={f} forma={forma} />)}
          </div>
          {faltan > 0 ? (
            <button type="button" className="rvc-boton rvc-boton--claro rvc-ver-mas" onClick={c.verMas}>
              Ver más ({faltan} {faltan === 1 ? 'queda' : 'quedan'})
            </button>
          ) : null}
          {c.alTope ? (
            <p className="rvc-nota">Se ven las primeras {c.limite} piezas. Busca por nombre o elige un tipo para ver las demás.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
