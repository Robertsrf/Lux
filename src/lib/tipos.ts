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
  /** Cuantas joyas vinieron en el envio, no cuantas se han cargado. */
  piezas_mercancia: number;
  /** Los exhibidores tambien son bultos y pagan su flete. */
  unidades_exhibidores: number;
  notas: string | null;
  flete_mercancia_usd: number;
  flete_exhibidores_usd: number;
  capex_total_usd: number;
  /** Lo que paga de flete cada bulto: flete / (joyas + exhibidores). */
  flete_por_unidad_usd: number | null;
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
  /** Precio de etiqueta, en DOLARES BCV. */
  precio_usd: number | null;
  /** null mientras no exista una tasa vigente. */
  precio_bs: number | null;
  /** Lo que el negocio conserva de verdad: precio_bs / tasa_venta. */
  precio_usd_real: number | null;
  existencia_total: number;
  activo: boolean;
}

/** Vista v_catalogo_admin: agrega costos y margen. Filtra con es_admin(). */
export interface ModeloAdmin extends ModeloVenta {
  costo_unitario_usd: number;
  flete_unitario_usd: number;
  costo_puesto_usd: number;
  /** Lo que la pieza carga de alquiler, sueldo y empaque, en BCV. */
  costo_operativo_usd: number;
  /** 1 si no se dano nada; 1,025 si se perdieron 3 de 120. */
  factor_merma: number;
  /** La mercancia llevada a BCV con la brecha, ya con la merma. */
  costo_mercancia_bcv: number;
  /** mercancia en BCV + gastos. Todo en dolares BCV. */
  costo_total_usd: number;
  lote_id: number | null;
  /** Ganancia en dolares BCV, la moneda de la etiqueta. */
  margen_usd: number | null;
  margen_pct: number | null;
  /** La misma ganancia en dolares reales: los que se pueden reinvertir. */
  ganancia_real_usd: number | null;
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
  /** Hasta donde puede bajar la vendedora. Nunca revela el costo. */
  precio_minimo_usd: number | null;
  precio_minimo_bs: number | null;
}

/** Una linea del carrito, antes de cobrar. */
export interface LineaCarrito {
  modelo_id: number;
  ubicacion_id: number;
  sku: string;
  nombre: string;
  foto_thumb_path: string | null;
  /** Lo que se va a cobrar: puede haber bajado por regateo. */
  precio_usd: number;
  precio_bs: number;
  /** Lo que marca la etiqueta, para saber cuanto se rebajo. */
  precio_lista_bs: number;
  /** El piso que fijo el dueno. */
  precio_minimo_bs: number;
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
  /** Descuento sobre lo que valen sus piezas, en por ciento. */
  descuento_pct: number;
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
  /** Descuento sobre el subtotal, en por ciento. */
  descuento_pct: number;
  activo: boolean;
}

export interface ItemReserva {
  modelo_id: number;
  cantidad: number;
  sku: string;
  nombre: string;
  variantes_nota: string | null;
  foto_thumb_path: string | null;
  precio_usd: number | null;
}

