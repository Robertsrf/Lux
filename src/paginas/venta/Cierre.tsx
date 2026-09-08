import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearEntero } from '../../lib/dinero';
import type { CuadreUbicacion } from '../../lib/tipos';

/**
 * Cierre diario. La vendedora cuenta SOLO CANTIDADES por ubicacion y el
 * sistema compara contra lo que cree que hay. Rapido y sostenible: el
 * detalle pieza por pieza es el conteo semanal.
 *
 * POR QUE ES UNA LISTA Y NO CINCO TARJETAS
 * Antes cada ubicacion era una tarjeta con su titulo, su campo, su pista y
 * SU PROPIO BOTON de guardar. Cinco tarjetas eran casi 2.000 px de
 * deslizamiento para escribir cinco numeros, todos los dias, en un
 * telefono. Y obligaban a guardar cinco veces.
 *
 * Ahora es una lista: cuenta las cinco y guarda una vez. Por dentro sigue
 * siendo una llamada por ubicacion, porque asi esta hecha `cerrar_dia` y
 * porque cada ubicacion se cuadra por separado; lo que cambia es que no
 * tiene que acordarse de pulsar cinco veces.
 */
export function Cierre() {
  const [filas, setFilas] = useState<CuadreUbicacion[]>([]);
  const [contado, setContado] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
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

  const escritas = Object.entries(contado).filter(([, v]) => v !== '');

  async function guardarTodo() {
    if (escritas.length === 0) return;
    setGuardando(true);
    setError(null);

    // Una por una y en orden. Si alguna falla se para ahi y se dice cual:
    // seguir a ciegas dejaria el cierre a medias sin que ella lo sepa.
    for (const [id, valor] of escritas) {
      const { error: err } = await supabase.rpc('cerrar_dia', {
        p_ubicacion_id: Number(id),
        p_contado: Number(valor),
        p_notas: null,
      });
      if (err) {
        const donde = filas.find((f) => f.ubicacion_id === Number(id))?.ubicacion ?? 'una ubicación';
        setError(donde + ': ' + mensajeDeError(err));
        setGuardando(false);
        await cargar();
        return;
      }
    }

    setContado({});
    await cargar();
    setGuardando(false);
  }

  if (cargando) return <Cargando texto="Preparando el cierre" />;

  const descuadres = filas.filter((f) => f.diferencia !== null && f.diferencia !== 0);
  const faltan = filas.filter((f) => f.conteo_id === null).length;

  return (
    <div className="pagina pagina--angosta mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Cierre del día</h1>
          <p>
            {faltan === 0
              ? 'Ya contaste todas las ubicaciones de hoy.'
              : `Cuenta las piezas de cada ubicación y anota el número. Faltan ${faltan}.`}
          </p>
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
          <p>Un administrador tiene que marcar cuáles ubicaciones entran en el cuadre.</p>
        </Vacio>
      ) : (
        <div className="tarjeta">
          <ul className="cuadre">
            {filas.map((f) => {
              const yaContada = f.conteo_id !== null;
              const cuadra = f.diferencia === 0;
              return (
                <li className="cuadre__fila" key={f.ubicacion_id}>
                  <div className="cuadre__quien">
                    {/* El nombre de la ubicacion ES la etiqueta del campo. */}
                    <label className="cuadre__nombre" htmlFor={`contado-${f.ubicacion_id}`}>
                      {f.ubicacion}
                    </label>
                    <span className={yaContada && !cuadra ? 'cuadre__nota cuadre__nota--mal' : 'cuadre__nota'}>
                      {yaContada
                        ? `Contaste ${formatearEntero(f.cantidad_contada)}${cuadra ? ', cuadra' : `, faltan ${f.diferencia}`}`
                        : `Espera ${formatearEntero(f.esperado)}`}
                    </span>
                  </div>
                  <input
                    id={`contado-${f.ubicacion_id}`}
                    className="cuadre__campo"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder={yaContada ? 'De nuevo' : '0'}
                    value={contado[f.ubicacion_id] ?? ''}
                    onChange={(e) => setContado((c) => ({ ...c, [f.ubicacion_id]: e.target.value }))}
                  />
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="boton cuadre__guardar"
            disabled={guardando || escritas.length === 0}
            onClick={() => void guardarTodo()}
          >
            {guardando
              ? 'Guardando'
              : escritas.length === 0
                ? 'Escribe al menos un número'
                : `Guardar ${escritas.length === 1 ? 'el conteo' : `los ${escritas.length} conteos`}`}
          </button>
        </div>
      )}
    </div>
  );
}
