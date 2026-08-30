import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando } from '../../componentes/Piezas';
import { Wordmark } from '../../componentes/Marca';
import { cuentaRegresiva, formatearBs, formatearPorcentaje, formatearUsd, precioEnBs } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { useTasa } from '../../hooks/useTasa';
import { useTextos } from '../../hooks/useTextos';
import type { ReservaVista } from '../../lib/tipos';

/**
 * La reserva de la clienta, abierta por su token. Solo muestra la suya:
 * ver_reserva() no devuelve nada de otras reservas ni ninguna cifra de costo.
 */
export function Reserva() {
  const { token } = useParams();
  const { tasa } = useTasa();
  const textos = useTextos();
  const [reserva, setReserva] = useState<ReservaVista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [restante, setRestante] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<'pago_movil' | 'transferencia' | 'efectivo_bs'>('pago_movil');
  const [referencia, setReferencia] = useState('');
  const [fechaPago, setFechaPago] = useState('');
  const [cedulaPago, setCedulaPago] = useState('');
  const [telPago, setTelPago] = useState('');
  const [pagando, setPagando] = useState(false);

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

  async function reportarPago() {
    setPagando(true);
    setError(null);
    const conReferencia = metodo !== 'efectivo_bs';
    const { error: err } = await supabase.rpc('reportar_pago', {
      p_token: token,
      p_metodo: metodo,
      p_referencia: conReferencia ? referencia : null,
      p_fecha: conReferencia ? fechaPago || null : null,
      p_cedula: conReferencia ? cedulaPago : null,
      p_telefono: conReferencia ? telPago : null,
    });
    if (err) setError(mensajeDeError(err));
    else { setAviso('Listo. La tienda comprueba el pago y te escribe.'); await cargar(); }
    setPagando(false);
  }

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
          <Wordmark alto={40} />
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
                Paga y carga los datos aqui abajo para cerrarlo.
              </Aviso>
            ) : null}
            {reserva.estado === 'abierta' && !restante ? (
              <Aviso tono="error" titulo="El apartado vencio">
                Las piezas volvieron al catalogo. Arma el pedido otra vez.
              </Aviso>
            ) : null}
            {reserva.estado === 'confirmada' ? (
              <Aviso tono="exito" titulo="Pedido confirmado">
                La tienda comprueba tu pago y te escribe. Guarda este enlace.
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
                <div className="campo__pista">
                  Valen {formatearBs(precioEnBs(reserva.subtotal_usd, tasa))}
                  {reserva.descuento_pct ? `, menos ${formatearPorcentaje(reserva.descuento_pct)} de descuento` : ''}
                </div>
              </div>
              <div>
                <div className="total-cobro__cifra">{formatearBs(precioEnBs(reserva.total_usd, tasa))}</div>
                <div className="total-cobro__referencia">{formatearUsd(reserva.total_usd)}</div>
              </div>
            </div>

            {reserva.pago_reportado_en ? (
              <section className="panel">
                <span className="panel__titulo">Tu pago</span>
                <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
                  {reserva.pago_metodo === 'efectivo_bs'
                    ? 'Pagas en efectivo al retirar. Te esperamos con tu cedula.'
                    : `Referencia ${reserva.pago_referencia ?? ''} del ${reserva.pago_fecha ?? ''}. La tienda la comprueba en su banco y te escribe.`}
                </p>
              </section>
            ) : reserva.estado === 'abierta' && restante ? (
              <>
                <h2 className="seccion-titulo">Ahora el pago</h2>

                <section className="panel">
                  <span className="panel__titulo">A donde pagar</span>
                  <p className="campo__pista" style={{ marginTop: 'var(--e-3)', whiteSpace: 'pre-line' }}>
                    {textos.datos_pago?.trim()
                      || 'Escribele a la tienda por WhatsApp y te pasan los datos para pagar.'}
                  </p>
                </section>

                <div className="panel">
                  <span className="panel__titulo">Como pagaste</span>
                  <div className="metodos-pago" style={{ marginTop: 'var(--e-3)' }}>
                    <button type="button" aria-pressed={metodo === 'pago_movil'} onClick={() => setMetodo('pago_movil')}>
                      Pago movil
                    </button>
                    <button type="button" aria-pressed={metodo === 'transferencia'} onClick={() => setMetodo('transferencia')}>
                      Transferencia
                    </button>
                    {/* El efectivo solo tiene sentido si viene a la tienda. */}
                    {reserva.entrega !== 'envio' ? (
                      <button type="button" aria-pressed={metodo === 'efectivo_bs'} onClick={() => setMetodo('efectivo_bs')}>
                        Efectivo al retirar
                      </button>
                    ) : null}
                  </div>
                </div>

                {metodo === 'efectivo_bs' ? (
                  <p className="campo__pista">
                    Pagas cuando vengas a retirar. Apartamos tus piezas mientras tanto.
                  </p>
                ) : (
                  <>
                    <div className="fila">
                      <Campo etiqueta="Numero de referencia" htmlFor="p-ref">
                        <input id="p-ref" inputMode="numeric" value={referencia} onChange={(e) => setReferencia(e.target.value)} required />
                      </Campo>
                      <Campo etiqueta="Fecha del pago" htmlFor="p-fecha">
                        <input id="p-fecha" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} required />
                      </Campo>
                    </div>
                    <div className="fila">
                      <Campo etiqueta="Cedula de quien pago" htmlFor="p-ced" pista="Puede ser otra persona, no hay problema.">
                        <input id="p-ced" inputMode="numeric" value={cedulaPago} onChange={(e) => setCedulaPago(e.target.value)} required />
                      </Campo>
                      <Campo etiqueta="Telefono de quien pago" htmlFor="p-tel">
                        <input id="p-tel" type="tel" value={telPago} onChange={(e) => setTelPago(e.target.value)} required />
                      </Campo>
                    </div>
                  </>
                )}

                <div className="acciones">
                  <button type="button" className="boton boton--confirmar" disabled={pagando} onClick={() => void reportarPago()}>
                    {pagando ? 'Enviando' : metodo === 'efectivo_bs' ? 'Confirmar el pedido' : 'Confirmar el pago'}
                  </button>
                  <button type="button" className="boton boton--secundario" onClick={() => void accion('cancelar_reserva', 'Pedido cancelado.')}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
