import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearFecha, formatearPorcentaje, formatearUsd } from '../../lib/dinero';
import type { Equilibrio, Inversion, Recuperacion } from '../../lib/tipos';

const CATEGORIAS = ['mobiliario', 'exhibidor', 'equipo', 'local', 'otro'];

function Progreso({ titulo, hecho, total, pct, pie }: {
  titulo: string; hecho: number; total: number; pct: number | null; pie?: string;
}) {
  const p = Math.max(0, Math.min(pct ?? 0, 100));
  return (
    <div className="progreso">
      <div className="progreso__cabecera">
        <span className="progreso__titulo">{titulo}</span>
        <span className="progreso__cifra">{formatearPorcentaje(pct, 0)}</span>
      </div>
      <div
        className="progreso__riel"
        role="progressbar"
        aria-valuenow={Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={titulo}
      >
        <div className={p >= 100 ? 'progreso__relleno progreso__relleno--completo' : 'progreso__relleno'} style={{ width: `${p}%` }} />
      </div>
      <div className="progreso__pie">
        {formatearUsd(hecho)} de {formatearUsd(total)}{pie ? ` · ${pie}` : ''}
      </div>
    </div>
  );
}

/**
 * Lo invertido y cuánto ha vuelto.
 *
 * Cada inversión decide si se AMORTIZA —entra al costo de cada pieza y
 * sube los precios— o si solo se RECUPERA de la ganancia. Una vitrina
 * cara puede seguirse sin disparar la etiqueta de un anillo.
 */
export function Inversiones() {
  const [lista, setLista] = useState<Inversion[]>([]);
  const [rec, setRec] = useState<Recuperacion | null>(null);
  const [eq, setEq] = useState<Equilibrio | null>(null);
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
    const [i, r, e] = await Promise.all([
      supabase.from('inversiones').select('*').order('fecha', { ascending: false }),
      supabase.from('v_recuperacion').select('*').maybeSingle(),
      supabase.from('v_equilibrio').select('*').maybeSingle(),
    ]);
    if (i.error) setError(mensajeDeError(i.error));
    setLista((i.data as Inversion[] | null) ?? []);
    setRec((r.data as Recuperacion | null) ?? null);
    setEq((e.data as Equilibrio | null) ?? null);
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
    if (!window.confirm(`Quitar "${inv.nombre}" de las inversiones?`)) return;
    const { error: err } = await supabase.from('inversiones').delete().eq('id', inv.id);
    if (err) setError(mensajeDeError(err)); else await cargar();
  }

  if (cargando) return <Cargando texto="Calculando la recuperacion" />;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Inversiones</h1>
          <p>Lo que pusiste en el negocio y cuanto ha vuelto. Se recupera de la ganancia, no del precio de las piezas.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}

      {rec ? (
        <div className="tarjeta">
          <h2>Cuanto has recuperado</h2>
          <hr className="divisor" />

          <div className="pila">
            <Progreso
              titulo="Mercancia"
              hecho={Number(rec.mercancia_recuperada_usd)}
              total={Number(rec.invertido_mercancia_usd)}
              pct={rec.mercancia_recuperada_pct}
              pie={`quedan ${formatearUsd(rec.mercancia_en_vitrina_usd)} en vitrina`}
            />
            <Progreso
              titulo="Muebles y exhibidores"
              hecho={Math.max(Number(rec.ganancia_acumulada_usd), 0)}
              total={Number(rec.invertido_activos_usd)}
              pct={rec.activos_recuperado_pct}
              pie="se pagan con la ganancia acumulada"
            />
          </div>

          <div className="panel">
            <div className="rejilla rejilla--3">
              <div>
                <span className="dato__etiqueta">Invertido en total</span>
                <div className="dato__valor">{formatearUsd(rec.invertido_total_usd)}</div>
              </div>
              <div>
                <span className="dato__etiqueta">Ganancia acumulada</span>
                <div className={Number(rec.ganancia_acumulada_usd) < 0 ? 'dato__valor negativo' : 'dato__valor'}>
                  {formatearUsd(rec.ganancia_acumulada_usd)}
                </div>
                <div className="campo__pista">ya sin gastos</div>
              </div>
              <div>
                <span className="dato__etiqueta">Piezas vendidas</span>
                <div className="dato__valor">{rec.piezas_vendidas}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {eq ? (
        <div className="tarjeta" style={{ marginTop: 'var(--e-4)' }}>
          <h2>Cuanto hay que vender al mes</h2>
          <hr className="divisor" />
          {eq.piezas_para_equilibrio ? (
            <Aviso tono="neutro">
              Con lo que deja cada pieza hoy ({formatearUsd(eq.contribucion_por_pieza_usd)} por encima de su costo),
              necesitas vender <strong style={{ display: 'inline' }}>{eq.piezas_para_equilibrio} piezas al mes</strong> solo
              para tapar los {formatearUsd(eq.gastos_mes_usd)} de gastos. De ahi en adelante, todo es ganancia.
            </Aviso>
          ) : (
            <Aviso tono="alerta">
              Todavia no hay ventas suficientes para saber cuanto deja cada pieza. Tus gastos del mes
              son {formatearUsd(eq.gastos_mes_usd)}.
            </Aviso>
          )}
        </div>
      ) : null}

      <h2 className="seccion-titulo">Agregar inversion</h2>

      <form className="tarjeta" onSubmit={(e) => void agregar(e)}>
        <div className="fila">
          <Campo etiqueta="Que compraste" htmlFor="i-nombre" pista="Vitrina 1, mueble del mostrador, aire acondicionado...">
            <input id="i-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Categoria" htmlFor="i-cat">
            <select id="i-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Cuanto costo $" htmlFor="i-monto">
            <input id="i-monto" type="number" min="0.01" step="0.01" required value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Campo>
          <Campo etiqueta="Lo pagaste" htmlFor="i-moneda" pista="Aqui en bolivares son dolares BCV. Traido de afuera es dolar Binance.">
            <select id="i-moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as 'bcv' | 'real')}>
              <option value="bcv">Aqui, en bolivares</option>
              <option value="real">Afuera, en dolares Binance</option>
            </select>
          </Campo>
        </div>

        <div className="panel">
          <span className="panel__titulo">Como se paga</span>
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
              ? 'Se reparte en el costo de cada pieza durante los meses que digas. Sube los precios, pero se paga sola.'
              : 'No toca los precios. Se recupera de la ganancia y la ves subir en la barra de arriba.'}
          </p>
          {amortiza ? (
            <div className="fila" style={{ marginTop: 'var(--e-4)' }}>
              <Campo etiqueta="En cuantos meses" htmlFor="i-meses">
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
        <Vacio titulo="Aun no has anotado ninguna inversion">
          <p>Agrega las vitrinas, los muebles y los equipos. Los exhibidores que vinieron en los lotes ya se cuentan solos.</p>
        </Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Que</th><th>Categoria</th><th className="num">Monto</th>
                <th>Como se paga</th><th>Fecha</th><th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id}>
                  <td className="celda-nombre">{i.nombre}</td>
                  <td className="util">{i.categoria}</td>
                  <td className="num">
                    {formatearUsd(i.monto_usd)}
                    <div className="celda-nota">{i.moneda === 'real' ? 'Binance' : 'BCV'}</div>
                  </td>
                  <td>
                    {i.amortizar_meses
                      ? <span className="etiqueta etiqueta--alerta">En el precio · {i.amortizar_meses} meses</span>
                      : <span className="etiqueta">De la ganancia</span>}
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
