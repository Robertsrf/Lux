import { sumarCifras } from './dinero.ts';
import { CATEGORIAS_CAJA } from './tipos.ts';

/**
 * La pantalla Flujo (fase 9) sobre `admin_flujo(desde, hasta)` (#75). Aquí
 * no se cuenta nada nuevo: se agrupan las filas que devuelve la base y se
 * nombran. Los totales de "salió" y "entró" suman renglones de la misma
 * moneda (como la Caja); el de "queda" es la fila `dinero` de la base.
 */
export interface FilaFlujo {
  orden: number;
  grupo: 'salio' | 'entro' | 'nota' | 'queda' | string;
  concepto: string;
  bs: number | string | null;
  binance: number | string | null;
  bcv: number | string | null;
}

export interface Montos { bs: number; binance: number; bcv: number }
export interface GrupoFlujo { filas: FilaFlujo[]; total: Montos }

export interface FlujoAgrupado {
  salio: GrupoFlujo;
  entro: GrupoFlujo;
  /** Sin "dinero" ni "si_se_vende", que van aparte. */
  queda: GrupoFlujo;
  /** De lo que entró, lo que falta por comprobar (no se suma otra vez). */
  sinComprobar: Montos | null;
  siSeVende: Montos | null;
}

const CERO: Montos = { bs: 0, binance: 0, bcv: 0 };
const num = (v: number | string | null) => (v === null || v === '' ? 0 : Number(v) || 0);
const montos = (f: FilaFlujo): Montos => ({ bs: num(f.bs), binance: num(f.binance), bcv: num(f.bcv) });
const sumarFilas = (filas: FilaFlujo[]): Montos => ({
  bs: sumarCifras(filas.map((f) => num(f.bs))),
  binance: sumarCifras(filas.map((f) => num(f.binance))),
  bcv: sumarCifras(filas.map((f) => num(f.bcv))),
});

export function agruparFlujo(filas: FilaFlujo[]): FlujoAgrupado {
  const de = (g: string) => filas.filter((f) => f.grupo === g);
  const salio = de('salio');
  const entro = de('entro');
  const queda = de('queda');
  const dinero = queda.find((f) => f.concepto === 'dinero');
  const siSeVende = queda.find((f) => f.concepto === 'si_se_vende');
  const sinComprobar = de('nota').find((f) => f.concepto === 'entro_sin_comprobar');
  return {
    salio: { filas: salio, total: sumarFilas(salio) },
    entro: { filas: entro, total: sumarFilas(entro) },
    queda: {
      filas: queda.filter((f) => f.concepto !== 'dinero' && f.concepto !== 'si_se_vende'),
      total: dinero ? montos(dinero) : { ...CERO },
    },
    sinComprobar: sinComprobar ? montos(sinComprobar) : null,
    siSeVende: siSeVende ? montos(siSeVende) : null,
  };
}

const NOMBRES: Record<string, string> = {
  mercancia: 'Mercancía, con su flete',
  exhibidores: 'Exhibidores, con su flete',
  mobiliario: 'Mobiliario (Inversiones)',
  ventas: 'Ventas cobradas completas',
  abonos: 'Abonos',
  dinero: 'Dinero (entró − salió)',
  mercancia_costo: 'Mercancía en la tienda, a lo que costó',
  mercancia_en_camino: 'Mercancía en camino',
  mercancia_sin_rastro: 'Mercancía sin rastro',
  mercancia_etiqueta: 'Mercancía a la etiqueta de hoy',
  abonado_sin_entregar: 'Lo ya abonado de pedidos sin entregar',
  te_deben: 'Lo que te deben',
  si_se_vende: 'Si se vende todo',
  entro_sin_comprobar: 'De eso, sin comprobar',
};

/** Cómo se llama cada fila en la pantalla. Lo que no conoce, tal cual. */
export function nombreConcepto(concepto: string): string {
  if (concepto.startsWith('caja:')) {
    const cat = concepto.slice(5);
    if (!cat || cat === 'null') return 'Caja · sin categoría';
    return `Caja · ${CATEGORIAS_CAJA.find((c) => c.valor === cat)?.texto ?? cat}`;
  }
  return NOMBRES[concepto] ?? concepto;
}

export type ClavePeriodo = 'mes' | 'anio' | 'todo';

/** El período del selector, con el día de hoy de Venezuela ("2026-11-24"). */
export function periodo(clave: ClavePeriodo, hoy: string): { desde: string | null; hasta: string | null } {
  if (clave === 'mes') return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  if (clave === 'anio') return { desde: `${hoy.slice(0, 5)}01-01`, hasta: hoy };
  return { desde: null, hasta: null };
}
