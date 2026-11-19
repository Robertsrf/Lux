import type { Escalera, PrecioSugerido } from './tipos';

/**
 * Quién puso el grupo de precio en el formulario de una pieza.
 *
 * La máquina lo mueve con cada sugerencia nueva, así sigue al costo
 * mientras se escribe. El dueño lo eligió a mano (o la pieza ya lo traía
 * al editarla): no se toca más.
 *
 * Antes se asignaba una sola vez, con la primera sugerencia que llegara.
 * Escribiendo "12.50" con calma, esa podía ser la de "1": el grupo se
 * quedaba en el de un costo a medio escribir, y solo cambiar el tipo lo
 * volvía a elegir (reportado por el dueño el 18/11/2026).
 */
export type QuienPusoGrupo = 'maquina' | 'dueno';

export interface EstadoGrupo {
  /** El grupo del formulario; '' es "Sin grupo". */
  grupo: string;
  quien: QuienPusoGrupo;
  /** Se cambió el tipo y falta la sugerencia de su escalera. */
  tipoCambiado: boolean;
  /** La escalera del tipo de ahora. */
  escalera: Escalera;
  /** El costo escrito; en cero o menos la máquina no elige. */
  costo: number;
  /** El campo de precio propio no está vacío. */
  hayPrecioPropio: boolean;
}

/**
 * Qué grupo queda tras una sugerencia de `admin_sugerir_precio`.
 *
 * null: la sugerencia es de la otra escalera (llegó antes de cambiar el
 * tipo) y no se toca nada. Si no, el grupo y quién lo puso, que pueden
 * ser los mismos de antes.
 */
export function grupoTrasSugerencia(
  s: Pick<PrecioSugerido, 'grupo_id' | 'escalera'>,
  e: EstadoGrupo,
): { grupo: string; quien: QuienPusoGrupo } | null {
  if ((s.escalera ?? 'pieza') !== e.escalera) return null;
  const sugerido = s.grupo_id ? String(s.grupo_id) : null;
  // Cambió el tipo: el grupo de la otra escalera no sirve, lo haya puesto
  // quien lo haya puesto. Sin grupo en la nueva (no hay escalera de dijes
  // todavía) se queda el de antes: mejor ese que sin precio.
  if (e.tipoCambiado) {
    return { grupo: sugerido && !e.hayPrecioPropio ? sugerido : e.grupo, quien: 'maquina' };
  }
  if (e.quien === 'dueno' || !sugerido || e.hayPrecioPropio || e.costo <= 0) {
    return { grupo: e.grupo, quien: e.quien };
  }
  return { grupo: sugerido, quien: 'maquina' };
}
