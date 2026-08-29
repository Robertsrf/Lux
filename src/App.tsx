import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProveedorSesion, useSesion } from './hooks/useSesion';
import { RutaProtegida } from './componentes/RutaProtegida';
import { Disposicion } from './componentes/Disposicion';
import { Entrar } from './paginas/Entrar';
import { Verificacion } from './paginas/Verificacion';
import { CatalogoPdf } from './paginas/CatalogoPdf';
import { Inventario } from './paginas/admin/Inventario';
import { FormularioModelo } from './paginas/admin/FormularioModelo';
import { Lotes } from './paginas/admin/Lotes';
import { Grupos } from './paginas/admin/Grupos';
import { Tasas } from './paginas/admin/Tasas';
import { Kits as KitsAdmin } from './paginas/admin/Kits';
import { Reportes } from './paginas/admin/Reportes';
import { Mostrador } from './paginas/venta/Mostrador';
import { Kits as KitsVenta } from './paginas/venta/Kits';
import { Tablero } from './paginas/venta/Tablero';
import { Cierre } from './paginas/venta/Cierre';
import { ConteoSemanal } from './paginas/venta/ConteoSemanal';
import { Cargando } from './componentes/Piezas';

/** GitHub Pages no reescribe rutas: se usa HashRouter (/#/admin/inventario). */
function Inicio() {
  const { sesion, perfil, cargando } = useSesion();
  if (cargando) return <Cargando texto="Abriendo" />;
  if (!sesion) return <Navigate to="/entrar" replace />;
  return <Navigate to={perfil?.rol === 'admin' ? '/admin/inventario' : '/venta'} replace />;
}

const soloAdmin = (elemento: React.ReactNode) => <RutaProtegida soloAdmin>{elemento}</RutaProtegida>;

export function App() {
  return (
    <HashRouter>
      <ProveedorSesion>
        <Routes>
          <Route path="/entrar" element={<Entrar />} />

          <Route element={<RutaProtegida><Disposicion /></RutaProtegida>}>
            {/* Mostrador */}
            <Route path="/venta" element={<Mostrador />} />
            <Route path="/venta/mayor" element={<KitsVenta />} />
            <Route path="/venta/tablero" element={<Tablero />} />
            <Route path="/venta/cierre" element={<Cierre />} />
            <Route path="/venta/conteo" element={<ConteoSemanal />} />

            {/* Comunes */}
            <Route path="/verificacion" element={<Verificacion />} />
            <Route path="/catalogo" element={<CatalogoPdf />} />

            {/* Administracion */}
            <Route path="/admin/inventario" element={soloAdmin(<Inventario />)} />
            <Route path="/admin/modelos/nuevo" element={soloAdmin(<FormularioModelo />)} />
            <Route path="/admin/modelos/:id" element={soloAdmin(<FormularioModelo />)} />
            <Route path="/admin/lotes" element={soloAdmin(<Lotes />)} />
            <Route path="/admin/grupos" element={soloAdmin(<Grupos />)} />
            <Route path="/admin/kits" element={soloAdmin(<KitsAdmin />)} />
            <Route path="/admin/tasas" element={soloAdmin(<Tasas />)} />
            <Route path="/admin/reportes" element={soloAdmin(<Reportes />)} />
          </Route>

          <Route path="/" element={<Inicio />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProveedorSesion>
    </HashRouter>
  );
}
