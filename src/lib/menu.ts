import type { EnlaceNav } from '../componentes/Armazon';

/**
 * El menú del administrador, por grupos (fase 9, decisión del dueño del
 * 24/11/2026). Antes eran 24 secciones en una sola lista; ahora cada una
 * vive en el grupo de lo que hace. Inicio va solo, arriba. Verificación,
 * que no estaba en la lista del dueño, va al final en "Sistema".
 *
 * Aquí y no en Disposicion para poder probarlo sin React
 * (`scripts/pruebas/menu.test.mjs`): una ruta en un solo sitio y ninguna
 * de las de antes perdida.
 */
export const ENLACES_ADMIN: EnlaceNav[] = [
  { a: '/admin',              texto: 'Inicio',       icono: 'inicio' },

  // El administrador también vende, cierra el día y cuenta.
  { a: '/venta',              texto: 'Mostrador',    icono: 'mostrador',    grupo: 'Vender' },
  { a: '/venta/pedidos',      texto: 'Pedidos',      icono: 'pedidos',      grupo: 'Vender' },
  { a: '/venta/codigo',       texto: 'Código',       icono: 'pedidos',      grupo: 'Vender' },
  { a: '/venta/cierre',       texto: 'Cierre',       icono: 'cierre',       grupo: 'Vender' },
  { a: '/venta/conteo',       texto: 'Conteo',       icono: 'conteo',       grupo: 'Vender' },

  { a: '/admin/flujo',        texto: 'Flujo',        icono: 'flujo',        grupo: 'Dinero' },
  { a: '/admin/caja',         texto: 'Caja',         icono: 'caja',         grupo: 'Dinero' },
  // Quién le debe a la tienda; dice cuántos créditos vencieron.
  { a: '/admin/credito',      texto: 'Crédito',      icono: 'clientes',     grupo: 'Dinero' },
  { a: '/admin/reportes',     texto: 'Reportes',     icono: 'reportes',     grupo: 'Dinero' },
  { a: '/admin/costos',       texto: 'Costos',       icono: 'reportes',     grupo: 'Dinero' },
  { a: '/admin/inversiones',  texto: 'Inversiones',  icono: 'lotes',        grupo: 'Dinero' },

  { a: '/admin/inventario',   texto: 'Inventario',   icono: 'inventario',   grupo: 'Mercancía' },
  { a: '/admin/lotes',        texto: 'Lotes',        icono: 'lotes',        grupo: 'Mercancía' },
  { a: '/admin/grupos',       texto: 'Grupos',       icono: 'grupos',       grupo: 'Mercancía' },
  { a: '/admin/tramos',       texto: 'Tramos',       icono: 'tramos',       grupo: 'Mercancía' },
  { a: '/tasas',              texto: 'Tasas',        icono: 'tasas',        grupo: 'Mercancía' },

  { a: '/clientes',           texto: 'Clientes',     icono: 'clientes',     grupo: 'Gente' },
  { a: '/admin/vendedoras',   texto: 'Vendedoras',   icono: 'vendedoras',   grupo: 'Gente' },
  { a: '/admin/revendedores', texto: 'Revendedores', icono: 'revendedores', grupo: 'Gente' },
  // La guía pública que se manda a quien quiere ser revendedor.
  { a: '/admin/capacitacion', texto: 'Capacitación revendedores', icono: 'capacitacion', grupo: 'Gente' },

  { a: '/admin/landing',      texto: 'Landing',      icono: 'catalogo',     grupo: 'En línea' },
  { a: '/admin/textos',       texto: 'Textos',       icono: 'catalogo',     grupo: 'En línea' },
  { a: '/catalogo',           texto: 'Catálogo',     icono: 'catalogo',     grupo: 'En línea' },
  { a: '/vitrina',            texto: 'Vitrina',      icono: 'vitrina',      grupo: 'En línea' },

  // Enseña el nombre de cada vista y función protegida: solo el dueño.
  { a: '/verificacion',       texto: 'Verificación', icono: 'verificacion', grupo: 'Sistema' },
];

/**
 * Las tres de la barra de abajo del teléfono: las que se tocan a diario.
 * Desde la fase 9 el dueño entra al Inicio, que le dice qué le toca; el
 * Inventario pasa a la hoja.
 */
export const PRINCIPALES_ADMIN = ['/admin', '/venta', '/venta/pedidos'];

export interface GrupoNav { titulo: string; enlaces: EnlaceNav[] }

/**
 * Los enlaces partidos por su grupo, en el orden en que llegan. Los que no
 * dicen grupo (la vendedora, el panel del revendedor) van todos a uno sin
 * título, así el armazón los pinta como siempre.
 */
export function agruparEnlaces(enlaces: EnlaceNav[]): GrupoNav[] {
  const grupos: GrupoNav[] = [];
  for (const e of enlaces) {
    const titulo = e.grupo ?? '';
    let g = grupos.find((x) => x.titulo === titulo);
    if (!g) { g = { titulo, enlaces: [] }; grupos.push(g); }
    g.enlaces.push(e);
  }
  return grupos;
}
