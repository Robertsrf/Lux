import { useState } from 'react';
import { Aviso, Campo } from '../../../componentes/Piezas';
import { supabase, mensajeDeError } from '../../../lib/supabase';
import type { DatosLanding, ElementoLanding, TipoSeccion } from '../../../hooks/useLanding';
import { AccionesDeLista, CampoBoton, CampoFoto } from './CamposLanding';
import { TIPOS_LANDING, camposDe } from './tiposLanding';

export interface FilaSeccion {
  id: number;
  tipo: TipoSeccion;
  orden: number;
  visible: boolean;
  titulo: string | null;
  texto: string | null;
  datos: DatosLanding;
  se_repite: boolean;
}

const ICONOS: [string, string][] = [['', 'Sin icono'], ['acero', 'Acero'], ['oro', 'Oro'], ['sello', 'Sello']];

const vacio = (v: string | null | undefined) => (v ?? '').trim() === '';

const CLAVES_TEXTO = ['foto', 'poster', 'video', 'frase', 'titulo', 'texto', 'alt', 'icono'] as const;

/** Lo que se manda a la base: lo vacío, null. */
function limpiarElemento(e: ElementoLanding): ElementoLanding {
  const sal: ElementoLanding = { ...e };
  for (const clave of CLAVES_TEXTO) {
    if (vacio(sal[clave])) sal[clave] = null;
  }
  if (sal.boton && vacio(sal.boton.texto) && vacio(sal.boton.destino)) sal.boton = null;
  return sal;
}

function estaVacio(e: ElementoLanding): boolean {
  return (['foto', 'poster', 'video', 'frase', 'titulo', 'texto'] as const).every((k) => vacio(e[k]));
}

/** Un botón a medias (texto sin destino, o al revés) se dice antes de guardar. */
function botonesIncompletos(datos: DatosLanding): string | null {
  const todos: ElementoLanding[] = [datos, ...(datos.diapositivas ?? []), ...(datos.tarjetas ?? [])];
  for (const e of todos) {
    const b = e.boton;
    if (!b) continue;
    if (vacio(b.texto) !== vacio(b.destino)) {
      return vacio(b.destino)
        ? `El botón «${b.texto}» no dice a dónde lleva: elige su destino.`
        : 'Un botón tiene destino pero no tiene texto: escribe lo que dice o quítale el destino.';
    }
  }
  return null;
}

function mover<T>(lista: T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  return copia;
}

type ClaveLista = 'diapositivas' | 'tarjetas';

/**
 * El formulario de una sección: título, texto y lo que pide su tipo. Manda
 * SIEMPRE los valores completos: la base pone en null lo que no llega.
 */
