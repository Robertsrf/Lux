import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { Progreso } from '../../componentes/Progreso';
import { formatearBcv, formatearBinance, formatearDecimal, formatearFecha } from '../../lib/dinero';
import type { Inversion, Recuperacion } from '../../lib/tipos';

const CATEGORIAS = ['mobiliario', 'exhibidor', 'equipo', 'local', 'otro'];

/** Cada inversión en la moneda en que se pagó. */
const enSuMoneda = (i: Inversion) => (i.moneda === 'real' ? formatearBinance(i.monto_usd) : formatearBcv(i.monto_usd));

/**
 * Lo invertido y cuánto ha vuelto.
 *
 * DOS COSAS DISTINTAS, DOS BARRAS DISTINTAS
 *
 * La MERCANCÍA vuelve sola al venderla: cada pieza que sale devuelve lo
 * que costó. Se cuenta en dólares Binance, que es como se compró; así
 * "vendido" y "en vitrina" suman lo invertido sin que ninguna tasa se
 * cuele en la resta. Antes se restaba lo invertido a la tasa de hoy menos
 * lo vendido a la tasa de cada venta, y la barra no cuadraba.
 *
 * Los MUEBLES Y EXHIBIDORES vuelven de lo que sobra: lo que dejaron las
 * ventas menos el alquiler, los sueldos y los servicios de esos meses.
 * Antes se usaba una "ganancia" que ya traía restada la parte de los
 * muebles, y después se medía contra el total de los muebles: se pagaban
 * dos veces y la barra avanzaba a la mitad de lo real.
 *
 * Cuántas piezas vender al mes ya no se calcula aquí: vive en Costos, que
 * es la única cuenta. Antes esta pantalla tenía la suya, con otro
 * resultado.
 */
