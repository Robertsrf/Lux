import { useCallback, useEffect, useMemo, useState } from 'react';
import { Aviso, Campo, Cargando, Vacio } from '../../../componentes/Piezas';
import { supabase, mensajeDeError } from '../../../lib/supabase';
import { agruparPorFamilia } from '../../../lib/familias';
import { armarConjunto } from '../../../lib/combinar';
import type { PiezaCombinable } from '../../../lib/combinar';
import { formatearBcv, formatearFecha, leerCifra } from '../../../lib/dinero';
import { urlPublicaFoto } from '../../../lib/fotos';
import { cargarCombosAdmin, cargarOfertasCasaAdmin, cargarOfertasPublicas } from '../../../lib/ofertasApi';
import { estadoDeCasa } from '../../../lib/ofertas';
import type { ComboAdmin, EstadoCasa, OfertaCasa, OfertaCasaAdmin, OfertaCombo, OfertasPublicas } from '../../../lib/ofertas';
import { CampoFoto } from './CamposLanding';

/* ------------------------------------------------------------------ */
/*  Los combos: los arma el navegador del administrador                 */
/* ------------------------------------------------------------------ */

interface FilaLibre extends PiezaCombinable {
  libre: number;
  armado: 'dije' | 'base' | null;
  precio_usd: number | null;
}

