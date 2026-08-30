import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando } from '../../componentes/Piezas';
import {
  factorBrecha, formatearBs, formatearUsd,
  precioEnBs, previsualizarCostoOperativo, previsualizarPrecio,
} from '../../lib/dinero';
import { useTasa } from '../../hooks/useTasa';

const CAMPOS = [
  { clave: 'gasto_alquiler_mes_usd',  etiqueta: 'Alquiler al mes $',  pista: 'Lo que pagas por el local.' },
  { clave: 'gasto_sueldos_mes_usd',   etiqueta: 'Sueldos al mes $',   pista: 'La vendedora, y tu sueldo si te lo pagas.' },
  { clave: 'gasto_servicios_mes_usd', etiqueta: 'Servicios al mes $', pista: 'Luz, internet, agua.' },
  { clave: 'gasto_otros_mes_usd',     etiqueta: 'Otros fijos al mes $', pista: 'Cualquier gasto que se repite todos los meses.' },
  { clave: 'empaque_por_pieza_usd',   etiqueta: 'Empaque por pieza $', pista: 'La caja, la bolsita y el pano de cada venta.' },
  { clave: 'piezas_esperadas_mes',    etiqueta: 'Piezas que vendes al mes', pista: 'Un estimado sirve. Sin esto no se puede repartir nada.' },
  { clave: 'capex_amortizar_meses',   etiqueta: 'Recuperar exhibidores en (meses)', pista: 'En cuanto tiempo quieres que la inversion se pague sola.' },
  { clave: 'merma_pct',               etiqueta: 'Merma %', pista: 'Piezas que se pierden, se danan o nunca se venden. Las que si se venden las pagan.' },
  { clave: 'margen_objetivo_pct',     etiqueta: 'Ganancia objetivo %', pista: 'Sobre el precio. Con los gastos ya adentro, esto es ganancia de verdad.' },
];

/**
 * Los costos del negocio, que hasta ahora el sistema no conocia.
 *
 * `costo_puesto` solo era mercancia y flete. El alquiler, el sueldo, el
 * empaque y los exhibidores quedaban fuera, asi que el margen terminaba
 * siendo un colchon que tapaba costos invisibles. Con esto el margen que
 * fijes es ganancia, no un parche.
 */
