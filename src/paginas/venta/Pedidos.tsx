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
                    <h2>{cabecera.cliente_nombre ?? 'Sin nombre'}</h2>
                    <p>
                      {cabecera.cliente_telefono ?? 'Sin telefono'} · {formatearFecha(cabecera.creado_en)} ·
                      {' '}{cabecera.piezas_total} piezas · {formatearUsd(cabecera.total_usd)}
                    </p>
                  </div>
                  {cabecera.estado === 'confirmada'
                    ? <span className="etiqueta etiqueta--exito">Confirmado</span>
                    : restante
                      ? <span className="etiqueta etiqueta--alerta">Apartado {restante}</span>
                      : <span className="etiqueta etiqueta--error">Por vencer</span>}
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
