import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Campo } from '../../../componentes/Piezas';
import { urlPublicaFoto } from '../../../lib/fotos';
import { nombreConVariante } from '../../../lib/familias';
import type { PaletaRevendedor } from '../../../lib/tipos';
import {
  ESQUINAS, FAMILIA_TITULOS, LETRAS, PLANTILLAS, TEMAS_LISTOS, avisoContraste, temaResuelto, variablesCss,
} from './tema';
import type { TemaGuardado } from './tema';
import { cargarTodasLasTitulos } from './letras';
import './editor-tema.css';

export interface PiezaParaPortada {
  id: number;
  nombre: string;
  variante: string | null;
  foto_thumb_path: string | null;
}

const PALETAS_VIEJAS: string[] = ['lux', 'noche', 'vino', 'grafito', 'ciruela', 'oliva'];
const razon = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** "#f7c948", "F7C948", "f7c" → "#F7C948"; lo que no es un color, null. */
export function leerColor(texto: string): string | null {
  const t = texto.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(t)) return `#${t.split('').map((c) => c + c).join('').toUpperCase()}`;
  return null;
}

function CampoColor({ id, etiqueta, valor, alCambiar }: { id: string; etiqueta: string; valor: string; alCambiar: (c: string) => void }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => { setTexto(valor); }, [valor]);
  const malo = texto.trim() !== '' && leerColor(texto) === null;
  return (
    <Campo etiqueta={etiqueta} htmlFor={id} error={malo ? 'Escribe el color como #F7C948, o elígelo en el cuadrito.' : null}>
      <span className="editor-tema__color">
        <input
          type="color" aria-label={`${etiqueta}: elegir`} value={(leerColor(texto) ?? valor).toLowerCase()}
          onChange={(e) => { setTexto(e.target.value.toUpperCase()); alCambiar(e.target.value.toUpperCase()); }}
        />
        <input
          id={id} value={texto} autoComplete="off" spellCheck={false} maxLength={7}
          onChange={(e) => { setTexto(e.target.value); const c = leerColor(e.target.value); if (c) alCambiar(c); }}
        />
      </span>
    </Campo>
  );
}

/**
 * Cómo se ve el catálogo de un revendedor (#73): plantilla, colores, letra,
 * esquinas, portada y frase. Lo usan su panel (Mi catálogo) y el dueño
 * (Revendedores). Enseña el contraste medido: si su color no se lee como
 * letra sobre su fondo, dice cómo queda ajustado (el catálogo lo ajusta
 * solo al dibujar, siempre).
 */
