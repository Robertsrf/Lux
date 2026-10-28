import type { ClaveEscote } from '../lib/escotes';

/*
  LA SILUETA DE CADA ESCOTE

  Dibujo de línea, del cuello a la cintura, en tres tiempos (vitrina.css):
  primero el cuerpo, después el borde de la prenda y al final, en oro, la
  joya que le va. Todo en un lienzo de 400 × 300, con trazos de
  `pathLength="1"` para dibujarlos sin saber cuánto miden.

  El cuello está entre x = 170 y x = 230; los hombros bajan hasta los
  lados. La joya se apoya en esa geometría: un cambio aquí se mira en la
  vitrina, no a ojo.
*/

const CUERPO = [
  // La tapa del cuello, como la de un busto de joyería: sin cabeza, el
  // cuello cortado en seco se leía raro.
  'M170 0 C178 -9 222 -9 230 0 C222 9 178 9 170 0',
  'M170 0 C170 40 168 62 150 80 C122 102 72 110 46 136 C31 152 28 200 30 300',
  'M230 0 C230 40 232 62 250 80 C278 102 328 110 354 136 C369 152 372 200 370 300',
];

const CLAVICULAS = 'M152 96 C168 104 186 104 196 100 M204 100 C214 104 232 104 248 96';

interface Dibujo {
  prenda: string[];
  joya: string[];
  /** Puntos de oro: cuentas, un dije redondo. [cx, cy, r] */
  gemas: [number, number, number][];
  /** Si el cuello de la prenda tapa las clavículas, no se dibujan. */
  claviculas: boolean;
  /** Botones de una camisa: puntos crema. */
  botones?: [number, number][];
}

const DIBUJOS: Record<ClaveEscote, Dibujo> = {
  v: {
    prenda: ['M88 116 L200 236 L312 116'],
    joya: ['M152 84 C164 140 184 180 200 196 C216 180 236 140 248 84', 'M200 196 L200 205'],
    gemas: [[200, 213, 8]],
    claviculas: true,
  },
  redondo: {
    prenda: ['M126 96 C150 150 250 150 274 96'],
    joya: ['M156 86 C174 112 226 112 244 86'],
    gemas: [[170, 99, 2.6], [185, 106, 2.6], [200, 108, 3.2], [215, 106, 2.6], [230, 99, 2.6]],
    claviculas: false,
  },
  alto: {
    prenda: [
      'M164 24 C182 32 218 32 236 24',
      'M164 24 C164 50 162 70 150 84',
      'M236 24 C236 50 238 70 250 84',
      'M162 62 C182 68 218 68 238 62',
    ],
    joya: ['M168 44 C150 170 178 250 200 262 C222 250 250 170 232 44'],
    gemas: [[200, 272, 9]],
    claviculas: false,
  },
  barco: {
    prenda: ['M64 120 C140 146 260 146 336 120'],
    joya: ['M168 46 C184 56 216 56 232 46'],
    gemas: [[200, 57, 5]],
    claviculas: true,
  },
  corazon: {
    prenda: ['M58 178 C84 150 140 148 200 184 C260 148 316 150 342 178'],
    joya: ['M162 78 C180 100 220 100 238 78', 'M200 96 L208 106 L200 118 L192 106 Z'],
    gemas: [],
    claviculas: true,
  },
  camisero: {
    prenda: [
      'M170 78 L148 124 L196 112',
      'M230 78 L252 124 L204 112',
      'M200 112 L200 300',
    ],
    joya: ['M176 92 C188 104 212 104 224 92'],
    gemas: [[200, 106, 4]],
    claviculas: false,
    botones: [[200, 160], [200, 210], [200, 260]],
  },
};

/**
 * `conJoya` en falso dibuja solo el cuerpo y la prenda: cuando lo que le va
 * a ese escote son unos aretes (no hay collar en la tienda que le vaya), el
 * dibujo no pinta una cadena que no está. El busto no tiene orejas: los
 * aretes los enseñan sus fotos.
 */
export function SiluetaEscote({ clave, descripcion, conJoya = true }: { clave: ClaveEscote; descripcion: string; conJoya?: boolean }) {
  const d = DIBUJOS[clave];
  return (
    <svg className="silueta" viewBox="0 0 400 300" role="img" aria-label={descripcion}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {CUERPO.map((p) => <path key={p} className="trazo silueta__cuerpo" pathLength={1} d={p} />)}
        {d.claviculas ? <path className="trazo silueta__claviculas" pathLength={1} d={CLAVICULAS} /> : null}
        {d.prenda.map((p) => <path key={p} className="trazo silueta__prenda" pathLength={1} d={p} />)}
        {conJoya ? d.joya.map((p) => <path key={p} className="trazo silueta__joya" pathLength={1} d={p} />) : null}
      </g>
      {d.botones?.map(([x, y]) => <circle key={`${x}-${y}`} className="silueta__boton" cx={x} cy={y} r={3} />)}
      {conJoya ? d.gemas.map(([x, y, r]) => <circle key={`${x}-${y}`} className="silueta__gema" cx={x} cy={y} r={r} />) : null}
    </svg>
  );
}
