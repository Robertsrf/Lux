import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { fuenteFoto } from '../../../lib/fotos';
import { cuadroDe, nombreConVariante, nombreDeTipo } from '../../../lib/familias';
import type { Familia } from '../../../lib/familias';
import { formatearBcv, formatearBs } from '../../../lib/dinero';
import { direcciones, rutaDelCatalogo } from '../../../lib/direccion';
import { urlTienda } from '../../../lib/dominio';
import { enlaceCompartirPieza, rutaDePieza, textoParaCompartir } from '../../../lib/pieza';
import type { FotoAmpliada } from '../../../componentes/VisorFoto';
import type { ModeloProximo, ModeloPublico } from '../../../lib/tipos';
import type { CatalogoLux } from '../useCatalogoLux';
import { IcoCompartir, IcoMas, IcoMenos, IcoVolver } from './iconos';

type Pieza = ModeloPublico | ModeloProximo;

/** La ficha del visor a pantalla completa (el zoom), hecha de la familia. */
function fichaDe(f: Familia<Pieza>, materiales: string | null, proxima: boolean): FotoAmpliada {
  const portada = f.variantes.find((v) => v.foto_path || v.foto_thumb_path) ?? f.cabeza;
  return {
    clave: f.clave,
    nombre: f.cabeza.nombre,
    categoria: f.cabeza.categoria,
    materiales,
    variantes: f.variantes.map((v) => ({
      id: v.id,
      etiqueta: v.variante,
      path: v.foto_path ?? portada.foto_path ?? null,
      thumbPath: v.foto_thumb_path ?? portada.foto_thumb_path ?? null,
      bs: v.precio_bs,
      bcv: v.precio_usd,
      ...(!proxima ? { quedan: (v as ModeloPublico).disponible } : {}),
      nota: proxima ? 'Próximamente: todavía no se puede pedir' : v.variantes_nota,
    })),
  };
}

/**
 * La página de una pieza (fase 10, `?pieza=<id>`): las fotos que se deslizan,
 * el nombre, el precio de la medida elegida, sus medidas, "Agregar" (que pasa
 * a contador), "Agrégale un dije" en las bases y "Compártela por WhatsApp".
 * Lo que viene en camino sale igual, sin agregar. Mientras está abierta cuenta
 * las miradas (`useMiradas`), como antes el visor.
 */
