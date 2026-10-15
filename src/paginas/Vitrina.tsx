import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Cargando, Vacio } from '../componentes/Piezas';
import { Monograma, Wordmark } from '../componentes/Marca';
import { CodigoQr } from '../componentes/CodigoQr';
import { enlacePublico } from '../componentes/CompartirCatalogo';
import { formatearBcv, formatearBs } from '../lib/dinero';
import { urlPublicaFoto } from '../lib/fotos';
import { agruparPorFamilia, conFoto, etiquetasDe } from '../lib/familias';
import type { Familia } from '../lib/familias';
import { useTextos } from '../hooks/useTextos';
import { useFrases } from '../hooks/useFrases';
import type { Frase, ModeloPublico } from '../lib/tipos';
import '../estilos/vitrina.css';

/**
 * Lo que la vitrina ensena de cada pieza. Sale de `v_disponible_publico`,
 * la vista del catalogo publico: sin sesion, sin costos, y sin lo que ya
 * esta apartado por un pedido.
 */
type PiezaVitrina = Pick<ModeloPublico,
  'id' | 'sku' | 'nombre' | 'categoria' | 'variantes_nota' | 'foto_path' | 'foto_thumb_path'
  | 'precio_usd' | 'precio_bs' | 'ubicaciones_codigo' | 'familia' | 'variante' | 'disponible'>;

const TAMANO_PAGINA = 500;
const TOPE = 4000;
/** Tras este rato sin tocar nada, los controles se van y queda solo la pieza. */
const OCULTAR_MS = 4000;
/** Cada cuántas piezas entra una frase de marca. */
const CADA = 4;
const SEGUNDOS = [5, 8, 12, 20] as const;
/**
 * Cada cuánto vuelve a leer el catálogo. Un televisor se queda encendido
 * toda la tarde: sin esto enseñaba piezas que ya se vendieron y, peor, los
 * bolívares con la tasa de la mañana después de que la vendedora la
 * cambiaba. La clienta veía un precio en la pantalla y le cobraban otro.
 */
const REFRESCAR_MS = 5 * 60_000;
/** Si la primera carga falla, se vuelve a probar sola: nadie mira el televisor. */
const REINTENTOS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
/** Si el QR va en pantalla, por televisor. */
const CLAVE_QR = 'lux-vitrina-qr';

type Diapositiva =
  | { tipo: 'pieza'; familia: Familia<PiezaVitrina>; n: number }
  | { tipo: 'frase'; frase: Frase; n: number };

const claveDe = (d: Diapositiva) => (d.tipo === 'pieza' ? `p${d.familia.clave}` : `f${d.n}`);

/**
 * Las categorias, una pieza de cada una por turno. Ordenado por categoria,
 * el televisor pasaba cuarenta anillos seguidos antes del primer arete: la
 * clienta que entra ve solo un tipo de pieza.
 */
function intercalar<T extends { categoria: string | null }>(familias: Familia<T>[]): Familia<T>[] {
  const porCategoria = new Map<string, Familia<T>[]>();
  for (const f of familias) {
    const c = f.cabeza.categoria ?? '';
    const cola = porCategoria.get(c) ?? [];
    cola.push(f);
    porCategoria.set(c, cola);
  }
  const colas = [...porCategoria.values()];
  const salida: Familia<T>[] = [];
  while (salida.length < familias.length) {
    for (const cola of colas) {
      const f = cola.shift();
      if (f) salida.push(f);
    }
  }
  return salida;
}

const leerQr = () => {
  try { return localStorage.getItem(CLAVE_QR) !== 'no'; } catch { return true; }
};

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
 * Y en la esquina, el QR del catalogo en linea: la clienta que espera lo
 * abre en su telefono y arma su pedido ahi. Se puede quitar desde los
 * controles.
 *
 * Se abre SIN SESION, como el catalogo: en el televisor basta con el
 * enlace. Por eso lee `v_disponible_publico`, la vista del catalogo
 * publico, y no la del mostrador: no ensena nada que no este ya en el
 * enlace que se manda por WhatsApp. Ni costo, ni margen, ni el piso.
 */
