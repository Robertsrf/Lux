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
import type { Familia } from '../../lib/familias';
import { enlaceWhatsAppA } from '../../lib/enlaces';
import { useTasa } from '../../hooks/useTasa';
import { decirMinutos, useReglasPedido } from '../../hooks/useReglasPedido';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { ElegirVariante } from '../../componentes/ElegirVariante';
import { AsiPides, ComoPedir, Estante, POR_ESTANTE, TarjetaPieza, TiposConFoto, irA } from '../../componentes/VitrinaPublica';
import type { PasoPedido, PedidoTarjeta, TipoVitrina } from '../../componentes/VitrinaPublica';
import { LaTienda } from '../../componentes/LaTienda';
import { TUS_DATOS_VACIOS, TusDatos, datosParaReservar, queFalta } from '../../componentes/TusDatos';
import type { EstadoTusDatos } from '../../componentes/TusDatos';
import { useTextos } from '../../hooks/useTextos';
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
  const setPaso = (p: 'catalogo' | 'pedido') => {
    // Sin replace: cada cambio deja su huella en el historial.
    setParametros(p === 'pedido' ? { paso: 'pedido' } : {});
  };
  // El tipo va en la ruta: el botón de atrás del teléfono vuelve del tipo al
  // inicio, que es lo que la clienta espera.
  const categoria = parametros.get('tipo');
  const setCategoria = (c: string | null) => setParametros(c ? { tipo: c } : {});
  const enLista = Boolean(categoria || texto.trim() || orden !== 'nombre');
  // De qué consulta son las filas que hay. Mientras no sean de la de ahora
  // (se escribió una letra y la base no ha respondido), no se dibujan: la
  // primera letra pintaba la lista con las mil filas del inicio, letra por
  // letra, en un teléfono de gama baja.
  const consultaActual = `${categoria ?? ''}|${texto.trim()}|${orden}`;
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
    if (texto.trim()) {
      const t = texto.trim().replace(/[%,()"\\:]/g, ' ');
      q = q.or(`nombre.ilike.%${t}%,categoria.ilike.%${t}%,variante.ilike.%${t}%`);
    }
    // Familia e id al final: las variantes de un producto quedan juntas y
    // el orden no cambia entre una tanda y la siguiente.
    q = orden === 'nombre'
      ? q.order('categoria', { ascending: true }).order('nombre', { ascending: true })
      : q.order('precio_usd', { ascending: orden === 'menor' }).order('nombre', { ascending: true });
    const lista = Boolean(categoria || texto.trim() || orden !== 'nombre');
    const hasta = lista ? desde + POR_TANDA - 1 : TOPE_INICIO - 1;
    return q.order('familia', { ascending: true }).order('id', { ascending: true }).range(desde, hasta);
  }, [texto, categoria, orden]);

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
    setCargadoPara(`${categoria ?? ''}|${texto.trim()}|${orden}`);
    setCargando(false);
  }, [consulta, recordar, categoria, texto, orden]);

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
  useEffect(() => { window.scrollTo(0, 0); }, [categoria, paso]);
  // "Ver todas" desaparece al tocarlo: el foco pasa al título del tipo, y no
  // se pierde al principio de la página.
  const tituloLista = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (categoria) tituloLista.current?.focus({ preventScroll: true }); }, [categoria]);

  // Lo próximo se pide una vez y se filtra aquí con la búsqueda y la
  // categoría: son pocas piezas. Su error se mira y a propósito no se
  // enseña: si esta sección falla, el catálogo de verdad sigue entero, y
  // un aviso rojo por un adelanto asustaría a la clienta por nada.
  useEffect(() => {
    void (async () => {
      const { data, count, error: err } = await supabase
        .from('v_proximamente')
        .select(COLUMNAS_PROXIMO, { count: 'exact' })
        .order('categoria', { ascending: true }).order('nombre', { ascending: true })
        .order('familia', { ascending: true }).order('id', { ascending: true })
        .range(0, TOPE_PROXIMO - 1);
      if (err) return;
      const filas = (data as unknown as ModeloProximo[] | null) ?? [];
      setProximos(filas);
      setTotalProximos(count ?? filas.length);
    })();
  }, []);

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
    const clave = claveDe(items);
    let vigente = true;
    const reloj = window.setTimeout(() => {
      void (async () => {
        const { data, error: err } = await supabase.rpc('cotizar_pedido', { p_items: items });
        if (!vigente) return;
        setCotizacion(err || !data ? null : { ...(data as Cotizacion), clave });
      })();
    }, 250);
    return () => { vigente = false; window.clearTimeout(reloj); };
  }, [seleccion]);

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
    const siguiente = tramos
      .filter((t) => t.activo && t.min_piezas > tramo.piezas)
      .sort((x, y) => x.min_piezas - y.min_piezas)[0] ?? null;
    const deLaBase = cotizacion !== null && cotizacion.clave === claveDe(items) ? cotizacion : null;
    return {
      piezas,
      subtotal: deLaBase ? Number(deLaBase.subtotal_usd) : subtotal,
      descuento: deLaBase ? (Number(deLaBase.descuento_pct) || null) : descuento,
      totalUsd: deLaBase ? Number(deLaBase.total_usd) : deMonto(sumar(conDescuento)),
      /** El precio de cada pieza en este pedido, si ya respondió la base. */
      precioDe: new Map((deLaBase?.lineas ?? []).map((l) => [l.modelo_id, Number(l.precio_usd)])),
      calculando: seleccion.size > 0 && !deLaBase,
      siguiente: siguiente ? { faltan: siguiente.min_piezas - tramo.piezas, pct: siguiente.descuento_pct } : null,
    };
  }, [seleccion, tramos, conocidos, cotizacion]);

  // Las parejas que caben en lo que lleva el pedido: si quita una cadena,
  // la pareja de esa cadena se cae sola (como en `guardar_armados`).
  const armados = useMemo(() => paresVigentes(pares, seleccion), [pares, seleccion]);

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
    cambiar(id, (seleccion.get(id) ?? 0) + 1);
  }

  function vaciar() {
    setSeleccion(new Map());
    setPares([]);
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
    });

    if (err) { setError(mensajeDeError(err)); setReservando(false); return; }
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
  // inicio y, si hay número, "Escríbenos" abre el WhatsApp de la tienda.
  const cabecera = (
    <header className="barra barra--publica">
      <div className="barra__interior">
        <Link to="/publico" className="barra__marca" aria-label="Lux by Emory, ir al inicio del catálogo">
          <Wordmark alto={40} />
        </Link>
        {whatsappTienda ? (
          <a className="boton boton--secundario barra__contacto" href={whatsappTienda} target="_blank" rel="noopener noreferrer">
            Escríbenos<span className="visualmente-oculto"> por WhatsApp</span>
          </a>
        ) : null}
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

          <div className="total-cobro" aria-busy={resumen.calculando}>
            <div>
              <span className="util secundario">Tu total</span>
              <div className="campo__pista">
                {resumen.piezas === 1 ? '1 pieza vale' : `${resumen.piezas} piezas valen`} {formatearBs(precioEnBs(resumen.subtotal, tasa))}
                {resumen.descuento ? `, menos el descuento por cantidad` : ''}
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
  const proximasVisibles = todosProximos ? familiasProximas : familiasProximas.slice(0, POR_ESTANTE);

  return (
    <>
      {cabecera}

      <div className={resumen.piezas > 0 ? 'pagina mostrador catalogo-publico pagina--con-barra' : 'pagina mostrador catalogo-publico'}>
        {/* Arriba, o la portada o el título de la lista. El buscador va
            después, siempre en el mismo sitio: si cambiara de lugar al
            escribir, el teléfono cerraría el teclado a media palabra. */}
        {enLista ? (
          <div className="lista-cabeza">
            <button type="button" className="volver" onClick={alInicio}>
              <Icono nombre="volver" className="icono icono--sm" />
              Todo el catálogo
            </button>
            <h1 className="lista-cabeza__titulo" ref={tituloLista} tabIndex={-1}>
              {categoria ? nombreDeTipo(categoria) : (texto.trim() ? `Buscaste “${texto.trim()}”` : 'Todas las piezas')}
            </h1>
          </div>
        ) : (
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
          </section>
        )}

        <div className="buscador-catalogo">
          <Campo etiqueta="Buscar una pieza" htmlFor="buscar-publico">
            <input
              id="buscar-publico" type="search" value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Cadena, anillo, choker..." autoComplete="off"
            />
          </Campo>
          {/* El tipo y el orden también en el inicio: con más piezas de las
              que trae, el tipo lleva a todas, y ordenar por precio tiene que
              poder hacerse sin entrar antes a un tipo. */}
          {categorias.length > 1 || enLista ? (
            <Filtros activos={(categoria ? 1 : 0) + (orden !== 'nombre' ? 1 : 0)}>
            <div className="fila">
              {categorias.length > 1 ? (
                <Campo etiqueta="Tipo" htmlFor="tipo-publico">
                  <select id="tipo-publico" value={categoria ?? ''} onChange={(e) => setCategoria(e.target.value || null)}>
                    <option value="">Todos los tipos</option>
                    {categorias.map((c) => <option key={c} value={c}>{nombreDeTipo(c)}</option>)}
                  </select>
                </Campo>
              ) : null}
              <Campo etiqueta="Ordenar" htmlFor="orden-publico">
                <select id="orden-publico" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
                  <option value="nombre">Por tipo de pieza</option>
                  <option value="menor">Precio: menor a mayor</option>
                  <option value="mayor">Precio: mayor a menor</option>
                </select>
              </Campo>
            </div>
            </Filtros>
          ) : null}
        </div>

        {error ? <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso> : null}

        {cargando || cargadoPara !== consultaActual ? (
          <Cargando texto="Trayendo el catálogo" />
        ) : modelos.length === 0 ? (
          <Vacio titulo={texto ? 'Ninguna pieza coincide' : 'Por ahora no hay piezas disponibles'}>
            <p>{texto ? 'Prueba con otra palabra, o mira todo el catálogo.' : 'Vuelve pronto: estamos surtiendo la vitrina.'}</p>
            {enLista ? (
              <button type="button" className="boton boton--secundario" onClick={alInicio}>Ver todo el catálogo</button>
            ) : null}
          </Vacio>
        ) : enLista ? (
          <>
            <div className="rejilla-venta">
              {familias.map((f) => (
                <TarjetaPieza key={f.clave} familia={f} alVer={() => verFoto(f)} pedido={pedidoTarjeta(f)} />
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
        ) : (
          <>
            <TiposConFoto tipos={tipos} alElegir={setCategoria} />
            {estantes.map((e) => (
              <Estante
                key={e.categoria}
                titulo={nombreDeTipo(e.categoria)}
                cuantas={e.familias.length}
                alVerTodas={e.familias.length > POR_ESTANTE ? () => setCategoria(e.categoria) : undefined}
              >
                {e.familias.slice(0, POR_ESTANTE).map((f) => (
                  <TarjetaPieza key={f.clave} familia={f} alVer={() => verFoto(f)} pedido={pedidoTarjeta(f)} />
                ))}
              </Estante>
            ))}
            {/* Con más piezas de las que trae el inicio, se dice: cortar sin
                avisar es lo que dejaba la pieza 401 sin salir nunca. */}
            {total > modelos.length ? (
              <p className="paginacion__cuenta">
                Aquí salen las primeras {formatearEntero(modelos.length)} de {formatearEntero(total)} piezas. Elige un tipo arriba para verlas todas.
              </p>
            ) : null}
          </>
        )}

        {!cargando ? (
          <ComoPedir
            id="como-pedir"
            pasos={pasos}
            pie={whatsappTienda ? 'Al apartar te sale un botón para avisarnos por WhatsApp.' : undefined}
          />
        ) : null}

        {/*
          PRÓXIMAMENTE. Lo nuevo de un lote que todavía no llega: foto,
          nombre y precio, y ningún botón de pedir. No dice cuántas vienen
          ni dónde van: eso es de la tienda. Cuando el dueño libera el lote,
          estas piezas suben a la vitrina con su "Agregar". Un estante de
          cuatro: antes eran 41 tarjetas, el 27 % de la página.
        */}
        {!cargando && familiasProximas.length > 0 ? (
          <section className="proximos" aria-labelledby="titulo-proximos">
            <div className="estante__cabeza">
              <h2 className="estante__titulo" id="titulo-proximos">
                Próximamente <span className="estante__cuantas">{familiasProximas.length}</span>
              </h2>
            </div>
            <p className="proximos__nota">
              Vienen en camino. Todavía no se pueden pedir: cuando lleguen, salen arriba con su botón para agregar.
            </p>
            <div className="rejilla-venta">
              {proximasVisibles.map((f) => (
                <TarjetaPieza key={f.clave} familia={f} alVer={() => verProxima(f)} proxima />
              ))}
            </div>
            {/* Abre y cierra: abierto, las 48 alargaban la página 8.000 px y
                dejaban la tienda al fondo, sin manera de volver a plegarlas. */}
            {familiasProximas.length > POR_ESTANTE ? (
              <div className="catalogo__mas">
                <button type="button" className="boton boton--secundario" aria-expanded={todosProximos} onClick={() => setTodosProximos((x) => !x)}>
                  {todosProximos ? 'Ver menos' : `Ver las ${formatearEntero(familiasProximas.length)} que vienen`}
                </button>
              </div>
            ) : null}
            {todosProximos && totalProximos > proximos.length ? (
              <p className="paginacion__cuenta">Y {formatearEntero(totalProximos - proximos.length)} más que vienen en camino.</p>
            ) : null}
          </section>
        ) : null}

        {!cargando ? <LaTienda id="la-tienda" textos={textos} /> : null}

        <footer className="pie-catalogo">
          {textos.catalogo_pie ?? 'Lux by Emory'}
        </footer>

        <VisorFoto {...visorProximo.props} />

        <VisorFoto
          {...visor.props}
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

        {resumen.piezas > 0 ? (
          <div className="barra-carrito">
            <div className="barra-carrito__resumen">
              <div className="barra-carrito__piezas">
                {resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}
                {resumen.descuento ? (
                  <span className="barra-carrito__tramo"> · {formatearDescuento(resumen.descuento)} menos</span>
                ) : resumen.siguiente ? (
                  <span className="barra-carrito__falta"> · {resumen.siguiente.faltan} más y baja {formatearDescuento(resumen.siguiente.pct)}</span>
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
              Ver pedido
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
