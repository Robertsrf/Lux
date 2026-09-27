import { useCallback, useEffect, useMemo, useState } from 'react';
import { Aviso, Campo, Cargando, Filtros, Vacio } from '../../../componentes/Piezas';
import { formatearBcv, formatearEntero, gananciaPct, gananciaPorPieza, precioSobreEtiqueta } from '../../../lib/dinero';
import { urlPublicaFoto } from '../../../lib/fotos';
import { nombreConVariante } from '../../../lib/familias';
import { rpcRv } from '../../../lib/revendedor';
import type { PiezaRevendedor } from '../../../lib/tipos';
import { textoDeError, usePanelRv } from '../contexto';

const aNumero = (texto: string) => Number(texto.replace(',', '.'));
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Sus precios, pieza por pieza: en cuánto le sale, el precio de la tienda,
 * el suyo y lo que gana. Nunca por debajo de la etiqueta más diez
 * centavos: el campo lo dice antes de guardar, y `rv_fijar_precios` lo
 * rechaza igual si algo se cuela.
 *
 * Lo que escribe queda en borrador hasta que toca Guardar, con la misma
 * barra flotante de Costos: así puede poner veinte precios y guardarlos de
 * una vez, o descartarlos.
 */
export function PreciosRv() {
  const { siSeCerro, resumen } = usePanelRv();
  const [piezas, setPiezas] = useState<PiezaRevendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Lo que escribió, por pieza. Una pieza sin entrada no se tocó.
  const [borrador, setBorrador] = useState<Map<number, string>>(new Map());
  const [extra, setExtra] = useState('1');
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setPiezas(await rpcRv<PiezaRevendedor[]>('rv_piezas'));
      setError(null);
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setCargando(false);
  }, [siSeCerro]);

  useEffect(() => { void cargar(); }, [cargar]);

  const categorias = useMemo(() => [...new Set(piezas.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [piezas]);

  const visibles = useMemo(() => {
    const q = sinAcentos(texto.trim());
    return piezas.filter((p) => (!categoria || p.categoria === categoria)
      && (!q || sinAcentos(`${p.nombre} ${p.variante ?? ''} ${p.sku}`).includes(q)));
  }, [piezas, texto, categoria]);

  /** Lo que cambió respecto a lo guardado, listo para mandar, y lo que no vale. */
  const cambios = useMemo(() => {
    const listos: { modelo_id: number; precio_usd: number | null }[] = [];
    const malos = new Set<number>();
    for (const p of piezas) {
      const escrito = borrador.get(p.id);
      if (escrito === undefined) continue;
      const limpio = escrito.trim();
      if (limpio === '') {
        // Vacío: vuelve a su mínimo. Solo es cambio si tenía uno propio.
        if (p.precio_propio !== null) listos.push({ modelo_id: p.id, precio_usd: null });
        continue;
      }
      const n = aNumero(limpio);
      if (!Number.isFinite(n) || n < Number(p.minimo_usd)) { malos.add(p.id); continue; }
      if (p.precio_propio === null || Math.abs(n - Number(p.precio_propio)) >= 0.005) {
        listos.push({ modelo_id: p.id, precio_usd: Math.round(n * 100) / 100 });
      }
    }
    return { listos, malos };
  }, [piezas, borrador]);

  function escribir(id: number, valor: string) {
    setAviso(null);
    setBorrador((b) => new Map(b).set(id, valor));
  }

  function ponerTodas() {
    const n = aNumero(extra);
    if (!Number.isFinite(n) || n < 0) return;
    const nuevo = new Map(borrador);
    for (const p of visibles) {
      nuevo.set(p.id, precioSobreEtiqueta(Number(p.etiqueta_usd), n, Number(p.minimo_usd)).toFixed(2));
    }
    setBorrador(nuevo);
    setAviso(null);
  }

  async function guardar() {
    if (cambios.listos.length === 0 || cambios.malos.size > 0) return;
    setGuardando(true);
    try {
      const n = await rpcRv<number>('rv_fijar_precios', { p_precios: cambios.listos });
      setAviso(`${formatearEntero(n)} ${n === 1 ? 'precio guardado' : 'precios guardados'}. Tu catálogo ya los enseña.`);
      setBorrador(new Map());
      await cargar();
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setGuardando(false);
  }

  if (cargando) return <Cargando texto="Trayendo tus piezas" />;

  const hayCambios = cambios.listos.length > 0 || cambios.malos.size > 0;
  const sobre = resumen ? formatearBcv(resumen.sobre_etiqueta_usd) : '$0,10 BCV';

  return (
    <div className={hayCambios ? 'pagina pagina--con-barra' : 'pagina'}>
      <div className="encabezado-pagina">
        <div>
          <h1>Mis precios</h1>
          <p>
            "Te sale" es lo que le pagas a Lux. Tu precio lo pones tú, siempre al menos {sobre} por
            encima del de la tienda. Sin precio propio, la pieza sale a su mínimo.
          </p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      <div className="tarjeta" style={{ marginBottom: 'var(--e-5)' }}>
        <div className="rv-todas">
          <Campo etiqueta="Todas a la tienda más · $ BCV" htmlFor="rv-extra">
            <input id="rv-extra" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} autoComplete="off" />
          </Campo>
          <button type="button" className="boton boton--secundario" onClick={ponerTodas} disabled={visibles.length === 0}>
            Poner a {visibles.length === piezas.length ? 'todas' : `estas ${formatearEntero(visibles.length)}`}
          </button>
        </div>
        <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
          Escribe cuánto por encima de la etiqueta de la tienda. Se redondea al centavo y queda en borrador hasta que guardes.
        </p>
      </div>

      {piezas.length > 0 ? (
        <Filtros activos={[texto, categoria].filter(Boolean).length}>
          <div className="fila">
            <Campo etiqueta="Buscar" htmlFor="rv-buscar-precio">
              <input id="rv-buscar-precio" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre o SKU" autoComplete="off" />
            </Campo>
            <Campo etiqueta="Categoría" htmlFor="rv-cat-precio">
              <select id="rv-cat-precio" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Todas</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Campo>
          </div>
        </Filtros>
      ) : null}

      {piezas.length === 0 ? (
        <Vacio titulo="No hay piezas en tu catálogo ahora">
          <p>Cuando la tienda tenga piezas disponibles que te dejen ganancia, aparecen aquí.</p>
        </Vacio>
      ) : visibles.length === 0 ? (
        <Vacio titulo="Ninguna pieza coincide"><p>Prueba con otra palabra o quita la categoría.</p></Vacio>
      ) : (
        <div className="rv-precios">
          {visibles.map((p) => {
            const escrito = borrador.get(p.id);
            const valor = escrito ?? (p.precio_propio !== null ? Number(p.precio_propio).toFixed(2) : '');
            const precio = escrito !== undefined && escrito.trim() !== '' && Number.isFinite(aNumero(escrito))
              ? aNumero(escrito)
              : escrito !== undefined && escrito.trim() === '' ? Number(p.minimo_usd) : Number(p.precio_usd);
            const malo = cambios.malos.has(p.id);
            const foto = urlPublicaFoto(p.foto_thumb_path);
            const idCampo = `rv-precio-${p.id}`;
            return (
              <div className={escrito !== undefined ? 'rv-precio rv-precio--cambiado' : 'rv-precio'} key={p.id}>
                {foto ? <img className="rv-precio__foto" src={foto} alt="" loading="lazy" /> : <span className="rv-precio__foto" />}
                <div>
                  <div className="rv-precio__nombre">{nombreConVariante(p.nombre, p.variante)}</div>
                  <div className="rv-precio__dato">
                    Tienda <span className="rv-precio__cifra">{formatearBcv(Number(p.etiqueta_usd))}</span>
                    {' · '}{p.disponible === 1 ? 'queda 1' : `quedan ${formatearEntero(p.disponible)}`}
                  </div>
                </div>
                <div className="rv-precio__sale">
                  <span className="dato__etiqueta">Te sale</span>
                  <div className="dato__valor">{formatearBcv(Number(p.precio_lux_usd))}</div>
                </div>
                <div className={malo ? 'campo campo--con-error rv-precio__campo' : 'campo rv-precio__campo'}>
                  <label htmlFor={idCampo}>Tu precio · $ BCV</label>
                  <input
                    id={idCampo}
                    inputMode="decimal"
                    autoComplete="off"
                    value={valor}
                    placeholder={Number(p.minimo_usd).toFixed(2)}
                    onChange={(e) => escribir(p.id, e.target.value)}
                    aria-invalid={malo || undefined}
                    aria-describedby={`${idCampo}-pista`}
                  />
                  <span className={malo ? 'campo__error' : 'rv-precio__gana'} id={`${idCampo}-pista`}>
                    {malo
                      ? `No puede ser menos de ${formatearBcv(Number(p.minimo_usd))}.`
                      : <>Ganas <strong>{formatearBcv(gananciaPorPieza(precio, Number(p.precio_lux_usd)))}</strong> ({gananciaPct(precio, Number(p.precio_lux_usd))} %)</>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hayCambios ? (
        <div className="barra-carrito" role="region" aria-label="Precios sin guardar">
          <div className="barra-carrito__resumen">
            <div className="barra-carrito__piezas">
              {cambios.malos.size > 0
                ? `${cambios.malos.size} por debajo del mínimo`
                : `${cambios.listos.length} ${cambios.listos.length === 1 ? 'precio' : 'precios'} sin guardar`}
            </div>
          </div>
          <button type="button" className="boton boton--secundario" onClick={() => setBorrador(new Map())} disabled={guardando}>Descartar</button>
          <button type="button" className="boton" onClick={() => void guardar()} disabled={guardando || cambios.malos.size > 0 || cambios.listos.length === 0}>
            {guardando ? 'Guardando' : 'Guardar'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