const COMBOS_MAX = 8;
/** De cuántas piezas es cada combo, en orden: así salen de 2, 3 y 4. */
const TAMANOS = [3, 4, 2, 3, 4, 3, 2, 4];
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/** Un barajador con semilla (mulberry32): la misma semana, el mismo orden. */
function conSemilla(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lo LIBRE del catálogo (lo que el mostrador puede vender), una fila por pieza. */
async function piezasLibres(): Promise<FilaLibre[]> {
  const porPieza = new Map<number, FilaLibre>();
  const PAGINA = 1000;
  for (let desde = 0; desde < 5000; desde += PAGINA) {
    const { data, error } = await supabase
      .from('v_venta_ubicacion')
      .select('modelo_id, nombre, categoria, variante, variantes_nota, foto_path, foto_thumb_path, familia, precio_usd, cantidad, armado')
      .gt('cantidad', 0)
      .order('modelo_id', { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const filas = (data as unknown as {
      modelo_id: number; nombre: string; categoria: string | null; variante: string | null;
      variantes_nota: string | null; foto_path: string | null; foto_thumb_path: string | null;
      familia: number; precio_usd: number | null; cantidad: number; armado: 'dije' | 'base' | null;
    }[] | null) ?? [];
    for (const f of filas) {
      const ya = porPieza.get(f.modelo_id);
      if (ya) { ya.libre += f.cantidad; continue; }
      porPieza.set(f.modelo_id, {
        id: f.modelo_id, familia: f.familia, nombre: f.nombre, categoria: f.categoria, variante: f.variante,
        variantes_nota: f.variantes_nota, foto_path: f.foto_path, foto_thumb_path: f.foto_thumb_path,
        libre: f.cantidad, armado: f.armado ?? null, precio_usd: f.precio_usd,
      });
    }
    if (filas.length < PAGINA) break;
  }
  return [...porPieza.values()];
}

/**
 * Arma hasta 8 combos de 2 a 4 piezas con `armarConjunto` sobre lo libre,
 * sin repetir pieza entre combos y variando el orden por semana, y los
 * guarda con `admin_rearmar_combos`. El porcentaje lo pone la base, por
 * cuántas piezas lleva cada combo.
 */
export async function rearmarCombos(): Promise<{ guardados: number; descartados: number }> {
  const todas = await piezasLibres();
  // Un dije solo no se ofrece en un combo, y sin foto ni precio no se ve.
  const sirven = todas.filter((p) => p.armado !== 'dije' && p.precio_usd !== null && p.precio_usd > 0 && (p.foto_path || p.foto_thumb_path));
  const semana = Math.floor(Date.now() / SEMANA_MS);
  const azar = conSemilla(semana * 2654435761);

  // Se baraja por familia (un producto, una vez), así cada semana arranca en otro sitio.
  let restantes = agruparPorFamilia(sirven)
    .map((f) => ({ f, k: azar() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.f);

  const combos: number[][] = [];
  for (let n = 0; n < COMBOS_MAX && restantes.length >= 2; n++) {
    const piezas = armarConjunto(restantes, 0, TAMANOS[n % TAMANOS.length]!);
    if (piezas.length < 2) break;
    combos.push(piezas.map((p) => p.id));
    const usadas = new Set(piezas.map((p) => p.familia));
    restantes = restantes.filter((f) => !usadas.has(f.clave));
  }

  const { data, error } = await supabase.rpc('admin_rearmar_combos', { p_combos: combos });
  if (error) throw error;
  const r = data as { guardados?: number; descartados?: unknown[] } | null;
  return { guardados: r?.guardados ?? 0, descartados: r?.descartados?.length ?? 0 };
}

let yaIntentado = false;

/**
 * Al abrir el Inventario o este panel: si los combos tienen más de 7 días
 * (o nunca se armaron), se rearman. Una vez por visita, y en silencio: si
 * faltan las cifras o el SQL, no pasa nada y el panel lo dice donde toca.
 */
export async function rearmarSiHaceFalta(): Promise<boolean> {
  if (yaIntentado) return false;
  yaIntentado = true;
  try {
    const { data, error } = await supabase.rpc('admin_cifras_ofertas');
    if (error || !data) return false;
    const c = data as Record<string, number | string | null>;
    if (c.oferta_min_pct == null || c.oferta_max_pct == null) return false;
    const en = typeof c.combos_armados_en === 'string' ? Date.parse(c.combos_armados_en) : NaN;
    if (Number.isFinite(en) && Date.now() - en <= SEMANA_MS) return false;
    await rearmarCombos();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Las diez cifras                                                    */
/* ------------------------------------------------------------------ */

interface DefCifra {
  clave: string;
  etiqueta: string;
  unidad: string;
  entero: boolean;
  hace: string;
  vacia: string;
}

const CIFRAS: DefCifra[] = [
  { clave: 'oferta_pareja_pct', etiqueta: 'Descuento por llevar dos o más piezas que combinan', unidad: '%', entero: false,
    hace: 'El porcentaje del código que gana la clienta al mirar dos piezas, al completar su pieza o al elegir su escote.',
    vacia: 'No sale la oferta por mirar dos piezas, ni «Complétalo», ni el código del escote.' },
  { clave: 'oferta_min_pct', etiqueta: 'Descuento de un combo de 2 piezas', unidad: '%', entero: false,
    hace: 'Lo que se rebaja en los combos de la semana de 2 piezas. Los de 3 llevan el punto medio entre este y el de 4.',
    vacia: 'No se pueden armar combos de la semana, y tampoco «Para regalar».' },
  { clave: 'oferta_max_pct', etiqueta: 'Descuento de un combo de 4 piezas', unidad: '%', entero: false,
    hace: 'Lo que se rebaja en los combos de 4 piezas. No puede quedar por debajo del de 2.',
    vacia: 'No se pueden armar combos de la semana, y tampoco «Para regalar».' },
  { clave: 'seleccion_pct', etiqueta: 'Descuento de la Selección de la casa', unidad: '%', entero: false,
    hace: 'El porcentaje que lleva cada pieza de la Selección de la casa (también la pieza que toca en el estuche).',
    vacia: 'No sale la Selección de la casa ni la pieza suelta del estuche.' },
  { clave: 'seleccion_dias_sin_venta', etiqueta: 'Días sin venderse para entrar a la Selección', unidad: 'días', entero: true,
    hace: 'Una pieza libre que lleva más de estos días sin venderse entra sola a la Selección de la casa.',
    vacia: 'La Selección no se llena sola: solo salen las piezas que metas tú.' },
  { clave: 'oferta_mirada_segundos', etiqueta: 'Segundos mirando una pieza para ofrecerle la oferta', unidad: 'segundos', entero: true,
    hace: 'Cuánto tiempo tiene que mirar una clienta una pieza para que se le ofrezca una pareja con descuento.',
    vacia: 'No sale la oferta que aparece al mirar una pieza un rato.' },
  { clave: 'oferta_dias_validez', etiqueta: 'Días que vale un código', unidad: 'días', entero: true,
    hace: 'Cuánto dura el código que gana una clienta, desde que lo recibe.',
    vacia: 'Se cierran TODAS las ofertas: sin plazo, ningún código sale.' },
  { clave: 'regalo_tope_usd', etiqueta: 'Tope de «Para regalar»', unidad: '$ BCV', entero: true,
    hace: 'Los conjuntos de «Para regalar» no pasan de este total, ya con su descuento.',
    vacia: 'No sale la sección «Para regalar».' },
  { clave: 'oferta_codigos_dia_max', etiqueta: 'Códigos por teléfono y día', unidad: 'códigos', entero: true,
    hace: 'El tope técnico de códigos que puede pedir un mismo teléfono en un día. Frena a quien pide códigos sin parar.',
    vacia: 'Se cierran TODAS las ofertas: sin tope, ningún código sale.' },
];

const textoDeCifra = (v: number | string | null | undefined) =>
  v === null || v === undefined || typeof v === 'string' ? '' : String(v).replace('.', ',');

type Cifras = Record<string, number | string | null>;

function PanelCifras({ cifras, alCambiar }: { cifras: Cifras; alCambiar: () => void }) {
  const [borrador, setBorrador] = useState<Record<string, string>>(
    () => Object.fromEntries(CIFRAS.map((c) => [c.clave, textoDeCifra(cifras[c.clave])])),
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const encendidas = cifras.ofertas_encendidas === 1;

  async function guardarValor(clave: string, valor: number | null, mensaje: string) {
    setGuardando(clave);
    setError(null);
    setExito(null);
    const { error: err } = await supabase.rpc('admin_guardar_cifra_oferta', { p_clave: clave, p_valor: valor });
    if (err) setError(mensajeDeError(err));
    else {
      setExito(mensaje);
      setBorrador((b) => ({ ...b, [clave]: textoDeCifra(valor) }));
      alCambiar();
    }
    setGuardando(null);
  }

  function guardar(c: DefCifra) {
    const texto = (borrador[c.clave] ?? '').trim();
    if (texto === '') {
      void guardarValor(c.clave, null, `Quedó vacía. ${c.vacia}`);
      return;
    }
    const n = leerCifra(texto);
    if (n === null) { setError(`«${texto}» no es una cifra: escribe solo el número, por ejemplo 5 o 7,5.`); setExito(null); return; }
    if (c.entero && !Number.isInteger(n)) { setError(`${c.etiqueta}: tiene que ser un número entero.`); setExito(null); return; }
    void guardarValor(c.clave, n, 'Cifra guardada.');
  }

  return (
    <div className="tarjeta">
      <h2>Ofertas en la landing</h2>
      <label className="casilla">
        <input
          type="checkbox" checked={encendidas} disabled={guardando !== null}
          onChange={(e) => void guardarValor('ofertas_encendidas', e.target.checked ? 1 : 0, e.target.checked ? 'Ofertas encendidas.' : 'Ofertas apagadas: la landing no enseña ninguna.')}
        />
        <span>{encendidas ? 'Encendidas' : 'Apagadas'}</span>
      </label>
      <p className="campo__pista">
        Apaga todas las ofertas de una vez sin tocar nada más. Los códigos que ya se dieron siguen valiendo en la tienda hasta que vencen.
      </p>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      <div className="pl-cifras">
        {CIFRAS.map((c) => {
          const guardada = textoDeCifra(cifras[c.clave]);
          const actual = borrador[c.clave] ?? '';
          const cambiada = actual.trim() !== guardada;
          return (
            <div className="pl-cifra" key={c.clave}>
              <Campo etiqueta={`${c.etiqueta} (${c.unidad})`} htmlFor={`cifra-${c.clave}`} pista={c.hace}>
                <input
                  id={`cifra-${c.clave}`} type="text" inputMode="decimal" value={actual}
                  onChange={(e) => setBorrador((b) => ({ ...b, [c.clave]: e.target.value }))}
                />
              </Campo>
              <button type="button" className="boton boton--pequeno" disabled={!cambiada || guardando !== null} onClick={() => guardar(c)}>
                {guardando === c.clave ? 'Guardando' : 'Guardar'}
              </button>
              {actual.trim() === '' ? <p className="pl-cifra__vacia">Vacía: {c.vacia}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Buscar una pieza (para la casa y la selección)                      */
/* ------------------------------------------------------------------ */

interface PiezaBuscada { id: number; sku: string; nombre: string; variante: string | null }

function BuscadorPieza({ etiqueta, alElegir, excluir = [] }: {
  etiqueta: string;
  alElegir: (p: PiezaBuscada) => void;
  excluir?: number[];
}) {
  const [q, setQ] = useState('');
  const [hallazgos, setHallazgos] = useState<PiezaBuscada[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const texto = q.trim().replace(/[%,()]/g, ' ');
    if (texto.length < 2) { setHallazgos([]); return; }
    let vivo = true;
    setBuscando(true);
    const espera = setTimeout(() => {
      void (async () => {
        const { data } = await supabase
          .from('v_catalogo_venta')
          .select('id, sku, nombre, variante')
          .gt('existencia_total', 0)
          .or(`nombre.ilike.%${texto}%,sku.ilike.%${texto}%`)
          .order('nombre', { ascending: true })
          .limit(12);
        if (!vivo) return;
        setHallazgos((data as PiezaBuscada[] | null) ?? []);
        setBuscando(false);
      })();
    }, 250);
    return () => { vivo = false; clearTimeout(espera); };
  }, [q]);

  return (
    <div className="pl-buscador">
      <Campo etiqueta={etiqueta} htmlFor={`buscar-${etiqueta}`} pista="Escribe el nombre o el código de la pieza.">
        <input id={`buscar-${etiqueta}`} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </Campo>
      {buscando ? <p className="campo__pista" role="status">Buscando</p> : null}
      {hallazgos.length > 0 ? (
        <ul className="pl-hallazgos">
          {hallazgos.filter((h) => !excluir.includes(h.id)).map((h) => (
            <li key={h.id}>
              <span>{h.nombre}{h.variante ? ` · ${h.variante}` : ''} <small>{h.sku}</small></span>
              <button type="button" className="boton boton--pequeno" onClick={() => { alElegir(h); setQ(''); setHallazgos([]); }}>Meter</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Anular los códigos de un combo o de una oferta                      */
/* ------------------------------------------------------------------ */

function AnularCodigos({ origen, refId, alTerminar }: {
  origen: 'combo' | 'casa'; refId: number; alTerminar: (mensaje: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function anular() {
    setTrabajando(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_anular_codigos_de', {
      p_origen: origen, p_ref: refId, p_motivo: motivo.trim(),
    });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    setAbierto(false);
    setMotivo('');
    const n = Number(data ?? 0);
    alTerminar(n === 1 ? 'Se anuló 1 código.' : `Se anularon ${n} códigos.`);
  }

  if (!abierto) {
    return <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setAbierto(true)}>Anular sus códigos</button>;
  }
  return (
    <div className="pl-anular">
      <Campo etiqueta="Por qué se anulan" htmlFor={`anular-${origen}-${refId}`} error={error}>
        <input id={`anular-${origen}-${refId}`} type="text" value={motivo} maxLength={160} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <div className="grupo-botones">
        <button type="button" className="boton boton--peligro boton--pequeno" disabled={trabajando || motivo.trim() === ''} onClick={() => void anular()}>
          {trabajando ? 'Anulando' : 'Anular los códigos'}
        </button>
        <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ofertas de la casa                                                  */
/* ------------------------------------------------------------------ */

interface BorradorCasa {
  id: number | null;
  nombre: string;
  texto: string;
  foto: string | null;
  pct: string;
  desde: string;
  hasta: string;
  piezas: { id: number; nombre: string }[];
}

const CASA_NUEVA: BorradorCasa = { id: null, nombre: '', texto: '', foto: null, pct: '', desde: '', hasta: '', piezas: [] };

function FormularioCasa({ inicial, alTerminar, alCancelar }: {
  inicial: BorradorCasa; alTerminar: (mensaje: string) => void; alCancelar: () => void;
}) {
  const [b, setB] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(activa: boolean) {
    setError(null);
    const pct = leerCifra(b.pct);
    if (b.nombre.trim() === '') { setError('Ponle un nombre a la oferta.'); return; }
    if (pct === null) { setError('Escribe el porcentaje como número, por ejemplo 12 o 7,5.'); return; }
    if (pct <= 0 || pct >= 100) { setError('El porcentaje va entre 0 y 100.'); return; }
    if (b.hasta === '') { setError('Elige hasta qué día vale.'); return; }
    if (b.piezas.length === 0) { setError('Mete al menos una pieza.'); return; }
    setGuardando(true);
    const { error: err } = await supabase.rpc('admin_guardar_oferta_casa', {
      p_id: b.id,
      p_nombre: b.nombre.trim(),
      p_texto: b.texto.trim() || null,
      p_foto: b.foto,
      p_pct: Math.round(pct * 100) / 100,
      p_desde: b.desde || null,
      p_hasta: b.hasta,
      p_modelos: b.piezas.map((p) => p.id),
      p_activa: activa,
    });
    setGuardando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alTerminar(activa ? 'Oferta guardada.' : 'Oferta terminada.');
  }

  return (
    <div className="pl-elemento">
      <h3>{b.id === null ? 'Nueva oferta de la casa' : 'Editar la oferta'}</h3>
      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}
      <Campo etiqueta="Nombre" htmlFor="casa-nombre">
        <input id="casa-nombre" type="text" value={b.nombre} maxLength={80} onChange={(e) => setB({ ...b, nombre: e.target.value })} />
      </Campo>
      <Campo etiqueta="Texto" htmlFor="casa-texto" pista="Una o dos frases para el banner.">
        <textarea id="casa-texto" rows={2} value={b.texto} maxLength={240} onChange={(e) => setB({ ...b, texto: e.target.value })} />
      </Campo>
      <CampoFoto etiqueta="Foto del banner" valor={b.foto} conAlt={false} alCambiar={(r) => setB({ ...b, foto: r })} />
      <div className="rejilla rejilla--3">
        <Campo etiqueta="Descuento (%)" htmlFor="casa-pct" pista="Nunca baja una pieza de lo que la tienda puede dar: la base lo comprueba.">
          <input id="casa-pct" type="text" inputMode="decimal" value={b.pct} onChange={(e) => setB({ ...b, pct: e.target.value })} />
        </Campo>
        <Campo etiqueta="Desde" htmlFor="casa-desde" pista="Vacío, desde hoy.">
          <input id="casa-desde" type="date" value={b.desde} onChange={(e) => setB({ ...b, desde: e.target.value })} />
        </Campo>
        <Campo etiqueta="Hasta" htmlFor="casa-hasta">
          <input id="casa-hasta" type="date" value={b.hasta} onChange={(e) => setB({ ...b, hasta: e.target.value })} />
        </Campo>
      </div>
      <p><strong>Piezas de la oferta</strong></p>
      {b.piezas.length === 0 ? <p className="campo__pista">Todavía no hay ninguna.</p> : (
        <ul className="pl-hallazgos">
          {b.piezas.map((p) => (
            <li key={p.id}>
              <span>{p.nombre}</span>
              <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setB({ ...b, piezas: b.piezas.filter((x) => x.id !== p.id) })}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      <BuscadorPieza
        etiqueta="Meter una pieza" excluir={b.piezas.map((p) => p.id)}
        alElegir={(h) => setB({ ...b, piezas: [...b.piezas, { id: h.id, nombre: h.variante ? `${h.nombre} · ${h.variante}` : h.nombre }] })}
      />
      <div className="acciones">
        <button type="button" className="boton" disabled={guardando} onClick={() => void guardar(true)}>{guardando ? 'Guardando' : 'Guardar'}</button>
        <button type="button" className="boton boton--secundario" disabled={guardando} onClick={alCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

const ETIQUETA_ESTADO: Record<EstadoCasa, { texto: string; tono: string }> = {
  se_ensena: { texto: 'Se enseña hoy', tono: 'exito' },
  apagada: { texto: 'Terminada o apagada', tono: 'alerta' },
  por_empezar: { texto: 'Empieza después', tono: 'proxima' },
  terminada: { texto: 'Ya pasó', tono: 'alerta' },
  sin_piezas: { texto: 'No sale hoy: una pieza no está libre o no aguanta el descuento', tono: 'alerta' },
};

function OfertasDeLaCasa({ casa, todas, hoy, alCambiar }: {
  casa: OfertaCasa[]; todas: OfertaCasaAdmin[] | null; hoy: string; alCambiar: (mensaje: string) => void;
}) {
  const [editando, setEditando] = useState<BorradorCasa | null>(null);
  const [terminando, setTerminando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function aBorrador(o: OfertaCasa | OfertaCasaAdmin): BorradorCasa {
    return {
      id: o.id, nombre: o.nombre, texto: o.texto ?? '', foto: o.foto, pct: textoDeCifra(o.pct),
      // Con el #66 se conserva su día de salida; sin él, la base la toma desde hoy.
      desde: 'desde' in o && typeof o.desde === 'string' ? o.desde.slice(0, 10) : '', hasta: o.hasta.slice(0, 10),
      piezas: o.piezas.map((p) => ({ id: p.modelo_id, nombre: p.variante ? `${p.nombre} · ${p.variante}` : p.nombre })),
    };
  }

  const lista: (OfertaCasa | OfertaCasaAdmin)[] = todas ?? casa;

  async function terminar(o: OfertaCasa | OfertaCasaAdmin) {
    setError(null);
    setTerminando(o.id);
    const { error: err } = await supabase.rpc('admin_guardar_oferta_casa', {
      p_id: o.id, p_nombre: o.nombre, p_texto: o.texto, p_foto: o.foto, p_pct: o.pct,
      p_desde: 'desde' in o && typeof o.desde === 'string' ? o.desde.slice(0, 10) : null,
      p_hasta: o.hasta.slice(0, 10), p_modelos: o.piezas.map((p) => p.modelo_id), p_activa: false,
    });
    setTerminando(null);
    if (err) setError(mensajeDeError(err));
    else alCambiar('Oferta terminada.');
  }

  return (
    <div className="tarjeta">
      <h2>Ofertas de la casa</h2>
      <p className="campo__pista">
        Las que creas tú, con su banner, su descuento y sus fechas.{' '}
        {todas
          ? 'Aquí salen todas: las de hoy, las que empiezan otro día, las que ya pasaron y las apagadas. Guardar una oferta la vuelve a encender.'
          : 'Aquí salen las que están vigentes hoy: una oferta a la que ya se le vendió una pieza, o que empieza otro día, no aparece en esta lista.'}
      </p>
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {lista.length === 0 ? <Vacio titulo={todas ? 'Todavía no hay ninguna oferta de la casa' : 'No hay ninguna oferta de la casa vigente'} /> : (
        <ul className="pl-ofertas">
          {lista.map((o) => {
            const ad = 'vigente_hoy' in o ? o : null;
            const estado = ad ? ETIQUETA_ESTADO[estadoDeCasa(ad, hoy)] : null;
            return (
            <li key={o.id} className="pl-oferta">
              <div>
                <strong>{o.nombre}</strong> · {textoDeCifra(o.pct)} % · {ad ? `del ${formatearFecha(ad.desde)} ` : ''}hasta el {formatearFecha(o.hasta)}
                {estado ? <> <span className={`etiqueta etiqueta--${estado.tono}`}>{estado.texto}</span></> : null}
                <div className="campo__pista">{o.piezas.map((p) => p.nombre).join(' + ')}</div>
                {ad ? <div className="campo__pista">Códigos: {ad.codigos_dados} dados, {ad.codigos_usados} usados.</div> : null}
              </div>
              <div className="grupo-botones">
                <button type="button" className="boton boton--pequeno" onClick={() => setEditando(aBorrador(o))}>Editar</button>
                {ad && !ad.activa ? null : (
                  <button type="button" className="boton boton--secundario boton--pequeno" disabled={terminando === o.id} onClick={() => void terminar(o)}>Terminar ya</button>
                )}
                <AnularCodigos origen="casa" refId={o.id} alTerminar={alCambiar} />
              </div>
            </li>
            );
          })}
        </ul>
      )}
      {editando ? (
        <FormularioCasa
          key={editando.id ?? 'nueva'} inicial={editando}
          alCancelar={() => setEditando(null)}
          alTerminar={(m) => { setEditando(null); alCambiar(m); }}
        />
      ) : (
        <div className="acciones">
          <button type="button" className="boton" onClick={() => setEditando(CASA_NUEVA)}>Crear una oferta</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  La selección de la casa                                             */
/* ------------------------------------------------------------------ */

interface FilaSeleccion {
  modelo_id: number; sku: string; nombre: string; variante: string | null; categoria: string | null;
  foto: string | null; motivo: 'auto' | 'meter' | 'sacar'; dias_sin_venta: number | null; se_ensena_hoy: boolean;
}

const MOTIVO: Record<FilaSeleccion['motivo'], string> = {
  auto: 'Entró sola: lleva días sin venderse',
  meter: 'La metiste tú',
  sacar: 'La sacaste tú',
};

function SeleccionDeLaCasa() {
  const [filas, setFilas] = useState<FilaSeleccion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [verTodas, setVerTodas] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('v_seleccion_admin')
      .select('modelo_id, sku, nombre, variante, categoria, foto, motivo, dias_sin_venta, se_ensena_hoy');
    if (err) { setError(mensajeDeError(err)); setFilas([]); return; }
    setFilas((data as FilaSeleccion[] | null) ?? []);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function cambiar(id: number, accion: 'meter' | 'sacar' | 'auto', mensaje: string) {
    setTrabajando(true);
    setError(null);
    setExito(null);
    const { error: err } = await supabase.rpc('admin_seleccion', { p_modelo_id: id, p_accion: accion });
    if (err) setError(mensajeDeError(err));
    else { setExito(mensaje); await cargar(); }
    setTrabajando(false);
  }

  if (filas === null) return <div className="tarjeta"><Cargando texto="Cargando la selección" /></div>;

  const hoy = filas.filter((f) => f.motivo !== 'sacar');
  const sacadas = filas.filter((f) => f.motivo === 'sacar');
  const visibles = verTodas ? hoy : hoy.slice(0, 20);

  return (
    <div className="tarjeta">
      <h2>Selección de la casa</h2>
      <p className="campo__pista">
        Las piezas libres que llevan días sin venderse entran solas, con su descuento. De todas, la landing
        enseña hoy una parte, y mañana otra. Aquí sacas una pieza o metes la que tú quieras.
      </p>
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      <p><strong>{hoy.length} {hoy.length === 1 ? 'pieza califica' : 'piezas califican'} hoy</strong> ({hoy.filter((f) => f.se_ensena_hoy).length} se enseñan hoy)</p>
      {hoy.length === 0 ? <Vacio titulo="No hay ninguna pieza en la selección" /> : (
        <ul className="pl-seleccion">
          {visibles.map((f) => {
            const foto = urlPublicaFoto(f.foto);
            return (
              <li key={f.modelo_id}>
                {foto ? <img className="miniatura" src={foto} alt="" loading="lazy" /> : <span className="miniatura" aria-hidden="true" />}
                <div className="pl-seleccion__datos">
                  <strong>{f.nombre}{f.variante ? ` · ${f.variante}` : ''}</strong>
                  <span className="campo__pista">
                    {MOTIVO[f.motivo]}{f.motivo === 'auto' && f.dias_sin_venta !== null ? ` (${f.dias_sin_venta} días)` : ''}
                    {f.se_ensena_hoy ? ' · sale hoy' : ''}
                  </span>
                </div>
                <div className="grupo-botones">
                  <button type="button" className="boton boton--secundario boton--pequeno" disabled={trabajando} onClick={() => void cambiar(f.modelo_id, 'sacar', 'Pieza sacada de la selección.')}>Sacar</button>
                  {f.motivo === 'meter' ? (
                    <button type="button" className="boton boton--secundario boton--pequeno" disabled={trabajando} onClick={() => void cambiar(f.modelo_id, 'auto', 'La pieza vuelve a decidirse sola.')}>Volver a automático</button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hoy.length > 20 ? (
        <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setVerTodas((v) => !v)}>
          {verTodas ? 'Ver menos' : `Ver las ${hoy.length}`}
        </button>
      ) : null}

      {sacadas.length > 0 ? (
        <>
          <p><strong>Las que sacaste</strong></p>
          <ul className="pl-seleccion">
            {sacadas.map((f) => (
              <li key={f.modelo_id}>
                <div className="pl-seleccion__datos">
                  <strong>{f.nombre}{f.variante ? ` · ${f.variante}` : ''}</strong>
                </div>
                <button type="button" className="boton boton--secundario boton--pequeno" disabled={trabajando} onClick={() => void cambiar(f.modelo_id, 'auto', 'La pieza vuelve a decidirse sola.')}>Volver a automático</button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <BuscadorPieza etiqueta="Meter una pieza" excluir={hoy.map((f) => f.modelo_id)} alElegir={(h) => void cambiar(h.id, 'meter', `«${h.nombre}» entra a la selección.`)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Combos de la semana                                                 */
/* ------------------------------------------------------------------ */

function CombosDeLaSemana({ combos, todos, armadosEn, alCambiar }: {
  combos: OfertaCombo[]; todos: ComboAdmin[] | null; armadosEn: string | null; alCambiar: (mensaje: string) => void;
}) {
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lista: (OfertaCombo | ComboAdmin)[] = todos ?? combos;

  async function rearmar() {
    setArmando(true);
    setError(null);
    try {
      const r = await rearmarCombos();
      alCambiar(
        `Se guardaron ${r.guardados} combos.` +
        (r.descartados > 0 ? ` ${r.descartados} no se pudieron guardar (una pieza no aguanta el descuento o se vendió).` : ''),
      );
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setArmando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h2>Combos de la semana</h2>
      <p className="campo__pista">
        Se arman solos con lo que hay libre: de 2 a 4 piezas que combinan, sin repetir pieza. El descuento lo pone la
        base según cuántas piezas lleva.{' '}
        {armadosEn ? `Se armaron por última vez el ${formatearFecha(armadosEn)}.` : 'Todavía no se han armado.'}
      </p>
      {error ? <Aviso tono="error" titulo="No se pudieron armar">{error}</Aviso> : null}
      {lista.length === 0 ? <Vacio titulo={todos ? 'No hay combos armados' : 'No hay combos vigentes'}>Toca «Rearmar» para armarlos.</Vacio> : (
        <ul className="pl-ofertas">
          {lista.map((c) => {
            const ad = 'se_ensena_hoy' in c ? c : null;
            return (
            <li key={c.id} className="pl-oferta">
              <div>
                <strong>{c.piezas.length} piezas · {textoDeCifra(c.pct)} %</strong>
                {ad ? (
                  <> <span className={`etiqueta etiqueta--${ad.se_ensena_hoy ? 'exito' : 'alerta'}`}>
                    {ad.se_ensena_hoy ? 'Se enseña hoy' : 'No sale hoy'}
                  </span></>
                ) : null}
                <div className="campo__pista">{c.piezas.map((p) => p.nombre).join(' + ')}</div>
                <div className="campo__pista">{formatearBcv(c.total_lista_usd)} → {formatearBcv(c.total_oferta_usd)}</div>
                {ad ? <div className="campo__pista">Códigos: {ad.codigos_dados} dados, {ad.codigos_usados} usados.</div> : null}
              </div>
              <AnularCodigos origen="combo" refId={c.id} alTerminar={alCambiar} />
            </li>
            );
          })}
        </ul>
      )}
      <div className="acciones">
        <button type="button" className="boton" disabled={armando} onClick={() => void rearmar()}>
          {armando ? 'Armando' : 'Rearmar los combos'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  La pestaña                                                          */
/* ------------------------------------------------------------------ */

export function OfertasLanding() {
  const [cifras, setCifras] = useState<Cifras | null>(null);
  const [publicas, setPublicas] = useState<OfertasPublicas | null>(null);
  const [casaTodas, setCasaTodas] = useState<OfertaCasaAdmin[] | null>(null);
  const [combosTodos, setCombosTodos] = useState<ComboAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    // Las dos vistas del administrador son del #66: sin él llegan null y se usa lo público.
    const [c, p, ct, cb] = await Promise.all([
      supabase.rpc('admin_cifras_ofertas'), cargarOfertasPublicas(), cargarOfertasCasaAdmin(), cargarCombosAdmin(),
    ]);
    if (c.error) { setError(mensajeDeError(c.error)); return; }
    setCifras((c.data as Cifras | null) ?? {});
    setPublicas(p);
    setCasaTodas(ct);
    setCombosTodos(cb);
  }, []);

  useEffect(() => {
    void (async () => {
      await rearmarSiHaceFalta();
      await cargar();
    })();
  }, [cargar]);

  const despues = useCallback((mensaje: string) => { setExito(mensaje); void cargar(); }, [cargar]);

  const hoy = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }), []);

  const armadosEn = useMemo(() => (typeof cifras?.combos_armados_en === 'string' ? cifras.combos_armados_en : null), [cifras]);

  if (error) return <Aviso tono="error" titulo="No se pudieron cargar las ofertas">{error}</Aviso>;
  if (!cifras) return <Cargando texto="Cargando las ofertas" />;

  const apagadas = cifras.ofertas_encendidas !== 1;

  return (
    <div className="pila">
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}
      {apagadas ? <Aviso tono="alerta" titulo="Las ofertas están apagadas">Mientras estén apagadas, la landing no enseña ninguna.{casaTodas || combosTodos ? ' Aquí sigues viendo tus ofertas y combos para editarlos.' : ' Aquí no se ven los combos ni las ofertas vigentes.'}</Aviso> : null}
      <PanelCifras cifras={cifras} alCambiar={() => void cargar()} />
      <OfertasDeLaCasa casa={publicas?.casa ?? []} todas={casaTodas} hoy={hoy} alCambiar={despues} />
      <SeleccionDeLaCasa />
      <CombosDeLaSemana combos={publicas?.combos ?? []} todos={combosTodos} armadosEn={armadosEn} alCambiar={despues} />
    </div>
  );
}
