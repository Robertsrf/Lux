import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Armazon } from '../../componentes/Armazon';
import type { EnlaceNav } from '../../componentes/Armazon';
import { Aviso, LimiteDeError } from '../../componentes/Piezas';
import { urlPublicaFoto } from '../../lib/fotos';
import { SesionRvCerrada, leerSesionRv, rpcRv, salirRevendedor } from '../../lib/revendedor';
import { useTemaRv } from '../../hooks/useTemaRv';
import type { ResumenRevendedor } from '../../lib/tipos';
import { ContextoRv } from './contexto';
import type { ContextoPanelRv } from './contexto';
import { InicioRv } from './panel/InicioRv';
import { ApartadosRv } from './panel/ApartadosRv';
import { ClientesRv } from './panel/ClientesRv';
import { PreciosRv } from './panel/PreciosRv';
import { MiCatalogoRv } from './panel/MiCatalogoRv';
import '../../estilos/revendedor.css';

const ENLACES: EnlaceNav[] = [
  { a: '/rv',           texto: 'Inicio',      icono: 'dia' },
  { a: '/rv/apartados', texto: 'Apartados',   icono: 'pedidos' },
  { a: '/rv/clientes',  texto: 'Clientas',    icono: 'clientes' },
  { a: '/rv/precios',   texto: 'Mis precios', icono: 'grupos' },
  { a: '/rv/catalogo',  texto: 'Mi catálogo', icono: 'catalogo' },
];

/*
  Las tres de todos los días: cómo va, los apartados (donde carga lo que le
  pagan) y sus clientas. Precios y catálogo se tocan de vez en cuando.
*/
const PRINCIPALES = ['/rv', '/rv/apartados', '/rv/clientes'];

/**
 * El panel de un revendedor: /#/rv. Su administrativo.
 *
 * Mismo armazón que la tienda (barra lateral en escritorio, abajo en el
 * teléfono) y vestido con SU paleta: es su negocio. Lo que ve lo traen las
 * funciones `rv_*` con su testigo; para la base es alguien sin sesión.
 */
export function PanelRevendedor() {
  const navegar = useNavigate();
  const donde = useLocation();
  const sesion = leerSesionRv();
  const [resumen, setResumen] = useState<ResumenRevendedor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useTemaRv(resumen?.paleta);

  const siSeCerro = useCallback((e: unknown) => {
    if (!(e instanceof SesionRvCerrada)) return false;
    navegar('/rv/entrar', { replace: true, state: { motivo: e.message } });
    return true;
  }, [navegar]);

  const recargar = useCallback(async () => {
    try {
      setResumen(await rpcRv<ResumenRevendedor>('rv_resumen'));
      setError(null);
    } catch (e) {
      if (!siSeCerro(e)) setError(e instanceof Error ? e.message : 'No se pudo abrir tu panel.');
    }
  }, [siSeCerro]);

  useEffect(() => { if (leerSesionRv()) void recargar(); }, [recargar]);

  const valor = useMemo<ContextoPanelRv>(() => ({ resumen, recargar, siSeCerro }), [resumen, recargar, siSeCerro]);

  if (!sesion) return <Navigate to="/rv/entrar" replace />;

  async function salir() {
    await salirRevendedor();
    navegar('/rv/entrar', { replace: true });
  }

  const logo = urlPublicaFoto(resumen?.logo_path);
  const marca = (
    <div className="rv-marca">
      {logo ? <img className="rv-marca__logo" src={logo} alt="" /> : null}
      <div className="rv-marca__texto">
        <span className="rv-marca__nombre">{resumen?.catalogo_nombre ?? sesion.nombre}</span>
        <span className="rv-marca__de">Joyas Lux by Emory</span>
      </div>
    </div>
  );

  return (
    <ContextoRv.Provider value={valor}>
      <Armazon
        enlaces={ENLACES}
        principales={PRINCIPALES}
        marca={marca}
        quien={{ nombre: resumen?.nombre ?? sesion.nombre, rol: 'revendedor' }}
        alSalir={() => void salir()}
      >
        <LimiteDeError key={donde.pathname}>
          {error ? (
            <div className="pagina">
              <Aviso tono="error" titulo="No se pudo abrir tu panel">{error}</Aviso>
            </div>
          ) : null}
          <Routes>
            <Route index element={<InicioRv />} />
            <Route path="apartados" element={<ApartadosRv />} />
            <Route path="clientes" element={<ClientesRv />} />
            <Route path="precios" element={<PreciosRv />} />
            <Route path="catalogo" element={<MiCatalogoRv />} />
            <Route path="*" element={<Navigate to="/rv" replace />} />
          </Routes>
        </LimiteDeError>
      </Armazon>
    </ContextoRv.Provider>
  );
}
