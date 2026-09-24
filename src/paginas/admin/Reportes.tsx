import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { Progreso } from '../../componentes/Progreso';
import {
  aMonto, deMonto, formatearBcv, formatearBinance, formatearBs, formatearEntero,
  formatearFecha, formatearMonto, formatearPorcentaje, porCantidad, precioEnBs, sumar,
} from '../../lib/dinero';
import { useTasa } from '../../hooks/useTasa';
import { nombreConVariante } from '../../lib/familias';
import { GraficoDiario, GraficoGastos, GraficoValor } from '../../componentes/Graficos';
import type {
  CoberturaMes, GastoPartida, MezclaGrupo, Rebaja, RotacionModelo,
  ValorCategoriaFila, ValorInventario, VentaPorDia,
} from '../../lib/tipos';

const MOTIVO: Record<string, string> = { regateo: 'Regateo', tramo: 'Por cantidad' };

const PERIODOS = [
  { dias: 7, texto: 'Últimos 7 días' },
  { dias: 30, texto: 'Últimos 30 días' },
  { dias: 90, texto: 'Últimos 90 días' },
];

const DORMIDOS = [30, 60, 90];

const DIA_MS = 86_400_000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA_MS).toISOString().slice(0, 10);

interface Totales { ventas: number; piezas: number; bs: number; bcv: number; mercancia: number; deja: number }

function totalizar(filas: VentaPorDia[]): Totales {
  const s = (f: (v: VentaPorDia) => number) => deMonto(sumar(filas.map((v) => aMonto(f(v)))));
  return {
    ventas: filas.reduce((n, v) => n + Number(v.ventas), 0),
    piezas: filas.reduce((n, v) => n + Number(v.piezas), 0),
    bs: s((v) => v.total_bs),
    bcv: s((v) => v.total_usd),
    mercancia: s((v) => v.mercancia_usd),
    deja: s((v) => v.contribucion_usd),
  };
}

/**
 * Cuánto subió o bajó contra el período anterior, dicho con signo y con
 * palabras. El color acompaña pero no carga el mensaje solo: quien no
 * distingue el verde del ocre lee el "+" o el "−".
 */
function Comparacion({ ahora, antes, dias }: { ahora: number; antes: number; dias: number }) {
  if (antes <= 0) {
    return <span className="comparacion">sin ventas en los {dias} días anteriores</span>;
  }
  const cambio = ((ahora - antes) / antes) * 100;
  const sube = cambio >= 0;
  return (
    <span className={sube ? 'comparacion comparacion--sube' : 'comparacion comparacion--baja'}>
      {sube ? '+' : '−'}{formatearPorcentaje(Math.abs(cambio), 0)} contra los {dias} días anteriores
    </span>
  );
}

/**
 * Reportes del administrador.
 *
 * TODO EN DÓLARES BCV, la moneda de la etiqueta, con la tasa congelada de
 * cada venta. Sumar bolívares de 90 días no dice nada: la inflación los
 * vuelve ilegibles. Los bolívares aparecen donde son un hecho —lo cobrado un
 * día concreto— y no como total de un trimestre.
 *
 * LO QUE DEJARON, NO UNA GANANCIA SUPUESTA. Antes el indicador principal
 * era una "ganancia" que restaba a cada pieza su parte del alquiler,
 * repartido con las piezas que se ESPERABA vender. Si el mes se vendía
 * menos, cada pieza cargaba menos alquiler del que costó y la pantalla
 * enseñaba una ganancia que no existía, mientras más abajo "El mes" decía
 * otra cosa. Ahora arriba va lo que dejaron las ventas después de la
 * mercancía y el empaque —un hecho— y la ganancia de verdad es una sola:
 * la del mes, en "El mes", contra los gastos del mes entero.
 *
 * Cada indicador trae su comparación contra el período anterior del mismo
 * largo. Un número solo no dice si es bueno.
 */
