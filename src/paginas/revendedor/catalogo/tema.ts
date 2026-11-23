import type { PaletaRevendedor } from '../../../lib/tipos';

/*
  EL TEMA DEL CATÁLOGO DE UN REVENDEDOR (fase 6, #73)

  Lo guarda él (o el dueño) en `revendedores.tema`; la base lo valida con
  `rv_tema_valido`. Aquí se vuelve a normalizar (lo desconocido se cae) y
  se derivan los colores de verdad: el texto SIEMPRE se lee a 4,5:1, elija
  el color que elija. La garantía está al dibujar, no en el panel: un
  amarillo sobre blanco guardado desde donde sea sale legible igual.

  Puro: lo prueban scripts/pruebas/tema-rv.test.mjs.
*/

export type Plantilla = 'editorial' | 'tienda' | 'lookbook';
export type Letra = 'elegante' | 'moderna' | 'clasica' | 'revista' | 'amable';
export type Esquinas = 'rectas' | 'suaves' | 'redondas';

/** Lo que guarda la base. Toda clave es opcional. */
export interface TemaGuardado {
  plantilla?: Plantilla;
  principal?: string;
  fondo?: string;
  letra?: Letra;
  esquinas?: Esquinas;
  portada?: number | null;
  frase?: string | null;
}

export interface ColoresRv {
  fondo: string;
  superficie: string;
  texto: string;
  textoSuave: string;
  linea: string;
  boton: string;
  sobreBoton: string;
  /** El borde del botón: el texto si el botón no se distingue del fondo. */
  bordeBoton: string;
  /** El principal donde va como letra: títulos activos, enlaces. */
  acento: string;
}

export interface TemaResuelto {
  plantilla: Plantilla;
  letra: Letra;
  esquinas: Esquinas;
  portada: number | null;
  frase: string | null;
  colores: ColoresRv;
}

export const PLANTILLAS: {
  id: Plantilla; nombre: string; letra: Letra; esquinas: Esquinas; fondo: 'claro' | 'oscuro'; frase: string; para: string;
}[] = [
  { id: 'editorial', nombre: 'Editorial', letra: 'elegante', esquinas: 'rectas', fondo: 'claro', frase: 'Piezas que se quedan contigo', para: 'Fotos grandes, de a una.' },
  { id: 'tienda', nombre: 'Tienda', letra: 'moderna', esquinas: 'suaves', fondo: 'claro', frase: 'Joyas para usar todos los días', para: 'Muchas piezas a la vista, fácil de pedir.' },
  { id: 'lookbook', nombre: 'Lookbook', letra: 'clasica', esquinas: 'redondas', fondo: 'oscuro', frase: 'Brillo para cada día', para: 'Fondo oscuro y filas que se deslizan.' },
];

export const LETRAS: { id: Letra; nombre: string }[] = [
  { id: 'elegante', nombre: 'Elegante' },
  { id: 'moderna', nombre: 'Moderna' },
  { id: 'clasica', nombre: 'Clásica' },
  { id: 'revista', nombre: 'Revista' },
  { id: 'amable', nombre: 'Amable' },
];

export const ESQUINAS: { id: Esquinas; nombre: string }[] = [
  { id: 'rectas', nombre: 'Rectas' },
  { id: 'suaves', nombre: 'Suaves' },
  { id: 'redondas', nombre: 'Redondas' },
];

/** La familia de cada letra, con su respaldo. Las carga `letras.ts`. */
export const FAMILIA_TITULOS: Record<Letra, string> = {
  elegante: "'Bodoni Moda', 'Didot', Georgia, serif",
  moderna: "'Outfit', system-ui, sans-serif",
  clasica: "'Marcellus', Georgia, serif",
  revista: "'Playfair Display', Georgia, serif",
  amable: "'Nunito', system-ui, sans-serif",
};

export const FAMILIA_TEXTO: Record<Plantilla, string> = {
  editorial: "'Manrope', system-ui, sans-serif",
  tienda: "'DM Sans', system-ui, sans-serif",
  lookbook: "'Figtree', system-ui, sans-serif",
};

/**
 * Colores listos para elegir con un toque. Las seis primeras son las
 * paletas de antes (`revendedores.paleta`): su color ancla y su papel,
 * de estilos/tokens.css y estilos/revendedor.css.
 */
