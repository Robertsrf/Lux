import { useState } from 'react';
import type { ReactNode } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import {
  abonoEnBcv, bsDeBcv, faltaTrasAbono, formatearBcv, formatearBinance, formatearBs,
  formatearFechaHora, margenDeAbono, restarCifras, sumarCifras,
} from '../lib/dinero';
import { METODOS_EN_DOLARES, METODOS_EN_PERSONA, METODOS_PAGO, PIDE_REFERENCIA } from '../lib/tipos';
import type { AbonoCambio, AbonoDetalle, EstadoPago, MetodoPago } from '../lib/tipos';

export const textoMetodo = (m: MetodoPago | null) =>
  METODOS_PAGO.find((x) => x.valor === m)?.texto ?? 'Sin forma de pago';

/** El monto de un pago en su moneda: "Bs 400,00", o "$4,00 Binance · Bs 600,00". */
export function montoDePago(p: { monto_bs: number; monto_usd: number | null }): string {
  return p.monto_usd !== null
    ? `${formatearBinance(Number(p.monto_usd))} · ${formatearBs(Number(p.monto_bs))}`
    : formatearBs(Number(p.monto_bs));
}

const ETIQUETA_ESTADO: Record<EstadoPago, { clase: string; texto: string }> = {
  por_revisar: { clase: 'etiqueta etiqueta--alerta', texto: 'Por verificar' },
  recibido: { clase: 'etiqueta etiqueta--exito', texto: 'Llegó' },
  no_llego: { clase: 'etiqueta etiqueta--error', texto: 'No llegó' },
};

/**
 * Un renglon de pago, igual en todas partes: el monto en la cifra de
 * siempre con su estado al lado, debajo cuando, como y la referencia, y lo
 * que faltaba despues de el. Lo usan la tienda (con acciones), el enlace de
 * la clienta y el panel del revendedor.
 */
export function FilaPago({ monto, estado, datos, quedaba, children }: {
  monto: string;
  estado: EstadoPago;
  /** Cuando, como, la referencia y quien: una linea de pista. */
  datos: string;
  /** Lo que faltaba despues de este pago, en dolares BCV. Null si no llego. */
  quedaba: number | null;
  children?: ReactNode;
}) {
  const e = ETIQUETA_ESTADO[estado];
  return (
    <li className={estado === 'no_llego' ? 'abono abono--anulado' : 'abono'}>
      <div className="abono__cabeza">
        <span className="abono__monto">{monto}</span>
        <span className={e.clase}>{e.texto}</span>
      </div>
      <div className="campo__pista">{datos}</div>
      {quedaba !== null ? (
        <div className="abono__quedaba">
          {quedaba > 0 ? <>Después de este, faltaban <strong>{formatearBcv(quedaba)}</strong></> : 'Con este quedó pagado'}
        </div>
      ) : null}
      {children}
    </li>
  );
}

function estadoDe(a: AbonoDetalle): EstadoPago {
  if (a.anulado_en) return 'no_llego';
  return a.verificado_en ? 'recibido' : 'por_revisar';
}

function quienDe(a: AbonoDetalle): string {
  if (a.origen === 'clienta') return 'lo reportó la clienta';
  if (a.origen === 'revendedor') return 'lo reportó el revendedor';
  return a.registrado_por ? `lo cargó ${a.registrado_por}` : 'lo cargó la tienda';
}

/**
 * Los abonos de un pedido, un apartado o una venta, con lo que se puede
 * hacer con cada uno.
 *
 * Las reglas son las de la base (`abono_se_puede_tocar`), y aqui solo se
 * reflejan para no enseñar un boton que va a decir que no:
 *   - la tienda verifica, corrige o dice que no llego un abono SIN
 *     verificar, mientras su pedido siga abierto;
 *   - un abono en efectivo lo anula solo el administrador, y pasarlo de
 *     efectivo a otra forma de pago (o al reves) tambien;
 *   - el administrador puede todo, siempre.
 * Cada cambio queda escrito, con quien, cuando, que decia antes y por que.
 */
