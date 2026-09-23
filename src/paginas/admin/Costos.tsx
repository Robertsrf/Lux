import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando } from '../../componentes/Piezas';
import { Progreso } from '../../componentes/Progreso';
import { formatearBcv, formatearBinance, formatearBs, formatearEntero, formatearPorcentaje, formatearTasa, precioEnBs } from '../../lib/dinero';
import { useTasa } from '../../hooks/useTasa';
import type { Diagnostico, PlanVentas } from '../../lib/tipos';

interface Dato { clave: string; etiqueta: string; paso: string; pista?: string }

/* Lo que se paga aqui en bolivares: dolares BCV, no Binance. */
const GASTOS: Dato[] = [
  { clave: 'gasto_alquiler_mes_usd',  etiqueta: 'Alquiler al mes · $ BCV', paso: '0.01' },
  { clave: 'gasto_sueldos_mes_usd',   etiqueta: 'Sueldos al mes · $ BCV', paso: '0.01' },
  { clave: 'gasto_servicios_mes_usd', etiqueta: 'Servicios al mes · $ BCV', paso: '0.01',
    pista: 'Luz, agua, internet, telefono.' },
  { clave: 'gasto_otros_mes_usd',     etiqueta: 'Otros fijos al mes · $ BCV', paso: '0.01' },
];

const TIENDA: Dato[] = [
  { clave: 'empaque_por_pieza_usd', etiqueta: 'Empaque por pieza · $ BCV', paso: '0.01',
    pista: 'Bolsa, caja, tarjeta. Se paga por cada pieza que sale, no por mes.' },
  { clave: 'dias_abiertos_mes', etiqueta: 'Días que abres al mes', paso: '1',
    pista: 'Con esto la meta se dice por día, que es como se trabaja.' },
];

const META: Dato = {
  clave: 'ganancia_mensual_objetivo_usd', etiqueta: 'Ganancia que quieres al mes · $ BCV', paso: '1',
  pista: 'Libre, después de pagar la mercancía, el empaque y todos los gastos del mes.',
};

const MARGEN: Dato = {
  clave: 'margen_objetivo_pct', etiqueta: 'Margen que usas para el precio sugerido %', paso: '0.5',
};

/* Casi nunca se tocan. Viven plegadas. */
const AJUSTES: Dato[] = [
  { clave: 'capex_amortizar_meses', etiqueta: 'Recuperar los exhibidores en (meses)', paso: '1',
    pista: 'Los exhibidores que vinieron en los lotes se reparten en tantos meses de gastos. 0 si no quieres repartirlos.' },
  { clave: 'piezas_danadas_mes', etiqueta: 'Piezas dañadas al mes', paso: '1',
    pista: 'Las que salen defectuosas o se pierden. Si no se daña nada, 0: no encarece nada.' },
  { clave: 'meses_servicio', etiqueta: 'Lavado y abrillantado (meses)', paso: '1',
    pista: 'Cuántos meses de ese servicio da cada compra.' },
];

/* Solo mientras no haya un mes de ventas: despues el sistema lo mide. */
const ESTIMADO: Dato[] = [
  { clave: 'piezas_inventario_objetivo', etiqueta: 'Piezas con la tienda surtida', paso: '1',
    pista: 'Si lo dejas en 0, se usan las que tienes cargadas.' },
  { clave: 'meses_rotacion_objetivo', etiqueta: 'Venderlas en (meses)', paso: '1' },
];

const TODOS = [...GASTOS, ...TIENDA, META, MARGEN, ...AJUSTES, ...ESTIMADO];

