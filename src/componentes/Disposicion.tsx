import { Suspense, useEffect, useId, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Monograma, Wordmark } from './Marca';
import { Icono } from './Iconos';
import type { NombreIcono } from './Iconos';
import { Cargando, LimiteDeError } from './Piezas';
import { useSesion } from '../hooks/useSesion';
import { cerrarSesion } from '../lib/auth';

interface Enlace { a: string; texto: string; icono: NombreIcono }

const ENLACES_ADMIN: Enlace[] = [
  { a: '/admin/inventario', texto: 'Inventario', icono: 'inventario' },
  { a: '/admin/reportes',   texto: 'Reportes',   icono: 'reportes' },
  { a: '/admin/lotes',      texto: 'Lotes',      icono: 'lotes' },
  { a: '/admin/grupos',     texto: 'Grupos',     icono: 'grupos' },
  { a: '/admin/tramos',     texto: 'Tramos',     icono: 'tramos' },
  { a: '/admin/costos',     texto: 'Costos',     icono: 'reportes' },
  { a: '/admin/inversiones', texto: 'Inversiones', icono: 'lotes' },
  { a: '/admin/tasas',      texto: 'Tasas',      icono: 'tasas' },
  { a: '/admin/textos',     texto: 'Textos',     icono: 'catalogo' },
  { a: '/catalogo',         texto: 'Catálogo',   icono: 'catalogo' },
  { a: '/vitrina',          texto: 'Vitrina',    icono: 'vitrina' },
];

const ENLACES_VENTA: Enlace[] = [
  { a: '/venta',          texto: 'Mostrador', icono: 'mostrador' },
  { a: '/venta/pedidos',  texto: 'Pedidos',   icono: 'pedidos' },
  { a: '/venta/tablero',  texto: 'Mi día',    icono: 'dia' },
  { a: '/venta/cierre',   texto: 'Cierre',    icono: 'cierre' },
  { a: '/venta/conteo',   texto: 'Conteo',    icono: 'conteo' },
  { a: '/venta/guia',     texto: 'Guía',      icono: 'catalogo' },
  { a: '/vitrina',        texto: 'Vitrina',   icono: 'vitrina' },
];

/*
  LAS TRES QUE VAN EN LA BARRA DE ABAJO

  No son las tres primeras de la lista: son las tres que se tocan a diario.
  La vendedora vive en Mostrador, entra a Pedidos cuando le llega un encargo
  por WhatsApp y mira Mi día para saber cómo va. Cierre es una vez al día,
  Conteo una vez por semana, Guía casi nunca y Vitrina se enciende y se deja.
  Esas viven en la hoja.
*/
const PRINCIPALES_VENTA = ['/venta', '/venta/pedidos', '/venta/tablero'];
const PRINCIPALES_ADMIN = ['/admin/inventario', '/admin/reportes', '/admin/lotes'];

/**
 * Armazón de la aplicación.
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
export function Disposicion() {
  const { perfil, esAdmin } = useSesion();
  const navegar = useNavigate();
  const donde = useLocation();
  const enlaces = esAdmin ? ENLACES_ADMIN : ENLACES_VENTA;
  const principales = esAdmin ? PRINCIPALES_ADMIN : PRINCIPALES_VENTA;

  const [hoja, setHoja] = useState(false);
  const botonMas = useRef<HTMLButtonElement>(null);
  const idHoja = useId();

  async function salir() {
    await cerrarSesion();
    navegar('/entrar', { replace: true });
  }

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

  const enlaceNav = (e: Enlace) => (
    <NavLink key={e.a} to={e.a} end className={({ isActive }) => (isActive ? 'activo' : undefined)}>
      <Icono nombre={e.icono} />
      <span className="texto-nav">{e.texto}</span>
    </NavLink>
  );

  const verificacion: Enlace = { a: '/verificacion', texto: 'Verificación', icono: 'verificacion' };
  /* Solo al administrador. La pantalla pasó a ser suya porque enseña el
     nombre de cada vista y cada función protegida. A la vendedora le seguía
     apareciendo el enlace y la llevaba a un rechazo: un callejón sin salida
     dentro de su propio menú. */
  const todos = esAdmin ? [...enlaces, verificacion] : enlaces;

  return (
    <div className="armazon">
      {/* Escritorio. En el teléfono esta barra no se dibuja. */}
      <aside className="lateral">
        <div className="lateral__marca">
          <Wordmark alto={52} />
          <Monograma tamano={36} />
        </div>

        <nav className="navegacion" aria-label="Secciones">
          {todos.map(enlaceNav)}
        </nav>

        <div className="sesion">
          <span className="sesion__quien">
            <span className="sesion__nombre">{perfil?.nombre ?? 'Sin perfil'}</span>
            <span className="sesion__rol">{perfil?.rol ?? '—'}</span>
          </span>
          <button
            type="button"
            className="boton boton--secundario boton--pequeno boton--icono"
            onClick={() => void salir()}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <Icono nombre="salir" className="icono icono--sm" />
          </button>
        </div>
      </aside>

      <main className="contenido">
        {/*
          Si una pantalla falla, la navegacion sigue en pie. Y la clave por
          ruta hace que el limite se rearme al cambiar de seccion: sin ella,
          una pantalla rota dejaba TODO el sistema mostrando el error hasta
          recargar, aunque el aviso invitara a irse por el menu.

          El Suspense va aqui dentro y no arriba del todo: asi el menu no
          parpadea mientras viaja la pantalla, solo cambia el contenido.
        */}
        <LimiteDeError key={donde.pathname}>
          <Suspense fallback={<Cargando texto="Abriendo la pantalla" />}>
            <Outlet />
          </Suspense>
        </LimiteDeError>
      </main>

      {/* Teléfono. En escritorio esta barra no se dibuja. */}
      <nav className="barra-nav" aria-label="Secciones">
        {todos.filter((e) => principales.includes(e.a)).map(enlaceNav)}
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
            {/* El rol solo si aporta algo. La vendedora se llama "Vendedora"
                y su rol es "vendedora": ponerlos juntos escribia la misma
                palabra dos veces. */}
            <div className="hoja__quien">
              <span className="hoja__nombre">{perfil?.nombre ?? 'Sin perfil'}</span>
              {perfil?.rol && perfil.rol.toLowerCase() !== (perfil.nombre ?? '').toLowerCase() && (
                <span className="hoja__rol">{perfil.rol}</span>
              )}
            </div>

            {/* Van TODAS, incluidas las tres de la barra. Esconder las que ya
                están abajo ahorra cuatro renglones y a cambio obliga a
                recordar dónde quedó cada cosa. */}
            <nav className="hoja__secciones" aria-label="Todas las secciones">
              {todos.map(enlaceNav)}
            </nav>

            <button type="button" className="boton boton--secundario hoja__salir" onClick={() => void salir()}>
              <Icono nombre="salir" className="icono icono--sm" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
