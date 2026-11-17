import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Filtros, ResumenErrores, Vacio } from '../../componentes/Piezas';
import { Wordmark } from '../../componentes/Marca';
import { Icono } from '../../componentes/Iconos';
import { aMonto, aplicarDescuento, deMonto, descuentosDeCarrito, formatearBcv, formatearBs, formatearEntero, formatearDescuento, porCantidad, precioEnBs, sumar } from '../../lib/dinero';
import { armadosParaLaBase, armar, paresVigentes } from '../../lib/armados';
import type { ParArmado } from '../../lib/armados';
import { ArmarDije } from '../../componentes/ArmarDije';
import { fuenteFoto, urlPublicaFoto } from '../../lib/fotos';
import { agruparPorFamilia, conFoto, nombreConVariante, nombreDeTipo, porCategoria } from '../../lib/familias';
import { armarConjunto } from '../../lib/combinar';
import { codigoCompleto, faltanParaTramo, vigente } from '../../lib/ofertas';
import type { CodigoOferta, EstadoCodigo, OrigenOferta, PiezaOferta } from '../../lib/ofertas';
import type { Familia } from '../../lib/familias';
import { enlaceWhatsAppA } from '../../lib/enlaces';
import { useTasa } from '../../hooks/useTasa';
import { decirMinutos, useReglasPedido } from '../../hooks/useReglasPedido';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { ElegirVariante } from '../../componentes/ElegirVariante';
import { AsiPides, POR_ESTANTE, TarjetaPieza, irA } from '../../componentes/VitrinaPublica';
import type { PasoPedido, PedidoTarjeta, TipoVitrina } from '../../componentes/VitrinaPublica';
import { LaTienda } from '../../componentes/LaTienda';
import { Landing } from './landing/Landing';
import { SeccionComoPedir, SeccionProximamente } from './landing/SeccionesCatalogo';
import type { PropsCatalogo } from './landing/SeccionesCatalogo';
import { useLanding } from '../../hooks/useLanding';
import { useOfertas } from '../../hooks/useOfertas';
import { useMiradas } from '../../hooks/useMiradas';
import { HojaCompletalo, HojaPareja } from './landing/Completalo';
import { TusCodigos } from './landing/TusCodigos';
import { VentanaOferta } from './landing/VentanaOferta';
import { TUS_DATOS_VACIOS, TusDatos, datosParaReservar, queFalta } from '../../componentes/TusDatos';
import type { EstadoTusDatos } from '../../componentes/TusDatos';
import { useTextos } from '../../hooks/useTextos';
import { BotonLetraGrande } from '../../componentes/LetraGrande';
import { registrarVisita } from '../../lib/visitas';
import type { Cotizacion, ModeloProximo, ModeloPublico, Tramo } from '../../lib/tipos';

const COLUMNAS = 'id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, disponible, ubicaciones_codigo, familia, variante, armado';

/** Lo de "Próximamente": sin cantidad ni ubicación, que no se puede pedir. */
const COLUMNAS_PROXIMO = 'id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, familia, variante';
/** Un lote trae decenas de piezas, no miles: se traen de una vez, y si fueran más, se dice. */
const TOPE_PROXIMO = 240;

/**
 * Cuántas filas trae cada vez la lista de un tipo o de una búsqueda. Antes
 * eran 400 de una y nada más: la pieza 401 no salía nunca, sin aviso. Ahora
 * se traen de a poco y la página dice cuántas faltan por ver.
 */
const POR_TANDA = 120;

/**
 * El inicio trae todo lo que se vende de una vez: los estantes necesitan
 * cada categoría, y de a 120 ordenadas por tipo las últimas (pulseras,
 * sets, tobilleras) no salían hasta tocar "Ver más". Son filas livianas
 * (las fotos se piden al verlas); con más de este tope, cada estante sigue
 * llevando a su lista completa.
 */
const TOPE_INICIO = 1000;

type Orden = 'nombre' | 'menor' | 'mayor';

/**
 * Para quién (pedido del dueño del 17/11/2026: "una selección de piezas de
 * caballero y de dama, y también mezcladas"). Lo unisex sale en las dos.
 * Va en la ruta (`?para=dama`) y se conserva al cambiar de tipo.
 */
type Para = 'dama' | 'caballero';
const OPCIONES_PARA: readonly [Para | null, string][] = [[null, 'Todas'], ['dama', 'Dama'], ['caballero', 'Caballero']];

/** Lo que dura el aviso de la primera pieza agregada: lo bastante para leerlo con calma. */
const AVISO_AGREGADA_MS = 7000;

/** La misma selección, siempre escrita igual: para saber si una cotización es de esta. */
const claveDe = (items: { modelo_id: number; cantidad: number }[]) =>
  items.map((i) => `${i.modelo_id}x${i.cantidad}`).sort().join(',');

/**
 * Catalogo publico. Se abre sin sesion, desde un enlace de WhatsApp.
 *
 * Lo que se ve aqui sale de v_disponible_publico, que no expone ninguna
 * columna de costo y descuenta lo que ya esta reservado por otra persona.
 *
 * DOS VISTAS (rediseño del 24/10/2026)
 * El inicio es una vitrina: qué es Lux y cómo se pide, los tipos con foto,
 * un estante por tipo, cómo pedir con las cifras de verdad, lo que viene y
 * la tienda (dónde está, cuándo abre, cómo se le escribe y a dónde se
 * paga). Un tipo (`?tipo=Anillos`), una búsqueda o el orden por precio
 * abren la lista de siempre, con "Ver más". Antes era una sola rejilla de
 * 23.600 px sin un título, con las categorías plegadas en "Filtrar" y sin
 * una palabra de la tienda.
 *
 * COMO SE ARMA EL PEDIDO (rehecho el 14/10/2026)
 * Tocar una pieza abre su detalle: la foto grande, sus medidas y su precio.
 * Cada tarjeta lleva su boton "Agregar", que se vuelve un contador cuando la
 * pieza ya esta en el pedido. Antes un toque la metia al pedido sin
 * preguntar y dos toques abrian el detalle deshaciendo el primero: un gesto
 * que una clienta no adivina, y una tarjeta que era un boton con botones
 * dentro, que los lectores de pantalla no saben leer.
 *
 * EL TOTAL ES EL DEL PEDIDO
 * El precio grande de cada pieza es el de DETAL. Con varias piezas manda el
 * tramo de mayoreo, y cada pieza nunca baja de su piso: esa cuenta la hace
 * la base (`cotizar_pedido`, la misma regla que `crear_reserva`). Antes el
 * carrito multiplicaba el subtotal por el descuento sin piso, y cuando el
 * piso mandaba, la barra decia un total y el pedido congelaba otro, mas alto.
 */
