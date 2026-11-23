import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../lib/supabase';
import { useBuscarClientes } from '../hooks/useClientes';
import { Campo } from './Piezas';

/**
 * Un revendedor es también una clienta del maestro
 * (`revendedores.cliente_id`, esquema-descuento-clienta.sql): lo que compra
 * en la tienda sale en su ficha, y de ahí cuelgan su crédito y su
 * inventario (fases 4 y 5). El descuento de clienta se pone en su ficha,
 * aparte del suyo de revendedor.
 *
 * Solo enlaza fichas que ya existen: si no tiene, se registra primero en
 * Clientes (con su cédula, que es lo que evita dos fichas de la misma
 * persona).
 */
export function FichaDeRevendedor({ revendedorId, clienteId, clienteNombre, alCambiar }: {
  revendedorId: number;
  clienteId: number | null;
  clienteNombre: string | null;
  alCambiar: (aviso: string) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { texto, setTexto, resultados, cargando } = useBuscarClientes(6, true);

  async function enlazar(id: number | null, nombre: string | null) {
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.rpc('admin_enlazar_cliente_revendedor', {
      p_revendedor_id: revendedorId, p_cliente_id: id,
    });
    setGuardando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    setBuscando(false);
    setTexto('');
    alCambiar(id === null ? 'Se soltó su ficha de clienta.' : `Enlazado con la ficha de ${nombre ?? 'la clienta'}.`);
  }

  if (!buscando) {
    return (
      <p className="ficha-persona__dato">
        {clienteId !== null ? (
          <>
            Su ficha de clienta: <Link to={`/clientes/${clienteId}`}>{clienteNombre ?? 'abrir'}</Link>.{' '}
            <button type="button" className="boton boton--secundario boton--pequeno" disabled={guardando}
              onClick={() => void enlazar(null, null)}>
              Soltar
            </button>
          </>
        ) : (
          <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setBuscando(true)}>
            Enlazar con su ficha de clienta
          </button>
        )}
        {error ? <span className="campo__error"> {error}</span> : null}
      </p>
    );
  }

  return (
    <div className="cliente-buscador">
      <Campo etiqueta="Su ficha de clienta: cédula o nombre" htmlFor={`rv-cli-${revendedorId}`} error={error}>
        <input
          id={`rv-cli-${revendedorId}`}
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </Campo>
      {texto.trim() ? (
        <div className="cliente-resultados">
          {resultados.map((c) => (
            <button type="button" className="cliente-resultado" key={c.id} disabled={guardando}
              onClick={() => void enlazar(c.id, c.nombre_completo)}>
              <span className="cliente-resultado__nombre">{c.nombre_completo}</span>
              <span className="cliente-resultado__dato">{c.cedula ? `C.I. ${c.cedula}` : 'Sin cédula'}</span>
            </button>
          ))}
          {!cargando && resultados.length === 0 ? (
            <p className="campo__pista">Ninguna ficha con eso. Regístrala primero en Clientes.</p>
          ) : null}
        </div>
      ) : null}
      <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => { setBuscando(false); setError(null); }}>
        Cancelar
      </button>
    </div>
  );
}
