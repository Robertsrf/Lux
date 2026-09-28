import { Suspense } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Monograma, Wordmark } from './Marca';
import { Armazon } from './Armazon';
import type { EnlaceNav } from './Armazon';
import { Cargando, LimiteDeError } from './Piezas';
import { useSesion } from '../hooks/useSesion';
import { cerrarSesion } from '../lib/auth';

const ENLACES_ADMIN: EnlaceNav[] = [
  { a: '/admin/inventario', texto: 'Inventario', icono: 'inventario' },
  // El administrador tambien vende, y aprueba lo que queda por verificar.
  { a: '/venta',            texto: 'Mostrador',  icono: 'mostrador' },
  { a: '/venta/pedidos',    texto: 'Pedidos',    icono: 'pedidos' },
  // Lo que entra y lo que sale de la tienda. Se toca a diario, al anotar
  // cada gasto: va junto a lo del dia y no al fondo con las cuentas.
  { a: '/admin/caja',       texto: 'Caja',       icono: 'caja' },
  { a: '/admin/reportes',   texto: 'Reportes',   icono: 'reportes' },
  { a: '/clientes',         texto: 'Clientes',   icono: 'clientes' },
  { a: '/admin/vendedoras', texto: 'Vendedoras', icono: 'vendedoras' },
  { a: '/admin/revendedores', texto: 'Revendedores', icono: 'revendedores' },
  { a: '/admin/lotes',      texto: 'Lotes',      icono: 'lotes' },
  { a: '/admin/grupos',     texto: 'Grupos',     icono: 'grupos' },
  { a: '/admin/tramos',     texto: 'Tramos',     icono: 'tramos' },
  { a: '/admin/costos',     texto: 'Costos',     icono: 'reportes' },
  { a: '/admin/inversiones', texto: 'Inversiones', icono: 'lotes' },
  { a: '/tasas',            texto: 'Tasas',      icono: 'tasas' },
  { a: '/admin/textos',     texto: 'Textos',     icono: 'catalogo' },
  { a: '/catalogo',         texto: 'Catálogo',   icono: 'catalogo' },
  { a: '/vitrina',          texto: 'Vitrina',    icono: 'vitrina' },
];

const ENLACES_VENTA: EnlaceNav[] = [
  { a: '/venta',          texto: 'Mostrador', icono: 'mostrador' },
  { a: '/venta/pedidos',  texto: 'Pedidos',   icono: 'pedidos' },
  { a: '/clientes',       texto: 'Clientes',  icono: 'clientes' },
  { a: '/venta/tablero',  texto: 'Mi día',    icono: 'dia' },
  { a: '/venta/cierre',   texto: 'Cierre',    icono: 'cierre' },
  { a: '/venta/conteo',   texto: 'Conteo',    icono: 'conteo' },
  { a: '/tasas',          texto: 'Tasas',     icono: 'tasas' },
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

  Las del administrador cambiaron cuando empezo a vender: Inventario, el
  Mostrador y Pedidos, que es donde aprueba las ventas por verificar.
  Reportes y Lotes pasan a la hoja; se miran, no se usan a cada rato.
*/
const PRINCIPALES_VENTA = ['/venta', '/venta/pedidos', '/venta/tablero'];
const PRINCIPALES_ADMIN = ['/admin/inventario', '/venta', '/venta/pedidos'];

/**
 * El armazón de la tienda: sus secciones según quién entró. La barra
 * lateral, la de abajo y la hoja viven en Armazon, que comparte con el
 * panel de un revendedor.
 */
export function Disposicion() {
  const { perfil, esAdmin } = useSesion();
  const navegar = useNavigate();
  const donde = useLocation();

  async function salir() {
    await cerrarSesion();
    navegar('/entrar', { replace: true });
  }

  /* Verificación, solo al administrador. La pantalla pasó a ser suya porque
     enseña el nombre de cada vista y cada función protegida. A la vendedora
     le seguía apareciendo el enlace y la llevaba a un rechazo: un callejón
     sin salida dentro de su propio menú. */
  const todos: EnlaceNav[] = esAdmin
    ? [...ENLACES_ADMIN, { a: '/verificacion', texto: 'Verificación', icono: 'verificacion' }]
    : ENLACES_VENTA;

  return (
    <Armazon
      enlaces={todos}
      principales={esAdmin ? PRINCIPALES_ADMIN : PRINCIPALES_VENTA}
      marca={<><Wordmark alto={52} /><Monograma tamano={36} /></>}
      quien={{ nombre: perfil?.nombre ?? 'Sin perfil', rol: perfil?.rol ?? null }}
      alSalir={() => void salir()}
    >
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
    </Armazon>
  );
}
