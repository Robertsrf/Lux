import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Aviso, Cargando, Vacio } from '../componentes/Piezas';
import { Monograma, Wordmark } from '../componentes/Marca';
import { formatearBs, formatearUsd } from '../lib/dinero';
import { urlPublicaFoto } from '../lib/fotos';
import { useTextos } from '../hooks/useTextos';
import type { ModeloVenta } from '../lib/tipos';
import '../estilos/vitrina.css';

const TAMANO_PAGINA = 500;
const TOPE = 4000;
const SEGUNDOS = [5, 8, 12, 20] as const;
/** Tras este rato sin tocar nada, los controles se van y queda solo la pieza. */
const OCULTAR_MS = 4000;

/**
 * Vitrina: el catalogo pasando solo, para dejarlo puesto en un televisor.
 *
 * La pantalla es la pieza y nada mas. Sin barra lateral, sin tablas, sin
 * botones a la vista: los controles aparecen al mover el raton y se esconden
 * de nuevo. Un televisor de tienda se mira de lejos, asi que todo lo que se
 * lee esta en tamanos grandes de la escala, no en los de trabajo.
 *
 * No muestra costo ni margen: lee `v_catalogo_venta`, la misma vista del
 * mostrador. Aunque quede encendida de cara al publico, no hay nada que
 * filtrar.
 */
