import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Aviso, Cargando, Vacio } from '../componentes/Piezas';
import { Monograma, Wordmark } from '../componentes/Marca';
import { formatearBcv, formatearBs } from '../lib/dinero';
import { urlPublicaFoto } from '../lib/fotos';
import { agruparPorFamilia, conFoto, etiquetasDe } from '../lib/familias';
import type { Familia } from '../lib/familias';
import { useTextos } from '../hooks/useTextos';
import { useFrases } from '../hooks/useFrases';
import type { Frase, ModeloVenta } from '../lib/tipos';
import '../estilos/vitrina.css';

const TAMANO_PAGINA = 500;
const TOPE = 4000;
/** Tras este rato sin tocar nada, los controles se van y queda solo la pieza. */
const OCULTAR_MS = 4000;
/** Cada cuántas piezas entra una frase de marca. */
const CADA = 4;
const SEGUNDOS = [5, 8, 12, 20] as const;

type Diapositiva =
  | { tipo: 'pieza'; familia: Familia<ModeloVenta>; n: number }
  | { tipo: 'frase'; frase: Frase };

/**
 * Vitrina: el catalogo pasando solo, para dejarlo puesto en un televisor.
 *
 * La pantalla es la pieza y nada mas. Sin barra lateral, sin tablas, sin
 * botones a la vista: los controles aparecen al mover el raton y se esconden
 * de nuevo. Un televisor de tienda se mira de lejos, asi que todo lo que se
 * lee esta en tamanos grandes de la escala, no en los de trabajo.
 *
 * Cada cuatro piezas entra una frase de marca a pantalla completa. Son las
 * mismas de la Guia del Colaborador, recortadas: lo que la vendedora diria
 * de viva voz, dicho por la pantalla mientras ella atiende a otra clienta.
 *
 * No muestra costo ni margen: lee `v_catalogo_venta`, la misma vista del
 * mostrador. Aunque quede encendida de cara al publico, no hay nada que
 * filtrar.
 */
