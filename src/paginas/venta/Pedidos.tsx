import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, Vacio } from '../../componentes/Piezas';
import { CompartirCatalogo } from '../../componentes/CompartirCatalogo';
import { binanceDesdeBs, cuentaRegresiva, formatearBcv, formatearBinance, formatearBs, formatearFecha, precioEnBs } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { nombreConVariante } from '../../lib/familias';
import { useTasa } from '../../hooks/useTasa';
import { METODOS_PAGO } from '../../lib/tipos';
import type { LineaPedido, LineaPorVerificar, MetodoPago } from '../../lib/tipos';

const soloDigitos = (s: string) => s.replace(/[^0-9]/g, '');
const textoMetodo = (m: MetodoPago | null) => METODOS_PAGO.find((x) => x.valor === m)?.texto ?? 'Sin forma de pago';
const hora = (iso: string) => new Intl.DateTimeFormat('es-VE', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/**
 * Pedidos: lo que falta cerrar.
 *
 * DOS COSAS, DOS SECCIONES
 *   1. Ventas por verificar. Se cobraron en el mostrador, la pieza ya salio
 *      del inventario, pero el pago todavia no se comprobo en el banco. Cada
 *      una dice quien la vendio. La comprueba cualquiera, vendedora o
 *      administrador; si el pago no llega, se anula y las piezas vuelven.
 *   2. Pedidos del catalogo. Cada pieza trae SU UBICACION: la vendedora
 *      recorre la tienda una sola vez y despacha en orden. Se cobran aqui
 *      (la venta se registra sola, con las piezas del pedido) o se cancelan.
 *      Antes no habia como cerrarlos: un pedido pagado se quedaba en la
 *      lista para siempre.
 */
export function Pedidos() {
  const { tasa } = useTasa();
  const [lineas, setLineas] = useState<LineaPedido[]>([]);
  const [porVerificar, setPorVerificar] = useState<LineaPorVerificar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());

  const cargar = useCallback(async () => {
    setCargando(true);
    const [pedidos, ventas] = await Promise.all([
      supabase.from('v_pedido_vendedora').select('*').order('creado_en', { ascending: false }),
      supabase.from('v_ventas_por_verificar').select('*').order('fecha', { ascending: false }),
    ]);
    // Dos consultas, dos errores mirados.
    const fallo = pedidos.error ?? ventas.error;
    setError(fallo ? mensajeDeError(fallo) : null);
    setLineas((pedidos.data as unknown as LineaPedido[] | null) ?? []);
    setPorVerificar((ventas.data as unknown as LineaPorVerificar[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const pedidos = useMemo(() => {
    const mapa = new Map<number, { cabecera: LineaPedido; items: LineaPedido[] }>();
    for (const l of lineas) {
      const g = mapa.get(l.reserva_id);
      if (g) g.items.push(l);
      else mapa.set(l.reserva_id, { cabecera: l, items: [l] });
    }
    return [...mapa.values()];
  }, [lineas]);

  const ventas = useMemo(() => {
    const mapa = new Map<number, { cabecera: LineaPorVerificar; items: LineaPorVerificar[] }>();
    for (const l of porVerificar) {
      const g = mapa.get(l.venta_id);
      if (g) g.items.push(l);
      else mapa.set(l.venta_id, { cabecera: l, items: [l] });
    }
    return [...mapa.values()];
  }, [porVerificar]);

  function alTerminar(mensaje: string) {
    setAviso(mensaje);
    void cargar();
  }

  if (cargando) return <Cargando texto="Buscando pedidos" />;

  const nada = pedidos.length === 0 && ventas.length === 0;

  return (
    <div className="pagina mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Pedidos</h1>
          <p>Las ventas que esperan comprobar el pago y lo que armaron desde el catálogo.</p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={() => { setAviso(null); void cargar(); }}>Actualizar</button>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudieron leer los pedidos">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      {nada ? (
        <Vacio titulo="No hay nada pendiente">
          <p>
            Aquí llegan las ventas que se dejan por verificar en el mostrador y los pedidos del
            catálogo público, con la ubicación de cada pieza.
          </p>
        </Vacio>
      ) : null}

      {/* ------------------------------------------ ventas por verificar */}

      {ventas.length > 0 ? (
        <>
          <h2 className="seccion-titulo">Por verificar el pago · {ventas.length}</h2>
          <div className="pila">
            {ventas.map(({ cabecera, items }) => (
              <VentaPorVerificar key={cabecera.venta_id} cabecera={cabecera} items={items} alTerminar={alTerminar} />
            ))}
          </div>
        </>
      ) : null}

      {/* ------------------------------------------ pedidos del catalogo */}

      {pedidos.length > 0 ? (
        <>
          <h2 className="seccion-titulo">Del catálogo · {pedidos.length}</h2>
          <div className="pila">
            {pedidos.map(({ cabecera, items }) => {
              const restante = cabecera.estado === 'abierta' ? cuentaRegresiva(cabecera.expira_en) : null;
              void ahora;
              return (
                <div className="tarjeta" key={cabecera.reserva_id}>
                  <div className="encabezado-pagina" style={{ marginBottom: 'var(--e-4)' }}>
                    <div>
                      <h2>
                        {[cabecera.cliente_nombre, cabecera.cliente_apellido].filter(Boolean).join(' ') || 'Sin nombre'}
                      </h2>
                      {/* Pidio con su cedula y ya estaba en el maestro: su
                          historico, su garantia y sus meses de servicio estan
                          a un toque. */}
                      {cabecera.cliente_id ? (
                        <Link className="etiqueta etiqueta--exito" to={`/clientes/${cabecera.cliente_id}`}>
                          Ya es clienta · ver su ficha
                        </Link>
                      ) : null}
                      <p>
                        {cabecera.cliente_telefono ?? 'Sin telefono'}
                        {cabecera.cliente_cedula ? ` · C.I. ${cabecera.cliente_cedula}` : ''} ·
                        {' '}{formatearFecha(cabecera.creado_en)} ·
                        {' '}{cabecera.piezas_total} {cabecera.piezas_total === 1 ? 'pieza' : 'piezas'}
                      </p>
                      {/* Lo que paga, en las tres formas en que puede pagarlo. El
                          total esta en dolares BCV; los bolivares y los Binance
                          salen de la tasa de hoy, que es a la que se cobra. */}
                      <p className="pedido__total">
                        {formatearBcv(cabecera.total_usd)}
                        {tasa ? <> · {formatearBs(precioEnBs(cabecera.total_usd, tasa))}</> : null}
                        {tasa ? <> · {formatearBinance(binanceDesdeBs(precioEnBs(cabecera.total_usd, tasa), tasa.tasa_venta))}</> : null}
                      </p>
                    </div>
                    {cabecera.estado === 'confirmada'
                      ? <span className="etiqueta etiqueta--exito">Pagado, por entregar</span>
                      : restante
                        ? <span className="etiqueta etiqueta--alerta">Apartado {restante}</span>
                        : <span className="etiqueta etiqueta--error">Por vencer</span>}
                  </div>

                  <div className="rejilla rejilla--2" style={{ marginBottom: 'var(--e-4)' }}>
                    <div className="panel">
                      <span className="panel__titulo">Entrega</span>
                      {cabecera.entrega === 'envio' ? (
                        <>
                          <div className="dato__valor" style={{ textTransform: 'uppercase' }}>
                            {cabecera.envio_empresa ?? 'Envio'}
                          </div>
                          <div className="campo__pista">
                            {cabecera.envio_agencia}
                            {cabecera.envio_direccion ? ` · ${cabecera.envio_direccion}` : ''}
                          </div>
                          <div className="campo__pista">Cobro a destino: el envio lo paga ella al retirar.</div>
                        </>
                      ) : (
                        <>
                          <div className="dato__valor">Retira en tienda</div>
                          <div className="campo__pista">Pidele la cédula al entregar.</div>
                        </>
                      )}
                    </div>

                    <div className="panel">
                      <span className="panel__titulo">Pago</span>
                      {!cabecera.pago_reportado_en ? (
                        <>
                          <div className="dato__valor">Sin reportar</div>
                          <div className="campo__pista">Todavia no ha cargado el pago. No despaches aun.</div>
                        </>
                      ) : cabecera.pago_metodo === 'efectivo_bs' || cabecera.pago_metodo === 'efectivo_usd' ? (
                        <>
                          <div className="dato__valor">Efectivo al retirar</div>
                          <div className="campo__pista">Cobra al entregar.</div>
                        </>
                      ) : (
                        <>
                          <div className="dato__valor">Ref. {cabecera.pago_referencia}</div>
                          <div className="campo__pista">
                            {textoMetodo(cabecera.pago_metodo)}
                            {cabecera.pago_fecha ? ` del ${formatearFecha(cabecera.pago_fecha)}` : ''}
                          </div>
                          <div className="campo__pista">
                            Pago: C.I. {cabecera.pago_cedula ?? '—'} · {cabecera.pago_telefono ?? '—'}
                          </div>
                          {/* Si quien pago no es quien pidio, se avisa: es lo
                              primero que confunde al comprobar en el banco. */}
                          {cabecera.pago_cedula && cabecera.cliente_cedula
                            && soloDigitos(cabecera.pago_cedula) !== soloDigitos(cabecera.cliente_cedula)
                            ? <div className="campo__pista"><strong>Pago un tercero.</strong></div>
                            : null}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="tabla-envoltura">
                    <table className="tabla">
                      <thead>
                        <tr><th></th><th>Pieza</th><th>Dónde está</th><th className="num">Cantidad</th></tr>
                      </thead>
                      <tbody>
                        {items.map((i) => {
                          const foto = urlPublicaFoto(i.foto_thumb_path);
                          return (
                            <tr key={i.modelo_id}>
                              <td>{foto ? <img className="miniatura" src={foto} alt="" loading="lazy" /> : <span className="miniatura" />}</td>
                              <td>
                                <div className="celda-nombre">{nombreConVariante(i.nombre, i.variante)}</div>
                                <div className="celda-nota">{i.sku}{i.variantes_nota ? ` · ${i.variantes_nota}` : ''}</div>
                              </td>
                              <td className="util">{i.ubicacion}</td>
                              <td className="num">{i.cantidad}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <CerrarPedido cabecera={cabecera} alTerminar={alTerminar} />
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/*
        El compartir va DESPUES de los pedidos, y plegado. Ella entra aqui a
        ver que le pidieron, no a copiar un enlace. Se abre solo cuando no hay
        nada pendiente, que es justo cuando mandar el catalogo si es lo
        siguiente que conviene hacer.
      */}
      <details className="ayuda" open={nada}>
        <summary className="ayuda__titulo">Enviar el catálogo a una clienta</summary>
        <div className="ayuda__cuerpo">
          <CompartirCatalogo />
        </div>
      </details>
    </div>
  );
}

/**
 * Una venta que se cobro sin comprobar el pago. Dice quien la vendio, como
 * pago y con que referencia: lo necesario para buscarla en el banco.
 */
function VentaPorVerificar({ cabecera, items, alTerminar }: {
  cabecera: LineaPorVerificar;
  items: LineaPorVerificar[];
  alTerminar: (mensaje: string) => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const piezas = items.reduce((n, i) => n + i.cantidad, 0);

  async function verificar() {
    setTrabajando(true);
    setError(null);
    const { error: err } = await supabase.rpc('verificar_venta', { p_venta_id: cabecera.venta_id });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar(`Venta ${cabecera.venta_id} verificada.`);
  }

  async function anular() {
    if (!window.confirm('¿El pago no llegó? La venta se anula y las piezas vuelven a su ubicación.')) return;
    setTrabajando(true);
    setError(null);
    const { error: err } = await supabase.rpc('anular_venta_por_verificar', { p_venta_id: cabecera.venta_id, p_motivo: null });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar(`Venta ${cabecera.venta_id} anulada: las piezas volvieron a su ubicación.`);
  }

  return (
    <div className="tarjeta">
      <div className="encabezado-pagina" style={{ marginBottom: 'var(--e-4)' }}>
        <div>
          <h2>{cabecera.cliente_nombre || 'Sin nombre'}</h2>
          {cabecera.cliente_id ? (
            <Link className="etiqueta etiqueta--exito" to={`/clientes/${cabecera.cliente_id}`}>
              Ver su ficha
            </Link>
          ) : null}
          <p>
            Vendió <strong>{cabecera.vendedora ?? 'alguien sin perfil'}</strong> · {formatearFecha(cabecera.fecha)}, {hora(cabecera.fecha)} ·
            {' '}{piezas} {piezas === 1 ? 'pieza' : 'piezas'}
          </p>
          <p className="pedido__total">
            {formatearBs(cabecera.total_bs)} · {formatearBcv(cabecera.total_bcv)} · {formatearBinance(cabecera.total_binance)}
          </p>
        </div>
        <span className="etiqueta etiqueta--alerta">Por verificar</span>
      </div>

      <div className="panel" style={{ marginBottom: 'var(--e-4)' }}>
        <span className="panel__titulo">Cómo pagó</span>
        <div className="dato__valor">{textoMetodo(cabecera.metodo)}</div>
        <div className="campo__pista">
          {cabecera.pago_referencia ? `Ref. ${cabecera.pago_referencia}` : 'Sin referencia anotada'}
          {cabecera.cliente_cedula ? ` · C.I. ${cabecera.cliente_cedula}` : ''}
          {cabecera.cliente_telefono ? ` · ${cabecera.cliente_telefono}` : ''}
        </div>
      </div>

      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr><th></th><th>Pieza</th><th>Salió de</th><th className="num">Cantidad</th><th className="num">C/u · Bs</th></tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const foto = urlPublicaFoto(i.foto_thumb_path);
              return (
                <tr key={`${i.modelo_id}-${i.ubicacion ?? ''}`}>
                  <td>{foto ? <img className="miniatura" src={foto} alt="" loading="lazy" /> : <span className="miniatura" />}</td>
                  <td>
                    <div className="celda-nombre">{nombreConVariante(i.nombre, i.variante)}</div>
                    <div className="celda-nota">{i.sku}</div>
                  </td>
                  <td className="util">{i.ubicacion ?? '—'}</td>
                  <td className="num">{i.cantidad}</td>
                  <td className="num">{formatearBs(i.precio_unitario_bs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        <button type="button" className="boton boton--confirmar" disabled={trabajando} onClick={() => void verificar()}>
          {trabajando ? 'Guardando' : 'Pago verificado'}
        </button>
        <button type="button" className="boton boton--peligro" disabled={trabajando} onClick={() => void anular()}>
          No llegó el pago: anular
        </button>
      </div>
    </div>
  );
}

/**
 * Cerrar un pedido del catalogo: cobrarlo (la venta se registra sola con
 * sus piezas, de donde haya existencia) o cancelarlo (las piezas vuelven a
 * estar disponibles en el catalogo).
 */
function CerrarPedido({ cabecera, alTerminar }: {
  cabecera: LineaPedido;
  alTerminar: (mensaje: string) => void;
}) {
  const [metodo, setMetodo] = useState<MetodoPago | ''>(cabecera.pago_metodo ?? '');
  const [referencia, setReferencia] = useState(cabecera.pago_referencia ?? '');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = cabecera.reserva_id;

  async function cobrar() {
    if (!metodo) return;
    setTrabajando(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('cobrar_pedido', {
      p_reserva_id: id, p_metodo: metodo, p_pago_referencia: referencia.trim() || null,
    });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar(`Pedido cobrado: venta ${data as number}. Entrégalo y listo.`);
  }

  async function cancelar() {
    if (!window.confirm('¿Cancelar este pedido? Sus piezas vuelven a estar disponibles en el catálogo.')) return;
    setTrabajando(true);
    setError(null);
    const { error: err } = await supabase.rpc('cancelar_pedido', { p_reserva_id: id });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar('Pedido cancelado: sus piezas volvieron al catálogo.');
  }

  return (
    <div className="cerrar-pedido">
      <span className="panel__titulo">Cerrar el pedido</span>
      <div className="fila">
        <div className="campo">
          <label htmlFor={`cp-metodo-${id}`}>Cómo pagó</label>
          <select id={`cp-metodo-${id}`} value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago | '')}>
            <option value="">Elige la forma de pago</option>
            {METODOS_PAGO.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor={`cp-ref-${id}`}>Referencia</label>
          <input id={`cp-ref-${id}`} value={referencia} onChange={(e) => setReferencia(e.target.value)} autoComplete="off" />
        </div>
      </div>
      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        <button type="button" className="boton boton--confirmar" disabled={!metodo || trabajando} onClick={() => void cobrar()}>
          {trabajando ? 'Guardando' : 'Cobrar y entregar'}
        </button>
        <button type="button" className="boton boton--peligro" disabled={trabajando} onClick={() => void cancelar()}>
          Cancelar pedido
        </button>
      </div>
      <p className="campo__pista">
        Al cobrar se registra la venta con estas piezas, tomadas de donde dice "Dónde está", a
        nombre de quien la cobra.
      </p>
    </div>
  );
}
