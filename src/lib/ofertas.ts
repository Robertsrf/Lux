/**
 * Los codigos de oferta del catalogo publico (esquema-landing-y-ofertas.sql):
 * logica pura, sin red ni React. Solo `import type`, para que `node --test`
 * la lea tal cual (scripts/pruebas/ofertas.test.mjs).
 *
 * La base manda: `cotizar_pedido` y `crear_reserva` deciden que codigo se
 * aplica y a que precio. Lo de aqui solo sirve para ENSENAR a la clienta,
 * antes de pedir, lo mismo que la base va a hacer (`oferta_de_lineas`).
 */

export type OrigenOferta =
  | 'dos_vistas' | 'complemento' | 'escote' | 'combo'
  | 'estuche' | 'regalo' | 'seleccion' | 'casa';

/** Una pieza dentro de una oferta. Ningun costo, piso ni margen. */
export interface PiezaOferta {
  modelo_id: number;
  nombre: string;
  variante: string | null;
  categoria: string | null;
  /** RUTAS del bucket: se pasan por `fuenteFoto`, no son URLs. */
  foto_thumb: string | null;
  foto_url: string | null;
  precio_lista_usd: number;
  precio_oferta_usd: number;
  cantidad: number;
}

export interface CodigoOferta {
  codigo: string;
  origen: OrigenOferta;
  pct: number;
  vence_en: string;
  piezas: PiezaOferta[];
}

export interface OfertaCombo {
  id: number;
  pct: number;
  total_lista_usd: number;
  total_oferta_usd: number;
  piezas: PiezaOferta[];
}

export interface OfertaCasa {
  id: number;
  nombre: string;
  texto: string | null;
  /** Ruta del bucket o del sitio (`landing/x.webp`). */
  foto: string | null;
  pct: number;
  hasta: string;
  total_lista_usd?: number;
  total_oferta_usd?: number;
  piezas: PiezaOferta[];
}

/** La forma de `ofertas_publicas()`. Apagadas: `encendidas` false y todo vacio. */
export interface OfertasPublicas {
  encendidas: boolean;
  pareja_pct: number | null;
  mirada_segundos: number | null;
  dias_validez: number | null;
  combos: OfertaCombo[];
  regalo: OfertaCombo[];
  seleccion: { pct: number; piezas: PiezaOferta[] } | null;
  casa: OfertaCasa[];
  en_oferta: number[];
}

/** Lo que `cotizar_pedido` dice de cada codigo que se le mando. */
export type MotivoCodigo =
  | 'no_existe' | 'vencido' | 'usado' | 'anulado'
  | 'faltan_piezas' | 'comparte_pieza' | 'pieza_no_disponible' | 'no_vale';

export interface EstadoCodigo {
  codigo: string;
  aplica: boolean;
  motivo: MotivoCodigo | null;
  pct?: number;
}

// Sin 0, O, 1, I ni L: no se confunden al dictarlos por telefono.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Lo que la clienta escribe -> el codigo como lo guarda la base, o null.
 * Da igual mayusculas, espacios, guiones o el prefijo.
 */
export function normalizarCodigo(texto: string): string | null {
  let t = texto.toUpperCase().replace(/[\s-]+/g, '');
  if (t.startsWith('LUX')) t = t.slice(3);
  if (t.length !== 6) return null;
  for (const c of t) if (!ALFABETO.includes(c)) return null;
  return `LUX-${t}`;
}

/** Cuantas unidades de la pieza hay en el carrito (0 si no esta). */
function enCarrito(carrito: ReadonlyMap<number, number>, modeloId: number): number {
  return carrito.get(modeloId) ?? 0;
}

/** Con el carrito, estan todas las piezas del codigo y en su cantidad. */
export function codigoCompleto(c: CodigoOferta, carrito: ReadonlyMap<number, number>): boolean {
  if (c.piezas.length === 0) return false;
  return c.piezas.every((p) => enCarrito(carrito, p.modelo_id) >= p.cantidad);
}

/** Un codigo sirve hasta su vencimiento. */
export function vigente(c: CodigoOferta, ahora: number = Date.now()): boolean {
  const t = Date.parse(c.vence_en);
  return Number.isFinite(t) && t > ahora;
}

export interface AplicacionOferta {
  pct: number;
  unidades: number;
  codigo: string;
}

/**
 * La misma regla que `oferta_de_lineas`, solo para ensenar: los codigos en
 * el orden en que llegan; uno aplica si el carrito trae todas sus piezas y
 * ninguna esta ya tomada por un codigo anterior. Por pieza, `unidades` son
 * las que cubre el codigo (las demas del carrito van a su precio).
 */
export function codigosQueAplican(
  codigos: CodigoOferta[],
  carrito: ReadonlyMap<number, number>,
): Map<number, AplicacionOferta> {
  const mapa = new Map<number, AplicacionOferta>();
  for (const c of codigos) {
    if (!codigoCompleto(c, carrito)) continue;
    if (c.piezas.some((p) => mapa.has(p.modelo_id))) continue;
    for (const p of c.piezas) {
      mapa.set(p.modelo_id, { pct: c.pct, unidades: p.cantidad, codigo: c.codigo });
    }
  }
  return mapa;
}

