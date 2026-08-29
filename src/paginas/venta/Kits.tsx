import { useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, ResumenErrores, Vacio } from '../../componentes/Piezas';
import { aMonto, deMonto, formatearBs, formatearUsd, porCantidad, precioEnBs } from '../../lib/dinero';
import { useTasa } from '../../hooks/useTasa';
import { METODOS_PAGO } from '../../lib/tipos';
import type { Kit, MetodoPago } from '../../lib/tipos';

/**
 * Venta al mayor con kits fijos: elegir el kit y confirmar. Un solo
 * movimiento, no cincuenta toques.
 *
 * El precio del kit se define en DOLARES POR PIEZA, nunca como porcentaje de
 * descuento sobre el detal: con porcentaje, al mover la tasa el descuento se
 * descuadra solo.
 *
 * Los minimos de mayoreo los valida la base de datos, no este formulario.
 */
export function Kits() {
  const { tasa } = useTasa();
  const [kits, setKits] = useState<Kit[]>([]);
  const [elegido, setElegido] = useState<Kit | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [cliente, setCliente] = useState('');
  const [cargando, setCargando] = useState(true);
  const [vendiendo, setVendiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('kits')
        .select('id, nombre, tipo, precio_por_pieza_usd, n_piezas, descripcion, activo')
        .eq('activo', true)
        .order('nombre');
      if (err) setError(mensajeDeError(err));
      setKits((data as Kit[] | null) ?? []);
      setCargando(false);
    })();
  }, []);

  async function vender() {
    if (!elegido || !metodo) return;
    setVendiendo(true);
    setError(null);
    setExito(null);

    const { data, error: err } = await supabase.rpc('registrar_venta_kit', {
      p_kit_id: elegido.id,
      p_metodo: metodo,
      p_ubicacion_id: null,
      p_cliente_nombre: cliente.trim() || null,
      p_cliente_telefono: null,
      p_notas: null,
    });

    if (err) setError(mensajeDeError(err));
    else {
      setExito(`Venta registrada. Numero ${data}.`);
      setElegido(null);
      setMetodo(null);
      setCliente('');
    }
    setVendiendo(false);
  }

  if (cargando) return <Cargando texto="Buscando kits" />;

  const totalUsd = elegido ? deMonto(porCantidad(aMonto(elegido.precio_por_pieza_usd), elegido.n_piezas)) : null;

  return (
    <div className="pagina pagina--angosta mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Venta al mayor</h1>
          <p>Elige el kit y confirma. Descuenta todas sus piezas de una vez.</p>
        </div>
      </div>

      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}
      {error ? <ResumenErrores titulo="No se registro la venta">{error}</ResumenErrores> : null}

      {kits.length === 0 ? (
        <Vacio titulo="Aun no hay kits armados">
          <p>Un administrador tiene que crear los kits antes de poder venderlos.</p>
        </Vacio>
      ) : (
        <div className="pila">
          {kits.map((k) => {
            const total = deMonto(porCantidad(aMonto(k.precio_por_pieza_usd), k.n_piezas));
            const activo = elegido?.id === k.id;
            return (
              <div className="tarjeta" key={k.id} style={activo ? { borderColor: 'var(--oro-arena)', borderWidth: 2 } : undefined}>
                <h2>{k.nombre}</h2>
                <hr className="divisor" />
                {k.descripcion ? <p className="prosa">{k.descripcion}</p> : null}

                <div className="rejilla rejilla--3">
                  <div>
                    <span className="dato__etiqueta">Piezas</span>
                    <div className="dato__valor">{k.n_piezas}</div>
                  </div>
                  <div>
                    <span className="dato__etiqueta">Por pieza</span>
                    <div className="dato__valor">{formatearUsd(k.precio_por_pieza_usd)}</div>
                  </div>
                  <div>
                    <span className="dato__etiqueta">Total</span>
                    <div className="dato__valor">{formatearBs(precioEnBs(total, tasa))}</div>
                    <div className="campo__pista">{formatearUsd(total)}</div>
                  </div>
                </div>

                <div className="acciones">
                  <button
                    type="button"
                    className={activo ? 'boton boton--confirmar' : 'boton boton--secundario'}
                    onClick={() => { setElegido(activo ? null : k); setError(null); setExito(null); }}
                  >
                    {activo ? 'Kit elegido' : 'Elegir este kit'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {elegido ? (
        <>
          <h2 className="seccion-titulo">Como paga</h2>
          <div className="metodos-pago">
            {METODOS_PAGO.map((m) => (
              <button key={m.valor} type="button" aria-pressed={metodo === m.valor} onClick={() => setMetodo(m.valor)}>
                {m.texto}
              </button>
            ))}
          </div>

          <div className="total-cobro" style={{ marginTop: 'var(--e-5)' }}>
            <span className="util secundario">Total del kit</span>
            <div className="total-cobro__cifra">{formatearBs(precioEnBs(totalUsd, tasa))}</div>
          </div>

          <div className="acciones acciones--sueltas">
            <button
              type="button"
              className="boton boton--confirmar"
              disabled={!metodo || vendiendo}
              onClick={() => void vender()}
            >
              {vendiendo ? 'Registrando' : 'Registrar venta'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
