import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando } from '../../componentes/Piezas';
import { Wordmark } from '../../componentes/Marca';
import { PagoMovil } from '../../componentes/PagoMovil';
import { PagosHechos, ReportarPago } from '../../componentes/ReportarPago';
import {
  bsDeBcv, cuentaRegresiva, formatearBcv, formatearBs, formatearFechaHora, formatearPorcentaje, precioEnBs,
} from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { nombreConVariante } from '../../lib/familias';
import { enlaceWhatsAppA, mensajeDePedido, referenciaPedido } from '../../lib/enlaces';
import { enlaceReserva } from '../../lib/revendedor';
import { useTasa } from '../../hooks/useTasa';
import { useTextos } from '../../hooks/useTextos';
import { BotonLetraGrande } from '../../componentes/LetraGrande';
import type { ReservaVista } from '../../lib/tipos';

/**
 * El pedido de la clienta, abierto por su token. Solo muestra el suyo:
 * ver_reserva() no devuelve nada de otros pedidos ni ninguna cifra de costo.
 *
 * Aquí paga: completo, o al menos el mínimo para apartar sus piezas unos
 * días y pagar lo demás por partes. Cada pago lo reporta con su referencia
 * y la tienda lo comprueba en su banco; aquí ve cuáles llegaron y cuánto le
 * falta. Los pedidos de antes del apartado siguen con su formulario de
 * siempre: un solo pago, sin monto.
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

  const cargar = useCallback(async () => {
    if (!token) return;
    const { data, error: err } = await supabase.rpc('ver_reserva', { p_token: token });
    if (err) setError(mensajeDeError(err));
    else setReserva(data as unknown as ReservaVista);
    setCargando(false);
  }, [token]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Cuenta regresiva viva mientras espera el primer pago.
  useEffect(() => {
    if (!reserva || reserva.estado !== 'abierta') { setRestante(null); return; }
    const tic = () => setRestante(cuentaRegresiva(reserva.expira_en));
    tic();
    const id = setInterval(tic, 1000);
    return () => clearInterval(id);
  }, [reserva]);

  async function cancelar() {
    if (!window.confirm('¿Cancelar tu pedido? Las piezas vuelven al catálogo.')) return;
    setError(null);
    const { error: err } = await supabase.rpc('cancelar_reserva', { p_token: token });
    if (err) setError(mensajeDeError(err));
    else { setAviso('Pedido cancelado.'); await cargar(); }
  }

  if (cargando) return <Cargando texto="Buscando tu pedido" />;

  const conAbonos = Boolean(reserva?.con_precio && reserva.fase);
  const fase = reserva?.fase ?? null;
  const total = Number(reserva?.total_usd ?? 0);
  const falta = Number(reserva?.falta_bcv ?? total);
  const pagos = reserva?.abonos ?? [];
  const pagado = total - falta;
  const minimo = reserva?.minimo_bcv !== null && reserva?.minimo_bcv !== undefined ? Number(reserva.minimo_bcv) : null;
  // Lo que le falta para llegar al mínimo, mientras no lo ha alcanzado.
  const faltaMinimo = fase === 'esperando_pago' && minimo !== null ? Math.max(0, minimo - pagado) : null;
  const puedePagar = conAbonos && (fase === 'esperando_pago' || fase === 'apartado') && (fase !== 'esperando_pago' || restante !== null);
  // Un chat con la tienda, para cualquier duda, y el aviso de este pedido.
  const escribir = enlaceWhatsAppA(textos.whatsapp_tienda, token ? `Hola, te escribo por mi pedido ${referenciaPedido(token)}.` : 'Hola.');
  const avisar = reserva && token ? enlaceAviso(reserva, token, textos.whatsapp_tienda, tasa) : null;
  // Ni en uno cerrado ni en uno vencido: "Tu pedido ya nos llegó" debajo de
  // "El pedido venció" se contradice.
  const terminado = reserva?.estado === 'cancelada' || reserva?.estado === 'vencida'
    || fase === 'entregado' || fase === 'cancelado' || fase === 'cerrado' || fase === 'vencido'
    || (reserva?.estado === 'abierta' && !restante);

  return (
    <>
      <header className="barra barra--publica">
        <div className="barra__interior">
          <Wordmark alto={40} />
          <div className="barra__publica-acciones">
            <BotonLetraGrande />
            <Link to="/publico" className="boton boton--secundario barra__contacto">Ver el catálogo</Link>
          </div>
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
                <p>
                  {token ? <span className="referencia-pedido">{referenciaPedido(token)}</span> : null}
                  {/* El nombre enmascarado ya termina en punto ("María G."): sin otro. */}
                  {reserva.cliente_nombre ? ` · A nombre de ${reserva.cliente_nombre.replace(/\.$/, '')}.` : ' · Guarda este enlace para volver.'}
                </p>
              </div>
            </div>

            <EstadoDelPedido reserva={reserva} restante={restante} falta={falta} tasa={tasa} escribir={escribir} />

            {/* El pedido ya está en el sistema; esto le avisa a la tienda por
                WhatsApp, con el enlace para que lo busque. Un enlace y no una
                ventana que se abre sola: tras la espera de apartar, el
                navegador la bloquea (y más el que abre WhatsApp por dentro).
                Sin número válido en Textos, no sale. */}
            {avisar && !terminado ? (
              <section className="avisar-tienda">
                <p className="avisar-tienda__texto">
                  Tu pedido ya nos llegó. Avísanos por WhatsApp y te atendemos más rápido: el mensaje va escrito, solo tocas Enviar.
                </p>
                <a className="boton boton--confirmar avisar-tienda__boton" href={avisar} target="_blank" rel="noopener noreferrer">
                  Avisar a la tienda por WhatsApp
                </a>
              </section>
            ) : null}

            <div className="lineas-cobro">
              {/* Una pieza que la tienda quitó del pedido queda en cero: no se
                  enseña (esquema-devoluciones.sql). */}
              {reserva.items.filter((i) => i.cantidad > 0).map((i, n) => {
                const foto = urlPublicaFoto(i.foto_thumb_path);
                return (
                  <div className="linea-cobro" key={`${n}-${i.modelo_id}`}>
                    {foto ? <img className="linea-cobro__foto" src={foto} alt="" /> : <span className="linea-cobro__foto" />}
                    <div>
                      <div className="linea-cobro__nombre">{nombreConVariante(i.nombre, i.variante)}</div>
                      {i.variantes_nota ? <div className="linea-cobro__precio">{i.variantes_nota}</div> : null}
                    </div>
                    <span className="contador__valor">{i.cantidad}</span>
                  </div>
                );
              })}
            </div>

            <div className="total-cobro">
              <div>
                <span className="util secundario">{reserva.piezas} {reserva.piezas === 1 ? 'pieza' : 'piezas'}</span>
                <div className="campo__pista">
                  Valen {formatearBs(precioEnBs(reserva.subtotal_usd, tasa))}
                  {reserva.descuento_pct ? `, menos ${formatearPorcentaje(reserva.descuento_pct)} de descuento` : ''}
                </div>
              </div>
              <div>
                <div className="total-cobro__cifra">{formatearBs(precioEnBs(reserva.total_usd, tasa))}</div>
                <div className="total-cobro__cifra">{formatearBcv(reserva.total_usd)}</div>
              </div>
            </div>

            <PagosHechos pagos={pagos} quienRevisa="La tienda" />

            {puedePagar && tasa ? (
              <>
                <h2 className="seccion-titulo">{pagado > 0 ? 'Pagar lo que falta' : 'Ahora el pago'}</h2>
                {fase === 'esperando_pago' && minimo !== null && pagado <= 0 ? (
                  <p className="prosa">
                    Paga el total, o al menos {formatearBs(bsDeBcv(minimo, tasa.tasa_bcv))} ({formatearBcv(minimo)}) para
                    apartarlas {reserva.apartado_dias ?? ''} días y pagar lo demás por partes.
                  </p>
                ) : null}
                <DondePagar textos={textos} escribir={escribir} />
                <ReportarPago
                  id="rp"
                  falta={falta}
                  minimo={faltaMinimo !== null && faltaMinimo > 0 ? faltaMinimo : null}
                  tasa={tasa}
                  boton="Reportar el pago"
                  enviar={async (p) => {
                    const { error: err } = await supabase.rpc('reportar_abono', {
                      p_token: token, p_metodo: p.metodo, p_monto: p.monto, p_referencia: p.referencia,
                      p_fecha: p.fecha, p_cedula: p.cedula, p_telefono: p.telefono,
                    });
                    if (err) throw new Error(mensajeDeError(err));
                    setAviso('Listo. La tienda comprueba tu pago en el banco y te escribe.');
                    await cargar();
                  }}
                />
              </>
            ) : null}

            {!conAbonos && !reserva.pago_reportado_en && reserva.estado === 'abierta' && restante ? (
              <PagoDeAntes token={token ?? ''} entrega={reserva.entrega} textos={textos} escribir={escribir} alTerminar={async () => {
                setAviso('Listo. La tienda comprueba el pago y te escribe.');
                await cargar();
              }} />
            ) : null}

            {/* Su pago reportado a la antigua (sin monto), mientras la tienda
                no lo haya cargado como abono. */}
            {reserva.pago_reportado_en && pagos.length === 0 ? (
              <section className="panel">
                <span className="panel__titulo">Tu pago</span>
                <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
                  {reserva.pago_metodo === 'efectivo_bs'
                    ? 'Pagas en efectivo al retirar. Te esperamos con tu cédula.'
                    : `Referencia ${reserva.pago_referencia ?? ''} del ${reserva.pago_fecha ?? ''}. La tienda la comprueba en su banco y te escribe.`}
                </p>
              </section>
            ) : null}

            {reserva.estado === 'abierta' && restante && pagos.length === 0 ? (
              <div className="acciones">
                <button type="button" className="boton boton--secundario" onClick={() => void cancelar()}>
                  Cancelar mi pedido
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}

/**
 * El aviso a la tienda: el pedido como lo guardó la base (`ver_reserva`),
 * nunca como lo dejó el carrito. La referencia, el nombre como lo da la base
 * (enmascarado si ya era clienta), las piezas, el total, la entrega sin la
 * dirección de la agencia y el enlace. Sin cédula ni teléfono: ya están en
 * el sistema, y el texto viaja en la URL.
 */
function enlaceAviso(
  reserva: ReservaVista,
  token: string,
  whatsapp: string | undefined,
  tasa: ReturnType<typeof useTasa>['tasa'],
): string | null {
  const lineas = reserva.items
    .filter((i) => i.cantidad > 0)
    .map((i) => ({ nombre: nombreConVariante(i.nombre, i.variante), cantidad: i.cantidad }));
  if (lineas.length === 0) return null;
  const empresa = reserva.envio_empresa === 'mrw' ? 'MRW' : reserva.envio_empresa === 'domesa' ? 'Domesa' : null;
  return enlaceWhatsAppA(whatsapp, mensajeDePedido({
    referencia: referenciaPedido(token),
    nombre: reserva.cliente_nombre,
    lineas,
    totalBs: formatearBs(precioEnBs(reserva.total_usd, tasa)),
    totalBcv: formatearBcv(reserva.total_usd),
    entrega: reserva.entrega === 'envio' ? `envío${empresa ? ` por ${empresa}` : ''}` : 'retiro en la tienda',
    enlace: enlaceReserva(token),
  }));
}

/** "escríbenos por WhatsApp", con su enlace si hay número; si no, la frase sola. */
function EscribenosWhatsApp({ escribir }: { escribir: string | null }) {
  return escribir
    ? <a href={escribir} target="_blank" rel="noopener noreferrer">escríbenos por WhatsApp</a>
    : <>escríbenos por WhatsApp</>;
}

/** En qué va, en una frase y con su plazo. */
function EstadoDelPedido({ reserva, restante, falta, tasa, escribir }: {
  reserva: ReservaVista;
  restante: string | null;
  falta: number;
  tasa: ReturnType<typeof useTasa>['tasa'];
  escribir: string | null;
}) {
  const fase = reserva.fase;
  const faltaBs = tasa ? bsDeBcv(falta, tasa.tasa_bcv) : null;

  if (reserva.estado === 'cancelada') {
    return <Aviso tono="neutro" titulo="Pedido cancelado">Puedes armar otro cuando quieras.</Aviso>;
  }
  if (fase === 'entregado') {
    return <Aviso tono="exito" titulo="Entregado">Gracias por tu compra. Guarda este enlace: es tu comprobante.</Aviso>;
  }
  if (fase === 'pagado') {
    return <Aviso tono="exito" titulo="Pagado">La tienda ya comprobó tu pago. Te escribimos para entregártelo.</Aviso>;
  }
  if (fase === 'apartado' && reserva.vence_apartado_en) {
    return (
      <Aviso tono="alerta" titulo={`Apartado hasta el ${formatearFechaHora(reserva.vence_apartado_en)}`}>
        {falta > 0
          ? <>Te faltan <strong style={{ display: 'inline' }}>{formatearBcv(falta)}</strong>{faltaBs !== null ? <>, hoy {formatearBs(faltaBs)}</> : null}. Si no terminas de pagar a tiempo, pierdes lo abonado y las piezas vuelven a la venta.</>
          : 'Ya reportaste todo. La tienda lo comprueba en su banco.'}
      </Aviso>
    );
  }
  if (fase === 'vencido' || reserva.estado === 'vencida' || (reserva.estado === 'abierta' && !restante)) {
    return (
      <Aviso tono="error" titulo="El pedido venció">
        Las piezas volvieron a la venta.{(reserva.abonos?.length ?? 0) > 0
          ? <> Si pagaste algo, <EscribenosWhatsApp escribir={escribir} />.</>
          : ' Arma el pedido otra vez cuando quieras.'}
      </Aviso>
    );
  }
  if (reserva.estado === 'confirmada') {
    return <Aviso tono="exito" titulo="Pedido confirmado">La tienda comprueba tu pago y te escribe. Guarda este enlace.</Aviso>;
  }
  return (
    <Aviso tono="alerta" titulo="Apartado por unos minutos">
      Tus piezas quedan reservadas <strong style={{ display: 'inline' }}>{restante}</strong> más. Paga y reporta el pago
      aquí abajo para cerrarlo.
    </Aviso>
  );
}

/** A dónde paga: el pago móvil de la tienda, o su texto libre de antes. */
function DondePagar({ textos, escribir }: { textos: ReturnType<typeof useTextos>; escribir: string | null }) {
  return textos.pago_movil_cedula || textos.pago_movil_telefono || textos.pago_movil_banco ? (
    <PagoMovil
      cedula={textos.pago_movil_cedula ?? ''}
      telefono={textos.pago_movil_telefono ?? ''}
      banco={textos.pago_movil_banco ?? ''}
      otros={textos.datos_pago ?? ''}
      titular={textos.pago_movil_titular ?? ''}
    />
  ) : (
    <section className="panel">
      <span className="panel__titulo">A dónde pagar</span>
      <p className="campo__pista" style={{ marginTop: 'var(--e-3)', whiteSpace: 'pre-line' }}>
        {textos.datos_pago?.trim()
          || <>Para los datos de pago, <EscribenosWhatsApp escribir={escribir} />.</>}
      </p>
    </section>
  );
}

/**
 * El pago de un pedido de antes del apartado: uno solo y sin monto, como
 * era. Se queda para los pedidos que ya estaban abiertos al cambiar.
 */
function PagoDeAntes({ token, entrega, textos, escribir, alTerminar }: {
  token: string;
  entrega: ReservaVista['entrega'];
  textos: ReturnType<typeof useTextos>;
  escribir: string | null;
  alTerminar: () => Promise<void>;
}) {
  const [metodo, setMetodo] = useState<'pago_movil' | 'transferencia' | 'efectivo_bs'>('pago_movil');
  const [referencia, setReferencia] = useState('');
  const [fechaPago, setFechaPago] = useState('');
  const [cedulaPago, setCedulaPago] = useState('');
  const [telPago, setTelPago] = useState('');
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reportar() {
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
    setPagando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    await alTerminar();
  }

  return (
    <>
      <h2 className="seccion-titulo">Ahora el pago</h2>
      <DondePagar textos={textos} escribir={escribir} />
      <div className="panel">
        <span className="panel__titulo">Cómo pagaste</span>
        <div className="metodos-pago" style={{ marginTop: 'var(--e-3)' }}>
          <button type="button" aria-pressed={metodo === 'pago_movil'} onClick={() => setMetodo('pago_movil')}>Pago móvil</button>
          <button type="button" aria-pressed={metodo === 'transferencia'} onClick={() => setMetodo('transferencia')}>Transferencia</button>
          {entrega !== 'envio' ? (
            <button type="button" aria-pressed={metodo === 'efectivo_bs'} onClick={() => setMetodo('efectivo_bs')}>Efectivo al retirar</button>
          ) : null}
        </div>
      </div>
      {metodo === 'efectivo_bs' ? (
        <p className="campo__pista">Pagas cuando vengas a retirar. Apartamos tus piezas mientras tanto.</p>
      ) : (
        <>
          <div className="fila">
            <Campo etiqueta="Número de referencia" htmlFor="p-ref">
              <input id="p-ref" inputMode="numeric" value={referencia} onChange={(e) => setReferencia(e.target.value)} required />
            </Campo>
            <Campo etiqueta="Fecha del pago" htmlFor="p-fecha">
              <input id="p-fecha" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} required />
            </Campo>
          </div>
          <div className="fila">
            <Campo etiqueta="Cédula de quien pagó" htmlFor="p-ced" pista="Puede ser otra persona, no hay problema.">
              <input id="p-ced" inputMode="numeric" value={cedulaPago} onChange={(e) => setCedulaPago(e.target.value)} required />
            </Campo>
            <Campo etiqueta="Teléfono de quien pagó" htmlFor="p-tel">
              <input id="p-tel" type="tel" value={telPago} onChange={(e) => setTelPago(e.target.value)} required />
            </Campo>
          </div>
        </>
      )}
      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        <button type="button" className="boton boton--confirmar" disabled={pagando} onClick={() => void reportar()}>
          {pagando ? 'Enviando' : metodo === 'efectivo_bs' ? 'Confirmar el pedido' : 'Confirmar el pago'}
        </button>
      </div>
    </>
  );
}
