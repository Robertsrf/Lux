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

type Rol = 'admin' | 'vendedora';

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

/** Vista v_tasas: el historico con el nombre de quien fijo cada una. */
export interface TasaHistorica extends Tasa {
  registrado_por_nombre: string | null;
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
  /** Donde hay existencia, en el orden de la tienda: "Vitrina 1 · Bodega". Null si en ninguna. */
  ubicaciones: string | null;
  /** Lo mismo en clave de tienda, "V1 · BG": para lo que se mira de cara al publico. */
  ubicaciones_codigo: string | null;
  /** Hasta donde puede bajar la vendedora. Nunca revela el costo. */
  precio_minimo_usd?: number | null;
  precio_minimo_bs?: number | null;
  /**
   * La familia de variantes: el id de la cabeza, o el suyo si va suelta.
   * Nunca null, asi que se agrupa por aqui sin preguntar nada mas.
   */
  familia: number;
  /** Lo que la distingue de sus hermanas: "45 cm". Null si va suelta. */
  variante: string | null;
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
export type MetodoPago = 'punto' | 'pago_movil' | 'transferencia' | 'efectivo_bs' | 'efectivo_usd' | 'binance';

export const METODOS_PAGO: { valor: MetodoPago; texto: string }[] = [
  { valor: 'punto', texto: 'Punto de venta' },
  { valor: 'pago_movil', texto: 'Pago movil' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'efectivo_bs', texto: 'Efectivo Bs' },
  { valor: 'efectivo_usd', texto: 'Efectivo $' },
  { valor: 'binance', texto: 'Binance' },
];

/**
 * Las formas de pago en dolares. Las dos se cobran a la tasa Binance: el
 * total en bolivares dividido entre ella, que es justo el `total_usd` que
 * la base guarda de cada venta.
 */
export const METODOS_EN_DOLARES: readonly MetodoPago[] = ['efectivo_usd', 'binance'];

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
  /** Hasta donde puede bajar la vendedora regateando. Nunca revela el costo. */
  precio_minimo_usd: number | null;
  precio_minimo_bs: number | null;
  familia: number;
  variante: string | null;
  /**
   * Hasta donde baja el descuento por CANTIDAD: el piso de margen, sin la
   * rebaja maxima del regateo. Solo lo usa el carrito para ensenar lo mismo
   * que va a cobrar `registrar_venta`.
   */
  piso_tramo_usd: number | null;
  piso_tramo_bs: number | null;
}

/** Una linea del carrito, antes de cobrar. Todo en dolares BCV salvo los _bs. */
export interface LineaCarrito {
  modelo_id: number;
  ubicacion_id: number;
  sku: string;
  nombre: string;
  variante: string | null;
  foto_thumb_path: string | null;
  /** Lo que marca la etiqueta. */
  precio_lista_usd: number;
  precio_lista_bs: number;
  /** El piso del regateo que fijo el dueno. */
  precio_minimo_usd: number;
  precio_minimo_bs: number;
  /** El piso del descuento por cantidad. */
  piso_tramo_usd: number;
  /** Lo que ella negocio a mano, o null. Solo cuenta sin tramo. */
  precio_manual_usd: number | null;
  cantidad: number;
  disponible: number;
}

/** Una linea ya calculada: lo que se va a cobrar de verdad y por que. */
export interface LineaCobro extends LineaCarrito {
  precio_final_usd: number;
  precio_final_bs: number;
  motivo: 'regateo' | 'tramo' | null;
}

export interface TableroDia {
  usuario_id: string;
  ventas: number;
  total_bs: number;
  piezas: number;
  piezas_premium: number;
  ticket_promedio_bs: number;
  /** Lo vendido hoy, en dolares BCV con la tasa de cada venta. */
  total_bcv: number;
  ticket_promedio_bcv: number;
}

/**
 * meta_vendedora(): como va la tienda, en PIEZAS y nada mas. Sale de la
 * misma cuenta que ve el dueno en Costos, sin una sola cifra de dinero.
 */
