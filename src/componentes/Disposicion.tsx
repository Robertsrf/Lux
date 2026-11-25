import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Monograma, Wordmark } from './Marca';
import { Armazon } from './Armazon';
import type { EnlaceNav } from './Armazon';
import { Cargando, LimiteDeError } from './Piezas';
import { useSesion } from '../hooks/useSesion';
import { cerrarSesion } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { ENLACES_ADMIN, PRINCIPALES_ADMIN } from '../lib/menu';

/* El menú del administrador, por grupos, vive en lib/menu.ts (fase 9). */

const ENLACES_VENTA: EnlaceNav[] = [
  { a: '/venta',          texto: 'Mostrador', icono: 'mostrador' },
  { a: '/venta/pedidos',  texto: 'Pedidos',   icono: 'pedidos' },
  { a: '/clientes',       texto: 'Clientes',  icono: 'clientes' },
  { a: '/venta/tablero',  texto: 'Mi día',    icono: 'dia' },
  { a: '/venta/cierre',   texto: 'Cierre',    icono: 'cierre' },
  { a: '/venta/conteo',   texto: 'Conteo',    icono: 'conteo' },
  // El codigo de oferta que trae una clienta.
  { a: '/venta/codigo',   texto: 'Código',    icono: 'pedidos' },
  { a: '/tasas',          texto: 'Tasas',     icono: 'tasas' },
  // El PDF, el enlace para WhatsApp y cuánta gente lo abre.
  { a: '/catalogo',       texto: 'Catálogo',  icono: 'catalogo' },
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

  Las del administrador cambiaron cuando empezo a vender, y otra vez en la
  fase 9: Inicio (que le dice que le toca hoy), el Mostrador y Pedidos.
  Estan en lib/menu.ts, con el menu por grupos.
*/
const PRINCIPALES_VENTA = ['/venta', '/venta/pedidos', '/venta/tablero'];

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

  /* Verificación va en el menú del administrador (grupo Sistema) y nunca en
     el de la vendedora: enseña el nombre de cada vista y cada función
     protegida, y a ella la llevaba a un rechazo. */
  const vencidos = useCreditosVencidos(esAdmin);
  const todos: EnlaceNav[] = esAdmin
    ? ENLACES_ADMIN.map((e) => (e.a === '/admin/credito' && vencidos > 0
        ? { ...e, aviso: `${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}` }
        : e))
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

/**
 * Cuántos créditos vencieron sin pagarse (`creditos_vencidos()`, #71), para
 * el aviso del menú. Al entrar, al cambiar de pantalla y al volver a la
 * pestaña. Sin el #71, o si falla, 0: el menú no depende de esto.
 */
function useCreditosVencidos(esAdmin: boolean): number {
  const [n, setN] = useState(0);
  const donde = useLocation();
  useEffect(() => {
    if (!esAdmin) { setN(0); return; }
    let vigente = true;
    const leer = async () => {
      const { data, error } = await supabase.rpc('creditos_vencidos');
      if (vigente) setN(error ? 0 : Number(data ?? 0));
    };
    void leer();
    const alVolver = () => { if (document.visibilityState === 'visible') void leer(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vigente = false; document.removeEventListener('visibilitychange', alVolver); };
  }, [esAdmin, donde.pathname]);
  return n;
}