/** Por que un codigo no se aplica con este carrito (null si se aplica). */
export function motivoDeCodigo(
  c: CodigoOferta,
  codigos: CodigoOferta[],
  carrito: ReadonlyMap<number, number>,
  ahora: number = Date.now(),
): MotivoCodigo | null {
  if (!vigente(c, ahora)) return 'vencido';
  if (!codigoCompleto(c, carrito)) return 'faltan_piezas';
  const aplican = codigosQueAplican(codigos.filter((x) => vigente(x, ahora)), carrito);
  const mio = c.piezas.every((p) => aplican.get(p.modelo_id)?.codigo === c.codigo);
  return mio ? null : 'comparte_pieza';
}

// ---------------------------------------------------------------- miradas

/** Cuanto se ha mirado cada pieza (milisegundos). */
export interface Miradas {
  [modeloId: number]: number;
}

export function sumarMirada(m: Miradas, modeloId: number, ms: number): Miradas {
  if (!(ms > 0)) return m;
  return { ...m, [modeloId]: (m[modeloId] ?? 0) + ms };
}

/** La clave de una pareja, la misma en cualquier orden: "menor-mayor". */
export function clavePareja(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Las dos piezas que mas se han mirado, si las dos pasan del umbral y esa
 * pareja no se ofrecio ya. Si no, null.
 */
export function parejaParaOfrecer(
  m: Miradas,
  umbralSeg: number,
  yaOfrecidas: ReadonlySet<string>,
): [number, number] | null {
  const pasan = Object.entries(m)
    .map(([id, ms]) => ({ id: Number(id), ms }))
    .filter((x) => x.ms >= umbralSeg * 1000)
    .sort((a, b) => b.ms - a.ms || a.id - b.id)
    .slice(0, 2);
  if (pasan.length < 2) return null;
  const a = pasan[0]!.id;
  const b = pasan[1]!.id;
  if (yaOfrecidas.has(clavePareja(a, b))) return null;
  return [a, b];
}

// ----------------------------------------------------------------- tramos

/** Cuantas piezas faltan para el proximo tramo de mayoreo y cuanto da. */
export function faltanParaTramo(
  piezas: number,
  tramos: { piezas_min: number; descuento_pct: number }[],
): { faltan: number; pct: number } | null {
  const siguiente = tramos
    .filter((t) => t.piezas_min > piezas)
    .sort((a, b) => a.piezas_min - b.piezas_min)[0];
  if (!siguiente) return null;
  return { faltan: siguiente.piezas_min - piezas, pct: siguiente.descuento_pct };
}

// ------------------------------------------------ quitar una pieza de un codigo

/** Una linea de un pedido o de una venta, con lo que costaria sin su oferta. */
export interface LineaConOferta {
  modelo_id: number;
  cantidad: number;
  /** Lo que se cobra por unidad (con la oferta). */
  precio: number;
  /** Lo que costaria por unidad sin el codigo; null si no se sabe. */
  precio_sin_oferta: number | null;
  oferta_codigo: string | null;
}

/**
 * Una linea "tiene oferta" solo si su precio es menor que el de sin oferta:
 * tras romperse un codigo sus lineas conservan el codigo, pero ya cuestan lo de siempre.
 */
export const tieneOferta = (l: Pick<LineaConOferta, 'precio' | 'precio_sin_oferta'>): boolean =>
  l.precio_sin_oferta !== null && l.precio < l.precio_sin_oferta;

/**
 * Lo que pasa si se quita la pieza `quitaModelo`: si era de un codigo, las
 * OTRAS piezas de ese codigo vuelven a su precio y el total sube. Devuelve
 * cuantas piezas pierden la oferta y cuanto sube el total (en la unidad de
 * los precios), o null si quitarla no rompe nada o no hay con que contarlo.
 * Es solo para avisar antes: la base cuenta y devuelve `codigo_roto`.
 */
export function efectoDeRomperCodigo(
  lineas: readonly LineaConOferta[],
  quitaModelo: number,
): { codigo: string; piezas: number; sube: number } | null {
  const quitada = lineas.find((l) => l.modelo_id === quitaModelo && l.oferta_codigo && tieneOferta(l));
  if (!quitada || !quitada.oferta_codigo) return null;
  const otras = lineas.filter((l) => l.oferta_codigo === quitada.oferta_codigo && l.modelo_id !== quitaModelo && tieneOferta(l));
  if (otras.length === 0) return null;
  let piezas = 0;
  let sube = 0;
  for (const l of otras) {
    piezas += l.cantidad;
    sube += Math.round((l.precio_sin_oferta! - l.precio) * 10000) * l.cantidad;
  }
  return { codigo: quitada.oferta_codigo, piezas, sube: sube / 10000 };
}
