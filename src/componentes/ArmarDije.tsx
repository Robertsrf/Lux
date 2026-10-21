import { useMemo, useState } from 'react';
import { ElegirVariante } from './ElegirVariante';
import { agruparPorFamilia, rangoDe } from '../lib/familias';
import { formatearBcv, formatearBs } from '../lib/dinero';

/** Lo que la hoja necesita de cada dije: lo mismo en los dos catálogos. */
export interface DijeParaArmar {
  id: number;
  sku: string;
  nombre: string;
  variante: string | null;
  familia: number;
  precio_usd: number | null;
  precio_bs: number | null;
  disponible: number;
}

/**
 * "Agrégale un dije": la hoja que sale desde una cadena o pulsera para
 * armar. Si hay un solo producto de dijes (las letras), salen sus opciones
 * de una vez; si hay varios, primero cuál y después la opción. La misma
 * hoja de elegir medida, para que la clienta no aprenda un gesto nuevo.
 *
 * Cada dije dice su precio de dije: es lo que se suma a la cadena.
 */
export function ArmarDije({ base, dijes, llevas, alElegir, alCerrar }: {
  /** El nombre de la cadena o pulsera, para decir a qué se le cuelga. */
  base: string;
  dijes: DijeParaArmar[];
  llevas: (id: number) => number;
  alElegir: (id: number) => void;
  alCerrar: () => void;
}) {
  const familias = useMemo(() => agruparPorFamilia(dijes), [dijes]);
  const [familia, setFamilia] = useState<number | null>(() => (familias.length === 1 ? familias[0]!.clave : null));
  const elegida = familia === null ? null : familias.find((f) => f.clave === familia) ?? null;

  if (familias.length === 0) {
    return (
      <ElegirVariante
        titulo="Agrégale un dije"
        subtitulo="Por ahora no hay dijes disponibles. Vuelve pronto."
        opciones={[]}
        alElegir={() => undefined}
        alCerrar={alCerrar}
      />
    );
  }

  if (!elegida) {
    return (
      <ElegirVariante
        key="familias"
        titulo="Agrégale un dije"
        subtitulo={`Para ${base}. Elige cuál.`}
        opciones={familias.map((f) => {
          const bs = rangoDe(f.variantes, (v) => v.precio_bs);
          const bcv = rangoDe(f.variantes, (v) => v.precio_usd);
          const quedan = f.variantes.reduce((n, v) => n + v.disponible, 0);
          const puestas = f.variantes.reduce((n, v) => n + llevas(v.id), 0);
          return {
            id: f.clave,
            etiqueta: f.cabeza.nombre,
            detalle: f.variantes.length > 1 ? `${f.variantes.length} opciones` : quedan === 1 ? 'Queda 1' : `Quedan ${quedan}`,
            precios: (
              <>
                <span className="opcion-variante__precio">{bs.min !== bs.max ? 'desde ' : ''}{formatearBs(bs.min)}</span>
                <span className="opcion-variante__precio">{formatearBcv(bcv.min)}</span>
              </>
            ),
            deshabilitada: f.variantes.every((v) => llevas(v.id) >= v.disponible),
            llevas: puestas,
          };
        })}
        alElegir={(clave) => {
          const f = familias.find((x) => x.clave === clave);
          if (f && f.variantes.length === 1) alElegir(f.variantes[0]!.id);
          else setFamilia(clave);
        }}
        alCerrar={alCerrar}
      />
    );
  }

  return (
    <ElegirVariante
      key={elegida.clave}
      titulo={elegida.cabeza.nombre}
      subtitulo={`Para ${base}. Se suma con su precio de dije.`}
      opciones={elegida.variantes.map((v) => ({
        id: v.id,
        etiqueta: v.variante ?? v.sku,
        detalle: v.disponible === 1 ? 'Queda 1' : `Quedan ${v.disponible}`,
        precios: (
          <>
            <span className="opcion-variante__precio">{formatearBs(v.precio_bs)}</span>
            <span className="opcion-variante__precio">{formatearBcv(v.precio_usd)}</span>
          </>
        ),
        deshabilitada: llevas(v.id) >= v.disponible,
        llevas: llevas(v.id),
      }))}
      alElegir={alElegir}
      alCerrar={alCerrar}
    />
  );
}
