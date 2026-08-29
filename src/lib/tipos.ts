/**
 * Tipos de dominio del sistema.
 *
 * PROVISIONAL: la convencion del proyecto es generar los tipos de las tablas
 * con `supabase gen types typescript` (script `npm run tipos`). Eso requiere el
 * project-id del Supabase real, que todavia no existe. Mientras tanto, aqui
 * viven solo las formas que consume la interfaz: las VISTAS y los argumentos de
 * las funciones RPC. Cuando se genere `basedatos.tipos.ts`, este archivo debe
 * pasar a derivar de el en vez de declarar campos a mano.
 */

export type Rol = 'admin' | 'vendedora';
export type MetodoProrrateo = 'peso' | 'valor';

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export interface Tasa {
  id: number;
  fecha: string;
  tasa_venta: number;
  tasa_bcv: number;
  vigente: boolean;
  creado_en: string;
}

export interface GrupoPrecio {
  id: number;
  nombre: string;
  precio_usd: number;
  orden: number;
  activo: boolean;
}

export interface Ubicacion {
  id: number;
  nombre: string;
  tipo: 'vitrina' | 'aereo' | 'mostrador' | 'bodega';
  orden: number;
  cuenta_en_cuadre: boolean;
  activo: boolean;
}

/** Vista v_lotes_admin: la tabla `lotes` esta revocada para el cliente. */
export interface LoteAdmin {
  id: number;
  codigo: string;
  fecha_llegada: string;
  tasa_binance_compra: number;
  costo_mercancia_usd: number;
  costo_exhibidores_usd: number;
  costo_flete_usd: number;
  peso_mercancia_g: number;
  peso_exhibidores_g: number;
  metodo: MetodoProrrateo;
  notas: string | null;
  flete_mercancia_usd: number;
  flete_exhibidores_usd: number;
  capex_total_usd: number;
  flete_por_gramo_usd: number | null;
  modelos_cargados: number;
}

/** Vista v_catalogo_venta: lo unico que puede leer la vendedora. Sin costos. */
export interface ModeloVenta {
  id: number;
  sku: string;
  nombre: string;
  categoria: string;
  descripcion: string | null;
  variantes_nota: string | null;
  foto_path: string | null;
  foto_thumb_path: string | null;
  grupo: string | null;
  precio_usd: number | null;
  /** null mientras no exista una tasa vigente. */
  precio_bs: number | null;
  precio_usd_bcv_ref: number | null;
  existencia_total: number;
  activo: boolean;
}

/** Vista v_catalogo_admin: agrega costos y margen. Filtra con es_admin(). */
export interface ModeloAdmin extends ModeloVenta {
  costo_unitario_usd: number;
  flete_unitario_usd: number;
  costo_puesto_usd: number;
  peso_unitario_g: number;
  lote_id: number | null;
  margen_usd: number | null;
  margen_pct: number | null;
  grupo_precio_id: number | null;
  precio_override_usd: number | null;
  lote_codigo: string | null;
}

export interface Existencia {
  modelo_id: number;
  ubicacion_id: number;
  cantidad: number;
}

/* ------------------------------------------------------------ Fase 2 */

export type TipoVenta = 'detal' | 'mayor';
export type MetodoPago = 'punto' | 'pago_movil' | 'transferencia' | 'efectivo_bs' | 'efectivo_usd';

export const METODOS_PAGO: { valor: MetodoPago; texto: string }[] = [
  { valor: 'punto', texto: 'Punto de venta' },
  { valor: 'pago_movil', texto: 'Pago movil' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'efectivo_bs', texto: 'Efectivo Bs' },
  { valor: 'efectivo_usd', texto: 'Efectivo $' },
];

/** Vista v_venta_ubicacion: existencia por ubicacion, sin una sola cifra de costo. */
export interface ModeloEnUbicacion {
  ubicacion_id: number;
  modelo_id: number;
  sku: string;
  nombre: string;
  categoria: string;
  variantes_nota: string | null;
  foto_thumb_path: string | null;
  foto_path: string | null;
  grupo: string | null;
  precio_usd: number | null;
  precio_bs: number | null;
  cantidad: number;
}

/** Una linea del carrito, antes de cobrar. */
export interface LineaCarrito {
  modelo_id: number;
  ubicacion_id: number;
  sku: string;
  nombre: string;
  foto_thumb_path: string | null;
  precio_usd: number;
  precio_bs: number;
  cantidad: number;
  disponible: number;
}

export interface TableroDia {
  usuario_id: string;
  ventas: number;
  total_bs: number;
  piezas: number;
  piezas_premium: number;
  ticket_promedio_bs: number;
}

export interface CuadreUbicacion {
  ubicacion_id: number;
  ubicacion: string;
  orden: number;
  esperado: number;
  conteo_id: number | null;
  cantidad_contada: number | null;
  diferencia: number | null;
  contado_en: string | null;
}

export interface Kit {
  id: number;
  nombre: string;
  tipo: 'fijo' | 'armado';
  precio_por_pieza_usd: number;
  n_piezas: number;
  descripcion: string | null;
  activo: boolean;
}

export interface VentaPorDia {
  dia: string;
  ventas: number;
  piezas: number;
  total_bs: number;
  total_usd: number;
  costo_usd: number;
  ganancia_usd: number;
}

export interface MezclaGrupo {
  grupo: string;
  orden: number;
  piezas: number;
  ingreso_usd: number;
  ganancia_usd: number;
}

export interface RotacionModelo {
  id: number;
  sku: string;
  nombre: string;
  categoria: string;
  grupo: string;
  piezas_vendidas: number;
  ultima_venta: string | null;
  dias_sin_vender: number | null;
  dias_en_inventario: number;
  existencia: number;
  costo_puesto_usd: number;
  ganancia_usd: number;
}

/* ------------------------------------------------------------ Fase 3 */

export type EstadoReserva = 'abierta' | 'confirmada' | 'vencida' | 'cancelada';

/** Vista v_disponible_publico: lo unico que ve quien abre el enlace. */
export interface ModeloPublico {
  id: number;
  sku: string;
  nombre: string;
  categoria: string;
  variantes_nota: string | null;
  foto_path: string | null;
  foto_thumb_path: string | null;
  precio_usd: number | null;
  precio_bs: number | null;
  /** Existencia menos lo reservado y vigente. */
  disponible: number;
}

export interface Tramo {
  id: number;
  min_piezas: number;
  precio_por_pieza_usd: number;
  activo: boolean;
}

export interface ItemReserva {
  modelo_id: number;
  cantidad: number;
  sku: string;
  nombre: string;
  variantes_nota: string | null;
  foto_thumb_path: string | null;
}

/** Lo que devuelve ver_reserva(token). Sin una sola cifra de costo. */
export interface ReservaVista {
  estado: EstadoReserva;
  creado_en: string;
  expira_en: string;
  cliente_nombre: string | null;
  piezas: number | null;
  precio_por_pieza_usd: number | null;
  total_usd: number | null;
  items: ItemReserva[];
}

/** Vista v_pedido_vendedora: una fila por pieza, con su ubicacion. */
export interface LineaPedido {
  reserva_id: number;
  token: string;
  estado: EstadoReserva;
  creado_en: string;
  expira_en: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  piezas_total: number | null;
  total_usd: number | null;
  modelo_id: number;
  sku: string;
  nombre: string;
  variantes_nota: string | null;
  foto_thumb_path: string | null;
  cantidad: number;
  ubicacion: string;
}
