import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Aviso, Cargando, Vacio } from '../../../componentes/Piezas';
import { CargarAbono } from '../../../componentes/CargarAbono';
import { FilaPago, montoDePago, textoMetodo } from '../../../componentes/ListaAbonos';
import { PagoMovil } from '../../../componentes/PagoMovil';
import { ReportarPago } from '../../../componentes/ReportarPago';
import {
  bsDeBcv, formatearBcv, formatearBs, formatearFecha, formatearFechaHora, precioEnBs, tiempoRestante,
} from '../../../lib/dinero';
import type { Tasas } from '../../../lib/dinero';
import { urlPublicaFoto } from '../../../lib/fotos';
import { nombreConVariante } from '../../../lib/familias';
import { enlaceApartado, enlaceWhatsApp, rpcRv } from '../../../lib/revendedor';
import { useTasa } from '../../../hooks/useTasa';
import { useTextos } from '../../../hooks/useTextos';
import type { ApartadoRevendedor, FaseRv } from '../../../lib/tipos';
import { textoDeError, usePanelRv } from '../contexto';

type Filtro = 'por_hacer' | 'deben' | 'todos';

const POR_HACER: FaseRv[] = ['esperando_pago', 'por_confirmar', 'por_pagar_lux', 'en_revision', 'vendido'];

/**
 * Sus pedidos, cada uno en su fase, con las dos cuentas separadas:
 *   - lo que su clienta le paga a ÉL, pago por pago: los que ella reporta
 *     desde su enlace llegan "por revisar" y él dice si le llegaron;
 *   - lo que él le paga a Lux: desde que confirma, tiene su día para
 *     pagarle, y la tienda lo aprueba.
 *
 * Arriba lo que pide que haga algo. Después lo que sus clientas le deben:
 * ahí vive su crédito.
 */
