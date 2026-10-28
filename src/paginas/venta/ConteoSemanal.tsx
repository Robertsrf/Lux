import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { agruparPorFamilia, nombreConVariante } from '../../lib/familias';
import { MiniaturaTocable } from '../../componentes/MiniaturaTocable';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { formatearEntero, formatearFechaHora } from '../../lib/dinero';
import { useUbicaciones } from '../../hooks/useCatalogos';
import { useSesion } from '../../hooks/useSesion';
import type { AjusteConteo, ConteoAnterior, LineaConteo, PiezaConteo, ResultadoAjuste, ResultadoConteo } from '../../lib/tipos';

/*
  CONTEO DE INVENTARIO

  Rehecho el 14/10/2026, después de la auditoría que encontró que el conteo
  de antes BORRABA las piezas apartadas: leía lo libre (`cantidad`) como si
  fuera lo que hay, y al guardar dejaba la existencia en lo libre. Con 5
  cadenas en la bodega y 2 de un pedido, guardar sin tocar nada dejaba 3.

  Cómo cuenta ahora, y por qué:

  - A CIEGAS. Mientras cuenta no ve cuánto espera el sistema. Con la cifra
    delante se tiende a confirmarla en vez de contar; es la primera regla
    de cualquier conteo físico. Lo que esperaba el sistema sale después, en
    la revisión, junto a lo que ella contó.
  - SOLO LO CONTADO SE GUARDA. Una fila vacía es una pieza que no contó y
    no se toca. Antes cada fila sin tocar "confirmaba" la cifra del sistema.
  - CONTRA UNA FOTO. Al empezar se guarda lo que había de cada pieza
    (`vista`). Si mientras cuenta se vende o se mueve una, la base no la
    adivina: la devuelve para contarla otra vez (`registrar_conteo`).
  - NO SE PIERDE. Lo contado se guarda en el teléfono a cada toque: si se
    bloquea la pantalla o se cierra la pestaña a la mitad de la bodega,
    vuelve a donde iba.
  - LO FÍSICO. Se cuentan todas las piezas que están, las de los pedidos
    también. Lo apartado sigue siendo del pedido.
  - EL CONTEO NO CAMBIA EL INVENTARIO (desde el 28/10/2026, lo pidió el
    dueño). Se dejaban en 0 las piezas de los pedidos ("ya no son del
    local"), el conteo ponía la existencia en 0 y después el pedido no se
    podía entregar. Ahora el conteo anota lo contado contra lo que había y
    lo que no cuadra queda "Por revisar"; el administrador ajusta el
    inventario o lo deja como está (`admin_resolver_conteo`, nunca por
    debajo de lo que apartan los pedidos), y puede deshacer lo que ajustó un
    conteo (`admin_deshacer_conteo`). esquema-conteo-autorizado.sql.
*/

const POR_TANDA = 1000;
const TOPE = 5000;
/** Un conteo a medias de hace más de esto ya no es una foto de nada. */
const HORAS_BORRADOR = 72;

interface Borrador {
  inicio: string;
  piezas: PiezaConteo[];
  contado: Record<string, number>;
  /** Contar otra vez solo las que se movieron mientras contaba. */
  recontar?: boolean;
}

const claveBorrador = (u: number) => `lux-conteo-v2-${u}`;

function leerBorrador(u: number): Borrador | null {
  try {
    const crudo = localStorage.getItem(claveBorrador(u));
    if (!crudo) return null;
    const b = JSON.parse(crudo) as Borrador;
    const horas = (Date.now() - new Date(b.inicio).getTime()) / 3_600_000;
    if (!Array.isArray(b.piezas) || !Number.isFinite(horas) || horas > HORAS_BORRADOR) return null;
    return b;
  } catch {
    return null;
  }
}

function guardarBorrador(u: number, b: Borrador) {
  try { localStorage.setItem(claveBorrador(u), JSON.stringify(b)); } catch { /* sin almacenamiento: se cuenta igual */ }
}

function borrarBorrador(u: number) {
  try { localStorage.removeItem(claveBorrador(u)); } catch { /* nada que borrar */ }
}

