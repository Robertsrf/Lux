import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, Vacio } from '../../componentes/Piezas';
import { MiniaturaTocable } from '../../componentes/MiniaturaTocable';
import { ListaAbonos } from '../../componentes/ListaAbonos';
import { CargarAbono } from '../../componentes/CargarAbono';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { useTasa } from '../../hooks/useTasa';
import { useFotosGrandes } from '../../hooks/useFotosGrandes';
import {
  bsDeBcv, formatearBcv, formatearBs, formatearDescuento, formatearFecha, formatearFechaHora, sumarCifras,
} from '../../lib/dinero';
import { nombreConVariante } from '../../lib/familias';
import type { AbonoDetalle, LineaPorVerificar, VentaACredito } from '../../lib/tipos';
import { InventarioDeRevendedor } from '../../componentes/InventarioDeRevendedor';

/** Lo que debe una clienta: sus ventas a crédito y por partes abiertas. */
interface DeudaDeClienta {
  cliente_id: number;
  cliente: string;
  cedula: string | null;
  telefono: string | null;
  descuento_pct: number | null;
  credito_dias: number | null;
  credito_tope_usd: number | null;
  debe: number;
  desde: string;
  /** El vencimiento más cercano de lo que todavía debe; null si nada tiene plazo. */
  vence: string | null;
  vencida: boolean;
  ventas: VentaACredito[];
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

/**
 * Crédito (esquema-credito.sql, #71): quién le debe a la tienda.
 *
 * Una fila por clienta con lo que debe, las vencidas primero. Al abrirla,
 * cada venta con sus piezas (lo que se cobró y la etiqueta), sus pagos y
 * "Cargar un pago". Lo que falta sale de `falta_bcv_de` por `v_credito`:
 * esta pantalla no lo recalcula. Entran también las ventas por partes de
 * antes que siguen abiertas, sin plazo.
 *
 * Solo el administrador: `v_credito` no devuelve nada a nadie más.
 */
export function Credito() {
  const { tasa } = useTasa();
  const [filas, setFilas] = useState<VentaACredito[]>([]);
  const [lineas, setLineas] = useState<LineaPorVerificar[]>([]);
  const [abonos, setAbonos] = useState<AbonoDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [falta71, setFalta71] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase.from('v_credito').select('*').order('fecha');
    if (err) {
      // 42P01: la vista no existe todavía (falta el SQL #71).
      if (err.code === '42P01' || err.code === 'PGRST205') setFalta71(true);
      else setError(mensajeDeError(err));
      setCargando(false);
      return;
    }
    const ventas = ((data as VentaACredito[] | null) ?? []).map((f) => ({
      ...f,
      total_bs: Number(f.total_bs), total_bcv: Number(f.total_bcv),
      pagado_bcv: Number(f.pagado_bcv), falta_bcv: Number(f.falta_bcv),
      descuento_pct: num(f.descuento_pct), credito_dias: num(f.credito_dias), credito_tope_usd: num(f.credito_tope_usd),
    }));
    const ids = ventas.map((v) => v.venta_id);
    const [deLineas, deAbonos] = ids.length
      ? await Promise.all([
        supabase.from('v_ventas_por_verificar').select('*').in('venta_id', ids),
        supabase.from('v_abonos_detalle').select('*').in('venta_id', ids).order('fecha').order('id'),
      ])
      : [null, null];
    if (deLineas?.error || deAbonos?.error) setError(mensajeDeError((deLineas?.error ?? deAbonos?.error)!));
    setFilas(ventas);
    setLineas((deLineas?.data as unknown as LineaPorVerificar[] | null) ?? []);
    setAbonos((deAbonos?.data as unknown as AbonoDetalle[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // Todos los useMemo antes del primer return (React 310).
  const deudas = useMemo<DeudaDeClienta[]>(() => {
    const porClienta = new Map<number, DeudaDeClienta>();
    for (const v of filas) {
      let d = porClienta.get(v.cliente_id);
      if (!d) {
        d = {
          cliente_id: v.cliente_id, cliente: v.cliente, cedula: v.cedula, telefono: v.telefono,
          descuento_pct: v.descuento_pct, credito_dias: v.credito_dias, credito_tope_usd: v.credito_tope_usd,
          debe: 0, desde: v.fecha, vence: null, vencida: false, ventas: [],
        };
        porClienta.set(v.cliente_id, d);
      }
      d.ventas.push(v);
      d.debe = sumarCifras([d.debe, v.falta_bcv]);
      if (v.fecha < d.desde) d.desde = v.fecha;
      if (v.falta_bcv > 0 && v.credito_vence && (d.vence === null || v.credito_vence < d.vence)) d.vence = v.credito_vence;
      if (v.vencida) d.vencida = true;
    }
    return [...porClienta.values()].sort((a, b) =>
      Number(b.vencida) - Number(a.vencida)
      || (a.vence ?? '9999').localeCompare(b.vence ?? '9999')
      || b.debe - a.debe);
  }, [filas]);

  const total = useMemo(() => sumarCifras(deudas.map((d) => d.debe)), [deudas]);
  const vencidas = useMemo(() => deudas.filter((d) => d.vencida).length, [deudas]);

  const visor = useVisorFoto();
  const fotos = useFotosGrandes(useMemo(() => lineas.map((l) => l.modelo_id), [lineas]));
  const verFotos = useCallback((piezas: LineaPorVerificar[], i: number) => {
    const fichas: FotoAmpliada[] = piezas.map((p, j) => ({
      clave: `${j}-${p.modelo_id}`,
      nombre: p.nombre,
      variantes: [{
        id: p.modelo_id, etiqueta: p.variante, sku: p.sku,
        path: fotos.get(p.modelo_id) ?? null, thumbPath: p.foto_thumb_path,
      }],
    }));
    const elegida = fichas[i];
    if (elegida) visor.abrir(elegida, fichas);
  }, [fotos, visor.abrir]);

  function alTerminar(mensaje: string) {
    setAviso(mensaje);
    void cargar();
  }

  if (cargando) return <Cargando texto="Buscando quién debe" />;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Crédito</h1>
          <p>
            Quién le debe a la tienda: las ventas a crédito y las ventas por partes que siguen abiertas.
            El crédito de cada clienta se da en su ficha.
          </p>
        </div>
      </div>

      {falta71 ? (
        <Aviso tono="alerta" titulo="Falta el SQL del crédito">
          Corre <code>esquema-credito.sql</code> (#71) en el SQL Editor y recarga esta pantalla.
        </Aviso>
      ) : null}
      {error ? <Aviso tono="error" titulo="No se pudo leer todo">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      {!falta71 && deudas.length === 0 ? (
        <Vacio titulo="Nadie debe nada">
          <p>Cuando una clienta se lleve algo a crédito, aparece aquí hasta que lo pague.</p>
        </Vacio>
      ) : null}

      {deudas.length > 0 ? (
        <div className="panel" style={{ marginBottom: 'var(--e-5)' }}>
          <span className="panel__titulo">Le deben a la tienda</span>
          <p className="pedido__total">
            {formatearBcv(total)}{tasa ? <> · hoy {formatearBs(bsDeBcv(total, tasa.tasa_bcv))}</> : null}
          </p>
          <p className="campo__pista">
            {deudas.length} {deudas.length === 1 ? 'clienta' : 'clientas'}
            {vencidas > 0 ? ` · ${vencidas} con algo vencido` : ''}
          </p>
        </div>
      ) : null}

      {deudas.map((d) => {
        const abiertaEsta = abierta === d.cliente_id;
        return (
          <div className="tarjeta" key={d.cliente_id} style={{ marginBottom: 'var(--e-4)' }}>
            <div className="encabezado-pagina" style={{ marginBottom: abiertaEsta ? 'var(--e-4)' : 0 }}>
              <div>
                <h2>{d.cliente}</h2>
                <p>
                  Debe <strong>{formatearBcv(d.debe)}</strong>
                  {tasa ? <>, hoy <strong>{formatearBs(bsDeBcv(d.debe, tasa.tasa_bcv))}</strong></> : null}
                  {' '}· desde el {formatearFecha(d.desde)}
                </p>
                <p className="campo__pista">
                  {[
                    d.cedula ? `C.I. ${d.cedula}` : null,
                    d.telefono,
                    d.descuento_pct ? `${formatearDescuento(d.descuento_pct)} de descuento` : null,
                    d.credito_dias ? `crédito de ${d.credito_dias} ${d.credito_dias === 1 ? 'día' : 'días'}` : 'sin crédito en su ficha',
                    d.credito_tope_usd ? `tope ${formatearBcv(d.credito_tope_usd)}` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--e-2)' }}>
                <span className={d.vencida ? 'etiqueta etiqueta--error' : 'etiqueta etiqueta--alerta'}>
                  {d.vencida
                    ? `Vencido desde el ${formatearFecha(d.vence)}`
                    : d.vence ? `Vence el ${formatearFecha(d.vence)}` : d.debe > 0 ? 'Por partes, sin plazo' : 'Pagado: falta verificar'}
                </span>
                <button
                  type="button"
                  className="boton boton--secundario boton--pequeno"
                  aria-expanded={abiertaEsta}
                  onClick={() => setAbierta(abiertaEsta ? null : d.cliente_id)}
                >
                  {abiertaEsta ? 'Cerrar' : 'Ver lo que se llevó'}
                </button>
              </div>
            </div>

            {abiertaEsta ? (
              <>
                <p><Link to={`/clientes/${d.cliente_id}`}>Ver su ficha</Link></p>
                <InventarioDeRevendedor clienteId={d.cliente_id} />
                {d.ventas.map((v) => (
                  <VentaDeCredito
                    key={v.venta_id}
                    venta={v}
                    piezas={lineas.filter((l) => l.venta_id === v.venta_id)}
                    abonos={abonos.filter((a) => a.venta_id === v.venta_id)}
                    tasa={tasa}
                    verFotos={verFotos}
                    alTerminar={alTerminar}
                  />
                ))}
              </>
            ) : null}
          </div>
        );
      })}

      <VisorFoto {...visor.props} />
    </div>
  );
}

/** Una venta a crédito (o por partes de antes): sus piezas, sus pagos y cargar otro. */
function VentaDeCredito({ venta, piezas, abonos, tasa, verFotos, alTerminar }: {
  venta: VentaACredito;
  piezas: LineaPorVerificar[];
  abonos: AbonoDetalle[];
  tasa: ReturnType<typeof useTasa>['tasa'];
  verFotos: (piezas: LineaPorVerificar[], i: number) => void;
  alTerminar: (mensaje: string) => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const extraBs = Number(piezas[0]?.extra_bs ?? 0);
  const extraNota = piezas[0]?.extra_nota ?? null;

  async function verificar() {
    setTrabajando(true);
    setError(null);
    const { error: err } = await supabase.rpc('verificar_venta', { p_venta_id: venta.venta_id });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar(`Venta ${venta.venta_id} pagada y verificada: sale de Crédito.`);
  }

  return (
    <div className="panel" style={{ marginBottom: 'var(--e-4)' }}>
      <span className="panel__titulo">
        Venta {venta.venta_id} · {formatearFechaHora(venta.fecha)}
        {venta.credito_vence
          ? (venta.vencida ? ` · vencida desde el ${formatearFecha(venta.credito_vence)}` : ` · vence el ${formatearFecha(venta.credito_vence)}`)
          : ' · por partes, sin plazo'}
      </span>
      <p>
        Total {formatearBs(venta.total_bs)} ({formatearBcv(venta.total_bcv)}) · pagó {formatearBcv(venta.pagado_bcv)} ·
        {' '}<strong>falta {formatearBcv(venta.falta_bcv)}</strong>
        {tasa && venta.falta_bcv > 0 ? <>, hoy {formatearBs(bsDeBcv(venta.falta_bcv, tasa.tasa_bcv))}</> : null}
      </p>

      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr><th></th><th>Pieza</th><th className="num">Cantidad</th><th className="num">Cobrado c/u · Bs</th><th className="num">Etiqueta · Bs</th></tr>
          </thead>
          <tbody>
            {piezas.map((p, n) => {
              const etiqueta = p.precio_lista_bs === null || p.precio_lista_bs === undefined ? null : Number(p.precio_lista_bs);
              const rebajada = etiqueta !== null && etiqueta > Number(p.precio_unitario_bs);
              return (
                <tr key={`${n}-${p.modelo_id}`}>
                  <td>
                    <MiniaturaTocable thumb={p.foto_thumb_path} nombre={nombreConVariante(p.nombre, p.variante)} alVer={() => verFotos(piezas, n)} />
                  </td>
                  <td>
                    <div className="celda-nombre">{nombreConVariante(p.nombre, p.variante)}</div>
                    <div className="celda-nota">{p.sku}</div>
                  </td>
                  <td className="num">{p.cantidad}</td>
                  <td className="num">{formatearBs(p.precio_unitario_bs)}</td>
                  <td className="num">{etiqueta === null ? '—' : rebajada ? <s>{formatearBs(etiqueta)}</s> : formatearBs(etiqueta)}</td>
                </tr>
              );
            })}
            {extraBs > 0 ? (
              <tr>
                <td><span className="miniatura" /></td>
                <td>
                  <div className="celda-nombre">{extraNota || 'Sin decir qué'}</div>
                  <div className="celda-nota">Fuera del catálogo</div>
                </td>
                <td className="num">—</td>
                <td className="num">{formatearBs(extraBs)}</td>
                <td className="num">—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ListaAbonos abonos={abonos} abierto esAdmin alCambiar={alTerminar} />

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      {venta.falta_bcv > 0 && tasa ? (
        <CargarAbono
          id={venta.venta_id}
          falta={venta.falta_bcv}
          tasa={tasa}
          titulo={abonos.length > 0 ? 'Cargar otro pago' : 'Cargar un pago'}
          preguntarSiLlego
          registrar={async (metodo, monto, referencia, verificadoYa) => {
            const { data, error: err } = await supabase.rpc('abonar_venta', {
              p_venta_id: venta.venta_id, p_metodo: metodo, p_monto: monto,
              p_referencia: referencia, p_verificado: verificadoYa,
            });
            if (err) throw new Error(mensajeDeError(err));
            return Number(data ?? 0);
          }}
          alGuardar={(resta) => alTerminar(resta > 0
            ? `Pago cargado en la venta ${venta.venta_id}. Faltan ${formatearBcv(resta)}, hoy ${formatearBs(bsDeBcv(resta, tasa.tasa_bcv))}.`
            : `Pago cargado: la venta ${venta.venta_id} quedó pagada. Falta verificarla.`)}
        />
      ) : (
        <div className="acciones">
          <button type="button" className="boton boton--confirmar" disabled={trabajando} onClick={() => void verificar()}>
            {trabajando ? 'Guardando' : 'Pago verificado'}
          </button>
        </div>
      )}
    </div>
  );
}