export function ApartadosRv() {
  const { siSeCerro, recargar: recargarResumen, resumen } = usePanelRv();
  const { tasa } = useTasa();
  const [lista, setLista] = useState<ApartadoRevendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Inicio manda aquí con ?ver=deben, desde "Tus clientas te deben".
  const [parametros] = useSearchParams();
  const [filtro, setFiltro] = useState<Filtro>(parametros.get('ver') === 'deben' ? 'deben' : 'por_hacer');
  const [ahora, setAhora] = useState(Date.now());

  const cargar = useCallback(async () => {
    try {
      setLista(await rpcRv<ApartadoRevendedor[]>('rv_apartados'));
      setError(null);
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setCargando(false);
  }, [siSeCerro]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const grupos = useMemo(() => ({
    por_hacer: lista.filter((a) => a.fase ? POR_HACER.includes(a.fase) : a.estado === 'abierto'),
    deben: lista.filter((a) => Number(a.falta_usd) > 0 && Boolean(a.confirmado_en) && a.fase !== 'vencido' && a.fase !== 'cancelado'),
    todos: lista,
  }), [lista]);

  function alTerminar(mensaje: string) {
    setAviso(mensaje);
    void cargar();
    void recargarResumen();
  }

  if (cargando) return <Cargando texto="Buscando tus pedidos" />;

  const visibles = grupos[filtro];
  const teDeben = grupos.deben.reduce((n, a) => n + Number(a.falta_usd), 0);

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Pedidos</h1>
          <p>Lo que te piden tus clientas, lo que te han pagado y lo que le pagas a Lux.</p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={() => { setAviso(null); void cargar(); }}>Actualizar</button>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudieron leer tus pedidos">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      <div className="rv-filtro" role="group" aria-label="Qué pedidos ver">
        <button type="button" aria-pressed={filtro === 'por_hacer'} onClick={() => setFiltro('por_hacer')}>
          Por hacer · {grupos.por_hacer.length}
        </button>
        <button type="button" aria-pressed={filtro === 'deben'} onClick={() => setFiltro('deben')}>
          Te deben · {grupos.deben.length}
        </button>
        <button type="button" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>
          Todos · {grupos.todos.length}
        </button>
      </div>

      {filtro === 'deben' && grupos.deben.length > 0 ? (
        <p className="abonos__falta" style={{ marginBottom: 'var(--e-4)' }}>
          Tus clientas te deben <strong>{formatearBcv(teDeben)}</strong>
          {tasa ? <>, hoy <strong>{formatearBs(bsDeBcv(teDeben, tasa.tasa_bcv))}</strong></> : null}
          {grupos.deben.length === 1 ? ', en 1 pedido' : `, en ${grupos.deben.length} pedidos`}.
          {' '}Cada vez que una te pague, toca "Cargar un pago" en su pedido y se lo vas restando.
        </p>
      ) : null}

      {visibles.length === 0 ? (
        <Vacio titulo={filtro === 'por_hacer' ? 'No tienes nada pendiente' : filtro === 'deben' ? 'Nadie te debe' : 'Todavía no hay pedidos'}>
          <p>
            {filtro === 'deben'
              ? 'Aquí aparecen los pedidos que tu clienta todavía no te termina de pagar.'
              : 'Manda tu catálogo por WhatsApp desde Inicio, o vende desde "Vender": los pedidos te llegan aquí.'}
          </p>
        </Vacio>
      ) : (
        <div className="pila">
          {visibles.map((a) => (
            <TarjetaPedido
              key={a.id} a={a} tasa={tasa} ahora={ahora}
              horasParaPagar={resumen?.horas_para_pagar ?? null}
              alTerminar={alTerminar} siSeCerro={siSeCerro}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaPedido({ a, tasa, ahora, horasParaPagar, alTerminar, siSeCerro }: {
  a: ApartadoRevendedor;
  tasa: Tasas | null;
  ahora: number;
  horasParaPagar: number | null;
  alTerminar: (mensaje: string) => void;
  siSeCerro: (e: unknown) => boolean;
}) {
  const textos = useTextos();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abonando, setAbonando] = useState(false);
  const clienta = [a.cliente.nombre, a.cliente.apellido].filter(Boolean).join(' ');
  const primer = a.cliente.nombre.trim().split(/\s+/)[0];
  const fase: FaseRv = a.fase ?? (a.estado === 'abierto' ? 'por_pagar_lux' : a.estado === 'retirado' ? 'entregado' : 'cancelado');
  const total = Number(a.total_usd);
  const lux = Number(a.lux_usd);
  const falta = Number(a.falta_usd);
  const abonado = Number(a.abonado_usd);
  const minimo = Number(a.minimo_usd ?? total);
  const luxFalta = Number(a.lux_falta_usd ?? lux);
  const luxPagado = Number(a.lux_pagado_usd ?? 0);
  const sinConfirmar = fase === 'esperando_pago' || fase === 'por_confirmar';
  const porRevisar = a.abonos.filter((b) => b.estado === 'por_revisar');
  const puedeConfirmar = sinConfirmar && abonado >= minimo - 0.005;
  const puedeAbonar = falta > 0 && !['vencido', 'cancelado'].includes(fase);
  const plazoClientaPaso = falta > 0 && (a.vence_clienta_en ? new Date(a.vence_clienta_en).getTime() <= ahora : false);
  const puedeCancelar = ['esperando_pago', 'por_confirmar', 'por_pagar_lux'].includes(fase) && luxPagado <= 0;

  async function llamar(funcion: string, args: Record<string, unknown>, mensaje: string) {
    setTrabajando(true);
    setError(null);
    try {
      await rpcRv(funcion, args);
      alTerminar(mensaje);
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setTrabajando(false);
  }

  function confirmar() {
    const aviso = porRevisar.length > 0
      ? `Al confirmar das por buenos los ${porRevisar.length} pago(s) que ${primer} reportó. Desde ahora tienes ${horasParaPagar ?? 24} horas para pagarle ${formatearBcv(lux)} a Lux. ¿Confirmar?`
      : `Desde ahora tienes ${horasParaPagar ?? 24} horas para pagarle ${formatearBcv(lux)} a Lux. ¿Confirmar?`;
    if (!window.confirm(aviso)) return;
    void llamar('rv_confirmar', { p_apartado_id: a.id }, `Pedido de ${primer} confirmado. Págale ${formatearBcv(lux)} a Lux antes de que se venza tu plazo.`);
  }

  function cancelar() {
    const aviso = abonado > 0
      ? `${primer} ya te pagó ${formatearBcv(abonado)}. Si cancelas, las piezas vuelven a la tienda y ese dinero lo arreglas con ella. ¿Cancelar?`
      : '¿Cancelar este pedido? Las piezas vuelven a la tienda.';
    if (!window.confirm(aviso)) return;
    void llamar('rv_cancelar_apartado', { p_apartado_id: a.id, p_motivo: null }, `Pedido de ${primer} cancelado: las piezas volvieron a la tienda.`);
  }

  const etiqueta = (() => {
    switch (fase) {
      case 'esperando_pago': return <span className="etiqueta etiqueta--alerta">Esperando su pago · {tiempoRestante(a.expira_en, ahora) ?? 'vence ya'}</span>;
      case 'por_confirmar': return <span className="etiqueta etiqueta--alerta">Te reportó un pago</span>;
      case 'por_pagar_lux': return <span className="etiqueta etiqueta--alerta">Págale a Lux · {tiempoRestante(a.plazo_lux_en ?? a.expira_en, ahora) ?? 'vence ya'}</span>;
      case 'en_revision': return <span className="etiqueta etiqueta--alerta">Lux revisa tu pago</span>;
      case 'vendido': return <span className="etiqueta etiqueta--exito">Aprobado · retíralo en la tienda</span>;
      case 'entregado': return <span className="etiqueta etiqueta--exito">Retirado{a.retirado_en ? ` el ${formatearFecha(a.retirado_en)}` : ''}</span>;
      case 'vencido': return <span className="etiqueta etiqueta--error">Venció</span>;
      default: return <span className="etiqueta">Cancelado</span>;
    }
  })();

  const mensajeClienta = `Hola ${primer}, aquí ves tu pedido y me avisas cuando pagues: ${enlaceApartado(a.token)}`;

  return (
    <div className="tarjeta">
      <div className="encabezado-pagina" style={{ marginBottom: 'var(--e-4)' }}>
        <div>
          <h2>{clienta}</h2>
          <p>
            {[a.cliente.cedula ? `C.I. ${a.cliente.cedula}` : null, a.cliente.telefono,
              `${a.origen === 'panel' ? 'lo vendiste' : 'lo pidió'} el ${formatearFecha(a.creado_en)}`]
              .filter(Boolean).join(' · ')}
          </p>
          <p className="pedido__total">
            Te paga {formatearBcv(total)}
            {tasa ? <> · {formatearBs(precioEnBs(total, tasa))}</> : null}
          </p>
        </div>
        {etiqueta}
      </div>

      {/* Una línea por pieza y no una tabla: en el teléfono cinco columnas
          se deslizaban a lo ancho y no se leía ninguna. */}
      <div className="lineas-cobro">
        {a.items.map((i) => {
          const foto = urlPublicaFoto(i.foto_thumb_path);
          return (
            <div className="linea-cobro" key={i.modelo_id}>
              {foto ? <img className="linea-cobro__foto" src={foto} alt="" loading="lazy" /> : <span className="linea-cobro__foto" />}
              <div>
                <div className="linea-cobro__nombre">{nombreConVariante(i.nombre, i.variante)}</div>
                <div className="linea-cobro__precio">
                  A tu clienta <span className="rv-precio__cifra">{formatearBcv(Number(i.precio_usd))}</span>
                  {' · '}te sale <span className="rv-precio__cifra">{formatearBcv(Number(i.precio_lux_usd))}</span>
                </div>
              </div>
              <span className="contador__valor" aria-label={`${i.cantidad} piezas`}>×{i.cantidad}</span>
            </div>
          );
        })}
      </div>

      {/* ---------------- lo que su clienta le paga a él */}
      <div className="panel">
        <span className="panel__titulo">Lo que te ha pagado {primer}</span>
        {a.abonos.length > 0 ? (
          <ul className="abonos" style={{ marginTop: 'var(--e-3)' }}>
            {a.abonos.map((b, n) => (
              <FilaPago
                key={b.id ?? `${b.fecha}-${n}`}
                monto={montoDePago(b)}
                estado={b.estado ?? 'recibido'}
                quedaba={b.falta_despues_bcv === null || b.falta_despues_bcv === undefined ? null : Number(b.falta_despues_bcv)}
                datos={[
                  formatearFechaHora(b.fecha), textoMetodo(b.metodo),
                  b.referencia ? `Ref. ${b.referencia}` : null,
                  b.pago_cedula ? `pagó C.I. ${b.pago_cedula}` : null,
                  b.origen === 'clienta' ? 'lo reportó ella' : 'lo cargaste tú',
                ].filter(Boolean).join(' · ')}
              >
                {b.estado === 'por_revisar' && b.id ? (
                  <div className="abono__acciones">
                    <button
                      type="button" className="boton boton--secundario boton--pequeno" disabled={trabajando}
                      onClick={() => void llamar('rv_revisar_pago', { p_abono_id: b.id, p_llego: true, p_motivo: null }, `Pago de ${primer} confirmado.`)}
                    >
                      Me llegó
                    </button>
                    <button
                      type="button" className="boton boton--peligro boton--pequeno" disabled={trabajando}
                      onClick={() => {
                        if (!window.confirm(`¿No te llegó el pago de ${montoDePago(b)}? Deja de contar en lo que te ha pagado.`)) return;
                        void llamar('rv_revisar_pago', { p_abono_id: b.id, p_llego: false, p_motivo: null }, 'Anotado: ese pago no te llegó.');
                      }}
                    >
                      No me llegó
                    </button>
                  </div>
                ) : b.estado === 'recibido' && b.id && fase !== 'cancelado' ? (
                  <div className="abono__acciones">
                    <button
                      type="button" className="boton boton--peligro boton--pequeno" disabled={trabajando}
                      onClick={() => {
                        if (!window.confirm(`¿Quitar el pago de ${montoDePago(b)}? Deja de contar en lo que te ha pagado ${primer} y vuelve a lo que te debe. Queda tachado en la lista.`)) return;
                        void llamar('rv_revisar_pago', {
                          p_abono_id: b.id, p_llego: false,
                          p_motivo: b.origen === 'clienta' ? 'no llegó' : 'lo quitó el revendedor',
                        }, 'Listo: ese pago ya no cuenta.');
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                ) : null}
              </FilaPago>
            ))}
          </ul>
        ) : <p className="campo__pista">Todavía no te ha pagado nada.</p>}
        {falta > 0 ? (
          <p className="abonos__falta">
            Te faltan <strong>{formatearBcv(falta)}</strong>
            {tasa ? <>, hoy <strong>{formatearBs(bsDeBcv(falta, tasa.tasa_bcv))}</strong></> : null}
            {a.vence_clienta_en && !plazoClientaPaso ? <>, hasta el {formatearFechaHora(a.vence_clienta_en)}</> : null}.
          </p>
        ) : (
          <p className="abonos__falta abonos__falta--listo">Te pagó completo.</p>
        )}
        {plazoClientaPaso ? (
          <p className="campo__error">
            Se le pasó el plazo que le diste: era hasta el {formatearFechaHora(a.vence_clienta_en)}. Igual puedes seguir cargando lo que te pague.
          </p>
        ) : null}
      </div>

      {sinConfirmar ? (
        <p className="campo__pista">
          {puedeConfirmar
            ? `Cuando veas en tu banco que te llegó, confirma el pedido: desde ahí tienes ${horasParaPagar ?? 24} horas para pagarle ${formatearBcv(lux)} a Lux.`
            : minimo < total
              ? `Para confirmar, ${primer} tiene que pagarte al menos ${formatearBcv(minimo)}.`
              : `Para confirmar, ${primer} tiene que pagarte el total: no tienes días de crédito en "Mi catálogo".`}
        </p>
      ) : null}

      {/* ---------------- lo que él le paga a Lux */}
      {a.confirmado_en && fase !== 'cancelado' ? (
        <div className="panel" style={{ marginTop: 'var(--e-4)' }}>
          <span className="panel__titulo">Lo que le pagas a Lux</span>
          <p className="rv-apartado__lux" style={{ marginTop: 'var(--e-3)' }}>
            {formatearBcv(lux)}{tasa ? <>, hoy <strong>{formatearBs(precioEnBs(lux, tasa))}</strong></> : null}
            {' · '}ganas <strong>{formatearBcv(total - lux)}</strong>
          </p>
          {(a.pagos_lux ?? []).length > 0 ? (
            <ul className="abonos" style={{ marginTop: 'var(--e-3)' }}>
              {(a.pagos_lux ?? []).map((p) => (
                <FilaPago
                  key={p.id}
                  monto={montoDePago(p)}
                  estado={p.estado}
                  quedaba={p.falta_despues_bcv === null ? null : Number(p.falta_despues_bcv)}
                  datos={[formatearFechaHora(p.fecha), textoMetodo(p.metodo), p.referencia ? `Ref. ${p.referencia}` : null,
                    p.estado === 'por_revisar' ? 'Lux lo comprueba en su banco' : null].filter(Boolean).join(' · ')}
                />
              ))}
            </ul>
          ) : null}
          {fase === 'por_pagar_lux' ? (
            <p className="abonos__falta">
              Te falta pagarle <strong>{formatearBcv(luxFalta)}</strong>
              {tasa ? <>, hoy <strong>{formatearBs(bsDeBcv(luxFalta, tasa.tasa_bcv))}</strong></> : null}, hasta el {formatearFechaHora(a.plazo_lux_en)}.
            </p>
          ) : fase === 'en_revision' ? (
            <p className="abonos__falta abonos__falta--listo">Le pagaste todo. Lux lo comprueba y lo aprueba.</p>
          ) : fase === 'vendido' ? (
            <p className="abonos__falta abonos__falta--listo">Aprobado. Tus piezas te esperan en la tienda.</p>
          ) : fase === 'vencido' ? (
            <p className="campo__error">Se te pasó el plazo. Si le pagaste algo a Lux, escríbele a la tienda.</p>
          ) : null}
        </div>
      ) : null}

      {fase === 'por_pagar_lux' && tasa && luxFalta > 0 ? (
        <div className="rv-abonar">
          {textos.pago_movil_cedula || textos.pago_movil_telefono || textos.pago_movil_banco ? (
            <PagoMovil
              cedula={textos.pago_movil_cedula ?? ''}
              telefono={textos.pago_movil_telefono ?? ''}
              banco={textos.pago_movil_banco ?? ''}
            />
          ) : null}
          <ReportarPago
            id={`lux-${a.id}`}
            falta={luxFalta}
            tasa={tasa}
            pideTitular={false}
            boton="Avisar que le pagué a Lux"
            enviar={async (p) => {
              try {
                await rpcRv('rv_pagar_lux', {
                  p_apartado_id: a.id, p_metodo: p.metodo, p_monto: p.monto, p_referencia: p.referencia, p_fecha: p.fecha,
                });
                alTerminar('Listo: Lux comprueba tu pago y aprueba el pedido.');
              } catch (e) {
                if (!siSeCerro(e)) throw new Error(textoDeError(e));
              }
            }}
          />
        </div>
      ) : null}

      {puedeAbonar && tasa && abonando ? (
        <div className="rv-abonar">
          <CargarAbono
            id={a.id}
            falta={falta}
            tasa={tasa}
            titulo={`Cargar un pago de ${primer}`}
            registrar={async (metodo, monto, referencia) => {
              try {
                return Number(await rpcRv<number>('rv_abonar', {
                  p_apartado_id: a.id, p_metodo: metodo, p_monto: monto, p_referencia: referencia,
                }));
              } catch (e) {
                if (siSeCerro(e)) return falta;
                throw new Error(textoDeError(e));
              }
            }}
            alGuardar={(resta) => alTerminar(resta > 0
              ? `Pago de ${primer} cargado. Le faltan ${formatearBcv(resta)}, hoy ${formatearBs(bsDeBcv(resta, tasa.tasa_bcv))}.`
              : `Pago cargado: ${primer} te pagó completo.`)}
          />
        </div>
      ) : null}

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        {sinConfirmar ? (
          <button type="button" className="boton boton--confirmar" disabled={trabajando || !puedeConfirmar} onClick={confirmar}>
            {trabajando ? 'Guardando' : 'Confirmar el pedido'}
          </button>
        ) : null}
        {puedeAbonar && tasa ? (
          <button type="button" className={abonando || sinConfirmar ? 'boton boton--secundario' : 'boton boton--confirmar'} onClick={() => setAbonando((x) => !x)}>
            {abonando ? 'No cargar pago' : 'Cargar un pago'}
          </button>
        ) : null}
        {a.cliente.telefono ? (
          <a className="boton boton--secundario" href={enlaceWhatsApp(a.cliente.telefono, mensajeClienta)} target="_blank" rel="noopener noreferrer">
            Mandarle su enlace
          </a>
        ) : null}
        {puedeCancelar ? (
          <button type="button" className="boton boton--peligro" disabled={trabajando} onClick={cancelar}>
            Cancelar pedido
          </button>
        ) : null}
      </div>
    </div>
  );
}
