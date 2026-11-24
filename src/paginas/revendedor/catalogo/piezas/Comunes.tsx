import { urlPublicaFoto } from '../../../../lib/fotos';
import { nombreDeTipo } from '../../../../lib/familias';
import type { CatalogoRv } from '../tipos';

/*
  Las piezas pequeñas que comparten las tres plantillas. Ninguna usa
  clases ni tokens de Lux: todo sale de las variables `--rvc-*` del tema
  (catalogo-rv.css).
*/

/** El texto de Lux, exacto (decisión del dueño del 23/11/2026). Sin contacto de Lux. */
export const TEXTO_LUX = 'Joyería hipoalergénica Lux by Emory · acero 316L, titanio y baño de oro 18K · certificada SGS';

export function PieLux() {
  return <p className="rvc-lux">{TEXTO_LUX}</p>;
}

/**
 * Su marca: el logo tal como es (sin recortarlo, sea apaisado, cuadrado o
 * redondo) o, sin logo, el nombre de su catálogo en la letra de títulos.
 * Siempre es el título de la página.
 */
export function Marca({ c, variante }: { c: CatalogoRv; variante: 'centro' | 'lado' }) {
  const nombre = c.perfil?.catalogo_nombre ?? '';
  const logo = urlPublicaFoto(c.perfil?.logo_path);
  return (
    <h1 className={`rvc-marca rvc-marca--${variante}`}>
      {logo ? <img className="rvc-marca__logo" src={logo} alt={nombre} /> : <span className="rvc-marca__nombre">{nombre}</span>}
    </h1>
  );
}

export function BotonLetra({ c }: { c: CatalogoRv }) {
  return (
    <button type="button" className="rvc-boton rvc-boton--claro rvc-boton--chico" aria-pressed={c.letraGrande} onClick={c.alternarLetra}>
      <span aria-hidden="true">Aa</span> Letra grande
    </button>
  );
}

export function Escribeme({ c, texto = 'Escríbeme' }: { c: CatalogoRv; texto?: string }) {
  if (!c.escribirle) return null;
  return (
    <a className="rvc-enlace rvc-enlace--fuerte" href={c.escribirle} target="_blank" rel="noopener noreferrer">
      {texto}<span className="rvc-oculto"> a {c.primerNombre} por WhatsApp</span>
    </a>
  );
}

/** El buscador, "Todas · Dama · Caballero" y, si se pide, los tipos en fichas. */
export function Buscador({ c, conTipos }: { c: CatalogoRv; conTipos: boolean }) {
  const opciones: { valor: 'dama' | 'caballero' | null; texto: string }[] = [
    { valor: null, texto: 'Todas' }, { valor: 'dama', texto: 'Dama' }, { valor: 'caballero', texto: 'Caballero' },
  ];
  return (
    <div className="rvc-buscador">
      <label className="rvc-oculto" htmlFor="rvc-buscar">Buscar una pieza</label>
      <input
        id="rvc-buscar" className="rvc-campo" type="search" value={c.texto}
        onChange={(e) => c.setTexto(e.target.value)}
        placeholder="Buscar: anillo, collar, cadena..." autoComplete="off"
      />
      <div className="rvc-segmentos" role="group" aria-label="Para quién">
        {opciones.map((o) => (
          <button key={o.texto} type="button" className="rvc-segmento" aria-pressed={c.para === o.valor} onClick={() => c.elegirPara(o.valor)}>
            {o.texto}
          </button>
        ))}
      </div>
      {conTipos && c.categorias.length > 1 ? (
        <div className="rvc-fichas" role="group" aria-label="Tipo de joya">
          <button type="button" className="rvc-ficha" aria-pressed={!c.categoria} onClick={() => c.setCategoria(null)}>Todo</button>
          {c.categorias.map((cat) => (
            <button key={cat} type="button" className="rvc-ficha" aria-pressed={c.categoria === cat} onClick={() => c.setCategoria(cat)}>
              {nombreDeTipo(cat)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Su contacto, al final. El de él, nunca el de la tienda. */
export function Contacto({ c }: { c: CatalogoRv }) {
  if (!c.escribirle || c.cargando) return null;
  return (
    <section className="rvc-contacto" aria-label={`Escríbele a ${c.primerNombre}`}>
      <p className="rvc-contacto__texto">¿Dudas con una pieza o con tu pedido? Escríbele a {c.primerNombre}.</p>
      <a className="rvc-boton" href={c.escribirle} target="_blank" rel="noopener noreferrer">Escribir a {c.primerNombre}</a>
    </section>
  );
}

/** El pie: su nombre y la línea de Lux. */
export function Pie({ c }: { c: CatalogoRv }) {
  return (
    <footer className="rvc-pie">
      <span className="rvc-pie__nombre">{c.perfil?.catalogo_nombre}</span>
      <PieLux />
    </footer>
  );
}

/** Un aviso de error del catálogo, con su botón para cerrarlo. */
export function ErrorRv({ c }: { c: CatalogoRv }) {
  if (!c.error) return null;
  return (
    <div className="rvc-error" role="alert">
      <span>{c.error}</span>
      <button type="button" className="rvc-enlace" onClick={c.limpiarError}>Cerrar</button>
    </div>
  );
}
