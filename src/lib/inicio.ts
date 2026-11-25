import { formatearBcv, formatearBs } from './dinero.ts';

/**
 * Lo que devuelve `admin_inicio()` (#76): solo cuentas, sacadas de las
 * vistas de siempre. Una cifra puede llegar null si la base cambia; se lee
 * como cero.
 */
export interface ResumenInicio {
  ventas_por_verificar: number | null;
  por_verificar_bs: number | null;
  abonos_por_revisar: number | null;
  pedidos_por_entregar: number | null;
  pedidos_vencidos: number | null;
  apartados_por_aprobar: number | null;
  creditos_vencidos: number | null;
  vencido_bcv: number | null;
  conteos_por_revisar: number | null;
}

export interface Pendiente {
  clave: keyof ResumenInicio;
  cuantos: number;
  texto: string;
  detalle: string | null;
  /** La pantalla donde se resuelve. */
  a: string;
  /** Vencido: se dice en rojo apagado. */
  urgente: boolean;
}

const n = (v: number | null | undefined) => Number(v ?? 0) || 0;
const contar = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

/**
 * "Para hoy" del Inicio: solo lo que tiene algo, lo vencido primero, y
 * cada cosa con la pantalla donde se resuelve. Sin el #76 (null), nada:
 * la pantalla dice que falta instalarlo.
 */
export function pendientesDeInicio(r: ResumenInicio | null): Pendiente[] {
  if (!r) return [];
  const lista: Pendiente[] = [];
  const poner = (clave: keyof ResumenInicio, texto: (k: number) => string, a: string,
                 detalle: string | null = null, urgente = false) => {
    const k = n(r[clave]);
    if (k > 0) lista.push({ clave, cuantos: k, texto: texto(k), detalle, a, urgente });
  };

  poner('creditos_vencidos', (k) => contar(k, 'crédito vencido', 'créditos vencidos'), '/admin/credito',
    n(r.vencido_bcv) > 0 ? `${formatearBcv(n(r.vencido_bcv))} por cobrar` : null, true);
  poner('ventas_por_verificar', (k) => contar(k, 'venta por verificar', 'ventas por verificar'), '/venta/pedidos',
    n(r.por_verificar_bs) > 0 ? `${formatearBs(n(r.por_verificar_bs))} sin comprobar` : null);
  poner('abonos_por_revisar', (k) => contar(k, 'pago por revisar', 'pagos por revisar'), '/venta/pedidos',
    'Di si llegó o no llegó');
  poner('pedidos_por_entregar', (k) => contar(k, 'pedido pagado por entregar', 'pedidos pagados por entregar'), '/venta/pedidos');
  poner('apartados_por_aprobar', (k) => contar(k, 'pedido de revendedor por aprobar', 'pedidos de revendedores por aprobar'), '/venta/pedidos',
    'Ya le pagaron a Lux');
  poner('pedidos_vencidos', (k) => contar(k, 'pedido vencido con dinero', 'pedidos vencidos con dinero'), '/venta/pedidos',
    'Para archivar');
  poner('conteos_por_revisar', (k) => contar(k, 'conteo por revisar', 'conteos por revisar'), '/venta/conteo',
    'Hay piezas que no cuadran');
  return lista;
}
