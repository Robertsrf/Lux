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
import { Mostrador } from './paginas/venta/Mostrador';
import { Cargando } from './componentes/Piezas';

/** GitHub Pages no reescribe rutas: se usa HashRouter (/#/admin/inventario). */
function Inicio() {
  const { sesion, perfil, cargando } = useSesion();
  if (cargando) return <Cargando texto="Abriendo" />;
  if (!sesion) return <Navigate to="/entrar" replace />;
  return <Navigate to={perfil?.rol === 'admin' ? '/admin/inventario' : '/venta'} replace />;
}

export function App() {
  return (
    <HashRouter>
      <ProveedorSesion>
        <Routes>
          <Route path="/entrar" element={<Entrar />} />

          <Route element={<RutaProtegida><Disposicion /></RutaProtegida>}>
            <Route path="/venta" element={<Mostrador />} />
            <Route path="/verificacion" element={<Verificacion />} />
            <Route path="/catalogo" element={<CatalogoPdf />} />

            <Route path="/admin/inventario" element={<RutaProtegida soloAdmin><Inventario /></RutaProtegida>} />
            <Route path="/admin/modelos/nuevo" element={<RutaProtegida soloAdmin><FormularioModelo /></RutaProtegida>} />
            <Route path="/admin/modelos/:id" element={<RutaProtegida soloAdmin><FormularioModelo /></RutaProtegida>} />
            <Route path="/admin/lotes" element={<RutaProtegida soloAdmin><Lotes /></RutaProtegida>} />
            <Route path="/admin/grupos" element={<RutaProtegida soloAdmin><Grupos /></RutaProtegida>} />
            <Route path="/admin/tasas" element={<RutaProtegida soloAdmin><Tasas /></RutaProtegida>} />
          </Route>

          <Route path="/" element={<Inicio />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProveedorSesion>
    </HashRouter>
  );
}
