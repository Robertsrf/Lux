import { useId, useMemo, useState } from 'react';
import { fuenteFoto } from '../../../lib/fotos';
import { formatearBcv, formatearBs, formatearDescuento } from '../../../lib/dinero';
import { nombreConVariante } from '../../../lib/familias';
import { ESCOTES, piezasParaEscote, type ClaveEscote } from '../../../lib/escotes';
import type { ModeloPublico } from '../../../lib/tipos';
import { SiluetaEscote } from '../../../componentes/SiluetaEscote';
import { BotonOferta, type AccionesOferta } from './PiezasOferta';
import { Titulo } from './Titulo';

/**
 * "¿Qué escote usas?": elige el suyo y ve el collar y los aretes que le van
 * (la misma regla que la vitrina, `lib/escotes.ts`). "Llévate el conjunto
 * con X %" pide el código de esas dos piezas. Sin piezas que le vayan al
 * escote elegido, lo dice y no ofrece nada.
 */
export function Escote({ id, titulo, texto, piezas, pct, acciones }: {
  id: string;
  titulo: string;
  texto: string | null;
  piezas: ModeloPublico[];
  /** `oferta_pareja_pct`. */
  pct: number;
  acciones: AccionesOferta;
}) {
  const [elegido, setElegido] = useState<ClaveEscote | null>(null);
  const idGrupo = useId();
  const escote = ESCOTES.find((e) => e.clave === elegido) ?? null;
  const resultado = useMemo(() => (escote ? piezasParaEscote(escote, piezas) : null), [escote, piezas]);

  // El conjunto: el collar y un arete; si no hay uno de los dos, las dos
  // primeras que sí hay. Menos de dos piezas no es un conjunto.
  const conjunto = useMemo(() => {
    if (!resultado) return [];
    const base = resultado.modo === 'collar'
      ? [resultado.collares[0], resultado.aretes[0] ?? resultado.collares[1]]
      : resultado.aretes.slice(0, 2);
    return base.filter((x): x is ModeloPublico => x !== undefined && x.disponible > 0 && x.precio_usd !== null);
  }, [resultado]);

  return (
    <section className="lp-oferta lp-escote" aria-labelledby={id}>
      <Titulo id={id} texto={texto}>{titulo}</Titulo>
      <div className="lp-escote__elegir" role="group" aria-labelledby={`${idGrupo}-r`}>
        <span className="visualmente-oculto" id={`${idGrupo}-r`}>Elige tu escote</span>
        {ESCOTES.map((e) => (
          <button key={e.clave} type="button" className="lp-escote__opcion" aria-pressed={e.clave === elegido} onClick={() => setElegido(e.clave)}>
            {e.titulo}
          </button>
        ))}
      </div>

      {escote ? (
        <div className="lp-escote__resultado" aria-live="polite">
          {resultado ? (
            <>
              <div className="lp-escote__dibujo">
                <SiluetaEscote clave={escote.clave} descripcion={`${escote.titulo}: ${escote.joya}`} conJoya={resultado.modo === 'collar'} />
              </div>
              <div className="lp-escote__piezas">
                <p className="lp-escote__consejo">{resultado.modo === 'collar' ? escote.consejo : escote.consejoAretes}</p>
                <ul className="lp-dos">
                  {conjunto.map((m) => {
                    const foto = fuenteFoto(m.foto_path, m.foto_thumb_path, '(max-width: 640px) 40vw, 200px');
                    return (
                      <li key={m.id} className="lp-dos__una">
                        {foto ? <img className="lp-dos__foto" {...foto} alt="" loading="lazy" /> : <span className="lp-dos__foto" />}
                        <span className="lp-dos__nombre">{nombreConVariante(m.nombre, m.variante)}</span>
                        <span className="lp-dos__precio">{formatearBs(m.precio_bs)}</span>
                        <span className="lp-dos__precio">{formatearBcv(m.precio_usd)}</span>
                      </li>
                    );
                  })}
                </ul>
                {conjunto.length >= 2 ? (
                  <BotonOferta
                    texto={`Llévate el conjunto con ${formatearDescuento(pct)}`}
                    acciones={acciones}
                    origen="escote"
                    modelos={conjunto.map((m) => m.id)}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <p className="lp-escote__consejo">Por ahora no tenemos una pieza que le quede a ese escote. Mira todas las joyas, que van llegando más.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
