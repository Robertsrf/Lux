import type { ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/**
 * Los gráficos del sistema, con Recharts.
 *
 * La primera versión fue en HTML y CSS para no sumar peso. Se leía mal —el
 * dueño lo dijo dos veces— y arreglarla a base de parches CSS era pelear
 * contra un problema que una librería ya tiene resuelto: ejes, escalas,
 * globos que no se salen de la pantalla, y redibujar al girar el teléfono.
 *
 * LO QUE SE LE IMPONE A LA LIBRERÍA
 * Recharts trae su propia paleta y su propia tipografía. Ninguna entra: los
 * colores son los de la casa, ya medidos, y las letras son Jost y Fraunces.
 * La librería pone la geometría; la marca sigue siendo de Lux.
 *
 * LOS COLORES ESTÁN MEDIDOS, NO ELEGIDOS A OJO
 * Salvia #7F9492 para el costo y verde #2E5A61 para la ganancia pasan
 * separación por daltonismo (ΔE 20,2 protan), umbral de visión normal y
 * contraste contra el blanco. El oro se descartó por medición: contra la
 * salvia da ΔE 14,5, o sea que se confunden incluso con vista perfecta.
 */

const COSTO = '#7F9492';
/* Lo que falta por cubrir: separa del verde por delta-E 34 y contrasta mejor
   que un gris mas claro. Va con etiqueta visible al lado, que es lo que el
   oficio exige cuando un color queda bajo 3:1 contra el fondo. */
const POR_CUBRIR = '#B0BFBD';
const GANANCIA = '#2E5A61';
/* El texto lleva tinta, nunca el color de la serie: el color lo carga la
   barra. Esa confusión fue justo lo que hizo ilegible la versión anterior. */
const TINTA = '#14292C';
const SECUNDARIO = '#506664';
const LINEA = '#E0D8C7';

const LETRA = { fontFamily: 'Jost, system-ui, sans-serif', fontSize: 12 };
const EJE = { tick: { fill: SECUNDARIO, ...LETRA }, stroke: LINEA, tickLine: false };

/** El globo de la casa: verde profundo con texto crema, como la barra del carrito. */
function Globo({ active, payload, label, formato, totalEtiqueta = 'Total' }: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  formato: (n: number) => string;
  totalEtiqueta?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
  return (
    <div className="globo-grafico">
      <strong>{label}</strong>
      {payload.length > 1 ? <span className="globo-grafico__total">{totalEtiqueta} {formato(total)}</span> : null}
      {payload.map((p) => (
        <span key={p.dataKey ?? p.name} className="globo-grafico__linea">
          <i style={{ background: p.color }} aria-hidden="true" />
          {p.name} {formato(Number(p.value) || 0)}
        </span>
      ))}
    </div>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <div className="grafico-vacio">{children}</div>;
}

/* ------------------------------------------------- costo y ganancia por día */

export interface DiaGrafico {
  dia: string;
  costo: number;
  ganancia: number;
}

/**
 * Costo y ganancia apilados: juntos son lo cobrado ese día.
 *
 * Apilados y no lado a lado a propósito. Así el alto de la columna ES el
 * ingreso, y de un vistazo se ve qué parte se quedó. Dos ejes distintos para
 * dos medidas —el error clásico de los tableros— aquí ni se plantea: las dos
 * son dólares y comparten escala.
 */
export function GraficoDiario({ datos, formato, vacio }: {
  datos: DiaGrafico[];
  formato: (n: number) => string;
  vacio: ReactNode;
}) {
  if (datos.length === 0) return <Vacio>{vacio}</Vacio>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {/* Rejilla recesiva: guía la lectura sin competir con el dato. */}
        <CartesianGrid stroke={LINEA} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="dia" {...EJE} />
        <YAxis {...EJE} width={54} tickFormatter={(v) => formato(Number(v))} />
        <Tooltip
          cursor={{ fill: 'rgba(31, 64, 69, 0.06)' }}
          content={<Globo formato={formato} totalEtiqueta="Cobrado" />}
        />
        <Legend wrapperStyle={{ ...LETRA, color: SECUNDARIO, paddingTop: 8 }} />
        {/* La ganancia va arriba de la pila: es lo que se busca al mirar. */}
        <Bar dataKey="costo" name="Costo" stackId="a" fill={COSTO} />
        <Bar dataKey="ganancia" name="Ganancia" stackId="a" fill={GANANCIA} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------- magnitudes por partida */

export interface PartidaGrafico {
  partida: string;
  /** Lo que ya taparon las ventas del mes. */
  cubierto: number;
  /** Lo que falta. Los dos suman el gasto del mes de esa partida. */
  porCubrir: number;
}

/**
 * Gastos por partida, y cuánto de cada uno ya cubrieron las ventas.
 *
 * El largo entero de la barra es lo que cuesta esa partida al mes; la parte
 * verde es lo que ya está pagado. Así el gráfico deja de ser una foto de lo
 * que se debe y pasa a ser una barra que se llena.
 *
 * La cobertura se reparte a prorrata entre todas las partidas. El dinero no
 * viene etiquetado —una venta no paga "el alquiler"— así que fingir que una
 * partida se cubre antes que otra seria inventarse un orden que no existe.
 *
 * Horizontales porque las etiquetas son palabras: en vertical hay que torcer
 * la cabeza o el texto.
 */
export function GraficoGastos({ datos, formato, vacio }: {
  datos: PartidaGrafico[];
  formato: (n: number) => string;
  vacio: ReactNode;
}) {
  if (datos.length === 0) return <Vacio>{vacio}</Vacio>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(datos.length * 46 + 56, 190)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={LINEA} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...EJE} tickFormatter={(v) => formato(Number(v))} />
        <YAxis
          type="category"
          dataKey="partida"
          width={112}
          tickLine={false}
          stroke={LINEA}
          /* El nombre de la partida es lo primero que se busca: tinta y
             medio peso, no el verde de la barra. */
          tick={{ fill: TINTA, fontFamily: LETRA.fontFamily, fontSize: 14, fontWeight: 500 }}
        />
        <Tooltip
          cursor={{ fill: 'rgba(31, 64, 69, 0.06)' }}
          content={<Globo formato={formato} totalEtiqueta="Al mes" />}
        />
        <Legend wrapperStyle={{ ...LETRA, color: SECUNDARIO, paddingTop: 8 }} />
        <Bar dataKey="cubierto" name="Cubierto" stackId="g" fill={GANANCIA} barSize={18} />
        <Bar dataKey="porCubrir" name="Por cubrir" stackId="g" fill={POR_CUBRIR} radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
