import { Suspense } from 'react';
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
  { a: '/admin/kits',       texto: 'Kits',       icono: 'kits' },
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
  { a: '/venta/mayor',    texto: 'Mayor',     icono: 'mayor' },
  { a: '/venta/pedidos',  texto: 'Pedidos',   icono: 'pedidos' },
  { a: '/venta/tablero',  texto: 'Mi día',    icono: 'dia' },
  { a: '/venta/cierre',   texto: 'Cierre',    icono: 'cierre' },
  { a: '/venta/conteo',   texto: 'Conteo',    icono: 'conteo' },
  { a: '/venta/guia',     texto: 'Guía',      icono: 'catalogo' },
  { a: '/vitrina',        texto: 'Vitrina',   icono: 'vitrina' },
];

/**
 * Armazon de la aplicacion. En escritorio la navegacion vive en una barra
 * lateral: caben las ocho secciones del admin con su nombre completo, en
 * vez de apretarlas en una fila. En movil esa misma barra se vuelve
 * superior y deja solo los iconos, para no robarle alto a la pantalla.
 */
export function Disposicion() {
  const { perfil, esAdmin } = useSesion();
  const navegar = useNavigate();
  const donde = useLocation();
  const enlaces = esAdmin ? ENLACES_ADMIN : ENLACES_VENTA;

  async function salir() {
    await cerrarSesion();
    navegar('/entrar', { replace: true });
  }

  return (
    <div className="armazon">
      <aside className="lateral">
        {/* En escritorio manda el wordmark completo; en la barra superior
            del movil no cabe legible y se usa el sello. */}
        <div className="lateral__marca">
          <Wordmark alto={52} />
          <Monograma tamano={36} />
        </div>

        <nav className="navegacion" aria-label="Secciones">
          {enlaces.map((e) => (
            <NavLink key={e.a} to={e.a} end className={({ isActive }) => (isActive ? 'activo' : undefined)}>
              <Icono nombre={e.icono} />
              <span className="texto-nav">{e.texto}</span>
            </NavLink>
          ))}
          {/* Solo al administrador. La pantalla paso a ser suya porque enseña
              el nombre de cada vista y cada funcion protegida. A la vendedora
              le seguia apareciendo el enlace y la llevaba a un rechazo: un
              callejon sin salida dentro de su propio menu. */}
          {esAdmin && (
            <NavLink to="/verificacion" className={({ isActive }) => (isActive ? 'activo' : undefined)}>
              <Icono nombre="verificacion" />
              <span className="texto-nav">Verificación</span>
            </NavLink>
          )}
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
        */}
        {/*
          Las pantallas de administracion llegan en su propio archivo, aparte
          del programa principal. El Suspense va AQUI DENTRO y no arriba del
          todo a proposito: asi el menu lateral no parpadea mientras la
          pantalla viaja, solo cambia el area de contenido.
        */}
        <LimiteDeError key={donde.pathname}>
          <Suspense fallback={<Cargando texto="Abriendo la pantalla" />}>
            <Outlet />
          </Suspense>
        </LimiteDeError>
      </main>
    </div>
  );
}