export interface MetaVendedora {
  /** Null mientras el dueno no diga cuantos dias abre la tienda. */
  meta_hoy: number | null;
  meta_mes: number | null;
  /** 'meta': cubre el mes y deja la ganancia que busca el dueno. 'equilibrio': solo cubre el mes. */
  para: 'meta' | 'equilibrio' | null;
  /** De toda la tienda, no solo de ella: la meta es de la tienda. */
  vendidas_hoy: number;
  vendidas_mes: number;
  dia_del_mes: number;
  dias_del_mes: number;
  ritmo_mes: number | null;
  dias_abiertos: number;
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

/**
 * Vista v_ventas_por_dia. Todo en dolares BCV, con la tasa de cada venta.
 *
 * `ganancia_usd` resta a cada pieza su parte del alquiler calculada con las
 * piezas que se ESPERABA vender: si se vende menos, enseña una ganancia que
 * no existe. Las pantallas usan `contribucion_usd`, que es un hecho.
 */
export interface VentaPorDia {
  dia: string;
  ventas: number;
  piezas: number;
  total_bs: number;
  /** Lo vendido, en dolares BCV. */
  total_usd: number;
  costo_usd: number;
  ganancia_usd: number;
  /** Lo que costo la mercancia vendida, llevada a BCV con la brecha de ese dia. */
  mercancia_usd: number;
  /** Lo que dejaron las ventas despues de pagar la mercancia y el empaque. */
  contribucion_usd: number;
}

export interface MezclaGrupo {
  grupo: string;
  orden: number;
  piezas: number;
  /** Lo vendido, en dolares BCV. */
  ingreso_usd: number;
  ganancia_usd: number;
  /** Lo que dejo despues de la mercancia y el empaque, en dolares BCV. */
  contribucion_usd: number;
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

type EstadoReserva = 'abierta' | 'confirmada' | 'vencida' | 'cancelada';

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
  /** En clave de tienda, "V1 · BG". Nunca el nombre completo: esto lo abre cualquiera. */
  ubicaciones_codigo: string | null;
  familia: number;
  variante: string | null;
}

export interface Tramo {
  id: number;
  min_piezas: number;
  /** Descuento sobre el subtotal, en por ciento. */
  descuento_pct: number;
  activo: boolean;
}

interface ItemReserva {
  modelo_id: number;
  cantidad: number;
  sku: string;
  nombre: string;
  variantes_nota: string | null;
  foto_thumb_path: string | null;
  precio_usd: number | null;
  /** Null en las reservas hechas antes de las variantes, o si va suelta. */
  variante?: string | null;
}

/** Lo que devuelve ver_reserva(token). Sin una sola cifra de costo. */
type FormaEntrega = 'tienda' | 'envio';
type EmpresaEnvio = 'domesa' | 'mrw';

export interface ReservaVista {
  cliente_apellido?: string | null;
  cliente_telefono?: string | null;
  entrega?: FormaEntrega;
  envio_empresa?: EmpresaEnvio | null;
  envio_agencia?: string | null;
  envio_direccion?: string | null;
  pago_metodo?: MetodoPago | null;
  pago_referencia?: string | null;
  pago_fecha?: string | null;
  pago_reportado_en?: string | null;
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
  cliente_apellido: string | null;
  cliente_cedula: string | null;
  cliente_telefono: string | null;
  entrega: FormaEntrega;
  envio_empresa: EmpresaEnvio | null;
  envio_agencia: string | null;
  envio_direccion: string | null;
  pago_metodo: MetodoPago | null;
  pago_referencia: string | null;
  pago_fecha: string | null;
  pago_cedula: string | null;
  pago_telefono: string | null;
  pago_reportado_en: string | null;
  piezas_total: number | null;
  total_usd: number | null;
  modelo_id: number;
  sku: string;
  nombre: string;
  variantes_nota: string | null;
  foto_thumb_path: string | null;
  cantidad: number;
  ubicacion: string;
  variante: string | null;
  /** La clienta del maestro con esa cedula, si ya existia al apartar. */
  cliente_id: number | null;
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
  /** Lo minimo que puede cobrar el mostrador sin pedir permiso. */
  precio_minimo_bcv: number | null;
  margen_en_el_piso_pct: number | null;
  /** El margen mas bajo que se acepta al meter la pieza en un grupo. */
  margen_piso_pct: number;
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
  /** Todas las cifras van en dolares BCV, para que las partes sumen el total. */
  invertido_mercancia_usd: number;
  /** Lo que hace falta juntar en Binance para reponer toda la mercancia. */
  invertido_mercancia_real_usd: number;
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
  /** Lo mismo en la moneda en que se compro: dolares Binance. */
  mercancia_vendida_real_usd: number;
  mercancia_en_vitrina_real_usd: number;
  /** Lo que dejaron todas las ventas despues de la mercancia y el empaque, en BCV. */
  contribucion_acumulada_usd: number;
  /** Alquiler, sueldos, servicios y otros de los meses que lleva abierta, en BCV. */
  gastos_operativos_acumulados_usd: number;
  meses_abierta: number;
  gastos_operativos_mes_usd: number;
}

/**
 * Vista v_plan_ventas: cuantas piezas hay que vender. Todo en dolares BCV
 * salvo donde el nombre dice Binance. Una sola fila, solo para el
 * administrador.
 */
export interface PlanVentas {
  gastos_fijos_bcv: number;
  empaque_bcv: number;
  /** De donde sale el promedio: lo vendido en 90 dias, o lo que hay en vitrina. */
  promedio_de: 'ventas' | 'vitrina' | 'nada';
  piezas_promedio: number;
  precio_promedio_bcv: number | null;
  costo_promedio_binance: number | null;
  /** La mercancia llevada a BCV con la brecha de hoy y la merma. */
  costo_promedio_bcv: number | null;
  brecha: number;
  merma_pct: number;
  /** Lo que deja cada pieza: precio − mercancia − empaque. */
  contribucion_pieza_bcv: number | null;
  contribucion_pct: number | null;
  piezas_equilibrio_mes: number | null;
  meta_ganancia_bcv: number;
  piezas_meta_mes: number | null;
  dias_abiertos_mes: number;
  piezas_equilibrio_dia: number | null;
  piezas_meta_dia: number | null;
  vendidas_mes: number;
  contribucion_mes_bcv: number;
  dia_del_mes: number;
  dias_del_mes: number;
  /** A este paso, cuantas piezas cierra el mes. */
  ritmo_piezas_mes: number | null;
  /** Lo que dejo el mes hasta hoy menos los gastos del mes entero. */
  resultado_mes_bcv: number;
  resultado_proyectado_bcv: number | null;
  resultado_proyectado_binance: number | null;
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

/** Vista v_gastos_desglose: los gastos del mes, partida por partida, en BCV. */
export interface GastoPartida {
  partida: string;
  orden: number;
  monto_usd: number;
  porcentaje: number | null;
}

/** Vista v_cobertura_mes: cuanto de los gastos del mes ya taparon las ventas. */
export interface CoberturaMes {
  gastos_mes_usd: number;
  piezas_vendidas: number;
  contribucion_usd: number;
  cubierto_usd: number;
  por_cubrir_usd: number;
  /** Lo que sobra una vez cubierto el mes. Cero mientras falte. */
  ganancia_usd: number;
  cubierto_pct: number;
  contribucion_por_pieza_usd: number | null;
  /** null si todavia no hay ventas con que estimar el ritmo. */
  piezas_faltantes: number | null;
  desde: string;
}

/** Vista v_valor_inventario: cuanto vale lo que hay guardado. */
export interface ValorInventario {
  modelos_con_existencia: number;
  modelos_activos: number;
  piezas: number;
  /** Lo que costo traerlas, ya en BCV y con la merma dentro. */
  costo_bcv: number;
  /** Lo mismo en dolares Binance: lo que hay que juntar para reponer todo. */
  costo_real_usd: number;
  precio_bcv: number;
  /** Precio menos costo. BRUTO: de aqui salen los gastos del mes. */
  margen_bruto_bcv: number;
  margen_bruto_pct: number | null;
  piezas_sin_precio: number;
}

/** Vista v_valor_por_categoria: el mismo valor, abierto. */
export interface ValorCategoriaFila {
  categoria: string;
  piezas: number;
  costo_bcv: number;
  margen_bruto_bcv: number;
  precio_bcv: number;
}

/* ---------------------------------------------------- Maestro de clientas */

/**
 * Vista v_clientes: la ficha con su resumen de compras.
 *
 * `total_usd` va en dolares a proposito. Sumar bolivares de marzo con
 * bolivares de septiembre no dice nada; cada venta guarda su total en
 * dolares congelado con la tasa de ese dia, asi que esa suma si significa
 * algo. Los bolivares se muestran compra por compra.
 */
export interface ClienteResumen {
  id: number;
  cedula: string | null;
  /** Solo los digitos: con esto se busca. */
  cedula_digitos: string | null;
  nombre: string;
  apellido: string | null;
  nombre_completo: string;
  telefono: string | null;
  notas: string | null;
  creado_en: string;
  compras: number;
  piezas: number;
  total_usd: number;
  primera_compra: string | null;
  ultima_compra: string | null;
  /** Hasta cuando le toca lavado y abrillantado, contado desde su ultima compra. */
  servicio_hasta: string | null;
  servicio_vigente: boolean;
  /**
   * Lo que ha comprado, en dolares BCV: la moneda de las etiquetas que ella
   * vio. `total_usd` es la misma suma en dolares Binance, que no se parece a
   * nada que ella haya pagado.
   */
  total_bcv: number;
}

/** Vista v_cliente_compras: una fila por pieza que se llevo. */
export interface CompraCliente {
  cliente_id: number;
  venta_id: number;
  fecha: string;
  tipo: TipoVenta;
  metodo: MetodoPago;
  total_bs: number;
  total_usd: number;
  modelo_id: number;
  sku: string;
  nombre: string;
  categoria: string;
  variantes_nota: string | null;
  foto_thumb_path: string | null;
  cantidad: number;
  precio_unitario_bs: number;
  servicio_hasta: string;
  servicio_vigente: boolean;
  variante: string | null;
}

/**
 * Vista v_ventas_por_verificar: una fila por pieza de cada venta que se
 * registro sin comprobar el pago. Sin costos.
 */
export interface LineaPorVerificar {
  venta_id: number;
  fecha: string;
  usuario_id: string;
  vendedora: string | null;
  metodo: MetodoPago;
  pago_referencia: string | null;
  cliente_id: number | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_cedula: string | null;
  total_bs: number;
  total_bcv: number | null;
  /** ventas.total_usd: los bolivares entre la tasa Binance del dia. */
  total_binance: number;
  modelo_id: number;
  sku: string;
  nombre: string;
  variante: string | null;
  foto_thumb_path: string | null;
  cantidad: number;
  precio_unitario_bs: number;
  ubicacion: string | null;
}

/**
 * Vista v_rebajas: una fila por linea vendida por debajo de su etiqueta.
 * Solo administrador. En dolares BCV, la moneda de la etiqueta.
 */
export interface Rebaja {
  venta_id: number;
  fecha: string;
  usuario_id: string;
  vendedora: string | null;
  modelo_id: number;
  sku: string;
  nombre: string;
  variante: string | null;
  cantidad: number;
  precio_lista_usd: number;
  precio_unitario_usd: number;
  precio_lista_bs: number;
  precio_unitario_bs: number;
  /** Lo que se dejo de cobrar en la linea entera: (lista − cobrado) × cantidad. */
  rebaja_usd: number;
  rebaja_pct: number;
  /** Null en las ventas anteriores a que se guardara el motivo. */
  motivo_rebaja: 'regateo' | 'tramo' | null;
}

/** Lo que el mostrador manda al cobrar: una ficha del maestro o una nueva. */
export interface ClienteDeVenta {
  id?: number | null;
  cedula?: string | null;
  nombre?: string | null;
  apellido?: string | null;
  telefono?: string | null;
}
