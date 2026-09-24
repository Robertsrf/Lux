import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando, Vacio } from '../componentes/Piezas';
import { brecha, formatearFecha, formatearPorcentaje, formatearTasa } from '../lib/dinero';
import { useTasa } from '../hooks/useTasa';
import { useSesion } from '../hooks/useSesion';
import type { TasaHistorica } from '../lib/tipos';

/** Cuanto cambia una tasa, en por ciento: "+1,6 %". */
function cambio(antes: number | null | undefined, despues: number): string {
  if (!antes) return 'primera vez';
  const pct = (despues / antes - 1) * 100;
  if (Math.abs(pct) < 0.05) return 'sin cambio';
  return (pct > 0 ? 'sube ' : 'baja ') + formatearPorcentaje(Math.abs(pct));
}

/**
 * Las dos tasas del dia. La fijan el administrador Y la vendedora.
 *
 * POR QUE ELLA TAMBIEN
 * La tasa se mueve durante el dia, y quien esta en la tienda cuando se
 * mueve es ella. Esperar a que el dueno la cambie es cobrar un rato a la
 * tasa de ayer. La base deja escrito quien fijo cada una, y el historico
 * de abajo lo ensena.
 *
 * POR QUE PIDE CONFIRMAR
 * Es la unica accion del sistema que cambia TODOS los precios en
 * bolivares de un solo toque. Un cero de mas en la BCV multiplica por diez
 * cada etiqueta mientras hay una clienta pagando. Antes de fijar, la
 * pantalla dice cuanto sube o baja cada una respecto de la vigente, para
 * que un error de dedo se vea antes de que cueste.
 *
 * Cambiar la tasa no toca ningun producto: el precio en Bs no vive en
 * ningun modelo, se calcula en la vista con la tasa vigente. Las ventas ya
 * hechas no se mueven: cada una guarda las tasas del dia en que se cobro.
 */
