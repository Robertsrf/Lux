/**
 * Vender desde el panel del revendedor (fase 7): las cuentas y lo que
 * falta para seguir, puras, sin React ni red. Las prueba
 * scripts/pruebas/vender-rv.test.mjs.
 *
 * La base manda (`rv_vender`, #74): reconoce a su clienta, aparta y anota
 * el pago. Esto solo ENSEÑA antes de guardar lo mismo que ella va a hacer.
 */
import {
  abonoEnBcv, binanceDesdeBs, bsDeBcv, centavoArriba, faltaTrasAbono, formatearBcv, formatearBs, leerCifra,
  margenDeAbono, minimoParaApartar, precioEnBs, totalDeLineas,
} from '../../../../lib/dinero.ts';
import type { Tasas } from '../../../../lib/dinero.ts';
import { METODOS_EN_DOLARES } from '../../../../lib/tipos.ts';
import type { ClienteRevendedor, MetodoPago, PiezaRevendedor } from '../../../../lib/tipos.ts';

/** Modelo → cuántas lleva. */
export type Carrito = Map<number, number>;

export type Cobro = 'todo' | 'parte' | 'no';

export type EstadoVender = {
  carrito: Carrito;
  /** La clienta que eligió de su lista; null: una nueva. */
  clientaId: number | null;
  /** Lo escrito de una clienta nueva (o el teléfono que le falta a la elegida). */
  nueva: { nombre: string; telefono: string; apellido: string; cedula: string };
  cobro: Cobro | null;
  metodo: MetodoPago;
  monto: string;
  referencia: string;
};

export const TELEFONO_INCOMPLETO = 'Falta su teléfono con el código, por ejemplo 0412 1234567.';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soloDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Lo suyo primero; con "tuyas", solo lo suyo. Busca sin tildes ni mayúsculas. */
export function ordenarPiezas(piezas: PiezaRevendedor[], ver: 'tuyas' | 'todas', texto: string): PiezaRevendedor[] {
  const t = sinTildes(texto.trim());
  return piezas
    .filter((p) => ver === 'todas' || (p.mias ?? 0) > 0)
    .filter((p) => !t || sinTildes(`${p.nombre} ${p.variante ?? ''} ${p.sku} ${p.categoria}`).includes(t))
    .sort((a, b) => {
      const suyaA = (a.mias ?? 0) > 0 ? 0 : 1;
      const suyaB = (b.mias ?? 0) > 0 ? 0 : 1;
      if (suyaA !== suyaB) return suyaA - suyaB;
      return `${a.nombre} ${a.variante ?? ''}`.localeCompare(`${b.nombre} ${b.variante ?? ''}`, 'es');
    });
}

/**
 * Lo que cobra a su clienta y lo que le paga a Lux. El pedido toma primero
 * de su inventario (#72): eso no se le paga a Lux.
 */
export function cuentasDe(piezas: PiezaRevendedor[], carrito: Carrito) {
  const elegidas = piezas
    .filter((p) => (carrito.get(p.id) ?? 0) > 0)
    .map((p) => ({ p, n: carrito.get(p.id) ?? 0 }));
  const cobras = totalDeLineas(elegidas.map(({ p, n }) => ({ precio: Number(p.precio_usd), cantidad: n })));
  const lux = totalDeLineas(elegidas.map(({ p, n }) => ({
    precio: Number(p.precio_lux_usd ?? 0),
    cantidad: Math.max(n - (p.mias ?? 0), 0),
  })));
  const cuantas = elegidas.reduce((s, e) => s + e.n, 0);
  const todasTuyas = cuantas > 0 && elegidas.every(({ p, n }) => n <= (p.mias ?? 0));
  return { piezas: cuantas, cobras, lux, todasTuyas };
}

/**
 * El carrito guardado contra lo que hay ahora: lo que ya no viene se quita
 * y lo que pasa de lo libre se baja. Devuelve los nombres para decirlo.
 */
export function conciliarCarrito(piezas: PiezaRevendedor[], carrito: Carrito) {
  const porId = new Map(piezas.map((p) => [p.id, p]));
  const nuevo: Carrito = new Map();
  const quitadas: string[] = [];
  const bajadas: string[] = [];
  for (const [id, n] of carrito) {
    const p = porId.get(id);
    if (!p || p.disponible <= 0) {
      quitadas.push(p ? p.nombre : `SKU${id}`);
      continue;
    }
    if (n > p.disponible) bajadas.push(p.nombre);
    nuevo.set(id, Math.min(n, p.disponible));
  }
  return { carrito: nuevo, quitadas, bajadas };
}

/** Los diez últimos dígitos de un teléfono: "0412-123.45.67" y "+58 412 1234567" son el mismo. */
export function digitosTelefono(t: string | null | undefined): string {
  return soloDigitos(t).slice(-10);
}

