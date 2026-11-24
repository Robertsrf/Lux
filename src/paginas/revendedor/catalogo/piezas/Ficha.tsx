import { useEffect, useMemo, useState } from 'react';
import { formatearBcv, formatearBs } from '../../../../lib/dinero';
import { fuenteFoto, urlPublicaFoto } from '../../../../lib/fotos';
import { conFoto, cuadroDe, nombreConVariante, nombreDeTipo } from '../../../../lib/familias';
import type { ModeloRevendedor } from '../../../../lib/tipos';
import type { CatalogoRv } from '../tipos';
import { Dialogo } from './Dialogo';
import { PieLux } from './Comunes';

/**
 * La ficha de una pieza: la foto grande, sus medidas, "Agregar" y, en una
 * cadena o pulsera para armar, "Agrégale un dije" con los dijes de su
 * catálogo en la misma hoja. Pasa a la pieza de al lado sin cerrarse.
 * Su clave de bodega no sale: es de la tienda.
 */
export function Ficha({ c }: { c: CatalogoRv }) {
  const f = c.fichaAbierta;
  const [elegidaId, setElegidaId] = useState<number | null>(null);
  const [conDijes, setConDijes] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Al cambiar de pieza: la primera medida que quede, sin dijes ni aviso.
  useEffect(() => {
    if (!f) return;
    setElegidaId((f.variantes.find((v) => v.disponible > 0) ?? f.variantes[0])?.id ?? null);
    setConDijes(false);
    setAviso(null);
  }, [f]);

  const grupos = useMemo(() => (f ? cuadroDe(f.variantes.map((v) => v.variante ?? v.sku)) : null), [f]);
  const indice = f ? c.familias.findIndex((x) => x.clave === f.clave) : -1;

  if (!f) return <Dialogo abierto={false} alCerrar={c.cerrarFicha} titulo="Pieza">{null}</Dialogo>;

  const elegida: ModeloRevendedor = f.variantes.find((v) => v.id === elegidaId) ?? f.cabeza;
  const fotoDe = elegida.foto_path || elegida.foto_thumb_path ? elegida : conFoto(f.variantes);
  const foto = fotoDe ? fuenteFoto(fotoDe.foto_path, fotoDe.foto_thumb_path, '(max-width: 640px) 100vw, 560px') : null;
  const llevas = c.llevas(elegida.id);
  const quedan = c.disponible(elegida.id);
  const anterior = indice > 0 ? c.familias[indice - 1] : undefined;
  const siguiente = indice >= 0 && indice < c.familias.length - 1 ? c.familias[indice + 1] : undefined;

  const opcion = (v: ModeloRevendedor, texto: string) => (
    <button
      key={v.id} type="button" className="rvc-ficha" aria-pressed={v.id === elegida.id}
      onClick={() => { setElegidaId(v.id); setAviso(null); }}
    >
      {texto}
    </button>
  );

  async function abrirDijes() {
    setConDijes(true);
    await c.cargarDijes();
  }

  function ponerDije(dije: ModeloRevendedor) {
    const problema = c.armarCon(elegida.id, dije.id);
    setAviso(problema ?? `Listo: ${nombreConVariante(dije.nombre, dije.variante)} va puesto en tu ${f!.cabeza.nombre.toLowerCase()}.`);
  }

  return (
    <Dialogo abierto alCerrar={c.cerrarFicha} titulo={f.cabeza.nombre} clase="rvc-dialogo--ficha">
      <div className="rvc-ficha-pieza">
        <div className="rvc-ficha-pieza__barra">
          <button type="button" className="rvc-boton rvc-boton--claro rvc-boton--chico" onClick={c.cerrarFicha}>Cerrar</button>
          <span className="rvc-ficha-pieza__pasar">
            <button type="button" className="rvc-boton rvc-boton--claro rvc-boton--chico" disabled={!anterior} onClick={() => anterior && c.abrirFicha(anterior.clave)}>
              <span aria-hidden="true">‹</span><span className="rvc-oculto">Pieza anterior</span>
            </button>
            <button type="button" className="rvc-boton rvc-boton--claro rvc-boton--chico" disabled={!siguiente} onClick={() => siguiente && c.abrirFicha(siguiente.clave)}>
              <span aria-hidden="true">›</span><span className="rvc-oculto">Pieza siguiente</span>
            </button>
          </span>
        </div>

        <div className="rvc-ficha-pieza__foto">
          {foto ? <img src={foto.src} srcSet={foto.srcSet} sizes={foto.sizes} alt={f.cabeza.nombre} /> : <span className="rvc-tarjeta__sin-foto" aria-hidden="true">{f.cabeza.nombre.slice(0, 1)}</span>}
        </div>

        <div className="rvc-ficha-pieza__datos">
          <span className="rvc-ficha-pieza__tipo">{nombreDeTipo(f.cabeza.categoria)}</span>
          <h2 className="rvc-titulo">{f.cabeza.nombre}</h2>
          <p className="rvc-precio rvc-precio--grande">
            <span className="rvc-precio__cifra">{formatearBs(elegida.precio_bs)}</span>
            <span className="rvc-precio__cifra">{formatearBcv(elegida.precio_usd)}</span>
          </p>

          {f.variantes.length > 1 ? (
            <div className="rvc-medidas">
              <span className="rvc-etiqueta">Elige la medida</span>
              {grupos ? grupos.map((g) => (
                <div key={g.nombre} className="rvc-medidas__grupo">
                  <span className="rvc-medidas__nombre">{g.nombre}</span>
                  <div className="rvc-fichas">
                    {g.opciones.map((o) => { const v = f.variantes[o.indice]; return v ? opcion(v, o.corta) : null; })}
                  </div>
                </div>
              )) : <div className="rvc-fichas">{f.variantes.map((v) => opcion(v, v.variante ?? v.sku))}</div>}
            </div>
          ) : null}

          {elegida.variantes_nota ? <p className="rvc-nota">{elegida.variantes_nota}</p> : null}
          <p className="rvc-nota">{quedan === 1 ? 'Queda 1' : `Quedan ${quedan}`}{llevas ? ` · llevas ${llevas}` : ''}</p>

          <div className="rvc-ficha-pieza__acciones">
            <button type="button" className="rvc-boton rvc-boton--ancho" disabled={llevas >= quedan} onClick={() => c.agregar(elegida.id)}>
              {llevas >= quedan ? 'Ya están todas en tu pedido' : llevas ? 'Agregar otra' : 'Agregar a mi pedido'}
            </button>
            {c.esBase(elegida.id) && !conDijes ? (
              <button type="button" className="rvc-boton rvc-boton--claro rvc-boton--ancho" onClick={() => void abrirDijes()}>Agrégale un dije</button>
            ) : null}
          </div>

          {aviso ? <p className="rvc-aviso" role="status">{aviso}</p> : null}

          {conDijes ? (
            <section className="rvc-dijes" aria-label="Dijes para esta pieza">
              <h3 className="rvc-etiqueta">Elige un dije: va puesto en esta pieza</h3>
              {c.dijes === null ? <p className="rvc-nota">Trayendo los dijes…</p>
                : c.dijes.length === 0 ? <p className="rvc-nota">Por ahora no hay dijes.</p>
                : (
                  <ul className="rvc-dijes__lista">
                    {c.dijes.map((d) => {
                      const mini = urlPublicaFoto(d.foto_thumb_path);
                      return (
                        <li key={d.id} className="rvc-dije">
                          {mini ? <img src={mini} alt="" loading="lazy" /> : <span className="rvc-dije__sin-foto" aria-hidden="true" />}
                          <span className="rvc-dije__nombre">{nombreConVariante(d.nombre, d.variante)}<br /><span className="rvc-nota">{formatearBs(d.precio_bs)} · {formatearBcv(d.precio_usd)}</span></span>
                          <button type="button" className="rvc-boton rvc-boton--chico" disabled={c.llevas(d.id) >= d.disponible} onClick={() => ponerDije(d)}>
                            Poner<span className="rvc-oculto"> {d.nombre}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
            </section>
          ) : null}

          <PieLux />
        </div>
      </div>
    </Dialogo>
  );
}
