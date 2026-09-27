import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando } from '../../componentes/Piezas';
import { Wordmark } from '../../componentes/Marca';
import { cuentaRegresiva, formatearBcv, formatearBs, formatearPorcentaje, precioEnBs } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { nombreConVariante } from '../../lib/familias';
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
          <Link to="/publico" className="sesion__quien">Ver el catálogo</Link>
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
                Tus piezas quedan reservadas <strong style={{ display: 'inline' }}>{restante}</strong> más.
                Paga y carga los datos aquí abajo para cerrarlo.
              </Aviso>
            ) : null}
            {reserva.estado === 'abierta' && !restante ? (
              <Aviso tono="error" titulo="El apartado venció">
                Las piezas volvieron al catálogo. Arma el pedido otra vez.
              </Aviso>
            ) : null}
            {reserva.estado === 'confirmada' ? (
              <Aviso tono="exito" titulo="Pedido confirmado">
                La tienda comprueba tu pago y te escribe. Guarda este enlace.
              </Aviso>
            ) : null}
            {reserva.estado === 'vencida' ? (
              <Aviso tono="error" titulo="El apartado venció">Las piezas volvieron al catálogo.</Aviso>
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

                {textos.pago_movil_cedula || textos.pago_movil_telefono || textos.pago_movil_banco ? (
                  <PagoMovil
                    cedula={textos.pago_movil_cedula ?? ''}
                    telefono={textos.pago_movil_telefono ?? ''}
                    banco={textos.pago_movil_banco ?? ''}
                    otros={textos.datos_pago ?? ''}
                  />
                ) : (
                  <section className="panel">
                    <span className="panel__titulo">A dónde pagar</span>
                    <p className="campo__pista" style={{ marginTop: 'var(--e-3)', whiteSpace: 'pre-line' }}>
                      {textos.datos_pago?.trim()
                        || 'Escribele a la tienda por WhatsApp y te pasan los datos para pagar.'}
                    </p>
                  </section>
                )}

                <div className="panel">
                  <span className="panel__titulo">Cómo pagaste</span>
                  <div className="metodos-pago" style={{ marginTop: 'var(--e-3)' }}>
                    <button type="button" aria-pressed={metodo === 'pago_movil'} onClick={() => setMetodo('pago_movil')}>
                      Pago móvil
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
                      <Campo etiqueta="Número de referencia" htmlFor="p-ref">
                        <input id="p-ref" inputMode="numeric" value={referencia} onChange={(e) => setReferencia(e.target.value)} required />
                      </Campo>
                      <Campo etiqueta="Fecha del pago" htmlFor="p-fecha">
                        <input id="p-fecha" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} required />
                      </Campo>
                    </div>
                    <div className="fila">
                      <Campo etiqueta="Cédula de quien pago" htmlFor="p-ced" pista="Puede ser otra persona, no hay problema.">
                        <input id="p-ced" inputMode="numeric" value={cedulaPago} onChange={(e) => setCedulaPago(e.target.value)} required />
                      </Campo>
                      <Campo etiqueta="Teléfono de quien pago" htmlFor="p-tel">
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

/* ------------------------------------------------------------ el pago */

/**
 * Copiar al portapapeles. Si el navegador no deja (un telefono viejo, o el
 * navegador que abre WhatsApp o Instagram por dentro), se intenta por el
 * camino viejo, que todavia funciona en casi todos.
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copiado = false;
    try { copiado = document.execCommand('copy'); } catch { copiado = false; }
    area.remove();
    return copiado;
  }
}

const soloDigitos = (texto: string) => texto.replace(/\D/g, '');

interface DatoPago {
  clave: string;
  etiqueta: string;
  valor: string;
  /** Lo que se copia: lo que acepta la aplicacion del banco. */
  copia: string;
  /** Lo que oye quien usa lector de pantalla al copiar. */
  anuncio: string;
}