export function Vitrina() {
  const textos = useTextos();
  const { secuencia } = useFrases('TV');
  const [modelos, setModelos] = useState<PiezaVitrina[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizada, setActualizada] = useState<Date | null>(null);
  const [sinRed, setSinRed] = useState(false);
  const [reintento, setReintento] = useState(0);

  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [segundos, setSegundos] = useState<number>(8);
  const [controles, setControles] = useState(true);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [conQr, setConQr] = useState(leerQr);

  const temporizadorOcultar = useRef<number | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const claveActual = useRef<string | null>(null);
  const hayDatos = useRef(false);

  /**
   * Lee el catalogo. La primera vez enseña "Preparando"; las siguientes son
   * en silencio y, si fallan, se queda lo que ya se veia: una pantalla de
   * error en la tienda es peor que un catalogo de hace cinco minutos.
   */
  const cargar = useCallback(async () => {
    const acumulado: PiezaVitrina[] = [];
    try {
      for (let desde = 0; desde < TOPE; desde += TAMANO_PAGINA) {
        const { data, error: err } = await supabase
          .from('v_disponible_publico')
          .select('id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, ubicaciones_codigo, familia, variante, disponible')
          .order('categoria', { ascending: true })
          .order('nombre', { ascending: true })
          .order('id', { ascending: true })
          .range(desde, desde + TAMANO_PAGINA - 1);
        if (err) throw err;
        const lote = (data as unknown as PiezaVitrina[] | null) ?? [];
        acumulado.push(...lote);
        if (lote.length < TAMANO_PAGINA) break;
      }
      setModelos(acumulado);
      setError(null);
      setSinRed(false);
      setReintento(0);
      setActualizada(new Date());
      hayDatos.current = true;
    } catch (e) {
      if (hayDatos.current) setSinRed(true);
      else { setError(mensajeDeError(e)); setReintento((n) => n + 1); }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // Cada cinco minutos, y al volver a la pestaña si ya pasó un rato.
  useEffect(() => {
    const id = window.setInterval(() => void cargar(), REFRESCAR_MS);
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      const hace = actualizada ? Date.now() - actualizada.getTime() : Infinity;
      if (hace > 60_000) void cargar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar, actualizada]);

  // Si la primera carga falló, otra vez, cada vez más espaciado.
  useEffect(() => {
    if (!error || reintento === 0) return;
    const espera = REINTENTOS_MS[Math.min(reintento - 1, REINTENTOS_MS.length - 1)]!;
    const id = window.setTimeout(() => void cargar(), espera);
    return () => window.clearTimeout(id);
  }, [error, reintento, cargar]);

  // Un producto con variantes es UNA pantalla, con sus medidas y sus
  // precios: dos pantallas seguidas con la misma cadena parecerian un error.
  //
  // Sin foto no sale: en un televisor, una pieza sin foto es una pantalla
  // vacia con un precio. Si ninguna tiene foto, salen todas.
  const familias = useMemo(() => {
    const todas = agruparPorFamilia(modelos);
    const conFotos = todas.filter((f) => f.variantes.some((v) => v.foto_path || v.foto_thumb_path));
    return intercalar(conFotos.length > 0 ? conFotos : todas);
  }, [modelos]);

  // El guion: piezas con una frase cada CADA. Si no hay frases cargadas
  // queda solo el catalogo.
  const guion = useMemo<Diapositiva[]>(() => {
    const salida: Diapositiva[] = [];
    familias.forEach((familia, i) => {
      salida.push({ tipo: 'pieza', familia, n: i + 1 });
      if (secuencia.length > 0 && (i + 1) % CADA === 0 && i + 1 < familias.length) {
        // La secuencia ya viene alternada por categoria y sin repetir:
        // recorrerla en orden cumple las dos reglas del banco.
        const n = Math.floor(i / CADA);
        salida.push({ tipo: 'frase', frase: secuencia[n % secuencia.length]!, n });
      }
    });
    return salida;
  }, [familias, secuencia]);

  const total = guion.length;
  const actual = total > 0 ? guion[indice % total] : null;

  // Al refrescar, la pantalla sigue en la pieza que estaba: el guion nuevo
  // la busca por su clave. Si se vendio, sigue desde el mismo sitio. Va
  // antes del efecto que recuerda la clave, a proposito: tiene que leer la
  // de antes del cambio.
  useEffect(() => {
    const clave = claveActual.current;
    if (!clave) return;
    const i = guion.findIndex((d) => claveDe(d) === clave);
    if (i >= 0) setIndice(i);
  }, [guion]);
  useEffect(() => { claveActual.current = actual ? claveDe(actual) : null; }, [actual]);

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
  // permita se le pide que no lo haga. El permiso se pierde cada vez que la
  // pestaña se esconde (cambiar de entrada en el televisor, por ejemplo):
  // se vuelve a pedir al volver. Antes se pedía una sola vez.
  useEffect(() => {
    let candado: WakeLockSentinel | null = null;
    let vivo = true;
    const pedir = async () => {
      if (document.visibilityState !== 'visible' || candado) return;
      try {
        candado = await navigator.wakeLock?.request('screen') ?? null;
        candado?.addEventListener('release', () => { candado = null; });
        if (!vivo) { void candado?.release(); candado = null; }
      } catch { /* el navegador no quiso: la vitrina funciona igual */ }
    };
    void pedir();
    const alVolver = () => { void pedir(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', alVolver);
      void candado?.release();
    };
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

  const alternarQr = useCallback(() => {
    setConQr((antes) => {
      const ahora = !antes;
      try { localStorage.setItem(CLAVE_QR, ahora ? 'si' : 'no'); } catch { /* solo esta vez */ }
      return ahora;
    });
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

  const enlace = useMemo(() => enlacePublico(), []);

  // Las claves de todas las variantes, sin repetir: "V1 · BG".
  const claves = actual?.tipo === 'pieza'
    ? [...new Set(actual.familia.variantes.flatMap((v) => (v.ubicaciones_codigo ?? '').split(' · ')).filter(Boolean))].join(' · ')
    : '';

  /*
    QUE QUEPA SIEMPRE.

    Probada en un televisor de 32", un nombre de cuatro renglones empujaba
    el precio por debajo del borde. Las letras ya se miden contra el alto
    de la pantalla (vitrina.css), pero un nombre muy largo o cinco medidas
    pueden seguir sin caber. Aqui se mide lo que de verdad se dibujo y, si
    la ficha se pasa de la pantalla, se baja su letra (--escala) hasta que
    entra entera. Antes de pintar, para que no se vea el salto.
  */
  useLayoutEffect(() => {
    const raiz = contenedor.current;
    if (!raiz) return;
    const MINIMO = 0.5;
    const ajustar = () => {
      for (const caja of raiz.querySelectorAll<HTMLElement>('.vitrina__ficha, .vitrina__frase')) {
        let escala = 1;
        caja.style.setProperty('--escala', '1');
        for (let vuelta = 0; vuelta < 6 && caja.scrollHeight > caja.clientHeight + 1 && escala > MINIMO; vuelta++) {
          escala = Math.max(MINIMO, escala * Math.min(0.94, caja.clientHeight / caja.scrollHeight));
          caja.style.setProperty('--escala', escala.toFixed(3));
        }
      }
    };
    ajustar();
    // Las letras de la marca llegan despues del primer dibujo, y con otra
    // letra cambia el alto: se vuelve a medir cuando terminan de llegar.
    void document.fonts?.ready.then(ajustar);
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [indice, total, cargando]);

  if (cargando) return <Cargando texto="Preparando la vitrina" />;
  if (error && total === 0) {
    // En verde, a pantalla completa y sin botones: es lo que se ve desde la
    // tienda mientras vuelve la conexion. Se reintenta sola.
    return (
      <div className="vitrina vitrina--espera">
        <div className="vitrina__espera">
          <Wordmark alto={64} tono="crema" />
          <p>Volviendo a conectar con el catálogo…</p>
          <p className="vitrina__espera-detalle">{error}</p>
        </div>
      </div>
    );
  }
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
      className={['vitrina', controles ? '' : 'vitrina--limpia', conQr ? 'vitrina--con-qr' : ''].filter(Boolean).join(' ')}
      onMouseMove={mostrarControles}
      onTouchStart={mostrarControles}
    >
      <div className="vitrina__marca">
        <Wordmark alto={48} tono="crema" />
      </div>

      {/* La clave de React es la de la diapositiva, no su posicion: al
          refrescar el catalogo la pieza que se esta viendo no se vuelve a
          animar como si fuera nueva. */}
      <div className="vitrina__escena" key={actual ? claveDe(actual) : indice}>
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

      {/* El catalogo en el telefono de quien mira. Fuera de la ficha y
          dentro del margen de seguridad: no se va con los controles,
          porque es para la clienta. */}
      {conQr ? (
        <div className="vitrina__qr">
          <CodigoQr className="vitrina__qr-codigo" texto={enlace} etiqueta="Código QR del catálogo en línea" />
          <p className="vitrina__qr-texto">Pide desde tu teléfono</p>
        </div>
      ) : null}

      {/* Donde esta la pieza, en clave de tienda: "V1 · BG". La vendedora
          sabe leerlo desde su puesto; la clienta ve una referencia y sigue
          de largo. Se queda aunque se vayan los controles, porque es para
          trabajar, no para vender. */}
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
          <button
            type="button"
            className="boton boton--secundario boton--pequeno"
            aria-pressed={conQr}
            onClick={alternarQr}
          >
            QR
          </button>
        </div>

        <div className="vitrina__grupo">
          <span className="vitrina__cuenta">
            {actual?.tipo === 'pieza' ? `Pieza ${actual.n} de ${familias.length}` : 'Lux by Emory'}
            {/* Si se cayo la red, se sigue mostrando lo ultimo que llego, y
                se dice desde cuando. */}
            {sinRed && actualizada
              ? ` · sin conexión desde las ${actualizada.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}`
              : ''}
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
  familia: Familia<PiezaVitrina>;
  foto: string | null;
  materiales: string | null;
}) {
  const { cabeza, variantes } = familia;
  const varias = variantes.length > 1;
  const mismoPrecio = variantes.every((v) => v.precio_bs === cabeza.precio_bs);
  const nota = varias
    ? (mismoPrecio ? etiquetasDe(familia) : null)
    : [cabeza.variante, cabeza.variantes_nota].filter(Boolean).join(' · ') || null;
  // Lo mismo que dice el catalogo en linea ("Queda 1"), dicho de lejos.
  const ultima = variantes.reduce((n, v) => n + v.disponible, 0) === 1;

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

        {ultima ? <p className="vitrina__ultima">Última pieza</p> : null}
        {materiales ? <p className="vitrina__materiales">{materiales}</p> : null}
      </div>
    </div>
  );
}
