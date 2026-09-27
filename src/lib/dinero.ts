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
  return bsDeBcv(precioUsdBcv, tasa.tasa_bcv);
}

/**
 * Bolivares de un precio en dolares BCV, redondeados igual que la base:
 * `round(x, 2)`, la mitad hacia afuera. Antes se truncaba, y una pieza
 * podia salir un centimo por debajo de lo que despues cobraba la venta.
 */
export function bsDeBcv(precioUsdBcv: number, tasaBcv: number): number {
  const bruto = aMonto(precioUsdBcv) * aMonto(tasaBcv);         // escala 8
  const unCentimo = FACTOR * 100n;                              // 0,01 a escala 8
  const mitad = unCentimo / 2n;
  const centavos = (bruto + (bruto >= 0n ? mitad : -mitad)) / unCentimo;
  return Number(centavos) / 100;
}

/**
 * El precio de una pieza con el descuento por cantidad, en dolares BCV.
 *
 * Es la misma cuenta que hace `registrar_venta` en la base, paso por paso,
 * para que el carrito ensene lo que se va a cobrar y no algo parecido:
 *
 *   1. la etiqueta menos el porcentaje, redondeada a cuatro decimales;
 *   2. nunca por debajo del piso de margen de esa pieza;
 *   3. nunca por encima de la etiqueta.
 *
 * El piso es el de MARGEN, no el del regateo. Con el del regateo, un tramo
 * del 15 % se quedaba en el 10 % que puede rebajar la vendedora.
 */
export function precioConTramo(listaUsd: number, descuentoPct: number | null, pisoUsd: number | null): number {
  const lista = aMonto(listaUsd);
  if (!descuentoPct || descuentoPct <= 0) return deMonto(lista);
  // lista x (100 - d) esta a escala 8; entre 100 a escala 4 (= 10^6) queda
  // a escala 4. Se suma la mitad antes de dividir: redondea, no trunca.
  const bruto = lista * aMonto(100 - descuentoPct);
  let precio = (bruto + 500_000n) / 1_000_000n;
  const piso = pisoUsd === null ? 0n : aMonto(pisoUsd);
  if (precio < piso) precio = piso;
  if (precio > lista) precio = lista;
  return deMonto(precio);
}

/**
 * Dolares Binance de unos bolivares: lo que cobra quien paga en dolares en
 * efectivo o por Binance. Es la misma cuenta con la que la base guarda el
 * `total_usd` de cada venta (total en Bs entre la tasa de venta), asi que
 * lo que ella cobra y lo que queda registrado es la misma cifra.
 */
export function binanceDesdeBs(bs: number | null | undefined, tasaVenta: number | null | undefined): number | null {
  if (bs === null || bs === undefined || !tasaVenta) return null;
  return bs / tasaVenta;
}

/**
 * Medio centavo de dolar: la tolerancia de `falta_bcv_de` en la base. Los
 * bolivares se redondean a centimos y la vuelta a dolares nunca da exacta;
 * sin esto, una venta pagada al centimo quedaria debiendo 0,0001.
 */
export const MEDIO_CENTAVO = 0.005;

/**
 * Un abono, como lo anota la base (`anotar_abono`): si fue en dolares, se
 * pasa a bolivares a la tasa Binance, redondeado a centimos; y de bolivares
 * a dolares BCV, que es lo que se resta de la deuda.
 */
export function abonoEnBcv(monto: number, enDolares: boolean, tasa: Tasas): { bs: number; bcv: number } {
  // `bsDeBcv(x, 1)` es `round(x, 2)` sin pasar por coma flotante.
  const centimos = bsDeBcv(monto, 1);
  const bs = enDolares ? bsDeBcv(centimos, tasa.tasa_venta) : centimos;
  return { bs, bcv: bs / tasa.tasa_bcv };
}

/**
 * Cuanto se puede pasar un abono de lo que falta sin que sea un error, en
 * dolares BCV. La misma regla que `anotar_abono`: medio centavo, o un
 * centavo de la moneda en que paga si paga en dolares (un dolar no se parte
 * en milesimas, y quien paga lo que falta lo redondea al centavo).
 */
export function margenDeAbono(enDolares: boolean, tasa: Tasas): number {
  return enDolares ? Math.max(MEDIO_CENTAVO, (0.01 * tasa.tasa_venta) / tasa.tasa_bcv) : MEDIO_CENTAVO;
}

