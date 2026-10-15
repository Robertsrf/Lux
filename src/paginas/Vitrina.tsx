import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Cargando, Vacio } from '../componentes/Piezas';
import { Monograma, Wordmark } from '../componentes/Marca';
import { CodigoQr } from '../componentes/CodigoQr';
import { FiligranaArco, FiligranaDivisor, FiligranaMarco } from '../componentes/Filigrana';
import { SiluetaEscote } from '../componentes/SiluetaEscote';
import { enlacePublico } from '../componentes/CompartirCatalogo';
import { formatearBcv, formatearBs } from '../lib/dinero';
import { urlPublicaFoto } from '../lib/fotos';
import { agruparPorFamilia, conFoto, etiquetasDe, nombreConVariante } from '../lib/familias';
import type { Familia } from '../lib/familias';
import { ESCOTES, piezasParaEscote } from '../lib/escotes';
import type { Escote } from '../lib/escotes';
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
type FamiliaVitrina = Familia<PiezaVitrina>;

const TAMANO_PAGINA = 500;
const TOPE = 4000;
/** Tras este rato sin tocar nada, los controles se van y queda solo la pieza. */
const OCULTAR_MS = 4000;
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
/** Lo que dura la salida de una escena mientras entra la siguiente. */
const SALIDA_MS = 900;

/*
  LAS ESCENAS

  La vitrina ya no es una pieza tras otra: es un guion de seis tipos de
  escena, cada uno con su forma de presentar y su entrada.

    pieza      una pieza estelar, en un arco de vitrina que se dibuja
    trio       tres piezas de categorías distintas, para combinar
    coleccion  una categoría entera: la palabra grande y cuatro piezas
    detalle    la foto de cerca, con los materiales
    frase      una frase de la marca, palabra por palabra
    escote     qué joya va con un escote, dibujado, y las piezas que le van

  El patrón se repite hasta que han salido todas las piezas. Cada escena
  dura los segundos elegidos en los controles por su factor: la guía de
  escotes se lee más despacio que una frase.
*/
type TipoEscena = 'pieza' | 'trio' | 'coleccion' | 'detalle' | 'frase' | 'escote';

type Escena =
  | { tipo: 'pieza'; clave: string; familia: FamiliaVitrina; lado: 'izq' | 'der' }
  | { tipo: 'trio'; clave: string; piezas: PiezaVitrina[] }
  | { tipo: 'coleccion'; clave: string; categoria: string; cuantas: number; piezas: PiezaVitrina[] }
  | { tipo: 'detalle'; clave: string; familia: FamiliaVitrina }
  | { tipo: 'frase'; clave: string; frase: Frase }
  | { tipo: 'escote'; clave: string; escote: Escote; piezas: PiezaVitrina[] };

const PATRON: TipoEscena[] = [
  'pieza', 'pieza', 'trio', 'frase', 'pieza', 'escote', 'coleccion',
  'pieza', 'detalle', 'frase', 'trio', 'pieza', 'escote', 'frase',
];

const FACTOR: Record<TipoEscena, number> = {
  pieza: 1, detalle: 1.1, frase: 0.85, trio: 1.35, coleccion: 1.4, escote: 1.7,
};

/** "anillo" → "Anillos". Lo que no está aquí sale con mayúscula, tal cual. */
const PLURAL: Record<string, string> = {
  anillo: 'Anillos', arete: 'Aretes', brazalete: 'Brazaletes', cadena: 'Cadenas', collar: 'Collares',
  pulsera: 'Pulseras', set: 'Sets', tobillera: 'Tobilleras', cabello: 'Para el cabello',
};
const tituloCategoria = (c: string) => PLURAL[c.toLowerCase()] ?? (c.charAt(0).toUpperCase() + c.slice(1));

/** La foto con la que se presenta una pieza: la grande, o la miniatura si no hay. */
const fotoDe = (p: PiezaVitrina | undefined) => (p ? urlPublicaFoto(p.foto_path ?? p.foto_thumb_path) : null);

/** Las piezas que salen en una escena, para descargar sus fotos antes de que entre. */
function fotosDe(e: Escena): (string | null)[] {
  switch (e.tipo) {
    case 'pieza': case 'detalle': return [fotoDe(conFoto(e.familia.variantes))];
    case 'trio': case 'coleccion': case 'escote': return e.piezas.map(fotoDe);
    default: return [];
  }
}

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