export function Reportes() {
  const { tasa } = useTasa();
  const [dias, setDias] = useState(30);
  const [umbral, setUmbral] = useState(30);
  const [filas, setFilas] = useState<VentaPorDia[]>([]);
  const [mezcla, setMezcla] = useState<MezclaGrupo[]>([]);
  const [rotacion, setRotacion] = useState<RotacionModelo[]>([]);
  const [gastos, setGastos] = useState<GastoPartida[]>([]);
  const [cobertura, setCobertura] = useState<CoberturaMes | null>(null);
  const [valor, setValor] = useState<ValorInventario | null>(null);
  const [valorCat, setValorCat] = useState<ValorCategoriaFila[]>([]);
  const [rebajas, setRebajas] = useState<Rebaja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      setError(null);
      // El doble del período: la mitad de atrás es contra lo que se compara.
      const [v, m, r, g, c, iv, ic, rb] = await Promise.all([
        supabase.from('v_ventas_por_dia').select('*').gte('dia', hace(dias * 2)).order('dia', { ascending: false }),
        supabase.from('v_mezcla_grupo').select('*').order('orden'),
        supabase.from('v_rotacion_modelo').select('*').order('piezas_vendidas', { ascending: false }).limit(500),
        supabase.from('v_gastos_desglose').select('*'),
        supabase.from('v_cobertura_mes').select('*').maybeSingle(),
        supabase.from('v_valor_inventario').select('*').maybeSingle(),
        supabase.from('v_valor_por_categoria').select('*'),
        // Lo que se vendio por debajo de la etiqueta en el periodo.
        supabase.from('v_rebajas').select('*').gte('fecha', hace(dias)).order('fecha', { ascending: false }).limit(1000),
      ]);
      // Ocho consultas, ocho errores mirados.
      const fallo = v.error ?? m.error ?? r.error ?? g.error ?? c.error ?? iv.error ?? ic.error ?? rb.error;
      if (fallo) setError(mensajeDeError(fallo));
      setFilas((v.data as VentaPorDia[] | null) ?? []);
      setMezcla((m.data as MezclaGrupo[] | null) ?? []);
      setRotacion((r.data as RotacionModelo[] | null) ?? []);
      setGastos((g.data as GastoPartida[] | null) ?? []);
      setCobertura((c.data as CoberturaMes | null) ?? null);
      setValor((iv.data as ValorInventario | null) ?? null);
      setValorCat((ic.data as ValorCategoriaFila[] | null) ?? []);
      setRebajas((rb.data as Rebaja[] | null) ?? []);
      setCargando(false);
    })();
  }, [dias]);

  const desde = hace(dias);
  const ventas = useMemo(() => filas.filter((f) => f.dia >= desde), [filas, desde]);
  const actual = useMemo(() => totalizar(ventas), [ventas]);
  const anterior = useMemo(() => totalizar(filas.filter((f) => f.dia < desde)), [filas, desde]);

  /*
    LAS REBAJAS, SEPARADAS POR QUE
    El regateo lo decide la vendedora pieza por pieza para cerrar una venta
    chica; el tramo lo pone la regla de cantidad. Juntarlos en una cifra
    esconderia justo lo que se quiere saber: cuanto cuesta negociar.
  */
  const resumenRebajas = useMemo(() => {
    const de = (motivo: Rebaja['motivo_rebaja']) => {
      const filas = rebajas.filter((x) => x.motivo_rebaja === motivo);
      return {
        piezas: filas.reduce((n, x) => n + x.cantidad, 0),
        usd: deMonto(sumar(filas.map((x) => aMonto(x.rebaja_usd)))),
      };
    };
    return { regateo: de('regateo'), tramo: de('tramo'), sinDato: de(null) };
  }, [rebajas]);

  const dormidos = useMemo(
    () => rotacion.filter((r) => r.existencia > 0
      && (r.dias_sin_vender === null ? r.dias_en_inventario >= umbral : r.dias_sin_vender >= umbral)),
    [rotacion, umbral],
  );
  // Lo que costaron las piezas que no se mueven: dinero parado, en la moneda
  // en que se pagó.
  const parado = useMemo(
    () => deMonto(sumar(dormidos.map((r) => porCantidad(aMonto(r.costo_puesto_usd), r.existencia)))),
    [dormidos],
  );

  // El grafico va de izquierda a derecha en el tiempo; la consulta trae lo
  // mas nuevo primero.
  const porDia = useMemo(() => [...ventas].reverse().map((v) => ({
    dia: formatearFecha(v.dia).slice(0, 5),
    costo: Number(v.mercancia_usd) || 0,
    // El piso de precio impide vender por debajo de la mercancia, asi que un
    // dia en negativo es casi imposible; si ocurre, la tabla lo dice en rojo.
    ganancia: Math.max(Number(v.contribucion_usd) || 0, 0),
  })), [ventas]);

  const porCategoria = useMemo(() => valorCat.map((c) => ({
    categoria: c.categoria,
    costo: Number(c.costo_bcv) || 0,
    margen: Number(c.margen_bruto_bcv) || 0,
  })), [valorCat]);

  const partidasGasto = useMemo(() => {
    const fraccion = Math.min(Math.max((cobertura?.cubierto_pct ?? 0) / 100, 0), 1);
    return gastos.map((g) => {
      const monto = Number(g.monto_usd) || 0;
      const cubierto = monto * fraccion;
      return { partida: g.partida, cubierto, porCubrir: monto - cubierto };
    });
  }, [gastos, cobertura]);

  if (cargando) return <Cargando texto="Calculando reportes" />;

  const dejaPct = actual.bcv > 0 ? (actual.deja / actual.bcv) * 100 : null;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Reportes</h1>
          <p>En dólares BCV, con la tasa congelada de cada venta.</p>
        </div>
        <Campo etiqueta="Período" htmlFor="periodo">
          <select id="periodo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {PERIODOS.map((p) => <option key={p.dias} value={p.dias}>{p.texto}</option>)}
          </select>
        </Campo>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudieron leer los reportes">{error}</Aviso> : null}

      {/* ------------------------------------------------ el período */}

      <div className="tablero">
        <div className="tablero__celda">
          <span className="dato__etiqueta">Vendiste</span>
          <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(actual.bcv, 0)}</div>
          <div className="tablero__meta">{formatearBs(actual.bs)} cobrados</div>
          <div className="tablero__meta"><Comparacion ahora={actual.bcv} antes={anterior.bcv} dias={dias} /></div>
        </div>
        <div className="tablero__celda">
          <span className="dato__etiqueta">Te dejaron</span>
          <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(actual.deja, 0)}</div>
          <div className="tablero__meta">
            después de pagar la mercancía y el empaque{dejaPct !== null ? ` · ${formatearPorcentaje(dejaPct, 0)} de lo vendido` : ''}
          </div>
          <div className="tablero__meta"><Comparacion ahora={actual.deja} antes={anterior.deja} dias={dias} /></div>
        </div>
        <div className="tablero__celda">
          <span className="dato__etiqueta">Piezas</span>
          <div className="tablero__cifra">{formatearEntero(actual.piezas)}</div>
          <div className="tablero__meta">en {formatearEntero(actual.ventas)} ventas</div>
          <div className="tablero__meta"><Comparacion ahora={actual.piezas} antes={anterior.piezas} dias={dias} /></div>
        </div>
      </div>

      {/* ---------------------------------------------------- el mes */}

      <h2 className="seccion-titulo">El mes</h2>
      <div className="tarjeta">
        {cobertura ? (
          <>
            <Progreso
              titulo="Gastos del mes cubiertos"
              pct={cobertura.cubierto_pct}
              pie={`${formatearBcv(cobertura.cubierto_usd, 0)} de ${formatearBcv(cobertura.gastos_mes_usd, 0)}`}
            />
            <p className="prosa" style={{ marginTop: 'var(--e-4)' }}>
              {cobertura.ganancia_usd > 0 ? (
                <>
                  <strong style={{ display: 'inline' }}>El mes ya está pagado.</strong>{' '}
                  Las {formatearEntero(cobertura.piezas_vendidas)} piezas vendidas cubrieron los gastos, y van{' '}
                  <strong style={{ display: 'inline' }}>{formatearBcv(cobertura.ganancia_usd)}</strong> de ganancia.
                  Todo lo que dejen las ventas de aquí al fin de mes se suma ahí.
                </>
              ) : (
                <>
                  Las ventas del mes llevan {formatearBcv(cobertura.cubierto_usd)} de los{' '}
                  {formatearBcv(cobertura.gastos_mes_usd)} que cuesta tener la tienda abierta.
                  {cobertura.piezas_faltantes
                    ? <> Faltan {formatearBcv(cobertura.por_cubrir_usd)}: unas <strong style={{ display: 'inline' }}>{formatearEntero(cobertura.piezas_faltantes)} piezas</strong> más.</>
                    : null}
                </>
              )}
            </p>
            <p className="campo__pista">
              Cuántas piezas necesitas en todo el mes, y por día, está en <Link to="/admin/costos">Costos</Link>.
            </p>
          </>
        ) : null}

        <hr className="divisor" />
        <span className="panel__titulo">Los gastos del mes, partida por partida</span>
        <GraficoGastos
          datos={partidasGasto}
          formato={(n) => formatearBcv(n)}
          eje={(n) => formatearMonto(n, 0)}
          vacio={<p>Carga tus gastos en Costos y aparecerán aquí.</p>}
        />
        {partidasGasto.length > 0 ? (
          <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
            En dólares BCV. Lo verde es lo que las ventas ya taparon, repartido parejo: el dinero
            no viene marcado por partida. El empaque no está aquí porque no es del mes, es de
            cada pieza: ya va restado en lo que deja cada venta.
          </p>
        ) : null}
      </div>

      {/* ---------------------------------------------- día a día */}

      <h2 className="seccion-titulo">Día a día · $ BCV</h2>
      <div className="tarjeta">
        <GraficoDiario
          datos={porDia}
          formato={(n) => formatearBcv(n)}
          eje={(n) => formatearMonto(n, 0)}
          vacio={
            <>
              <p>Todavía no hay ventas en este período.</p>
              <p>Cuando el mostrador registre la primera, el gráfico se llena solo.</p>
            </>
          }
        />
        <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
          El alto de cada columna es lo vendido ese día; la parte de arriba, lo que dejó
          después de la mercancía y el empaque.
        </p>
      </div>

      {ventas.length === 0 ? null : (
        <div className="tabla-envoltura" style={{ marginTop: 'var(--e-4)' }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Día</th><th className="num">Ventas</th><th className="num">Piezas</th>
                <th className="num">Cobrado · Bs</th>
                <th className="num">Vendido · $ BCV</th>
                <th className="num">Mercancía · $ BCV</th>
                <th className="num">Te dejó · $ BCV</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.dia}>
                  <td>{formatearFecha(v.dia)}</td>
                  <td className="num">{v.ventas}</td>
                  <td className="num">{v.piezas}</td>
                  <td className="num">{formatearBs(v.total_bs)}</td>
                  <td className="num">{formatearMonto(v.total_usd)}</td>
                  <td className="num">{formatearMonto(v.mercancia_usd)}</td>
                  <td className={v.contribucion_usd < 0 ? 'num negativo' : 'num positivo'}>{formatearMonto(v.contribucion_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------ rebajas */}

      <h2 className="seccion-titulo">Rebajas · $ BCV</h2>
      {rebajas.length === 0 ? (
        <Vacio titulo={`Ninguna pieza se vendió por debajo de su etiqueta en los últimos ${dias} días`} />
      ) : (
        <>
          <div className="tablero">
            <div className="tablero__celda">
              <span className="dato__etiqueta">Regateo para cerrar</span>
              <div className="tablero__cifra">{formatearBcv(resumenRebajas.regateo.usd)}</div>
              <div className="tablero__meta">
                {resumenRebajas.regateo.piezas} pieza{resumenRebajas.regateo.piezas === 1 ? '' : 's'} · lo negoció la vendedora
              </div>
            </div>
            <div className="tablero__celda">
              <span className="dato__etiqueta">Descuento por cantidad</span>
              <div className="tablero__cifra">{formatearBcv(resumenRebajas.tramo.usd)}</div>
              <div className="tablero__meta">
                {resumenRebajas.tramo.piezas} pieza{resumenRebajas.tramo.piezas === 1 ? '' : 's'} · lo puso el tramo
              </div>
            </div>
            {resumenRebajas.sinDato.piezas > 0 ? (
              <div className="tablero__celda">
                <span className="dato__etiqueta">Sin motivo guardado</span>
                <div className="tablero__cifra">{formatearBcv(resumenRebajas.sinDato.usd)}</div>
                <div className="tablero__meta">ventas de antes de que se guardara el porqué</div>
              </div>
            ) : null}
          </div>

          <div className="tabla-envoltura" style={{ marginTop: 'var(--e-4)' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th><th>Pieza</th><th>Quién</th><th>Por qué</th>
                  <th className="num">Cant.</th>
                  <th className="num">Etiqueta · Bs</th>
                  <th className="num">Cobrado · Bs</th>
                  <th className="num">Rebaja</th>
                  <th className="num">Dejó de cobrar · $ BCV</th>
                </tr>
              </thead>
              <tbody>
                {rebajas.slice(0, 60).map((x) => (
                  <tr key={`${x.venta_id}-${x.modelo_id}`}>
                    <td>{formatearFecha(x.fecha)}</td>
                    <td>
                      <div className="celda-nombre">{nombreConVariante(x.nombre, x.variante)}</div>
                      <div className="celda-nota">{x.sku} · venta {x.venta_id}</div>
                    </td>
                    <td className="util">{x.vendedora ?? '—'}</td>
                    <td className="util">{x.motivo_rebaja ? MOTIVO[x.motivo_rebaja] : 'Sin dato'}</td>
                    <td className="num">{x.cantidad}</td>
                    <td className="num">{formatearBs(x.precio_lista_bs)}</td>
                    <td className="num">{formatearBs(x.precio_unitario_bs)}</td>
                    <td className="num">{formatearPorcentaje(x.rebaja_pct, 0)}</td>
                    <td className="num">{formatearMonto(x.rebaja_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
            Cada venta guarda a cuánto salió cada pieza, no el precio de su grupo: los reportes de
            arriba ya cuentan lo cobrado de verdad. Esto dice cuánto se dejó de cobrar y por qué.
            {rebajas.length > 60 ? ` Se ven las 60 más recientes de ${rebajas.length}.` : ''}
          </p>
        </>
      )}

      {/* -------------------------------------------- por grupo */}

      <h2 className="seccion-titulo">Qué grupo deja más</h2>
      {mezcla.length === 0 ? (
        <Vacio titulo="Sin ventas que comparar todavía" />
      ) : (
        <>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Grupo</th><th className="num">Piezas</th>
                  <th className="num">Vendido · $ BCV</th>
                  <th className="num">Te dejó · $ BCV</th>
                  <th className="num">Por pieza · $ BCV</th>
                </tr>
              </thead>
              <tbody>
                {mezcla.map((g) => (
                  <tr key={g.grupo}>
                    <td className="util">{g.grupo}</td>
                    <td className="num">{g.piezas}</td>
                    <td className="num">{formatearMonto(g.ingreso_usd)}</td>
                    <td className={g.contribucion_usd < 0 ? 'num negativo' : 'num positivo'}>{formatearMonto(g.contribucion_usd)}</td>
                    <td className="num">{g.piezas > 0 ? formatearMonto(g.contribucion_usd / g.piezas) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
            Desde la primera venta. "Por pieza" es la palanca más rápida: vender una pieza de un
            grupo que deja más cuesta el mismo tiempo y el mismo empaque.
          </p>
        </>
      )}

      {/* ------------------------------------------- en vitrina */}

      <h2 className="seccion-titulo">Lo que tienes en vitrina</h2>
      {valor ? (
        <>
          <div className="tablero">
            <div className="tablero__celda">
              <span className="dato__etiqueta">Piezas</span>
              <div className="tablero__cifra">{formatearEntero(valor.piezas)}</div>
              <div className="tablero__meta">
                en {formatearEntero(valor.modelos_con_existencia)} de {formatearEntero(valor.modelos_activos)} modelos
              </div>
            </div>
            <div className="tablero__celda">
              <span className="dato__etiqueta">Te costaron</span>
              <div className="tablero__cifra tablero__cifra--dinero">{formatearBinance(valor.costo_real_usd, 0)}</div>
              <div className="tablero__meta">reponerlas hoy son {formatearBcv(valor.costo_bcv, 0)}</div>
            </div>
            <div className="tablero__celda">
              <span className="dato__etiqueta">Valen en etiqueta</span>
              <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(valor.precio_bcv, 0)}</div>
              <div className="tablero__meta">{formatearBs(precioEnBs(valor.precio_bcv, tasa))}</div>
            </div>
            <div className="tablero__celda">
              <span className="dato__etiqueta">Margen bruto</span>
              <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(valor.margen_bruto_bcv, 0)}</div>
              <div className="tablero__meta">{formatearPorcentaje(valor.margen_bruto_pct)} del precio · antes de gastos</div>
            </div>
          </div>

          {valor.piezas_sin_precio > 0 ? (
            <Aviso tono="alerta" titulo="Hay piezas sin precio">
              {formatearEntero(valor.piezas_sin_precio)} piezas no tienen precio puesto, así que
              no entran en estos totales. Ponles grupo en Inventario para que cuenten.
            </Aviso>
          ) : null}

          <div className="tarjeta">
            <span className="panel__titulo">Por categoría · $ BCV</span>
            <GraficoValor
              datos={porCategoria}
              formato={(n) => formatearBcv(n)}
              eje={(n) => formatearMonto(n, 0)}
              vacio={<p>Carga piezas con existencia y aquí verás en qué está metido el dinero.</p>}
            />
            <p className="campo__pista" style={{ marginTop: 'var(--e-4)' }}>
              "Te costaron" es lo que pagaste en Binance. "Reponerlas" es eso mismo llevado a
              dólares BCV con la brecha de hoy, que es lo que haría falta cobrar para volver a
              comprarlas. El margen es BRUTO: si vendieras todo hoy te quedarían{' '}
              {formatearBcv(valor.margen_bruto_bcv)}, y de ahí salen los gastos del mes.
            </p>
          </div>
        </>
      ) : null}

      {/* ---------------------------------------------- dormidos */}

      <h2 className="seccion-titulo">Modelos dormidos</h2>
      <div className="tarjeta" style={{ marginBottom: 'var(--e-4)' }}>
        <div className="fila">
          <Campo etiqueta="Sin venderse desde hace" htmlFor="umbral" pista="Solo se listan modelos que todavía tienen existencia.">
            <select id="umbral" value={umbral} onChange={(e) => setUmbral(Number(e.target.value))}>
              {DORMIDOS.map((d) => <option key={d} value={d}>{d} días o más</option>)}
            </select>
          </Campo>
        </div>
        {dormidos.length > 0 ? (
          <p className="prosa">
            Hay <strong style={{ display: 'inline' }}>{formatearBinance(parado, 0)}</strong> parados en estos
            {' '}{formatearEntero(dormidos.length)} modelos: lo que costaron y todavía no ha vuelto.
          </p>
        ) : null}
      </div>

      {dormidos.length === 0 ? (
        <Aviso tono="exito">Ningún modelo con existencia lleva {umbral} días sin venderse.</Aviso>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>SKU</th><th>Modelo</th><th>Grupo</th>
                <th className="num">Existencia</th><th className="num">Vendidas</th>
                <th className="num">Sin venderse</th><th>Última venta</th>
                <th className="num">Parado · $ Binance</th>
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
                  <td className="num">{r.dias_sin_vender ?? r.dias_en_inventario} días</td>
                  <td>{r.ultima_venta ? formatearFecha(r.ultima_venta) : 'Nunca'}</td>
                  <td className="num">{formatearMonto(porCantidad(aMonto(r.costo_puesto_usd), r.existencia))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Ayuda titulo="Qué contesta cada parte de esta pantalla">
        <p>
          <strong>Vendiste y te dejaron.</strong> Lo vendido en el período, y lo que quedó
          después de pagar la mercancía y el empaque de esas piezas. De eso salen el alquiler,
          los sueldos y todo lo demás del mes.
        </p>
        <p>
          <strong>El mes.</strong> La ganancia de verdad: lo que dejaron las ventas del mes
          contra lo que cuesta el mes entero. Cuando la barra se llena, la tienda se pagó sola.
        </p>
        <p>
          <strong>Qué grupo deja más.</strong> Dónde está el dinero. Empujar las piezas del grupo
          que deja más por pieza es más rápido que vender más piezas baratas.
        </p>
        <p>
          <strong>Modelos dormidos.</strong> Dinero parado en la vitrina. Buenos candidatos para
          el descuento por cantidad o para cambiarlos de sitio.
        </p>
        <p>
          Las cifras usan la tasa del día de cada venta, no la de hoy. Si el reporte de un mes
          cambiara porque hoy movió la tasa, estaría mintiendo.
        </p>
      </Ayuda>
    </div>
  );
}