export function Vitrina() {
  const textos = useTextos();
  const [modelos, setModelos] = useState<ModeloVenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [segundos, setSegundos] = useState<number>(8);
  const [controles, setControles] = useState(true);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  const temporizadorOcultar = useRef<number | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      const acumulado: ModeloVenta[] = [];
      try {
        for (let desde = 0; desde < TOPE; desde += TAMANO_PAGINA) {
          const { data, error: err } = await supabase
            .from('v_catalogo_venta')
            .select('id, sku, nombre, categoria, descripcion, variantes_nota, foto_path, foto_thumb_path, grupo, precio_usd, precio_bs, precio_usd_real, existencia_total, activo')
            .gt('existencia_total', 0)
            .order('categoria', { ascending: true })
            .order('nombre', { ascending: true })
            .range(desde, desde + TAMANO_PAGINA - 1);
          if (err) throw err;
          const lote = (data as unknown as ModeloVenta[] | null) ?? [];
          acumulado.push(...lote);
          if (lote.length < TAMANO_PAGINA) break;
        }
        setModelos(acumulado);
      } catch (e) {
        setError(mensajeDeError(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const total = modelos.length;
  const actual = total > 0 ? modelos[indice % total] : null;

  const avanzar = useCallback((paso: number) => {
    setIndice((i) => (total > 0 ? (i + paso + total) % total : 0));
  }, [total]);

  // El avance automatico. Se rearma en cada cambio de pieza, asi que pasar
  // una a mano tambien reinicia la cuenta: no salta a los dos segundos.
  useEffect(() => {
    if (pausado || total <= 1) return;
    const id = window.setTimeout(() => avanzar(1), segundos * 1000);
    return () => window.clearTimeout(id);
  }, [indice, pausado, segundos, total, avanzar]);

  // La siguiente foto se descarga mientras se mira la de ahora. Sin esto la
  // pieza aparece a medio cargar en la conexion de la tienda.
  useEffect(() => {
    if (total <= 1) return;
    const siguiente = modelos[(indice + 1) % total];
    const url = urlPublicaFoto(siguiente?.foto_path ?? siguiente?.foto_thumb_path);
    if (url) { const img = new Image(); img.src = url; }
  }, [indice, modelos, total]);

  // Un televisor puesto toda la tarde se apaga solo. Donde el navegador lo
  // permita se le pide que no lo haga; donde no, no pasa nada.
  useEffect(() => {
    let candado: WakeLockSentinel | null = null;
    let vivo = true;
    void (async () => {
      try {
        candado = await navigator.wakeLock?.request('screen');
        if (!vivo) { void candado?.release(); candado = null; }
      } catch { /* el navegador no quiso: la vitrina funciona igual */ }
    })();
    return () => { vivo = false; void candado?.release(); };
  }, []);

  const mostrarControles = useCallback(() => {
    setControles(true);
    if (temporizadorOcultar.current) window.clearTimeout(temporizadorOcultar.current);
    temporizadorOcultar.current = window.setTimeout(() => setControles(false), OCULTAR_MS);
  }, []);

  useEffect(() => {
    mostrarControles();
    return () => { if (temporizadorOcultar.current) window.clearTimeout(temporizadorOcultar.current); };
  }, [mostrarControles]);

  const alternarPantallaCompleta = useCallback(() => {
    void (async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await contenedor.current?.requestFullscreen();
      } catch { /* algunos navegadores lo niegan sin gesto directo */ }
    })();
  }, []);

  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { avanzar(1); mostrarControles(); }
      else if (e.key === 'ArrowLeft') { avanzar(-1); mostrarControles(); }
      else if (e.key === ' ') { e.preventDefault(); setPausado((p) => !p); mostrarControles(); }
      else if (e.key.toLowerCase() === 'f') alternarPantallaCompleta();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [avanzar, mostrarControles, alternarPantallaCompleta]);

  const foto = useMemo(
    () => urlPublicaFoto(actual?.foto_path ?? actual?.foto_thumb_path),
    [actual],
  );

  if (cargando) return <Cargando texto="Preparando la vitrina" />;
  if (error) return <Aviso tono="error" titulo="No se pudo cargar el catalogo">{error}</Aviso>;
  if (total === 0) {
    return (
      <Vacio titulo="No hay piezas que mostrar">
        <p>La vitrina muestra los modelos con existencia. Carga inventario y vuelve.</p>
      </Vacio>
    );
  }

  return (
    <div
      ref={contenedor}
      className={`vitrina ${controles ? '' : 'vitrina--limpia'}`}
      onMouseMove={mostrarControles}
      onTouchStart={mostrarControles}
    >
      <div className="vitrina__marca">
        <Wordmark alto={48} tono="crema" />
      </div>

      {/* Cada pieza es su propia key: React la reemplaza en vez de reusarla,
          y asi la animacion de entrada corre en cada cambio. */}
      <div className="vitrina__pieza" key={actual?.id ?? 'vacia'}>
        <div className="vitrina__foto">
          {foto
            ? <img src={foto} alt={actual?.nombre ?? ''} />
            : <div className="vitrina__sinfoto"><Monograma tamano={140} /></div>}
        </div>

        <div className="vitrina__ficha">
          {actual?.categoria ? <p className="vitrina__categoria">{actual.categoria}</p> : null}
          <h1 className="vitrina__nombre">{actual?.nombre}</h1>
          {actual?.variantes_nota ? <p className="vitrina__nota">{actual.variantes_nota}</p> : null}

          <div className="vitrina__regla" aria-hidden="true"><span /><Monograma tamano={26} /><span /></div>

          <p className="vitrina__precio">{formatearBs(actual?.precio_bs ?? null)}</p>
          <p className="vitrina__precio-usd">{formatearUsd(actual?.precio_usd ?? null)}</p>

          {textos.materiales_corto ? (
            <p className="vitrina__materiales">{textos.materiales_corto}</p>
          ) : null}
        </div>
      </div>

      {/* Avanza sola: la barra dice cuanto falta para la siguiente. */}
      <div className="vitrina__progreso" aria-hidden="true">
        <div
          className="vitrina__progreso-barra"
          key={`${indice}-${segundos}-${pausado}`}
          style={{ animationDuration: `${segundos}s`, animationPlayState: pausado ? 'paused' : 'running' }}
        />
      </div>

      <div className="vitrina__controles">
        <div className="vitrina__grupo">
          <button type="button" className="boton boton--secundario" onClick={() => avanzar(-1)} aria-label="Pieza anterior">‹</button>
          <button type="button" className="boton boton--secundario" onClick={() => setPausado((p) => !p)}>
            {pausado ? 'Reanudar' : 'Pausar'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => avanzar(1)} aria-label="Pieza siguiente">›</button>
        </div>

        <div className="vitrina__grupo" role="group" aria-label="Segundos por pieza">
          {SEGUNDOS.map((s) => (
            <button
              key={s}
              type="button"
              className="boton boton--secundario boton--pequeno"
              aria-pressed={segundos === s}
              onClick={() => setSegundos(s)}
            >
              {s}s
            </button>
          ))}
        </div>

        <div className="vitrina__grupo">
          <span className="vitrina__cuenta">{indice + 1} de {total}</span>
          <button type="button" className="boton boton--confirmar" onClick={alternarPantallaCompleta}>
            {pantallaCompleta ? 'Salir' : 'Pantalla completa'}
          </button>
        </div>
      </div>
    </div>
  );
}
