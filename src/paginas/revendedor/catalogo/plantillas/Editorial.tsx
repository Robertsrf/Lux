import { nombreDeTipo } from '../../../../lib/familias';
import type { CatalogoRv } from '../tipos';
import { BotonLetra, Buscador, Contacto, Escribeme, Marca, Pie } from '../piezas/Comunes';
import { Cargando, Lista, SinPiezas } from '../piezas/Lista';
import { Tarjeta } from '../piezas/Tarjeta';
import { Capas, ErrorArriba, fotoPortada, frase } from './Comun';

/**
 * EDITORIAL: para quien vende pocas piezas escogidas. Su logo grande al
 * centro, una foto a todo el ancho con su frase debajo, y por tipo una
 * pieza grande y dos de a lado, como una revista.
 */
export function Editorial({ c }: { c: CatalogoRv }) {
  const foto = fotoPortada(c, '(max-width: 900px) 100vw, 640px');
  const irAPiezas = () => document.getElementById('rvc-piezas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <>
      <header className="rvc-ed-cabecera">
        <div className="rvc-interior rvc-ed-cabecera__fila">
          <BotonLetra c={c} />
          <Escribeme c={c} />
        </div>
        <div className="rvc-interior"><Marca c={c} variante="centro" /></div>
      </header>

      {!c.enLista ? (
        <section className="rvc-ed-portada">
          {foto ? <img className="rvc-ed-portada__foto" src={foto.src} srcSet={foto.srcSet} sizes={foto.sizes} alt={c.portada?.nombre ?? ''} /> : null}
          <div className="rvc-interior rvc-ed-portada__texto">
            <h2 className="rvc-ed-portada__frase">{frase(c)}</h2>
            <p className="rvc-nota">Elige tus joyas, apártalas con tu cédula y págame por pago móvil.</p>
            <button type="button" className="rvc-boton" onClick={irAPiezas}>Ver todas las joyas</button>
          </div>
        </section>
      ) : null}

      <div className="rvc-interior rvc-ed-buscar">
        <Buscador c={c} conTipos={false} />
        {c.categorias.length > 1 ? (
          <nav className="rvc-ed-tipos" aria-label="Tipos de joya">
            {c.categorias.map((cat) => (
              <button key={cat} type="button" className="rvc-ed-tipo" aria-pressed={c.categoria === cat} onClick={() => c.setCategoria(cat)}>
                {nombreDeTipo(cat)}
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      <main id="rvc-piezas" className="rvc-interior rvc-ed-piezas">
        <ErrorArriba c={c} />
        {c.enLista ? <Lista c={c} /> : c.cargando ? <Cargando /> : c.familias.length === 0 ? <SinPiezas c={c} /> : (
          c.estantes.map((e) => {
            const [primera, ...resto] = e.familias;
            return (
              <section key={e.categoria} className="rvc-ed-estante" aria-label={nombreDeTipo(e.categoria)}>
                <div className="rvc-ed-estante__cabeza">
                  <h2 className="rvc-titulo">{nombreDeTipo(e.categoria)}</h2>
                  {e.familias.length > 3 ? (
                    <button type="button" className="rvc-enlace" onClick={() => c.setCategoria(e.categoria)}>Ver los {e.familias.length}</button>
                  ) : null}
                </div>
                <div className="rvc-ed-estante__piezas">
                  {primera ? <Tarjeta c={c} familia={primera} forma="grande" /> : null}
                  {resto.slice(0, 2).map((f) => <Tarjeta key={f.clave} c={c} familia={f} />)}
                </div>
              </section>
            );
          })
        )}
        <Contacto c={c} />
        <Pie c={c} />
      </main>
      <Capas c={c} />
    </>
  );
}