export function FormularioSeccion({ fila, alGuardar, alCerrar }: {
  fila: FilaSeccion;
  alGuardar: () => void;
  alCerrar: () => void;
}) {
  const [titulo, setTitulo] = useState(fila.titulo ?? '');
  const [texto, setTexto] = useState(fila.texto ?? '');
  const [datos, setDatos] = useState<DatosLanding>(fila.datos);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campos = camposDe(fila.tipo);
  const info = TIPOS_LANDING[fila.tipo];

  const ponerDato = (cambio: Partial<DatosLanding>) => setDatos((d) => ({ ...d, ...cambio }));
  const lista = (clave: ClaveLista): ElementoLanding[] => datos[clave] ?? [];
  const cambiarLista = (clave: ClaveLista, nueva: ElementoLanding[]) => ponerDato({ [clave]: nueva });
  const cambiarElemento = (clave: ClaveLista, i: number, cambio: Partial<ElementoLanding>) =>
    cambiarLista(clave, lista(clave).map((e, k) => (k === i ? { ...e, ...cambio } : e)));
  const agregarElemento = (clave: ClaveLista) => cambiarLista(clave, [...lista(clave), {}]);

  async function guardar() {
    setError(null);
    let final: DatosLanding = { ...datos };
    if (campos === 'foto-boton' || campos === 'video') final = { ...final, ...limpiarElemento(datos) };
    if (final.diapositivas) final.diapositivas = final.diapositivas.map(limpiarElemento).filter((e) => !estaVacio(e));
    if (final.tarjetas) final.tarjetas = final.tarjetas.map(limpiarElemento).filter((e) => !estaVacio(e));
    const incompleto = botonesIncompletos(final);
    if (incompleto) { setError(incompleto); return; }

    setGuardando(true);
    const { error: err } = await supabase.rpc('admin_guardar_seccion', {
      p_id: fila.id,
      p_tipo: fila.tipo,
      p_titulo: titulo.trim() || null,
      p_texto: texto.trim() || null,
      p_datos: final,
      p_visible: fila.visible,
    });
    setGuardando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    alGuardar();
  }

  return (
    <div className="tarjeta pl-formulario">
      <h2>{info.nombre}</h2>
      <p className="campo__pista">{info.ayuda}</p>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}

      <Campo etiqueta="Título" htmlFor={`s-titulo-${fila.id}`} pista="Vacío, la sección sale sin título (o con el de siempre, si lo tiene).">
        <input id={`s-titulo-${fila.id}`} type="text" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
      </Campo>
      <Campo etiqueta="Texto" htmlFor={`s-texto-${fila.id}`}>
        <textarea id={`s-texto-${fila.id}`} rows={4} value={texto} maxLength={1200} onChange={(e) => setTexto(e.target.value)} />
      </Campo>

      {campos === 'foto-boton' ? (
        <>
          <CampoFoto
            etiqueta="Foto" valor={datos.foto} alt={datos.alt}
            alCambiar={(r) => ponerDato({ foto: r })} alAlt={(t) => ponerDato({ alt: t })}
          />
          <CampoBoton etiqueta="Botón" valor={datos.boton} alCambiar={(b) => ponerDato({ boton: b })} />
        </>
      ) : null}

      {campos === 'video' ? (
        <>
          <CampoFoto
            etiqueta="Video (mp4, hasta 20 MB)" tipo="video" valor={datos.video}
            alCambiar={(r) => ponerDato({ video: r })}
            pista="Corto y sin sonido: la landing lo pone en bucle."
          />
          <CampoFoto
            etiqueta="Póster (la foto que se ve antes del video)" valor={datos.poster} alt={datos.alt}
            alCambiar={(r) => ponerDato({ poster: r })} alAlt={(t) => ponerDato({ alt: t })}
          />
          <p className="campo__pista">
            Con el video y su póster subidos, enciende la sección en la lista: una sección vacía no sale.
          </p>
        </>
      ) : null}

      {campos === 'diapositivas-portada' || campos === 'diapositivas-galeria' ? (
        <section className="pl-lista" aria-label="Diapositivas">
          <h3>{campos === 'diapositivas-portada' ? 'Diapositivas' : 'Fotos de la galería'}</h3>
          {lista('diapositivas').map((d, i, todas) => (
            <div className="pl-elemento" key={i}>
              <div className="pl-elemento__cabeza">
                <strong>{campos === 'diapositivas-portada' ? `Diapositiva ${i + 1}` : `Foto ${i + 1}`}</strong>
                <AccionesDeLista
                  i={i} total={todas.length}
                  alMover={(delta) => cambiarLista('diapositivas', mover(todas, i, delta))}
                  alQuitar={() => cambiarLista('diapositivas', todas.filter((_, k) => k !== i))}
                />
              </div>
              <CampoFoto
                etiqueta="Foto" valor={d.foto} alt={d.alt}
                alCambiar={(r) => cambiarElemento('diapositivas', i, { foto: r })}
                alAlt={(t) => cambiarElemento('diapositivas', i, { alt: t })}
              />
              {campos === 'diapositivas-portada' ? (
                <>
                  <Campo etiqueta="Frase" htmlFor={`d-frase-${i}`}>
                    <input id={`d-frase-${i}`} type="text" value={d.frase ?? ''} maxLength={140} onChange={(e) => cambiarElemento('diapositivas', i, { frase: e.target.value })} />
                  </Campo>
                  <Campo etiqueta="Texto corto" htmlFor={`d-texto-${i}`}>
                    <textarea id={`d-texto-${i}`} rows={2} value={d.texto ?? ''} maxLength={300} onChange={(e) => cambiarElemento('diapositivas', i, { texto: e.target.value })} />
                  </Campo>
                  <CampoBoton etiqueta="Botón" valor={d.boton} alCambiar={(b) => cambiarElemento('diapositivas', i, { boton: b })} />
                </>
              ) : null}
            </div>
          ))}
          <button type="button" className="boton boton--secundario" onClick={() => agregarElemento('diapositivas')}>
            {campos === 'diapositivas-portada' ? 'Agregar una diapositiva' : 'Agregar una foto'}
          </button>
        </section>
      ) : null}

      {campos === 'tarjetas' ? (
        <section className="pl-lista" aria-label="Tarjetas">
          <h3>Tarjetas</h3>
          {lista('tarjetas').map((t, i, todas) => (
            <div className="pl-elemento" key={i}>
              <div className="pl-elemento__cabeza">
                <strong>Tarjeta {i + 1}</strong>
                <AccionesDeLista
                  i={i} total={todas.length}
                  alMover={(delta) => cambiarLista('tarjetas', mover(todas, i, delta))}
                  alQuitar={() => cambiarLista('tarjetas', todas.filter((_, k) => k !== i))}
                />
              </div>
              <Campo etiqueta="Título" htmlFor={`t-titulo-${i}`}>
                <input id={`t-titulo-${i}`} type="text" value={t.titulo ?? ''} maxLength={80} onChange={(e) => cambiarElemento('tarjetas', i, { titulo: e.target.value })} />
              </Campo>
              <Campo etiqueta="Texto" htmlFor={`t-texto-${i}`}>
                <textarea id={`t-texto-${i}`} rows={3} value={t.texto ?? ''} maxLength={400} onChange={(e) => cambiarElemento('tarjetas', i, { texto: e.target.value })} />
              </Campo>
              <Campo etiqueta="Icono" htmlFor={`t-icono-${i}`}>
                <select id={`t-icono-${i}`} value={t.icono ?? ''} onChange={(e) => cambiarElemento('tarjetas', i, { icono: e.target.value })}>
                  {ICONOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </Campo>
              <CampoFoto
                etiqueta="Foto" valor={t.foto} alt={t.alt}
                alCambiar={(r) => cambiarElemento('tarjetas', i, { foto: r })}
                alAlt={(x) => cambiarElemento('tarjetas', i, { alt: x })}
              />
            </div>
          ))}
          <button type="button" className="boton boton--secundario" onClick={() => agregarElemento('tarjetas')}>Agregar una tarjeta</button>
        </section>
      ) : null}

      <div className="acciones">
        <button type="button" className="boton" disabled={guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando' : 'Guardar'}
        </button>
        <button type="button" className="boton boton--secundario" disabled={guardando} onClick={alCerrar}>Cancelar</button>
      </div>
    </div>
  );
}
