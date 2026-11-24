import { nombreDeTipo } from '../../../../lib/familias';
import { urlPublicaFoto } from '../../../../lib/fotos';
import type { CatalogoRv } from '../tipos';
import { BotonLetra, Buscador, Contacto, Escribeme, Marca, Pie } from '../piezas/Comunes';
import { Cargando, Lista, SinPiezas } from '../piezas/Lista';
import { Tarjeta } from '../piezas/Tarjeta';
import { Capas, ErrorArriba, fotoPortada, frase } from './Comun';

/** Cuántas piezas van en cada fila que se desliza. */
const POR_FILA = 8;

/**
 * LOOKBOOK: para una marca con aire de lujo. Su logo grande al centro, una
 * foto alta con su frase en una banda, y una fila por tipo que se desliza
 * de lado en el teléfono (en la computadora, una cuadrícula).
 */
export function Lookbook({ c }: { c: CatalogoRv }) {
  const foto = fotoPortada(c, '(max-width: 900px) 100vw, 640px');
  const conLogo = Boolean(urlPublicaFoto(c.perfil?.logo_path));
  const tipoPortada = c.portada?.categoria ?? null;
  return (
    <>
      <header className="rvc-lb-cabecera rvc-interior">
        <div className="rvc-lb-cabecera__acciones">
          <Escribeme c={c} />
          <BotonLetra c={c} />
        </div>
        <Marca c={c} variante="centro" />
        {conLogo ? <span className="rvc-lb-nombre" aria-hidden="true">{c.perfil?.catalogo_nombre}</span> : null}
      </header>

      {!c.enLista ? (
        <section className="rvc-lb-portada rvc-interior">
          {foto ? <img className="rvc-lb-portada__foto" src={foto.src} srcSet={foto.srcSet} sizes={foto.sizes} alt={c.portada?.nombre ?? ''} /> : null}
          <div className="rvc-lb-portada__banda">
            {tipoPortada ? <span className="rvc-lb-portada__tipo">{nombreDeTipo(tipoPortada)}</span> : null}
            <h2 className="rvc-lb-portada__frase">{frase(c)}</h2>
            {tipoPortada ? (
              <button type="button" className="rvc-boton" onClick={() => c.setCategoria(tipoPortada)}>Ver {nombreDeTipo(tipoPortada).toLowerCase()}</button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="rvc-interior rvc-lb-buscar"><Buscador c={c} conTipos /></div>

      <main className="rvc-lb-piezas">
        <div className="rvc-interior"><ErrorArriba c={c} /></div>
        {c.enLista ? <div className="rvc-interior"><Lista c={c} /></div>
          : c.cargando ? <Cargando />
          : c.familias.length === 0 ? <div className="rvc-interior"><SinPiezas c={c} /></div>
          : c.estantes.map((e) => (
            <section key={e.categoria} className="rvc-lb-estante" aria-label={nombreDeTipo(e.categoria)}>
              <div className="rvc-interior rvc-lb-estante__cabeza">
                <h2 className="rvc-titulo">{nombreDeTipo(e.categoria)}</h2>
                {e.familias.length > 4 ? (
                  <button type="button" className="rvc-enlace" onClick={() => c.setCategoria(e.categoria)}>Ver los {e.familias.length}</button>
                ) : null}
              </div>
              <div className="rvc-lb-fila" tabIndex={0} aria-label={`${nombreDeTipo(e.categoria)}: desliza para ver más`}>
                {e.familias.slice(0, POR_FILA).map((f) => <Tarjeta key={f.clave} c={c} familia={f} forma="fila" />)}
              </div>
            </section>
          ))}
        <div className="rvc-interior">
          <Contacto c={c} />
          <Pie c={c} />
        </div>
      </main>
      <Capas c={c} />
    </>
  );
}
