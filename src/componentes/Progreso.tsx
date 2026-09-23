import type { ReactNode } from 'react';
import { formatearPorcentaje } from '../lib/dinero';

/**
 * Una barra de avance contra una meta: el mes cubriéndose, lo invertido
 * volviendo, las piezas de hoy contra las que hacen falta.
 *
 * Vivía dentro de Inversiones. Salió de ahí cuando Costos y Reportes
 * necesitaron la misma barra: tres copias de un componente terminan siendo
 * tres barras que dicen lo mismo de tres maneras.
 *
 * El porcentaje se dibuja con la cifra al lado, no solo con el largo de la
 * barra: el color y el largo no bastan para quien no distingue el verde.
 */
export function Progreso({ titulo, pct, pie }: {
  titulo: string;
  /** 0 a 100. Por encima de 100 la barra se llena y se pinta de éxito. */
  pct: number | null;
  /** Lo que se lee debajo: "$800 BCV de $1.200 BCV", en la moneda de cada caso. */
  pie?: ReactNode;
}) {
  const p = Math.max(0, Math.min(pct ?? 0, 100));
  return (
    <div className="progreso">
      <div className="progreso__cabecera">
        <span className="progreso__titulo">{titulo}</span>
        <span className="progreso__cifra">{formatearPorcentaje(pct, 0)}</span>
      </div>
      <div
        className="progreso__riel"
        role="progressbar"
        aria-valuenow={Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={titulo}
      >
        <div
          className={p >= 100 ? 'progreso__relleno progreso__relleno--completo' : 'progreso__relleno'}
          style={{ transform: `scaleX(${p / 100})` }}
        />
      </div>
      {pie ? <div className="progreso__pie">{pie}</div> : null}
    </div>
  );
}