/**
 * Lo que falta despues de un abono, en dolares BCV, con la tolerancia de la
 * base. `pasa` dice si el abono es mas de lo que falta: la base lo rechaza.
 */
export function faltaTrasAbono(
  faltaBcv: number,
  abonoBcv: number,
  margen: number = MEDIO_CENTAVO,
): { falta: number; pasa: boolean } {
  const resto = faltaBcv - abonoBcv;
  return { falta: resto < MEDIO_CENTAVO ? 0 : resto, pasa: resto < -margen };
}

/** Un monto redondeado al centavo HACIA ARRIBA: lo que se pide para saldar. */
export function centavoArriba(valor: number): number {
  const m = aMonto(valor);                       // escala 4
  return Number((m + 99n) / 100n) / 100;
}

/** El total de unas lineas de precio por cantidad, sin pasar por coma flotante. */
export function totalDeLineas(lineas: { precio: number | null | undefined; cantidad: number }[]): number {
  return deMonto(sumar(lineas.map((l) => porCantidad(aMonto(l.precio ?? 0), l.cantidad))));
}

/**
 * El precio de un revendedor puesto como "la etiqueta de la tienda mas X",
 * al centavo hacia arriba y nunca por debajo de su minimo. Es lo que escribe
 * el boton de poner todas sus piezas de una vez; quien manda es
 * `rv_fijar_precios`, que rechaza cualquier precio bajo el minimo.
 */
export function precioSobreEtiqueta(etiquetaUsd: number, extraUsd: number, minimoUsd: number): number {
  const propuesto = centavoArriba(deMonto(aMonto(etiquetaUsd) + aMonto(extraUsd)));
  return propuesto < minimoUsd ? minimoUsd : propuesto;
}

/** Lo que gana un revendedor por pieza: su precio menos lo que le paga a Lux. */
export function gananciaPorPieza(precioUsd: number, precioLuxUsd: number): number {
  return deMonto(aMonto(precioUsd) - aMonto(precioLuxUsd));
}

/** Esa ganancia, en por ciento entero de SU precio (lo que cobra). */
export function gananciaPct(precioUsd: number, precioLuxUsd: number): number {
  if (!precioUsd || precioUsd <= 0) return 0;
  return Math.round((gananciaPorPieza(precioUsd, precioLuxUsd) / precioUsd) * 100);
}

/** Un numero redondeado a cuatro decimales, como `numeric(12,4)`. */
export function aCuatroDecimales(valor: number): number {
  return deMonto(aMonto(valor));
}

/**
 * Cuantos dolares BCV hay que cobrar para recuperar un dolar real.
 * Es la brecha como multiplicador: con 500 / 250 vale 2.
 */
function factorBrecha(tasa: Tasas | null | undefined): number | null {
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

/** Desglose del prorrateo de flete de un lote. */
interface Prorrateo {
  fleteMercanciaUsd: number;
  fleteExhibidoresUsd: number;
  capexTiendaUsd: number;
  /** Lo que paga de flete cada bulto, joya o exhibidor por igual. */
  fletePorUnidadUsd: number | null;
}

interface DatosLote {
  costoMercanciaUsd: string | number;
  costoExhibidoresUsd: string | number;
  costoFleteUsd: string | number;
  piezasMercancia: string | number;
  unidadesExhibidores: string | number;
}

/**
 * Previsualizacion del prorrateo de flete mientras se llena el lote.
 *
 * EL FLETE SE REPARTE POR BULTO. No por peso y no por valor: el flete no
 * cobra por lo que vale la caja ni por lo que pesa un anillo, cobra por
 * traerla. Un collar de $11 y un brazalete de $0,92 ocuparon el mismo
 * espacio y pagan lo mismo.
 *
 * Los exhibidores son bultos tambien y pagan su parte, pero esa parte va
 * a CAPEX de tienda: no encarece las joyas.
 *
 * La cifra que manda es la de la base (`lotes.flete_mercancia_usd`,
 * columna generada); esto solo evita guardar a ciegas.
 */
export function previsualizarProrrateo(datos: DatosLote): Prorrateo {
  const flete = aMonto(datos.costoFleteUsd);
  const costoExh = aMonto(datos.costoExhibidoresUsd);
  const piezas = Math.max(Math.trunc(Number(datos.piezasMercancia) || 0), 0);
  const exhib = Math.max(Math.trunc(Number(datos.unidadesExhibidores) || 0), 0);
  const bultos = piezas + exhib;

  let fleteMercancia = 0n;
  let porUnidad: number | null = null;
  if (bultos > 0) {
    fleteMercancia = (flete * BigInt(piezas)) / BigInt(bultos);
    porUnidad = deMonto(flete / BigInt(bultos));
  }

  const fleteExhibidores = flete - fleteMercancia;

  return {
    fleteMercanciaUsd: deMonto(fleteMercancia),
    fleteExhibidoresUsd: deMonto(fleteExhibidores),
    capexTiendaUsd: deMonto(costoExh + fleteExhibidores),
    fletePorUnidadUsd: porUnidad,
  };
}

/* ------------------------------------------------------------------ formato */

const NUM = (min: number, max: number) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: min, maximumFractionDigits: max });