export const TEMAS_LISTOS: { id: PaletaRevendedor | 'cobalto' | 'durazno'; nombre: string; principal: string; fondo: string }[] = [
  { id: 'lux', nombre: 'Lux', principal: '#1F4045', fondo: '#F4EFE4' },
  { id: 'noche', nombre: 'Noche', principal: '#1E2B45', fondo: '#F5F2EB' },
  { id: 'vino', nombre: 'Vino', principal: '#5B1F2E', fondo: '#F8F1EE' },
  { id: 'grafito', nombre: 'Grafito', principal: '#2A2A2D', fondo: '#F5F4F1' },
  { id: 'ciruela', nombre: 'Ciruela', principal: '#3F2444', fondo: '#F7F2F6' },
  { id: 'oliva', nombre: 'Oliva', principal: '#363D22', fondo: '#F5F4EB' },
  { id: 'cobalto', nombre: 'Cobalto', principal: '#2B3FD1', fondo: '#F2F4F8' },
  { id: 'durazno', nombre: 'Durazno de noche', principal: '#F0B49E', fondo: '#1A1216' },
];

const LUX = { principal: '#1F4045', fondo: '#F4EFE4' };
const TIENDA = { id: 'tienda' as Plantilla, letra: 'moderna' as Letra, esquinas: 'suaves' as Esquinas, fondo: 'claro' as const };
const FONDO_DE: Record<'claro' | 'oscuro', string> = { claro: '#FFFFFF', oscuro: '#1A1216' };
const NEGRO = '#000000';
const BLANCO = '#FFFFFF';
const MINIMO = 4.5;

/* ------------------------------------------------------------ colores */

const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function hex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function luminancia(color: string): number {
  const lineal = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(color);
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

/** La razón de contraste de WCAG 2.x, de 1 a 21. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `a` llevado hacia `b` en la proporción `t` (0: a, 1: b). */
function mezclar(a: string, b: string, t: number): string {
  const [x1, x2, x3] = rgb(a);
  const [y1, y2, y3] = rgb(b);
  return hex([x1 + (y1 - x1) * t, x2 + (y2 - x2) * t, x3 + (y3 - x3) * t]);
}

/** El extremo (negro o blanco) que más contraste da sobre `fondo`. */
function extremoSobre(fondo: string): string {
  return contraste(NEGRO, fondo) >= contraste(BLANCO, fondo) ? NEGRO : BLANCO;
}

/**
 * `color` llevado hacia el extremo que más se lee sobre los `fondos`, en
 * pasos de 2 %, hasta que se lea a 4,5:1 sobre todos. Siempre llega: el
 * negro o el blanco dan al menos 4,58 sobre cualquier color.
 */
function legibleSobre(color: string, fondo: string, ...otros: string[]): string {
  const fondos = [fondo, ...otros];
  const destino = extremoSobre(fondo);
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const c = mezclar(color, destino, Math.min(t, 1));
    if (fondos.every((f) => contraste(c, f) >= MINIMO)) return c;
  }
  return destino;
}

/* ------------------------------------------------------------ el tema */

const PLANTILLA_IDS = PLANTILLAS.map((p) => p.id) as string[];
const LETRA_IDS = LETRAS.map((l) => l.id) as string[];
const ESQUINA_IDS = ESQUINAS.map((e) => e.id) as string[];
const CONTROL = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/;

/** Lo que llega de la base, otra vez por la lista: lo desconocido se cae. */
export function normalizarTema(t: unknown): TemaGuardado {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return {};
  const o = t as Record<string, unknown>;
  const n: TemaGuardado = {};
  if (typeof o.plantilla === 'string' && PLANTILLA_IDS.includes(o.plantilla)) n.plantilla = o.plantilla as Plantilla;
  if (typeof o.principal === 'string' && HEX.test(o.principal)) n.principal = o.principal.toUpperCase();
  if (typeof o.fondo === 'string' && HEX.test(o.fondo)) n.fondo = o.fondo.toUpperCase();
  if (typeof o.letra === 'string' && LETRA_IDS.includes(o.letra)) n.letra = o.letra as Letra;
  if (typeof o.esquinas === 'string' && ESQUINA_IDS.includes(o.esquinas)) n.esquinas = o.esquinas as Esquinas;
  if (typeof o.portada === 'number' && Number.isSafeInteger(o.portada) && o.portada > 0) n.portada = o.portada;
  if (typeof o.frase === 'string') {
    const f = o.frase.trim();
    if (f.length >= 1 && f.length <= 90 && !CONTROL.test(f)) n.frase = f;
  }
  return n;
}

