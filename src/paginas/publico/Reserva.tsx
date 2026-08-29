import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando } from '../../componentes/Piezas';
import { Wordmark } from '../../componentes/Marca';
import { cuentaRegresiva, formatearBs, formatearUsd, precioEnBs } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { useTasa } from '../../hooks/useTasa';
import type { ReservaVista } from '../../lib/tipos';

/**
 * La reserva de la clienta, abierta por su token. Solo muestra la suya:
 * ver_reserva() no devuelve nada de otras reservas ni ninguna cifra de costo.
 */
export function Reserva() {
  const { token } = useParams();
  const { tasa } = useTasa();
  const [reserva, setReserva] = useState<ReservaVista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [restante, setRestante] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    const { data, error: err } = await supabase.rpc('ver_reserva', { p_token: token });
    if (err) setError(mensajeDeError(err));
    else setReserva(data as unknown as ReservaVista);
    setCargando(false);
  }, [token]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Cuenta regresiva viva: la reserva vence sola a los 60 minutos.
  useEffect(() => {
    if (!reserva || reserva.estado !== 'abierta') { setRestante(null); return; }
    const tic = () => setRestante(cuentaRegresiva(reserva.expira_en));
    tic();
    const id = setInterval(tic, 1000);
    return () => clearInterval(id);
  }, [reserva]);

  async function accion(rpc: 'confirmar_reserva' | 'cancelar_reserva', mensaje: string) {
    setError(null);
    const { error: err } = await supabase.rpc(rpc, { p_token: token });
    if (err) setError(mensajeDeError(err));
    else { setAviso(mensaje); await cargar(); }
  }

  if (cargando) return <Cargando texto="Buscando tu pedido" />;

  return (
    <>
      <header className="barra barra--publica">
        <div className="barra__interior">
          <Wordmark tamano={24} />
          <Link to="/publico" className="sesion__quien">Ver el catalogo</Link>
        </div>
      </header>

      <div className="pagina pagina--angosta mostrador">
        {error ? <Aviso tono="error" titulo="No se pudo abrir el pedido">{error}</Aviso> : null}
        {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

        {reserva ? (
          <>
            <div className="encabezado-pagina">
              <div>
                <h1>Tu pedido</h1>
                <p>{reserva.cliente_nombre ? `A nombre de ${reserva.cliente_nombre}.` : 'Guarda este enlace para volver.'}</p>
              </div>
            </div>

            {reserva.estado === 'abierta' && restante ? (
              <Aviso tono="alerta" titulo="Apartado">
                Tus piezas quedan reservadas <strong style={{ display: 'inline' }}>{restante}</strong> mas.
                Confirma el pedido para que la tienda te escriba.
              </Aviso>
            ) : null}
            {reserva.estado === 'abierta' && !restante ? (
              <Aviso tono="error" titulo="El apartado vencio">
                Las piezas volvieron al catalogo. Arma el pedido otra vez.
              </Aviso>
            ) : null}
            {reserva.estado === 'confirmada' ? (
              <Aviso tono="exito" titulo="Pedido confirmado">
                La tienda ya lo esta armando. Te escribiran para cerrar el pago y el envio.
              </Aviso>
            ) : null}
            {reserva.estado === 'vencida' ? (
              <Aviso tono="error" titulo="El apartado vencio">Las piezas volvieron al catalogo.</Aviso>
            ) : null}
            {reserva.estado === 'cancelada' ? (
              <Aviso tono="neutro" titulo="Pedido cancelado">Puedes armar otro cuando quieras.</Aviso>
            ) : null}

            <div className="lineas-cobro">
              {reserva.items.map((i) => {
                const foto = urlPublicaFoto(i.foto_thumb_path);
                return (
                  <div className="linea-cobro" key={i.modelo_id}>
                    {foto ? <img className="linea-cobro__foto" src={foto} alt="" /> : <span className="linea-cobro__foto" />}
                    <div>
                      <div className="linea-cobro__nombre">{i.nombre}</div>
                      {i.variantes_nota ? <div className="linea-cobro__precio">{i.variantes_nota}</div> : null}
                    </div>
                    <span className="contador__valor">{i.cantidad}</span>
                  </div>
                );
              })}
            </div>

            <div className="total-cobro">
              <div>
                <span className="util secundario">{reserva.piezas} piezas al mayor</span>
                <div className="campo__pista">{formatearUsd(reserva.precio_por_pieza_usd)} por pieza</div>
              </div>
              <div>
                <div className="total-cobro__cifra">{formatearBs(precioEnBs(reserva.total_usd, tasa?.tasa_venta ?? null))}</div>
                <div className="total-cobro__referencia">{formatearUsd(reserva.total_usd)}</div>
              </div>
            </div>

            {reserva.estado === 'abierta' && restante ? (
              <div className="acciones">
                <button type="button" className="boton boton--confirmar" onClick={() => void accion('confirmar_reserva', 'Pedido confirmado. La tienda te escribira.')}>
                  Confirmar pedido
                </button>
                <button type="button" className="boton boton--secundario" onClick={() => void accion('cancelar_reserva', 'Pedido cancelado.')}>
                  Cancelar
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