/*
  LOS DOS DÓLARES, CADA UNO CON SU NOMBRE

  En este negocio "$20" no dice nada: hay dos dólares y valen distinto.

    $ BCV      el de la etiqueta. La clienta paga en bolívares a la tasa del
               BCV. Precios, gastos de la tienda, margen y reportes.

    $ Binance  el que se compra afuera, a la tasa de venta. Lo que costó la
               mercancía y su flete, lo que de verdad te queda para
               reponer, y lo que cobra la vendedora cuando la clienta paga
               en dólares en efectivo o por Binance.

  Antes había un solo `formatearUsd` que imprimía "$" y nada más, y la
  pantalla de Inventario ponía un costo en Binance al lado de un costo en
  BCV sin que se notara la diferencia. Ya no existe: cada cifra en dólares
  dice cuál es. La única excepción es `formatearMonto`, para las celdas de
  una tabla cuya CABECERA ya dice la moneda.
*/

function cifra(valor: number | Monto | null | undefined, decimales: number): string | null {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === 'bigint' ? deMonto(valor) : valor;
  if (!Number.isFinite(n)) return null;
  return (n < 0 ? '−$' : '$') + NUM(decimales, decimales).format(Math.abs(n));
}

/** Dólares BCV, los de la etiqueta: "$20,00 BCV". */
export function formatearBcv(valor: number | Monto | null | undefined, decimales = 2): string {
  const c = cifra(valor, decimales);
  return c === null ? '—' : `${c} BCV`;
}

/** Dólares Binance, los que se compran afuera: "$14,50 Binance". */
export function formatearBinance(valor: number | Monto | null | undefined, decimales = 2): string {
  const c = cifra(valor, decimales);
  return c === null ? '—' : `${c} Binance`;
}

/**
 * Solo la cifra, "$20,00". ÚNICAMENTE para celdas de tabla cuya cabecera
 * ya dice "$ BCV" o "$ Binance". En cualquier otro sitio, una de las dos
 * de arriba.
 */
export function formatearMonto(valor: number | Monto | null | undefined, decimales = 2): string {
  return cifra(valor, decimales) ?? '—';
}

/**
 * Cuanto puede rebajar la vendedora una pieza, en por ciento de la etiqueta.
 *
 * Sale del precio de lista y del minimo que ya ve, no de ningun costo. Puede
 * ser menos que el descuento maximo de la tienda: en las piezas de margen
 * fino el minimo lo pone el margen, no el descuento.
 */
export function rebajaMaximaPct(lista: number | null | undefined, minimo: number | null | undefined): number {
  if (!lista || lista <= 0 || minimo === null || minimo === undefined || minimo >= lista) return 0;
  // Hacia abajo, para no prometerle un punto que el minimo no deja; el
  // epsilon evita que un 10 exacto salga 9 por la aritmetica flotante.
  return Math.floor(((lista - minimo) / lista) * 100 + 1e-6);
}

/** Cuanto se rebajo de verdad una pieza, en por ciento entero de su etiqueta. */
export function porcentajeRebajado(lista: number | null | undefined, cobrado: number | null | undefined): number {
  if (!lista || lista <= 0 || cobrado === null || cobrado === undefined || cobrado >= lista) return 0;
  return Math.round(((lista - cobrado) / lista) * 100);
}

/** Cuántos dólares BCV son unos bolívares, a una tasa BCV dada. */
export function bcvDesdeBs(bs: number | null | undefined, tasaBcv: number | null | undefined): number | null {
  if (bs === null || bs === undefined || !tasaBcv) return null;
  return bs / tasaBcv;
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

/** Un numero con decimales fijos y coma venezolana: 4,2 meses. */
export function formatearDecimal(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return NUM(decimales, decimales).format(valor);
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
