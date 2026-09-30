import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, Vacio } from '../../componentes/Piezas';
import { CompartirCatalogo } from '../../componentes/CompartirCatalogo';
import { CargarAbono } from '../../componentes/CargarAbono';
import { ListaAbonos, textoMetodo } from '../../componentes/ListaAbonos';
import {
  binanceDesdeBs, bsDeBcv, cuentaRegresiva, formatearBcv, formatearBinance, formatearBs,
  formatearFecha, formatearFechaHora, formatearMonto, precioEnBs, tiempoRestante,
} from '../../lib/dinero';
import type { Tasas } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { nombreConVariante } from '../../lib/familias';
import { enlaceReserva, enlaceWhatsApp } from '../../lib/revendedor';
import { useTasa } from '../../hooks/useTasa';
import { useSesion } from '../../hooks/useSesion';
import { METODOS_EN_DOLARES, METODOS_PAGO } from '../../lib/tipos';
import type { AbonoDetalle, ApartadoEnTienda, LineaPedido, LineaPorVerificar, MetodoPago } from '../../lib/tipos';

const soloDigitos = (s: string) => s.replace(/[^0-9]/g, '');

/**
 * Pedidos: lo que falta cerrar.
 *
 * TRES SECCIONES
 *   1. Pedidos y apartados de la tienda. Los del catálogo y los que se
 *      apartaron en el mostrador. Cada uno dice en qué va (esperando el
 *      pago, apartado con su plazo, pagado), cuánto se ha pagado, abono por
 *      abono con su referencia y lo que quedaba después de cada uno, y
 *      dónde está cada pieza. Se entrega cuando todo el dinero está
 *      verificado; la venta nace ahí, con el precio que se congeló al
 *      apartar.
 *   2. Ventas por verificar. Se cobraron en el mostrador, la pieza ya salió,
 *      pero el pago todavía no se comprobó en el banco.
 *   3. Pedidos de revendedores. Llegan cuando él confirma el pago de su
 *      clienta; él tiene un día para pagarle a Lux. Se aprueba cuando llegó
 *      todo (ahí se registra la venta a nombre de su clienta) y se marca
 *      cuando se lo lleva. Lo que su clienta le paga a él no se ve aquí.
 *
 * Todo lo que se puede hacer con el dinero lo decide la base; esta
 * pantalla solo no enseña botones que van a decir que no.
 */
