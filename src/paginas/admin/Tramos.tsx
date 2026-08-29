import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { aMonto, deMonto, formatearBs, formatearUsd, porCantidad, precioEnBs } from '../../lib/dinero';
import { useTasa } from '../../hooks/useTasa';
import type { Tramo } from '../../lib/tipos';

/**
 * Tramos de precio al mayor: cuantas piezas hay que llevar para que baje el
 * precio por pieza. El armador del catalogo publico cotiza con esto.
 *
 * Sin tramos cargados el armador se niega a cotizar, que es lo correcto:
 * el sistema no inventa un precio de mayoreo.
 */
export function Tramos() {
  const { tasa } = useTasa();
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [minPiezas, setMinPiezas] = useState('');
  const [precio, setPrecio] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('tramos_mayoreo')
      .select('id, min_piezas, precio_por_pieza_usd, activo')
      .order('min_piezas', { ascending: true });
    if (err) setError(mensajeDeError(err));
    setTramos((data as Tramo[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('tramos_mayoreo').insert({
      min_piezas: Number(minPiezas),
      precio_por_pieza_usd: Number(precio),
    });
    if (err) setError(mensajeDeError(err));
    else { setMinPiezas(''); setPrecio(''); await cargar(); }
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
          <p>Desde cuantas piezas aplica cada precio por pieza. El catalogo publico cotiza con esto.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}

      {tramos.filter((t) => t.activo).length === 0 ? (
        <Aviso tono="alerta" titulo="El armador esta apagado">
          Sin ningun tramo activo, quien arme un pedido en el catalogo publico vera
          "te cotizamos a mano" en vez de un total. Carga al menos uno.
        </Aviso>
      ) : null}

      <form className="tarjeta" onSubmit={(e) => void agregar(e)}>
        <h2>Agregar tramo</h2>
        <hr className="divisor" />
        <div className="fila">
          <Campo etiqueta="Desde cuantas piezas" htmlFor="t-min">
            <input id="t-min" type="number" min="1" step="1" required value={minPiezas} onChange={(e) => setMinPiezas(e.target.value)} />
          </Campo>
          <Campo etiqueta="Precio por pieza $" htmlFor="t-precio">
            <input id="t-precio" type="number" min="0.01" step="0.01" required value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </Campo>
        </div>
        <div className="acciones">
          <button type="submit" className="boton">Agregar tramo</button>
        </div>
      </form>

      <h2 className="seccion-titulo">Tramos cargados</h2>

      {tramos.length === 0 ? (
        <Vacio titulo="Aun no hay tramos">
          <p>Carga el primero arriba. Por ejemplo: desde 6 piezas, tanto por pieza.</p>
        </Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th className="num">Desde</th>
                <th className="num">Por pieza $</th>
                <th className="num">Por pieza Bs</th>
                <th className="num">Ejemplo al minimo</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tramos.map((t) => {
                const ejemplo = deMonto(porCantidad(aMonto(t.precio_por_pieza_usd), t.min_piezas));
                return (
                  <tr key={t.id}>
                    <td className="num">{t.min_piezas} piezas</td>
                    <td className="num">{formatearUsd(t.precio_por_pieza_usd)}</td>
                    <td className="num precio">{formatearBs(precioEnBs(t.precio_por_pieza_usd, tasa))}</td>
                    <td className="num">{formatearUsd(ejemplo)}</td>
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
          </table>
        </div>
      )}
    </div>
  );
}
