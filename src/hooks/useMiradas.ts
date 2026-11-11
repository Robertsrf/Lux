import { useCallback, useEffect, useRef, useState } from 'react';
import { parejaParaOfrecer, clavePareja, sumarMirada, type Miradas } from '../lib/ofertas';
import { registrarMiradas } from '../lib/ofertasApi';

export interface UsoMiradas {
  /** El detalle de una pieza se abrió. */
  abrir: (modeloId: number) => void;
  /** El detalle se cerró. */
  cerrar: () => void;
  /** Las dos piezas que más se miraron, si ya toca ofrecerlas juntas. */
  pareja: [number, number] | null;
  /** La clienta dijo que no (o ya la vio): no se vuelve a ofrecer. */
  descartar: () => void;
}

/**
 * Cuánto mira la clienta cada pieza. Sirve para dos cosas: contarlo en
 * `registrar_miradas` (al pasar la pestaña a segundo plano) y, si
 * `umbralSeg` no es null, ofrecerle UNA vez por visita las dos que más
 * miró. El umbral viene de `ofertas_publicas().mirada_segundos`: sin él,
 * no se ofrece nada. El código lo pone la base, no este cálculo.
 */
export function useMiradas(umbralSeg: number | null): UsoMiradas {
  const [pareja, setPareja] = useState<[number, number] | null>(null);
  const total = useRef<Miradas>({});
  const pendiente = useRef<Miradas>({});
  const veces = useRef<Record<number, number>>({});
  const abierta = useRef<{ id: number; desde: number } | null>(null);
  const ofrecidas = useRef<Set<string>>(new Set());
  const yaOfrecio = useRef(false);
  const umbral = useRef<number | null>(umbralSeg);
  umbral.current = umbralSeg;

  const cerrar = useCallback((): void => {
    const a = abierta.current;
    if (!a) return;
    abierta.current = null;
    const ms = Date.now() - a.desde;
    total.current = sumarMirada(total.current, a.id, ms);
    pendiente.current = sumarMirada(pendiente.current, a.id, ms);
    veces.current[a.id] = (veces.current[a.id] ?? 0) + 1;
    if (umbral.current === null || yaOfrecio.current) return;
    const p = parejaParaOfrecer(total.current, umbral.current, ofrecidas.current);
    if (p) {
      yaOfrecio.current = true;
      setPareja(p);
    }
  }, []);

  const abrir = useCallback((modeloId: number): void => {
    // Una sola ventana por visita: abrir otra cierra la anterior.
    if (abierta.current) cerrar();
    abierta.current = { id: modeloId, desde: Date.now() };
  }, [cerrar]);

  const descartar = useCallback((): void => {
    setPareja((p) => {
      if (p) ofrecidas.current.add(clavePareja(p[0], p[1]));
      return null;
    });
  }, []);

  useEffect(() => {
    const enviar = (): void => {
      if (abierta.current) {
        // Sigue abierta mientras la pestaña se va: cuenta hasta ahora y sigue.
        const a = abierta.current;
        const ahora = Date.now();
        pendiente.current = sumarMirada(pendiente.current, a.id, ahora - a.desde);
        total.current = sumarMirada(total.current, a.id, ahora - a.desde);
        abierta.current = { id: a.id, desde: ahora };
        veces.current[a.id] = (veces.current[a.id] ?? 0) + 1;
      }
      const filas = Object.entries(pendiente.current)
        .map(([id, ms]) => ({
          modelo_id: Number(id),
          segundos: Math.min(600, Math.round(ms / 1000)),
          veces: Math.max(1, veces.current[Number(id)] ?? 1),
        }))
        .filter((f) => f.segundos > 0);
      pendiente.current = {};
      veces.current = {};
      registrarMiradas(filas);
    };
    const alCambiar = (): void => {
      if (document.visibilityState === 'hidden') enviar();
    };
    document.addEventListener('visibilitychange', alCambiar);
    window.addEventListener('pagehide', enviar);
    return () => {
      document.removeEventListener('visibilitychange', alCambiar);
      window.removeEventListener('pagehide', enviar);
      enviar();
    };
  }, []);

  return { abrir, cerrar, pareja, descartar };
}