/** Lo que se busca en una consulta `or` de PostgREST, sin lo que la rompe. */
const limpiarBusqueda = (t: string) => t.trim().replace(/[%,()"\\:]/g, ' ');

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

type Vista = 'faltan' | 'contadas' | 'todas';

/** Un conteo de cualquier ubicación, para llevar al administrador hasta él. */
interface ConteoAviso {
  id: number;
  ubicacion_id: number;
  ubicacion: string | null;
  creado_en: string;
  lineas_por_revisar: number;
  lineas_ajustadas: number;
}

/** Qué pasó con lo que no cuadró, dicho como lo dice la tienda. */
const ESTADO_AJUSTE: Record<AjusteConteo, string> = {
  pendiente: 'Por revisar',
  aplicado: 'Inventario ajustado',
  descartado: 'Se dejó como estaba',
  revertido: 'Ajuste deshecho',
};

export function ConteoSemanal() {
  const { ubicaciones } = useUbicaciones();
  const [ubicacionId, setUbicacionId] = useState<number | null>(null);
  const [piezas, setPiezas] = useState<PiezaConteo[]>([]);
  const [contado, setContado] = useState<Map<number, number>>(new Map());
  const [inicio, setInicio] = useState<string>(() => new Date().toISOString());
  const [recontar, setRecontar] = useState(false);
  const [retomado, setRetomado] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [cambiaron, setCambiaron] = useState<ResultadoConteo['cambiaron']>([]);
  const [paso, setPaso] = useState<'contar' | 'revisar'>('contar');
  const [ver, setVer] = useState<Vista>('faltan');
  const [texto, setTexto] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ceroAFaltan, setCeroAFaltan] = useState(false);
  const [anteriores, setAnteriores] = useState<ConteoAnterior[]>([]);
  const [detalleDe, setDetalleDe] = useState<number | null>(null);
  const [lineas, setLineas] = useState<LineaConteo[]>([]);
  // Los conteos de cualquier ubicación con diferencias por revisar, y los
  // últimos que cambiaron el inventario (para deshacerlos sin buscarlos).
  const [porRevisar, setPorRevisar] = useState<ConteoAviso[]>([]);
  const [ajustados, setAjustados] = useState<ConteoAviso[]>([]);
  // El conteo que el administrador eligió arriba: se abre cuando su
  // ubicación termina de cargar.
  const abrirAlCargar = useRef<number | null>(null);
  // Lo que el administrador está haciendo con un conteo, y lo que salió.
  const [resolviendo, setResolviendo] = useState(false);
  const [resultado, setResultado] = useState<{ tono: 'exito' | 'alerta' | 'error'; texto: string } | null>(null);
  // La base tiene esquema-conteo-autorizado.sql: guardar no ajusta el inventario.
  const [conAutorizacion, setConAutorizacion] = useState(false);
  const { esAdmin } = useSesion();
  const entradas = useRef(new Map<number, HTMLInputElement>());
  const visor = useVisorFoto();
  const tituloRevisar = useRef<HTMLHeadingElement>(null);

  // Arranca en la primera ubicación de la tienda.
  useEffect(() => {
    if (ubicacionId === null && ubicaciones.length > 0) setUbicacionId(ubicaciones[0]!.id);
  }, [ubicaciones, ubicacionId]);

  /** Lo que hay de verdad en la ubicación, pieza por pieza. */
  const traerPiezas = useCallback(async (u: number): Promise<PiezaConteo[]> => {
    const salida: PiezaConteo[] = [];
    for (let desde = 0; desde < TOPE; desde += POR_TANDA) {
      const { data, error: err } = await supabase
        .from('v_venta_ubicacion')
        // `existencia` es lo que hay; `cantidad` es lo libre. Se cuenta lo que hay.
        .select('modelo_id, sku, nombre, variante, categoria, foto_thumb_path, foto_path, familia, existencia, apartadas')
        .eq('ubicacion_id', u)
        .gt('existencia', 0)
        .order('nombre', { ascending: true })
        .order('variante', { ascending: true, nullsFirst: true })
        .range(desde, desde + POR_TANDA - 1);
      if (err) throw err;
      const lote = (data as unknown as (Omit<PiezaConteo, 'vista'> & { existencia: number })[] | null) ?? [];
      salida.push(...lote.map(({ existencia, ...resto }) => ({ ...resto, vista: existencia, apartadas: resto.apartadas ?? 0 })));
      if (lote.length < POR_TANDA) break;
    }
    return salida;
  }, []);

  const traerAnteriores = useCallback(async (u: number) => {
    const columnas = 'id, creado_en, ubicacion, quien, lineas, lineas_distintas, piezas_faltaron, piezas_sobraron, notas';
    const pedir = (cols: string) => supabase
      .from('v_conteos')
      .select(cols)
      .eq('ubicacion_id', u)
      .order('creado_en', { ascending: false })
      .limit(6);
    // Con lo de esquema-conteo-autorizado.sql (lo que espera al
    // administrador); sin él, como antes. Sin la vista (la base de antes de
    // esquema-conteo-y-cotizar.sql) el historial no sale y el conteo
    // funciona igual.
    const conRevision = `${columnas}, lineas_por_revisar, lineas_ajustadas`;
    let r = await pedir(conRevision);
    // Si la base ya tiene el #64, el conteo no toca el inventario y la
    // pantalla lo dice; sin él, todavía lo ajusta y no se puede decir eso.
    const nueva = !r.error;
    setConAutorizacion(nueva);
    if (r.error) r = await pedir(columnas);
    let lista = (r.data as unknown as ConteoAnterior[] | null) ?? [];
    // El que se eligió arriba entra aunque sea más viejo que los seis últimos.
    const elegido = abrirAlCargar.current;
    if (nueva && elegido !== null && !lista.some((c) => c.id === elegido)) {
      const uno = await supabase.from('v_conteos').select(conRevision).eq('id', elegido).eq('ubicacion_id', u).maybeSingle();
      if (uno.data) lista = [...lista, uno.data as unknown as ConteoAnterior];
    }
    setAnteriores(lista);
    // De todas las ubicaciones: los que esperan revisión y los últimos que
    // ajustaron el inventario, para decirlo arriba.
    const deTodas = 'id, ubicacion_id, ubicacion, creado_en, lineas_por_revisar, lineas_ajustadas';
    const [p, a] = await Promise.all([
      supabase.from('v_conteos').select(deTodas).gt('lineas_por_revisar', 0).order('creado_en', { ascending: false }).limit(20),
      supabase.from('v_conteos').select(deTodas).gt('lineas_ajustadas', 0).order('creado_en', { ascending: false }).limit(4),
    ]);
    setPorRevisar(p.error ? [] : ((p.data as ConteoAviso[] | null) ?? []));
    setAjustados(a.error ? [] : ((a.data as ConteoAviso[] | null) ?? []));
  }, []);

  /**
   * Empieza o retoma el conteo de una ubicación. Si hay uno a medias en
   * este teléfono, sigue con su foto: lo contado se contó contra ella.
   * Las piezas que llegaron después se suman con lo que hay hoy.
   */
  const cargar = useCallback(async (u: number, { nuevo = false }: { nuevo?: boolean } = {}) => {
    setCargando(true);
    setError(null);
    setPaso('contar');
    setTexto('');
    setCeroAFaltan(false);
    try {
      const frescas = await traerPiezas(u);
      const b = nuevo ? null : leerBorrador(u);
      if (nuevo) borrarBorrador(u);
      if (b) {
        const ya = new Set(b.piezas.map((p) => p.modelo_id));
        const lista = b.recontar ? b.piezas : [...b.piezas, ...frescas.filter((p) => !ya.has(p.modelo_id))];
        setPiezas(lista);
        setContado(new Map(Object.entries(b.contado).map(([k, v]) => [Number(k), v])));
        setInicio(b.inicio);
        setRecontar(Boolean(b.recontar));
        setRetomado(Object.keys(b.contado).length);
      } else {
        setPiezas(frescas);
        setContado(new Map());
        setInicio(new Date().toISOString());
        setRecontar(false);
        setRetomado(null);
      }
      setVer('faltan');
    } catch (e) {
      setError(mensajeDeError(e));
      setPiezas([]);
    } finally {
      setCargando(false);
    }
    void traerAnteriores(u);
  }, [traerPiezas, traerAnteriores]);

  useEffect(() => {
    if (ubicacionId !== null) {
      setExito(null);
      setCambiaron([]);
      void cargar(ubicacionId);
    }
  }, [ubicacionId, cargar]);

  // Cada toque queda en el teléfono. Sin nada contado no hay borrador.
  useEffect(() => {
    if (ubicacionId === null || cargando) return;
    if (contado.size === 0) { borrarBorrador(ubicacionId); return; }
    guardarBorrador(ubicacionId, {
      inicio, piezas, recontar,
      contado: Object.fromEntries([...contado.entries()].map(([k, v]) => [String(k), v])),
    });
  }, [ubicacionId, cargando, contado, piezas, inicio, recontar]);

  useEffect(() => {
    if (paso === 'revisar') tituloRevisar.current?.focus();
  }, [paso]);

  const cuentas = useMemo(() => {
    const contadas = piezas.filter((p) => contado.has(p.modelo_id));
    const distintas = contadas.filter((p) => contado.get(p.modelo_id) !== p.vista);
    const sinContar = piezas.filter((p) => !contado.has(p.modelo_id));
    const bajoPedido = contadas.filter((p) => p.apartadas > 0 && (contado.get(p.modelo_id) ?? 0) < p.apartadas);
    const faltan = distintas.reduce((n, p) => n + Math.max(0, p.vista - (contado.get(p.modelo_id) ?? 0)), 0);
    const sobran = distintas.reduce((n, p) => n + Math.max(0, (contado.get(p.modelo_id) ?? 0) - p.vista), 0);
    return { contadas, distintas, sinContar, bajoPedido, faltan, sobran };
  }, [piezas, contado]);

  /*
    LA LISTA NO SALTA MIENTRAS SE CUENTA.

    En "Por contar", una fila con número ya está contada; si saliera de la
    lista en ese momento, al escribir el "1" de un "12" la fila se iría con
    el dedo encima. Se reacomoda al cambiar de vista o de búsqueda, con una
    foto de lo contado tomada entonces.
  */
  const contadoAhora = useRef(contado);
  useEffect(() => { contadoAhora.current = contado; }, [contado]);
  const [fotoVista, setFotoVista] = useState<Map<number, number>>(new Map());
  useEffect(() => { setFotoVista(new Map(contadoAhora.current)); }, [ver, texto, piezas]);

  /** Elegir una vista reacomoda la lista, aunque sea la que ya estaba. */
  function elegirVista(v: Vista) {
    setVer(v);
    setFotoVista(new Map(contado));
  }

  const visibles = useMemo(() => {
    const t = sinAcentos(texto.trim());
    return piezas.filter((p) => {
      if (ver === 'faltan' && fotoVista.has(p.modelo_id)) return false;
      if (ver === 'contadas' && !fotoVista.has(p.modelo_id)) return false;
      if (!t) return true;
      return sinAcentos(`${p.nombre} ${p.variante ?? ''} ${p.sku}`).includes(t);
    });
  }, [piezas, fotoVista, ver, texto]);

  /*
    UN PRODUCTO, SUS MEDIDAS DEBAJO.

    Una cadena de 45 cm y otra de 60 cm son el mismo producto (la misma
    familia): se cuentan juntas, bajo su nombre y su foto, cada una con su
    medida. Antes salían como dos productos sueltos, separados en la lista
    y con el nombre repetido, y había que leer el final de cada renglón para
    saber cuál era cuál.
  */
  const familias = useMemo(() => agruparPorFamilia(visibles), [visibles]);
  // El orden en que se ven, para que Enter pase a la siguiente que se ve.
  const enOrden = useMemo(() => familias.flatMap((f) => f.variantes), [familias]);
  // La foto en grande: cada producto con sus medidas. Sin cifras: el conteo
  // es a ciegas, y el visor tampoco dice cuántas espera el sistema.
  const fichas = useMemo<FotoAmpliada[]>(() => familias.map((f) => ({
    clave: f.clave,
    nombre: f.cabeza.nombre,
    categoria: f.cabeza.categoria,
    variantes: f.variantes.map((v) => ({
      id: v.modelo_id, etiqueta: v.variante, sku: v.sku,
      path: v.foto_path ?? null, thumbPath: v.foto_thumb_path,
    })),
  })), [familias]);

  /** Abre el producto; si se tocó la foto de una medida, en esa medida. */
  function verFoto(clave: number, varianteId?: number) {
    const lista = varianteId === undefined
      ? fichas
      : fichas.map((x) => (x.clave === clave ? { ...x, inicial: varianteId } : x));
    const f = lista.find((x) => x.clave === clave);
    if (f) visor.abrir(f, lista);
  }

  function poner(id: number, valor: number | null) {
    setExito(null);
    setContado((prev) => {
      const copia = new Map(prev);
      if (valor === null) copia.delete(id);
      else copia.set(id, Math.max(0, Math.min(Math.trunc(valor), 99_999)));
      return copia;
    });
  }

  /** Escribir: vacío es "no la conté", no cero. */
  function escribir(id: number, texto: string) {
    const limpio = texto.replace(/\D/g, '');
    poner(id, limpio === '' ? null : Number(limpio));
  }

  /** Enter pasa a la siguiente pieza de la lista, sin soltar el teclado. */
  function siguiente(id: number) {
    const i = enOrden.findIndex((p) => p.modelo_id === id);
    const proxima = enOrden[i + 1];
    if (proxima) entradas.current.get(proxima.modelo_id)?.focus();
    else entradas.current.get(id)?.blur();
  }

  function contarOtraVez(id: number) {
    poner(id, null);
    setPaso('contar');
    setVer('faltan');
    setTexto('');
    // Que esa fila esté en la lista aunque la vista ya fuera "Por contar".
    const sinElla = new Map(contado);
    sinElla.delete(id);
    setFotoVista(sinElla);
    // Después de que se pinte la lista.
    window.setTimeout(() => entradas.current.get(id)?.focus(), 50);
  }

  function ponerCeroALasQueFaltan() {
    setContado((prev) => {
      const copia = new Map(prev);
      for (const p of cuentas.sinContar) copia.set(p.modelo_id, 0);
      return copia;
    });
    setCeroAFaltan(false);
  }

  async function guardar() {
    if (ubicacionId === null || cuentas.contadas.length === 0) return;
    setGuardando(true);
    setError(null);
    const detalle = cuentas.contadas.map((p) => ({
      modelo_id: p.modelo_id,
      contada: contado.get(p.modelo_id) ?? 0,
      vista: p.vista,
    }));
    const { data, error: err } = await supabase.rpc('registrar_conteo', {
      p_ubicacion_id: ubicacionId,
      p_detalle: detalle,
      p_notas: notas.trim() || null,
    });
    setGuardando(false);
    if (err) { setError(mensajeDeError(err)); return; }

    const r = data as ResultadoConteo;
    const nombreUbicacion = ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? 'esta ubicación';
    setNotas('');
    // Con el #64 el conteo no toca el inventario: lo que no cuadra espera al
    // administrador. Sin él, la base de antes todavía lo ajustaba sola.
    const sinTocar = r.por_revisar !== undefined;
    setExito(r.aplicadas > 0
      ? `Conteo de ${nombreUbicacion} guardado: ${formatearEntero(r.aplicadas)} pieza${r.aplicadas === 1 ? '' : 's'} contada${r.aplicadas === 1 ? '' : 's'}`
        + (r.con_diferencia === 0
          ? ', todas cuadraron.'
          : sinTocar
            ? `. ${formatearEntero(r.con_diferencia)} no cuadra${r.con_diferencia === 1 ? '' : 'n'}: el inventario no cambia hasta que el administrador lo revise${esAdmin ? ' (abajo, en los conteos anteriores)' : ''}.`
            : `, ${formatearEntero(r.con_diferencia)} con la existencia corregida a lo que contaste.`)
      : null);
    setCambiaron(r.cambiaron);

    if (r.cambiaron.length > 0) {
      // Una foto nueva solo de las que se movieron: se cuentan otra vez
      // contra lo que hay ahora.
      const porId = new Map(piezas.map((p) => [p.modelo_id, p]));
      const otra: PiezaConteo[] = r.cambiaron.map((c) => ({
        ...(porId.get(c.modelo_id) ?? {
          modelo_id: c.modelo_id, sku: '', nombre: c.nombre, variante: null,
          categoria: null, foto_thumb_path: null, apartadas: 0, familia: c.modelo_id,
        }),
        vista: c.ahora,
      }));
      setPiezas(otra);
      setContado(new Map());
      setInicio(new Date().toISOString());
      setRecontar(true);
      setRetomado(null);
      setPaso('contar');
      setVer('faltan');
      void traerAnteriores(ubicacionId);
      return;
    }
    borrarBorrador(ubicacionId);
    await cargar(ubicacionId, { nuevo: true });
  }

  const traerLineas = useCallback(async (id: number) => {
    const columnas = 'conteo_id, modelo_id, sku, nombre, variante, cantidad_esperada, cantidad_contada, diferencia';
    const pedir = (cols: string) => supabase
      .from('v_conteo_detalle')
      .select(cols)
      .eq('conteo_id', id)
      .neq('diferencia', 0)
      .order('nombre');
    // Con el estado de cada línea (el #64); sin él, como antes.
    let r = await pedir(`${columnas}, detalle_id, ajuste, ajuste_quien, ajuste_en, ajuste_nota, apartadas`);
    if (r.error) r = await pedir(columnas);
    setLineas((r.data as unknown as LineaConteo[] | null) ?? []);
  }, []);

  // Abre el conteo que se eligió arriba en cuanto llega a la lista, y baja hasta él.
  useEffect(() => {
    const id = abrirAlCargar.current;
    if (id === null) return;
    abrirAlCargar.current = null;
    if (!anteriores.some((c) => c.id === id)) return;
    setResultado(null);
    setDetalleDe(id);
    setLineas([]);
    void traerLineas(id);
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`conteo-${id}`)?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
  }, [anteriores, traerLineas]);

  /** Lleva al administrador al conteo elegido: su ubicación, con el conteo abierto. */
  function irAConteo(c: ConteoAviso) {
    abrirAlCargar.current = c.id;
    if (c.ubicacion_id !== ubicacionId) setUbicacionId(c.ubicacion_id);
    else void traerAnteriores(c.ubicacion_id);
  }

  async function verDetalle(id: number) {
    setResultado(null);
    if (detalleDe === id) { setDetalleDe(null); return; }
    setDetalleDe(id);
    setLineas([]);
    await traerLineas(id);
  }

  /** Lo que salió de ajustar, dejar o deshacer, dicho en una línea; y lo que no se pudo, con su porqué. */
  function decirResultado(r: ResultadoAjuste, hecho: string) {
    const no = r.rechazadas.map((x) => `${x.nombre}: ${x.motivo}`).join(' ');
    setResultado(r.rechazadas.length > 0
      ? { tono: 'alerta', texto: `${hecho}${hecho ? ' ' : ''}No se pudo con ${r.rechazadas.length === 1 ? 'una' : r.rechazadas.length}: ${no}` }
      : { tono: 'exito', texto: hecho });
  }

  /**
   * El administrador decide qué hacer con lo que no cuadró: ajustar el
   * inventario a lo contado (por la diferencia, nunca por debajo de lo que
   * apartan los pedidos) o dejarlo como está. Sin líneas, todas las del conteo.
   */
  async function resolver(conteoId: number, aplicar: boolean, lineasIds: number[] | null) {
    if (aplicar && !window.confirm(lineasIds
      ? '¿Ajustar el inventario a lo que se contó en esta pieza?'
      : '¿Ajustar el inventario a lo que se contó en todas las piezas por revisar de este conteo?')) return;
    setResolviendo(true);
    setResultado(null);
    const { data, error: err } = await supabase.rpc('admin_resolver_conteo', {
      p_conteo_id: conteoId,
      p_lineas: lineasIds,
      p_aplicar: aplicar,
      p_nota: null,
    });
    setResolviendo(false);
    if (err) {
      setResultado({ tono: 'error', texto: err.code === 'PGRST202' ? 'Para revisar los conteos falta correr en Supabase esquema-conteo-autorizado.sql.' : mensajeDeError(err) });
      return;
    }
    const r = data as ResultadoAjuste;
    decirResultado(r, aplicar
      ? (r.aplicadas ? `Inventario ajustado en ${r.aplicadas} pieza${r.aplicadas === 1 ? '' : 's'}.` : '')
      : `Se dejó como estaba: ${r.dejadas ?? 0} pieza${r.dejadas === 1 ? '' : 's'}.`);
    await traerLineas(conteoId);
    if (ubicacionId !== null) void traerAnteriores(ubicacionId);
  }

  /** Devuelve al inventario lo que un conteo ajustó: el conteo se queda como registro. */
  async function deshacer(c: ConteoAnterior) {
    if (!window.confirm(
      `¿Deshacer lo que el conteo del ${formatearFechaHora(c.creado_en)} cambió en el inventario?\n\nLo que quitó vuelve y lo que sumó se quita. El conteo se queda en el historial como lo que se contó.`,
    )) return;
    setResolviendo(true);
    setResultado(null);
    const { data, error: err } = await supabase.rpc('admin_deshacer_conteo', { p_conteo_id: c.id, p_nota: null });
    setResolviendo(false);
    if (err) {
      setResultado({ tono: 'error', texto: err.code === 'PGRST202' ? 'Para deshacer un conteo falta correr en Supabase esquema-conteo-autorizado.sql.' : mensajeDeError(err) });
      return;
    }
    const r = data as ResultadoAjuste;
    const piezas = r.piezas ?? 0;
    decirResultado(r, r.deshechas
      ? `Deshecho: ${piezas >= 0 ? `volvieron ${formatearEntero(piezas)}` : `se quitaron ${formatearEntero(-piezas)}`} pieza${Math.abs(piezas) === 1 ? '' : 's'} al inventario.`
      : 'No había nada que deshacer.');
    await traerLineas(c.id);
    if (ubicacionId !== null) {
      void traerAnteriores(ubicacionId);
      // La lista para contar cambió con el inventario: se vuelve a leer.
      if (contado.size === 0) void cargar(ubicacionId, { nuevo: true });
    }
  }

  const ubicacion = ubicaciones.find((u) => u.id === ubicacionId);
  const total = piezas.length;
  const hechas = cuentas.contadas.length;
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;

  /* ------------------------------------------------------------ revisar */

  if (paso === 'revisar') {
    return (
      <div className="pagina pagina--angosta mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1 tabIndex={-1} ref={tituloRevisar}>Revisa antes de guardar</h1>
            <p>
              {ubicacion?.nombre}: contaste {formatearEntero(hechas)} de {formatearEntero(total)} pieza{total === 1 ? '' : 's'}.
              {' '}{cuentas.distintas.length === 0
                ? 'Todo lo que contaste cuadra con el sistema.'
                : `${formatearEntero(cuentas.distintas.length)} no cuadra${cuentas.distintas.length === 1 ? '' : 'n'}.`}
            </p>
          </div>
        </div>

        {error ? <Aviso tono="error" titulo="No se pudo guardar el conteo">{error}</Aviso> : null}

        {cuentas.distintas.length > 0 ? (
          <>
            <h2 className="seccion-titulo">
              Lo que no cuadra
              {cuentas.faltan > 0 ? ` · faltan ${formatearEntero(cuentas.faltan)}` : ''}
              {cuentas.sobran > 0 ? ` · sobran ${formatearEntero(cuentas.sobran)}` : ''}
            </h2>
            <p className="campo__pista">
              {conAutorizacion
                ? 'Si dudas de alguna, cuéntala otra vez antes de guardar. Guardar no cambia el inventario: lo que no cuadre queda para que el administrador lo revise y decida.'
                : 'Si dudas de alguna, cuéntala otra vez antes de guardar: al guardar, la existencia queda en lo que contaste.'}
            </p>
            <ul className="conteo-lista">
              {cuentas.distintas.map((p) => {
                const n = contado.get(p.modelo_id) ?? 0;
                const dif = n - p.vista;
                return (
                  <li className="conteo-fila conteo-fila--revisar" key={p.modelo_id}>
                    <MiniaturaTocable
                      className="conteo-fila__foto"
                      thumb={p.foto_thumb_path}
                      nombre={nombreConVariante(p.nombre, p.variante)}
                      alVer={() => visor.abrir({
                        clave: p.modelo_id,
                        nombre: p.nombre,
                        categoria: p.categoria,
                        variantes: [{ id: p.modelo_id, etiqueta: p.variante, sku: p.sku, path: p.foto_path ?? null, thumbPath: p.foto_thumb_path }],
                      })}
                    />
                    <div className="conteo-fila__quien">
                      <span className="conteo-fila__nombre">{nombreConVariante(p.nombre, p.variante)}</span>
                      <span className="conteo-fila__dato">
                        {p.sku} · el sistema tenía {formatearEntero(p.vista)}, contaste {formatearEntero(n)}
                      </span>
                      {p.apartadas > 0 && n < p.apartadas ? (
                        <span className="conteo-fila__aviso">
                          {p.apartadas} {p.apartadas === 1 ? 'es' : 'son'} de un pedido: búscala{p.apartadas === 1 ? '' : 's'} donde guardan los pedidos y cuéntala{p.apartadas === 1 ? '' : 's'} también.
                        </span>
                      ) : null}
                    </div>
                    <div className="conteo-paso conteo-paso--revisar">
                      <span className={dif < 0 ? 'conteo-dif conteo-dif--falta' : 'conteo-dif'}>
                        {dif < 0 ? `Faltan ${-dif}` : `Sobran ${dif}`}
                      </span>
                      <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => contarOtraVez(p.modelo_id)}>
                        Contar otra vez
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {cuentas.sinContar.length > 0 ? (
          <div className="panel conteo__sin-contar">
            <span className="panel__titulo">
              {formatearEntero(cuentas.sinContar.length)} sin contar
            </span>
            <p className="campo__pista">
              Las que no contaste no se tocan: siguen con lo que dice el sistema. Si recorriste toda la
              ubicación y no las encontraste, ponlas en cero.
            </p>
            {ceroAFaltan ? (
              <div className="acciones">
                <button type="button" className="boton boton--peligro" onClick={ponerCeroALasQueFaltan}>
                  Sí, no encontré ninguna de las {formatearEntero(cuentas.sinContar.length)}
                </button>
                <button type="button" className="boton boton--secundario" onClick={() => setCeroAFaltan(false)}>
                  No
                </button>
              </div>
            ) : (
              <div className="acciones">
                <button type="button" className="boton boton--secundario" onClick={() => { setPaso('contar'); elegirVista('faltan'); }}>
                  Seguir contando
                </button>
                <button type="button" className="boton boton--secundario" onClick={() => setCeroAFaltan(true)}>
                  No las encontré: ponlas en cero
                </button>
              </div>
            )}
          </div>
        ) : null}

        <Campo etiqueta="Nota para el administrador" htmlFor="conteo-notas" pista="Opcional. Por ejemplo: una pieza dañada en la bodega.">
          <textarea id="conteo-notas" maxLength={300} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Campo>

        <div className="acciones">
          <button type="button" className="boton boton--confirmar" disabled={guardando || hechas === 0} onClick={() => void guardar()}>
            {guardando ? 'Guardando' : `Guardar conteo de ${formatearEntero(hechas)} pieza${hechas === 1 ? '' : 's'}`}
          </button>
          <button type="button" className="boton boton--secundario" disabled={guardando} onClick={() => setPaso('contar')}>
            Volver a contar
          </button>
        </div>

        <VisorFoto {...visor.props} />
      </div>
    );
  }

  /* ------------------------------------------------------------- contar */

  return (
    <div className={hechas > 0 ? 'pagina mostrador pagina--con-barra' : 'pagina mostrador'}>
      <div className="encabezado-pagina">
        <div>
          <h1>{recontar ? 'Contar otra vez' : 'Conteo de inventario'}</h1>
          <p>
            {recontar
              ? 'Estas piezas se vendieron o se movieron mientras contabas. Cuéntalas de nuevo, como están ahora.'
              : `Cuenta todas las piezas que hay en la ubicación, también las de los pedidos y las apartadas aunque estén guardadas aparte. Al final revisas lo que no cuadra.${conAutorizacion ? ' El conteo no cambia el inventario: lo ajusta el administrador.' : ''}`}
          </p>
        </div>
      </div>

      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}
      {/* Para el administrador: los conteos que esperan su revisión, de cualquier ubicación. */}
      {esAdmin && porRevisar.length > 0 && !recontar ? (
        <Aviso tono="alerta" titulo={porRevisar.length === 1 ? 'Un conteo espera tu revisión' : `${porRevisar.length} conteos esperan tu revisión`}>
          <p>Lo que no cuadró no cambió el inventario. Tócalo para abrirlo y decide pieza por pieza.</p>
          <div className="acciones acciones--sueltas">
            {porRevisar.map((x) => (
              <button
                key={x.id}
                type="button"
                className="boton boton--secundario boton--pequeno"
                onClick={() => irAConteo(x)}
              >
                {x.ubicacion ?? 'Ubicación'} · {formatearFechaHora(x.creado_en)} · {x.lineas_por_revisar} por revisar
              </button>
            ))}
          </div>
        </Aviso>
      ) : null}
      {/* Para el administrador: los últimos conteos que cambiaron el
          inventario, a un toque de "Deshacer". Antes había que elegir la
          ubicación, bajar al final de la lista y abrir el conteo. */}
      {esAdmin && ajustados.length > 0 && !recontar ? (
        <Aviso titulo="¿Un conteo dejó mal el inventario?">
          <p>Ábrelo y toca «Deshacer el ajuste de este conteo»: lo que quitó vuelve al inventario y el conteo se queda en el historial como lo que se contó.</p>
          <div className="acciones acciones--sueltas">
            {ajustados.map((x) => (
              <button
                key={x.id}
                type="button"
                className="boton boton--secundario boton--pequeno"
                onClick={() => irAConteo(x)}
              >
                {x.ubicacion ?? 'Ubicación'} · {formatearFechaHora(x.creado_en)} · ajustó {x.lineas_ajustadas}
              </button>
            ))}
          </div>
        </Aviso>
      ) : null}
      {cambiaron.length > 0 && recontar ? (
        <Aviso tono="alerta" titulo={`${cambiaron.length} ${cambiaron.length === 1 ? 'pieza cambió' : 'piezas cambiaron'} mientras contabas`}>
          {cambiaron.map((c) => `${c.nombre} (tenía ${c.vista}, ahora ${c.ahora})`).join(' · ')}. No se guardaron: cuéntalas otra vez.
        </Aviso>
      ) : null}
      {error ? <Aviso tono="error" titulo="No se pudo cargar el conteo">{error}</Aviso> : null}

      <div className="selector-ubicacion" role="group" aria-label="Ubicación">
        {ubicaciones.map((u) => (
          <button key={u.id} type="button" aria-pressed={u.id === ubicacionId} onClick={() => setUbicacionId(u.id)}>
            {u.nombre}
          </button>
        ))}
      </div>
      <div className="selector-ubicacion__movil">
        <Campo etiqueta="Ubicación que cuentas" htmlFor="conteo-ubicacion">
          <select id="conteo-ubicacion" value={ubicacionId ?? ''} onChange={(e) => setUbicacionId(Number(e.target.value))}>
            {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </Campo>
      </div>

      {retomado !== null && !recontar ? (
        <div className="conteo__retomado">
          <p>
            Sigues el conteo que empezaste el {formatearFechaHora(inicio)}: {formatearEntero(retomado)} ya contada{retomado === 1 ? '' : 's'}.
          </p>
          <button
            type="button"
            className="boton boton--secundario boton--pequeno"
            onClick={() => { if (ubicacionId !== null) void cargar(ubicacionId, { nuevo: true }); }}
          >
            Empezar de nuevo
          </button>
        </div>
      ) : null}

      {cargando ? <Cargando texto="Trayendo las piezas" /> : total === 0 ? (
        <Vacio titulo={`No hay piezas registradas en ${ubicacion?.nombre ?? 'esta ubicación'}`}>
          <p>Si encontraste alguna aquí, búscala abajo y cuéntala.</p>
        </Vacio>
      ) : (
        <>
          <div className="conteo__progreso">
            <div className="progreso__cabecera">
              <span className="progreso__titulo">Contadas</span>
              <span className="progreso__cifra">{formatearEntero(hechas)} de {formatearEntero(total)}</span>
            </div>
            <div className="progreso__riel" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Piezas contadas">
              <div
                className={pct >= 100 ? 'progreso__relleno progreso__relleno--completo' : 'progreso__relleno'}
                style={{ transform: `scaleX(${pct / 100})` }}
              />
            </div>
          </div>

          <div className="conteo__herramientas">
            <div className="conteo__vistas" role="group" aria-label="Qué piezas ver">
              <button type="button" aria-pressed={ver === 'faltan'} onClick={() => elegirVista('faltan')}>
                Por contar · {formatearEntero(total - hechas)}
              </button>
              <button type="button" aria-pressed={ver === 'contadas'} onClick={() => elegirVista('contadas')}>
                Contadas · {formatearEntero(hechas)}
              </button>
              <button type="button" aria-pressed={ver === 'todas'} onClick={() => elegirVista('todas')}>
                Todas
              </button>
            </div>
            <Campo etiqueta="Buscar en esta ubicación" htmlFor="conteo-buscar">
              <input
                id="conteo-buscar" type="search" autoComplete="off" value={texto}
                placeholder="Nombre, medida o SKU" onChange={(e) => setTexto(e.target.value)}
              />
            </Campo>
          </div>

          {visibles.length === 0 ? (
            <p className="conteo__nada">
              {ver === 'faltan' && !texto
                ? 'Contaste todas las de la lista. Revisa y guarda.'
                : texto ? 'Ninguna pieza coincide con lo que buscas.' : 'Todavía no has contado ninguna.'}
            </p>
          ) : (
            <ul className="conteo-lista">
              {familias.map((f) => {
                // Un producto suelto: una fila, como siempre.
                if (f.variantes.length === 1) {
                  const p = f.cabeza;
                  const n = contado.get(p.modelo_id);
                  const nombre = nombreConVariante(p.nombre, p.variante);
                  return (
                    <li className={n === undefined ? 'conteo-fila' : 'conteo-fila conteo-fila--contada'} key={p.modelo_id}>
                      <MiniaturaTocable className="conteo-fila__foto" thumb={p.foto_thumb_path} nombre={nombre} alVer={() => verFoto(f.clave)} />
                      <div className="conteo-fila__quien">
                        <span className="conteo-fila__nombre">{nombre}</span>
                        <span className="conteo-fila__dato">{p.sku}{n !== undefined ? ' · contada' : ''}</span>
                      </div>
                      <PasoConteo pieza={p} nombre={nombre} n={n} poner={poner} escribir={escribir} siguiente={siguiente} entradas={entradas} />
                    </li>
                  );
                }
                // Un producto con medidas: su nombre y su foto una vez, y
                // cada medida debajo con su contador.
                const contadas = f.variantes.filter((v) => contado.has(v.modelo_id)).length;
                const todas = contadas === f.variantes.length;
                const fotoCabeza = (f.variantes.find((v) => v.foto_thumb_path) ?? f.cabeza).foto_thumb_path;
                return (
                  <li className={todas ? 'conteo-familia conteo-familia--contada' : 'conteo-familia'} key={`f${f.clave}`}>
                    <div className="conteo-familia__cabeza">
                      <MiniaturaTocable className="conteo-fila__foto" thumb={fotoCabeza} nombre={f.cabeza.nombre} alVer={() => verFoto(f.clave)} />
                      <div className="conteo-fila__quien">
                        <span className="conteo-fila__nombre">{f.cabeza.nombre}</span>
                        <span className="conteo-fila__dato">
                          {f.variantes.length} medidas · {contadas === 0 ? 'ninguna contada' : todas ? 'todas contadas' : `${contadas} contada${contadas === 1 ? '' : 's'}`}
                        </span>
                      </div>
                    </div>
                    <ul className="conteo-familia__variantes">
                      {f.variantes.map((v) => {
                        const n = contado.get(v.modelo_id);
                        const nombre = nombreConVariante(v.nombre, v.variante);
                        // Su propia foto solo si es otra que la de arriba: un
                        // color o un baño distinto se reconoce por la foto.
                        const fotoPropia = v.foto_thumb_path && v.foto_thumb_path !== fotoCabeza ? v.foto_thumb_path : null;
                        const clase = ['conteo-variante', fotoPropia ? 'conteo-variante--con-foto' : '', n === undefined ? '' : 'conteo-variante--contada']
                          .filter(Boolean).join(' ');
                        return (
                          <li className={clase} key={v.modelo_id}>
                            {fotoPropia ? (
                              <MiniaturaTocable className="conteo-variante__foto" thumb={fotoPropia} nombre={nombre} alVer={() => verFoto(f.clave, v.modelo_id)} />
                            ) : null}
                            <div className="conteo-variante__quien">
                              <span className="conteo-variante__medida">{v.variante ?? v.sku}</span>
                              <span className="conteo-fila__dato">{v.sku}{n !== undefined ? ' · contada' : ''}</span>
                            </div>
                            <PasoConteo pieza={v} nombre={nombre} n={n} poner={poner} escribir={escribir} siguiente={siguiente} entradas={entradas} />
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {!cargando && ubicacionId !== null && !recontar ? (
        <AgregarEncontrada
          ubicacionId={ubicacionId}
          yaEstan={piezas}
          alAgregar={(p) => {
            setPiezas((prev) => [p, ...prev]);
            setVer('faltan');
            setTexto('');
            window.setTimeout(() => entradas.current.get(p.modelo_id)?.focus(), 50);
          }}
        />
      ) : null}

      {anteriores.length > 0 && !recontar ? (
        <section className="conteo__anteriores" aria-labelledby="conteos-anteriores">
          <h2 className="seccion-titulo" id="conteos-anteriores">Conteos anteriores de {ubicacion?.nombre}</h2>
          {esAdmin && conAutorizacion ? (
            <p className="conteo__ayuda">Toca un conteo para ver qué no cuadró, ajustarlo o deshacer lo que cambió.</p>
          ) : null}
          <ul className="conteo-historial">
            {anteriores.map((c) => (
              <li key={c.id} id={`conteo-${c.id}`}>
                <button
                  type="button"
                  className="conteo-historial__fila"
                  aria-expanded={detalleDe === c.id}
                  disabled={c.lineas_distintas === 0}
                  onClick={() => void verDetalle(c.id)}
                >
                  <span className="conteo-historial__cuando">{formatearFechaHora(c.creado_en)} · {c.quien ?? '—'}</span>
                  <span className="conteo-historial__que">
                    {formatearEntero(c.lineas)} pieza{c.lineas === 1 ? '' : 's'}
                    {c.lineas_distintas === 0
                      ? ' · todo cuadró'
                      : ` · ${c.piezas_faltaron ? `faltaron ${c.piezas_faltaron}` : ''}${c.piezas_faltaron && c.piezas_sobraron ? ', ' : ''}${c.piezas_sobraron ? `sobraron ${c.piezas_sobraron}` : ''}`}
                  </span>
                  {c.lineas_por_revisar ? (
                    <span className="etiqueta etiqueta--alerta">{c.lineas_por_revisar} por revisar</span>
                  ) : null}
                  {c.lineas_ajustadas ? (
                    <span className="etiqueta">Ajustó {c.lineas_ajustadas}</span>
                  ) : null}
                </button>
                {detalleDe === c.id ? (
                  <div className="conteo-historial__abierto">
                    {resultado ? <Aviso tono={resultado.tono}>{resultado.texto}</Aviso> : null}
                    {/* El administrador decide; la vendedora ve lo mismo y sabe que espera. */}
                    {esAdmin && (c.lineas_por_revisar ?? 0) > 0 ? (
                      <div className="acciones acciones--sueltas">
                        <button type="button" className="boton boton--confirmar boton--pequeno" disabled={resolviendo} onClick={() => void resolver(c.id, true, null)}>
                          Ajustar el inventario en todas
                        </button>
                        <button type="button" className="boton boton--secundario boton--pequeno" disabled={resolviendo} onClick={() => void resolver(c.id, false, null)}>
                          Dejar todas como están
                        </button>
                      </div>
                    ) : null}
                    {esAdmin && (c.lineas_ajustadas ?? 0) > 0 ? (
                      <div className="acciones acciones--sueltas">
                        <button type="button" className="boton boton--peligro boton--pequeno" disabled={resolviendo} onClick={() => void deshacer(c)}>
                          Deshacer el ajuste de este conteo
                        </button>
                      </div>
                    ) : null}
                    <ul className="conteo-historial__detalle">
                      {c.notas ? <li className="conteo-historial__nota">{c.notas}</li> : null}
                      {lineas.map((l) => {
                        const id = l.detalle_id;
                        return (
                        <li key={id ?? l.modelo_id}>
                          <span>
                            {nombreConVariante(l.nombre, l.variante)} · tenía {l.cantidad_esperada}, se contaron {l.cantidad_contada}
                            <strong className={l.diferencia < 0 ? 'conteo-dif conteo-dif--falta' : 'conteo-dif'}>
                              {l.diferencia > 0 ? ` +${l.diferencia}` : ` ${l.diferencia}`}
                            </strong>
                          </span>
                          {l.ajuste ? <span className="conteo-historial__estado">{ESTADO_AJUSTE[l.ajuste]}{l.ajuste_quien ? ` · ${l.ajuste_quien}` : ''}</span> : null}
                          {l.ajuste === 'pendiente' && l.diferencia < 0 && (l.apartadas ?? 0) > 0 ? (
                            <span className="conteo-fila__aviso">
                              {l.apartadas} {l.apartadas === 1 ? 'está apartada' : 'están apartadas'} por pedidos: búscala{l.apartadas === 1 ? '' : 's'} donde guardan los pedidos antes de ajustar.
                            </span>
                          ) : null}
                          {esAdmin && l.ajuste === 'pendiente' && id !== undefined ? (
                            <span className="grupo-botones">
                              <button type="button" className="boton boton--secundario boton--pequeno" disabled={resolviendo} onClick={() => void resolver(c.id, true, [id])}>
                                Ajustar
                              </button>
                              <button type="button" className="boton boton--secundario boton--pequeno" disabled={resolviendo} onClick={() => void resolver(c.id, false, [id])}>
                                Dejar como está
                              </button>
                            </span>
                          ) : null}
                        </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hechas > 0 ? (
        <div className="barra-carrito">
          <div className="barra-carrito__resumen">
            <div className="barra-carrito__piezas">
              {formatearEntero(hechas)} de {formatearEntero(total)} contadas
            </div>
            <div className="barra-carrito__total">{ubicacion?.nombre ?? ''}</div>
          </div>
          <button type="button" className="boton" onClick={() => { setExito(null); setPaso('revisar'); }}>
            Revisar
          </button>
        </div>
      ) : null}

      <VisorFoto {...visor.props} />
    </div>
  );
}

/**
 * El contador de una pieza: − [ ] +. Vacío ("—") es "no la conté", que no es
 * lo mismo que cero. Enter pasa a la siguiente que se ve.
 */
function PasoConteo({ pieza, nombre, n, poner, escribir, siguiente, entradas }: {
  pieza: PiezaConteo;
  nombre: string;
  n: number | undefined;
  poner: (id: number, valor: number | null) => void;
  escribir: (id: number, texto: string) => void;
  siguiente: (id: number) => void;
  entradas: MutableRefObject<Map<number, HTMLInputElement>>;
}) {
  return (
    <div className="conteo-paso">
      <button
        type="button"
        aria-label={`Una menos de ${nombre}`}
        disabled={n === 0}
        onClick={() => poner(pieza.modelo_id, n === undefined ? 0 : n - 1)}
      >
        &minus;
      </button>
      <input
        ref={(el) => { if (el) entradas.current.set(pieza.modelo_id, el); else entradas.current.delete(pieza.modelo_id); }}
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="next"
        autoComplete="off"
        aria-label={`Piezas de ${nombre} que contaste`}
        placeholder="—"
        value={n === undefined ? '' : String(n)}
        onChange={(e) => escribir(pieza.modelo_id, e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); siguiente(pieza.modelo_id); } }}
      />
      <button
        type="button"
        aria-label={`Una más de ${nombre}`}
        onClick={() => poner(pieza.modelo_id, n === undefined ? 1 : n + 1)}
      >
        +
      </button>
    </div>
  );
}

/**
 * Una pieza que está en la ubicación pero no sale en la lista: alguien la
 * puso ahí sin moverla en el sistema. Se busca en todo el catálogo y se
 * cuenta como las demás; su foto es lo que el sistema dice que hay ahí
 * (casi siempre cero).
 */
function AgregarEncontrada({ ubicacionId, yaEstan, alAgregar }: {
  ubicacionId: number;
  yaEstan: PiezaConteo[];
  alAgregar: (p: PiezaConteo) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Omit<PiezaConteo, 'vista' | 'apartadas'>[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = limpiarBusqueda(texto);
    if (!abierto || t.length < 2) { setResultados([]); return; }
    let vigente = true;
    const reloj = window.setTimeout(() => {
      void (async () => {
        setBuscando(true);
        const { data, error: err } = await supabase
          .from('v_catalogo_venta')
          .select('id, sku, nombre, variante, categoria, foto_thumb_path, foto_path, familia')
          .or(`nombre.ilike.%${t}%,sku.ilike.%${t}%,variante.ilike.%${t}%`)
          .order('nombre')
          .limit(12);
        if (!vigente) return;
        setBuscando(false);
        setError(err ? mensajeDeError(err) : null);
        const ya = new Set(yaEstan.map((p) => p.modelo_id));
        setResultados(((data as { id: number; sku: string; nombre: string; variante: string | null; categoria: string | null; foto_thumb_path: string | null; foto_path: string | null; familia: number }[] | null) ?? [])
          .filter((m) => !ya.has(m.id))
          .map(({ id, ...resto }) => ({ modelo_id: id, ...resto })));
      })();
    }, 300);
    return () => { vigente = false; window.clearTimeout(reloj); };
  }, [texto, abierto, yaEstan]);

  async function elegir(m: Omit<PiezaConteo, 'vista' | 'apartadas'>) {
    // Lo que el sistema cree que hay de esa pieza aquí: la foto contra la
    // que se va a contar. Sin fila, cero.
    const { data, error: err } = await supabase
      .from('v_venta_ubicacion')
      .select('existencia, apartadas')
      .eq('ubicacion_id', ubicacionId)
      .eq('modelo_id', m.modelo_id)
      .maybeSingle();
    if (err) { setError(mensajeDeError(err)); return; }
    const fila = data as { existencia: number; apartadas: number } | null;
    alAgregar({ ...m, vista: fila?.existencia ?? 0, apartadas: fila?.apartadas ?? 0 });
    setTexto('');
    setAbierto(false);
  }

  if (!abierto) {
    return (
      <button type="button" className="boton boton--secundario conteo__agregar" onClick={() => setAbierto(true)}>
        Encontré una pieza que no está en la lista
      </button>
    );
  }

  return (
    <div className="panel conteo__buscar-otra">
      <span className="panel__titulo">Una pieza que no está en la lista</span>
      <Campo etiqueta="Búscala por nombre o SKU" htmlFor="conteo-otra" error={error}>
        <input id="conteo-otra" type="search" autoComplete="off" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} />
      </Campo>
      {buscando ? <p className="campo__pista">Buscando…</p> : null}
      {resultados.length > 0 ? (
        <ul className="conteo-resultados">
          {resultados.map((m) => (
            <li key={m.modelo_id}>
              <button type="button" onClick={() => void elegir(m)}>
                <span className="conteo-fila__nombre">{nombreConVariante(m.nombre, m.variante)}</span>
                <span className="conteo-fila__dato">{m.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : texto.trim().length >= 2 && !buscando ? <p className="campo__pista">Ninguna pieza coincide.</p> : null}
      <div className="acciones">
        <button type="button" className="boton boton--secundario" onClick={() => { setAbierto(false); setTexto(''); }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
