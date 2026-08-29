import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Wordmark } from './Marca';
import { useSesion } from '../hooks/useSesion';
import { cerrarSesion } from '../lib/auth';

const ENLACES_ADMIN = [
  { a: '/admin/inventario', texto: 'Inventario' },
  { a: '/admin/reportes', texto: 'Reportes' },
  { a: '/admin/lotes', texto: 'Lotes' },
  { a: '/admin/grupos', texto: 'Grupos' },
  { a: '/admin/kits', texto: 'Kits' },
  { a: '/admin/tasas', texto: 'Tasas' },
  { a: '/catalogo', texto: 'Catalogo' },
];

const ENLACES_VENTA = [
  { a: '/venta', texto: 'Mostrador' },
  { a: '/venta/mayor', texto: 'Mayor' },
  { a: '/venta/tablero', texto: 'Mi dia' },
  { a: '/venta/cierre', texto: 'Cierre' },
  { a: '/venta/conteo', texto: 'Conteo' },
];

export function Disposicion() {
  const { perfil, esAdmin } = useSesion();
  const navegar = useNavigate();

  async function salir() {
    await cerrarSesion();
    navegar('/entrar', { replace: true });
  }

  return (
    <>
      <header className="barra sin-impresion">
        <div className="barra__interior">
          <Wordmark tamano={20} />

          <nav className="navegacion" aria-label="Secciones">
            {esAdmin
              ? ENLACES_ADMIN.map((e) => (
                  <NavLink key={e.a} to={e.a} className={({ isActive }) => (isActive ? 'activo' : undefined)}>
                    {e.texto}
                  </NavLink>
                ))
              : ENLACES_VENTA.map((e) => (
                  <NavLink key={e.a} to={e.a} end className={({ isActive }) => (isActive ? 'activo' : undefined)}>
                    {e.texto}
                  </NavLink>
                ))}
            <NavLink to="/verificacion" className={({ isActive }) => (isActive ? 'activo' : undefined)}>
              Verificacion
            </NavLink>
          </nav>

          <div className="sesion">
            <span className="sesion__quien">
              {perfil?.nombre ?? 'Sin perfil'} · {perfil?.rol ?? '—'}
            </span>
            <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => void salir()}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </>
  );
}
