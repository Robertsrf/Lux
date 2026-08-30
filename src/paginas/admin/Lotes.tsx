import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearEntero, formatearFecha, formatearTasa, formatearUsd, previsualizarProrrateo } from '../../lib/dinero';
import type { LoteAdmin } from '../../lib/tipos';

const HOY = () => new Date().toISOString().slice(0, 10);

const FORM_VACIO = {
  id: null as number | null,
  codigo: '',
  fecha_llegada: HOY(),
  tasa_binance_compra: '',
  costo_mercancia_usd: '',
  costo_exhibidores_usd: '',
  costo_flete_usd: '',
  piezas_mercancia: '',
  unidades_exhibidores: '',
  notas: '',
};

/**
 * Cada lote sella la tasa Binance del dia de compra y no se toca nunca mas:
 * es un hecho historico. Nunca recalcules el costo de un lote viejo con una
 * tasa nueva.
 *
 * Los exhibidores son inversion de tienda (CAPEX), no mercancia: su costo y su
 * parte del flete no se cargan jamas al costo de las joyas.
 */
export function Lotes() {
  const [lotes, setLotes] = useState<LoteAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('v_lotes_admin')
      .select('id, codigo, fecha_llegada, tasa_binance_compra, costo_mercancia_usd, costo_exhibidores_usd, costo_flete_usd, piezas_mercancia, unidades_exhibidores, notas, flete_mercancia_usd, flete_exhibidores_usd, capex_total_usd, flete_por_unidad_usd, modelos_cargados')
      .order('fecha_llegada', { ascending: false });
    if (err) setError(mensajeDeError(err));
    setLotes((data as LoteAdmin[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  const vistaPrevia = useMemo(() => previsualizarProrrateo({
    costoMercanciaUsd: form.costo_mercancia_usd,
    costoExhibidoresUsd: form.costo_exhibidores_usd,
    costoFleteUsd: form.costo_flete_usd,
    piezasMercancia: form.piezas_mercancia,
    unidadesExhibidores: form.unidades_exhibidores,
  }), [form]);

  function cambiar<K extends keyof typeof FORM_VACIO>(campo: K, valor: (typeof FORM_VACIO)[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function editar(l: LoteAdmin) {
    setForm({
      id: l.id,
      codigo: l.codigo,
      fecha_llegada: l.fecha_llegada,
      tasa_binance_compra: String(l.tasa_binance_compra),
      costo_mercancia_usd: String(l.costo_mercancia_usd),
      costo_exhibidores_usd: String(l.costo_exhibidores_usd),
      costo_flete_usd: String(l.costo_flete_usd),
      piezas_mercancia: String(l.piezas_mercancia),
      unidades_exhibidores: String(l.unidades_exhibidores),
      notas: l.notas ?? '',
    });
    setExito(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setExito(null);

    const { error: err } = await supabase.rpc('admin_guardar_lote', {
      p_id: form.id,
      p_codigo: form.codigo,
      p_fecha_llegada: form.fecha_llegada,
      p_tasa_binance_compra: Number(form.tasa_binance_compra),
      p_costo_mercancia_usd: Number(form.costo_mercancia_usd || 0),
      p_costo_exhibidores_usd: Number(form.costo_exhibidores_usd || 0),
      p_costo_flete_usd: Number(form.costo_flete_usd || 0),
      p_piezas_mercancia: Math.trunc(Number(form.piezas_mercancia || 0)),
      p_unidades_exhibidores: Math.trunc(Number(form.unidades_exhibidores || 0)),
      p_notas: form.notas || null,
    });

    if (err) setError(mensajeDeError(err));
    else {
      setExito(form.id ? 'Lote actualizado. Se recalculo el flete de sus modelos.' : 'Lote registrado con su tasa sellada.');
      setForm({ ...FORM_VACIO, fecha_llegada: HOY() });
      await recargar();
    }
    setGuardando(false);
  }

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Lotes</h1>
          <p>Cada lote sella la tasa Binance del dia de compra. Ese costo queda congelado en dolares para siempre.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar el lote">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      <form className="tarjeta" onSubmit={(e) => void guardar(e)}>
        <h2>{form.id ? `Editar lote ${form.codigo}` : 'Registrar lote'}</h2>
        <hr className="divisor" />

        <div className="fila">
          <Campo etiqueta="Codigo" htmlFor="l-codigo" pista="Si lo dejas vacio, el sistema lo genera.">
            <input id="l-codigo" value={form.codigo} onChange={(e) => cambiar('codigo', e.target.value)} maxLength={30} />
          </Campo>
          <Campo etiqueta="Fecha de llegada" htmlFor="l-fecha">
            <input id="l-fecha" type="date" required value={form.fecha_llegada} onChange={(e) => cambiar('fecha_llegada', e.target.value)} />
          </Campo>
          <Campo
            etiqueta="Tasa Binance de compra"
            htmlFor="l-tasa"
            pista={form.id ? 'Sellada: la tasa de un lote es historia y no se edita.' : 'Se sella al guardar y no se puede cambiar despues.'}
          >
            <input
              id="l-tasa" type="number" step="0.0001" min="0.0001" required
              disabled={form.id !== null}
              value={form.tasa_binance_compra}
              onChange={(e) => cambiar('tasa_binance_compra', e.target.value)}
            />
          </Campo>
        </div>

        <div className="fila">
          <Campo etiqueta="Costo de mercancia $" htmlFor="l-cm">
            <input id="l-cm" type="number" step="0.0001" min="0" value={form.costo_mercancia_usd} onChange={(e) => cambiar('costo_mercancia_usd', e.target.value)} />
          </Campo>
          <Campo etiqueta="Costo de exhibidores $" htmlFor="l-ce" pista="Inversion de tienda. No entra al costo de las joyas.">
            <input id="l-ce" type="number" step="0.0001" min="0" value={form.costo_exhibidores_usd} onChange={(e) => cambiar('costo_exhibidores_usd', e.target.value)} />
          </Campo>
          <Campo etiqueta="Flete total $" htmlFor="l-fl">
            <input id="l-fl" type="number" step="0.0001" min="0" value={form.costo_flete_usd} onChange={(e) => cambiar('costo_flete_usd', e.target.value)} />
          </Campo>
        </div>

        <div className="fila">
          <Campo etiqueta="Piezas de joyeria que vinieron" htmlFor="l-pm" pista="Todas las del envio, aunque todavia no las hayas cargado.">
            <input id="l-pm" type="number" step="1" min="0" value={form.piezas_mercancia} onChange={(e) => cambiar('piezas_mercancia', e.target.value)} />
          </Campo>
          <Campo etiqueta="Exhibidores que vinieron" htmlFor="l-pe" pista="Tambien son bultos: pagan su parte del flete.">
            <input id="l-pe" type="number" step="1" min="0" value={form.unidades_exhibidores} onChange={(e) => cambiar('unidades_exhibidores', e.target.value)} />
          </Campo>
        </div>

        <Campo etiqueta="Notas" htmlFor="l-notas">
          <textarea id="l-notas" value={form.notas} onChange={(e) => cambiar('notas', e.target.value)} />
        </Campo>

        <div className="panel">
          <span className="panel__titulo">Reparto del flete (previsualizacion)</span>
          <div className="rejilla rejilla--3">
            <div>
              <span className="dato__etiqueta">A mercancia</span>
              <div className="dato__valor">{formatearUsd(vistaPrevia.fleteMercanciaUsd)}</div>
            </div>
            <div>
              <span className="dato__etiqueta">A exhibidores</span>
              <div className="dato__valor">{formatearUsd(vistaPrevia.fleteExhibidoresUsd)}</div>
            </div>
            <div>
              <span className="dato__etiqueta">CAPEX de tienda</span>
              <div className="dato__valor">{formatearUsd(vistaPrevia.capexTiendaUsd)}</div>
            </div>
            <div>
              <span className="dato__etiqueta">Flete por bulto</span>
              <div className="cifra">{vistaPrevia.fletePorUnidadUsd === null ? '—' : formatearUsd(vistaPrevia.fletePorUnidadUsd, 4)}</div>
            </div>
          </div>
          <p className="campo__pista">
            El flete se divide entre todos los bultos: cada joya y cada exhibidor pagan lo mismo.
            La cifra que manda es la que calcula la base al guardar.
          </p>
        </div>

        <div className="acciones">
          <button type="submit" className="boton boton--confirmar" disabled={guardando}>
            {guardando ? 'Guardando' : form.id ? 'Guardar cambios' : 'Registrar lote'}
          </button>
          {form.id ? (
            <button type="button" className="boton boton--secundario" onClick={() => setForm({ ...FORM_VACIO, fecha_llegada: HOY() })}>
              Cancelar edicion
            </button>
          ) : null}
        </div>
      </form>

      <h2 className="seccion-titulo">Lotes registrados</h2>

      {cargando ? <Cargando /> : lotes.length === 0 ? (
        <Vacio titulo="Aun no hay lotes">
          <p>Registra el primero arriba. Sin lote, un modelo no puede repartir flete.</p>
        </Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Llegada</th>
                <th className="num">Tasa sellada</th>
                <th className="num">Mercancia</th>
                <th className="num">Flete a mercancia</th>
                <th className="num">$/bulto</th>
                <th className="num">CAPEX tienda</th>
                <th className="num">Modelos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id}>
                  <td className="util">{l.codigo}</td>
                  <td>{formatearFecha(l.fecha_llegada)}</td>
                  <td className="num">{formatearTasa(l.tasa_binance_compra)}</td>
                  <td className="num">{formatearUsd(l.costo_mercancia_usd)}</td>
                  <td className="num">{formatearUsd(l.flete_mercancia_usd)}</td>
                  <td className="num">{l.flete_por_unidad_usd === null ? '—' : formatearUsd(l.flete_por_unidad_usd, 4)}</td>
                  <td className="num">{formatearUsd(l.capex_total_usd)}</td>
                  <td className="num">{l.modelos_cargados}</td>
                  <td>
                    <button type="button" className="boton boton--secundario" onClick={() => editar(l)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={9}>
                  Bultos del ultimo lote: {formatearEntero((lotes[0]?.piezas_mercancia ?? 0) + (lotes[0]?.unidades_exhibidores ?? 0))} ·
                  el CAPEX no se carga al costo de las joyas
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