export function PaginaPieza({ c, alAmpliar }: { c: CatalogoLux; alAmpliar: (ficha: FotoAmpliada, proxima: boolean) => void }) {
  const estado = c.piezaCargada;
  const titulo = useRef<HTMLHeadingElement>(null);
  const familia = estado && (estado.estado === 'venta' || estado.estado === 'proxima') ? (estado.familia as Familia<Pieza>) : null;
  const proxima = estado?.estado === 'proxima';
  const [elegida, setElegida] = useState<number | null>(null);
  const sel = familia ? (familia.variantes.find((v) => v.id === (elegida ?? (estado as { abierta: number }).abierta)) ?? familia.cabeza) : null;
  const { abrir: mirar, cerrar: dejarDeMirar } = c.miradas;
  const fila = useRef<HTMLDivElement>(null);

  // Las fotos, sin repetir: la de cada medida que tenga la suya.
  const fotos = useMemo(() => {
    if (!familia) return [];
    const vistas = new Set<string>();
    const salida: { id: number; foto: ReturnType<typeof fuenteFoto> }[] = [];
    for (const v of familia.variantes) {
      const clave = v.foto_path ?? v.foto_thumb_path;
      if (!clave || vistas.has(clave)) continue;
      vistas.add(clave);
      salida.push({ id: v.id, foto: fuenteFoto(v.foto_path, v.foto_thumb_path, '(max-width: 900px) 100vw, 560px') });
    }
    return salida;
  }, [familia]);
  const grupos = useMemo(() => (familia ? cuadroDe(familia.variantes.map((v) => v.variante ?? v.sku)) : null), [familia]);

  useEffect(() => { titulo.current?.focus({ preventScroll: true }); }, [familia?.clave]);
  useEffect(() => { setElegida(null); }, [c.pieza]);
  // Las miradas: solo de lo que se vende, por medida.
  useEffect(() => {
    if (!sel || proxima) return;
    mirar(sel.id);
    return () => dejarDeMirar();
  }, [sel?.id, proxima, mirar, dejarDeMirar]);

  // Al elegir una medida con foto propia, la fila va a esa foto.
  function elegir(id: number) {
    setElegida(id);
    const i = fotos.findIndex((f) => f.id === id);
    const caja = fila.current;
    if (i >= 0 && caja) caja.scrollTo({ left: caja.clientWidth * i, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  const volver = (
    <button type="button" className="pub-enlace pub-volver" onClick={c.cerrarPieza}>
      <IcoVolver /> Volver al catálogo
    </button>
  );

  if (!estado || estado.estado === 'cargando') {
    return <div className="pub-contenedor pub-pieza" role="status" aria-busy="true">{volver}<p className="pub-secundario">Trayendo la joya…</p></div>;
  }
  if (!familia || !sel) {
    return (
      <div className="pub-contenedor pub-pieza pub-pieza--vacia">
        {volver}
        <h1 className="pub-titulo pub-titulo--medio" ref={titulo} tabIndex={-1}>
          {estado.estado === 'error' ? 'No pudimos traer esta joya' : 'Esta joya ya no está disponible'}
        </h1>
        <p className="pub-prosa">{estado.estado === 'error' ? 'Revisa tu conexión y vuelve a intentarlo.' : 'Se vendió o ya no está en el catálogo. Mira las demás: seguro hay otra que te encanta.'}</p>
        <button type="button" className="pub-boton" onClick={c.cerrarPieza}>Ver el catálogo</button>
      </div>
    );
  }

  const unica = familia.variantes.length === 1;
  const nombre = unica ? nombreConVariante(sel.nombre, sel.variante) : sel.nombre;
  // Lo que se vende trae lo libre y su clave de tienda; lo que viene, no.
  const venta = proxima ? null : (sel as ModeloPublico);
  const disponible = venta?.disponible ?? 0;
  const llevas = c.seleccion.get(sel.id) ?? 0;
  const agotada = !proxima && llevas >= disponible;
  const url = urlTienda(direcciones(), rutaDePieza(rutaDelCatalogo(), sel.id, c.para));
  const compartir = (e: MouseEvent<HTMLAnchorElement>) => {
    if (typeof navigator.share !== 'function') return;
    e.preventDefault();
    void navigator.share({ title: nombre, text: textoParaCompartir(nombre, url) }).catch(() => undefined);
  };
  const ubicacion = venta?.ubicaciones_codigo ?? null;
  const esBase = venta?.armado === 'base';
  const ampliar = () => alAmpliar(fichaDe(familia, c.textos.materiales_largo ?? null, proxima), proxima);

  return (
    <article className="pub-pieza">
      <div className="pub-contenedor">{volver}</div>
      <div className="pub-pieza__rejilla">
        <div className="pub-pieza__fotos">
          <div className="pub-pieza__fila" ref={fila}>
            {fotos.length > 0 ? fotos.map((f, i) => (
              <button key={f.id} type="button" className="pub-pieza__foto" onClick={ampliar} aria-label={`Ver de cerca ${nombre}${fotos.length > 1 ? `, foto ${i + 1} de ${fotos.length}` : ''}`}>
                {f.foto ? <img {...f.foto} alt="" className={i === 0 ? 'pub-pieza__primera' : undefined} /> : null}
              </button>
            )) : <span className="pub-pieza__foto" />}
          </div>
          {fotos.length > 1 ? <p className="pub-pieza__cuenta pub-secundario">{fotos.length} fotos · desliza para verlas</p> : null}
        </div>

        <div className="pub-contenedor pub-pieza__info">
          <p className="pub-etiqueta">{nombreDeTipo(sel.categoria)}{proxima ? ' · Próximamente' : ''}</p>
          <h1 className="pub-titulo pub-titulo--grande pub-pieza__nombre" ref={titulo} tabIndex={-1}>{sel.nombre}</h1>
          <p className="pub-pieza__precio">
            <span className="pub-precio">{formatearBs(sel.precio_bs)}</span>
            <span className="pub-precio pub-secundario">{formatearBcv(sel.precio_usd)}</span>
          </p>

          {!unica ? (
            <div className="pub-pieza__medidas">
              {(grupos ?? [{ nombre: 'Medida', opciones: familia.variantes.map((v, indice) => ({ indice, corta: v.variante ?? v.sku })) }]).map((g) => (
                <fieldset key={g.nombre} className="pub-pieza__grupo">
                  <legend className="pub-pieza__leyenda">{grupos ? g.nombre : 'Elige la medida'}</legend>
                  <div className="pub-pieza__opciones">
                    {g.opciones.map((o) => {
                      const v = familia.variantes[o.indice]!;
                      const sinPiezas = !proxima && (v as ModeloPublico).disponible <= 0;
                      return (
                        <button key={v.id} type="button" className="pub-ficha" aria-pressed={v.id === sel.id} onClick={() => elegir(v.id)} disabled={sinPiezas}>
                          {o.corta}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}

          {proxima ? (
            <p className="pub-pieza__aviso">Viene en camino. Todavía no se puede pedir: cuando llegue, sale en el catálogo con su botón para agregar.</p>
          ) : llevas > 0 ? (
            <div className="pub-pieza__acciones">
              <div className="pub-contador pub-contador--grande">
                <button type="button" className="pub-icono" aria-label={`Quitar una de ${nombre}`} onClick={() => c.cambiar(sel.id, llevas - 1)}><IcoMenos /></button>
                <span className="pub-contador__n" aria-live="polite">{llevas} en tu pedido</span>
                <button type="button" className="pub-icono" aria-label={`Agregar otra de ${nombre}`} disabled={agotada} onClick={() => c.cambiar(sel.id, llevas + 1)}><IcoMas /></button>
              </div>
              <button type="button" className="pub-boton pub-boton--claro" onClick={() => c.setPaso('pedido')}>Ver mi pedido</button>
            </div>
          ) : (
            <div className="pub-pieza__acciones">
              <button type="button" className="pub-boton pub-boton--ancho" disabled={agotada} onClick={() => c.agregarPorId(sel.id)}>
                {agotada ? 'Agotada por ahora' : 'Agregar a mi pedido'}
              </button>
            </div>
          )}
          {!proxima && disponible > 0 ? <p className="pub-secundario pub-pieza__quedan">{disponible === 1 ? 'Última pieza' : `Quedan ${disponible}`}</p> : null}
          {/* Lo que falla aquí (traer los dijes, armar uno) se dice aquí: el catálogo está escondido. */}
          {c.error ? <p className="pub-pieza__error" role="alert">{c.error}</p> : null}
          {esBase ? (
            <button type="button" className="pub-boton pub-boton--claro pub-boton--ancho" onClick={() => void c.abrirArmar(sel.id)}>Agrégale un dije</button>
          ) : null}

          <dl className="pub-pieza__datos">
            {sel.variantes_nota ? <><dt>Nota</dt><dd>{sel.variantes_nota}</dd></> : null}
            {ubicacion ? <><dt>En tienda</dt><dd>{ubicacion}</dd></> : null}
          </dl>
          {c.textos.materiales_largo ? <p className="pub-prosa pub-pieza__materiales">{c.textos.materiales_largo}</p> : null}

          <a className="pub-boton pub-boton--claro pub-pieza__compartir" href={enlaceCompartirPieza(nombre, url)} target="_blank" rel="noopener noreferrer" onClick={compartir}>
            <IcoCompartir /> Compártela por WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}
