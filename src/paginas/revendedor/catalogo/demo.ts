import { supabase, mensajeDeError } from '../../../lib/supabase';
import { paraQueVe } from '../../../componentes/ElegirPara';
import type { ApartadoPublico, ModeloRevendedor, PerfilRevendedor } from '../../../lib/tipos';
import { COLUMNAS } from './fuente';
import type { FuenteCatalogoRv } from './fuente';

/*
  SOLO EN DESARROLLO (`npm run dev`, `/r/muestra?demo=1`): un revendedor
  inventado con las piezas públicas de la vitrina (`v_disponible_publico`,
  lo mismo que ve cualquiera), para ver las tres plantillas y probarlas con
  datos feos sin crear nada en la base. CatalogoRv lo importa dentro de un
  `if (import.meta.env.DEV)`: no llega al sitio publicado.

  Parámetros: plantilla, letra, esquinas, principal, fondo (sin #), frase,
  logo=ancho|cuadrado|redondo|ninguno, nombre=largo, vacio=1.
*/

const svg = (ancho: number, alto: number, cuerpo: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}">${cuerpo}</svg>`)}`;

const LOGOS: Record<string, string> = {
  ancho: svg(720, 120, '<rect width="720" height="120" fill="#7A1E3A"/><text x="360" y="84" font-family="Georgia" font-size="76" fill="#fff" text-anchor="middle" letter-spacing="10">JADUJOYAS</text>'),
  cuadrado: svg(200, 200, '<rect width="200" height="200" rx="44" fill="#2B3FD1"/><text x="100" y="128" font-family="Arial" font-weight="700" font-size="84" fill="#fff" text-anchor="middle">JJ</text>'),
  redondo: svg(200, 200, '<circle cx="100" cy="100" r="96" fill="none" stroke="#F0B49E" stroke-width="6"/><text x="100" y="128" font-family="Georgia" font-size="90" fill="#F0B49E" text-anchor="middle">J</text>'),
};

export function fuenteDemo(q: URLSearchParams): FuenteCatalogoRv {
  const color = (k: string) => { const v = q.get(k); return v && /^[0-9a-fA-F]{6}$/.test(v) ? `#${v}` : undefined; };
  const tema: Record<string, unknown> = {};
  for (const k of ['plantilla', 'letra', 'esquinas', 'frase']) { const v = q.get(k); if (v) tema[k] = v; }
  if (color('principal')) tema.principal = color('principal');
  if (color('fondo')) tema.fondo = color('fondo');
  const nombre = q.get('nombre') === 'largo' ? 'Joyería Las Tres Hermanas de Sabana de Mendoza y Valera' : 'Jadu Joyas';
  const perfil: PerfilRevendedor = {
    usuario: 'muestra',
    nombre: 'Jadu Pérez',
    catalogo_nombre: nombre,
    telefono: '04121234567',
    paleta: 'lux',
    logo_path: LOGOS[q.get('logo') ?? 'cuadrado'] ?? null,
    dias_apartado: 0,
    pago_movil_cedula: '12345678',
    pago_movil_telefono: '04121234567',
    pago_movil_banco: '0102 Banco de Venezuela',
    dias_credito: 7,
    horas_pago: 2,
    inicial_pct: 40,
    tema: Object.keys(tema).length ? tema : null,
  };

  let todas: Promise<{ filas: (ModeloRevendedor & { para: string | null; armado: 'dije' | 'base' | null })[]; error: string | null }> | null = null;
  const traer = () => {
    todas ??= (async () => {
      const { data, error } = await supabase.from('v_disponible_publico').select(`${COLUMNAS}, para, armado`).limit(1000);
      return { filas: q.get('vacio') ? [] : ((data as never[] | null) ?? []), error: error ? mensajeDeError(error) : null };
    })();
    return todas;
  };
  const porNombre = (a: ModeloRevendedor, b: ModeloRevendedor) =>
    (a.categoria ?? '').localeCompare(b.categoria ?? '', 'es') || a.nombre.localeCompare(b.nombre, 'es');

  return {
    perfil: async () => ({ data: perfil, error: null }),
    async categorias() {
      const { filas, error } = await traer();
      return { data: [...new Set(filas.map((f) => f.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), error };
    },
    async piezas({ categoria, para, texto }, limite) {
      const { filas, error } = await traer();
      const t = texto.trim().toLocaleLowerCase('es');
      const ven = para ? paraQueVe(para) : null;
      const data = filas
        .filter((f) => !categoria || f.categoria === categoria)
        .filter((f) => !ven || (f.para !== null && ven.includes(f.para)))
        .filter((f) => !t || [f.nombre, f.categoria, f.variante ?? ''].some((x) => x.toLocaleLowerCase('es').includes(t)))
        .sort(porNombre)
        .slice(0, limite);
      return { data, error };
    },
    async armados() {
      const { filas } = await traer();
      return new Map(filas.filter((f) => f.armado).map((f) => [f.id, f.armado as 'dije' | 'base']));
    },
    async dijes(ids, limite) {
      const { filas, error } = await traer();
      return { data: filas.filter((f) => ids.includes(f.id)).sort(porNombre).slice(0, limite), error };
    },
  };
}

/** Un pedido de muestra de su clienta, esperando el pago (`/apartado/x?demo=1`). */
export async function apartadoDemo(q: URLSearchParams): Promise<{ apartado: ApartadoPublico; tema: unknown }> {
  const perfil = (await fuenteDemo(q).perfil()).data!;
  const piezas = (await fuenteDemo(q).piezas({ categoria: null, para: null, texto: '' }, 3)).data;
  const items = piezas.map((m) => ({ nombre: m.nombre, variante: m.variante, foto_thumb_path: m.foto_thumb_path, cantidad: 1, precio_usd: Number(m.precio_usd ?? 0) }));
  const total = items.reduce((s, i) => s + i.precio_usd, 0);
  return {
    tema: perfil.tema,
    apartado: {
      usuario: 'muestra', catalogo_nombre: perfil.catalogo_nombre, revendedor: 'Jadu', telefono: perfil.telefono,
      paleta: 'lux', logo_path: perfil.logo_path, estado: 'abierto', creado_en: new Date().toISOString(),
      expira_en: new Date(Date.now() + 2 * 3600_000).toISOString(), clienta: 'María G.', items,
      total_usd: total, falta_usd: total, fase: 'esperando_pago', confirmado_en: null, vence_clienta_en: null,
      pago_movil_cedula: perfil.pago_movil_cedula, pago_movil_telefono: perfil.pago_movil_telefono,
      pago_movil_banco: perfil.pago_movil_banco, dias_credito: 7, inicial_pct: 40, minimo_usd: Math.round(total * 40) / 100, abonos: [],
    },
  };
}
