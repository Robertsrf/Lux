import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { formatearBcv, formatearFecha, leerCifra } from '../lib/dinero';
import type { CreditoDeClienta } from '../lib/tipos';
import { Aviso, Campo } from './Piezas';

/**
 * El crédito de una clienta, en su ficha (esquema-credito.sql, #71).
 *
 * Lo da SOLO el administrador (`admin_fijar_credito`): cuántos días tiene
 * para pagar una venta a crédito y, si él quiere, hasta cuánto puede deber
 * a la vez. Ninguna cifra viene del código: las escribe él. Con crédito, el
 * mostrador ofrece "A crédito" al elegir su ficha. La vendedora lo lee.
 *
 * Se lee aparte (`credito_de_clienta`): sin el #71 la función no existe, y
 * entonces esto no sale y la ficha carga igual.
 */
export function CreditoClienta({ clienteId, esAdmin }: { clienteId: number; esAdmin: boolean }) {
  const [datos, setDatos] = useState<CreditoDeClienta | null>(null);
  const [dias, setDias] = useState('');
  const [tope, setTope] = useState('');
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('credito_de_clienta', { p_cliente_id: clienteId });
    const fila = ((data as CreditoDeClienta[] | null) ?? [])[0];
    if (err || !fila) { setDatos(null); return; }
    setDatos({
      dias: fila.dias === null ? null : Number(fila.dias),
      tope_usd: fila.tope_usd === null ? null : Number(fila.tope_usd),
      debe_bcv: Number(fila.debe_bcv),
      queda_bcv: fila.queda_bcv === null ? null : Number(fila.queda_bcv),
      vencidas: Number(fila.vencidas),
      vencida_desde: fila.vencida_desde,
    });
  }, [clienteId]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (datos === null) return null;
  // La vendedora solo lo ve si hay algo que decir.
  if (!esAdmin && datos.dias === null && datos.debe_bcv <= 0) return null;

  async function guardar(nuevosDias: number | null, nuevoTope: number | null) {
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.rpc('admin_fijar_credito', {
      p_cliente_id: clienteId, p_dias: nuevosDias, p_tope_usd: nuevoTope,
    });
    setGuardando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    setEditando(false);
    await cargar();
  }

  function enviar() {
    const d = dias.trim();
    if (d === '') { void guardar(null, null); return; }
    const n = Number(d);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      setError('Escribe los días en números enteros, por ejemplo 10. Vacío: sin crédito.');
      return;
    }
    const t = tope.trim();
    let topeUsd: number | null = null;
    if (t !== '') {
      const leido = leerCifra(t);
      if (leido === null || leido <= 0) {
        setError('Escribe el tope en dólares BCV, por ejemplo 150. Vacío: sin tope.');
        return;
      }
      topeUsd = leido;
    }
    void guardar(n, topeUsd);
  }

  const resumen = datos.dias === null
    ? 'Sin crédito: paga al llevarse las piezas, o aparta.'
    : `Crédito de ${datos.dias} ${datos.dias === 1 ? 'día' : 'días'}`
      + (datos.tope_usd === null ? ', sin tope.' : `, hasta ${formatearBcv(datos.tope_usd)} a la vez.`);

  return (
    <div className="panel">
      <span className="panel__titulo">Crédito</span>
      {editando ? (
        <>
          <Campo
            etiqueta="Días para pagar"
            htmlFor="cli-credito-dias"
            pista="Se lleva las piezas hoy y paga en estos días. Vacío: sin crédito."
            error={null}
          >
            <input
              id="cli-credito-dias"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
            />
          </Campo>
          <Campo
            etiqueta="Tope · $ BCV"
            htmlFor="cli-credito-tope"
            pista="Lo máximo que puede deber a la vez. Vacío: sin tope."
            error={error}
          >
            <input
              id="cli-credito-tope"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={tope}
              onChange={(e) => setTope(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
            />
          </Campo>
          <div className="grupo-botones">
            <button type="button" className="boton" disabled={guardando} onClick={enviar}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="boton boton--secundario" disabled={guardando} onClick={() => { setEditando(false); setError(null); }}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{resumen}</p>
          {datos.debe_bcv > 0 ? (
            <p>
              Debe {formatearBcv(datos.debe_bcv)}
              {datos.vencidas > 0 && datos.vencida_desde
                ? `; ${datos.vencidas === 1 ? 'una venta venció' : `${datos.vencidas} ventas vencieron`} (la primera, el ${formatearFecha(datos.vencida_desde)}).`
                : '.'}
            </p>
          ) : null}
          {esAdmin ? (
            <div className="grupo-botones">
              <button
                type="button"
                className="boton boton--secundario boton--pequeno"
                onClick={() => {
                  setDias(datos.dias === null ? '' : String(datos.dias));
                  setTope(datos.tope_usd === null ? '' : String(datos.tope_usd).replace('.', ','));
                  setEditando(true);
                }}
              >
                {datos.dias === null ? 'Darle crédito' : 'Cambiar el crédito'}
              </button>
              {datos.dias !== null ? (
                <button
                  type="button"
                  className="boton boton--secundario boton--pequeno"
                  disabled={guardando}
                  onClick={() => { if (window.confirm('¿Quitarle el crédito? Lo que ya debe sigue igual.')) void guardar(null, null); }}
                >
                  Quitar el crédito
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? <Aviso tono="error" titulo="No se guardó">{error}</Aviso> : null}
        </>
      )}
    </div>
  );
}
