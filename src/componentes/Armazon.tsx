import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icono } from './Iconos';
import type { NombreIcono } from './Iconos';
import { agruparEnlaces } from '../lib/menu';

export interface EnlaceNav {
  a: string; texto: string; icono: NombreIcono;
  /** Algo que pide atención en esa sección, dicho corto: "2 vencidos". */
  aviso?: string | null;
  /** El grupo del menú ("Dinero", "Mercancía"); sin grupo, va arriba sin título. */
  grupo?: string;
}

/**
 * El armazón de una cara con sesión: la de la tienda (Disposicion) y el
 * panel de un revendedor. Salió de Disposicion cuando hizo falta el mismo
 * para él: dos copias de una barra de navegación terminan siendo dos barras
 * que se portan distinto en el mismo teléfono.
 *
 * EN ESCRITORIO: barra lateral con todas las secciones y su nombre completo.
 *
 * EN EL TELÉFONO: barra ABAJO, no arriba. La navegación superior se comía
 * 222 px de 844, el 26 % de la pantalla, en cada una de sus pantallas. Y el
 * sitio donde estaba, arriba, es justo el que peor alcanza un pulgar: ella
 * trabaja con una mano ocupada con joyas. Abajo caen tres secciones y un
 * botón "Más" que abre el resto en una hoja.
 *
 * No es una hamburguesa arriba a la izquierda a propósito. Esa esquina es la
 * más lejos del pulgar en un teléfono que se sostiene con una mano, y este
 * es un punto de venta, no una web que se lee.
 */
export function Armazon({ enlaces, principales, marca, quien, alSalir, children }: {
  enlaces: EnlaceNav[];
  /** Las tres que van en la barra de abajo del teléfono: las de todos los días. */
  principales: string[];
  /** Lo que va arriba de la barra lateral. */
  marca: ReactNode;
  quien: { nombre: string; rol?: string | null };
  alSalir: () => void;
  children: ReactNode;
}) {
  const donde = useLocation();
  const [hoja, setHoja] = useState(false);
  const botonMas = useRef<HTMLButtonElement>(null);
  const idHoja = useId();

  // Cambiar de sección cierra la hoja. Hace falta incluso tocando la
  // sección en la que ya estás: si no, la hoja se queda abierta encima.
  useEffect(() => { setHoja(false); }, [donde.pathname]);

  // Escape cierra, y el foco vuelve al botón que la abrió. Sin esto el foco
  // se queda en el vacío y quien navega con teclado se pierde.
  useEffect(() => {
    if (!hoja) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setHoja(false); botonMas.current?.focus(); }
    };
    document.addEventListener('keydown', alPulsar);
    // Que no se deslice la página por detrás de la hoja.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alPulsar);
      document.body.style.overflow = antes;
    };
  }, [hoja]);

  const enlaceNav = (e: EnlaceNav) => (
    <NavLink key={e.a} to={e.a} end className={({ isActive }) => (isActive ? 'activo' : undefined)}>
      <Icono nombre={e.icono} />
      <span className="texto-nav">{e.texto}</span>
      {e.aviso ? <span className="aviso-nav">{e.aviso}</span> : null}
    </NavLink>
  );

  // Por grupos ("Vender", "Dinero"...) en la lateral y en la hoja (fase 9).
  // Sin grupos (la vendedora, el revendedor) sale un solo bloque sin título.
  const grupos = agruparEnlaces(enlaces);
  const navAgrupada = grupos.map((g) => (
    g.titulo
      ? (
        <div key={g.titulo} className="nav-grupo" role="group" aria-label={g.titulo}>
          <span className="nav-grupo__titulo" aria-hidden="true">{g.titulo}</span>
          {g.enlaces.map(enlaceNav)}
        </div>
      )
      : <div key="(sin grupo)" className="nav-grupo">{g.enlaces.map(enlaceNav)}</div>
  ));

  // El rol solo si aporta algo. La vendedora se llama "Vendedora" y su rol
  // es "vendedora": ponerlos juntos escribía la misma palabra dos veces.
  const rolDistinto = quien.rol && quien.rol.toLowerCase() !== quien.nombre.toLowerCase() ? quien.rol : null;

  return (
    <div className="armazon">
      {/* Escritorio. En el teléfono esta barra no se dibuja. */}
      <aside className="lateral">
        <div className="lateral__marca">{marca}</div>

        <nav className="navegacion" aria-label="Secciones">
          {navAgrupada}
        </nav>

        <div className="sesion">
          <span className="sesion__quien">
            <span className="sesion__nombre">{quien.nombre}</span>
            <span className="sesion__rol">{quien.rol ?? '—'}</span>
          </span>
          <button
            type="button"
            className="boton boton--secundario boton--pequeno boton--icono"
            onClick={alSalir}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <Icono nombre="salir" className="icono icono--sm" />
          </button>
        </div>
      </aside>

      <main className="contenido">{children}</main>

      {/* Teléfono. En escritorio esta barra no se dibuja. */}
      <nav className="barra-nav" aria-label="Secciones">
        {enlaces.filter((e) => principales.includes(e.a)).map(enlaceNav)}
        <button
          type="button"
          ref={botonMas}
          className={hoja ? 'barra-nav__mas activo' : 'barra-nav__mas'}
          onClick={() => setHoja((v) => !v)}
          aria-expanded={hoja}
          aria-controls={idHoja}
        >
          <Icono nombre="mas" />
          <span className="texto-nav">Más</span>
          {enlaces.some((e) => e.aviso && !principales.includes(e.a))
            ? <span className="aviso-nav aviso-nav--punto" aria-label="Hay algo que mirar" />
            : null}
        </button>
      </nav>

      {hoja && (
        <div className="hoja-fondo" onClick={() => setHoja(false)}>
          <div
            id={idHoja}
            className="hoja"
            role="dialog"
            aria-modal="true"
            aria-label="Todas las secciones"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hoja__asa" aria-hidden="true" />
            <div className="hoja__quien">
              <span className="hoja__nombre">{quien.nombre}</span>
              {rolDistinto ? <span className="hoja__rol">{rolDistinto}</span> : null}
            </div>

            {/* Van TODAS, incluidas las tres de la barra. Esconder las que ya
                están abajo ahorra cuatro renglones y a cambio obliga a
                recordar dónde quedó cada cosa. */}
            <nav className="hoja__secciones" aria-label="Todas las secciones">
              {navAgrupada}
            </nav>

            <button type="button" className="boton boton--secundario hoja__salir" onClick={alSalir}>
              <Icono nombre="salir" className="icono icono--sm" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
