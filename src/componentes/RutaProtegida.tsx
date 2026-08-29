import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSesion } from '../hooks/useSesion';
import { Aviso, Cargando } from './Piezas';

/**
 * Comodidad de navegacion, NO proteccion. Quien tenga el bundle puede saltarse
 * esto. Lo que de verdad impide leer costos son las politicas RLS y los REVOKE
 * de la base.
 */
export function RutaProtegida({ soloAdmin = false, children }: { soloAdmin?: boolean; children: ReactNode }) {
  const { sesion, perfil, cargando, esAdmin, errorPerfil } = useSesion();
  const ubicacion = useLocation();

  if (cargando) return <Cargando texto="Verificando sesion" />;
  if (!sesion) return <Navigate to="/entrar" replace state={{ desde: ubicacion.pathname }} />;

  if (errorPerfil) {
    return (
      <div className="pagina pagina--angosta">
        <Aviso tono="error" titulo="Falta el perfil">{errorPerfil}</Aviso>
      </div>
    );
  }

  if (soloAdmin && !esAdmin) {
    return (
      <div className="pagina pagina--angosta">
        <Aviso tono="alerta" titulo="Seccion de administracion">
          Esta pantalla muestra costos y margenes, y tu sesion es de {perfil?.rol ?? 'otro rol'}.
          Entra con el usuario administrador para verla.
        </Aviso>
      </div>
    );
  }

  return <>{children}</>;
}