/** Sus clientas por nombre, apellido, teléfono o cédula (por dígitos). Hasta 20. */
export function buscarClientas(clientas: ClienteRevendedor[], texto: string): ClienteRevendedor[] {
  const t = sinTildes(texto.trim());
  const d = soloDigitos(texto);
  const lista = !t
    ? clientas
    : clientas.filter((c) =>
      sinTildes(`${c.nombre} ${c.apellido ?? ''}`).includes(t)
      || (d.length >= 3 && (soloDigitos(c.telefono).includes(d) || soloDigitos(c.cedula).includes(d))));
  return lista.slice(0, 20);
}

/** La suya con esa cédula o, si no, con ese teléfono. Como `rv_crear_apartado`. */
export function clientaConDato(clientas: ClienteRevendedor[], cedula: string, telefono: string): ClienteRevendedor | null {
  const ced = soloDigitos(cedula);
  if (ced.length >= 6) {
    const c = clientas.find((x) => soloDigitos(x.cedula) === ced);
    if (c) return c;
  }
  const tel = digitosTelefono(telefono);
  if (tel.length === 10) {
    const conTel = clientas.filter((x) => digitosTelefono(x.telefono) === tel);
    if (conTel.length) return conTel.reduce((a, b) => (b.id > a.id ? b : a));
  }
  return null;
}

/**
 * Lo que cubre el total en la moneda del método: bolívares a la tasa BCV o,
 * en dólares, esos bolívares entre la tasa Binance, al centavo HACIA ARRIBA
 * (un centavo de más está dentro de la tolerancia de la base).
 */
export function montoQueCubre(totalBcv: number, metodo: MetodoPago, tasa: Tasas): number {
  const bs = precioEnBs(totalBcv, tasa) ?? 0;
  if (!METODOS_EN_DOLARES.includes(metodo)) return bs;
  return centavoArriba(binanceDesdeBs(bs, tasa.tasa_venta) ?? 0);
}

/** Una cifra para ponerla en un campo, como se escribe aquí: "1104,50" (la lee `leerCifra`). */
export function cifraParaCampo(valor: number): string {
  return valor.toFixed(2).replace('.', ',');
}

/** Lo que el pago deja: null si no hay un monto que se entienda. */
export function pagoDe(estado: EstadoVender, totalBcv: number, tasa: Tasas) {
  const valor = leerCifra(estado.monto);
  if (valor === null || valor <= 0) return null;
  const enDolares = METODOS_EN_DOLARES.includes(estado.metodo);
  const abono = abonoEnBcv(valor, enDolares, tasa);
  return { valor, ...abono, ...faltaTrasAbono(totalBcv, abono.bcv, margenDeAbono(enDolares, tasa)) };
}

/**
 * Null si puede seguir; si no, la frase que va bajo el botón.
 * `total` es lo que cobra (en $ BCV); `elegida`, la clienta de su lista.
 */
export function faltaParaSeguir(
  paso: 1 | 2 | 3,
  estado: EstadoVender,
  resumen: { dias_credito: number | null | undefined; inicial_pct: number | null | undefined },
  tasa: Tasas | null,
  total: number,
  elegida: ClienteRevendedor | null = null,
): string | null {
  const cuantas = [...estado.carrito.values()].reduce((s, n) => s + n, 0);
  if (cuantas <= 0) return 'Elige al menos una pieza.';
  if (paso === 1) return null;

  if (estado.clientaId !== null && elegida) {
    if (digitosTelefono(elegida.telefono).length < 10 && digitosTelefono(estado.nueva.telefono).length < 10) {
      return TELEFONO_INCOMPLETO;
    }
  } else {
    if (!estado.nueva.nombre.trim() && !estado.nueva.telefono.trim()) return 'Elige una de tus clientas o escribe una nueva.';
    if (!estado.nueva.nombre.trim()) return 'Falta su nombre.';
    if (digitosTelefono(estado.nueva.telefono).length < 10) return TELEFONO_INCOMPLETO;
    const ced = soloDigitos(estado.nueva.cedula);
    if (ced.length > 0 && ced.length < 6) return 'Esa cédula está incompleta.';
  }
  if (paso === 2) return null;

  if (estado.cobro === null) return 'Elige si ya te pagó.';
  if (estado.cobro === 'no') return null;
  if (!tasa) return 'Falta la tasa del día. Recarga la página.';
  const pago = pagoDe(estado, total, tasa);
  if (!pago) return 'Escribe cuánto te pagó.';
  if (pago.pasa) return 'Es más que el total.';
  if (estado.cobro === 'todo') {
    return pago.falta > 0 ? 'Es menos que el total. Si te pagó una parte, elige «Una parte».' : null;
  }
  // Una parte: solo con días de crédito, y al menos el mínimo para apartar.
  if (!resumen.dias_credito) return `No das días de crédito: tiene que pagarte el total, ${formatearBcv(total)}.`;
  const pct = Number(resumen.inicial_pct ?? 0);
  const minimo = pct > 0 ? minimoParaApartar(total, pct) : total;
  if (pago.bcv < minimo - 0.005) {
    return `Para confirmar tiene que pagarte al menos ${formatearBcv(minimo)}, hoy ${formatearBs(bsDeBcv(minimo, tasa.tasa_bcv))}.`;
  }
  return null;
}
