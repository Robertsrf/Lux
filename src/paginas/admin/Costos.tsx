import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando } from '../../componentes/Piezas';
import { formatearBs, formatearEntero, formatearPorcentaje, formatearUsd, precioEnBs } from '../../lib/dinero';
import { useTasa } from '../../hooks/useTasa';
import type { Diagnostico } from '../../lib/tipos';

const GASTOS = [
  { clave: 'gasto_alquiler_mes_usd',  etiqueta: 'Alquiler al mes $' },
  { clave: 'gasto_sueldos_mes_usd',   etiqueta: 'Sueldos al mes $' },
  { clave: 'gasto_servicios_mes_usd', etiqueta: 'Servicios al mes $' },
  { clave: 'gasto_otros_mes_usd',     etiqueta: 'Otros fijos al mes $' },
  { clave: 'empaque_por_pieza_usd',   etiqueta: 'Empaque por pieza $' },
];

const METAS = [
  { clave: 'piezas_inventario_objetivo', etiqueta: 'Piezas con la tienda surtida', paso: '1',
    pista: 'Cuantas piezas manejas cuando el inventario esta completo.' },
  { clave: 'meses_rotacion_objetivo', etiqueta: 'Rotarlas en (meses)', paso: '1',
    pista: 'En cuanto tiempo quieres vender todo ese inventario.' },
  { clave: 'ganancia_mensual_objetivo_usd', etiqueta: 'Ganancia que quieres al mes $', paso: '1',
    pista: 'Lo que quieres que te quede libre, ya con todo pagado. De aqui sale el margen.' },
  { clave: 'capex_amortizar_meses', etiqueta: 'Recuperar exhibidores en (meses)', paso: '1', pista: undefined },
  { clave: 'merma_pct', etiqueta: 'Merma %', paso: '0.5',
    pista: 'Piezas que se pierden o nunca se venden. Las que si se venden las pagan.' },
  { clave: 'margen_objetivo_pct', etiqueta: 'Margen que usas %', paso: '0.5',
    pista: 'El que aplica el precio sugerido. Abajo el sistema te dice cual deberia ser.' },
];

/**
 * Los costos del negocio y el diagnostico.
 *
 * El volumen ya no se pregunta: se deduce del inventario y de la rotacion
 * que se quiera. Y el margen tampoco se adivina: sale de cuanto se quiere
 * ganar al mes, que es la unica pregunta que el dueno si puede responder.
 */
