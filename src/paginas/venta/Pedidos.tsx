import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, Vacio } from '../../componentes/Piezas';
import { CompartirCatalogo } from '../../componentes/CompartirCatalogo';
import { cuentaRegresiva, formatearFecha, formatearUsd } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import type { LineaPedido } from '../../lib/tipos';

/**
 * Los pedidos que llegan del catalogo publico, ya armados.
 *
 * Cada pieza trae SU UBICACION: la vendedora recorre la tienda una sola vez
 * y despacha en orden, sin ir y volver ni equivocarse de vitrina.
 */
const soloDigitos = (s: string) => s.replace(/[^0-9]/g, '');

export function Pedidos() {
  const [lineas, setLineas] = useState<LineaPedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('v_pedido_vendedora')
      .select('*')
      .order('creado_en', { ascending: false });
    if (err) setError(mensajeDeError(err));
    setLineas((data as unknown as LineaPedido[] | null) ?? []);
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

  if (cargando) return <Cargando texto="Buscando pedidos" />;

  return (
    <div className="pagina mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Pedidos</h1>
          <p>Lo que armaron desde el catalogo. Cada pieza dice donde esta.</p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={() => void cargar()}>Actualizar</button>
      </div>

      <CompartirCatalogo />

      {error ? <Aviso tono="error" titulo="No se pudieron leer los pedidos">{error}</Aviso> : null}

      {pedidos.length === 0 ? (
        <Vacio titulo="No hay pedidos pendientes">
          <p>Cuando alguien arme un pedido desde el catalogo publico, aparecera aqui con la ubicacion de cada pieza.</p>
        </Vacio>
      ) : (
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
                    <p>
                      {cabecera.cliente_telefono ?? 'Sin telefono'}
                      {cabecera.cliente_cedula ? ` · C.I. ${cabecera.cliente_cedula}` : ''} ·
                      {' '}{formatearFecha(cabecera.creado_en)} ·
                      {' '}{cabecera.piezas_total} piezas · {formatearUsd(cabecera.total_usd)}
                    </p>
                  </div>
                  {cabecera.estado === 'confirmada'
                    ? <span className="etiqueta etiqueta--exito">Confirmado</span>
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
                        <div className="campo__pista">Pidele la cedula al entregar.</div>
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
                          {cabecera.pago_metodo === 'transferencia' ? 'Transferencia' : 'Pago movil'}
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
                      <tr><th></th><th>Pieza</th><th>Donde esta</th><th className="num">Cantidad</th></tr>
                    </thead>
                    <tbody>
                      {items.map((i) => {
                        const foto = urlPublicaFoto(i.foto_thumb_path);
                        return (
                          <tr key={i.modelo_id}>
                            <td>{foto ? <img className="miniatura" src={foto} alt="" loading="lazy" /> : <span className="miniatura" />}</td>
                            <td>
                              <div className="celda-nombre">{i.nombre}</div>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