export function EditorTemaRv({ valor, alCambiar, piezas, paleta, alElegirPaleta }: {
  valor: TemaGuardado;
  alCambiar: (t: TemaGuardado) => void;
  /** Las de su catálogo, para la portada. Null mientras llegan. */
  piezas: PiezaParaPortada[] | null;
  paleta: PaletaRevendedor;
  /** Al elegir uno de los seis de antes, también su paleta (para el navegador viejo). */
  alElegirPaleta?: (p: PaletaRevendedor) => void;
}) {
  useEffect(() => { void cargarTodasLasTitulos(); }, []);
  const [buscar, setBuscar] = useState('');
  const resuelto = useMemo(() => temaResuelto(valor, paleta), [valor, paleta]);
  const muestra = useMemo(() => variablesCss(resuelto) as CSSProperties, [resuelto]);
  const principal = resuelto.colores.boton;
  const fondo = resuelto.colores.fondo;
  const aviso = avisoContraste(principal, fondo);
  // Sin normalizar aquí: la frase se escribe con sus espacios. Se limpia al guardar.
  const cambiar = (parte: TemaGuardado) => alCambiar({ ...valor, ...parte });
  const portada = piezas?.find((p) => p.id === valor.portada) ?? null;
  const halladas = useMemo(() => {
    const t = buscar.trim().toLocaleLowerCase('es');
    if (!piezas || !t) return [];
    return piezas.filter((p) => p.foto_thumb_path && nombreConVariante(p.nombre, p.variante).toLocaleLowerCase('es').includes(t)).slice(0, 12);
  }, [piezas, buscar]);

  return (
    <div className="editor-tema">
      <fieldset className="editor-tema__grupo">
        <legend>Plantilla</legend>
        <div className="editor-tema__plantillas">
          {PLANTILLAS.map((p) => (
            <label key={p.id} className="editor-tema__plantilla">
              <input type="radio" name="et-plantilla" checked={resuelto.plantilla === p.id} onChange={() => cambiar({ plantilla: p.id })} />
              <span className={`editor-tema__dibujo editor-tema__dibujo--${p.id}`} aria-hidden="true"><span /><span /><span /></span>
              <span className="editor-tema__nombre">{p.nombre}</span>
              <span className="editor-tema__para">{p.para}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="editor-tema__grupo">
        <legend>Colores</legend>
        <p className="campo__pista">Listos para usar:</p>
        <div className="editor-tema__listos">
          {TEMAS_LISTOS.map((t) => {
            const elegido = principal === t.principal && fondo === t.fondo;
            return (
              <button
                key={t.id} type="button" className="editor-tema__listo" aria-pressed={elegido} title={t.nombre}
                onClick={() => {
                  cambiar({ principal: t.principal, fondo: t.fondo });
                  if (alElegirPaleta && PALETAS_VIEJAS.includes(t.id)) alElegirPaleta(t.id as PaletaRevendedor);
                }}
              >
                <span className="editor-tema__listo-muestra" style={{ background: `linear-gradient(135deg, ${t.principal} 50%, ${t.fondo} 50%)` }} aria-hidden="true" />
                <span>{t.nombre}</span>
              </button>
            );
          })}
        </div>
        <p className="campo__pista">O los tuyos:</p>
        <div className="fila">
          <CampoColor id="et-principal" etiqueta="Color principal" valor={principal} alCambiar={(c) => cambiar({ principal: c })} />
          <CampoColor id="et-fondo" etiqueta="Fondo" valor={fondo} alCambiar={(c) => cambiar({ fondo: c })} />
        </div>
        {aviso.ajustado ? (
          <p className="editor-tema__aviso" role="status">
            Ese color no se lee como letra sobre ese fondo ({razon(aviso.razon)} a 1; hace falta 4,5). En los botones va
            con letra {resuelto.colores.sobreBoton === '#000000' ? 'negra' : 'blanca'}, y en los títulos se ajusta un poco
            para que se lea, así: <strong style={{ color: aviso.ajustado, background: fondo, padding: '0 4px' }}>{aviso.ajustado}</strong>.
          </p>
        ) : (
          <p className="campo__pista">Se lee bien: {razon(aviso.razon)} a 1.</p>
        )}
      </fieldset>

      <fieldset className="editor-tema__grupo">
        <legend>Letra de los títulos</legend>
        <div className="editor-tema__letras">
          {LETRAS.map((l) => (
            <label key={l.id} className="editor-tema__letra">
              <input type="radio" name="et-letra" checked={resuelto.letra === l.id} onChange={() => cambiar({ letra: l.id })} />
              <span style={{ fontFamily: FAMILIA_TITULOS[l.id] }} className="editor-tema__letra-muestra">Joyas de todos los días</span>
              <span className="campo__pista">{l.nombre}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="editor-tema__grupo">
        <legend>Esquinas de las fotos y los botones</legend>
        <div className="grupo-botones">
          {ESQUINAS.map((e) => (
            <label key={e.id} className="editor-tema__esquina">
              <input type="radio" name="et-esquinas" checked={resuelto.esquinas === e.id} onChange={() => cambiar({ esquinas: e.id })} />
              <span className={`editor-tema__esquina-muestra editor-tema__esquina-muestra--${e.id}`} aria-hidden="true" />
              {e.nombre}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="editor-tema__grupo">
        <legend>Portada</legend>
        <Campo etiqueta="Tu frase" htmlFor="et-frase" pista={`${(valor.frase ?? '').length} de 90. Vacía: “${PLANTILLAS.find((p) => p.id === resuelto.plantilla)?.frase}”.`}>
          <input id="et-frase" value={valor.frase ?? ''} maxLength={90} autoComplete="off" onChange={(e) => cambiar({ frase: e.target.value })} />
        </Campo>
        <p className="campo__pista">
          {portada ? <>La foto de portada es la de <strong>{nombreConVariante(portada.nombre, portada.variante)}</strong>.</> : 'Sin elegir, sale la foto de una pieza al azar.'}
        </p>
        {portada ? <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => alCambiar({ ...valor, portada: null })}>Que salga una al azar</button> : null}
        <Campo etiqueta="Elegir la pieza de portada" htmlFor="et-buscar" pista={piezas === null ? 'Trayendo tus piezas…' : 'Escribe parte del nombre.'}>
          <input id="et-buscar" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} autoComplete="off" />
        </Campo>
        {halladas.length ? (
          <div className="editor-tema__piezas">
            {halladas.map((p) => (
              <button key={p.id} type="button" className="editor-tema__pieza" aria-pressed={valor.portada === p.id} onClick={() => { cambiar({ portada: p.id }); setBuscar(''); }}>
                <img src={urlPublicaFoto(p.foto_thumb_path) ?? ''} alt="" loading="lazy" />
                <span>{nombreConVariante(p.nombre, p.variante)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </fieldset>

      <div className="editor-tema__muestra" style={muestra} aria-label="Así se ve">
        <span className="editor-tema__muestra-titulo">{valor.frase || PLANTILLAS.find((p) => p.id === resuelto.plantilla)?.frase}</span>
        <span className="editor-tema__muestra-texto">Anillo Ankh · Bs y $ BCV del mismo tamaño</span>
        <span className="editor-tema__muestra-boton">Agregar</span>
      </div>
    </div>
  );
}