/** El guion entero: el patrón repetido hasta que salen todas las piezas. */
function armarGuion(familias: FamiliaVitrina[], frases: Frase[], conMateriales: boolean, piezas: PiezaVitrina[]): Escena[] {
  const salida: Escena[] = [];
  if (familias.length === 0) return salida;

  let siguiente = 0;
  const tomar = () => familias[siguiente++ % familias.length]!;
  const portada = (f: FamiliaVitrina) => conFoto(f.variantes) ?? f.cabeza;

  // Las categorías con al menos tres productos, para su escena propia.
  const porCategoria = new Map<string, FamiliaVitrina[]>();
  for (const f of familias) {
    const c = f.cabeza.categoria?.trim();
    if (!c) continue;
    porCategoria.set(c, [...(porCategoria.get(c) ?? []), f]);
  }
  const colecciones = [...porCategoria].filter(([, fs]) => fs.length >= 3);
  const escotes = ESCOTES.filter((e) => piezasParaEscote(e, piezas).length > 0);

  let nFrase = 0;
  let nEscote = 0;
  let nColeccion = 0;
  let lado = 0;
  for (let paso = 0; (siguiente < familias.length || paso < PATRON.length) && paso < 4000; paso++) {
    const tipo = PATRON[paso % PATRON.length]!;
    const pieza = () => {
      const f = tomar();
      salida.push({ tipo: 'pieza', clave: `p${paso}-${f.clave}`, familia: f, lado: lado++ % 2 === 0 ? 'izq' : 'der' });
    };
    switch (tipo) {
      case 'pieza':
        pieza();
        break;
      case 'detalle':
        if (!conMateriales) { pieza(); break; }
        {
          const f = tomar();
          salida.push({ tipo: 'detalle', clave: `d${paso}-${f.clave}`, familia: f });
        }
        break;
      case 'trio':
        if (familias.length < 3) { pieza(); break; }
        {
          const tres = [tomar(), tomar(), tomar()].map(portada);
          salida.push({ tipo: 'trio', clave: `t${paso}-${tres.map((p) => p.id).join('.')}`, piezas: tres });
        }
        break;
      case 'coleccion': {
        if (colecciones.length === 0) break;
        const [categoria, fs] = colecciones[nColeccion % colecciones.length]!;
        const desde = Math.floor(nColeccion / colecciones.length) * 4;
        const cuatro = Array.from({ length: Math.min(4, fs.length) }, (_, k) => portada(fs[(desde + k) % fs.length]!));
        salida.push({ tipo: 'coleccion', clave: `c${paso}-${categoria}`, categoria, cuantas: fs.length, piezas: cuatro });
        nColeccion++;
        break;
      }
      case 'escote': {
        if (escotes.length === 0) break;
        const escote = escotes[nEscote % escotes.length]!;
        const de = piezasParaEscote(escote, piezas, Math.floor(nEscote / escotes.length) * 3);
        salida.push({ tipo: 'escote', clave: `e${paso}-${escote.clave}`, escote, piezas: de });
        nEscote++;
        break;
      }
      case 'frase':
        if (frases.length === 0) break;
        salida.push({ tipo: 'frase', clave: `f${paso}`, frase: frases[nFrase++ % frases.length]! });
        break;
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
 * La pantalla es la escena y nada mas. Sin barra lateral, sin tablas, sin
 * botones a la vista: los controles aparecen al mover el raton y se esconden
 * de nuevo. Un televisor de tienda se mira de lejos, asi que todo lo que se
 * lee esta en tamanos grandes de la escala, no en los de trabajo.
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
  // La escena que se va, mientras entra la nueva: se funde encima.
  const [saliente, setSaliente] = useState<Escena | null>(null);

  const temporizadorOcultar = useRef<number | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const claveActual = useRef<string | null>(null);
  const escenaAnterior = useRef<Escena | null>(null);
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

  // Sin foto no sale: en un televisor, una pieza sin foto es una pantalla
  // vacia con un precio. Si ninguna tiene foto, salen todas.
  const conFotos = useMemo(() => {
    const algunas = modelos.filter((m) => m.foto_path || m.foto_thumb_path);
    return algunas.length > 0 ? algunas : modelos;
  }, [modelos]);
  const familias = useMemo(() => intercalar(agruparPorFamilia(conFotos)), [conFotos]);

  const materiales = textos.materiales_largo?.trim() || textos.materiales_corto?.trim() || null;
  const guion = useMemo(
    () => armarGuion(familias, secuencia, Boolean(materiales), conFotos),
    [familias, secuencia, materiales, conFotos],
  );

  const total = guion.length;
  const actual = total > 0 ? guion[indice % total]! : null;
  const duracion = actual ? Math.round(segundos * FACTOR[actual.tipo] * 10) / 10 : segundos;

  // Al refrescar, la pantalla sigue en la escena que estaba: el guion nuevo
  // la busca por su clave. Va antes del efecto que recuerda la clave, a
  // proposito: tiene que leer la de antes del cambio.
  useEffect(() => {
    const clave = claveActual.current;
    if (!clave) return;
    const i = guion.findIndex((d) => d.clave === clave);
    if (i >= 0) setIndice(i);
  }, [guion]);
  useEffect(() => { claveActual.current = actual ? actual.clave : null; }, [actual]);

  // La escena que se va se queda un momento, fundiéndose, mientras entra la
  // nueva: sin esto, cada cambio era un corte en seco.
  useEffect(() => {
    const antes = escenaAnterior.current;
    escenaAnterior.current = actual;
    if (!antes || !actual || antes.clave === actual.clave) return;
    setSaliente(antes);
    const id = window.setTimeout(() => setSaliente(null), SALIDA_MS);
    return () => window.clearTimeout(id);
  }, [actual]);

  const avanzar = useCallback((paso: number) => {
    setIndice((i) => (total > 0 ? (i + paso + total) % total : 0));
  }, [total]);

  // El avance automatico. Se rearma en cada cambio, asi que pasar una a
  // mano tambien reinicia la cuenta: no salta a los dos segundos.
  useEffect(() => {
    if (pausado || total <= 1) return;
    const id = window.setTimeout(() => avanzar(1), duracion * 1000);
    return () => window.clearTimeout(id);
  }, [indice, pausado, duracion, total, avanzar]);

  // Las fotos de la siguiente escena se descargan mientras se mira esta: en
  // la conexion de la tienda, una escena a medio cargar no se ve bien.
  useEffect(() => {
    if (total <= 1) return;
    const siguiente = guion[(indice + 1) % total];
    if (!siguiente) return;
    for (const url of fotosDe(siguiente)) {
      if (url) { const img = new Image(); img.src = url; }
    }
  }, [indice, guion, total]);

  // Un televisor puesto toda la tarde se apaga solo. Donde el navegador lo
  // permita se le pide que no lo haga. El permiso se pierde cada vez que la
  // pestaña se esconde (cambiar de entrada en el televisor, por ejemplo):
  // se vuelve a pedir al volver.
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

  const enlace = useMemo(() => enlacePublico(), []);

  // La clave de ubicación ("V1 · BG") solo cuando hay una pieza en pantalla.
  const claves = actual && (actual.tipo === 'pieza' || actual.tipo === 'detalle')
    ? [...new Set(actual.familia.variantes.flatMap((v) => (v.ubicaciones_codigo ?? '').split(' · ')).filter(Boolean))].join(' · ')
    : '';

  /*
    QUE QUEPA SIEMPRE.

    Probada en un televisor de 32", un nombre de cuatro renglones empujaba
    el precio por debajo del borde. Las letras ya se miden contra el alto
    de la pantalla (vitrina.css), pero un nombre muy largo o cinco medidas
    pueden seguir sin caber. Aqui se mide lo que de verdad se dibujo y, si
    una caja de texto se pasa de su sitio, se baja su letra (--escala)
    hasta que entra entera. Antes de pintar, para que no se vea el salto.
    Solo en la escena que entra: la que se va ya está medida.
  */
  useLayoutEffect(() => {
    const raiz = contenedor.current;
    if (!raiz) return;
    const MINIMO = 0.5;
    /*
      Lo que de verdad ocupa el contenido, por la maquetación y no por
      scrollHeight: Chrome cuenta en scrollHeight a los hijos desplazados por
      su animación de entrada (las piezas entran 5vh más abajo), y la letra
      se encogía al 66 % sin que nada se saliera.
    */
    const ocupa = (caja: HTMLElement) => {
      let fin = 0;
      for (const hijo of Array.from(caja.children)) {
        if (hijo instanceof HTMLElement && getComputedStyle(hijo).position !== 'absolute') {
          fin = Math.max(fin, hijo.offsetTop + hijo.offsetHeight);
        }
      }
      return fin + (parseFloat(getComputedStyle(caja).paddingBottom) || 0);
    };
    const ajustar = () => {
      for (const caja of raiz.querySelectorAll<HTMLElement>('.vitrina__escena--entra .vitrina__ajustable')) {
        let escala = 1;
        caja.style.setProperty('--escala', '1');
        for (let vuelta = 0; vuelta < 6 && ocupa(caja) > caja.clientHeight + 1 && escala > MINIMO; vuelta++) {
          escala = Math.max(MINIMO, escala * Math.min(0.94, caja.clientHeight / ocupa(caja)));
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
  if (total === 0 || !actual) {
    return (
      <Vacio titulo="No hay piezas que mostrar">
        <p>La vitrina muestra los modelos con existencia. Carga inventario y vuelve.</p>
      </Vacio>
    );
  }

  // La que se va y la que entra, con su clave: React no vuelve a montar la
  // que se va, así que sus animaciones no se repiten mientras se funde.
  const enPantalla = saliente && saliente.clave !== actual.clave ? [saliente, actual] : [actual];
  const materialesCortos = textos.materiales_corto ?? null;

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

      {enPantalla.map((e) => {
        const entra = e.clave === actual.clave;
        const estilo = { '--dur': `${entra ? duracion : segundos}s` } as CSSProperties;
        return (
          <div
            key={e.clave}
            className={`vitrina__escena vitrina__escena--${e.tipo} ${entra ? 'vitrina__escena--entra' : 'vitrina__escena--sale'}`}
            style={estilo}
            aria-hidden={entra ? undefined : true}
          >
            <EscenaVitrina escena={e} materiales={materiales} materialesCortos={materialesCortos} />
          </div>
        );
      })}

      {/* El catalogo en el telefono de quien mira. Fuera de la escena y
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
          de largo. */}
      {claves ? <p className="vitrina__clave">{claves}</p> : null}

      {/* Avanza sola: la barra dice cuanto falta para la siguiente. */}
      <div className="vitrina__progreso" aria-hidden="true">
        <div
          className="vitrina__progreso-barra"
          key={`${indice}-${duracion}-${pausado}`}
          style={{ animationDuration: `${duracion}s`, animationPlayState: pausado ? 'paused' : 'running' }}
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
            {`Escena ${(indice % total) + 1} de ${total} · ${familias.length} piezas`}
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

/* ------------------------------------------------------------ escenas */

function EscenaVitrina({ escena, materiales, materialesCortos }: {
  escena: Escena;
  materiales: string | null;
  materialesCortos: string | null;
}) {
  switch (escena.tipo) {
    case 'pieza': return <EscenaPieza familia={escena.familia} lado={escena.lado} materiales={materialesCortos} />;
    case 'trio': return <EscenaTrio piezas={escena.piezas} />;
    case 'coleccion': return <EscenaColeccion categoria={escena.categoria} cuantas={escena.cuantas} piezas={escena.piezas} />;
    case 'detalle': return <EscenaDetalle familia={escena.familia} materiales={materiales} />;
    case 'frase': return <EscenaFrase frase={escena.frase} />;
    case 'escote': return <EscenaEscote escote={escena.escote} piezas={escena.piezas} />;
  }
}

/** Los dos precios, bolívares y $ BCV, del mismo tamaño: ninguno es letra chica. */
function Precios({ pieza, clase = 'vitrina__precio' }: { pieza: PiezaVitrina; clase?: string }) {
  return (
    <div className="vitrina__precios">
      <p className={clase}>{formatearBs(pieza.precio_bs)}</p>
      <p className={clase}>{formatearBcv(pieza.precio_usd)}</p>
    </div>
  );
}

/** La foto en su arco de vitrina, con el arco de oro que se dibuja. */
function Arco({ pieza, nombre, clase = '' }: { pieza: PiezaVitrina | undefined; nombre: string; clase?: string }) {
  const url = fotoDe(pieza);
  return (
    <div className={`vitrina__arco ${clase}`}>
      <div className="vitrina__arco-foto">
        {url ? <img src={url} alt={nombre} /> : <div className="vitrina__sinfoto"><Monograma tamano={120} /></div>}
      </div>
      <FiligranaArco />
    </div>
  );
}

/**
 * Una pieza estelar. Con variantes del mismo precio, las medidas en una
 * línea y un precio; con precios distintos, cada medida con los suyos:
 * "desde" en una pantalla que se lee de lejos no dice nada.
 */
function EscenaPieza({ familia, lado, materiales }: { familia: FamiliaVitrina; lado: 'izq' | 'der'; materiales: string | null }) {
  const { cabeza, variantes } = familia;
  const varias = variantes.length > 1;
  const mismoPrecio = variantes.every((v) => v.precio_bs === cabeza.precio_bs);
  const nota = varias
    ? (mismoPrecio ? etiquetasDe(familia) : null)
    : [cabeza.variante, cabeza.variantes_nota].filter(Boolean).join(' · ') || null;
  const ultima = variantes.reduce((n, v) => n + v.disponible, 0) === 1;

  return (
    <div className={`vitrina__pieza vitrina__pieza--${lado}`}>
      <Arco pieza={conFoto(variantes)} nombre={cabeza.nombre} clase="vitrina__arco--estelar" />

      <div className="vitrina__ficha vitrina__ajustable">
        {cabeza.categoria ? <p className="vitrina__categoria vitrina__aparece">{cabeza.categoria}</p> : null}
        <h1 className="vitrina__nombre vitrina__aparece">{cabeza.nombre}</h1>
        {nota ? <p className="vitrina__nota vitrina__aparece">{nota}</p> : null}

        <FiligranaDivisor className="vitrina__divisor" retraso={0.5} />

        {varias && !mismoPrecio ? (
          <ul className="vitrina__variantes vitrina__aparece vitrina__aparece--tarde">
            {variantes.map((v) => (
              <li key={v.id}>
                <span className="vitrina__variante">{v.variante ?? v.sku}</span>
                <span className="vitrina__variante-precio">{formatearBs(v.precio_bs)}</span>
                <span className="vitrina__variante-precio">{formatearBcv(v.precio_usd)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="vitrina__aparece vitrina__aparece--tarde"><Precios pieza={cabeza} /></div>
        )}

        {ultima ? <p className="vitrina__ultima vitrina__aparece vitrina__aparece--ultimo">Última pieza</p> : null}
        {materiales ? <p className="vitrina__materiales vitrina__aparece vitrina__aparece--ultimo">{materiales}</p> : null}
      </div>
    </div>
  );
}

/** Una pieza pequeña: su arco, su nombre con la medida que se enseña y sus dos precios. */
function Tesela({ pieza, n }: { pieza: PiezaVitrina; n: number }) {
  const nombre = nombreConVariante(pieza.nombre, pieza.variante);
  return (
    <li className="vitrina__tesela" style={{ '--n': n } as CSSProperties}>
      <Arco pieza={pieza} nombre={nombre} clase="vitrina__arco--tesela" />
      <p className="vitrina__tesela-nombre">{pieza.nombre}</p>
      {pieza.variante ? <p className="vitrina__tesela-medida">{pieza.variante}</p> : null}
      <Precios pieza={pieza} clase="vitrina__tesela-precio" />
    </li>
  );
}

function EscenaTrio({ piezas }: { piezas: PiezaVitrina[] }) {
  return (
    <div className="vitrina__trio vitrina__ajustable">
      <h2 className="vitrina__titular vitrina__aparece">Para combinar</h2>
      <FiligranaDivisor className="vitrina__divisor vitrina__divisor--centro" retraso={0.3} />
      <ul className="vitrina__teselas">
        {piezas.map((p, n) => <Tesela key={p.id} pieza={p} n={n} />)}
      </ul>
    </div>
  );
}

function EscenaColeccion({ categoria, cuantas, piezas }: { categoria: string; cuantas: number; piezas: PiezaVitrina[] }) {
  return (
    <div className="vitrina__coleccion">
      <div className="vitrina__coleccion-titulo vitrina__ajustable">
        <h2 className="vitrina__palabra">{tituloCategoria(categoria)}</h2>
        <FiligranaDivisor className="vitrina__divisor" retraso={0.6} />
        <p className="vitrina__nota vitrina__aparece vitrina__aparece--tarde">
          {cuantas} para elegir en la vitrina
        </p>
      </div>
      <ul className="vitrina__mosaico">
        {piezas.map((p, n) => {
          const url = fotoDe(p);
          const nombre = nombreConVariante(p.nombre, p.variante);
          return (
            <li key={p.id} className="vitrina__baldosa" style={{ '--n': n } as CSSProperties}>
              <div className="vitrina__baldosa-foto">
                {url ? <img src={url} alt={nombre} /> : <div className="vitrina__sinfoto"><Monograma tamano={60} /></div>}
              </div>
              <p className="vitrina__baldosa-nombre">{nombre}</p>
              <Precios pieza={p} clase="vitrina__baldosa-precio" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EscenaDetalle({ familia, materiales }: { familia: FamiliaVitrina; materiales: string | null }) {
  const portada = conFoto(familia.variantes) ?? familia.cabeza;
  const url = fotoDe(portada);
  return (
    <div className="vitrina__detalle">
      <div className="vitrina__detalle-foto">
        {url ? <img src={url} alt={familia.cabeza.nombre} /> : <div className="vitrina__sinfoto"><Monograma tamano={140} /></div>}
      </div>
      <div className="vitrina__detalle-texto vitrina__ajustable">
        <p className="vitrina__categoria vitrina__aparece">De cerca</p>
        {materiales ? <p className="vitrina__detalle-materiales vitrina__aparece">{materiales}</p> : null}
        <FiligranaDivisor className="vitrina__divisor" retraso={0.8} />
        <p className="vitrina__nombre vitrina__nombre--chico vitrina__aparece vitrina__aparece--tarde">
          {nombreConVariante(familia.cabeza.nombre, familia.variantes.length === 1 ? familia.cabeza.variante : null)}
        </p>
        <div className="vitrina__aparece vitrina__aparece--ultimo"><Precios pieza={portada} /></div>
      </div>
    </div>
  );
}

/**
 * Una frase de la marca. Las palabras entran una tras otra, como se dicen,
 * entre las cuatro esquinas que se dibujan.
 */
function EscenaFrase({ frase }: { frase: Frase }) {
  const palabras = frase.texto.split(/\s+/).filter(Boolean);
  // Hasta un segundo y medio para que entre la frase entera, la tenga el largo que tenga.
  const paso = Math.min(0.12, 1.5 / Math.max(palabras.length, 1));
  return (
    <div className="vitrina__frase vitrina__ajustable">
      <FiligranaMarco />
      <div className="vitrina__frase-monograma vitrina__aparece"><Monograma tamano={44} /></div>
      <p className={frase.texto.length <= 24 ? 'vitrina__frase-texto vitrina__frase-texto--corta' : 'vitrina__frase-texto'}>
        {/* El espacio va FUERA de cada palabra: dentro de un inline-block,
            el espacio del final se pierde y las palabras se pegaban. */}
        {palabras.map((p, n) => (
          <Fragment key={`${n}-${p}`}>
            <span className="vitrina__palabra-frase" style={{ animationDelay: `${0.35 + n * paso}s` }}>{p}</span>
            {n < palabras.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </p>
      <FiligranaDivisor className="vitrina__divisor vitrina__divisor--centro" retraso={0.6 + palabras.length * paso} />
    </div>
  );
}

/**
 * Qué joya va con un escote: la silueta se dibuja (el cuerpo, el borde de
 * la prenda y, en oro, la joya) y al lado las piezas de la tienda que le
 * van, en la medida que le va.
 */
function EscenaEscote({ escote, piezas }: { escote: Escote; piezas: PiezaVitrina[] }) {
  return (
    <div className="vitrina__escote">
      <div className="vitrina__escote-dibujo">
        <SiluetaEscote clave={escote.clave} descripcion={`${escote.titulo}: ${escote.joya}`} />
      </div>
      <div className="vitrina__escote-texto vitrina__ajustable">
        <p className="vitrina__categoria vitrina__aparece">Qué joya va con tu escote</p>
        <h2 className="vitrina__titular vitrina__titular--escote vitrina__aparece">{escote.titulo}</h2>
        <p className="vitrina__consejo vitrina__aparece vitrina__aparece--tarde">{escote.consejo}</p>
        <FiligranaDivisor className="vitrina__divisor" retraso={1.6} />
        {piezas.length > 0 ? (
          <ul className="vitrina__teselas vitrina__teselas--escote">
            {piezas.map((p, n) => <Tesela key={p.id} pieza={p} n={n} />)}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