export function ListaAbonos({ abonos, abierto, esAdmin, alCambiar }: {
  /** De un solo pedido, en orden. */
  abonos: AbonoDetalle[];
  /** Si su pedido o su venta siguen abiertos. */
  abierto: boolean;
  esAdmin: boolean;
  alCambiar: (mensaje: string) => void;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [error, setError] = useState<{ id: number; texto: string } | null>(null);

  if (abonos.length === 0) return null;

  async function hacer(id: number, rpc: string, args: Record<string, unknown>, mensaje: string) {
    setTrabajando(id);
    setError(null);
    const { error: err } = await supabase.rpc(rpc, args);
    setTrabajando(null);
    if (err) { setError({ id, texto: mensajeDeError(err) }); return; }
    setEditando(null);
    alCambiar(mensaje);
  }

  function noLlego(a: AbonoDetalle) {
    const aviso = `¿El pago de ${montoDePago(a)}${a.referencia ? ` (ref. ${a.referencia})` : ''} no llegó? `
      + 'Deja de contar en lo pagado. No se borra: queda anotado que no llegó, y por qué.';
    if (!window.confirm(aviso)) return;
    void hacer(a.id, 'anular_abono', { p_abono_id: a.id, p_motivo: null }, 'Anotado: ese pago no llegó.');
  }

  return (
    <ul className="abonos">
      {abonos.map((a) => {
        const estado = estadoDe(a);
        const enPersona = METODOS_EN_PERSONA.includes(a.metodo);
        const sinVerificar = !a.verificado_en && !a.anulado_en;
        const puedeTocar = !a.anulado_en && (esAdmin || (abierto && sinVerificar));
        const datos = [
          formatearFechaHora(a.fecha),
          textoMetodo(a.metodo),
          a.referencia ? `Ref. ${a.referencia}` : null,
          a.pago_fecha || a.pago_cedula ? `pagó ${[a.pago_fecha ? `el ${a.pago_fecha.split('-').reverse().join('/')}` : null, a.pago_cedula ? `C.I. ${a.pago_cedula}` : null, a.pago_telefono].filter(Boolean).join(' · ')}` : null,
          quienDe(a),
          a.anulado_en ? `no llegó${a.anulado_motivo && a.anulado_motivo !== 'el pago no llegó' ? `: ${a.anulado_motivo}` : ''}` : null,
          a.verificado_en && a.verificado_por ? `lo verificó ${a.verificado_por}` : null,
        ].filter(Boolean).join(' · ');

        return (
          <FilaPago key={a.id} monto={montoDePago(a)} estado={estado} datos={datos} quedaba={a.falta_despues_bcv === null ? null : Number(a.falta_despues_bcv)}>
            {a.cambios > 0 ? <Historial abonoId={a.id} cambios={a.cambios} /> : null}

            {editando === a.id ? (
              <CorregirAbono
                abono={a}
                abonos={abonos}
                esAdmin={esAdmin}
                guardando={trabajando === a.id}
                alGuardar={(metodo, monto, referencia, motivo) => void hacer(a.id, 'editar_abono', {
                  p_abono_id: a.id, p_metodo: metodo, p_monto: monto, p_referencia: referencia, p_motivo: motivo,
                }, 'Abono corregido. El cambio queda escrito.')}
                alCancelar={() => { setEditando(null); setError(null); }}
              />
            ) : puedeTocar ? (
              <div className="abono__acciones">
                {sinVerificar ? (
                  <button
                    type="button"
                    className="boton boton--secundario boton--pequeno"
                    disabled={trabajando === a.id}
                    onClick={() => void hacer(a.id, 'verificar_abono', { p_abono_id: a.id }, 'Pago verificado.')}
                  >
                    Llegó
                  </button>
                ) : null}
                <button
                  type="button"
                  className="boton boton--secundario boton--pequeno"
                  disabled={trabajando === a.id}
                  onClick={() => { setError(null); setEditando(a.id); }}
                >
                  Corregir
                </button>
                {esAdmin || !enPersona ? (
                  <button
                    type="button"
                    className="boton boton--peligro boton--pequeno"
                    disabled={trabajando === a.id}
                    onClick={() => noLlego(a)}
                  >
                    No llegó
                  </button>
                ) : null}
              </div>
            ) : null}

            {error?.id === a.id ? <p className="campo__error" role="alert">{error.texto}</p> : null}
          </FilaPago>
        );
      })}
    </ul>
  );
}

/**
 * Corregir un abono: la forma de pago, el monto en su moneda y la
 * referencia. Se recalcula con las tasas DEL DIA DEL ABONO, como en la base:
 * corregir un error no es cambiarle el dia.
 */
function CorregirAbono({ abono: a, abonos, esAdmin, guardando, alGuardar, alCancelar }: {
  abono: AbonoDetalle;
  abonos: AbonoDetalle[];
  esAdmin: boolean;
  guardando: boolean;
  alGuardar: (metodo: MetodoPago, monto: number, referencia: string | null, motivo: string | null) => void;
  alCancelar: () => void;
}) {
  const [metodo, setMetodo] = useState<MetodoPago>(a.metodo);
  const [monto, setMonto] = useState(String(a.monto_usd ?? a.monto_bs));
  const [referencia, setReferencia] = useState(a.referencia ?? '');
  const [motivo, setMotivo] = useState('');

  const enDolares = METODOS_EN_DOLARES.includes(metodo);
  const tasas = { tasa_venta: Number(a.tasa_venta), tasa_bcv: Number(a.tasa_bcv) };
  const valor = Number(monto.replace(',', '.'));
  const hayMonto = Number.isFinite(valor) && valor > 0;
  // Lo que puede valer este abono: el total menos los demas que cuentan.
  const otros = sumarCifras(abonos.filter((x) => x.id !== a.id && !x.anulado_en).map((x) => Number(x.monto_bcv)));
  const cabe = restarCifras(Number(a.total_bcv), otros);
  const nuevo = hayMonto ? abonoEnBcv(valor, enDolares, tasas) : null;
  const tras = nuevo ? faltaTrasAbono(cabe, nuevo.bcv, margenDeAbono(enDolares, tasas)) : null;
  // La vendedora no cruza entre efectivo y lo demas: el efectivo es lo
  // que se puede esconder.
  const efectivo = (m: MetodoPago) => m === 'efectivo_bs' || m === 'efectivo_usd';
  const metodos = esAdmin ? METODOS_PAGO : METODOS_PAGO.filter((m) => efectivo(m.valor) === efectivo(a.metodo));
  const id = `corr-${a.id}`;

  return (
    <div className="corregir-abono">
      <div className="fila">
        <div className="campo">
          <label htmlFor={`${id}-metodo`}>Cómo pagó</label>
          <select id={`${id}-metodo`} value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {metodos.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-monto`}>{enDolares ? 'Cuánto · $' : 'Cuánto · Bs'}</label>
          <input
            id={`${id}-monto`} inputMode="decimal" autoComplete="off"
            value={monto} onChange={(e) => setMonto(e.target.value)}
            aria-describedby={`${id}-pista`}
          />
        </div>
      </div>
      {PIDE_REFERENCIA.includes(metodo) ? (
        <div className="campo">
          <label htmlFor={`${id}-ref`}>Referencia</label>
          <input id={`${id}-ref`} inputMode="numeric" autoComplete="off" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        </div>
      ) : null}
      <div className="campo">
        <label htmlFor={`${id}-motivo`}>Por qué lo corriges</label>
        <input id={`${id}-motivo`} autoComplete="off" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se escribió mal el monto" />
      </div>
      <p className="campo__pista" id={`${id}-pista`} aria-live="polite">
        {!nuevo || !tras
          ? `A la tasa del día del abono. Puede ser hasta ${formatearBcv(cabe)}.`
          : tras.pasa
            ? `Es más de lo que cabe: como mucho ${formatearBcv(cabe)}, que ese día eran ${formatearBs(bsDeBcv(cabe, tasas.tasa_bcv))}.`
            : tras.falta > 0
              ? `Con esta corrección faltarían ${formatearBcv(tras.falta)}.`
              : 'Con esta corrección queda pagado completo.'}
      </p>
      <div className="acciones">
        <button
          type="button"
          className="boton boton--confirmar boton--pequeno"
          disabled={guardando || !hayMonto || Boolean(tras?.pasa)}
          onClick={() => alGuardar(metodo, valor, PIDE_REFERENCIA.includes(metodo) ? referencia.trim() || null : null, motivo.trim() || null)}
        >
          {guardando ? 'Guardando' : 'Guardar corrección'}
        </button>
        <button type="button" className="boton boton--secundario boton--pequeno" disabled={guardando} onClick={alCancelar}>
          Dejarlo como estaba
        </button>
      </div>
    </div>
  );
}

/** Lo que decia el abono antes de cada cambio. Se lee al abrirlo. */
function Historial({ abonoId, cambios }: { abonoId: number; cambios: number }) {
  const [filas, setFilas] = useState<AbonoCambio[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function abrir(abierto: boolean) {
    if (!abierto || filas) return;
    const { data, error: err } = await supabase
      .from('v_abono_cambios').select('*').eq('abono_id', abonoId).order('cambiado_en');
    if (err) { setError(mensajeDeError(err)); return; }
    setFilas((data as unknown as AbonoCambio[] | null) ?? []);
  }

  return (
    <details className="abono__historial" onToggle={(e) => void abrir(e.currentTarget.open)}>
      <summary>{cambios === 1 ? 'Se corrigió una vez' : `Se corrigió ${cambios} veces`}</summary>
      {error ? <p className="campo__error">{error}</p> : null}
      {filas ? (
        <ol>
          {filas.map((c) => (
            <li key={c.id}>
              <span className="abono__historial-cuando">{formatearFechaHora(c.cambiado_en)} · {c.cambiado_por ?? 'alguien'}</span>
              {c.que === 'anulado'
                ? <> dijo que no llegó el pago de {montoDePago(c.antes)}</>
                : <> cambió {montoDePago(c.antes)}, {textoMetodo(c.antes.metodo)}{c.antes.referencia ? `, ref. ${c.antes.referencia}` : ''} por {c.despues ? `${montoDePago(c.despues)}, ${textoMetodo(c.despues.metodo)}${c.despues.referencia ? `, ref. ${c.despues.referencia}` : ''}` : '—'}</>}
              {c.motivo ? <> · «{c.motivo}»</> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </details>
  );
}
