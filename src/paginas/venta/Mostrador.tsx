import { Link } from 'react-router-dom';
import { Vacio } from '../../componentes/Piezas';
import { Divisor } from '../../componentes/Marca';
import { useSesion } from '../../hooks/useSesion';

/**
 * Cara de mostrador. En la Fase 1 todavia no hay punto de venta: la cuadricula
 * tactil, el cobro y el cierre diario son la Fase 2. Esta pantalla existe para
 * que la vendedora pueda entrar y comprobar su acceso sin encontrarse un error.
 */
export function Mostrador() {
  const { perfil } = useSesion();

  return (
    <div className="pagina pagina--angosta mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Hola, {perfil?.nombre ?? 'bienvenida'}</h1>
          <p>Tu acceso quedo listo.</p>
        </div>
      </div>

      <Vacio titulo="El mostrador llega en la Fase 2">
        <p>
          Por ahora el sistema esta cargando el inventario. Cuando este completo se abre
          aqui la cuadricula de venta: tocar la foto, elegir cantidad, cobrar.
        </p>
      </Vacio>

      <Divisor />

      <p className="util centrado">
        <Link to="/verificacion">Comprobar mi acceso</Link>
      </p>
    </div>
  );
}