export function Catalogo() {
  const navegar = useNavigate();
  const { tasa } = useTasa();
  const textos = useTextos();
  const reglas = useReglasPedido();
  // La landing y las ofertas: si el SQL #65 no está o fallan, el inicio es el de siempre.
  const landing = useLanding();
  const ofertas = useOfertas();
  // Las dos que más miró: el umbral viene de la base; sin él (o con las ofertas
  // apagadas) no se ofrece nada, aunque lo mirado se siga contando.
  const datosOfertas = ofertas.ofertas;
  const ofertasVivas = datosOfertas?.encendidas === true;
  const parejaPct = ofertasVivas ? datosOfertas?.pareja_pct ?? null : null;
  const miradas = useMiradas(parejaPct !== null ? datosOfertas?.mirada_segundos ?? null : null);
  // El código que se acaba de ganar, a la vista; y la pieza que combina con la última que agregó.
  const [ventana, setVentana] = useState<CodigoOferta | null>(null);
  const [completalo, setCompletalo] = useState<{ a: number; b: number } | null>(null);
  const agregadasEnLaVisita = useRef(0);
  // Los códigos vigentes viajan con el pedido; sin ninguno (o sin el #65) la
  // llamada es la de siempre.
  const codigosVigentes = useMemo(() => ofertas.codigos.filter((c) => vigente(c)).slice(0, 20), [ofertas.codigos]);
  const claveCodigos = codigosVigentes.map((c) => c.codigo).join(',');
  const enOferta = useMemo(() => new Set<number>(ofertasVivas ? datosOfertas?.en_oferta ?? [] : []), [ofertasVivas, datosOfertas]);
  const cintaDe = (f: Familia<ModeloPublico>) => (f.variantes.some((v) => enOferta.has(v.id)) ? 'Oferta' : undefined);

  const [modelos, setModelos] = useState<ModeloPublico[]>([]);
  const [total, setTotal] = useState(0);
  // Todas las piezas que se han visto, no solo las de la busqueda actual.
  // Sin esto, buscar otra cosa despues de agregar dejaba las piezas
  // elegidas fuera del total y escondidas en "Tu pedido", aunque se
  // mandaban igual al apartar.
  const [conocidos, setConocidos] = useState<Map<number, ModeloPublico>>(new Map());
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [seleccion, setSeleccion] = useState<Map<number, number>>(new Map());
  const [cotizacion, setCotizacion] = useState<(Cotizacion & { clave: string }) | null>(null);
  const [texto, setTexto] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [orden, setOrden] = useState<Orden>('nombre');
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parametros, setParametros] = useSearchParams();
  const paso: 'catalogo' | 'pedido' = parametros.get('paso') === 'pedido' ? 'pedido' : 'catalogo';
  const paraEnRuta = parametros.get('para');
  const para: Para | null = paraEnRuta === 'dama' || paraEnRuta === 'caballero' ? paraEnRuta : null;
  const conPara = (p: Record<string, string>): Record<string, string> => (para ? { ...p, para } : p);
  const setPaso = (p: 'catalogo' | 'pedido') => {
    // Sin replace: cada cambio deja su huella en el historial.
    setParametros(conPara(p === 'pedido' ? { paso: 'pedido' } : {}));
  };
  // El tipo va en la ruta: el botón de atrás del teléfono vuelve del tipo al
  // inicio, que es lo que la clienta espera.
  const categoria = parametros.get('tipo');
  const setCategoria = (c: string | null) => setParametros(conPara(c ? { tipo: c } : {}));
  // "Todas las joyas", juntas y sin separar por tipo (pedido del dueño del
  // 27/10/2026: "no hay una sección para ver todo"). También en la ruta.
  const verTodas = !categoria && parametros.get('ver') === 'todas';
  const irATodas = () => setParametros(conPara({ ver: 'todas' }));
  // Cambiar de "Dama" a "Caballero" no es un paso atrás: reemplaza.
  const elegirPara = (x: Para | null) => {
    const p: Record<string, string> = categoria ? { tipo: categoria } : verTodas ? { ver: 'todas' } : {};
    setParametros(x ? { ...p, para: x } : p, { replace: true });
  };
  const enLista = Boolean(categoria || verTodas || texto.trim() || orden !== 'nombre');
  // La primera pieza que agrega: se le dice dónde quedó y cómo sigue.
  const [recienAgregada, setRecienAgregada] = useState(false);
  const yaSeDijo = useRef(false);
  // De qué consulta son las filas que hay. Mientras no sean de la de ahora
  // (se escribió una letra y la base no ha respondido), no se dibujan: la
  // primera letra pintaba la lista con las mil filas del inicio, letra por
  // letra, en un teléfono de gama baja.
  const consultaActual = `${categoria ?? (verTodas ? '*' : '')}|${texto.trim()}|${orden}|${para ?? ''}`;
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);
  const turno = useRef(0);
  // Los datos de la clienta viven aqui y no en el formulario: si vuelve a
  // "Seguir viendo" y regresa, lo que ya confirmo sigue confirmado.
  const [datos, setDatos] = useState<EstadoTusDatos>(TUS_DATOS_VACIOS);
  const [entrega, setEntrega] = useState<'tienda' | 'envio'>('tienda');
  const [empresa, setEmpresa] = useState<'domesa' | 'mrw'>('domesa');
  const [agencia, setAgencia] = useState('');
  const [direccion, setDireccion] = useState('');
  const [reservando, setReservando] = useState(false);
  const [familiaAbierta, setFamiliaAbierta] = useState<number | null>(null);
  const visor = useVisorFoto();
  // Las piezas armadas: qué dije va en qué cadena o pulsera. Los dijes se
  // traen aparte, la primera vez que se pide uno: la clienta puede estar
  // mirando solo cadenas, y la hoja tiene que enseñarlos todos.
  const [pares, setPares] = useState<ParArmado[]>([]);
  const [dijes, setDijes] = useState<ModeloPublico[] | null>(null);
  const [armandoBase, setArmandoBase] = useState<number | null>(null);
  // Lo que viene en un lote que todavía no llega (pedido del dueño del
  // 20/10/2026): se enseña para antojar, nunca para pedir. Su propio visor,
  // sin el botón de agregar.
  const [proximos, setProximos] = useState<ModeloProximo[]>([]);
  const [totalProximos, setTotalProximos] = useState(0);
  const [todosProximos, setTodosProximos] = useState(false);
  const visorProximo = useVisorFoto();

  const consulta = useCallback((desde: number) => {
    let q = supabase.from('v_disponible_publico').select(COLUMNAS, { count: 'exact' });
    if (categoria) q = q.eq('categoria', categoria);
    if (para) q = q.in('para', [para, 'unisex']);
    if (texto.trim()) {
      const t = texto.trim().replace(/[%,()"\\:]/g, ' ');
      q = q.or(`nombre.ilike.%${t}%,categoria.ilike.%${t}%,variante.ilike.%${t}%`);
    }
    // Familia e id al final: las variantes de un producto quedan juntas y
    // el orden no cambia entre una tanda y la siguiente.
    q = orden === 'nombre'
      ? q.order('categoria', { ascending: true }).order('nombre', { ascending: true })
      : q.order('precio_usd', { ascending: orden === 'menor' }).order('nombre', { ascending: true });
    const hasta = enLista ? desde + POR_TANDA - 1 : TOPE_INICIO - 1;
    return q.order('familia', { ascending: true }).order('id', { ascending: true }).range(desde, hasta);
  }, [texto, categoria, orden, enLista, para]);

  const recordar = useCallback((filas: ModeloPublico[]) => {
    setConocidos((prev) => {
      const copia = new Map(prev);
      for (const f of filas) copia.set(f.id, f);
      return copia;
    });
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    // Si mientras tanto salió otra consulta, esta respuesta ya es vieja: se
    // tira. Sin esto, una búsqueda lenta que llegara después de la nueva
    // pisaba lo que se ve.
    const mio = ++turno.current;
    const [cat, tr] = await Promise.all([
      consulta(0),
      // La columna es descuento_pct. Aqui decia precio_por_pieza_usd, que no
      // existe: PostgREST devolvia 400, tramos quedaba vacio y descuentoPara()
      // no encontraba ningun tramo. Resultado: ninguna clienta al mayor
      // recibia su descuento, ni el 5 % a las 6 piezas ni el 15 % a las 20.
      supabase.from('tramos_mayoreo').select('id, min_piezas, descuento_pct, activo').order('min_piezas'),
    ]);
    if (mio !== turno.current) return;

    // Se miran las dos. Antes solo se miraba la del catalogo, asi que la de
    // tramos podia fallar durante semanas sin que nadie lo supiera: la
    // pagina se veia perfecta, solo que sin descuentos al mayor.
    setError(cat.error ? mensajeDeError(cat.error) : tr.error ? mensajeDeError(tr.error) : null);
    const filas = (cat.data as unknown as ModeloPublico[] | null) ?? [];
    setModelos(filas);
    setTotal(cat.count ?? filas.length);
    recordar(filas);
    setTramos((tr.data as Tramo[] | null) ?? []);
    setCargadoPara(consultaActual);
    setCargando(false);
  }, [consulta, recordar, consultaActual]);

  async function cargarMas() {
    setCargandoMas(true);
    const { data, error: err, count } = await consulta(modelos.length);
    setCargandoMas(false);
    if (err) { setError(mensajeDeError(err)); return; }
    const filas = (data as unknown as ModeloPublico[] | null) ?? [];
    setModelos((prev) => {
      const ya = new Set(prev.map((m) => m.id));
      return [...prev, ...filas.filter((m) => !ya.has(m.id))];
    });
    if (count !== null) setTotal(count);
    recordar(filas);
  }

  useEffect(() => {
    const t = setTimeout(() => void cargar(), texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, texto]);

  // Una visita por teléfono y por día: la tienda ve la cuenta en Catálogo.
  // Va aparte de cargar(), que se repite con cada búsqueda.
  useEffect(() => { registrarVisita(); }, []);

  // Al cambiar de tipo o de paso, arriba. Antes "Tu pedido" abría con el
  // desplazamiento del catálogo: lo primero que se veía era el botón de
  // apartar apagado y la cédula fuera de la pantalla.
  useEffect(() => { window.scrollTo(0, 0); }, [categoria, verTodas, paso]);
  // "Ver todas" desaparece al tocarlo: el foco pasa al título del tipo, y no
  // se pierde al principio de la página.
  const tituloLista = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (categoria || verTodas) tituloLista.current?.focus({ preventScroll: true }); }, [categoria, verTodas]);

  // El aviso de la primera pieza se va solo; no tapa nada mientras está.
  useEffect(() => {
    if (!recienAgregada) return;
    const id = window.setTimeout(() => setRecienAgregada(false), AVISO_AGREGADA_MS);
    return () => window.clearTimeout(id);
  }, [recienAgregada]);

  // Lo próximo se pide una vez y se filtra aquí con la búsqueda y la
  // categoría: son pocas piezas. Su error se mira y a propósito no se
  // enseña: si esta sección falla, el catálogo de verdad sigue entero, y
  // un aviso rojo por un adelanto asustaría a la clienta por nada.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      let q = supabase
        .from('v_proximamente')
        .select(COLUMNAS_PROXIMO, { count: 'exact' });
      if (para) q = q.in('para', [para, 'unisex']);
      const { data, count, error: err } = await q
        .order('categoria', { ascending: true }).order('nombre', { ascending: true })
        .order('familia', { ascending: true }).order('id', { ascending: true })
        .range(0, TOPE_PROXIMO - 1);
      if (err || !vivo) return;
      const filas = (data as unknown as ModeloProximo[] | null) ?? [];
      setProximos(filas);
      setTotalProximos(count ?? filas.length);
    })();
    return () => { vivo = false; };
  }, [para]);

  // Las categorias se piden una sola vez y sin filtrar: si salieran de lo
  // que ya esta en pantalla, elegir una haria desaparecer a las demas. Las
  // cuenta la base: la clienta baja once filas, no ochenta y ocho.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('categorias_publicas');
      setCategorias(((data as { categoria: string }[] | null) ?? []).map((x) => x.categoria));
    })();
  }, []);

  // El total de verdad, de la base, cada vez que cambia el pedido. Mientras
  // llega se enseña la cuenta de aquí, que coincide salvo cuando el piso de
  // una pieza manda; si la base de antes no tiene la función, se queda esa.
  useEffect(() => {
    if (seleccion.size === 0) { setCotizacion(null); return; }
    const items = [...seleccion.entries()].map(([modelo_id, cantidad]) => ({ modelo_id, cantidad }));
    const clave = claveDe(items) + '#' + claveCodigos;
    let vivo = true;
    const reloj = window.setTimeout(() => {
      void (async () => {
        const { data, error: err } = await supabase.rpc('cotizar_pedido', {
          p_items: items,
          ...(claveCodigos ? { p_codigos: claveCodigos.split(',') } : {}),
        });
        if (!vivo) return;
        setCotizacion(err || !data ? null : { ...(data as Cotizacion), clave });
      })();
    }, 250);
    return () => { vivo = false; window.clearTimeout(reloj); };
  }, [seleccion, claveCodigos]);

  const resumen = useMemo(() => {
    let piezas = 0;
    const items: { modelo_id: number; cantidad: number }[] = [];
    for (const [id, n] of seleccion) {
      piezas += n;
      items.push({ modelo_id: id, cantidad: n });
    }
    // El tramo, línea por línea, como `tramo_de_carrito`: un dije sin su
    // cadena o pulsera no cuenta ni recibe el descuento.
    const tramo = descuentosDeCarrito(tramos, items.map((i) => ({ ...i, armado: conocidos.get(i.modelo_id)?.armado ?? null })));
    const partes = [];
    const conDescuento = [];
    for (const i of items) {
      const m = conocidos.get(i.modelo_id);
      if (m?.precio_usd == null) continue;
      const monto = porCantidad(aMonto(m.precio_usd), i.cantidad);
      partes.push(monto);
      // Mientras responde la base: el porcentaje de su línea, sin el piso.
      conDescuento.push(aMonto(aplicarDescuento(deMonto(monto), tramo.porModelo.get(i.modelo_id) ?? null) ?? deMonto(monto)));
    }
    const subtotal = deMonto(sumar(partes));
    const descuento = tramo.descuento;
    // El tramo que viene: "3 mas y baja 5 %", contado sin dijes. Desde una
    // pieza se puede pedir, y esto es lo que invita a llevar mas.
    const siguiente = faltanParaTramo(
      tramo.piezas,
      tramos.filter((t) => t.activo).map((t) => ({ piezas_min: t.min_piezas, descuento_pct: t.descuento_pct })),
    );
    const deLaBase = cotizacion !== null && cotizacion.clave === claveDe(items) + '#' + claveCodigos ? cotizacion : null;
    // Cuántas unidades de cada pieza cubre un código, según la base.
    const ofertaDe = new Map<number, number>();
    for (const l of deLaBase?.lineas ?? []) {
      if (l.oferta_codigo) ofertaDe.set(l.modelo_id, (ofertaDe.get(l.modelo_id) ?? 0) + l.cantidad);
    }
    return {
      piezas,
      subtotal: deLaBase ? Number(deLaBase.subtotal_usd) : subtotal,
      descuento: deLaBase ? (Number(deLaBase.descuento_pct) || null) : descuento,
      totalUsd: deLaBase ? Number(deLaBase.total_usd) : deMonto(sumar(conDescuento)),
      /** El precio de cada pieza en este pedido, si ya respondió la base (la primera línea: la de oferta, si la hay). */
      precioDe: (deLaBase?.lineas ?? []).reduce((mapa, l) => (mapa.has(l.modelo_id) ? mapa : mapa.set(l.modelo_id, Number(l.precio_usd))), new Map<number, number>()),
      /** Cuántas unidades de cada pieza llevan un código. */
      ofertaDe,
      conOferta: ofertaDe.size > 0,
      /** Lo que la base dijo de cada código que se le mandó. */
      codigos: (deLaBase?.codigos as EstadoCodigo[] | undefined) ?? null,
      calculando: seleccion.size > 0 && !deLaBase,
      siguiente,
    };
  }, [seleccion, tramos, conocidos, cotizacion, claveCodigos]);

  // Las parejas que caben en lo que lleva el pedido: si quita una cadena,
  // la pareja de esa cadena se cae sola (como en `guardar_armados`).
  const armados = useMemo(() => paresVigentes(pares, seleccion), [pares, seleccion]);

  // La pareja que más miró deja de ofrecerse si una ya no se puede pedir o si ya va entera en el pedido.
  const { pareja: parejaMirada, descartar: descartarPareja } = miradas;
  useEffect(() => {
    if (!parejaMirada) return;
    const [a, b] = parejaMirada;
    const ma = conocidos.get(a);
    const mb = conocidos.get(b);
    const sirve = ma && mb && ma.disponible > 0 && mb.disponible > 0 && ma.precio_usd !== null && mb.precio_usd !== null
      && !(seleccion.has(a) && seleccion.has(b));
    if (!sirve) descartarPareja();
  }, [parejaMirada, descartarPareja, conocidos, seleccion]);

  // Un producto con variantes es UNA tarjeta, no dos: la cadena de 45 cm y
  // la de 60 cm son la misma pieza con dos opciones.
  const familias = useMemo(() => agruparPorFamilia(modelos), [modelos]);

  // Los estantes del inicio y sus cuadros con foto: cada tipo con la foto
  // de la primera de sus piezas que tenga una.
  const estantes = useMemo(() => porCategoria(familias), [familias]);
  const tipos = useMemo<TipoVitrina[]>(() => estantes.map((e) => {
    const conImagen = e.familias.map((f) => conFoto(f.variantes)).find((p) => p && (p.foto_path || p.foto_thumb_path));
    return {
      nombre: e.categoria,
      cuantas: e.familias.length,
      foto: conImagen ? fuenteFoto(conImagen.foto_path, conImagen.foto_thumb_path, '(max-width: 640px) 31vw, 180px') : null,
    };
  }), [estantes]);

  // Lo que ensena el detalle, en el mismo orden que la cuadricula, para
  // pasar de una pieza a la siguiente sin salir. La clave de la tienda
  // ("V1 · BG") va aquí y no en la tarjeta: para la clienta son letras sin
  // significado; para la vendedora que mira su teléfono, el estante.
  const fichas = useMemo<FotoAmpliada[]>(() => familias.map((f) => {
    const portada = conFoto(f.variantes);
    return {
      clave: f.clave,
      nombre: f.cabeza.nombre,
      categoria: f.cabeza.categoria,
      materiales: textos.materiales_largo ?? null,
      variantes: f.variantes.map((v) => ({
        id: v.id,
        etiqueta: v.variante,
        path: v.foto_path ?? portada?.foto_path ?? null,
        thumbPath: v.foto_thumb_path ?? portada?.foto_thumb_path ?? null,
        bs: v.precio_bs,
        bcv: v.precio_usd,
        quedan: v.disponible,
        nota: [v.variantes_nota, v.ubicaciones_codigo ? `En tienda: ${v.ubicaciones_codigo}` : null].filter(Boolean).join(' · ') || null,
      })),
    };
  }), [familias, textos.materiales_largo]);

  // Lo próximo con la misma búsqueda y la misma categoría que el resto.
  const familiasProximas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return agruparPorFamilia(proximos.filter((m) => (!categoria || m.categoria === categoria)
      && (!t || [m.nombre, m.categoria, m.variante ?? ''].some((s) => s.toLowerCase().includes(t)))));
  }, [proximos, texto, categoria]);

  const fichasProximas = useMemo<FotoAmpliada[]>(() => familiasProximas.map((f) => {
    const portada = conFoto(f.variantes);
    return {
      clave: f.clave,
      nombre: f.cabeza.nombre,
      categoria: f.cabeza.categoria,
      materiales: textos.materiales_largo ?? null,
      variantes: f.variantes.map((v) => ({
        id: v.id,
        etiqueta: v.variante,
        path: v.foto_path ?? portada?.foto_path ?? null,
        thumbPath: v.foto_thumb_path ?? portada?.foto_thumb_path ?? null,
        bs: v.precio_bs,
        bcv: v.precio_usd,
        nota: ['Próximamente: todavía no se puede pedir', v.variantes_nota].filter(Boolean).join(' · '),
      })),
    };
  }), [familiasProximas, textos.materiales_largo]);

  // Cómo pedir, con las cifras de la base: las del apartado de
  // `reglas_pedido()` y los tramos de `tramos_mayoreo`. Sin ellas, los
  // mismos pasos sin cifras, como decía antes "Tu pedido".
  const whatsappTienda = enlaceWhatsAppA(textos.whatsapp_tienda, 'Hola, vengo del catálogo de Lux by Emory.');
  const pasos = useMemo<PasoPedido[]>(() => {
    const porCantidadTexto = tramos
      .filter((t) => t.activo)
      .sort((a, b) => a.min_piezas - b.min_piezas)
      .map((t) => `${t.min_piezas} piezas, ${formatearDescuento(t.descuento_pct)} menos`)
      .join(' · ');
    return [
      {
        titulo: 'Elige tus piezas',
        texto: <>Toca <strong>Agregar</strong> en las que te gusten (o <strong>Elegir</strong>, si tiene medidas): se puede pedir desde una pieza.{porCantidadTexto ? ` Y mientras más llevas, más baja: ${porCantidadTexto}.` : ''}</>,
      },
      {
        titulo: 'Apártalas con tu cédula',
        texto: reglas
          ? `Sin pagar todavía: te las guardamos ${decirMinutos(reglas.reserva_minutos)} mientras pagas.`
          : 'Sin pagar todavía: te las guardamos un rato mientras pagas.',
      },
      {
        titulo: 'Paga por pago móvil',
        texto: reglas
          ? `El total, o al menos el ${formatearDescuento(reglas.apartado_inicial_pct)} para apartarlas ${reglas.apartado_dias} días y pagar lo demás por partes. Cada pago lo reportas con su referencia en la página de tu pedido.`
          : 'El total, o solo una parte para apartarlas unos días y pagar lo demás por partes. Cada pago lo reportas con su referencia en la página de tu pedido.',
      },
      {
        titulo: 'Retíralo o te lo enviamos',
        texto: 'En la tienda, con tu cédula, o por Domesa o MRW a tu ciudad: el envío se paga al retirarlo en la agencia.',
      },
    ];
  }, [tramos, reglas]);

  const cerrarHoja = useCallback(() => setFamiliaAbierta(null), []);

  function cambiar(modeloId: number, cantidad: number) {
    const copia = new Map(seleccion);
    const max = conocidos.get(modeloId)?.disponible ?? 0;
    const n = Math.max(0, Math.min(cantidad, max));
    if (n === 0) copia.delete(modeloId); else copia.set(modeloId, n);
    setSeleccion(copia);
    // Las parejas que ya no caben se caen aquí, no solo al mirarlas: si no,
    // el dije que se quitó y vuelve suelto reviviría su pareja.
    setPares((p) => paresVigentes(p, copia));
  }

  function agregarPorId(id: number) {
    const eraNueva = !seleccion.has(id);
    cambiar(id, (seleccion.get(id) ?? 0) + 1);
    // Complétalo: solo con las dos primeras piezas distintas de la visita, no cada vez.
    if (eraNueva && agregadasEnLaVisita.current < 2) {
      agregadasEnLaVisita.current += 1;
      if (parejaPct !== null && !ventana) {
        const otra = complementoDe(id, new Map(seleccion).set(id, 1));
        if (otra) setCompletalo({ a: id, b: otra.id });
      }
    }
    // La primera vez se dice dónde quedó y cómo se sigue: quien pide por
    // primera vez no sabe que la barra de abajo es su pedido.
    if (!yaSeDijo.current) { yaSeDijo.current = true; setRecienAgregada(true); }
  }

  function vaciar() {
    setSeleccion(new Map());
    setPares([]);
  }

  /**
   * Las piezas de un código entran al pedido: la cantidad que pide el código
   * o la que ya llevaba, la mayor, y nunca más de las que hay libres. Las que
   * el catálogo no ha traído (la oferta puede ser de una pieza que la
   * clienta no ha visto) se piden a la vista pública.
   */
  async function meterPiezas(piezas: PiezaOferta[]) {
    const faltan = piezas.map((p) => p.modelo_id).filter((id) => !conocidos.has(id));
    const nuevas = new Map<number, ModeloPublico>();
    if (faltan.length > 0) {
      const { data } = await supabase.from('v_disponible_publico').select(COLUMNAS).in('id', faltan);
      const filas = (data as unknown as ModeloPublico[] | null) ?? [];
      recordar(filas);
      for (const f of filas) nuevas.set(f.id, f);
    }
    setSeleccion((previa) => {
      const copia = new Map(previa);
      for (const p of piezas) {
        const max = (conocidos.get(p.modelo_id) ?? nuevas.get(p.modelo_id))?.disponible ?? 0;
        const n = Math.min(max, Math.max(copia.get(p.modelo_id) ?? 0, p.cantidad));
        if (n > 0) copia.set(p.modelo_id, n);
      }
      return copia;
    });
  }

  /** Gana el código, lo enseña y mete sus piezas al pedido. Lanza con el mensaje de la base si no se puede. */
  async function quererOferta(origen: OrigenOferta, modelos: number[], ref?: number) {
    const codigo = await ofertas.ganar(origen, modelos, ref);
    // El código ya existe: si meter las piezas falla (red), la ventana se abre igual y dice qué falta.
    try { await meterPiezas(codigo.piezas); } catch { /* la ventana lo avisa */ }
    setCompletalo(null);
    miradas.descartar();
    setVentana(codigo);
  }

  /**
   * "Complétalo": con la pieza que acaba de agregar como ancla, la que
   * `armarConjunto` encuentra de otra parte del cuerpo (mismo tono si el
   * nombre lo dice), libre y que todavía no va en el pedido.
   */
  function complementoDe(id: number, pedido: Map<number, number>): ModeloPublico | null {
    const ancla = conocidos.get(id);
    if (!ancla || ancla.armado === 'dije') return null;
    const enPedido = new Set([...pedido.keys()].map((k) => conocidos.get(k)?.familia));
    const candidatas = [...conocidos.values()].filter((m) => m.familia !== ancla.familia
      && !enPedido.has(m.familia) && m.disponible > 0 && m.precio_usd !== null && m.armado !== 'dije');
    const conjunto = armarConjunto(agruparPorFamilia([ancla, ...candidatas]), 0, 2);
    if (!conjunto.some((p) => p.familia === ancla.familia)) return null;
    return conjunto.find((p) => p.familia !== ancla.familia) ?? null;
  }

  /** "Agrégale un dije", desde una cadena o pulsera para armar. */
  async function abrirArmar(baseId: number) {
    visor.cerrar();
    if (dijes === null) {
      const { data, error: err } = await supabase
        .from('v_disponible_publico')
        .select(COLUMNAS)
        .eq('armado', 'dije')
        .order('nombre', { ascending: true })
        .order('familia', { ascending: true })
        .order('id', { ascending: true })
        .limit(400);
      if (err) { setError('No se pudieron traer los dijes: ' + mensajeDeError(err)); return; }
      const filas = (data as unknown as ModeloPublico[] | null) ?? [];
      recordar(filas);
      setDijes(filas);
    }
    setArmandoBase(baseId);
  }

  function armarCon(dijeId: number) {
    if (armandoBase === null) return;
    const hecho = armar(seleccion, pares, armandoBase, dijeId, (id) => conocidos.get(id)?.disponible ?? 0);
    if (!hecho) {
      setError('Ya no quedan piezas para armar esa: elige otra cadena o pulsera, u otro dije.');
    } else {
      setSeleccion(hecho.seleccion);
      setPares(hecho.pares);
    }
    setArmandoBase(null);
  }

  const esBase = (id: number) => conocidos.get(id)?.armado === 'base';

  function verFoto(f: Familia<ModeloPublico>) {
    const ficha = fichas.find((x) => x.clave === f.clave);
    if (ficha) visor.abrir(ficha, fichas);
  }

  function verProxima(f: Familia<ModeloProximo>) {
    const ficha = fichasProximas.find((x) => x.clave === f.clave);
    if (ficha) visorProximo.abrir(ficha, fichasProximas);
  }

  /** Del tipo o la búsqueda, de vuelta a la vitrina entera. */
  function alInicio() {
    setTexto('');
    setOrden('nombre');
    setCategoria(null);
  }

  async function reservar() {
    const quien = datosParaReservar(datos);
    if (!quien) return;
    setReservando(true);
    setError(null);
    const items = [...seleccion.entries()].map(([modelo_id, cantidad]) => ({ modelo_id, cantidad }));

    const { data, error: err } = await supabase.rpc('crear_reserva', {
      p_items: items,
      // Si confirmo que es clienta, nombre, apellido o telefono van vacios
      // y la base los pone desde su ficha: aqui nunca estuvieron completos.
      p_cliente_nombre: quien.nombre,
      p_cliente_apellido: quien.apellido,
      p_cliente_cedula: quien.cedula,
      p_cliente_telefono: quien.telefono,
      p_entrega: entrega,
      p_envio_empresa: entrega === 'envio' ? empresa : null,
      p_envio_agencia: entrega === 'envio' ? agencia : null,
      p_envio_direccion: entrega === 'envio' ? direccion : null,
      // Qué dije va en qué base, solo si armó alguna: así un pedido sin
      // dijes encaja también en la base de antes de esquema-dijes.sql.
      ...(armados.length > 0 ? { p_armados: armadosParaLaBase(armados) } : {}),
      // Los códigos vigentes; la base usa los que valen y calla los demás.
      ...(codigosVigentes.length > 0 ? { p_codigos: codigosVigentes.map((c) => c.codigo) } : {}),
    });

    if (err) { setError(mensajeDeError(err)); setReservando(false); return; }
    // Los códigos que el pedido tomó ya no son de ella: que no vuelvan a salir en otro.
    for (const e of resumen.codigos ?? []) if (e.aplica) ofertas.quitar(e.codigo);
    navegar(`/reserva/${data as string}`);
  }

  // Lo que cada tarjeta hace con el pedido: lo mismo en el inicio y en la lista.
  const pedidoTarjeta = (f: Familia<ModeloPublico>): PedidoTarjeta => ({
    destino: 'pedido',
    llevas: (id) => seleccion.get(id) ?? 0,
    disponible: (id) => conocidos.get(id)?.disponible ?? f.variantes.find((v) => v.id === id)?.disponible ?? 0,
    alAgregar: agregarPorId,
    alCambiar: cambiar,
    alElegir: () => setFamiliaAbierta(f.clave),
  });

  // La hoja de "Agrégale un dije": sale en el catálogo y en "Tu pedido".
  const hojaArmar = armandoBase !== null && dijes !== null ? (
    <ArmarDije
      base={nombreConVariante(conocidos.get(armandoBase)?.nombre ?? 'tu cadena', conocidos.get(armandoBase)?.variante)}
      dijes={dijes}
      llevas={(id) => seleccion.get(id) ?? 0}
      alElegir={armarCon}
      alCerrar={() => setArmandoBase(null)}
    />
  ) : null;

  // La misma cabecera en el catálogo y en "Tu pedido": la marca lleva al
  // inicio, "Letra grande" agranda todo y, si hay número, "Escríbenos" abre
  // el WhatsApp de la tienda.
  const cabecera = (
    <header className="barra barra--publica">
      <div className="barra__interior">
        <Link to="/publico" className="barra__marca" aria-label="Lux by Emory, ir al inicio del catálogo">
          <Wordmark alto={40} />
        </Link>
        <div className="barra__publica-acciones">
          <BotonLetraGrande />
          {whatsappTienda ? (
            <a className="boton boton--secundario barra__contacto" href={whatsappTienda} target="_blank" rel="noopener noreferrer">
              Escríbenos<span className="visualmente-oculto"> por WhatsApp</span>
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );

  /* ------------------------------------------------------------ pedido */

  // Volver atras despues de apartar deja la seleccion vacia: en vez de un
  // formulario de pedido sin piezas, se regresa al catalogo.
  if (paso === 'pedido' && seleccion.size === 0) {
    return <Navigate to="/publico" replace />;
  }

  if (paso === 'pedido') {
    const elegidos = [...seleccion.entries()].map(([id, cantidad]) => ({ id, m: conocidos.get(id), cantidad }));
    const faltaEnvio = entrega === 'envio' && (!agencia.trim() || !direccion.trim());

    return (
      <>
        {cabecera}
        <div className="pagina pagina--angosta mostrador">
          <div className="encabezado-pagina">
            <div>
              <h1>Tu pedido</h1>
              <p>
                {resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}
                {resumen.descuento ? `, con ${formatearDescuento(resumen.descuento)} de descuento por cantidad` : ''}.
                {' '}Tres pasos y quedan apartadas.
              </p>
            </div>
          </div>

          {error ? <ResumenErrores titulo="No se pudo apartar">{error}</ResumenErrores> : null}

          {/* Las partes numeradas: la clienta sabe dónde va y cuánto falta. */}
          <h2 className="seccion-titulo paso-pedido"><span className="paso-pedido__n" aria-hidden="true">1</span> Tus piezas</h2>
          <div className="lineas-cobro">
            {elegidos.map(({ id, m, cantidad }) => {
              const precio = resumen.precioDe.get(id) ?? m?.precio_usd ?? null;
              const nombre = m ? nombreConVariante(m.nombre, m.variante) : 'Pieza';
              return (
                <div className="linea-cobro" key={id}>
                  {m && urlPublicaFoto(m.foto_thumb_path)
                    ? <img className="linea-cobro__foto" src={urlPublicaFoto(m.foto_thumb_path)!} alt="" />
                    : <span className="linea-cobro__foto" />}
                  <div>
                    <div className="linea-cobro__nombre">{nombre}</div>
                    <div className="linea-cobro__precio">
                      {precio !== null ? `${formatearBs(precioEnBs(precio, tasa))} c/u · ` : ''}
                      {m ? `quedan ${m.disponible}` : ''}
                    </div>
                    {resumen.ofertaDe.has(id) ? (
                      <div className="campo__pista">
                        {(resumen.ofertaDe.get(id) ?? 0) < cantidad ? `${resumen.ofertaDe.get(id)} con tu código` : 'Con tu código'}
                      </div>
                    ) : null}
                    {/* La cadena dice qué dijes lleva puestos, y deja ponerle uno. */}
                    {m?.armado === 'base' ? (
                      <>
                        {armados.some((p) => p.base === id) ? (
                          <div className="campo__pista">
                            Con {armados.filter((p) => p.base === id)
                              .map((p) => nombreConVariante(conocidos.get(p.dije)?.nombre ?? 'un dije', conocidos.get(p.dije)?.variante))
                              .join(', ')}
                          </div>
                        ) : null}
                        <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => void abrirArmar(id)}>
                          Agrégale un dije
                        </button>
                      </>
                    ) : null}
                  </div>
                  <div className="contador">
                    <button type="button" aria-label={`Quitar una de ${nombre}`} onClick={() => cambiar(id, cantidad - 1)}>&minus;</button>
                    <span className="contador__valor" aria-live="polite">{cantidad}</span>
                    <button type="button" aria-label={`Agregar una de ${nombre}`} disabled={!m || cantidad >= m.disponible} onClick={() => cambiar(id, cantidad + 1)}>+</button>
                  </div>
                </div>
              );
            })}
          </div>

          <TusCodigos
            codigos={ofertas.codigos}
            estados={resumen.codigos}
            carrito={seleccion}
            alQuitar={ofertas.quitar}
          />

          <div className="total-cobro" aria-busy={resumen.calculando}>
            <div>
              <span className="util secundario">Tu total</span>
              <div className="campo__pista">
                {resumen.piezas === 1 ? '1 pieza vale' : `${resumen.piezas} piezas valen`} {formatearBs(precioEnBs(resumen.subtotal, tasa))}
                {resumen.descuento ? `, menos el descuento por cantidad` : ''}
                {resumen.conOferta ? `${resumen.descuento ? ' y' : ', menos'} tus códigos` : ''}
              </div>
            </div>
            <div>
              <div className="total-cobro__cifra">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</div>
              <div className="total-cobro__cifra">{formatearBcv(resumen.totalUsd)}</div>
            </div>
          </div>

          <h2 className="seccion-titulo paso-pedido"><span className="paso-pedido__n" aria-hidden="true">2</span> Tus datos</h2>
          <TusDatos valor={datos} alCambiar={setDatos} />

          <h2 className="seccion-titulo paso-pedido"><span className="paso-pedido__n" aria-hidden="true">3</span> Cómo lo recibes</h2>
          <div className="panel">
            <div className="metodos-pago">
              <button type="button" aria-pressed={entrega === 'tienda'} onClick={() => setEntrega('tienda')}>
                Retiro en tienda
              </button>
              <button type="button" aria-pressed={entrega === 'envio'} onClick={() => setEntrega('envio')}>
                Envío a mi ciudad
              </button>
            </div>

            {entrega === 'envio' ? (
              <>
                <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
                  El envío se paga al retirarlo en la agencia, no ahora.
                </p>
                <div className="metodos-pago" style={{ marginTop: 'var(--e-4)' }}>
                  <button type="button" aria-pressed={empresa === 'domesa'} onClick={() => setEmpresa('domesa')}>Domesa</button>
                  <button type="button" aria-pressed={empresa === 'mrw'} onClick={() => setEmpresa('mrw')}>MRW</button>
                </div>
                <div className="fila" style={{ marginTop: 'var(--e-4)' }}>
                  <Campo etiqueta="Agencia" htmlFor="r-agencia" pista="La sucursal donde lo vas a retirar.">
                    <input id="r-agencia" value={agencia} onChange={(e) => setAgencia(e.target.value)} required />
                  </Campo>
                  <Campo etiqueta="Dirección de la agencia" htmlFor="r-dir">
                    <input id="r-dir" value={direccion} onChange={(e) => setDireccion(e.target.value)} required />
                  </Campo>
                </div>
              </>
            ) : (
              <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
                Te esperamos en la tienda con tu cédula{textos.direccion_tienda ? `: ${textos.direccion_tienda}` : ''}.
              </p>
            )}
          </div>

          {/* Antes del botón, lo que pasa al tocarlo, con las cifras de
              verdad. Antes decía "unos días" y "una parte". */}
          <div className="panel que-pasa">
            <span className="panel__titulo">Qué pasa al apartar</span>
            <p className="prosa">
              {reglas
                ? `Tus piezas quedan guardadas a tu nombre ${decirMinutos(reglas.reserva_minutos)}. En la página de tu pedido pagas el total, o al menos el ${formatearDescuento(reglas.apartado_inicial_pct)} para apartarlas ${reglas.apartado_dias} días y pagar lo demás por partes. Si no terminas de pagar a tiempo, lo abonado no se devuelve y las piezas vuelven a la venta.`
                : 'Tus piezas quedan guardadas a tu nombre mientras pagas. En la página de tu pedido pagas el total, o solo una parte para apartarlas unos días y pagar lo demás por partes; ahí te decimos cuánto y hasta cuándo.'}
              {whatsappTienda ? ' Ahí mismo nos avisas por WhatsApp con un toque.' : ''}
            </p>
          </div>

          <div className="acciones">
            <button
              type="button"
              className="boton boton--confirmar"
              disabled={reservando || resumen.piezas === 0 || !datosParaReservar(datos) || faltaEnvio}
              onClick={() => void reservar()}
            >
              {reservando ? 'Apartando' : 'Apartar mis piezas'}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => setPaso('catalogo')}>
              Seguir viendo
            </button>
          </div>
          {/* Un boton apagado sin explicacion es una trampa. */}
          {!datosParaReservar(datos)
            ? <p className="campo__pista">{queFalta(datos)}</p>
            : faltaEnvio ? <p className="campo__pista">Falta la agencia y su dirección para el envío.</p> : null}
          {/* Vaciar pesaba lo mismo que seguir: ahora es un enlace, lejos del botón. */}
          <button type="button" className="enlace-texto" onClick={() => { vaciar(); setPaso('catalogo'); }}>
            Vaciar el pedido
          </button>
          {hojaArmar}
        </div>
      </>
    );
  }

  /* ---------------------------------------------------------- catalogo */

  const quedanPorVer = enLista ? Math.max(0, total - modelos.length) : 0;
  // El orden, el mismo en la lista (a la vista) y en el inicio (plegado).
  const campoOrden = (
    <Campo etiqueta="Ordenar" htmlFor="orden-publico">
      <select id="orden-publico" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
        <option value="nombre">Por tipo</option>
        <option value="menor">Más baratas primero</option>
        <option value="mayor">Más caras primero</option>
      </select>
    </Campo>
  );
  // Cuántas joyas hay, contadas como tarjetas (un producto con medidas es
  // una): lo que se va a ver al tocar "Ver todas". Si el inicio no las trajo
  // todas, las filas, que es lo que se sabe.
  const cuantasJoyas = total > modelos.length ? total : familias.length;
  const proximasVisibles = todosProximos ? familiasProximas : familiasProximas.slice(0, POR_ESTANTE);

  // El inicio y la lista comparten el buscador y lo que se dice mientras llega
  // (el error, "Trayendo el catálogo", "Ninguna pieza"): se arman una vez.
  const portadaDeHoy = (
    <section className="portada-catalogo">
      <p className="portada-catalogo__de">
        {textos.ciudad ? `Desde ${textos.ciudad} para toda Venezuela` : 'Para toda Venezuela'}
      </p>
      <h1 className="portada-catalogo__titulo">Joyas para usar todos los días</h1>
      {/* En el teléfono, la versión corta; la larga sale en el detalle de cada pieza. */}
      {textos.materiales_largo ? (
        <p className={textos.materiales_corto ? 'portada-catalogo__texto portada-catalogo__texto--largo' : 'portada-catalogo__texto'}>{textos.materiales_largo}</p>
      ) : null}
      {textos.materiales_corto ? (
        <p className={textos.materiales_largo ? 'portada-catalogo__texto portada-catalogo__texto--corto' : 'portada-catalogo__texto'}>{textos.materiales_corto}</p>
      ) : null}
      <AsiPides
        pasos={['Elige tus piezas', 'Apártalas con tu cédula', 'Paga por pago móvil']}
        alVerMas={() => irA('como-pedir')}
      />
      {/* Por dónde empezar, dicho con un botón: quien entra por
          primera vez no sabe que hay que bajar. */}
      <div className="portada-catalogo__empezar">
        <button type="button" className="boton portada-catalogo__boton" onClick={irATodas}>
          Ver todas las joyas
        </button>
        <button type="button" className="asi-pides__mas" onClick={() => irA('tipos')}>
          O elige por tipo
        </button>
      </div>
      {/* Quien no se siente cómodo pidiendo solo, que sepa que no hace
          falta: se le atiende por WhatsApp. */}
      {whatsappTienda ? (
        <p className="portada-catalogo__ayuda">
          ¿Prefieres que te ayudemos?{' '}
          <a href={whatsappTienda} target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a>
          {' '}y te ayudamos a pedir.
        </p>
      ) : null}
    </section>
  );
  const buscador = (
    <div className="buscador-catalogo">
      <div className="para-quien" role="group" aria-label="Joyas para">
        {OPCIONES_PARA.map(([valor, etiqueta]) => (
          <button
            key={etiqueta} type="button" className="para-quien__opcion"
            aria-pressed={para === valor} onClick={() => elegirPara(valor)}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      <Campo etiqueta="Buscar una pieza" htmlFor="buscar-publico">
        <input
          id="buscar-publico" type="search" value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Cadena, anillo, choker..." autoComplete="off"
        />
      </Campo>
      {/* En la lista, qué se ve y en qué orden, a la vista y no plegado:
          quien no sabe que "Filtrar" se abre, no lo abre. Lado a lado en
          el teléfono. El tipo, en la lista de opciones solo en el
          teléfono (en pantallas anchas están las fichas de arriba). */}
      {enLista ? (
        <div className="lista-controles">
          {categorias.length > 1 && !texto.trim() ? (
            <div className="lista-controles__tipo">
              <Campo etiqueta="Ver" htmlFor="ver-publico">
                <select
                  id="ver-publico"
                  value={categoria ?? ''}
                  onChange={(e) => (e.target.value ? setCategoria(e.target.value) : irATodas())}
                >
                  <option value="">Todas las joyas</option>
                  {categorias.map((c) => <option key={c} value={c}>{nombreDeTipo(c)}</option>)}
                </select>
              </Campo>
            </div>
          ) : null}
          {campoOrden}
        </div>
      ) : null}
      {/* En el inicio, el tipo y el orden plegados: con más piezas de las
          que trae, el tipo lleva a todas, y ordenar por precio tiene que
          poder hacerse sin entrar antes a un tipo. */}
      {categorias.length > 1 && !enLista ? (
        <Filtros activos={orden !== 'nombre' ? 1 : 0}>
        <div className="fila">
          <Campo etiqueta="Tipo" htmlFor="tipo-publico">
            <select id="tipo-publico" value="" onChange={(e) => (e.target.value === '*' ? irATodas() : setCategoria(e.target.value || null))}>
              <option value="">Elige un tipo</option>
              <option value="*">Todas las joyas</option>
              {categorias.map((c) => <option key={c} value={c}>{nombreDeTipo(c)}</option>)}
            </select>
          </Campo>
          {campoOrden}
        </div>
        </Filtros>
      ) : null}
    </div>
  );
  const aviso = (
    <>
      {error ? <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso> : null}

      {cargando || cargadoPara !== consultaActual ? (
        <Cargando texto="Trayendo el catálogo" />
      ) : modelos.length === 0 ? (
        <Vacio titulo={texto ? 'Ninguna pieza coincide' : para ? `Por ahora no hay piezas de ${para} a la venta` : 'Por ahora no hay piezas disponibles'}>
          <p>{texto ? 'Prueba con otra palabra, o mira todo el catálogo.' : para ? 'Mira lo que viene en camino, o ve todas las joyas.' : 'Vuelve pronto: estamos surtiendo la vitrina.'}</p>
          {para && !texto ? (
            <button type="button" className="boton boton--secundario" onClick={() => elegirPara(null)}>Ver todas las joyas</button>
          ) : enLista ? (
            <button type="button" className="boton boton--secundario" onClick={alInicio}>Ver todo el catálogo</button>
          ) : null}
        </Vacio>
      ) : null}
    </>
  );
  // Las piezas del inicio ya son las de esta consulta (si no, se estaba
  // escribiendo una letra y la base no ha respondido).
  const piezasListas = !cargando && cargadoPara === consultaActual && modelos.length > 0;
  const catalogoProps: PropsCatalogo = {
    cargando,
    tipos: piezasListas ? tipos : [],
    estantes: piezasListas ? estantes : [],
    cuantasJoyas,
    traidas: modelos.length,
    totalEnBase: total,
    tarjeta: (f) => <TarjetaPieza key={f.clave} familia={f} alVer={() => verFoto(f)} pedido={pedidoTarjeta(f)} {...(cintaDe(f) ? { oferta: cintaDe(f)! } : {})} />,
    irATodas,
    irATipo: setCategoria,
    pasos,
    pieComoPedir: whatsappTienda ? 'Al apartar te sale un botón para avisarnos por WhatsApp.' : null,
    proximas: familiasProximas,
    proximasVisibles,
    totalProximos,
    cargadosProximos: proximos.length,
    todosProximos,
    alternarProximos: () => setTodosProximos((x) => !x),
    alVerProxima: verProxima,
  };

  return (
    <>
      {cabecera}

      <div className={resumen.piezas > 0 ? 'pagina mostrador catalogo-publico pagina--con-barra' : 'pagina mostrador catalogo-publico'}>
        {/* Arriba, o la portada o el título de la lista. El buscador va
            después, siempre en el mismo sitio: si cambiara de lugar al
            escribir, el teléfono cerraría el teclado a media palabra. */}
        {enLista ? (
          <>
            <div className="lista-cabeza">
              <button type="button" className="volver" onClick={alInicio}>
                <Icono nombre="volver" className="icono icono--sm" />
                Volver al inicio
              </button>
              <h1 className="lista-cabeza__titulo" ref={tituloLista} tabIndex={-1}>
                {categoria ? nombreDeTipo(categoria) : (texto.trim() ? `Buscaste “${texto.trim()}”` : para ? `Joyas de ${para}` : 'Todas las joyas')}
              </h1>
              {/* Los tipos a la vista, para pasar de uno a otro sin volver al
                  inicio ni abrir nada: un toque. Se envuelven, no se deslizan.
                  Solo en pantallas anchas: en el teléfono eran cuatro renglones
                  antes de la primera joya, y ahí va la lista "Ver" de abajo. */}
              {categorias.length > 1 && !texto.trim() ? (
                <nav className="tipos-fila" aria-label="Ver otro tipo de joya">
                  <button type="button" className="tipos-fila__tipo" aria-pressed={!categoria} onClick={irATodas}>Todas</button>
                  {categorias.map((c) => (
                    <button key={c} type="button" className="tipos-fila__tipo" aria-pressed={categoria === c} onClick={() => setCategoria(c)}>
                      {nombreDeTipo(c)}
                    </button>
                  ))}
                </nav>
              ) : null}
            </div>
            {buscador}
            {aviso}
            {piezasListas ? (
              <>
                <div className="rejilla-venta">
                  {familias.map((f) => (
                    <TarjetaPieza key={f.clave} familia={f} alVer={() => verFoto(f)} pedido={pedidoTarjeta(f)} {...(cintaDe(f) ? { oferta: cintaDe(f)! } : {})} />
                  ))}
                </div>

                {/* Lo que falta por ver, dicho: antes la pieza 401 no salia nunca. */}
                {quedanPorVer > 0 ? (
                  <div className="catalogo__mas">
                    <p className="paginacion__cuenta">
                      Viendo {formatearEntero(modelos.length)} de {formatearEntero(total)}
                    </p>
                    <button type="button" className="boton boton--secundario" disabled={cargandoMas} onClick={() => void cargarMas()}>
                      {cargandoMas ? 'Trayendo más' : `Ver más piezas · faltan ${formatearEntero(quedanPorVer)}`}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
            <SeccionComoPedir c={catalogoProps} />
            <SeccionProximamente c={catalogoProps} />
            {!cargando ? <LaTienda id="la-tienda" textos={textos} /> : null}
          </>
        ) : (
          landing.cargando ? (
            <div className="lp-espera" role="status" aria-busy="true"><span className="visualmente-oculto">Cargando</span></div>
          ) : <Landing
            secciones={landing.secciones}
            catalogo={catalogoProps}
            ofertas={ofertas}
            acciones={{ tasa, querer: quererOferta, verCodigo: setVentana }}
            textos={textos}
            whatsapp={whatsappTienda}
            portadaDeHoy={portadaDeHoy}
            buscador={buscador}
            aviso={aviso}
          />
        )}

        <footer className="pie-catalogo">
          {textos.catalogo_pie ?? 'Lux by Emory'}
        </footer>

        <VisorFoto {...visorProximo.props} />

        <VisorFoto
          {...visor.props}
          alAbrirPieza={miradas.abrir}
          alCerrarPieza={miradas.cerrar}
          accion={{
            texto: 'Agregar al pedido',
            alTocar: agregarPorId,
            deshabilitada: (id) => {
              const m = conocidos.get(id);
              return !m || (seleccion.get(id) ?? 0) >= m.disponible;
            },
            llevas: (id) => seleccion.get(id) ?? 0,
          }}
          secundaria={{
            texto: 'Agrégale un dije',
            visible: esBase,
            alTocar: (id) => void abrirArmar(id),
          }}
        />

        {hojaArmar}

        {ventana ? (
          <VentanaOferta
            codigo={ventana}
            tasa={tasa}
            faltan={codigoCompleto(ventana, seleccion) ? [] : ventana.piezas.filter((p) => (seleccion.get(p.modelo_id) ?? 0) < p.cantidad)}
            alVerPedido={() => { setVentana(null); setPaso('pedido'); }}
            alCerrar={() => setVentana(null)}
          />
        ) : completalo && parejaPct !== null && conocidos.get(completalo.a) && conocidos.get(completalo.b) ? (
          <HojaCompletalo
            a={conocidos.get(completalo.a)!}
            b={conocidos.get(completalo.b)!}
            pct={parejaPct}
            alQuerer={() => quererOferta('complemento', [completalo.a, completalo.b])}
            alCerrar={() => setCompletalo(null)}
          />
        ) : miradas.pareja && parejaPct !== null && !visor.foto && familiaAbierta === null && armandoBase === null
          && conocidos.get(miradas.pareja[0]) && conocidos.get(miradas.pareja[1]) ? (
          <HojaPareja
            a={conocidos.get(miradas.pareja[0])!}
            b={conocidos.get(miradas.pareja[1])!}
            pct={parejaPct}
            alQuerer={() => quererOferta('dos_vistas', [miradas.pareja![0], miradas.pareja![1]])}
            alCerrar={miradas.descartar}
          />
        ) : null}

        {(() => {
          const abierta = familiaAbierta === null ? null : familias.find((x) => x.clave === familiaAbierta);
          if (!abierta) return null;
          return (
            <ElegirVariante
              titulo={abierta.cabeza.nombre}
              subtitulo="Elige la que quieres."
              opciones={abierta.variantes.map((v) => {
                const puestas = seleccion.get(v.id) ?? 0;
                return {
                  id: v.id,
                  etiqueta: v.variante ?? v.sku,
                  detalle: v.disponible === 1 ? 'Queda 1' : `Quedan ${v.disponible}`,
                  precios: (
                    <>
                      <span className="opcion-variante__precio">{formatearBs(v.precio_bs)}</span>
                      <span className="opcion-variante__precio">{formatearBcv(v.precio_usd)}</span>
                    </>
                  ),
                  deshabilitada: puestas >= v.disponible,
                  llevas: puestas,
                  quedan: v.disponible,
                  precio: { clave: `${v.precio_bs}|${v.precio_usd}` },
                };
              })}
              alElegir={(id) => { agregarPorId(id); setFamiliaAbierta(null); }}
              alCerrar={cerrarHoja}
            />
          );
        })()}

        {/* La primera pieza: dónde quedó y cómo se sigue. Encima de la barra,
            se va sola y no tapa ningún botón. */}
        {recienAgregada && resumen.piezas > 0 ? (
          <p className="aviso-agregado" role="status">
            <strong>Listo, está en tu pedido.</strong> Sigue eligiendo; cuando termines, toca «Ver mi pedido» aquí abajo.
          </p>
        ) : null}

        {resumen.piezas > 0 ? (
          <div className="barra-carrito">
            <div className="barra-carrito__resumen">
              <div className="barra-carrito__piezas">
                {resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}
                {resumen.descuento ? (
                  <span className="barra-carrito__tramo"> · {formatearDescuento(resumen.descuento)} menos</span>
                ) : null}
                {resumen.conOferta ? <span className="barra-carrito__tramo"> · con tu oferta</span> : null}
                {resumen.siguiente ? (
                  <span className="barra-carrito__falta"> · Te faltan {resumen.siguiente.faltan} joya{resumen.siguiente.faltan === 1 ? '' : 's'} para {formatearDescuento(resumen.siguiente.pct)} en todo el pedido</span>
                ) : null}
              </div>
              <div className="barra-carrito__total" aria-live="polite" aria-busy={resumen.calculando}>
                {formatearBs(precioEnBs(resumen.totalUsd, tasa))}
              </div>
            </div>
            {/* En un teléfono angosto no cabe con el total: ahí vive en "Tu pedido". */}
            <button type="button" className="boton boton--secundario barra-carrito__vaciar" onClick={vaciar}>
              Vaciar
            </button>
            <button type="button" className="boton" onClick={() => setPaso('pedido')}>
              Ver mi pedido
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
