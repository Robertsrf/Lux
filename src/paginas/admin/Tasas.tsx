import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { brecha, formatearFecha, formatearPorcentaje, formatearTasa } from '../../lib/dinero';
import { useTasa } from '../../hooks/useTasa';
import type { Tasa } from '../../lib/tipos';

/**
 * La tasa de venta la fija el administrador a mano. El sistema muestra la
 * brecha contra el BCV como dato informativo, pero no la impone.
 *
 * Cambiar la tasa repricia TODO el catalogo: el precio en Bs no vive en
 * ningun modelo, se calcula en la vista con la tasa vigente.
 */
export function Tasas() {
  const { tasa, recargar } = useTasa();
  const [historico, setHistorico] = useState<Tasa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [venta, setVenta] = useState('');
  const [bcv, setBcv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargarHistorico = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('tasas')
      .select('id, fecha, tasa_venta, tasa_bcv, vigente, creado_en')
      .order('creado_en', { ascending: false })
      .limit(30);
    if (err) setError(mensajeDeError(err));
    setHistorico((data as Tasa[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void cargarHistorico(); }, [cargarHistorico]);

  useEffect(() => {
    if (tasa) {
      setVenta(String(tasa.tasa_venta));
      setBcv(String(tasa.tasa_bcv));
    }
  }, [tasa?.id]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setExito(null);

    const { error: err } = await supabase.rpc('admin_fijar_tasa', {
      p_tasa_venta: Number(venta),
      p_tasa_bcv: Number(bcv),
    });

    if (err) setError(mensajeDeError(err));
    else {
      setExito('Tasa fijada. Todo el catalogo quedo repriciado.');
      await Promise.all([recargar(), cargarHistorico()]);
    }
    setGuardando(false);
  }

  const brechaPrevia = brecha(Number(venta) || null, Number(bcv) || null);

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Tasas</h1>
          <p>Dos numeros con trabajos distintos: uno cobra y el otro mide. Cambiarlos repricia el catalogo completo, sin tocar un solo producto.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo fijar la tasa">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      <div className="rejilla rejilla--2">
        <form className="tarjeta" onSubmit={(e) => void guardar(e)}>
          <h2>Fijar tasa vigente</h2>
          <hr className="divisor" />

          <Campo
            etiqueta="Tasa de compra de dolares (Bs por $)"
            htmlFor="venta"
            pista="A cuanto compras tu un dolar hoy: Binance, paralelo, tu casa de cambio. Nunca se le muestra a la clienta. Con esta se mide cuanto ganas de verdad."
          >
            <input id="venta" type="number" step="0.0001" min="0.0001" required value={venta} onChange={(e) => setVenta(e.target.value)} />
          </Campo>

          <Campo
            etiqueta="Tasa BCV (Bs por $)"
            htmlFor="bcv"
            pista="La oficial. Con esta SE COBRA: lo que paga la clienta = precio de la etiqueta x tasa BCV."
          >
            <input id="bcv" type="number" step="0.0001" min="0.0001" required value={bcv} onChange={(e) => setBcv(e.target.value)} />
          </Campo>

          <p className="util">
            Brecha calculada: <span className="cifra">{formatearPorcentaje(brechaPrevia === null ? null : brechaPrevia * 100)}</span>
          </p>
          <p className="campo__pista">
            Es cuanto se lleva la brecha de cada venta. El sistema la muestra, no la impone.
          </p>

          <div className="acciones">
            <button type="submit" className="boton boton--confirmar" disabled={guardando || !venta || !bcv}>
              {guardando ? 'Fijando' : 'Fijar tasa'}
            </button>
          </div>
        </form>

        <div className="tarjeta">
          <h2>Vigente ahora</h2>
          <hr className="divisor" />
          {tasa ? (
            <dl className="lista-datos">
              <div>
                <span className="dato__etiqueta">Compra de dolares</span>
                <div className="dato__valor dato__valor--grande">{formatearTasa(tasa.tasa_venta)}</div>
              </div>
              <div>
                <span className="dato__etiqueta">BCV · la que cobra</span>
                <div className="dato__valor">{formatearTasa(tasa.tasa_bcv)}</div>
              </div>
              <div>
                <span className="dato__etiqueta">Brecha</span>
                <div className="cifra">{formatearPorcentaje(brecha(tasa.tasa_venta, tasa.tasa_bcv)! * 100)}</div>
              </div>
              <div>
                <span className="dato__etiqueta">Desde</span>
                <div className="cifra">{formatearFecha(tasa.creado_en)}</div>
              </div>
            </dl>
          ) : (
            <Vacio titulo="Todavia no hay tasa vigente">
              <p>Fijala aqui al lado. Sin tasa, el catalogo no puede mostrar precios en bolivares.</p>
            </Vacio>
          )}
        </div>
      </div>

      <h2 className="seccion-titulo">Historico</h2>
      {cargando ? <Cargando /> : historico.length === 0 ? (
        <Vacio titulo="Aun no hay cambios de tasa registrados" />
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="num">Compra $</th>
                <th className="num">BCV</th>
                <th className="num">Brecha</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((t) => (
                <tr key={t.id}>
                  <td>{formatearFecha(t.creado_en)}</td>
                  <td className="num">{formatearTasa(t.tasa_venta)}</td>
                  <td className="num">{formatearTasa(t.tasa_bcv)}</td>
                  <td className="num">{formatearPorcentaje((brecha(t.tasa_venta, t.tasa_bcv) ?? 0) * 100)}</td>
                  <td>{t.vigente ? <span className="etiqueta etiqueta--exito">Vigente</span> : <span className="secundario util">Historica</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
