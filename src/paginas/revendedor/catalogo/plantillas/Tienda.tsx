import { nombreDeTipo } from '../../../../lib/familias';
import { urlPublicaFoto } from '../../../../lib/fotos';
import type { CatalogoRv } from '../tipos';
import { BotonLetra, Buscador, Contacto, Escribeme, Marca, Pie } from '../piezas/Comunes';
import { Cargando, Lista, SinPiezas } from '../piezas/Lista';
import { Tarjeta } from '../piezas/Tarjeta';
import { Capas, ErrorArriba, fotoPortada, frase } from './Comun';

const POR_ESTANTE = 4;

/**
 * TIENDA: para quien tiene mucho catálogo y clientas apuradas. El
 * buscador a la vista, los tipos en círculos con foto (en la computadora,
 * un menú al lado) y una cuadrícula con botones grandes.
 */
export function Tienda({ c }: { c: CatalogoRv }) {
  const conLogo = Boolean(urlPublicaFoto(c.perfil?.logo_path));
  const foto = fotoPortada(c, '120px');
  const tipoPortada = c.portada?.categoria ?? null;
  const tipos = (
    <nav className="rvc-ti-tipos" aria-label="Tipos de joya">
      {c.tiposConFoto.map((t) => (
        <button key={t.nombre} type="button" className="rvc-ti-tipo" aria-pressed={c.categoria === t.nombre} onClick={() => c.setCategoria(t.nombre)}>
          {t.foto
            ? <img src={t.foto.src} srcSet={t.foto.srcSet} sizes="80px" alt="" loading="lazy" />
            : <span className="rvc-ti-tipo__sin-foto" aria-hidden="true">{nombreDeTipo(t.nombre).slice(0, 1)}</span>}
          <span className="rvc-ti-tipo__nombre">{nombreDeTipo(t.nombre)}</span>
          <span className="rvc-ti-tipo__cuantas">{t.cuantas}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <>
      <header className="rvc-ti-cabecera">
        <div className="rvc-interior rvc-ti-cabecera__interior">
          <div className="rvc-ti-marca">
            <Marca c={c} variante="lado" />
            <div className="rvc-ti-marca__texto">
              {conLogo ? <span className="rvc-ti-marca__nombre" aria-hidden="true">{c.perfil?.catalogo_nombre}</span> : null}
            </div>
          </div>
          <div className="rvc-ti-cabecera__acciones">
            <BotonLetra c={c} />
            <Escribeme c={c} />
          </div>
          <Buscador c={c} conTipos={false} />
        </div>
      </header>

      {!c.enLista ? (
        <section className="rvc-interior rvc-ti-portada">
          {foto ? <img className="rvc-ti-portada__foto" src={foto.src} srcSet={foto.srcSet} sizes={foto.sizes} alt={c.portada?.nombre ?? ''} /> : null}
          <div className="rvc-ti-portada__texto">
            <h2 className="rvc-ti-portada__frase">{frase(c)}</h2>
            {tipoPortada ? (
              <button type="button" className="rvc-enlace rvc-enlace--fuerte" onClick={() => c.setCategoria(tipoPortada)}>Ver {nombreDeTipo(tipoPortada).toLowerCase()} →</button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="rvc-interior rvc-ti-cuerpo">
        {!c.enLista && c.tiposConFoto.length > 0 ? <aside className="rvc-ti-lado">{tipos}</aside> : null}
        <main className="rvc-ti-piezas">
          <ErrorArriba c={c} />
          {c.enLista ? <Lista c={c} /> : c.cargando ? <Cargando /> : c.familias.length === 0 ? <SinPiezas c={c} /> : (
            c.estantes.map((e) => (
              <section key={e.categoria} className="rvc-ti-estante" aria-label={nombreDeTipo(e.categoria)}>
                <div className="rvc-ti-estante__cabeza">
                  <h2 className="rvc-titulo">{nombreDeTipo(e.categoria)}</h2>
                  {e.familias.length > POR_ESTANTE ? (
                    <button type="button" className="rvc-enlace rvc-enlace--fuerte" onClick={() => c.setCategoria(e.categoria)}>Ver los {e.familias.length}</button>
                  ) : null}
                </div>
                <div className="rvc-rejilla">
                  {e.familias.slice(0, POR_ESTANTE).map((f) => <Tarjeta key={f.clave} c={c} familia={f} />)}
                </div>
              </section>
            ))
          )}
          <Contacto c={c} />
          <Pie c={c} />
        </main>
      </div>
      <Capas c={c} />
    </>
  );
}
