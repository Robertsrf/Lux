import { useId, useState } from 'react';
import { Campo } from '../../../componentes/Piezas';
import { mensajeDeError } from '../../../lib/supabase';
import { rutaDeLanding, subirArchivoLanding } from '../../../lib/fotos';
import { useCategorias } from '../../../hooks/useCatalogos';
import type { BotonLanding } from '../../../hooks/useLanding';
import { TIPOS_LANDING, TODOS_LOS_TIPOS } from './tiposLanding';

/**
 * Una foto (o un video) de la landing: se sube, se ve y se quita. Cada foto
 * enseña cómo se verá con su velo, el degradado que la landing le pone para
 * que el texto se lea, y pide un texto alternativo: lo que se ve, para quien
 * no puede verla.
 */
export function CampoFoto({ etiqueta, valor, alt, alAlt, alCambiar, tipo = 'foto', conAlt = true, pista }: {
  etiqueta: string;
  valor: string | null | undefined;
  alt?: string | null;
  alAlt?: (texto: string) => void;
  alCambiar: (ruta: string | null) => void;
  tipo?: 'foto' | 'video';
  conAlt?: boolean;
  pista?: string;
}) {
  const id = useId();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const direccion = rutaDeLanding(valor);

  async function elegido(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    try {
      alCambiar(await subirArchivoLanding(archivo, tipo));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="pl-foto">
      <Campo etiqueta={etiqueta} htmlFor={id} pista={pista} error={error}>
        <input
          id={id}
          type="file"
          accept={tipo === 'foto' ? 'image/*' : 'video/mp4'}
          disabled={subiendo}
          onChange={(e) => { void elegido(e.target.files?.[0]); e.target.value = ''; }}
        />
      </Campo>
      {subiendo ? <p className="campo__pista" role="status">Subiendo</p> : null}
      {direccion ? (
        <>
          <div className="pl-vista">
            {tipo === 'foto' ? (
              <img src={direccion} alt={alt ?? ''} loading="lazy" />
            ) : (
              <video src={direccion} muted playsInline preload="metadata" controls />
            )}
            {tipo === 'foto' ? <div className="pl-vista__velo" aria-hidden="true" /> : null}
          </div>
          <p className="campo__pista">
            {tipo === 'foto' ? 'Así se ve con su velo (el degradado que le da la landing).' : 'Así se ve el video.'}
          </p>
          <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => alCambiar(null)}>
            Quitar {tipo === 'foto' ? 'la foto' : 'el video'}
          </button>
        </>
      ) : null}
      {conAlt && tipo === 'foto' && direccion && alAlt ? (
        <Campo etiqueta="Texto alternativo" htmlFor={`${id}-alt`} pista="Qué se ve en la foto, en una frase. Lo lee el lector de pantalla y sale si la foto no carga.">
          <input id={`${id}-alt`} type="text" value={alt ?? ''} maxLength={200} onChange={(e) => alAlt(e.target.value)} />
        </Campo>
      ) : null}
    </div>
  );
}

const DESTINOS_FIJOS: [string, string][] = [
  ['todas', 'Todas las joyas'],
  ['ofertas', 'Las ofertas'],
  ['proximamente', 'Lo que viene'],
  ['whatsapp', 'WhatsApp de la tienda'],
];

function partesDeDestino(destino: string): { clase: string; resto: string } {
  if (destino.startsWith('tipo:')) return { clase: 'tipo', resto: destino.slice(5) };
  if (destino.startsWith('seccion:')) return { clase: 'seccion', resto: destino.slice(8) };
  return { clase: destino, resto: '' };
}

/** Un botón: su texto y a dónde lleva (una palabra de la lista, nunca una dirección). */
export function CampoBoton({ etiqueta, valor, alCambiar }: {
  etiqueta: string;
  valor: BotonLanding | null | undefined;
  alCambiar: (b: BotonLanding | null) => void;
}) {
  const id = useId();
  const categorias = useCategorias();
  const texto = valor?.texto ?? '';
  const destino = valor?.destino ?? '';
  const { clase, resto } = partesDeDestino(destino);

  function poner(t: string, d: string) {
    alCambiar(t === '' && d === '' ? null : { texto: t, destino: d });
  }
  function cambiarClase(nueva: string) {
    if (nueva === 'tipo') poner(texto, `tipo:${categorias[0] ?? ''}`);
    else if (nueva === 'seccion') poner(texto, `seccion:${TODOS_LOS_TIPOS[0]}`);
    else poner(texto, nueva);
  }

  return (
    <fieldset className="pl-boton">
      <legend>{etiqueta}</legend>
      <div className="rejilla rejilla--2">
        <Campo etiqueta="Lo que dice el botón" htmlFor={`${id}-t`} pista="Vacío, no sale botón.">
          <input id={`${id}-t`} type="text" value={texto} maxLength={60} onChange={(e) => poner(e.target.value, destino)} />
        </Campo>
        <Campo etiqueta="A dónde lleva" htmlFor={`${id}-d`}>
          <select id={`${id}-d`} value={clase} onChange={(e) => cambiarClase(e.target.value)}>
            <option value="">Elige…</option>
            {DESTINOS_FIJOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            <option value="tipo">Un tipo de joya</option>
            <option value="seccion">Una sección de la landing</option>
          </select>
        </Campo>
      </div>
      {clase === 'tipo' ? (
        <Campo etiqueta="Qué tipo" htmlFor={`${id}-tipo`}>
          <select id={`${id}-tipo`} value={resto} onChange={(e) => poner(texto, `tipo:${e.target.value}`)}>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
      ) : null}
      {clase === 'seccion' ? (
        <Campo etiqueta="Qué sección" htmlFor={`${id}-sec`}>
          <select id={`${id}-sec`} value={resto} onChange={(e) => poner(texto, `seccion:${e.target.value}`)}>
            {TODOS_LOS_TIPOS.map((t) => <option key={t} value={t}>{TIPOS_LANDING[t].nombre}</option>)}
          </select>
        </Campo>
      ) : null}
    </fieldset>
  );
}

/** Subir, bajar y quitar un elemento de una lista. */
export function AccionesDeLista({ i, total, alMover, alQuitar }: {
  i: number; total: number; alMover: (delta: -1 | 1) => void; alQuitar: () => void;
}) {
  return (
    <div className="grupo-botones">
      <button type="button" className="boton boton--secundario boton--pequeno" disabled={i === 0} onClick={() => alMover(-1)}>Subir</button>
      <button type="button" className="boton boton--secundario boton--pequeno" disabled={i === total - 1} onClick={() => alMover(1)}>Bajar</button>
      <button type="button" className="boton boton--peligro boton--pequeno" onClick={alQuitar}>Quitar</button>
    </div>
  );
}
