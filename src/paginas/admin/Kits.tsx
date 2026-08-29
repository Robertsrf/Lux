import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearBs, formatearPorcentaje, formatearUsd, precioEnBs } from '../../lib/dinero';
import { useTasa } from '../../hooks/useTasa';
import type { KitResumen } from '../../lib/tipos';

interface ItemKit { id: number; kit_id: number; modelo_id: number; cantidad: number; sku?: string; nombre?: string }
interface ModeloBreve { id: number; sku: string; nombre: string }

/**
 * Kits fijos de mayoreo. El precio se fija en DOLARES POR PIEZA, nunca como
 * porcentaje sobre el detal: con porcentaje, mover la tasa descuadra el
 * descuento solo. El numero de piezas se calcula de los items, no se teclea,
 * para que no pueda quedar desfasado.
 */
export function Kits() {
  const { tasa } = useTasa();
  const [kits, setKits] = useState<KitResumen[]>([]);
  const [items, setItems] = useState<Record<number, ItemKit[]>>({});
  const [modelos, setModelos] = useState<ModeloBreve[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [descuento, setDescuento] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [nuevoItem, setNuevoItem] = useState<Record<number, { modelo: string; cantidad: string }>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    const [k, i, m] = await Promise.all([
      supabase.from('v_kits_resumen').select('id, nombre, descripcion, activo, descuento_pct, piezas, subtotal_usd, total_usd').order('nombre'),
      supabase.from('kit_items').select('id, kit_id, modelo_id, cantidad'),
      supabase.from('v_catalogo_admin').select('id, sku, nombre').order('sku').limit(1000),
    ]);
    if (k.error) setError(mensajeDeError(k.error));
    setKits((k.data as KitResumen[] | null) ?? []);

    const lista = (m.data as unknown as ModeloBreve[] | null) ?? [];
    setModelos(lista);
    const porNombre = new Map(lista.map((x) => [x.id, x]));

    const mapa: Record<number, ItemKit[]> = {};
    for (const it of (i.data as ItemKit[] | null) ?? []) {
      const modelo = porNombre.get(it.modelo_id);
      (mapa[it.kit_id] ??= []).push({ ...it, sku: modelo?.sku, nombre: modelo?.nombre });
    }
    setItems(mapa);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('kits').insert({
      nombre: nombre.trim(),
      tipo: 'fijo',
      descuento_pct: Number(descuento),
      descripcion: descripcion.trim() || null,
    });
    if (err) setError(mensajeDeError(err));
    else { setNombre(''); setDescuento(''); setDescripcion(''); await cargar(); }
  }

  async function agregarItem(kitId: number) {
    const dato = nuevoItem[kitId];
    if (!dato?.modelo || !dato.cantidad) return;
    setError(null);
    const { error: err } = await supabase.from('kit_items').upsert(
      { kit_id: kitId, modelo_id: Number(dato.modelo), cantidad: Number(dato.cantidad) },
      { onConflict: 'kit_id,modelo_id' },
    );
    if (err) { setError(mensajeDeError(err)); return; }
    setNuevoItem((n) => ({ ...n, [kitId]: { modelo: '', cantidad: '' } }));
    await cargar();
  }

  async function quitarItem(itemId: number) {
    const { error: err } = await supabase.from('kit_items').delete().eq('id', itemId);
    if (err) { setError(mensajeDeError(err)); return; }
    await cargar();
  }

  async function alternar(k: KitResumen) {
    const { error: err } = await supabase.from('kits').update({ activo: !k.activo }).eq('id', k.id);
    if (err) setError(mensajeDeError(err)); else await cargar();
  }

  if (cargando) return <Cargando texto="Cargando kits" />;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Kits de mayoreo</h1>
          <p>Elige las piezas y cuantas van, y ponle un descuento. El total sale de lo que valen esas piezas.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}

      <form className="tarjeta" onSubmit={(e) => void crear(e)}>
        <h2>Crear kit</h2>
        <hr className="divisor" />
        <div className="fila">
          <Campo etiqueta="Nombre" htmlFor="k-nombre">
            <input id="k-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Descuento %" htmlFor="k-desc" pista="Sobre lo que valen las piezas que le pongas abajo.">
            <input id="k-desc" type="number" step="0.5" min="1" max="99" required value={descuento} onChange={(e) => setDescuento(e.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Descripcion" htmlFor="k-desc">
          <textarea id="k-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>
        <div className="acciones">
          <button type="submit" className="boton">Crear kit</button>
        </div>
      </form>

      <h2 className="seccion-titulo">Kits armados</h2>

      {kits.length === 0 ? (
        <Vacio titulo="Aun no hay kits">
          <p>Crea el primero arriba y despues agregale las piezas que lo componen.</p>
        </Vacio>
      ) : (
        <div className="pila">
          {kits.map((k) => {
            const lista = items[k.id] ?? [];
            const dato = nuevoItem[k.id] ?? { modelo: '', cantidad: '' };
            return (
              <div className="tarjeta" key={k.id}>
                <h2>{k.nombre}</h2>
                <hr className="divisor" />

                <div className="rejilla rejilla--3">
                  <div>
                    <span className="dato__etiqueta">Piezas</span>
                    <div className="dato__valor">{k.piezas}</div>
                  </div>
                  <div>
                    <span className="dato__etiqueta">Valen</span>
                    <div className="dato__valor">{formatearUsd(k.subtotal_usd)}</div>
                    <div className="campo__pista">sin descuento</div>
                  </div>
                  <div>
                    <span className="dato__etiqueta">Se lleva {formatearPorcentaje(k.descuento_pct)}</span>
                    <div className="dato__valor">{formatearUsd(k.total_usd)}</div>
                    <div className="campo__pista">{formatearBs(precioEnBs(Number(k.total_usd), tasa))}</div>
                  </div>
                </div>

                <div className="panel">
                  <span className="panel__titulo">Piezas del kit</span>
                  {lista.length === 0 ? (
                    <p className="campo__pista">Todavia no tiene piezas. Agregalas abajo.</p>
                  ) : (
                    <div className="tabla-envoltura">
                      <table className="tabla">
                        <thead>
                          <tr><th>SKU</th><th>Modelo</th><th className="num">Cantidad</th><th></th></tr>
                        </thead>
                        <tbody>
                          {lista.map((it) => (
                            <tr key={it.id}>
                              <td className="celda-sku">{it.sku ?? '—'}</td>
                              <td className="celda-nombre">{it.nombre ?? `Modelo ${it.modelo_id}`}</td>
                              <td className="num">{it.cantidad}</td>
                              <td>
                                <button type="button" className="boton boton--peligro boton--pequeno" onClick={() => void quitarItem(it.id)}>
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="fila" style={{ marginTop: 'var(--e-4)' }}>
                    <Campo etiqueta="Modelo" htmlFor={`ki-modelo-${k.id}`}>
                      <select
                        id={`ki-modelo-${k.id}`}
                        value={dato.modelo}
                        onChange={(e) => setNuevoItem((n) => ({ ...n, [k.id]: { ...dato, modelo: e.target.value } }))}
                      >
                        <option value="">Elegir modelo</option>
                        {modelos.map((m) => <option key={m.id} value={m.id}>{m.sku} · {m.nombre}</option>)}
                      </select>
                    </Campo>
                    <Campo etiqueta="Cantidad" htmlFor={`ki-cant-${k.id}`}>
                      <input
                        id={`ki-cant-${k.id}`} type="number" min="1" step="1"
                        value={dato.cantidad}
                        onChange={(e) => setNuevoItem((n) => ({ ...n, [k.id]: { ...dato, cantidad: e.target.value } }))}
                      />
                    </Campo>
                  </div>
                  <div className="grupo-botones">
                    <button type="button" className="boton boton--secundario" disabled={!dato.modelo || !dato.cantidad} onClick={() => void agregarItem(k.id)}>
                      Agregar pieza
                    </button>
                  </div>
                </div>

                <div className="acciones">
                  <button type="button" className="boton boton--secundario" onClick={() => void alternar(k)}>
                    {k.activo ? 'Desactivar kit' : 'Activar kit'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