export function Costos() {
  const { tasa } = useTasa();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState<Record<string, number>>({});
  const [capexTotal, setCapexTotal] = useState(0);
  const [simCosto, setSimCosto] = useState('11.86');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [cfg, lotes] = await Promise.all([
      supabase.from('configuracion').select('clave, valor'),
      supabase.from('v_lotes_admin').select('capex_total_usd'),
    ]);
    if (cfg.error) setError(mensajeDeError(cfg.error));
    const mapa: Record<string, number> = {};
    for (const f of (cfg.data as { clave: string; valor: number }[] | null) ?? []) mapa[f.clave] = Number(f.valor);
    setGuardado(mapa);
    setValores(Object.fromEntries(CAMPOS.map((c) => [c.clave, String(mapa[c.clave] ?? 0)])));
    setCapexTotal(((lotes.data as { capex_total_usd: number }[] | null) ?? [])
      .reduce((n, l) => n + Number(l.capex_total_usd), 0));
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const num = (c: string) => Number(valores[c] ?? 0) || 0;

  const operativo = useMemo(() => previsualizarCostoOperativo({
    alquiler: num('gasto_alquiler_mes_usd'),
    sueldos: num('gasto_sueldos_mes_usd'),
    servicios: num('gasto_servicios_mes_usd'),
    otros: num('gasto_otros_mes_usd'),
    empaquePorPieza: num('empaque_por_pieza_usd'),
    piezasMes: num('piezas_esperadas_mes'),
    capexTotal,
    capexMeses: num('capex_amortizar_meses'),
    mermaPct: num('merma_pct'),
  }), [valores, capexTotal]);

  const factor = factorBrecha(tasa) ?? 1;
  const simulacion = useMemo(
    () => previsualizarPrecio(Number(simCosto) || 0, operativo.porPieza, num('merma_pct'), factor, num('margen_objetivo_pct')),
    [simCosto, operativo.porPieza, valores, factor],
  );

  const cambiado = CAMPOS.some((c) => Number(valores[c.clave] ?? 0) !== (guardado[c.clave] ?? 0));

  async function guardar() {
    setGuardando(true);
    setError(null);
    setExito(null);
    for (const c of CAMPOS) {
      const { error: err } = await supabase.from('configuracion')
        .update({ valor: num(c.clave) }).eq('clave', c.clave);
      if (err) { setError(mensajeDeError(err)); setGuardando(false); return; }
    }
    setExito('Guardado. Los precios sugeridos ya usan estas cifras.');
    await cargar();
    setGuardando(false);
  }

  if (cargando) return <Cargando texto="Cargando los costos" />;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Costos del negocio</h1>
          <p>Lo que cuesta tener la tienda abierta. Se reparte igual entre todas las piezas y entra en cada precio sugerido.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}
      {!tasa ? <Aviso tono="alerta" titulo="Sin tasa vigente">Fija las tasas para ver los precios.</Aviso> : null}

      {num('piezas_esperadas_mes') <= 0 ? (
        <Aviso tono="alerta" titulo="Falta lo mas importante">
          Sin un estimado de cuantas piezas vendes al mes, los gastos no se pueden repartir
          y cada pieza solo carga su empaque. Pon aunque sea un numero aproximado.
        </Aviso>
      ) : null}

      <div className="tarjeta">
        <h2>Tus gastos</h2>
        <hr className="divisor" />
        <div className="fila">
          {CAMPOS.map((c) => (
            <Campo key={c.clave} etiqueta={c.etiqueta} htmlFor={c.clave} pista={c.pista}>
              <input
                id={c.clave}
                type="number"
                min="0"
                step={c.clave === 'piezas_esperadas_mes' || c.clave === 'capex_amortizar_meses' ? '1' : '0.01'}
                value={valores[c.clave] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
              />
            </Campo>
          ))}
        </div>

        <div className="panel">
          <span className="panel__titulo">Lo que carga cada pieza</span>
          <div className="rejilla rejilla--3">
            <div>
              <span className="dato__etiqueta">Fijos del mes</span>
              <div className="dato__valor">{formatearUsd(operativo.fijosMes)}</div>
            </div>
            <div>
              <span className="dato__etiqueta">Exhibidores al mes</span>
              <div className="dato__valor">{formatearUsd(operativo.capexMes)}</div>
              <div className="campo__pista">de {formatearUsd(capexTotal)} invertidos</div>
            </div>
            <div>
              <span className="dato__etiqueta">Total al mes</span>
              <div className="dato__valor">{formatearUsd(operativo.totalMes)}</div>
            </div>
            <div>
              <span className="dato__etiqueta">Por cada pieza</span>
              <div className="dato__valor dato__valor--grande">{formatearUsd(operativo.porPieza)}</div>
              <div className="campo__pista">antes de la mercancia</div>
            </div>
          </div>
        </div>

        <div className="acciones">
          <button type="button" className="boton boton--confirmar" disabled={!cambiado || guardando} onClick={() => void guardar()}>
            {guardando ? 'Guardando' : 'Guardar'}
          </button>
          {cambiado ? (
            <button type="button" className="boton boton--secundario" onClick={() => void cargar()}>Descartar</button>
          ) : null}
        </div>
      </div>

      <h2 className="seccion-titulo">Pruebalo con una pieza</h2>

      <div className="tarjeta">
        <div className="fila">
          <Campo etiqueta="Costo puesto de la pieza $" htmlFor="sim" pista="Mercancia mas su parte del flete, en dolares reales.">
            <input id="sim" type="number" min="0" step="0.01" value={simCosto} onChange={(e) => setSimCosto(e.target.value)} />
          </Campo>
        </div>

        {simulacion ? (
          <>
            <div className="panel">
              <span className="panel__titulo">Los cuatro pasos</span>
              <div className="rejilla rejilla--3">
                <div>
                  <span className="dato__etiqueta">1 · Costo total</span>
                  <div className="dato__valor">{formatearUsd(simulacion.costoTotal)}</div>
                  <div className="campo__pista">mercancia + gastos{num('merma_pct') > 0 ? ' + merma' : ''}</div>
                </div>
                <div>
                  <span className="dato__etiqueta">2 · En dolares BCV</span>
                  <div className="dato__valor">{formatearUsd(simulacion.costoEnBcv)}</div>
                  <div className="campo__pista">x {factor.toFixed(4)} por la brecha</div>
                </div>
                <div>
                  <span className="dato__etiqueta">3 · Etiqueta</span>
                  <div className="dato__valor dato__valor--grande">{formatearUsd(simulacion.precioBcv)}</div>
                  <div className="campo__pista">{formatearBs(precioEnBs(simulacion.precioBcv, tasa))}</div>
                </div>
                <div>
                  <span className="dato__etiqueta">4 · Te queda</span>
                  <div className={simulacion.gananciaPorPieza < 0 ? 'dato__valor negativo' : 'dato__valor'}>
                    {formatearUsd(simulacion.gananciaPorPieza)}
                  </div>
                  <div className="campo__pista">dolares reales, libres</div>
                </div>
              </div>
            </div>

            {num('piezas_esperadas_mes') > 0 ? (
              <Aviso tono={simulacion.gananciaPorPieza <= 0 ? 'error' : 'exito'}>
                Si vendieras {num('piezas_esperadas_mes')} piezas como esta al mes, te quedarian{' '}
                <strong style={{ display: 'inline' }}>
                  {formatearUsd(simulacion.gananciaPorPieza * num('piezas_esperadas_mes'))}
                </strong>{' '}
                libres al mes, con todos los gastos y los exhibidores ya pagados.
              </Aviso>
            ) : null}
          </>
        ) : (
          <Aviso tono="alerta">Revisa los porcentajes: el margen y la merma tienen que ser menores que 100 %.</Aviso>
        )}
      </div>

      <p className="campo__pista" style={{ marginTop: 'var(--e-5)' }}>
        El reparto es igual por pieza a proposito: atender y empacar un anillo cuesta el mismo
        tiempo que una cadena, asi que repartir por valor le cargaria a lo caro un trabajo que no causa.
      </p>
    </div>
  );
}