export function Vitrina() {
  const textos = useTextos();
  const { secuencia } = useFrases('TV');
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
            .select('id, sku, nombre, categoria, descripcion, variantes_nota, foto_path, foto_thumb_path, grupo, precio_usd, precio_bs, precio_usd_real, existencia_total, activo, ubicaciones_codigo, familia, variante')
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

  // Un producto con variantes es UNA pantalla, con sus medidas y sus
  // precios: dos pantallas seguidas con la misma cadena parecerian un error.
  const familias = useMemo(() => agruparPorFamilia(modelos), [modelos]);

  // El guion: piezas con una frase cada CADA. Si no hay frases cargadas
  // queda solo el catalogo, que es como estaba antes.
  const guion = useMemo<Diapositiva[]>(() => {
    const salida: Diapositiva[] = [];
    familias.forEach((familia, i) => {
      salida.push({ tipo: 'pieza', familia, n: i + 1 });
      if (secuencia.length > 0 && (i + 1) % CADA === 0 && i + 1 < familias.length) {
        // La secuencia ya viene alternada por categoria y sin repetir:
        // recorrerla en orden cumple las dos reglas del banco.
        salida.push({ tipo: 'frase', frase: secuencia[Math.floor(i / CADA) % secuencia.length]! });
      }
    });
    return salida;
  }, [familias, secuencia]);

  const total = guion.length;
  const actual = total > 0 ? guion[indice % total] : null;

  const avanzar = useCallback((paso: number) => {
    setIndice((i) => (total > 0 ? (i + paso + total) % total : 0));
  }, [total]);

  // El avance automatico. Se rearma en cada cambio, asi que pasar una a
  // mano tambien reinicia la cuenta: no salta a los dos segundos.
  useEffect(() => {
    if (pausado || total <= 1) return;
    const id = window.setTimeout(() => avanzar(1), segundos * 1000);
    return () => window.clearTimeout(id);
  }, [indice, pausado, segundos, total, avanzar]);

  // La siguiente foto se descarga mientras se mira la de ahora. Sin esto la
  // pieza aparece a medio cargar en la conexion de la tienda.
  useEffect(() => {
    if (total <= 1) return;
    const siguiente = guion[(indice + 1) % total];
    if (siguiente?.tipo !== 'pieza') return;
    const portada = conFoto(siguiente.familia.variantes);
    const url = portada ? urlPublicaFoto(portada.foto_path ?? portada.foto_thumb_path) : null;
    if (url) { const img = new Image(); img.src = url; }
  }, [indice, guion, total]);

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

  const foto = useMemo(() => {
    if (actual?.tipo !== 'pieza') return null;
    const portada = conFoto(actual.familia.variantes);
    return portada ? urlPublicaFoto(portada.foto_path ?? portada.foto_thumb_path) : null;
  }, [actual]);

  // Las claves de todas las variantes, sin repetir: "V1 · BG".
  const claves = actual?.tipo === 'pieza'
    ? [...new Set(actual.familia.variantes.flatMap((v) => (v.ubicaciones_codigo ?? '').split(' · ')).filter(Boolean))].join(' · ')
    : '';

  if (cargando) return <Cargando texto="Preparando la vitrina" />;
  if (error) return <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso>;
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

      {/* Cada diapositiva es su propia key: React la reemplaza en vez de
          reusarla, y asi la animacion de entrada corre en cada cambio. */}
      <div className="vitrina__escena" key={indice}>
        {actual?.tipo === 'frase' ? (
          <div className="vitrina__frase">
            <div className="vitrina__regla" aria-hidden="true">
              <span /><Monograma tamano={30} /><span />
            </div>

            {/* Las micro-frases del banco son de dos a seis palabras y
                piden mas cuerpo: de lejos, un destello corto tiene que
                pesar tanto como una frase larga. */}
            <p className={actual.frase.texto.length <= 24 ? 'vitrina__frase-texto vitrina__frase-texto--corta' : 'vitrina__frase-texto'}>
              {actual.frase.texto}
            </p>
            <div className="vitrina__regla" aria-hidden="true">
              <span /><Monograma tamano={30} /><span />
            </div>
          </div>
        ) : actual?.tipo === 'pieza' ? (
          <FichaVitrina familia={actual.familia} foto={foto} materiales={textos.materiales_corto ?? null} />
        ) : null}
      </div>


      {/* Donde esta la pieza, en clave de tienda: "V1 · BG". La vendedora
          sabe leerlo desde su puesto; la clienta ve una referencia y sigue
          de largo. Va fuera de la ficha y se queda aunque se vayan los
          controles, porque es para trabajar, no para vender. */}
      {claves ? <p className="vitrina__clave">{claves}</p> : null}

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
          <button type="button" className="boton boton--secundario" onClick={() => avanzar(-1)} aria-label="Anterior">‹</button>
          <button type="button" className="boton boton--secundario" onClick={() => setPausado((p) => !p)}>
            {pausado ? 'Reanudar' : 'Pausar'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => avanzar(1)} aria-label="Siguiente">›</button>
        </div>

        <div className="vitrina__grupo" role="group" aria-label="Segundos por pantalla">
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
          <span className="vitrina__cuenta">
            {actual?.tipo === 'pieza' ? `Pieza ${actual.n} de ${familias.length}` : 'Lux by Emory'}
          </span>
          <button type="button" className="boton boton--confirmar" onClick={alternarPantallaCompleta}>
            {pantallaCompleta ? 'Salir' : 'Pantalla completa'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * La ficha de una pieza en la vitrina.
 *
 * Con variantes del mismo precio, las medidas en una linea y un precio.
 * Con precios distintos, cada medida con los suyos: "desde" en una pantalla
 * que se lee de lejos no dice nada, y la clienta no pregunta por lo que no
 * ve.
 */
function FichaVitrina({ familia, foto, materiales }: {
  familia: Familia<ModeloVenta>;
  foto: string | null;
  materiales: string | null;
}) {
  const { cabeza, variantes } = familia;
  const varias = variantes.length > 1;
  const mismoPrecio = variantes.every((v) => v.precio_bs === cabeza.precio_bs);
  const nota = varias
    ? (mismoPrecio ? etiquetasDe(familia) : null)
    : [cabeza.variante, cabeza.variantes_nota].filter(Boolean).join(' · ') || null;

  return (
    <div className="vitrina__pieza">
      <div className="vitrina__foto">
        {foto
          ? <img src={foto} alt={cabeza.nombre} />
          : <div className="vitrina__sinfoto"><Monograma tamano={140} /></div>}
      </div>

      <div className="vitrina__ficha">
        {cabeza.categoria ? <p className="vitrina__categoria">{cabeza.categoria}</p> : null}
        <h1 className="vitrina__nombre">{cabeza.nombre}</h1>
        {nota ? <p className="vitrina__nota">{nota}</p> : null}

        <div className="vitrina__regla" aria-hidden="true">
          <span /><Monograma tamano={26} /><span />
        </div>

        {/* Bolívares y dólares BCV, del mismo tamaño y el mismo peso:
            quien mira de lejos piensa en una de las dos monedas, y
            ninguna tiene que ser la letra chica. */}
        {varias && !mismoPrecio ? (
          <ul className="vitrina__variantes">
            {variantes.map((v) => (
              <li key={v.id}>
                <span className="vitrina__variante">{v.variante ?? v.sku}</span>
                <span className="vitrina__variante-precio">{formatearBs(v.precio_bs)}</span>
                <span className="vitrina__variante-precio">{formatearBcv(v.precio_usd)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="vitrina__precio">{formatearBs(cabeza.precio_bs)}</p>
            <p className="vitrina__precio">{formatearBcv(cabeza.precio_usd)}</p>
          </>
        )}

        {materiales ? <p className="vitrina__materiales">{materiales}</p> : null}
      </div>
    </div>
  );
}
