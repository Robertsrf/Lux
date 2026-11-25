import { Link } from 'react-router-dom';
import { rutaDelCatalogo } from '../../../lib/direccion';
import { useLetraGrande } from '../../../hooks/useLetraGrande';
import { ElegirPara } from '../../../componentes/ElegirPara';
import type { CatalogoLux } from '../useCatalogoLux';
import { IcoBolsa, IcoLupa, IcoWhatsapp } from './iconos';

/** "Letra grande": sube un paso la letra de lo público y se recuerda en el teléfono. */
export function BotonLetra() {
  const { grande, alternar } = useLetraGrande();
  return (
    <button type="button" className="pub-icono pub-letra" aria-pressed={grande} aria-label="Letra grande" onClick={alternar}>
      A<small>A</small>
    </button>
  );
}

/**
 * La cabecera de lo público (fase 10). Arriba, pegada: LUX, WhatsApp,
 * "Letra grande" y el pedido. Debajo, el buscador con "Todas · Dama ·
 * Caballero": SIEMPRE el mismo nodo, en el inicio y en la lista, para que el
 * teléfono no cierre el teclado cuando escribir pasa del inicio a la lista.
 */
export function Cabecera({ c, conBuscador }: { c: CatalogoLux; conBuscador: boolean }) {
  const piezas = c.resumen.piezas;
  return (
    <>
      <header className="pub-cabecera">
        <div className="pub-contenedor pub-cabecera__fila">
          <Link to={rutaDelCatalogo()} className="pub-cabecera__marca" aria-label="Lux by Emory, ir al inicio del catálogo">
            <span className="pub-cabecera__lux" aria-hidden="true">LUX</span>
            <span className="pub-cabecera__by" aria-hidden="true">by Emory</span>
          </Link>
          {conBuscador ? (
            <button type="button" className="pub-icono" aria-label="Buscar una joya" onClick={() => document.getElementById('buscar-publico')?.focus()}>
              <IcoLupa />
            </button>
          ) : null}
          {c.whatsappTienda ? (
            <a className="pub-icono" href={c.whatsappTienda} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp">
              <IcoWhatsapp />
            </a>
          ) : null}
          <BotonLetra />
          {piezas > 0 ? (
            <button type="button" className="pub-icono" aria-label={`Ver mi pedido: ${piezas} joya${piezas === 1 ? '' : 's'}`} onClick={() => c.setPaso('pedido')}>
              <IcoBolsa />
              <span className="pub-bolsa__n" aria-hidden="true">{piezas}</span>
            </button>
          ) : null}
        </div>
      </header>
      {conBuscador ? (
        <div className="pub-contenedor pub-busca">
          <div className="pub-busca__campo">
            <label htmlFor="buscar-publico" className="visualmente-oculto">Buscar una joya</label>
            <IcoLupa />
            <input
              id="buscar-publico" type="search" value={c.texto} autoComplete="off"
              onChange={(e) => c.setTexto(e.target.value)}
              placeholder="Busca: cadena, anillo, corazón…"
            />
          </div>
          <ElegirPara para={c.para} alElegir={c.elegirPara} />
        </div>
      ) : null}
    </>
  );
}
