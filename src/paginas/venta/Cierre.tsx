import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearEntero } from '../../lib/dinero';
import type { CuadreUbicacion } from '../../lib/tipos';

/**
 * Cierre diario. La vendedora cuenta SOLO CANTIDADES por ubicacion y el
 * sistema compara contra lo que cree que hay. Rapido y sostenible: el
 * detalle pieza por pieza es el conteo semanal.
 */
export function Cierre() {
  const [filas, setFilas] = useState<CuadreUbicacion[]>([]);
  const [contado, setContado] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('v_cuadre_dia')
      .select('ubicacion_id, ubicacion, orden, esperado, conteo_id, cantidad_contada, diferencia, contado_en')
      .order('orden', { ascending: true });
    if (err) setError(mensajeDeError(err));
    setFilas((data as CuadreUbicacion[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function cerrar(f: CuadreUbicacion) {
    const valor = contado[f.ubicacion_id];
    if (valor === undefined || valor === '') return;
    setGuardando(f.ubicacion_id);
    setError(null);

    const { error: err } = await supabase.rpc('cerrar_dia', {
      p_ubicacion_id: f.ubicacion_id,
      p_contado: Number(valor),
      p_notas: null,
    });

    if (err) setError(mensajeDeError(err));
    else {
      setContado((c) => { const copia = { ...c }; delete copia[f.ubicacion_id]; return copia; });
      await cargar();
    }
    setGuardando(null);
  }

  if (cargando) return <Cargando texto="Preparando el cierre" />;

  const descuadres = filas.filter((f) => f.diferencia !== null && f.diferencia !== 0);

  return (
    <div className="pagina pagina--angosta mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Cierre del dia</h1>
          <p>Cuenta las piezas de cada ubicacion y anota el numero.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar el conteo">{error}</Aviso> : null}

      {descuadres.length > 0 ? (
        <Aviso tono="error" titulo="El inventario no cuadra">
          {descuadres.map((d) => (
            <div key={d.ubicacion_id}>
              {d.ubicacion}: contaste {d.cantidad_contada} y el sistema esperaba {d.esperado}
              {' '}({d.diferencia! > 0 ? `sobran ${d.diferencia}` : `faltan ${Math.abs(d.diferencia!)}`}).
            </div>
          ))}
          Avisa al administrador antes de irte.
        </Aviso>
      ) : null}

      {filas.length === 0 ? (
        <Vacio titulo="No hay ubicaciones que cuadrar">
          <p>Un administrador tiene que marcar cuales ubicaciones entran en el cuadre.</p>
        </Vacio>
      ) : (
        <div className="pila">
          {filas.map((f) => {
            const yaContada = f.conteo_id !== null;
            return (
              <div className="tarjeta" key={f.ubicacion_id}>
                <h2>{f.ubicacion}</h2>
                <hr className="divisor" />

                {yaContada ? (
                  <Aviso tono={f.diferencia === 0 ? 'exito' : 'error'}>
                    Contaste {formatearEntero(f.cantidad_contada)} de {formatearEntero(f.esperado)} esperadas.
                    {f.diferencia === 0 ? ' Cuadra.' : ` Diferencia de ${f.diferencia}.`}
                  </Aviso>
                ) : null}

                <Campo
                  etiqueta={yaContada ? 'Contar de nuevo' : 'Cuantas piezas contaste'}
                  htmlFor={`contado-${f.ubicacion_id}`}
                  pista={`El sistema espera ${formatearEntero(f.esperado)}.`}
                >
                  <input
                    id={`contado-${f.ubicacion_id}`}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={contado[f.ubicacion_id] ?? ''}
                    onChange={(e) => setContado((c) => ({ ...c, [f.ubicacion_id]: e.target.value }))}
                  />
                </Campo>

                <div className="acciones">
                  <button
                    type="button"
                    className="boton"
                    disabled={guardando === f.ubicacion_id || (contado[f.ubicacion_id] ?? '') === ''}
                    onClick={() => void cerrar(f)}
                  >
                    {guardando === f.ubicacion_id ? 'Guardando' : 'Guardar conteo'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
