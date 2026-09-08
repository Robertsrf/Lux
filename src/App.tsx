import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProveedorSesion, useSesion } from './hooks/useSesion';
import { RutaProtegida } from './componentes/RutaProtegida';
import { Disposicion } from './componentes/Disposicion';
import { Cargando, LimiteDeError } from './componentes/Piezas';

/*
  QUE VIAJA JUNTO Y QUE VIAJA APARTE

  Antes todo iba en un solo archivo de 390 KB. Eso significaba que una
  clienta que abre el enlace del catalogo por WhatsApp, con datos moviles,
  se descargaba entera la administracion: el inventario, los lotes, los
  costos, los reportes. Nada de eso podia usarlo, y aun asi lo pagaba en
  segundos de espera antes de ver la primera pieza.

  El reparto de ahora sigue a quien usa cada pantalla:

  - Contado (llega de una): entrar, el catalogo publico y la reserva. Es la
    puerta de la tienda y la ve mas gente que ninguna otra cosa.
  - Contado tambien: el dia de la vendedora. Se parte aparte por seccion
    seria un viaje a la red cada vez que toca una pestana, y en la tienda
    la senal no siempre acompana.
  - Aparte: la administracion, la vitrina y el catalogo para imprimir. Se
    abren desde una computadora, de vez en cuando, y esperar un instante
    ahi no le cuesta una venta a nadie.
*/

import { Entrar } from './paginas/Entrar';
import { Catalogo as CatalogoPublico } from './paginas/publico/Catalogo';
import { Reserva } from './paginas/publico/Reserva';

import { Mostrador } from './paginas/venta/Mostrador';
import { Kits as KitsVenta } from './paginas/venta/Kits';
import { Tablero } from './paginas/venta/Tablero';
import { Cierre } from './paginas/venta/Cierre';
import { ConteoSemanal } from './paginas/venta/ConteoSemanal';
import { Guia } from './paginas/venta/Guia';
import { Pedidos } from './paginas/venta/Pedidos';

const Inventario = lazy(() => import('./paginas/admin/Inventario').then((m) => ({ default: m.Inventario })));
const FormularioModelo = lazy(() => import('./paginas/admin/FormularioModelo').then((m) => ({ default: m.FormularioModelo })));
const Lotes = lazy(() => import('./paginas/admin/Lotes').then((m) => ({ default: m.Lotes })));
const Grupos = lazy(() => import('./paginas/admin/Grupos').then((m) => ({ default: m.Grupos })));
const Tasas = lazy(() => import('./paginas/admin/Tasas').then((m) => ({ default: m.Tasas })));
const KitsAdmin = lazy(() => import('./paginas/admin/Kits').then((m) => ({ default: m.Kits })));
const Tramos = lazy(() => import('./paginas/admin/Tramos').then((m) => ({ default: m.Tramos })));
const Textos = lazy(() => import('./paginas/admin/Textos').then((m) => ({ default: m.Textos })));
const Costos = lazy(() => import('./paginas/admin/Costos').then((m) => ({ default: m.Costos })));
const Inversiones = lazy(() => import('./paginas/admin/Inversiones').then((m) => ({ default: m.Inversiones })));
const Reportes = lazy(() => import('./paginas/admin/Reportes').then((m) => ({ default: m.Reportes })));
const Verificacion = lazy(() => import('./paginas/Verificacion').then((m) => ({ default: m.Verificacion })));
const CatalogoPdf = lazy(() => import('./paginas/CatalogoPdf').then((m) => ({ default: m.CatalogoPdf })));
const Vitrina = lazy(() => import('./paginas/Vitrina').then((m) => ({ default: m.Vitrina })));

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
        <LimiteDeError>
        <Routes>
          <Route path="/entrar" element={<Entrar />} />

          {/* Publico: sin sesion. Es el enlace que se comparte. */}
          <Route path="/publico" element={<CatalogoPublico />} />
          <Route path="/reserva/:token" element={<Reserva />} />

          {/* Vitrina: pantalla completa, sin barra lateral. Pide sesion
              porque se enciende desde la tienda, pero no muestra costos. */}
          {/* Lleva Suspense propio: es la unica pantalla perezosa que no
              vive dentro de Disposicion, asi que no hereda el de alla. */}
          <Route
            path="/vitrina"
            element={
              <RutaProtegida>
                <Suspense fallback={<Cargando texto="Encendiendo la vitrina" />}>
                  <Vitrina />
                </Suspense>
              </RutaProtegida>
            }
          />

          <Route element={<RutaProtegida><Disposicion /></RutaProtegida>}>
            {/* Mostrador */}
            <Route path="/venta" element={<Mostrador />} />
            <Route path="/venta/mayor" element={<KitsVenta />} />
            <Route path="/venta/tablero" element={<Tablero />} />
            <Route path="/venta/cierre" element={<Cierre />} />
            <Route path="/venta/conteo" element={<ConteoSemanal />} />
            <Route path="/venta/pedidos" element={<Pedidos />} />
            <Route path="/venta/guia" element={<Guia />} />

            {/* La verificacion es de administrador. No enseña datos a quien
                no debe verlos, pero si el nombre de cada vista y cada funcion
                protegida, que es un mapa que la vendedora no necesita. */}
            <Route path="/verificacion" element={soloAdmin(<Verificacion />)} />
            <Route path="/catalogo" element={<CatalogoPdf />} />

            {/* Administracion */}
            <Route path="/admin/inventario" element={soloAdmin(<Inventario />)} />
            <Route path="/admin/modelos/nuevo" element={soloAdmin(<FormularioModelo />)} />
            <Route path="/admin/modelos/:id" element={soloAdmin(<FormularioModelo />)} />
            <Route path="/admin/lotes" element={soloAdmin(<Lotes />)} />
            <Route path="/admin/grupos" element={soloAdmin(<Grupos />)} />
            <Route path="/admin/kits" element={soloAdmin(<KitsAdmin />)} />
            <Route path="/admin/tramos" element={soloAdmin(<Tramos />)} />
            <Route path="/admin/textos" element={soloAdmin(<Textos />)} />
            <Route path="/admin/costos" element={soloAdmin(<Costos />)} />
            <Route path="/admin/inversiones" element={soloAdmin(<Inversiones />)} />
            <Route path="/admin/tasas" element={soloAdmin(<Tasas />)} />
            <Route path="/admin/reportes" element={soloAdmin(<Reportes />)} />
          </Route>

          <Route path="/" element={<Inicio />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </LimiteDeError>
      </ProveedorSesion>
    </HashRouter>
  );
}