function colores(principal: string, fondo: string): ColoresRv {
  const extremo = extremoSobre(fondo);
  const claro = extremo === NEGRO;
  // La superficie (tarjetas, bandas) se aleja del texto, nunca se le
  // acerca: así lo que se lee sobre el fondo se lee también sobre ella.
  const superficie = claro ? mezclar(fondo, BLANCO, 0.6) : mezclar(fondo, NEGRO, 0.25);
  // El texto, casi del extremo con un toque del principal.
  const texto = legibleSobre(mezclar(extremo, principal, 0.12), fondo, superficie);
  let textoSuave = texto;
  for (let t = 0.6; t >= 0; t -= 0.02) {
    const c = mezclar(texto, fondo, t);
    if (contraste(c, fondo) >= MINIMO && contraste(c, superficie) >= MINIMO) { textoSuave = c; break; }
  }
  const boton = principal;
  const sobreBoton = contraste(NEGRO, boton) >= contraste(BLANCO, boton) ? NEGRO : BLANCO;
  return {
    fondo,
    superficie,
    texto,
    textoSuave,
    linea: mezclar(texto, fondo, 0.8),
    boton,
    sobreBoton,
    bordeBoton: contraste(boton, fondo) < 1.6 ? textoSuave : boton,
    acento: legibleSobre(principal, fondo, superficie),
  };
}

/**
 * El tema con el que se dibuja: lo guardado, y lo que falte de la
 * plantilla y de su paleta. Sin tema (todos los de antes del #73): la
 * plantilla Tienda con los colores de su paleta.
 */
export function temaResuelto(t: TemaGuardado | null | undefined, paleta: PaletaRevendedor | null | undefined): TemaResuelto {
  const n = normalizarTema(t);
  const deLaPaleta = TEMAS_LISTOS.find((x) => x.id === paleta) ?? LUX;
  const plantilla = PLANTILLAS.find((p) => p.id === n.plantilla) ?? TIENDA;
  const sinTema = Object.keys(n).length === 0;
  const fondo = n.fondo ?? (sinTema || !n.plantilla ? deLaPaleta.fondo : FONDO_DE[plantilla.fondo]);
  const principal = n.principal ?? deLaPaleta.principal;
  return {
    plantilla: plantilla.id,
    letra: n.letra ?? plantilla.letra,
    esquinas: n.esquinas ?? plantilla.esquinas,
    portada: n.portada ?? null,
    frase: n.frase ?? null,
    colores: colores(principal.toUpperCase(), fondo.toUpperCase()),
  };
}

const RADIO: Record<Esquinas, [string, string]> = {
  rectas: ['0', '0'],
  suaves: ['14px', '12px'],
  redondas: ['24px', '999px'],
};

/** Las variables que viste la página: solo colores, medidas y familias de la lista. */
export function variablesCss(t: TemaResuelto): Record<string, string> {
  const c = t.colores;
  return {
    '--rvc-fondo': c.fondo,
    '--rvc-superficie': c.superficie,
    '--rvc-texto': c.texto,
    '--rvc-texto-suave': c.textoSuave,
    '--rvc-linea': c.linea,
    '--rvc-boton': c.boton,
    '--rvc-sobre-boton': c.sobreBoton,
    '--rvc-borde-boton': c.bordeBoton,
    '--rvc-acento': c.acento,
    '--rvc-radio': RADIO[t.esquinas][0],
    '--rvc-radio-boton': RADIO[t.esquinas][1],
    '--rvc-letra-titulos': FAMILIA_TITULOS[t.letra],
    '--rvc-letra-texto': FAMILIA_TEXTO[t.plantilla],
  };
}

/**
 * Para el panel: cuánto se lee su color sobre su fondo y, si no llega a
 * 4,5:1, cómo queda cuando va de letra.
 */
export function avisoContraste(principal: string, fondo: string): { razon: number; ajustado: string | null } {
  const razon = contraste(principal, fondo);
  return { razon, ajustado: razon >= MINIMO ? null : legibleSobre(principal, fondo) };
}

/**
 * La pieza de portada: la que él eligió, si está y tiene foto; si no, una
 * con foto al azar, la misma mientras dure la visita (`semilla`).
 */
export function elegirPortada<T extends { id: number; foto_path: string | null }>(piezas: T[], portada: number | null, semilla: number): T | null {
  const elegida = portada === null ? undefined : piezas.find((p) => p.id === portada && p.foto_path);
  if (elegida) return elegida;
  const conFoto = piezas.filter((p) => p.foto_path);
  if (conFoto.length === 0) return null;
  return conFoto[Math.abs(Math.trunc(semilla)) % conFoto.length] ?? null;
}
