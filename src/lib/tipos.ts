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