/**
 * A donde paga la clienta: cedula, telefono y banco, cada uno con su boton
 * de copiar. Se pegan en la aplicacion del banco sin equivocarse de un
 * digito, que es donde se pierde un pago movil.
 *
 * Los datos viven en `textos` y el dueno los cambia en la pantalla de
 * Textos. Se copian limpios: la cedula y el telefono solo con sus digitos
 * (aunque alguien los escriba con puntos o guiones), y del banco solo el
 * codigo, que es lo que se busca en la lista de bancos de cada aplicacion.
 */
function PagoMovil({ cedula, telefono, banco, otros }: {
  cedula: string;
  telefono: string;
  banco: string;
  /** El texto libre de antes (una cuenta para transferir, una nota). */
  otros: string;
}) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const reloj = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(reloj.current), []);

  const datos: DatoPago[] = [
    { clave: 'cedula', etiqueta: 'Cédula', valor: cedula.trim(), copia: soloDigitos(cedula) || cedula.trim(), anuncio: 'Cédula copiada' },
    { clave: 'telefono', etiqueta: 'Teléfono', valor: telefono.trim(), copia: soloDigitos(telefono) || telefono.trim(), anuncio: 'Teléfono copiado' },
    { clave: 'banco', etiqueta: 'Banco', valor: banco.trim(), copia: banco.match(/\d{4}/)?.[0] ?? banco.trim(), anuncio: 'Código del banco copiado' },
  ].filter((d) => d.valor);

  // Los tres juntos, para mandarselos a quien va a pagar por ella.
  const todos = ['Pago móvil Lux', ...datos.map((d) => `${d.etiqueta}: ${d.valor}`)].join('\n');

  async function copiar(clave: string, texto: string) {
    const listo = await copiarTexto(texto);
    setFallo(!listo);
    if (!listo) { setCopiado(null); return; }
    setCopiado(clave);
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setCopiado(null), 2500);
  }

  const anuncio = copiado === 'todos'
    ? 'Los datos del pago móvil, copiados'
    : datos.find((d) => d.clave === copiado)?.anuncio ?? '';

  return (
    <section className="panel pago-movil">
      <span className="panel__titulo">Pago móvil Lux</span>
      <dl className="pago-movil__datos">
        {datos.map((d) => (
          <div className="pago-movil__fila" key={d.clave}>
            <div>
              <dt className="dato__etiqueta">{d.etiqueta}</dt>
              <dd className="dato__valor">{d.valor}</dd>
            </div>
            <button
              type="button"
              className="boton boton--secundario pago-movil__copiar"
              data-copiado={copiado === d.clave ? '' : undefined}
              onClick={() => void copiar(d.clave, d.copia)}
            >
              {copiado === d.clave ? 'Copiado' : 'Copiar'}
              <span className="visualmente-oculto"> {d.etiqueta}</span>
            </button>
          </div>
        ))}
      </dl>

      <button
        type="button"
        className="boton boton--secundario boton--pequeno pago-movil__todos"
        data-copiado={copiado === 'todos' ? '' : undefined}
        onClick={() => void copiar('todos', todos)}
      >
        {copiado === 'todos' ? 'Copiados los tres' : 'Copiar los tres juntos'}
      </button>

      {/* El aviso de "copiado" para quien no ve el boton cambiar. */}
      <p className="visualmente-oculto" aria-live="polite">{anuncio}</p>

      {fallo ? (
        <p className="campo__pista">
          Este navegador no dejó copiar. Mantén el dedo sobre el dato para
          seleccionarlo y cópialo a mano.
        </p>
      ) : (
        <p className="campo__pista">Toca Copiar y pégalo en la aplicación de tu banco.</p>
      )}

      {otros.trim() ? (
        <p className="campo__pista" style={{ whiteSpace: 'pre-line' }}>{otros.trim()}</p>
      ) : null}
    </section>
  );
}
