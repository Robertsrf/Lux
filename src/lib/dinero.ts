/**
 * Toda la logica de dinero del sistema vive aqui.
 * Si un componente calcula un precio con un `*` suelto, esta mal: traelo aqui.
 *
 * Reglas (PLAN 3 y skill lux-codigo):
 *  1. Nunca `float` para dinero. Se trabaja en enteros de 1/10.000, igual que
 *     el `numeric(12,4)` de la base.
 *  2. El dolar es la unidad ancla; el bolivar es una vista que se calcula.
 *  3. El precio en Bs NUNCA se guarda por modelo. Solo `ventas` congela Bs.
 *  4. El margen se mide en dolares.
 */

/** Un monto en enteros de 1/10.000 (misma escala que numeric(12,4)). */
export type Monto = bigint;

const FACTOR = 10_000n;
const DECIMALES = 4;
const PATRON = /^-?\d*(?:[.,]\d*)?$/;

/** Convierte texto o numero a Monto sin pasar nunca por aritmetica flotante. */
export function aMonto(valor: number | string | null | undefined): Monto {
  if (valor === null || valor === undefined || valor === '') return 0n;

  const texto = typeof valor === 'number'
    ? (Number.isFinite(valor) ? valor.toFixed(DECIMALES) : '0')
    : valor.trim().replace(/\s/g, '');

  if (!PATRON.test(texto)) return 0n;

  const negativo = texto.startsWith('-');
  const sinSigno = negativo ? texto.slice(1) : texto;
  const partes = sinSigno.replace(',', '.').split('.');
  const entera = partes[0] === '' || partes[0] === undefined ? '0' : partes[0];
  const decimal = ((partes[1] ?? '') + '0000').slice(0, DECIMALES);

  const total = BigInt(entera) * FACTOR + BigInt(decimal);
  return negativo ? -total : total;
}

/** Monto -> numero, solo para mostrar o enviar a la base. */
export function deMonto(monto: Monto): number {
  return Number(monto) / Number(FACTOR);
}

export function sumar(montos: Monto[]): Monto {
  return montos.reduce<Monto>((total, m) => total + m, 0n);
}

export function restar(a: Monto, b: Monto): Monto {
  return a - b;
}

/** Multiplica un monto por una cantidad entera de piezas. */
export function porCantidad(monto: Monto, cantidad: number): Monto {
  return monto * BigInt(Math.trunc(cantidad));
}

/** Las dos tasas vigentes. Se pasan juntas a proposito. */
export interface Tasas {
  tasa_venta: number;
  tasa_bcv: number;
}

/**
 * Bolivares que paga la clienta por un precio de etiqueta.
 *
 * El precio de etiqueta esta en DOLARES BCV, asi que se convierte con la
 * tasa del BCV. Recibe la tasa entera y no un numero suelto a proposito:
 * pasarle la tasa de venta por error seria cobrar de mas, en silencio.
 *
 * Solo para previsualizar en formularios; el precio del catalogo lo
 * calcula la vista v_catalogo_venta en la base.
 */
export function precioEnBs(
  precioUsdBcv: number | null,
  tasa: Pick<Tasas, 'tasa_bcv'> | null | undefined,
): number | null {
  if (precioUsdBcv === null || !tasa) return null;
  const bruto = aMonto(precioUsdBcv) * aMonto(tasa.tasa_bcv);   // escala 8
  const centavos = bruto / (FACTOR * 100n);                     // escala 2
  return Number(centavos) / 100;
}

/**
 * Cuantos dolares BCV hay que cobrar para recuperar un dolar real.
 * Es la brecha como multiplicador: con 500 / 250 vale 2.
 */
export function factorBrecha(tasa: Tasas | null | undefined): number | null {
  if (!tasa || !tasa.tasa_bcv) return null;
  return tasa.tasa_venta / tasa.tasa_bcv;
}

/** Dolares REALES que conserva el negocio de un precio en dolares BCV. */
export function aDolaresReales(precioUsdBcv: number | null, tasa: Tasas | null | undefined): number | null {
  const f = factorBrecha(tasa);
  if (precioUsdBcv === null || f === null || f === 0) return null;
  return precioUsdBcv / f;
}

/** Brecha entre la tasa de venta y la del BCV, en tanto por uno. */
export function brecha(tasaVenta: number | null, tasaBcv: number | null): number | null {
  if (!tasaVenta || !tasaBcv) return null;
  return tasaVenta / tasaBcv - 1;
}

/** Desglose del prorrateo de flete de un lote (PLAN 4). */
export interface Prorrateo {
  fleteMercanciaUsd: number;
  fleteExhibidoresUsd: number;
  capexTiendaUsd: number;
  fletePorGramoUsd: number | null;
}