export function Pedidos() {
  const { tasa } = useTasa();
  const { esAdmin } = useSesion();
  const [lineas, setLineas] = useState<LineaPedido[]>([]);
  const [porVerificar, setPorVerificar] = useState<LineaPorVerificar[]>([]);
  const [abonos, setAbonos] = useState<AbonoDetalle[]>([]);
  const [apartados, setApartados] = useState<ApartadoEnTienda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());

  const cargar = useCallback(async () => {
    const [pedidos, ventas, deRevendedores] = await Promise.all([
      supabase.from('v_pedido_vendedora').select('*').order('creado_en', { ascending: false }),
      supabase.from('v_ventas_por_verificar').select('*').order('fecha', { ascending: false }),
      supabase.from('v_apartados_revendedor').select('*').order('creado_en'),
    ]);
    const filasPedidos = (pedidos.data as unknown as LineaPedido[] | null) ?? [];
    const filasVentas = (ventas.data as unknown as LineaPorVerificar[] | null) ?? [];
    const filasRv = (deRevendedores.data as unknown as ApartadoEnTienda[] | null) ?? [];

    // Los abonos de todo lo que hay en la pantalla, en una consulta.
    const reservas = [...new Set(filasPedidos.map((f) => f.reserva_id))];
    const conAbonos = [...new Set(filasVentas.filter((f) => f.pago_parcial).map((f) => f.venta_id))];
    const deRv = filasRv.map((a) => a.id);
    const filtro = [
      reservas.length ? `reserva_id.in.(${reservas.join(',')})` : null,
      deRv.length ? `apartado_id.in.(${deRv.join(',')})` : null,
      conAbonos.length ? `venta_id.in.(${conAbonos.join(',')})` : null,
    ].filter(Boolean).join(',');
    const deAbonos = filtro
      ? await supabase.from('v_abonos_detalle').select('*').or(filtro).order('fecha').order('id')
      : null;

    // Cuatro consultas, cuatro errores mirados.
    const fallo = pedidos.error ?? ventas.error ?? deRevendedores.error ?? deAbonos?.error ?? null;
    setError(fallo ? mensajeDeError(fallo) : null);
    setLineas(filasPedidos);
    setPorVerificar(filasVentas);
    setApartados(filasRv);
    setAbonos((deAbonos?.data as unknown as AbonoDetalle[] | null) ?? []);
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

  // Los pagos que alguien reportó y nadie ha comprobado: es lo primero que
  // hay que mirar en el banco.
  const porRevisar = useMemo(
    () => abonos.filter((a) => !a.verificado_en && !a.anulado_en && a.venta_id === null).length,
    [abonos],
  );

  function alTerminar(mensaje: string) {
    setAviso(mensaje);
    void cargar();
  }

  if (cargando) return <Cargando texto="Buscando pedidos" />;

  const nada = pedidos.length === 0 && ventas.length === 0 && apartados.length === 0;

  return (
    <div className="pagina mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Pedidos</h1>
          <p>Los apartados y pedidos por cobrar y entregar, las ventas que esperan comprobar el pago y lo que piden los revendedores.</p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={() => { setAviso(null); void cargar(); }}>Actualizar</button>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudieron leer los pedidos">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}
      {porRevisar > 0 ? (
        <Aviso tono="alerta" titulo={porRevisar === 1 ? 'Un pago por comprobar' : `${porRevisar} pagos por comprobar`}>
          Búscalos en el banco y marca en cada uno si llegó o no. Los que dicen "Por verificar" todavía
          no cuentan en la caja.
        </Aviso>
      ) : null}

      {nada ? (
        <Vacio titulo="No hay nada pendiente">
          <p>
            Aquí llegan los pedidos del catálogo y los apartados del mostrador, las ventas que se dejan
            por verificar y los pedidos que confirman los revendedores.
          </p>
        </Vacio>
      ) : null}

      {/* ------------------------------------ pedidos y apartados de la tienda */}

      {pedidos.length > 0 ? (
        <>
          <h2 className="seccion-titulo">Pedidos y apartados · {pedidos.length}</h2>
          <div className="pila">
            {pedidos.map(({ cabecera, items }) => (
              <PedidoDeTienda
                key={cabecera.reserva_id}
                cabecera={cabecera}
                items={items}
                abonos={abonos.filter((a) => a.reserva_id === cabecera.reserva_id)}
                tasa={tasa}
                esAdmin={esAdmin}
                ahora={ahora}
                alTerminar={alTerminar}
              />
            ))}
          </div>
        </>
      ) : null}

      {/* ------------------------------------------ ventas por verificar */}

      {ventas.length > 0 ? (
        <>
          <h2 className="seccion-titulo">Por verificar el pago · {ventas.length}</h2>
          <div className="pila">
            {ventas.map(({ cabecera, items }) => (
              <VentaPorVerificar
                key={cabecera.venta_id}
                cabecera={cabecera}
                items={items}
                abonos={abonos.filter((a) => a.venta_id === cabecera.venta_id)}
                tasa={tasa}
                esAdmin={esAdmin}
                alTerminar={alTerminar}
              />
            ))}
          </div>
        </>
      ) : null}

      {/* ------------------------------------ pedidos de revendedores */}

      {apartados.length > 0 ? (
        <>
          <h2 className="seccion-titulo">De revendedores · {apartados.length}</h2>
          <div className="pila">
            {apartados.map((a) => (
              <PedidoDeRevendedor
                key={a.id}
                apartado={a}
                abonos={abonos.filter((x) => x.apartado_id === a.id)}
                tasa={tasa}
                esAdmin={esAdmin}
                ahora={ahora}
                alTerminar={alTerminar}
              />
            ))}
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

/* ------------------------------------------------------------ piezas */

/** Lo que vale, en las tres formas en que se puede pagar. */
function TresPrecios({ bcv, tasa }: { bcv: number; tasa: Tasas | null }) {
  const bs = tasa ? precioEnBs(bcv, tasa) : null;
  return (
    <p className="pedido__total">
      {formatearBcv(bcv)}
      {bs !== null ? <> · {formatearBs(bs)}</> : null}
      {bs !== null && tasa ? <> · {formatearBinance(binanceDesdeBs(bs, tasa.tasa_venta))}</> : null}
    </p>
  );
}

/** "Faltan $6,00 BCV, hoy Bs 660,00 ($4,40 Binance)." */
function Falta({ bcv, tasa, listo }: { bcv: number; tasa: Tasas | null; listo: string }) {
  if (bcv <= 0) return <p className="abonos__falta abonos__falta--listo">{listo}</p>;
  const bs = tasa ? bsDeBcv(bcv, tasa.tasa_bcv) : null;
  return (
    <p className="abonos__falta">
      Faltan <strong>{formatearBcv(bcv)}</strong>
      {bs !== null ? <>, hoy <strong>{formatearBs(bs)}</strong></> : null}
      {bs !== null && tasa ? <> ({formatearBinance(binanceDesdeBs(bs, tasa.tasa_venta))})</> : null}.
    </p>
  );
}

/**
 * Cerrar algo que ya tiene dinero, sin entregarlo: la clienta se echó para
 * atrás, o se le pasó el plazo sin llegar al mínimo. Solo el
 * administrador, y diciendo qué pasa con el dinero: se devuelve (sale de la
 * caja como "Devolución", el día de hoy) o se queda.
 */
function CerrarConDinero({ rpc, argumentoId, id, pagadoBcv, tasa, alTerminar, texto }: {
  rpc: 'admin_cerrar_pedido' | 'admin_cerrar_apartado';
  argumentoId: 'p_reserva_id' | 'p_apartado_id';
  id: number;
  pagadoBcv: number;
  tasa: Tasas | null;
  alTerminar: (mensaje: string) => void;
  texto: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [devolver, setDevolver] = useState<boolean | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago>('pago_movil');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enDolares = METODOS_EN_DOLARES.includes(metodo);
  const pagadoBs = tasa ? bsDeBcv(pagadoBcv, tasa.tasa_bcv) : null;
  const valor = Number(monto.replace(',', '.'));

  if (!abierto) {
    return (
      <button type="button" className="boton boton--peligro" onClick={() => setAbierto(true)}>
        {texto}
      </button>
    );
  }

  async function cerrar() {
    if (devolver === null) return;
    setTrabajando(true);
    setError(null);
    const { error: err } = await supabase.rpc(rpc, {
      [argumentoId]: id, p_devolver: devolver,
      p_metodo: devolver ? metodo : null, p_monto: devolver ? valor : null,
      p_motivo: motivo.trim() || null,
    });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar(devolver
      ? 'Cerrado. La devolución quedó en la caja como salida de hoy.'
      : 'Cerrado. Lo que pagó se queda en la caja.');
  }

  return (
    <div className="cerrar-con-dinero">
      <span className="panel__titulo">Qué pasa con lo que pagó ({formatearBcv(pagadoBcv)}{pagadoBs !== null ? `, hoy ${formatearBs(pagadoBs)}` : ''})</span>
      <div className="metodos-pago" role="group" aria-label="Qué pasa con lo que pagó" style={{ marginTop: 'var(--e-3)' }}>
        <button type="button" aria-pressed={devolver === true} onClick={() => setDevolver(true)}>Se le devuelve</button>
        <button type="button" aria-pressed={devolver === false} onClick={() => setDevolver(false)}>Se queda</button>
      </div>
      {devolver ? (
        <div className="fila" style={{ marginTop: 'var(--e-4)' }}>
          <div className="campo">
            <label htmlFor={`dev-metodo-${rpc}-${id}`}>Cómo se le devuelve</label>
            <select id={`dev-metodo-${rpc}-${id}`} value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
              {METODOS_PAGO.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor={`dev-monto-${rpc}-${id}`}>{enDolares ? 'Cuánto · $' : 'Cuánto · Bs'}</label>
            <input id={`dev-monto-${rpc}-${id}`} inputMode="decimal" autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
        </div>
      ) : null}
      <div className="campo">
        <label htmlFor={`dev-motivo-${rpc}-${id}`}>Por qué</label>
        <input id={`dev-motivo-${rpc}-${id}`} autoComplete="off" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se echó para atrás" />
      </div>
      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        <button
          type="button"
          className="boton boton--peligro"
          disabled={trabajando || devolver === null || (devolver && !(valor > 0))}
          onClick={() => void cerrar()}
        >
          {trabajando ? 'Guardando' : 'Cerrar'}
        </button>
        <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={() => setAbierto(false)}>
          No cerrar
        </button>
      </div>
    </div>
  );
}

function TablaPiezas({ items, conPrecio }: {
  items: { modelo_id: number; foto_thumb_path: string | null; nombre: string; variante: string | null; sku: string; donde: string | null; cantidad: number; precio?: number | null }[];
  conPrecio: boolean;
}) {
  return (
    <div className="tabla-envoltura">
      <table className="tabla">
        <thead>
          <tr>
            <th></th><th>Pieza</th><th>Dónde está</th><th className="num">Cantidad</th>
            {conPrecio ? <th className="num">C/u · $ BCV</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const foto = urlPublicaFoto(i.foto_thumb_path);
            return (
              <tr key={i.modelo_id}>
                <td>{foto ? <img className="miniatura" src={foto} alt="" loading="lazy" /> : <span className="miniatura" />}</td>
                <td>
                  <div className="celda-nombre">{nombreConVariante(i.nombre, i.variante)}</div>
                  <div className="celda-nota">{i.sku}</div>
                </td>
                <td className="util">{i.donde ?? '—'}</td>
                <td className="num">{i.cantidad}</td>
                {conPrecio ? <td className="num precio">{i.precio !== null && i.precio !== undefined ? formatearMonto(Number(i.precio)) : '—'}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------ pedido de la tienda */

/**
 * Un pedido del catálogo o un apartado del mostrador.
 *
 * Los de antes del apartado (sin precio congelado) se cierran como antes:
 * se cobran completos al entregar. Los demás se pagan por abonos, cada uno
 * con su referencia; se entregan cuando todo el dinero está verificado.
 */
function PedidoDeTienda({ cabecera: c, items, abonos, tasa, esAdmin, ahora, alTerminar }: {
  cabecera: LineaPedido;
  items: LineaPedido[];
  abonos: AbonoDetalle[];
  tasa: Tasas | null;
  esAdmin: boolean;
  ahora: number;
  alTerminar: (mensaje: string) => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombre = [c.cliente_nombre, c.cliente_apellido].filter(Boolean).join(' ') || 'Sin nombre';
  const total = Number(c.total_usd ?? 0);
  const falta = Number(c.falta_bcv ?? 0);
  const pagado = Number(c.pagado_bcv ?? 0);
  const verificado = Number(c.verificado_bcv ?? 0);
  const faltaVerificar = Math.max(0, total - verificado);
  const conDinero = abonos.some((a) => !a.anulado_en);
  const abierto = ['esperando_pago', 'reportado', 'apartado', 'pagado'].includes(c.fase);

  async function entregar() {
    setTrabajando(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('entregar_pedido', { p_reserva_id: c.reserva_id });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar(`Entregado: venta ${data as number}, a nombre de ${nombre}.`);
  }

  async function cancelar() {
    if (!window.confirm('¿Cancelar este pedido? Sus piezas vuelven a estar disponibles.')) return;
    setTrabajando(true);
    setError(null);
    const { error: err } = await supabase.rpc('cancelar_pedido', { p_reserva_id: c.reserva_id });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar('Pedido cancelado: sus piezas volvieron a la venta.');
  }

  async function archivar() {
    setTrabajando(true);
    setError(null);
    const { error: err } = await supabase.rpc('cerrar_pedido_vencido', { p_reserva_id: c.reserva_id });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar('Archivado. Lo abonado se queda, como dice la regla del apartado.');
  }

  const etiqueta = (() => {
    void ahora;
    switch (c.fase) {
      case 'pagado': return <span className="etiqueta etiqueta--exito">Pagado, por entregar</span>;
      case 'apartado': return <span className="etiqueta etiqueta--alerta">Apartado · {tiempoRestante(c.vence_apartado_en, ahora) ?? 'vence hoy'}</span>;
      case 'reportado': return <span className="etiqueta etiqueta--alerta">Pago reportado</span>;
      case 'vencido': return <span className="etiqueta etiqueta--error">Venció</span>;
      default: {
        const restante = cuentaRegresiva(c.expira_en);
        return restante
          ? <span className="etiqueta etiqueta--alerta">Esperando el pago · {restante}</span>
          : <span className="etiqueta etiqueta--error">Por vencer</span>;
      }
    }
  })();

  const mensaje = `Hola ${c.cliente_nombre ?? ''}. Este es tu pedido en Lux by Emory: ahí ves lo que has pagado y reportas lo que falta. ${enlaceReserva(c.token)}`;

  return (
    <div className="tarjeta">
      <div className="encabezado-pagina" style={{ marginBottom: 'var(--e-4)' }}>
        <div>
          <h2>{nombre}</h2>
          {/* Pidió con su cédula y ya estaba en el maestro: su histórico, su
              garantía y sus meses de servicio están a un toque. */}
          {c.cliente_id ? (
            <Link className="etiqueta etiqueta--exito" to={`/clientes/${c.cliente_id}`}>Ya es clienta · ver su ficha</Link>
          ) : null}
          <p>
            {c.origen === 'tienda' ? `Apartado en el mostrador${c.creado_por ? ` por ${c.creado_por}` : ''}` : 'Del catálogo'} ·
            {' '}{c.cliente_telefono ?? 'sin teléfono'}
            {c.cliente_cedula ? ` · C.I. ${c.cliente_cedula}` : ''} ·
            {' '}{formatearFecha(c.creado_en)} ·
            {' '}{c.piezas_total} {c.piezas_total === 1 ? 'pieza' : 'piezas'}
          </p>
          <TresPrecios bcv={total} tasa={tasa} />
        </div>
        {etiqueta}
      </div>

      {c.fase === 'vencido' ? (
        <Aviso tono="error" titulo="Se le pasó el plazo">
          {c.vence_apartado_en
            ? `El apartado venció el ${formatearFechaHora(c.vence_apartado_en)}. Sus piezas ya están libres: devuélvelas a su sitio. Lo abonado se queda, como dice la regla del apartado.`
            : 'Venció antes de llegar al mínimo para apartar, con pagos reportados. Sus piezas ya están libres. El administrador decide qué pasa con lo que pagó.'}
        </Aviso>
      ) : null}

      <div className="rejilla rejilla--2" style={{ marginBottom: 'var(--e-4)' }}>
        <div className="panel">
          <span className="panel__titulo">Entrega</span>
          {c.entrega === 'envio' ? (
            <>
              <div className="dato__valor" style={{ textTransform: 'uppercase' }}>{c.envio_empresa ?? 'Envio'}</div>
              <div className="campo__pista">{c.envio_agencia}{c.envio_direccion ? ` · ${c.envio_direccion}` : ''}</div>
              <div className="campo__pista">Cobro a destino: el envío lo paga ella al retirar.</div>
            </>
          ) : (
            <>
              <div className="dato__valor">Retira en tienda</div>
              <div className="campo__pista">Pídele la cédula al entregar.</div>
            </>
          )}
        </div>

        <div className="panel">
          <span className="panel__titulo">Pago</span>
          {c.con_precio ? (
            <>
              <div className="dato__valor">Pagó {formatearBcv(pagado)} de {formatearBcv(total)}</div>
              {c.fase === 'esperando_pago' && c.minimo_bcv !== null ? (
                <div className="campo__pista">Para apartar paga al menos {formatearBcv(Number(c.minimo_bcv))}.</div>
              ) : null}
              {c.fase === 'apartado' && c.vence_apartado_en ? (
                <div className="campo__pista">Tiene hasta el {formatearFechaHora(c.vence_apartado_en)} para pagar lo demás.</div>
              ) : null}
              {pagado > verificado ? (
                <div className="campo__pista">{formatearBcv(pagado - verificado)} todavía sin comprobar en el banco.</div>
              ) : null}
              {/* Un pedido de antes, con el pago reportado sin monto: lo
                  que reportó se enseña, y se carga como abono al
                  comprobarlo (el formulario de abajo ya lo trae). */}
              {c.pago_reportado_en && !conDinero && c.pago_referencia ? (
                <div className="campo__pista">
                  Reportó un pago sin monto: {textoMetodo(c.pago_metodo)}, ref. {c.pago_referencia}
                  {c.pago_fecha ? ` del ${formatearFecha(c.pago_fecha)}` : ''}. Cuando lo veas en el banco, cárgalo abajo.
                </div>
              ) : null}
            </>
          ) : !c.pago_reportado_en ? (
            <>
              <div className="dato__valor">Sin reportar</div>
              <div className="campo__pista">Todavía no ha cargado el pago. No despaches aún.</div>
            </>
          ) : c.pago_metodo === 'efectivo_bs' || c.pago_metodo === 'efectivo_usd' ? (
            <>
              <div className="dato__valor">Efectivo al retirar</div>
              <div className="campo__pista">Cobra al entregar.</div>
            </>
          ) : (
            <>
              <div className="dato__valor">Ref. {c.pago_referencia}</div>
              <div className="campo__pista">{textoMetodo(c.pago_metodo)}{c.pago_fecha ? ` del ${formatearFecha(c.pago_fecha)}` : ''}</div>
              <div className="campo__pista">Pago: C.I. {c.pago_cedula ?? '—'} · {c.pago_telefono ?? '—'}</div>
              {/* Si quien pagó no es quien pidió, se avisa: es lo primero que
                  confunde al comprobar en el banco. */}
              {c.pago_cedula && c.cliente_cedula && soloDigitos(c.pago_cedula) !== soloDigitos(c.cliente_cedula)
                ? <div className="campo__pista"><strong>Pagó un tercero.</strong></div>
                : null}
            </>
          )}
        </div>
      </div>

      <TablaPiezas
        conPrecio={c.con_precio}
        items={items.map((i) => ({
          modelo_id: i.modelo_id, foto_thumb_path: i.foto_thumb_path, nombre: i.nombre, variante: i.variante,
          sku: i.sku + (i.variantes_nota ? ` · ${i.variantes_nota}` : ''), donde: i.ubicacion, cantidad: i.cantidad,
          precio: i.precio_linea_usd,
        }))}
      />

      {c.con_precio && abonos.length > 0 ? (
        <div className="panel" style={{ marginTop: 'var(--e-4)' }}>
          <span className="panel__titulo">Abonos</span>
          <ListaAbonos abonos={abonos} abierto={abierto} esAdmin={esAdmin} alCambiar={alTerminar} />
          {abierto ? <Falta bcv={falta} tasa={tasa} listo={faltaVerificar > 0 ? 'Pagado completo. Falta comprobar en el banco lo que dice "Por verificar".' : 'Pagado completo y comprobado.'} /> : null}
        </div>
      ) : null}

      {/* ---------------- lo que se puede hacer */}

      {!c.con_precio && abierto ? (
        <CerrarPedidoDeAntes cabecera={c} alTerminar={alTerminar} />
      ) : null}

      {c.con_precio && abierto && falta > 0 && tasa ? (
        <CargarAbono
          id={c.reserva_id}
          falta={falta}
          tasa={tasa}
          titulo={pagado > 0 ? 'Cargar otro abono' : 'Cargar el pago'}
          preguntarSiLlego
          inicial={!conDinero && c.pago_reportado_en ? { metodo: c.pago_metodo, referencia: c.pago_referencia } : undefined}
          registrar={async (metodo, monto, referencia, verificadoYa) => {
            const { data, error: err } = await supabase.rpc('abonar_pedido', {
              p_reserva_id: c.reserva_id, p_metodo: metodo, p_monto: monto,
              p_referencia: referencia, p_verificado: verificadoYa,
            });
            if (err) throw new Error(mensajeDeError(err));
            return Number(data ?? 0);
          }}
          alGuardar={(resta) => alTerminar(resta > 0
            ? `Abono cargado a ${nombre}. Faltan ${formatearBcv(resta)}, hoy ${formatearBs(bsDeBcv(resta, tasa.tasa_bcv))}.`
            : `Abono cargado: el pedido de ${nombre} quedó pagado completo.`)}
        />
      ) : null}

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        {c.con_precio && abierto ? (
          <button
            type="button"
            className="boton boton--confirmar"
            disabled={trabajando || falta > 0 || faltaVerificar > 0.005}
            onClick={() => void entregar()}
          >
            {trabajando ? 'Guardando' : 'Entregar'}
          </button>
        ) : null}
        {c.cliente_telefono && abierto ? (
          <a className="boton boton--secundario" href={enlaceWhatsApp(c.cliente_telefono, mensaje)} target="_blank" rel="noreferrer">
            Mandarle su enlace
          </a>
        ) : null}
        {c.con_precio && abierto && !conDinero ? (
          <button type="button" className="boton boton--peligro" disabled={trabajando} onClick={() => void cancelar()}>
            Cancelar pedido
          </button>
        ) : null}
        {c.fase === 'vencido' && c.vence_apartado_en ? (
          <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={() => void archivar()}>
            Archivar
          </button>
        ) : null}
        {esAdmin && conDinero && (abierto || c.fase === 'vencido') ? (
          <CerrarConDinero
            rpc="admin_cerrar_pedido" argumentoId="p_reserva_id" id={c.reserva_id}
            pagadoBcv={Number(c.verificado_bcv ?? 0)} tasa={tasa} alTerminar={alTerminar}
            texto={c.fase === 'vencido' ? 'Cerrar y decidir el dinero' : 'Cancelar con dinero'}
          />
        ) : null}
      </div>
      {c.con_precio && abierto && falta <= 0 && faltaVerificar > 0.005 ? (
        <p className="campo__pista">Para entregar, marca "Llegó" en cada pago que ya viste en el banco.</p>
      ) : c.con_precio && abierto && falta > 0 ? (
        <p className="campo__pista">Se entrega cuando esté pagado completo. Si trae lo que falta, cárgalo arriba y entrega.</p>
      ) : null}
      {c.con_precio && abierto && conDinero && !esAdmin ? (
        <p className="campo__pista">Ya tiene pagos: si hay que cancelarlo, lo cierra el administrador.</p>
      ) : null}
    </div>
  );
}

/**
 * Un pedido del catálogo de antes del apartado (sus piezas no tienen el
 * precio congelado): se cobra completo al entregar, al precio de hoy, o se
 * cancela. Como siempre.
 */
function CerrarPedidoDeAntes({ cabecera, alTerminar }: {
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
        Es un pedido de antes del apartado: se cobra completo, al precio de hoy, y se registra la venta con
        estas piezas, a nombre de quien la cobra.
      </p>
    </div>
  );
}

/* ------------------------------------------------ venta por verificar */

/**
 * Una venta que se cobró sin comprobar el pago. Dice quién la vendió, cómo
 * pagó y con qué referencia: lo necesario para buscarla en el banco.
 *
 * Las que se cobraron por partes antes del apartado llevan sus abonos, y
 * siguen recibiendo los que falten. Mientras falte algo no se verifica.
 */
function VentaPorVerificar({ cabecera, items, abonos, tasa, esAdmin, alTerminar }: {
  cabecera: LineaPorVerificar;
  items: LineaPorVerificar[];
  abonos: AbonoDetalle[];
  tasa: Tasas | null;
  esAdmin: boolean;
  alTerminar: (mensaje: string) => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const piezas = items.reduce((n, i) => n + i.cantidad, 0);
  const falta = Number(cabecera.falta_bcv ?? 0);
  const recibidoBs = abonos.filter((a) => !a.anulado_en).reduce((s, a) => s + Number(a.monto_bs), 0);

  async function verificar() {
    setTrabajando(true);
    setError(null);
    const { error: err } = await supabase.rpc('verificar_venta', { p_venta_id: cabecera.venta_id });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar(`Venta ${cabecera.venta_id} verificada.`);
  }

  async function anular() {
    // Si ya abonó algo, se dice: las piezas vuelven, pero ese dinero está en
    // la cuenta de la tienda y hay que devolverlo o acordarlo con ella.
    const aviso = recibidoBs > 0
      ? `Ya abonó ${formatearBs(recibidoBs)}. Si la anulas, las piezas vuelven a su ubicación y ese dinero hay que devolvérselo o acordarlo con ella. ¿Anular?`
      : '¿El pago no llegó? La venta se anula y las piezas vuelven a su ubicación.';
    if (!window.confirm(aviso)) return;
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
            <Link className="etiqueta etiqueta--exito" to={`/clientes/${cabecera.cliente_id}`}>Ver su ficha</Link>
          ) : null}
          <p>
            Vendió <strong>{cabecera.vendedora ?? 'alguien sin perfil'}</strong> · {formatearFechaHora(cabecera.fecha)} ·
            {' '}{piezas} {piezas === 1 ? 'pieza' : 'piezas'}
          </p>
          <p className="pedido__total">
            {formatearBs(cabecera.total_bs)} · {formatearBcv(cabecera.total_bcv)} · {formatearBinance(cabecera.total_binance)}
          </p>
        </div>
        <span className="etiqueta etiqueta--alerta">{cabecera.pago_parcial ? 'Pago por partes' : 'Por verificar'}</span>
      </div>

      {cabecera.pago_parcial ? (
        <div className="panel" style={{ marginBottom: 'var(--e-4)' }}>
          <span className="panel__titulo">Abonos</span>
          <ListaAbonos abonos={abonos} abierto esAdmin={esAdmin} alCambiar={alTerminar} />
          <Falta bcv={falta} tasa={tasa} listo="Pagada completa. Falta comprobarla en el banco y verificarla." />
          <div className="campo__pista">
            {[cabecera.cliente_cedula ? `C.I. ${cabecera.cliente_cedula}` : null, cabecera.cliente_telefono].filter(Boolean).join(' · ')}
          </div>
        </div>
      ) : (
        <div className="panel" style={{ marginBottom: 'var(--e-4)' }}>
          <span className="panel__titulo">Cómo pagó</span>
          <div className="dato__valor">{textoMetodo(cabecera.metodo)}</div>
          <div className="campo__pista">
            {cabecera.pago_referencia ? `Ref. ${cabecera.pago_referencia}` : 'Sin referencia anotada'}
            {cabecera.cliente_cedula ? ` · C.I. ${cabecera.cliente_cedula}` : ''}
            {cabecera.cliente_telefono ? ` · ${cabecera.cliente_telefono}` : ''}
          </div>
        </div>
      )}

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

      {cabecera.pago_parcial && falta > 0 && tasa ? (
        <CargarAbono
          id={cabecera.venta_id}
          falta={falta}
          tasa={tasa}
          registrar={async (metodo, monto, referencia) => {
            const { data, error: err } = await supabase.rpc('registrar_abono', {
              p_venta_id: cabecera.venta_id, p_metodo: metodo, p_monto: monto, p_referencia: referencia,
            });
            if (err) throw new Error(mensajeDeError(err));
            return Number(data ?? 0);
          }}
          alGuardar={(resta) => alTerminar(resta > 0
            ? `Abono cargado en la venta ${cabecera.venta_id}. Faltan ${formatearBcv(resta)}, hoy ${formatearBs(bsDeBcv(resta, tasa.tasa_bcv))}.`
            : `Abono cargado: la venta ${cabecera.venta_id} quedó pagada completa. Falta verificarla.`)}
        />
      ) : null}

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        <button type="button" className="boton boton--confirmar" disabled={trabajando || falta > 0} onClick={() => void verificar()}>
          {trabajando ? 'Guardando' : 'Pago verificado'}
        </button>
        <button type="button" className="boton boton--peligro" disabled={trabajando} onClick={() => void anular()}>
          No llegó el pago: anular
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------ pedido de revendedor */

/**
 * El pedido de un revendedor, desde que él confirma el pago de su clienta.
 *
 *   por pagar a Lux  tiene su día para pagarle; lo que reporta llega como
 *                    "Por verificar" y aquí se comprueba en el banco
 *   en revisión      reportó todo: se aprueba si llegó
 *   vendido          aprobado: la venta está registrada a nombre de su
 *                    clienta y las piezas salieron del inventario; falta
 *                    que se las lleve
 *
 * Lo que su clienta le paga a él no aparece aquí: son dos deudas separadas.
 */
function PedidoDeRevendedor({ apartado: a, abonos, tasa, esAdmin, ahora, alTerminar }: {
  apartado: ApartadoEnTienda;
  abonos: AbonoDetalle[];
  tasa: Tasas | null;
  esAdmin: boolean;
  ahora: number;
  alTerminar: (mensaje: string) => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = Number(a.total_usd);
  const falta = Number(a.lux_falta_bcv ?? 0);
  const pagado = Number(a.lux_pagado_bcv ?? 0);
  const conDinero = abonos.some((x) => !x.anulado_en);
  const porCobrar = a.fase === 'por_pagar_lux' || a.fase === 'en_revision';

  async function hacer(rpc: string, mensaje: (dato: unknown) => string) {
    setTrabajando(true);
    setError(null);
    const { data, error: err } = await supabase.rpc(rpc, { p_apartado_id: a.id });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar(mensaje(data));
  }

  function aprobar() {
    const aviso = a.por_revisar > 0
      ? `Aprobar es decir que los ${a.por_revisar} pago(s) "Por verificar" llegaron a la cuenta. Se registra la venta a nombre de ${a.clienta} y las piezas salen del inventario. ¿Aprobar?`
      : `Se registra la venta a nombre de ${a.clienta} y las piezas salen del inventario. ¿Aprobar?`;
    if (!window.confirm(aviso)) return;
    void hacer('aprobar_apartado', (v) => `Aprobado: venta ${v as number}. Guarda sus piezas aparte hasta que ${a.revendedor} se las lleve.`);
  }

  function soltar() {
    if (!window.confirm(`¿Soltar el pedido de ${a.revendedor}? Sus piezas vuelven a estar libres en la tienda.`)) return;
    void (async () => {
      setTrabajando(true);
      setError(null);
      const { error: err } = await supabase.rpc('admin_cancelar_apartado', { p_apartado_id: a.id, p_motivo: null });
      setTrabajando(false);
      if (err) { setError(mensajeDeError(err)); return; }
      alTerminar('Pedido soltado: las piezas volvieron a la tienda.');
    })();
  }

  const etiqueta = (() => {
    switch (a.fase) {
      case 'por_pagar_lux': return <span className="etiqueta etiqueta--alerta">Por pagar · {tiempoRestante(a.plazo_lux_en, ahora) ?? 'vence ya'}</span>;
      case 'en_revision': return <span className="etiqueta etiqueta--alerta">Pagó todo · por aprobar</span>;
      case 'vendido': return <span className="etiqueta etiqueta--exito">Aprobado · por entregar</span>;
      case 'vencido': return <span className="etiqueta etiqueta--error">Se le pasó el día</span>;
      default: return null;
    }
  })();

  return (
    <div className="tarjeta">
      <div className="encabezado-pagina" style={{ marginBottom: 'var(--e-4)' }}>
        <div>
          <h2>{a.revendedor}</h2>
          <p>
            Para <strong>{a.clienta}</strong>
            {a.clienta_cedula ? ` · C.I. ${a.clienta_cedula}` : ''}
            {a.clienta_telefono ? ` · ${a.clienta_telefono}` : ''}
            {a.confirmado_en ? ` · confirmado el ${formatearFechaHora(a.confirmado_en)}` : ''} ·
            {' '}{a.piezas} {a.piezas === 1 ? 'pieza' : 'piezas'}
          </p>
          {a.ya_es_clienta ? <span className="etiqueta etiqueta--exito">Ya es clienta de la tienda</span> : null}
          <TresPrecios bcv={total} tasa={tasa} />
        </div>
        {etiqueta}
      </div>

      {a.fase === 'vencido' ? (
        <Aviso tono="error" titulo="Se le pasó el día para pagarle a Lux">
          Sus piezas ya están libres. Pagó {formatearBcv(pagado)} de {formatearBcv(total)}: el administrador
          decide si se le devuelve o se aprueba igual, si ya está completo.
        </Aviso>
      ) : null}

      <TablaPiezas
        conPrecio
        items={a.items.map((i) => ({
          modelo_id: i.modelo_id, foto_thumb_path: i.foto_thumb_path, nombre: i.nombre, variante: i.variante,
          sku: i.sku, donde: a.fase === 'vendido' ? 'Guardada para él' : i.donde, cantidad: i.cantidad, precio: i.precio_usd,
        }))}
      />

      {abonos.length > 0 ? (
        <div className="panel" style={{ marginTop: 'var(--e-4)' }}>
          <span className="panel__titulo">Lo que le ha pagado a Lux</span>
          <ListaAbonos abonos={abonos} abierto={porCobrar} esAdmin={esAdmin} alCambiar={alTerminar} />
          {porCobrar ? <Falta bcv={falta} tasa={tasa} listo="Pagó todo. Compruébalo en el banco y apruébalo." /> : null}
        </div>
      ) : porCobrar ? (
        <p className="campo__pista" style={{ marginTop: 'var(--e-4)' }}>
          Todavía no ha reportado su pago. Tiene hasta el {formatearFechaHora(a.plazo_lux_en)}.
        </p>
      ) : null}

      {porCobrar && falta > 0 && tasa ? (
        <CargarAbono
          id={-a.id}
          falta={falta}
          tasa={tasa}
          titulo="Pagó en la tienda"
          preguntarSiLlego
          registrar={async (metodo, monto, referencia, verificadoYa) => {
            const { data, error: err } = await supabase.rpc('abonar_apartado', {
              p_apartado_id: a.id, p_metodo: metodo, p_monto: monto, p_referencia: referencia, p_verificado: verificadoYa,
            });
            if (err) throw new Error(mensajeDeError(err));
            return Number(data ?? 0);
          }}
          alGuardar={(resta) => alTerminar(resta > 0
            ? `Pago cargado. A ${a.revendedor} le faltan ${formatearBcv(resta)}.`
            : `Pago cargado: ${a.revendedor} pagó todo. Falta aprobarlo.`)}
        />
      ) : null}

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        {(porCobrar || (a.fase === 'vencido' && esAdmin)) ? (
          <button type="button" className="boton boton--confirmar" disabled={trabajando || falta > 0} onClick={aprobar}>
            {trabajando ? 'Guardando' : 'Aprobar'}
          </button>
        ) : null}
        {a.fase === 'vendido' ? (
          <button
            type="button"
            className="boton boton--confirmar"
            disabled={trabajando}
            onClick={() => void hacer('marcar_entregado', () => `Entregado a ${a.revendedor}.`)}
          >
            {trabajando ? 'Guardando' : 'Se lo llevó'}
          </button>
        ) : null}
        {esAdmin && !conDinero && porCobrar ? (
          <button type="button" className="boton boton--peligro" disabled={trabajando} onClick={soltar}>
            Soltar pedido
          </button>
        ) : null}
        {esAdmin && conDinero && (porCobrar || a.fase === 'vencido') ? (
          <CerrarConDinero
            rpc="admin_cerrar_apartado" argumentoId="p_apartado_id" id={a.id}
            pagadoBcv={Number(a.lux_verificado_bcv ?? 0)} tasa={tasa} alTerminar={alTerminar}
            texto="Cerrar sin aprobar"
          />
        ) : null}
      </div>
      {porCobrar ? (
        <p className="campo__pista">
          Aprobar es decir que llegó todo: se registra la venta a su precio, a nombre de su clienta, y las
          piezas salen del inventario. Guárdalas aparte hasta que se las lleve.
        </p>
      ) : null}
    </div>
  );
}