export function Inversiones() {
  const [lista, setLista] = useState<Inversion[]>([]);
  const [rec, setRec] = useState<Recuperacion | null>(null);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('mobiliario');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'bcv' | 'real'>('bcv');
  const [amortiza, setAmortiza] = useState(false);
  const [meses, setMeses] = useState('24');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [i, r] = await Promise.all([
      supabase.from('inversiones').select('*').order('fecha', { ascending: false }),
      supabase.from('v_recuperacion').select('*').maybeSingle(),
    ]);
    const fallo = i.error ?? r.error;
    setError(fallo ? mensajeDeError(fallo) : null);
    setLista((i.data as Inversion[] | null) ?? []);
    setRec((r.data as Recuperacion | null) ?? null);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function agregar(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('inversiones').insert({
      nombre: nombre.trim(),
      categoria,
      monto_usd: Number(monto),
      moneda,
      amortizar_meses: amortiza ? Number(meses) : null,
    });
    if (err) setError(mensajeDeError(err));
    else { setNombre(''); setMonto(''); await cargar(); }
  }

  async function borrar(inv: Inversion) {
    if (!window.confirm(`¿Quitar "${inv.nombre}" de las inversiones?`)) return;
    const { error: err } = await supabase.from('inversiones').delete().eq('id', inv.id);
    if (err) setError(mensajeDeError(err)); else await cargar();
  }

  if (cargando) return <Cargando texto="Calculando lo que ha vuelto" />;

  const sobra = rec ? Number(rec.ganancia_acumulada_usd) : 0;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Inversiones</h1>
          <p>Lo que pusiste en el negocio y cuánto ha vuelto.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="Algo no cuadró">{error}</Aviso> : null}

      {rec ? (
        <div className="tarjeta">
          <h2>Cuánto ha vuelto</h2>
          <hr className="divisor" />

          <div className="pila">
            <div>
              <Progreso
                titulo="Mercancía"
                pct={rec.mercancia_recuperada_pct}
                pie={`${formatearBinance(rec.mercancia_vendida_real_usd, 0)} vendidos de ${formatearBinance(rec.invertido_mercancia_real_usd, 0)} · quedan ${formatearBinance(rec.mercancia_en_vitrina_real_usd, 0)} en vitrina`}
              />
              <p className="campo__pista">
                En dólares Binance, como se compró. Vuelve sola al venderse: cada pieza que sale
                devuelve lo que costó.
              </p>
            </div>

            <div>
              <Progreso
                titulo="Muebles y exhibidores"
                pct={rec.activos_recuperado_pct}
                pie={`${formatearBcv(Math.max(sobra, 0), 0)} de ${formatearBcv(rec.invertido_activos_usd, 0)}`}
              />
              <p className="campo__pista">
                En dólares BCV. Vuelven de lo que sobra después de pagar el día a día.
              </p>
            </div>
          </div>

          <div className="panel">
            <span className="panel__titulo">De dónde sale lo que ha vuelto</span>
            <ol className="cadena">
              <li>
                <span className="dato__etiqueta">Las ventas dejaron</span>
                <div className="dato__valor">{formatearBcv(rec.contribucion_acumulada_usd, 0)}</div>
                <div className="campo__pista">
                  en {rec.piezas_vendidas} piezas, después de la mercancía y el empaque
                </div>
              </li>
              <li>
                <span className="dato__etiqueta">Menos el día a día</span>
                <div className="dato__valor">{formatearBcv(rec.gastos_operativos_acumulados_usd, 0)}</div>
                <div className="campo__pista">
                  alquiler, sueldos y servicios de {formatearDecimal(rec.meses_abierta)} meses
                  {' '}a {formatearBcv(rec.gastos_operativos_mes_usd, 0)} al mes
                </div>
              </li>
              <li className="cadena__final">
                <span className="dato__etiqueta">Ha vuelto</span>
                <div className={sobra < 0 ? 'dato__valor dato__valor--grande negativo' : 'dato__valor dato__valor--grande'}>
                  {formatearBcv(sobra, 0)}
                </div>
                <div className="campo__pista">
                  {sobra < 0 ? 'todavía no alcanza para el día a día' : 'para pagar lo invertido'}
                </div>
              </li>
            </ol>
            <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
              Los meses pasados se cuentan con los gastos de hoy: el sistema no guarda cuánto era el
              alquiler hace tres meses. Si subió o bajó, la cifra se corre un poco.
            </p>
          </div>

          <p className="campo__pista" style={{ marginTop: 'var(--e-4)' }}>
            Invertido en total: {formatearBcv(rec.invertido_total_usd, 0)}, todo llevado a
            dólares BCV con la brecha de hoy. Cuántas piezas vender al mes para cubrir los
            gastos está en <Link to="/admin/costos">Costos</Link>.
          </p>
        </div>
      ) : null}

      <Ayuda titulo="Solo seguirla o meterla al precio">
        <p>
          Cada inversión se puede llevar de dos maneras, y la diferencia es grande.
        </p>
        <p>
          <strong>Solo seguirla.</strong> No toca los precios. Se recupera de lo que sobra de las
          ventas, y la barra de arriba te dice cuánto va. Es lo sensato para lo que se compra una vez.
        </p>
        <p>
          <strong>Meterla al precio.</strong> Se reparte en los gastos de los meses que digas, así
          que sube el precio sugerido de todo y las piezas que necesitas vender. Se paga sola, pero
          te hace más caro mientras dure.
        </p>
        <p>
          <strong>Dónde la pagaste importa.</strong> Si la compraste aquí en bolívares es un dólar
          BCV; si la trajiste de afuera es un dólar Binance y hay que convertirla. Son cantidades de
          dinero distintas.
        </p>
      </Ayuda>

      <h2 className="seccion-titulo">Agregar inversión</h2>

      <form className="tarjeta" onSubmit={(e) => void agregar(e)}>
        <div className="fila">
          <Campo etiqueta="Qué compraste" htmlFor="i-nombre" pista="Vitrina 1, mueble del mostrador, aire acondicionado...">
            <input id="i-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Categoría" htmlFor="i-cat">
            <select id="i-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Dónde la pagaste" htmlFor="i-moneda">
            <select id="i-moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as 'bcv' | 'real')}>
              <option value="bcv">Aquí, en bolívares · $ BCV</option>
              <option value="real">Afuera · $ Binance</option>
            </select>
          </Campo>
          <Campo etiqueta={moneda === 'real' ? 'Cuánto costó · $ Binance' : 'Cuánto costó · $ BCV'} htmlFor="i-monto">
            <input id="i-monto" type="number" min="0.01" step="0.01" inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Campo>
        </div>

        <div className="panel">
          <span className="panel__titulo">Cómo se paga</span>
          <div className="metodos-pago">
            <button type="button" aria-pressed={!amortiza} onClick={() => setAmortiza(false)}>
              Solo seguirla
            </button>
            <button type="button" aria-pressed={amortiza} onClick={() => setAmortiza(true)}>
              Meterla al precio
            </button>
          </div>
          <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
            {amortiza
              ? 'Se reparte en los gastos de los meses que digas. Sube el precio sugerido y las piezas que necesitas vender, pero se paga sola.'
              : 'No toca los precios. Se recupera de lo que sobra de las ventas y la ves subir en la barra de arriba.'}
          </p>
          {amortiza ? (
            <div className="fila" style={{ marginTop: 'var(--e-4)' }}>
              <Campo etiqueta="En cuántos meses" htmlFor="i-meses">
                <input id="i-meses" type="number" min="1" step="1" value={meses} onChange={(e) => setMeses(e.target.value)} />
              </Campo>
            </div>
          ) : null}
        </div>

        <div className="acciones">
          <button type="submit" className="boton">Agregar</button>
        </div>
      </form>

      <h2 className="seccion-titulo">Lo que llevas invertido</h2>

      {lista.length === 0 ? (
        <Vacio titulo="Aún no has anotado ninguna inversión">
          <p>Agrega las vitrinas, los muebles y los equipos. Los exhibidores que vinieron en los lotes ya se cuentan solos.</p>
        </Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Qué</th><th>Categoría</th><th className="num">Costó</th>
                <th>Cómo se paga</th><th>Fecha</th><th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id}>
                  <td className="celda-nombre">{i.nombre}</td>
                  <td className="util">{i.categoria}</td>
                  {/* Cada fila en su moneda: aquí la columna mezcla las dos a
                      propósito, así que la etiqueta va en la cifra y no en la
                      cabecera. */}
                  <td className="num">{enSuMoneda(i)}</td>
                  <td>
                    {i.amortizar_meses
                      ? <span className="etiqueta etiqueta--alerta">En el precio · {i.amortizar_meses} meses</span>
                      : <span className="etiqueta">Se sigue aparte</span>}
                  </td>
                  <td>{formatearFecha(i.fecha)}</td>
                  <td>
                    <button type="button" className="boton boton--peligro boton--pequeno" onClick={() => void borrar(i)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