export interface DatosLote {
  costoMercanciaUsd: string | number;
  costoExhibidoresUsd: string | number;
  costoFleteUsd: string | number;
  pesoMercanciaG: string | number;
  pesoExhibidoresG: string | number;
  metodo: 'peso' | 'valor';
}

/**
 * Previsualizacion del prorrateo mientras se llena el formulario del lote.
 * La cifra que manda es la que calcula la base (`lotes.flete_mercancia_usd`,
 * columna generada); esto solo evita guardar a ciegas.
 *
 * Los exhibidores no reciben carga de flete en el costo de las joyas: su
 * parte va a CAPEX de tienda.
 */
export function previsualizarProrrateo(datos: DatosLote): Prorrateo {
  const flete = aMonto(datos.costoFleteUsd);
  const costoMerc = aMonto(datos.costoMercanciaUsd);
  const costoExh = aMonto(datos.costoExhibidoresUsd);
  const pesoMerc = aMonto(datos.pesoMercanciaG);
  const pesoExh = aMonto(datos.pesoExhibidoresG);

  let fleteMercancia = 0n;
  if (datos.metodo === 'peso') {
    const pesoTotal = pesoMerc + pesoExh;
    if (pesoTotal > 0n) fleteMercancia = (flete * pesoMerc) / pesoTotal;
  } else {
    const costoTotal = costoMerc + costoExh;
    if (costoTotal > 0n) fleteMercancia = (flete * costoMerc) / costoTotal;
  }

  const fleteExhibidores = flete - fleteMercancia;

  return {
    fleteMercanciaUsd: deMonto(fleteMercancia),
    fleteExhibidoresUsd: deMonto(fleteExhibidores),
    capexTiendaUsd: deMonto(costoExh + fleteExhibidores),
    fletePorGramoUsd: pesoMerc > 0n ? deMonto((fleteMercancia * FACTOR) / pesoMerc) : null,
  };
}

/* ------------------------------------------------------------------ formato */

const NUM = (min: number, max: number) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: min, maximumFractionDigits: max });

export function formatearUsd(valor: number | Monto | null | undefined, decimales = 2): string {
  if (valor === null || valor === undefined) return '—';
  const n = typeof valor === 'bigint' ? deMonto(valor) : valor;
  if (!Number.isFinite(n)) return '—';
  return '$' + NUM(decimales, decimales).format(n);
}

export function formatearBs(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return 'Bs ' + NUM(2, 2).format(valor);
}

/** Recibe el porcentaje ya en unidades de porcentaje (12.5 -> "12,5 %"). */
export function formatearPorcentaje(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return NUM(decimales, decimales).format(valor) + ' %';
}

export function formatearTasa(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return NUM(2, 4).format(valor);
}

export function formatearGramos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return NUM(0, 2).format(valor) + ' g';
}

export function formatearEntero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return NUM(0, 0).format(valor);
}

export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(fecha);
}

/**
 * Descuento del tramo de mayoreo que alcanza esa cantidad de piezas.
 *
 * Solo para mostrar el total mientras la mayorista va tocando piezas: la
 * cifra que manda es la que calcula `crear_reserva` en la base, que es
 * quien congela subtotal, descuento y total en la reserva.
 *
 * Si no hay tramos cargados devuelve null y el armador se niega a cotizar.
 * No hay ningun porcentaje quemado aqui, a proposito.
 */
export function descuentoPara(
  tramos: { min_piezas: number; descuento_pct: number; activo: boolean }[],
  piezas: number,
): number | null {
  const aplicables = tramos.filter((t) => t.activo && t.min_piezas <= piezas);
  if (aplicables.length === 0) return null;
  return aplicables.reduce((mejor, t) => (t.min_piezas > mejor.min_piezas ? t : mejor)).descuento_pct;
}

/** Aplica un descuento porcentual sin pasar por aritmetica flotante. */
export function aplicarDescuento(subtotal: number | null, descuentoPct: number | null): number | null {
  if (subtotal === null) return null;
  const pct = descuentoPct ?? 0;
  if (pct <= 0) return subtotal;
  return deMonto((aMonto(subtotal) * aMonto(100 - pct)) / aMonto(100));
}

/** Cuantos minutos y segundos faltan para una fecha, ya formateados. */
export function cuentaRegresiva(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const faltan = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(faltan) || faltan <= 0) return null;
  const minutos = Math.floor(faltan / 60000);
  const segundos = Math.floor((faltan % 60000) / 1000);
  return `${minutos}:${String(segundos).padStart(2, '0')}`;
}
