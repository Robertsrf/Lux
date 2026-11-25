import { irA } from '../caras/ComoPedir';
import { idSeccion, useContextoLanding } from './contexto';

/**
 * Las tres puertas que siempre están, fijas debajo de la cabecera: Joyas,
 * Ofertas y Lo que viene. Quien entra sin saber qué hay, ve las tres sin
 * bajar. Una puerta que hoy no lleva a nada (no hay ofertas, no hay nada
 * próximo) no sale.
 */
export function Puertas() {
  const c = useContextoLanding();
  return (
    <nav className="lp-puertas" aria-label="Por dónde seguir">
      <button type="button" className="lp-puerta lp-puerta--principal" onClick={c.irATodas}>Todas las joyas</button>
      {c.idOfertas ? (
        <button type="button" className="lp-puerta" onClick={() => irA(c.idOfertas!)}>Ofertas</button>
      ) : null}
      {c.hayProximas ? (
        <button type="button" className="lp-puerta" onClick={() => irA(idSeccion('proximamente'))}>Lo que viene</button>
      ) : null}
    </nav>
  );
}
