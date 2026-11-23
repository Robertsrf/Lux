import { useCallback, useEffect, useMemo, useState } from 'react';
import { Aviso, Campo, Cargando, Vacio } from '../../../componentes/Piezas';
import { formatearBcv, formatearFecha } from '../../../lib/dinero';
import { nombreConVariante } from '../../../lib/familias';
import { urlPublicaFoto } from '../../../lib/fotos';
import { rpcRv } from '../../../lib/revendedor';
import type { PiezaInventarioRv } from '../../../lib/tipos';
import { textoDeError, usePanelRv } from '../contexto';

interface Correccion { modeloId: number; signo: 1 | -1; cantidad: string; motivo: string }

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Mi inventario (esquema-inventario-revendedor.sql, #72): lo que compró a
 * Lux para revender. Esas piezas salen en su catálogo aunque la tienda ya
 * no las tenga, y un pedido de su clienta las toma primero. Lo que vende en
 * persona, lo que se daña o lo que le llegó sin pasar por el sistema lo
 * corrige aquí, siempre con un motivo, y queda anotado.
 */
export function InventarioRv() {
  const { siSeCerro } = usePanelRv();
  const [lista, setLista] = useState<PiezaInventarioRv[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const [correccion, setCorreccion] = useState<Correccion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await rpcRv<PiezaInventarioRv[]>('rv_mi_inventario'));
      setError(null);
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setCargando(false);
  }, [siSeCerro]);

  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const q = sinAcentos(buscar.trim());
    if (!q) return lista;
    return lista.filter((p) => sinAcentos(`${p.nombre} ${p.variante ?? ''} ${p.sku}`).includes(q));
  }, [lista, buscar]);

  const total = useMemo(() => lista.reduce((n, p) => n + Math.max(p.tiene, 0), 0), [lista]);

  async function guardar() {
    if (!correccion) return;
    const n = Number(correccion.cantidad.trim());
    if (!Number.isInteger(n) || n <= 0) {
      setErrorForm('Escribe cuántas piezas, en número entero: 1, 2, 3...');
      return;
    }
    setGuardando(true);
    setErrorForm(null);
    try {
      const r = await rpcRv<{ tiene: number; libre: number }>('rv_ajustar_inventario', {
        p_modelo_id: correccion.modeloId,
        p_cantidad: correccion.signo * n,
        p_motivo: correccion.motivo,
      });
      const pieza = lista.find((p) => p.modelo_id === correccion.modeloId);
      setAviso(`${pieza ? nombreConVariante(pieza.nombre, pieza.variante) : 'La pieza'}: ahora tienes ${r.tiene}.`);
      setCorreccion(null);
      void cargar();
    } catch (e) {
      if (!siSeCerro(e)) setErrorForm(textoDeError(e));
    }
    setGuardando(false);
  }

  if (cargando) return <Cargando texto="Contando tu inventario" />;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Mi inventario</h1>
          <p>
            {total > 0
              ? <>Tienes <strong>{total} {total === 1 ? 'pieza' : 'piezas'}</strong> compradas a Lux. Salen en tu catálogo, y un pedido de tu clienta las toma primero.</>
              : 'Lo que compres en la tienda para revender aparece aquí y sale en tu catálogo.'}
          </p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo leer tu inventario">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      {lista.length > 6 ? (
        <div className="campo" style={{ margin: 'var(--e-5) 0' }}>
          <label htmlFor="inv-buscar">Buscar</label>
          <input id="inv-buscar" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre de la pieza" autoComplete="off" />
        </div>
      ) : null}

      {lista.length === 0 ? (
        <Vacio titulo="Todavía no tienes piezas propias">
          <p>Cuando le compres a Lux para revender, dile a la tienda que es para tu inventario.</p>
        </Vacio>
      ) : visibles.length === 0 ? (
        <Vacio titulo="Ninguna coincide"><p>Prueba con otra parte del nombre.</p></Vacio>
      ) : (
        <div className="lineas-cobro">
          {visibles.map((p) => {
            const foto = urlPublicaFoto(p.foto_thumb_path);
            const corrigiendo = correccion?.modeloId === p.modelo_id ? correccion : null;
            const historia = abierta === p.modelo_id;
            return (
              <div className="linea-cobro linea-cobro--abierta" key={p.modelo_id}>
                {foto ? <img className="linea-cobro__foto" src={foto} alt="" loading="lazy" /> : <span className="linea-cobro__foto" />}
                <div>
                  <div className="linea-cobro__nombre">{nombreConVariante(p.nombre, p.variante)}</div>
                  <div className="linea-cobro__precio">
                    {p.apartadas > 0
                      ? `${p.libre} libres · ${p.apartadas} en pedidos`
                      : p.tiene > 0 ? 'Todas libres' : 'Ya no te queda'}
                    {p.precio_usd !== null ? <>{' · '}a tu clienta <span className="rv-precio__cifra">{formatearBcv(Number(p.precio_usd))}</span></> : null}
                  </div>
                  <div className="grupo-botones" style={{ marginTop: 'var(--e-2)' }}>
                    <button
                      type="button"
                      className="boton boton--secundario boton--pequeno"
                      aria-expanded={corrigiendo !== null}
                      onClick={() => { setAviso(null); setErrorForm(null); setCorreccion(corrigiendo ? null : { modeloId: p.modelo_id, signo: -1, cantidad: '1', motivo: '' }); }}
                    >
                      Corregir
                    </button>
                    {p.movimientos.length > 0 ? (
                      <button type="button" className="boton boton--secundario boton--pequeno" aria-expanded={historia} onClick={() => setAbierta(historia ? null : p.modelo_id)}>
                        {historia ? 'Ocultar lo que pasó' : 'Lo que pasó'}
                      </button>
                    ) : null}
                  </div>

                  {corrigiendo ? (
                    <div className="tarjeta" style={{ marginTop: 'var(--e-3)' }}>
                      <div className="metodos-pago" role="group" aria-label="Sumar o restar">
                        <button type="button" aria-pressed={corrigiendo.signo === -1} onClick={() => setCorreccion({ ...corrigiendo, signo: -1 })}>Restar</button>
                        <button type="button" aria-pressed={corrigiendo.signo === 1} onClick={() => setCorreccion({ ...corrigiendo, signo: 1 })}>Sumar</button>
                      </div>
                      <div className="fila" style={{ marginTop: 'var(--hueco-campos)' }}>
                        <Campo etiqueta="Cuántas" htmlFor={`inv-n-${p.modelo_id}`}>
                          <input
                            id={`inv-n-${p.modelo_id}`}
                            type="text"
                            inputMode="numeric"
                            value={corrigiendo.cantidad}
                            onChange={(e) => setCorreccion({ ...corrigiendo, cantidad: e.target.value })}
                            autoComplete="off"
                          />
                        </Campo>
                        <Campo
                          etiqueta="Por qué"
                          htmlFor={`inv-m-${p.modelo_id}`}
                          pista={corrigiendo.signo === -1 ? 'Por ejemplo: vendí 1 en persona, se dañó.' : 'Por ejemplo: me la trajo la tienda.'}
                        >
                          <input
                            id={`inv-m-${p.modelo_id}`}
                            value={corrigiendo.motivo}
                            maxLength={200}
                            onChange={(e) => setCorreccion({ ...corrigiendo, motivo: e.target.value })}
                            autoComplete="off"
                          />
                        </Campo>
                      </div>
                      {errorForm ? <p className="campo__error" role="alert">{errorForm}</p> : null}
                      <div className="acciones">
                        <button
                          type="button"
                          className="boton boton--confirmar"
                          disabled={guardando || corrigiendo.motivo.trim().length < 2}
                          onClick={() => void guardar()}
                        >
                          {guardando ? 'Guardando' : corrigiendo.signo === -1 ? 'Restar' : 'Sumar'}
                        </button>
                        <button type="button" className="boton boton--secundario" onClick={() => { setCorreccion(null); setErrorForm(null); }}>Cancelar</button>
                      </div>
                    </div>
                  ) : null}

                  {historia ? (
                    <ul className="cambios-pedido" style={{ marginTop: 'var(--e-3)' }}>
                      {p.movimientos.map((m, k) => (
                        <li key={k}>
                          {formatearFecha(m.fecha)} · {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad} · {m.motivo}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <span className="contador__valor" aria-label={`Tienes ${p.tiene}`}>{p.tiene}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
