import { useEffect, useId, useRef, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { useUbicaciones } from '../hooks/useCatalogos';
import { nombreConVariante } from '../lib/familias';

/** Una pieza que se puede mover. Con variantes, se elige cual. */
export interface PiezaMovible {
  modelo_id: number;
  nombre: string;
  variante: string | null;
}

/**
 * Mover piezas de una ubicacion a otra, en un toque.
 *
 * Antes la unica forma era abrir el producto entero y reescribir las
 * cantidades de cada ubicacion a mano: restar en una, sumar en otra, sin
 * equivocarse. Aqui se dice de donde, cuantas y a donde, y lo hace la base
 * en una transaccion (`mover_existencia`), que ademas deja escrito quien lo
 * movio.
 *
 * Lo usan el Inventario (administrador) y el Mostrador (vendedora): ella es
 * la que acomoda la vitrina.
 *
 * Si la pieza esta en una sola ubicacion, el "de donde" no se pregunta: se
 * dice. Lo comun es una lista y un boton.
 */
export function MoverUbicacion({ piezas, desdePreferida, alCerrar, alMover }: {
  /** Una, o las variantes de un producto. */
  piezas: PiezaMovible[];
  /** Por donde empezar a buscar: en el mostrador, la ubicacion que se esta viendo. */
  desdePreferida?: number | null;
  alCerrar: () => void;
  alMover: (mensaje: string) => void;
}) {
  const { ubicaciones } = useUbicaciones();
  const idTitulo = useId();
  const [modeloId, setModeloId] = useState(piezas[0]?.modelo_id ?? null);
  const [donde, setDonde] = useState<{ ubicacion_id: number; cantidad: number }[] | null>(null);
  const [desde, setDesde] = useState<number | null>(null);
  const [hacia, setHacia] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [moviendo, setMoviendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;
  const primerCampo = useRef<HTMLSelectElement>(null);
  const previo = useRef<Element | null>(null);

  // Escape cierra y el foco vuelve a donde estaba, como la hoja de variantes.
  useEffect(() => {
    previo.current = document.activeElement;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar.current(); };
    document.addEventListener('keydown', alTeclear);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflow;
      (previo.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  // Donde esta hoy esa pieza. Sale de la vista de venta, que las dos caras
  // pueden leer y que no trae costos. Se mira `existencia`, lo que hay de
  // verdad, y no `cantidad`, que es lo libre: mover de sitio una pieza
  // apartada es legitimo, sigue siendo del pedido.
  useEffect(() => {
    if (modeloId === null) return;
    let vigente = true;
    setDonde(null);
    setError(null);
    void (async () => {
      const { data, error: err } = await supabase
        .from('v_venta_ubicacion')
        .select('ubicacion_id, existencia')
        .eq('modelo_id', modeloId)
        .gt('existencia', 0);
      if (!vigente) return;
      if (err) { setError(mensajeDeError(err)); setDonde([]); return; }
      const filas = ((data as { ubicacion_id: number; existencia: number }[] | null) ?? [])
        .map((f) => ({ ubicacion_id: f.ubicacion_id, cantidad: f.existencia }));
      setDonde(filas);
      const inicial = filas.find((f) => f.ubicacion_id === desdePreferida)
        ?? [...filas].sort((a, b) => b.cantidad - a.cantidad)[0];
      setDesde(inicial?.ubicacion_id ?? null);
      setCantidad(inicial ? String(inicial.cantidad) : '');
      setHacia(null);
      setTimeout(() => primerCampo.current?.focus(), 0);
    })();
    return () => { vigente = false; };
  }, [modeloId, desdePreferida]);

  const nombreDe = (id: number | null) => ubicaciones.find((u) => u.id === id)?.nombre ?? 'Ubicación';
  const enOrigen = donde?.find((d) => d.ubicacion_id === desde)?.cantidad ?? 0;
  const pieza = piezas.find((p) => p.modelo_id === modeloId);
  const n = Math.trunc(Number(cantidad));
  const listo = desde !== null && hacia !== null && hacia !== desde && n > 0 && n <= enOrigen;

  async function mover() {
    if (!listo || modeloId === null || desde === null || hacia === null) return;
    setMoviendo(true);
    setError(null);
    const { error: err } = await supabase.rpc('mover_existencia', {
      p_modelo_id: modeloId, p_desde_id: desde, p_hacia_id: hacia, p_cantidad: n,
    });
    setMoviendo(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alMover(`${n === 1 ? 'Se movió 1' : `Se movieron ${n}`} de ${pieza ? nombreConVariante(pieza.nombre, pieza.variante) : 'la pieza'} a ${nombreDe(hacia)}.`);
  }

  return (
    <div className="elegir-fondo" onClick={alCerrar}>
      <div className="elegir mover" role="dialog" aria-modal="true" aria-labelledby={idTitulo} onClick={(e) => e.stopPropagation()}>
        <div className="elegir__asa" aria-hidden="true" />
        <div className="elegir__cabeza">
          <div>
            <h2 className="elegir__titulo" id={idTitulo}>Mover de ubicación</h2>
            <p className="elegir__subtitulo">{pieza ? nombreConVariante(pieza.nombre, pieza.variante) : ''}</p>
          </div>
          <button type="button" className="elegir__cerrar" onClick={alCerrar} aria-label="Cerrar sin mover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {piezas.length > 1 ? (
          <div className="campo">
            <label htmlFor="mv-pieza">Cuál</label>
            <select id="mv-pieza" value={modeloId ?? ''} onChange={(e) => setModeloId(Number(e.target.value))}>
              {piezas.map((p) => <option key={p.modelo_id} value={p.modelo_id}>{p.variante ?? p.nombre}</option>)}
            </select>
          </div>
        ) : null}

        {donde === null ? (
          <p className="campo__pista">Buscando dónde está</p>
        ) : donde.length === 0 ? (
          <p className="campo__pista">No hay piezas de esta en ninguna ubicación: no hay nada que mover.</p>
        ) : (
          <>
            {donde.length === 1 ? (
              <p className="mover__origen">
                Está en <strong>{nombreDe(donde[0]!.ubicacion_id)}</strong>: {donde[0]!.cantidad} {donde[0]!.cantidad === 1 ? 'pieza' : 'piezas'}.
              </p>
            ) : (
              <div className="campo">
                <label htmlFor="mv-desde">De</label>
                <select
                  id="mv-desde"
                  value={desde ?? ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setDesde(id);
                    setCantidad(String(donde.find((d) => d.ubicacion_id === id)?.cantidad ?? ''));
                    if (hacia === id) setHacia(null);
                  }}
                >
                  {donde.map((d) => (
                    <option key={d.ubicacion_id} value={d.ubicacion_id}>{nombreDe(d.ubicacion_id)} · {d.cantidad}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="fila">
              <div className="campo">
                <label htmlFor="mv-hacia">Llevar a</label>
                <select
                  id="mv-hacia"
                  ref={primerCampo}
                  value={hacia ?? ''}
                  onChange={(e) => setHacia(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Elige la ubicación</option>
                  {ubicaciones.filter((u) => u.id !== desde).map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="mv-cantidad">Cuántas</label>
                <input
                  id="mv-cantidad"
                  type="number" min="1" max={enOrigen} step="1" inputMode="numeric"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  aria-describedby="mv-cantidad-pista"
                />
                <span className="campo__pista" id="mv-cantidad-pista">De {enOrigen} que hay ahí.</span>
              </div>
            </div>
          </>
        )}

        {error ? <p className="campo__error" role="alert">{error}</p> : null}

        <div className="acciones">
          <button type="button" className="boton boton--confirmar" disabled={!listo || moviendo} onClick={() => void mover()}>
            {moviendo ? 'Moviendo' : 'Mover'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={alCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