/**
 * Costos: cuántas piezas hay que vender, y de dónde sale ese número.
 *
 * ANTES preguntaba "cuántas piezas vas a vender al mes" para poder hacer la
 * cuenta. Era la pregunta al revés: el dueño no lo sabe, y el punto de
 * equilibrio ni siquiera depende de eso. Depende de dos cosas que SÍ se
 * saben:
 *
 *   gastos fijos del mes ÷ lo que deja cada pieza = piezas para no perder
 *
 * Los gastos los escribe él (son facturas). Lo que deja cada pieza lo saca
 * el sistema de lo que de verdad se vende. Así que la pantalla contesta
 * primero, arriba y en grande, y pregunta después solo lo que no puede
 * saber sola.
 *
 * La cifra viene de v_plan_ventas, la misma que usan Reportes, Inversiones
 * y la meta del día de la vendedora. Antes eran tres fórmulas con tres
 * resultados; ahora es una.
 */
export function Costos() {
  const { tasa } = useTasa();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState<Record<string, number>>({});
  const [plan, setPlan] = useState<PlanVentas | null>(null);
  const [dx, setDx] = useState<Diagnostico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [cfg, p, d] = await Promise.all([
      supabase.from('configuracion').select('clave, valor'),
      supabase.from('v_plan_ventas').select('*').maybeSingle(),
      supabase.from('v_diagnostico').select('*').maybeSingle(),
    ]);
    // Tres consultas, tres errores mirados.
    const fallo = cfg.error ?? p.error ?? d.error;
    setError(fallo ? mensajeDeError(fallo) : null);
    const mapa: Record<string, number> = {};
    for (const f of (cfg.data as { clave: string; valor: number }[] | null) ?? []) mapa[f.clave] = Number(f.valor);
    setGuardado(mapa);
    setValores(Object.fromEntries(TODOS.map((c) => [c.clave, String(mapa[c.clave] ?? 0)])));
    setPlan((p.data as PlanVentas | null) ?? null);
    setDx((d.data as Diagnostico | null) ?? null);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const num = useCallback((c: string) => Number(valores[c] ?? 0) || 0, [valores]);
  const cambiado = useMemo(
    () => TODOS.some((c) => num(c.clave) !== (guardado[c.clave] ?? 0)),
    [num, guardado],
  );

  async function guardar() {
    setGuardando(true);
    setError(null);
    setExito(null);
    for (const c of TODOS) {
      if (num(c.clave) === (guardado[c.clave] ?? 0)) continue;
      const { error: err } = await supabase.from('configuracion').update({ valor: num(c.clave) }).eq('clave', c.clave);
      if (err) { setError(mensajeDeError(err)); setGuardando(false); return; }
    }
    setExito('Guardado. Las cifras de arriba ya están recalculadas.');
    await cargar();
    setGuardando(false);
  }

  if (cargando) return <Cargando texto="Haciendo la cuenta" />;

  const campo = (c: Dato) => (
    <Campo key={c.clave} etiqueta={c.etiqueta} htmlFor={c.clave} pista={c.pista}>
      <input
        id={c.clave} type="number" min="0" step={c.paso} inputMode="decimal"
        value={valores[c.clave] ?? ''}
        onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
      />
    </Campo>
  );

  const hayMeta = (plan?.meta_ganancia_bcv ?? 0) > 0;
  const objetivo = plan?.piezas_meta_mes ?? plan?.piezas_equilibrio_mes ?? null;
  const porDia = plan?.piezas_meta_dia ?? plan?.piezas_equilibrio_dia ?? null;
  const deja = plan?.contribucion_pieza_bcv ?? null;
  const sugerido = dx?.margen_sugerido_pct ?? null;
  const usaSugerido = sugerido !== null && Math.abs(num('margen_objetivo_pct') - sugerido) < 0.05;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Costos</h1>
          <p>Cuántas piezas tienes que vender, y de dónde sale ese número.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="Algo no cuadró">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      {/* ------------------------------------------------ la respuesta */}

      {!plan ? null : plan.promedio_de === 'nada' ? (
        <Aviso tono="alerta" titulo="Todavía no hay con qué hacer la cuenta">
          Carga piezas con precio y existencia en Inventario. Con eso el sistema sabe
          cuánto deja cada una y te dice cuántas vender.
        </Aviso>
      ) : deja !== null && deja <= 0 ? (
        <Aviso tono="error" titulo="Con estos precios no hay cantidad que alcance">
          Cada pieza deja {formatearBcv(deja)} después de pagar la mercancía y el empaque.
          Si una pieza no deja nada, vender más no cubre los gastos: hay que subir
          precios o bajar lo que cuesta la mercancía.
        </Aviso>
      ) : (
        <section className="tarjeta plan" aria-labelledby="plan-titulo">
          <span className="panel__titulo" id="plan-titulo">Este mes tienes que vender</span>

          <div className="plan__cifras">
            <div className="plan__principal">
              <div className="plan__numero">{formatearEntero(objetivo)}</div>
              <div className="plan__unidad">piezas</div>
              <p className="plan__para">
                {hayMeta
                  ? <>para ganar tu meta de {formatearBcv(plan.meta_ganancia_bcv, 0)}</>
                  : <>para cubrir los gastos del mes, sin ganancia todavía</>}
              </p>
              {porDia !== null ? (
                <p className="plan__dia">
                  {formatearEntero(porDia)} {porDia === 1 ? 'pieza' : 'piezas'} cada día que abres
                </p>
              ) : (
                <p className="campo__pista">
                  Dime abajo cuántos días abres al mes y te lo digo por día.
                </p>
              )}
            </div>

            {hayMeta ? (
              <div className="plan__secundaria">
                <span className="dato__etiqueta">Para no perder</span>
                <div className="dato__valor">{formatearEntero(plan.piezas_equilibrio_mes)} piezas</div>
                <div className="campo__pista">
                  {plan.piezas_equilibrio_dia !== null ? `${plan.piezas_equilibrio_dia} por día · ` : ''}
                  cubren {formatearBcv(plan.gastos_fijos_bcv, 0)} de gastos, sin ganancia
                </div>
              </div>
            ) : null}
          </div>

          {objetivo ? (
            <Progreso
              titulo="Llevas este mes"
              pct={(plan.vendidas_mes / objetivo) * 100}
              pie={`${formatearEntero(plan.vendidas_mes)} de ${formatearEntero(objetivo)} piezas · día ${plan.dia_del_mes} de ${plan.dias_del_mes}`}
            />
          ) : null}

          {plan.vendidas_mes === 0 ? (
            <p className="plan__ritmo">Todavía no hay ventas este mes.</p>
          ) : plan.ritmo_piezas_mes !== null && objetivo ? (
            <p className={plan.ritmo_piezas_mes >= objetivo ? 'plan__ritmo plan__ritmo--bien' : 'plan__ritmo'}>
              A este paso cierras el mes en <strong>{formatearEntero(plan.ritmo_piezas_mes)} piezas</strong>
              {plan.ritmo_piezas_mes >= objetivo
                ? hayMeta ? ': pasas tu meta.' : ': cubres el mes.'
                : `: te faltarían ${formatearEntero(objetivo - plan.ritmo_piezas_mes)}.`}
              {plan.resultado_proyectado_bcv !== null ? (
                <>
                  {' '}El mes cerraría en{' '}
                  <strong className={plan.resultado_proyectado_bcv < 0 ? 'negativo' : undefined}>
                    {formatearBcv(plan.resultado_proyectado_bcv, 0)}
                  </strong>
                  {plan.resultado_proyectado_binance !== null
                    ? <> ({formatearBinance(plan.resultado_proyectado_binance, 0)})</>
                    : null}
                  .
                </>
              ) : null}
            </p>
          ) : null}
        </section>
      )}

      {/* --------------------------------------------- de dónde sale */}

      {plan && plan.promedio_de !== 'nada' && deja !== null ? (
        <>
          <h2 className="seccion-titulo">De dónde sale</h2>
          <div className="tarjeta">
            <span className="panel__titulo">Lo que deja cada pieza</span>
            <ol className="cadena">
              <li>
                <span className="dato__etiqueta">Se vende en</span>
                <div className="dato__valor">{formatearBcv(plan.precio_promedio_bcv)}</div>
                <div className="campo__pista">
                  {plan.promedio_de === 'ventas'
                    ? `promedio de las ${formatearEntero(plan.piezas_promedio)} piezas vendidas en 90 días, con descuentos y regateos`
                    : `promedio de las ${formatearEntero(plan.piezas_promedio)} piezas que tienes en vitrina`}
                </div>
              </li>
              <li>
                <span className="dato__etiqueta">Menos la mercancía</span>
                <div className="dato__valor">{formatearBcv(plan.costo_promedio_bcv)}</div>
                <div className="campo__pista">
                  costó {formatearBinance(plan.costo_promedio_binance)} · por {formatearTasa(plan.brecha)} de brecha
                  {plan.merma_pct > 0 ? ` y ${formatearPorcentaje(plan.merma_pct)} por dañadas` : ''}
                </div>
              </li>
              <li>
                <span className="dato__etiqueta">Menos el empaque</span>
                <div className="dato__valor">{formatearBcv(plan.empaque_bcv)}</div>
              </li>
              <li className="cadena__final">
                <span className="dato__etiqueta">Deja</span>
                <div className="dato__valor dato__valor--grande">{formatearBcv(deja)}</div>
                <div className="campo__pista">{formatearPorcentaje(plan.contribucion_pct)} de lo que se cobra</div>
              </li>
            </ol>

            <hr className="divisor" />

            <span className="panel__titulo">Cuántas hacen falta</span>
            <ol className="cadena">
              <li>
                <span className="dato__etiqueta">Gastos fijos del mes</span>
                <div className="dato__valor">{formatearBcv(plan.gastos_fijos_bcv)}</div>
                <div className="campo__pista">se pagan vendas o no vendas</div>
              </li>
              {hayMeta ? (
                <li>
                  <span className="dato__etiqueta">Más tu meta</span>
                  <div className="dato__valor">{formatearBcv(plan.meta_ganancia_bcv)}</div>
                </li>
              ) : null}
              <li>
                <span className="dato__etiqueta">Entre lo que deja cada una</span>
                <div className="dato__valor">{formatearBcv(deja)}</div>
              </li>
              <li className="cadena__final">
                <span className="dato__etiqueta">Hacen falta</span>
                <div className="dato__valor dato__valor--grande">{formatearEntero(objetivo)} piezas</div>
                <div className="campo__pista">redondeado hacia arriba</div>
              </li>
            </ol>
          </div>
        </>
      ) : null}

      {/* ------------------------------------------------- lo que pido */}

      <h2 className="seccion-titulo">Lo que pagas cada mes</h2>
      <div className="tarjeta">
        <p className="campo__pista" style={{ marginBottom: 'var(--e-4)' }}>
          En dólares BCV: lo que pagas aquí en bolívares, dividido entre la tasa del BCV.
          Los muebles y los exhibidores se suman solos desde Inversiones y Lotes.
        </p>
        <div className="fila">{GASTOS.map(campo)}</div>
        <div className="fila">{TIENDA.map(campo)}</div>
      </div>

      <h2 className="seccion-titulo">Lo que quieres ganar</h2>
      <div className="tarjeta">
        <div className="fila">{campo(META)}</div>
      </div>

      <div className="acciones acciones--sueltas" style={{ marginTop: 'var(--e-5)' }}>
        <button type="button" className="boton boton--confirmar" disabled={!cambiado || guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando' : 'Guardar y recalcular'}
        </button>
        {cambiado ? (
          <button type="button" className="boton boton--secundario" onClick={() => void cargar()}>Descartar</button>
        ) : null}
      </div>

      {/* ---------------------------------------------------- el precio */}

      <h2 className="seccion-titulo">El precio</h2>
      <div className="tarjeta">
        {sugerido !== null && dx ? (
          <>
            <p className="prosa" style={{ marginBottom: 'var(--e-4)' }}>
              Para ganar {formatearBcv(dx.ganancia_objetivo_mes_usd, 0)} al mes vendiendo{' '}
              {formatearEntero(dx.volumen_mes)} piezas{' '}
              ({dx.volumen_origen === 'ventas' ? 'tu promedio real' : 'lo que estima el sistema'}),
              cada precio tiene que dejar un margen de <strong style={{ display: 'inline' }}>{formatearPorcentaje(sugerido)}</strong>.
            </p>
            <div className="rejilla rejilla--3">
              <div>
                <span className="dato__etiqueta">Margen que hace falta</span>
                <div className="dato__valor dato__valor--grande">{formatearPorcentaje(sugerido)}</div>
              </div>
              <div>
                <span className="dato__etiqueta">Pieza promedio</span>
                <div className="dato__valor">{formatearBcv(dx.precio_sugerido_promedio_bcv)}</div>
                <div className="campo__pista">
                  {formatearBs(precioEnBs(dx.precio_sugerido_promedio_bcv, tasa))} · hoy {formatearBcv(dx.precio_bcv_promedio)}
                </div>
              </div>
              <div>
                <span className="dato__etiqueta">El que usas</span>
                <div className="dato__valor">{formatearPorcentaje(num('margen_objetivo_pct'))}</div>
              </div>
            </div>
            {!usaSugerido ? (
              <div className="acciones acciones--sueltas" style={{ marginTop: 'var(--e-4)' }}>
                <button
                  type="button"
                  className="boton boton--secundario"
                  onClick={() => setValores((v) => ({ ...v, margen_objetivo_pct: String(sugerido) }))}
                >
                  Usar {formatearPorcentaje(sugerido)}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="campo__pista" style={{ marginBottom: 'var(--e-4)' }}>
            Pon tu meta de ganancia arriba y aquí te digo qué margen hace falta en cada precio.
          </p>
        )}
        <div className="fila" style={{ marginTop: 'var(--e-4)' }}>{campo(MARGEN)}</div>
        <p className="campo__pista">
          Es el margen con que el formulario de cada modelo sugiere su precio. Cambiarlo no
          toca los precios que ya están puestos.
        </p>
      </div>

      {/* -------------------------------------------- casi nunca se toca */}

      <details className="ayuda" style={{ marginTop: 'var(--e-6)' }}>
        <summary className="ayuda__titulo">Ajustes que casi nunca se tocan</summary>
        <div className="ayuda__cuerpo">
          <div className="fila">{AJUSTES.map(campo)}</div>
          {dx?.volumen_origen !== 'ventas' ? (
            <>
              <p className="campo__pista" style={{ margin: 'var(--e-4) 0' }}>
                Estos dos solo cuentan mientras no haya un mes de ventas: con ellos el sistema
                estima cuántas piezas vendes para repartir los gastos en el precio sugerido.
                Cuando cumplas un mes vendiendo, lo mide solo y desaparecen de aquí.
              </p>
              <div className="fila">{ESTIMADO.map(campo)}</div>
            </>
          ) : null}
          <p className="campo__pista" style={{ marginTop: 'var(--e-4)' }}>
            Estos también se guardan con el botón de arriba.
          </p>
        </div>
      </details>

      <Ayuda titulo="Si los números no te dan">
        <p>Solo hay cuatro palancas, y conviene moverlas en este orden:</p>
        <p>
          <strong>1 · Vender más caro por venta.</strong> Una pieza de grupo alto deja varias veces
          lo que deja una barata, con el mismo tiempo de atención y el mismo empaque. Es la palanca
          más rápida y no cuesta dinero.
        </p>
        <p>
          <strong>2 · Vender más piezas.</strong> Los gastos del mes son los mismos: cada pieza de más
          por encima del equilibrio es ganancia. Aquí ayudan el catálogo público y el descuento por cantidad.
        </p>
        <p>
          <strong>3 · Bajar gastos fijos.</strong> Cada dólar que sale del alquiler o los servicios
          baja las piezas que necesitas, todos los meses.
        </p>
        <p>
          <strong>4 · Subir precios.</strong> La última, no la primera: es la que la clienta sí nota.
        </p>
      </Ayuda>
    </div>
  );
}