/** Lo que devuelve ver_reserva(token). Sin una sola cifra de costo. */
export interface ReservaVista {
  estado: EstadoReserva;
  creado_en: string;
  expira_en: string;
  cliente_nombre: string | null;
  piezas: number | null;
  subtotal_usd: number | null;
  descuento_pct: number | null;
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

/** Lo que devuelve admin_sugerir_precio: el resultado y todo el camino. */
export interface PrecioSugerido {
  flete_unitario_usd: number;
  costo_puesto_usd: number;
  /** tasa_venta / tasa_bcv: cuantos dolares BCV valen un dolar real. */
  factor_brecha: number;
  /** La mercancia ya en BCV, con la brecha y la merma aplicadas. */
  costo_mercancia_bcv: number;
  /** Lo que carga de tienda, ya en BCV: no se multiplica por la brecha. */
  costo_operativo_usd: number;
  factor_merma: number;
  costo_total_usd: number;
  costo_en_bcv: number;
  margen_objetivo_pct: number;
  precio_sugerido_bcv: number;
  grupo_id: number | null;
  grupo_nombre: string | null;
  grupo_precio_bcv: number | null;
  /** false cuando ningun grupo llega al precio sugerido. */
  grupo_alcanza: boolean;
  precio_grupo_real: number | null;
  margen_resultante_pct: number | null;
}

/** Vista v_kits_resumen: lo que cuesta un kit, ya con su descuento. */
export interface KitResumen {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  descuento_pct: number;
  piezas: number;
  subtotal_usd: number;
  total_usd: number;
}

/** Una frase o recordatorio de la guia del colaborador. */
export interface Consejo {
  id: number;
  momento: string;
  etiqueta: string | null;
  texto: string;
  nota: string | null;
  orden: number;
}

/* ------------------------------------------ Inversiones y recuperación */

export interface Inversion {
  id: number;
  nombre: string;
  categoria: string;
  monto_usd: number;
  fecha: string;
  /** null = no entra al precio; solo se recupera de la ganancia. */
  amortizar_meses: number | null;
  /** 'bcv' si se pago aqui en bolivares, 'real' si se compro afuera. */
  moneda: 'bcv' | 'real';
  notas: string | null;
  activo: boolean;
}

/** Vista v_recuperacion: cuánto de lo invertido ya volvió. */
export interface Recuperacion {
  invertido_mercancia_usd: number;
  invertido_exhibidores_usd: number;
  invertido_mobiliario_usd: number;
  invertido_activos_usd: number;
  invertido_total_usd: number;
  mercancia_recuperada_usd: number;
  mercancia_en_vitrina_usd: number;
  ganancia_acumulada_usd: number;
  ingreso_acumulado_usd: number;
  piezas_vendidas: number;
  activos_recuperado_pct: number | null;
  mercancia_recuperada_pct: number | null;
}

/** Vista v_equilibrio: cuántas piezas al mes tapan los gastos. */
export interface Equilibrio {
  gastos_mes_usd: number;
  piezas_vendidas: number;
  contribucion_por_pieza_usd: number | null;
  piezas_para_equilibrio: number | null;
}

/** Vista v_diagnostico: la salud del negocio en una sola fila. */
export interface Diagnostico {
  gastos_mes_usd: number;
  piezas_cargadas: number;
  piezas_objetivo: number;
  meses_rotacion: number;
  volumen_mes: number;
  /** 'ventas' cuando ya hay un mes cumplido; 'estimado' antes de eso. */
  volumen_origen: 'ventas' | 'estimado';
  costo_operativo_pieza_usd: number;
  piezas_danadas_mes: number;
  merma_pct: number;
  modelos: number;
  /** El costo de mercancia como se pago: dolares Binance. */
  costo_mercancia_real_usd: number;
  /** El mismo costo llevado a BCV, ya con la merma. */
  costo_mercancia_promedio_usd: number;
  costo_total_promedio_usd: number;
  precio_bcv_promedio: number;
  ganancia_objetivo_mes_usd: number;
  /** El margen que hace falta para llegar al objetivo mensual. */
  margen_sugerido_pct: number | null;
  precio_sugerido_promedio_bcv: number | null;
  /** Lo que dejan los precios que ya estan puestos. */
  margen_actual_pct: number | null;
  ganancia_proyectada_mes_usd: number;
  piezas_equilibrio: number | null;
}

/** Superficies donde una frase del banco puede aparecer. */
export type Superficie = "TV" | "VEND" | "CAPTION";

/** Tabla frases: el banco de la casa. El id es el del documento (SLG-01). */
export interface FraseCategoria {
  codigo: string;
  nombre: string;
  tono: string | null;
  /** La nota interna del banco. La de CUI avisa que el IP negro no
   *  aguanta la misma demostracion que el oro. */
  nota: string | null;
}

export interface Frase {
  id: string;
  categoria: string;
  superficie: Superficie[];
  texto: string;
  orden: number;
}