export function Costos() {
  const { tasa } = useTasa();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState<Record<string, number>>({});
  const [dx, setDx] = useState<Diagnostico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const TODOS = useMemo(() => [...GASTOS, ...METAS], []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [cfg, d] = await Promise.all([
      supabase.from('configuracion').select('clave, valor'),
      supabase.from('v_diagnostico').select('*').maybeSingle(),
    ]);
    if (cfg.error) setError(mensajeDeError(cfg.error));
    const mapa: Record<string, number> = {};
    for (const f of (cfg.data as { clave: string; valor: number }[] | null) ?? []) mapa[f.clave] = Number(f.valor);
    setGuardado(mapa);
    setValores(Object.fromEntries(TODOS.map((c) => [c.clave, String(mapa[c.clave] ?? 0)])));
    setDx((d.data as Diagnostico | null) ?? null);
    setCargando(false);
  }, [TODOS]);

  useEffect(() => { void cargar(); }, [cargar]);

  const num = (c: string) => Number(valores[c] ?? 0) || 0;
  const cambiado = TODOS.some((c) => num(c.clave) !== (guardado[c.clave] ?? 0));

  async function guardar() {
    setGuardando(true);
    setError(null);
    setExito(null);
    for (const c of TODOS) {
      const { error: err } = await supabase.from('configuracion').update({ valor: num(c.clave) }).eq('clave', c.clave);
      if (err) { setError(mensajeDeError(err)); setGuardando(false); return; }
    }
    setExito('Guardado. El diagnostico y los precios sugeridos ya usan estas cifras.');
    await cargar();
    setGuardando(false);
  }

  if (cargando) return <Cargando texto="Calculando el diagnostico" />;

  const faltaObjetivo = num('ganancia_mensual_objetivo_usd') <= 0;
  const sugerido = dx?.margen_sugerido_pct ?? null;
  const usaSugerido = sugerido !== null && Math.abs(num('margen_objetivo_pct') - sugerido) < 0.05;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Costos y diagnostico</h1>
          <p>Lo que cuesta tener la tienda abierta, y que margen hace falta para que el negocio de.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      <Ayuda titulo="Como lee esta pantalla tu negocio" abierta={faltaObjetivo}>
        <p>
          Antes te preguntaba cuantas piezas venderias al mes. Era una pregunta injusta:
          nadie lo sabe, y de ese numero colgaba todo el calculo.
        </p>
        <p>
          Ahora el sistema lo <strong>deduce</strong>: si manejas 350 piezas y quieres rotarlas
          en 3 meses, son <code>350 / 3 = 117 piezas al mes</code>. Eso si lo puedes decidir.
        </p>
        <p>
          Y el margen tampoco lo adivinas. Le dices <strong>cuanto quieres ganar al mes</strong> y
          el sistema despeja el margen que hace falta. Si el numero que sale es imposible de
          cobrar, el problema no es el margen: es el volumen o los gastos.
        </p>
      </Ayuda>

      {dx ? (
        <>
          <div className="tablero">
            <div className="tablero__celda">
              <span className="dato__etiqueta">Vas a vender</span>
              <div className="tablero__cifra">{formatearEntero(dx.volumen_mes)}</div>
              <div className="tablero__meta">
                piezas al mes · {formatearEntero(dx.piezas_objetivo)} rotadas en {dx.meses_rotacion} meses
              </div>
            </div>
            <div className="tablero__celda">
              <span className="dato__etiqueta">Cada pieza carga</span>
              <div className="tablero__cifra" style={{ fontSize: 'var(--t-28)' }}>
                {formatearUsd(dx.costo_operativo_pieza_usd)}
              </div>
              <div className="tablero__meta">de {formatearUsd(dx.gastos_mes_usd)} de gastos al mes</div>
            </div>
            <div className="tablero__celda">
              <span className="dato__etiqueta">Punto de equilibrio</span>
              <div className="tablero__cifra">{dx.piezas_equilibrio ?? '—'}</div>
              <div className="tablero__meta">piezas al mes para no perder</div>
            </div>
          </div>

          {sugerido !== null ? (
            <div className="tarjeta" style={{ marginTop: 'var(--e-4)' }}>
              <h2>El margen que necesitas</h2>
              <hr className="divisor" />
              <div className="rejilla rejilla--3">
                <div>
                  <span className="dato__etiqueta">Sugerido</span>
                  <div className="dato__valor dato__valor--grande">{formatearPorcentaje(sugerido)}</div>
                  <div className="campo__pista">para ganar {formatearUsd(dx.ganancia_objetivo_mes_usd)} al mes</div>
                </div>
                <div>
                  <span className="dato__etiqueta">El que usas</span>
                  <div className="dato__valor">{formatearPorcentaje(num('margen_objetivo_pct'))}</div>
                </div>
                <div>
                  <span className="dato__etiqueta">Pieza promedio</span>
                  <div className="dato__valor">{formatearUsd(dx.precio_sugerido_promedio_bcv)}</div>
                  <div className="campo__pista">
                    {formatearBs(precioEnBs(dx.precio_sugerido_promedio_bcv, tasa))} · hoy la vendes a {formatearUsd(dx.precio_bcv_promedio)}
                  </div>
                </div>
              </div>

              {!usaSugerido ? (
                <div className="acciones acciones--sueltas" style={{ marginTop: 'var(--e-4)' }}>
                  <button
                    type="button"
                    className="boton boton--confirmar"
                    onClick={() => setValores((v) => ({ ...v, margen_objetivo_pct: String(sugerido) }))}
                  >
                    Usar {formatearPorcentaje(sugerido)}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <Aviso tono={dx.ganancia_proyectada_mes_usd >= dx.ganancia_objetivo_mes_usd && dx.ganancia_objetivo_mes_usd > 0 ? 'exito' : 'alerta'}>
            Con los precios que tienes puestos ahora, la pieza promedio deja{' '}
            <strong style={{ display: 'inline' }}>{formatearPorcentaje(dx.margen_actual_pct)}</strong> y a{' '}
            {formatearEntero(dx.volumen_mes)} piezas al mes te quedarian{' '}
            <strong style={{ display: 'inline' }}>{formatearUsd(dx.ganancia_proyectada_mes_usd)}</strong> libres.
            {dx.ganancia_objetivo_mes_usd > 0 && dx.ganancia_proyectada_mes_usd < dx.ganancia_objetivo_mes_usd
              ? ` Te faltan ${formatearUsd(dx.ganancia_objetivo_mes_usd - dx.ganancia_proyectada_mes_usd)} para tu objetivo.`
              : ''}
          </Aviso>

          {dx.piezas_cargadas < dx.piezas_objetivo ? (
            <Aviso tono="alerta" titulo="Inventario a medio cargar">
              Tienes {formatearEntero(dx.piezas_cargadas)} piezas cargadas de las{' '}
              {formatearEntero(dx.piezas_objetivo)} que dices manejar. El diagnostico usa el
              objetivo, asi que ya te sirve; pero hasta que cargues el resto, los reportes de
              rotacion y el catalogo se quedan cortos.
            </Aviso>
          ) : null}
        </>
      ) : null}

      <h2 className="seccion-titulo">Tus gastos del mes</h2>
      <div className="tarjeta">
        <div className="fila">
          {GASTOS.map((c) => (
            <Campo key={c.clave} etiqueta={c.etiqueta} htmlFor={c.clave}>
              <input
                id={c.clave} type="number" min="0" step="0.01"
                value={valores[c.clave] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
              />
            </Campo>
          ))}
        </div>
      </div>

      <h2 className="seccion-titulo">Inventario y metas</h2>
      <div className="tarjeta">
        <Ayuda titulo="Que hace cada uno de estos numeros">
          <p>
            <strong>Piezas con la tienda surtida</strong> y <strong>rotarlas en</strong> deciden
            cuantas piezas al mes espera vender el sistema. Bajar la rotacion de 3 a 2 meses
            sube el volumen y <em>abarata</em> cada pieza, porque los gastos se reparten entre mas.
          </p>
          <p>
            <strong>Ganancia que quieres al mes</strong> es la unica meta de verdad. De ahi sale
            el margen sugerido. Si pones una cifra ambiciosa y el margen que sale es imposible,
            eso es informacion valiosa: te esta diciendo que con ese volumen y esos gastos, no da.
          </p>
          <p>
            <strong>Merma</strong> es lo que se pierde o nunca se vende. Las piezas que si se
            venden lo pagan, asi que sube el costo de todas.
          </p>
        </Ayuda>

        <div className="fila">
          {METAS.map((c) => (
            <Campo key={c.clave} etiqueta={c.etiqueta} htmlFor={c.clave} pista={c.pista}>
              <input
                id={c.clave} type="number" min="0" step={c.paso}
                value={valores[c.clave] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
              />
            </Campo>
          ))}
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

      <Ayuda titulo="Si el margen sugerido te parece imposible">
        <p>Solo hay cuatro palancas, y conviene moverlas en este orden:</p>
        <p>
          <strong>1 · Vender mas caro por venta.</strong> Una pieza de grupo alto deja varias veces
          lo que deja una barata, con el mismo tiempo de atencion y el mismo empaque. Es la palanca
          mas rapida y no cuesta dinero.
        </p>
        <p>
          <strong>2 · Rotar mas rapido.</strong> Los mismos gastos repartidos entre mas piezas
          bajan el costo de cada una. Aqui es donde el catalogo publico y los kits ayudan.
        </p>
        <p>
          <strong>3 · Bajar gastos fijos.</strong> Cada dolar que sale del alquiler o los servicios
          baja el costo de todas las piezas a la vez.
        </p>
        <p>
          <strong>4 · Subir precios.</strong> La ultima, no la primera: es la que la clienta si nota.
        </p>
      </Ayuda>
    </div>
  );
}
