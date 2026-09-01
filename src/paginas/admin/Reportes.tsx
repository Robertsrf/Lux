import { useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { aMonto, deMonto, formatearBs, formatearEntero, formatearFecha, formatearPorcentaje, formatearUsd, sumar } from '../../lib/dinero';
import { BarrasApiladas, BarrasHorizontales } from '../../componentes/Graficos';
import type { GastoPartida, MezclaGrupo, RotacionModelo, VentaPorDia } from '../../lib/tipos';

const PERIODOS = [
  { dias: 7, texto: 'Ultimos 7 dias' },
  { dias: 30, texto: 'Ultimos 30 dias' },
  { dias: 90, texto: 'Ultimos 90 dias' },
];

const DORMIDOS = [30, 60, 90];

/**
 * Reportes del administrador. La ganancia se mide SIEMPRE en dolares, con la
 * tasa que se congelo al vender: si el reporte de enero cambiara porque hoy
 * movieron la tasa, el sistema estaria mintiendo.
 */
export function Reportes() {
  const [dias, setDias] = useState(30);
  const [umbral, setUmbral] = useState(30);
  const [ventas, setVentas] = useState<VentaPorDia[]>([]);
  const [mezcla, setMezcla] = useState<MezclaGrupo[]>([]);
  const [rotacion, setRotacion] = useState<RotacionModelo[]>([]);
  const [gastos, setGastos] = useState<GastoPartida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      setError(null);
      const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

      const [v, m, r, g] = await Promise.all([
        supabase.from('v_ventas_por_dia').select('*').gte('dia', desde).order('dia', { ascending: false }),
        supabase.from('v_mezcla_grupo').select('*').order('orden'),
        supabase.from('v_rotacion_modelo').select('*').order('piezas_vendidas', { ascending: false }).limit(500),
        supabase.from('v_gastos_desglose').select('*'),
      ]);
      setGastos((g.data as GastoPartida[] | null) ?? []);

      // Si falla la de gastos hay que decirlo igual: al agregarla se me
      // quedo fuera de esta linea y su error se perdia en silencio.
      const fallo = v.error ?? m.error ?? r.error ?? g.error;
      if (fallo) setError(mensajeDeError(fallo));
      setVentas((v.data as VentaPorDia[] | null) ?? []);
      setMezcla((m.data as MezclaGrupo[] | null) ?? []);
      setRotacion((r.data as RotacionModelo[] | null) ?? []);
      setCargando(false);
    })();
  }, [dias]);

  const totales = useMemo(() => ({
    ventas: ventas.reduce((n, v) => n + v.ventas, 0),
    piezas: ventas.reduce((n, v) => n + v.piezas, 0),
    bs: deMonto(sumar(ventas.map((v) => aMonto(v.total_bs)))),
    usd: deMonto(sumar(ventas.map((v) => aMonto(v.total_usd)))),
    ganancia: deMonto(sumar(ventas.map((v) => aMonto(v.ganancia_usd)))),
  }), [ventas]);

  const dormidos = useMemo(
    () => rotacion.filter((r) => r.existencia > 0
      && (r.dias_sin_vender === null ? r.dias_en_inventario >= umbral : r.dias_sin_vender >= umbral)),
    [rotacion, umbral],
  );

  const porDia = useMemo(() => [...ventas].reverse().map((v) => ({
    clave: v.dia,
    etiqueta: formatearFecha(v.dia).slice(0, 5),
    costo: Number(v.costo_usd) || 0,
    ganancia: Math.max(Number(v.ganancia_usd) || 0, 0),
    detalle: v.piezas + ' piezas en ' + v.ventas + ' venta' + (v.ventas === 1 ? '' : 's'),
  })), [ventas]);

  const partidasGasto = useMemo(() => gastos.map((g) => ({
    clave: g.partida,
    etiqueta: g.partida,
    valor: Number(g.monto_usd) || 0,
    nota: g.porcentaje === null ? undefined : formatearPorcentaje(g.porcentaje),
  })), [gastos]);

  const totalGastos = useMemo(
    () => partidasGasto.reduce((a, p) => a + p.valor, 0),
    [partidasGasto],
  );

  if (cargando) return <Cargando texto="Calculando reportes" />;

  const margenPct = totales.usd > 0 ? (totales.ganancia / totales.usd) * 100 : null;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Reportes</h1>
          <p>La ganancia se mide en dolares reales, con la tasa congelada de cada venta.</p>
        </div>
        <Campo etiqueta="Periodo" htmlFor="periodo">
          <select id="periodo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {PERIODOS.map((p) => <option key={p.dias} value={p.dias}>{p.texto}</option>)}
          </select>
        </Campo>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudieron leer los reportes">{error}</Aviso> : null}

      <div className="tablero">
        <div className="tablero__celda">
          <span className="dato__etiqueta">Ventas</span>
          <div className="tablero__cifra">{formatearEntero(totales.ventas)}</div>
          <div className="tablero__meta">{formatearEntero(totales.piezas)} piezas</div>
        </div>
        <div className="tablero__celda">
          <span className="dato__etiqueta">Cobrado</span>
          <div className="tablero__cifra" style={{ fontSize: 'var(--t-28)' }}>{formatearBs(totales.bs)}</div>
          <div className="tablero__meta">{formatearUsd(totales.usd)}</div>
        </div>
        <div className="tablero__celda">
          <span className="dato__etiqueta">Ganancia</span>
          <div className="tablero__cifra" style={{ fontSize: 'var(--t-28)' }}>{formatearUsd(totales.ganancia)}</div>
          <div className="tablero__meta">Margen {formatearPorcentaje(margenPct)}</div>
        </div>
      </div>

      <h2 className="seccion-titulo">Costo y ganancia, dia a dia</h2>
      <div className="tarjeta">
        <BarrasApiladas
          columnas={porDia}
          formato={formatearUsd}
          vacio={
            <>
              <p>Todavia no hay ventas en este periodo.</p>
              <p>Cuando el mostrador registre la primera, el grafico se llena solo.</p>
            </>
          }
        />
      </div>

      <h2 className="seccion-titulo">El detalle, dia por dia</h2>
      {ventas.length === 0 ? (
        <Vacio titulo="Todavia no hay ventas en este periodo">
          <p>Cuando el mostrador registre la primera venta, aparecera aqui.</p>
        </Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Dia</th><th className="num">Ventas</th><th className="num">Piezas</th>
                <th className="num">Cobrado Bs</th><th className="num">Cobrado $</th>
                <th className="num">Costo $</th><th className="num">Ganancia $</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.dia}>
                  <td>{formatearFecha(v.dia)}</td>
                  <td className="num">{v.ventas}</td>
                  <td className="num">{v.piezas}</td>
                  <td className="num">{formatearBs(v.total_bs)}</td>
                  <td className="num">{formatearUsd(v.total_usd)}</td>
                  <td className="num">{formatearUsd(v.costo_usd)}</td>
                  <td className={v.ganancia_usd < 0 ? 'num negativo' : 'num positivo'}>{formatearUsd(v.ganancia_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="seccion-titulo">Mezcla por grupo de precio</h2>
      {mezcla.length === 0 ? (
        <Vacio titulo="Sin ventas que mezclar todavia" />
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr><th>Grupo</th><th className="num">Piezas</th><th className="num">Ingreso $</th><th className="num">Ganancia $</th></tr>
            </thead>
            <tbody>
              {mezcla.map((g) => (
                <tr key={g.grupo}>
                  <td className="util">{g.grupo}</td>
                  <td className="num">{g.piezas}</td>
                  <td className="num">{formatearUsd(g.ingreso_usd)}</td>
                  <td className={g.ganancia_usd < 0 ? 'num negativo' : 'num positivo'}>{formatearUsd(g.ganancia_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="seccion-titulo">A donde se va el dinero cada mes</h2>
      <div className="tarjeta">
        <BarrasHorizontales
          partidas={partidasGasto}
          formato={formatearUsd}
          vacio={<p>Carga tus gastos en Costos y apareceran aqui, partida por partida.</p>}
        />
        {partidasGasto.length > 0 ? (
          <p className="campo__pista" style={{ marginTop: 'var(--e-4)' }}>
            {formatearUsd(totalGastos)} BCV al mes. Esto es lo que hay que cubrir
            antes de que la primera pieza deje ganancia.
          </p>
        ) : null}
      </div>

      <h2 className="seccion-titulo">Modelos dormidos</h2>
      <div className="tarjeta" style={{ marginBottom: 'var(--e-4)' }}>
        <div className="fila">
          <Campo etiqueta="Sin venderse desde hace" htmlFor="umbral" pista="Solo se listan modelos que todavia tienen existencia.">
            <select id="umbral" value={umbral} onChange={(e) => setUmbral(Number(e.target.value))}>
              {DORMIDOS.map((d) => <option key={d} value={d}>{d} dias o mas</option>)}
            </select>
          </Campo>
        </div>
      </div>

      {dormidos.length === 0 ? (
        <Aviso tono="exito">Ningun modelo con existencia lleva {umbral} dias sin venderse.</Aviso>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>SKU</th><th>Modelo</th><th>Grupo</th>
                <th className="num">Existencia</th><th className="num">Vendidas</th>
                <th className="num">Sin venderse</th><th>Ultima venta</th>
              </tr>
            </thead>
            <tbody>
              {dormidos.map((r) => (
                <tr key={r.id}>
                  <td className="celda-sku">{r.sku}</td>
                  <td className="celda-nombre">{r.nombre}</td>
                  <td className="util">{r.grupo}</td>
                  <td className="num">{r.existencia}</td>
                  <td className="num">{r.piezas_vendidas}</td>
                  <td className="num">{r.dias_sin_vender ?? r.dias_en_inventario} dias</td>
                  <td>{r.ultima_venta ? formatearFecha(r.ultima_venta) : 'Nunca'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