export function Tasas() {
  const { esAdmin } = useSesion();
  const { tasa, recargar } = useTasa();
  const [historico, setHistorico] = useState<TasaHistorica[]>([]);
  const [cargando, setCargando] = useState(true);
  const [venta, setVenta] = useState('');
  const [bcv, setBcv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const cargarHistorico = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('v_tasas')
      .select('id, fecha, tasa_venta, tasa_bcv, vigente, creado_en, registrado_por_nombre')
      .order('creado_en', { ascending: false })
      .limit(30);
    if (err) setError(mensajeDeError(err));
    setHistorico((data as TasaHistorica[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void cargarHistorico(); }, [cargarHistorico]);

  useEffect(() => {
    if (tasa) {
      setVenta(String(tasa.tasa_venta));
      setBcv(String(tasa.tasa_bcv));
    }
  }, [tasa?.id]);

  const nuevaBcv = Number(bcv);
  const nuevaVenta = Number(venta);
  const validas = nuevaBcv > 0 && nuevaVenta > 0;
  const igual = tasa !== null && nuevaBcv === tasa.tasa_bcv && nuevaVenta === tasa.tasa_venta;

  function pedirConfirmacion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    if (!validas) {
      setError('Las dos tasas tienen que ser mayores que cero.');
      return;
    }
    setConfirmando(true);
  }

  async function fijar() {
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.rpc('fijar_tasa', {
      p_tasa_venta: nuevaVenta,
      p_tasa_bcv: nuevaBcv,
    });
    setGuardando(false);
    setConfirmando(false);
    if (err) {
      setError(mensajeDeError(err));
      return;
    }
    setExito('Tasa fijada. Todos los precios en bolívares y en Binance ya salen con la nueva.');
    await Promise.all([recargar(), cargarHistorico()]);
  }

  const vigenteDe = historico.find((t) => t.vigente) ?? null;

  return (
    <div className={esAdmin ? 'pagina' : 'pagina pagina--angosta mostrador'}>
      <div className="encabezado-pagina">
        <div>
          <h1>Tasas</h1>
          <p>
            {esAdmin
              ? 'Dos números con trabajos distintos: uno cobra y el otro mide. Cambiarlos repricia el catálogo completo, sin tocar un solo producto.'
              : 'Las dos tasas del día. Con la BCV se cobra en bolívares; con la Binance, en dólares.'}
          </p>
        </div>
      </div>

      <Ayuda titulo="Para qué sirve cada tasa" abierta={esAdmin}>
        <p>
          <strong>Tasa BCV.</strong> La oficial. Con esta se cobra en bolívares:
          lo que paga la clienta es el precio de la etiqueta, en dólares BCV,
          por esta tasa.
        </p>
        <p>
          <strong>Tasa Binance.</strong> A la que se cambia un dólar en la calle.
          {esAdmin
            ? ' Es lo que te cuesta un dólar cuando vas a comprar mercancía afuera, y con esta se mide cuánto ganas de verdad.'
            : ''}
          {' '}Si la clienta paga en dólares, en efectivo o por Binance, se le
          cobra el total en bolívares dividido entre esta tasa. El mostrador
          ya hace la cuenta y la dice al cobrar.
        </p>
        {esAdmin ? (
          <p>
            La diferencia entre las dos es <strong>la brecha</strong>. El sistema
            la usa para una sola cosa: saber cuántos dólares BCV hacen falta para
            juntar los Binance con los que vas a reponer la pieza. Por eso la
            mercancía se multiplica por la brecha y el alquiler no.
          </p>
        ) : null}
        <p>
          Cambiar estas dos cifras <strong>cambia el precio en bolívares de todo
          el catálogo</strong> en el momento. Las ventas ya hechas no se mueven:
          cada una guarda las tasas del día en que se cobró.
        </p>
      </Ayuda>

      {error ? <Aviso tono="error" titulo="No se pudo fijar la tasa">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      <div className="rejilla rejilla--2">
        <form className="tarjeta" onSubmit={pedirConfirmacion}>
          <h2>Fijar la tasa del día</h2>
          <hr className="divisor" />

          <Campo
            etiqueta="Tasa BCV · Bs por dólar"
            htmlFor="bcv"
            pista="La oficial. Con esta se cobra en bolívares."
          >
            <input
              id="bcv" type="number" inputMode="decimal" step="0.0001" min="0.0001" required
              value={bcv}
              onChange={(e) => { setBcv(e.target.value); setConfirmando(false); }}
            />
          </Campo>

          <Campo
            etiqueta="Tasa Binance · Bs por dólar"
            htmlFor="venta"
            pista={esAdmin
              ? 'A cuánto compras tú un dólar hoy: Binance, paralelo, tu casa de cambio. Con esta se cobra en dólares y se mide cuánto ganas de verdad.'
              : 'A cuánto se cambia el dólar hoy. Con esta se cobra cuando la clienta paga en dólares o por Binance.'}
          >
            <input
              id="venta" type="number" inputMode="decimal" step="0.0001" min="0.0001" required
              value={venta}
              onChange={(e) => { setVenta(e.target.value); setConfirmando(false); }}
            />
          </Campo>

          {esAdmin ? (
            <p className="util">
              Brecha: <span className="cifra">{formatearPorcentaje(validas ? (brecha(nuevaVenta, nuevaBcv) ?? 0) * 100 : null)}</span>
            </p>
          ) : null}

          {confirmando && validas ? (
            <div className="confirmar-tasa" role="alert">
              <p className="confirmar-tasa__titulo">
                {igual ? 'Son las mismas que están vigentes.' : 'Todos los precios en bolívares cambian al fijarla.'}
              </p>
              <dl className="confirmar-tasa__lista">
                <div>
                  <dt>BCV</dt>
                  <dd>
                    {tasa ? <>{formatearTasa(tasa.tasa_bcv)} → </> : null}
                    <strong>{formatearTasa(nuevaBcv)}</strong>
                    <span className="confirmar-tasa__cambio">{cambio(tasa?.tasa_bcv, nuevaBcv)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Binance</dt>
                  <dd>
                    {tasa ? <>{formatearTasa(tasa.tasa_venta)} → </> : null}
                    <strong>{formatearTasa(nuevaVenta)}</strong>
                    <span className="confirmar-tasa__cambio">{cambio(tasa?.tasa_venta, nuevaVenta)}</span>
                  </dd>
                </div>
              </dl>
              <div className="acciones">
                <button type="button" className="boton boton--confirmar" disabled={guardando} onClick={() => void fijar()}>
                  {guardando ? 'Fijando' : 'Sí, fijarla'}
                </button>
                <button type="button" className="boton boton--secundario" disabled={guardando} onClick={() => setConfirmando(false)}>
                  Corregir
                </button>
              </div>
            </div>
          ) : (
            <div className="acciones">
              <button type="submit" className="boton boton--confirmar" disabled={!validas}>
                Fijar tasa
              </button>
            </div>
          )}
        </form>

        <div className="tarjeta">
          <h2>Vigente ahora</h2>
          <hr className="divisor" />
          {tasa ? (
            <dl className="lista-datos">
              <div>
                <span className="dato__etiqueta">BCV · con esta se cobra en Bs</span>
                <div className="dato__valor dato__valor--grande">{formatearTasa(tasa.tasa_bcv)}</div>
              </div>
              <div>
                <span className="dato__etiqueta">Binance · con esta se cobra en $</span>
                <div className="dato__valor dato__valor--grande">{formatearTasa(tasa.tasa_venta)}</div>
              </div>
              {esAdmin ? (
                <div>
                  <span className="dato__etiqueta">Brecha</span>
                  <div className="cifra">{formatearPorcentaje((brecha(tasa.tasa_venta, tasa.tasa_bcv) ?? 0) * 100)}</div>
                </div>
              ) : null}
              <div>
                <span className="dato__etiqueta">Desde</span>
                <div className="cifra">
                  {formatearFecha(tasa.creado_en)}
                  {vigenteDe?.registrado_por_nombre ? ` · la fijó ${vigenteDe.registrado_por_nombre}` : ''}
                </div>
              </div>
            </dl>
          ) : (
            <Vacio titulo="Todavía no hay tasa vigente">
              <p>Fíjala aquí al lado. Sin tasa no hay precios en bolívares y no se puede cobrar.</p>
            </Vacio>
          )}
        </div>
      </div>

      <h2 className="seccion-titulo">Histórico</h2>
      {cargando ? <Cargando /> : historico.length === 0 ? (
        <Vacio titulo="Aún no hay cambios de tasa registrados" />
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="num">BCV</th>
                <th className="num">Binance</th>
                {esAdmin ? <th className="num">Brecha</th> : null}
                <th>Quién</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((t) => (
                <tr key={t.id}>
                  <td>{formatearFecha(t.creado_en)}</td>
                  <td className="num">{formatearTasa(t.tasa_bcv)}</td>
                  <td className="num">{formatearTasa(t.tasa_venta)}</td>
                  {esAdmin ? <td className="num">{formatearPorcentaje((brecha(t.tasa_venta, t.tasa_bcv) ?? 0) * 100)}</td> : null}
                  <td className="util">{t.registrado_por_nombre ?? '—'}</td>
                  <td>{t.vigente ? <span className="etiqueta etiqueta--exito">Vigente</span> : <span className="secundario util">Histórica</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
