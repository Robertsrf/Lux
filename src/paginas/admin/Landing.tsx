import { lazy, Suspense, useState } from 'react';
import { Cargando } from '../../componentes/Piezas';
import { SeccionesLanding } from './landing/SeccionesLanding';
import '../../estilos/panel-landing.css';

// Las ofertas y los resultados traen más código (los combos, las cifras):
// solo se bajan al abrir su pestaña.
const OfertasLanding = lazy(() => import('./landing/OfertasLanding').then((m) => ({ default: m.OfertasLanding })));
const ResultadosLanding = lazy(() => import('./landing/ResultadosLanding').then((m) => ({ default: m.ResultadosLanding })));

type Pestana = 'secciones' | 'ofertas' | 'resultados';

/**
 * Administración → Landing: lo que enseña la página de inicio del catálogo
 * (secciones, fotos, textos), sus ofertas y lo que han dado.
 */
export function Landing() {
  const [pestana, setPestana] = useState<Pestana>('secciones');

  return (
    <div className="pagina pagina--angosta pl-pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Landing</h1>
          <p>La página de inicio del catálogo: qué secciones salen, en qué orden, con qué fotos, y sus ofertas.</p>
        </div>
        <a className="boton boton--secundario" href="#/publico" target="_blank" rel="noopener noreferrer">Ver la landing</a>
      </div>

      <div className="metodos-pago pl-pestanas" role="group" aria-label="Qué ver">
        <button type="button" aria-pressed={pestana === 'secciones'} onClick={() => setPestana('secciones')}>Secciones</button>
        <button type="button" aria-pressed={pestana === 'ofertas'} onClick={() => setPestana('ofertas')}>Ofertas</button>
        <button type="button" aria-pressed={pestana === 'resultados'} onClick={() => setPestana('resultados')}>Resultados</button>
      </div>

      {pestana === 'secciones' ? <SeccionesLanding /> : null}
      <Suspense fallback={<Cargando texto="Abriendo" />}>
        {pestana === 'ofertas' ? <OfertasLanding /> : null}
        {pestana === 'resultados' ? <ResultadosLanding /> : null}
      </Suspense>
    </div>
  );
}
