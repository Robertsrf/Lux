import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { aplicarDescuento, formatearPorcentaje, formatearUsd } from '../../lib/dinero';
import type { Tramo } from '../../lib/tipos';

interface Riesgo { nombre: string; margen: number }

/**
 * Tramos de mayoreo: cuantas piezas hay que llevar para que baje el precio,
 * y cuanto baja. El descuento se aplica sobre lo que ya valen las piezas
 * elegidas, asi que quien se lleva lo caro paga proporcionalmente mas.
 *
 * Un porcentaje no conoce el costo: por eso esta pantalla calcula, para
 * cada tramo, el peor margen que quedaria en todo el catalogo y avisa si
 * alguna pieza se iria por debajo del costo.
 */
export function Tramos() {
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [piezas, setPiezas] = useState<{ nombre: string; precio: number; costo: number }[]>([]);
  const [minPiezas, setMinPiezas] = useState('');
  const [descuento, setDescuento] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [t, c] = await Promise.all([
      supabase.from('tramos_mayoreo').select('id, min_piezas, descuento_pct, activo').order('min_piezas'),
      supabase.from('v_catalogo_admin').select('nombre, precio_usd_real, costo_puesto_usd').limit(2000),
    ]);
    if (t.error) setError(mensajeDeError(t.error));
    setTramos((t.data as Tramo[] | null) ?? []);
    setPiezas(((c.data as { nombre: string; precio_usd_real: number | null; costo_puesto_usd: number }[] | null) ?? [])
      .filter((p) => p.precio_usd_real !== null)
      .map((p) => ({ nombre: p.nombre, precio: Number(p.precio_usd_real), costo: Number(p.costo_puesto_usd) })));
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  /** El peor margen que dejaria ese descuento en todo el catalogo. */
  const peorMargen = useCallback((pct: number): Riesgo | null => {
    let peor: Riesgo | null = null;
    for (const p of piezas) {
      const margen = (aplicarDescuento(p.precio, pct) ?? 0) - p.costo;
      if (!peor || margen < peor.margen) peor = { nombre: p.nombre, margen };
    }
    return peor;
  }, [piezas]);

  const riesgoNuevo = useMemo(
    () => (descuento ? peorMargen(Number(descuento)) : null),
    [descuento, peorMargen],
  );

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('tramos_mayoreo').insert({
      min_piezas: Number(minPiezas),
      descuento_pct: Number(descuento),
    });
    if (err) setError(mensajeDeError(err));
    else { setMinPiezas(''); setDescuento(''); await cargar(); }
  }

  async function alternar(t: Tramo) {
    const { error: err } = await supabase.from('tramos_mayoreo').update({ activo: !t.activo }).eq('id', t.id);
    if (err) setError(mensajeDeError(err)); else await cargar();
  }

  async function borrar(t: Tramo) {
    if (!window.confirm(`Borrar el tramo desde ${t.min_piezas} piezas?`)) return;
    const { error: err } = await supabase.from('tramos_mayoreo').delete().eq('id', t.id);
    if (err) setError(mensajeDeError(err)); else await cargar();
  }

  if (cargando) return <Cargando texto="Cargando tramos" />;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Tramos de mayoreo</h1>
          <p>Desde cuantas piezas aplica cada descuento. Se calcula sobre lo que ya valen las piezas elegidas.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}

      {tramos.filter((t) => t.activo).length === 0 ? (
        <Aviso tono="alerta" titulo="El armador esta apagado">
          Sin ningun tramo activo, quien arme un pedido en el catalogo publico paga
          el precio de detal completo. Carga al menos uno.
        </Aviso>
      ) : null}

      <form className="tarjeta" onSubmit={(e) => void agregar(e)}>
        <h2>Agregar tramo</h2>
        <hr className="divisor" />
        <div className="fila">
          <Campo etiqueta="Desde cuantas piezas" htmlFor="t-min">
            <input id="t-min" type="number" min="1" step="1" required value={minPiezas} onChange={(e) => setMinPiezas(e.target.value)} />
          </Campo>
          <Campo etiqueta="Descuento %" htmlFor="t-desc" pista="Sobre el total de lo que elija, no sobre cada pieza por separado.">
            <input id="t-desc" type="number" min="1" max="99" step="0.5" required value={descuento} onChange={(e) => setDescuento(e.target.value)} />
          </Campo>
        </div>

        {riesgoNuevo ? (
          <Aviso tono={riesgoNuevo.margen < 0 ? 'error' : riesgoNuevo.margen < 1 ? 'alerta' : 'exito'}>
            {riesgoNuevo.margen < 0
              ? `Cuidado: con ${descuento} % de descuento, "${riesgoNuevo.nombre}" se venderia por debajo del costo (${formatearUsd(riesgoNuevo.margen)} de margen).`
              : `Con ${descuento} % de descuento, la pieza mas ajustada del catalogo ("${riesgoNuevo.nombre}") aun deja ${formatearUsd(riesgoNuevo.margen)} de margen.`}
          </Aviso>
        ) : null}

        <div className="acciones">
          <button type="submit" className="boton">Agregar tramo</button>
        </div>
      </form>

      <h2 className="seccion-titulo">Tramos cargados</h2>

      {tramos.length === 0 ? (
        <Vacio titulo="Aun no hay tramos">
          <p>Carga el primero arriba. Por ejemplo: desde 6 piezas, tanto por ciento de descuento.</p>
        </Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th className="num">Desde</th>
                <th className="num">Descuento</th>
                <th className="num">Peor margen del catalogo</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tramos.map((t) => {
                const riesgo = peorMargen(Number(t.descuento_pct));
                return (
                  <tr key={t.id}>
                    <td className="num">{t.min_piezas} piezas</td>
                    <td className="num precio">{formatearPorcentaje(t.descuento_pct)}</td>
                    <td className={riesgo && riesgo.margen < 0 ? 'num negativo' : 'num'}>
                      {riesgo ? formatearUsd(riesgo.margen) : '—'}
                      {riesgo ? <div className="celda-nota">{riesgo.nombre}</div> : null}
                    </td>
                    <td>{t.activo ? <span className="etiqueta etiqueta--exito">Activo</span> : <span className="etiqueta">Inactivo</span>}</td>
                    <td>
                      <div className="grupo-botones grupo-botones--firme">
                        <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => void alternar(t)}>
                          {t.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button type="button" className="boton boton--peligro boton--pequeno" onClick={() => void borrar(t)}>
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}>El peor margen se calcula contra las {piezas.length} piezas del catalogo con precio</td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
