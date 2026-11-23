import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { formatearDescuento, leerCifra } from '../lib/dinero';
import { Aviso, Campo } from './Piezas';

/**
 * El descuento fijo de una clienta, en su ficha (esquema-descuento-clienta.sql).
 *
 * Lo pone SOLO el administrador (`admin_descuento_cliente`): en el
 * mostrador, al elegir su ficha, cada pieza sale a la etiqueta menos ese %,
 * nunca por debajo de su mínimo. La vendedora lo lee para saber que esta
 * clienta lo tiene; no lo cambia.
 *
 * Se lee aparte de la ficha: sin el #70 la columna no existe, y entonces
 * esto no sale y la ficha carga igual.
 */
export function DescuentoClienta({ clienteId, esAdmin }: { clienteId: number; esAdmin: boolean }) {
  const [datos, setDatos] = useState<{ descuento_pct: number | null; es_revendedor: string | null } | null>(null);
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('v_clientes').select('descuento_pct, es_revendedor').eq('id', clienteId).maybeSingle();
    if (err || !data) { setDatos(null); return; }
    const fila = data as { descuento_pct: number | null; es_revendedor: string | null };
    setDatos({ descuento_pct: fila.descuento_pct === null ? null : Number(fila.descuento_pct), es_revendedor: fila.es_revendedor });
  }, [clienteId]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (datos === null) return null;
  const pct = datos.descuento_pct;
  // La vendedora solo lo ve si hay algo que decir.
  if (!esAdmin && pct === null && !datos.es_revendedor) return null;

  async function guardar(nuevo: number | null) {
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.rpc('admin_descuento_cliente', { p_cliente_id: clienteId, p_pct: nuevo });
    setGuardando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    setEditando(false);
    await cargar();
  }

  function enviar() {
    const t = texto.trim();
    if (t === '') { void guardar(null); return; }
    const n = leerCifra(t);
    if (n === null || n <= 0 || n >= 100) {
      setError('Escribe el descuento en números, entre 0 y 100, por ejemplo 20. Vacío, no tiene descuento.');
      return;
    }
    void guardar(n);
  }

  return (
    <div className="panel">
      <span className="panel__titulo">Descuento de clienta</span>
      {datos.es_revendedor ? <p>Es la revendedora {datos.es_revendedor}.</p> : null}
      {editando ? (
        <>
          <Campo
            etiqueta="Descuento fijo · %"
            htmlFor="cli-descuento"
            pista="En el mostrador, sobre la etiqueta de cada pieza y nunca por debajo de su mínimo. Vacío: sin descuento."
            error={error}
          >
            <input
              id="cli-descuento"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
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
          <p>
            {pct === null
              ? 'Sin descuento: paga la etiqueta, o el descuento por cantidad.'
              : `Tiene ${formatearDescuento(pct)} de descuento en cada pieza, en la venta y en el apartado del mostrador. Con el descuento por cantidad o un código manda el mayor.`}
          </p>
          {esAdmin ? (
            <button
              type="button"
              className="boton boton--secundario boton--pequeno"
              onClick={() => { setTexto(pct === null ? '' : String(pct).replace('.', ',')); setEditando(true); }}
            >
              {pct === null ? 'Ponerle un descuento' : 'Cambiar el descuento'}
            </button>
          ) : null}
          {error ? <Aviso tono="error" titulo="No se guardó">{error}</Aviso> : null}
        </>
      )}
    </div>
  );
}
