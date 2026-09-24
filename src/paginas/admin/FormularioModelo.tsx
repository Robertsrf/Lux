import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando } from '../../componentes/Piezas';
import { Icono } from '../../componentes/Iconos';
import {
  aDolaresReales, aMonto, binanceDesdeBs, deMonto, formatearBcv, formatearBinance, formatearBs,
  formatearMonto, formatearPorcentaje, precioEnBs,
} from '../../lib/dinero';
import { formatearPeso, OBJETIVO_GRANDE, procesarFoto, subirFoto, urlPublicaFoto } from '../../lib/fotos';
import type { FotoProcesada } from '../../lib/fotos';
import { useCategorias, useGrupos, useUbicaciones } from '../../hooks/useCatalogos';
import { useTasa } from '../../hooks/useTasa';
import type { LoteAdmin, ModeloAdmin, PrecioSugerido } from '../../lib/tipos';


const VACIO = {
  nombre: '',
  categoria: 'anillo',
  sku: '',
  descripcion: '',
  variantes_nota: '',
  variante: '',
  lote_id: '',
  costo_unitario_usd: '',
  grupo_precio_id: '',
  precio_override_usd: '',
};

/** Una fila de la tabla de variantes: otra medida del mismo producto. */
interface FilaVariante {
  /** Estable para React: el id, o una marca para las que aun no existen. */
  clave: string;
  id: number | null;
  sku: string | null;
  variante: string;
  /** Vacio = cuesta lo mismo que el producto (y entonces vale lo mismo). */
  costo: string;
  /** Con que costo llego de la base: si no cambia, su precio se respeta. */
  costoOriginal: number | null;
  precioActualBcv: number | null;
  grupoActual: string | null;
  /** Por ubicacion, igual que el producto. */
  cantidades: Record<number, string>;
  /** Se saca del catalogo al guardar. */
  quitar: boolean;
}

/** Lo que dice la columna "Sale en" de una fila. */
interface PrecioDeFila {
  bcv: number | null;
  detalle: string;
  alcanza: boolean;
}

const suma = (cantidades: Record<number, string>, sin: number | null) =>
  Object.entries(cantidades)
    .filter(([u]) => Number(u) !== sin)
    .reduce((n, [, c]) => n + (Number(c) || 0), 0);

/**
 * Pasar de un producto a otro es la MISMA ruta con otros datos. Sin la
 * clave, React reutilizaria el formulario y el segundo heredaria lo
 * escrito en el primero.
 */
export function FormularioModelo() {
  const { id } = useParams();
  return <Formulario key={id ?? 'nuevo'} />;
}

/**
 * Carga de modelos. Se inventarian MODELOS con cantidad, no piezas
 * individuales: no existe "la pieza numero 247", existe "cadena cubana
 * dorada" de la que quedan 18.
 *
 * VARIANTES: UNA TABLA, NO UN PROTOCOLO. Una cadena de 45 cm y otra de
 * 60 cm son el mismo producto con dos opciones. Antes cada medida era un
 * formulario entero: guardar, "agregar otra variante", cambiar la medida,
 * guardar otra vez. El dueno lo llamo, con razon, un protocolo inservible.
 *
 * Ahora es una fila por variante: su nombre, su cantidad y su costo si es
 * distinto. El precio sale solo, con la misma cuenta que el producto
 * (`admin_sugerir_precio`), y se ve antes de guardar. Todo se guarda con el
 * boton de siempre, en una sola transaccion con el producto.
 *
 * En la base cada variante sigue siendo un modelo completo (su SKU, su
 * existencia, su grupo): lo que las junta es la familia. Nombre, categoria,
 * nota, descripcion, lote y foto son del producto y se copian solos.
 */
function Formulario() {
  const { id } = useParams();
  const navegar = useNavigate();
  const esNuevo = !id;

  const { grupos } = useGrupos();
  const categorias = useCategorias();
  const { ubicaciones } = useUbicaciones();
  const { tasa } = useTasa();

  const [form, setForm] = useState(VACIO);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [lotes, setLotes] = useState<Pick<LoteAdmin, 'id' | 'codigo' | 'flete_por_unidad_usd'>[]>([]);
  const [foto, setFoto] = useState<FotoProcesada | null>(null);
  const [fotoActual, setFotoActual] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [sugerencia, setSugerencia] = useState<PrecioSugerido | null>(null);
  const [margenObjetivo, setMargenObjetivo] = useState('');
  const [categoriaNueva, setCategoriaNueva] = useState(false);
  const [autoAsignado, setAutoAsignado] = useState(false);
  const [cargando, setCargando] = useState(!esNuevo);
  const [guardando, setGuardando] = useState(false);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorVariante, setErrorVariante] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaVariante[]>([]);
  // De que ubicacion son las cantidades que se ven en la tabla.
  const [ubicVar, setUbicVar] = useState<number | null>(null);
  // Lo que da `admin_sugerir_precio` para cada costo distinto, ya pedido.
  const [sugeridas, setSugeridas] = useState<Record<string, PrecioSugerido>>({});
  const campoVariante = useRef<HTMLInputElement>(null);
  const nuevas = useRef(0);

  function cambiar<K extends keyof typeof VACIO>(campo: K, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('v_lotes_admin').select('id, codigo, flete_por_unidad_usd').order('fecha_llegada', { ascending: false });
      setLotes((data as Pick<LoteAdmin, 'id' | 'codigo' | 'flete_por_unidad_usd'>[] | null) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (esNuevo) return;
    void (async () => {
      setCargando(true);
      const { data, error: err } = await supabase
        .from('v_catalogo_admin')
        .select('id, sku, nombre, categoria, descripcion, variantes_nota, foto_path, foto_thumb_path, grupo_precio_id, precio_override_usd, lote_id, costo_unitario_usd, flete_unitario_usd, familia, variante')
        .eq('id', Number(id))
        .maybeSingle();

      if (err) { setError(mensajeDeError(err)); setCargando(false); return; }
      const m = data as unknown as ModeloAdmin | null;
      if (!m) { setError('Ese modelo no existe o esta desactivado.'); setCargando(false); return; }

      setForm({
        nombre: m.nombre,
        categoria: m.categoria,
        sku: m.sku,
        descripcion: m.descripcion ?? '',
        variantes_nota: m.variantes_nota ?? '',
        variante: m.variante ?? '',
        lote_id: m.lote_id ? String(m.lote_id) : '',
        costo_unitario_usd: String(m.costo_unitario_usd ?? ''),
        grupo_precio_id: m.grupo_precio_id ? String(m.grupo_precio_id) : '',
        precio_override_usd: m.precio_override_usd === null ? '' : String(m.precio_override_usd),
      });
      setFotoActual(urlPublicaFoto(m.foto_thumb_path ?? m.foto_path));
      setAutoAsignado(true);

      // Sus hermanas, con su costo y su precio de hoy, y las existencias
      // de todas en una sola consulta.
      const { data: hermanas, error: errH } = await supabase
        .from('v_catalogo_admin')
        .select('id, sku, variante, costo_unitario_usd, precio_usd, grupo')
        .eq('familia', m.familia)
        .neq('id', m.id)
        .order('variante', { ascending: true });
      const lista = (hermanas as { id: number; sku: string; variante: string | null; costo_unitario_usd: number; precio_usd: number | null; grupo: string | null }[] | null) ?? [];

      const ids = [m.id, ...lista.map((h) => h.id)];
      const { data: ex, error: errEx } = await supabase
        .from('existencias')
        .select('modelo_id, ubicacion_id, cantidad')
        .in('modelo_id', ids);
      // Dos consultas, dos errores mirados.
      const fallo = errH ?? errEx;
      if (fallo) setError(mensajeDeError(fallo));

      const porModelo = new Map<number, Record<number, string>>();
      for (const fila of (ex as { modelo_id: number; ubicacion_id: number; cantidad: number }[] | null) ?? []) {
        const mapa = porModelo.get(fila.modelo_id) ?? {};
        mapa[fila.ubicacion_id] = String(fila.cantidad);
        porModelo.set(fila.modelo_id, mapa);
      }
      setCantidades(porModelo.get(m.id) ?? {});
      setFilas(lista.map((h) => ({
        clave: `v${h.id}`,
        id: h.id,
        sku: h.sku,
        variante: h.variante ?? '',
        // Si cuesta lo mismo que el producto, la casilla va vacia: "igual".
        costo: Number(h.costo_unitario_usd) === Number(m.costo_unitario_usd) ? '' : String(h.costo_unitario_usd),
        costoOriginal: Number(h.costo_unitario_usd),
        precioActualBcv: h.precio_usd,
        grupoActual: h.grupo,
        cantidades: porModelo.get(h.id) ?? {},
        quitar: false,
      })));
      setCargando(false);
    })();
  }, [id, esNuevo]);

  // La ubicacion de la tabla: donde el producto tiene mas piezas, o la
  // primera de la tienda si todavia no tiene ninguna.
  useEffect(() => {
    if (ubicVar !== null || ubicaciones.length === 0 || cargando) return;
    const conMas = ubicaciones
      .map((u) => ({ id: u.id, n: Number(cantidades[u.id] ?? 0) || 0 }))
      .sort((a, b) => b.n - a.n)[0];
    setUbicVar(conMas && conMas.n > 0 ? conMas.id : ubicaciones[0]!.id);
  }, [ubicaciones, cantidades, ubicVar, cargando]);

  // El precio de cada variante con costo propio lo calcula la base, con la
  // misma cuenta que el producto. Se pide cuando se deja de escribir.
  const lotePrecio = form.lote_id ? Number(form.lote_id) : null;
  const claveSugerida = (costo: string) => `${lotePrecio ?? '-'}|${Number(costo)}`;
  useEffect(() => {
    const faltan = [...new Set(filas
      .filter((f) => !f.quitar && f.costo.trim() !== '' && Number.isFinite(Number(f.costo)) && Number(f.costo) >= 0)
      .map((f) => f.costo.trim()))]
      .filter((c) => !sugeridas[claveSugerida(c)]);
    if (faltan.length === 0) return;
    const espera = setTimeout(() => {
      void (async () => {
        const respuestas = await Promise.all(faltan.map((c) => supabase.rpc('admin_sugerir_precio', {
          p_lote_id: lotePrecio,
          p_costo_usd: Number(c),
          p_margen_pct: null,
        })));
        setSugeridas((s) => {
          const copia = { ...s };
          respuestas.forEach((r, i) => {
            if (!r.error && r.data) copia[claveSugerida(faltan[i]!)] = r.data as unknown as PrecioSugerido;
          });
          return copia;
        });
      })();
    }, 450);
    return () => clearTimeout(espera);
  }, [filas, lotePrecio, sugeridas]);

  function cambiarFila(clave: string, cambio: Partial<FilaVariante>) {
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));
    setErrorVariante(null);
  }

  function agregarFila() {
    nuevas.current += 1;
    setFilas((fs) => [...fs, {
      clave: `nueva-${nuevas.current}`, id: null, sku: null, variante: '', costo: '',
      costoOriginal: null, precioActualBcv: null, grupoActual: null, cantidades: {}, quitar: false,
    }]);
    setErrorVariante(null);
    // Si esta todavia no tiene nombre de variante, se empieza por ahi.
    if (!form.variante.trim()) setTimeout(() => campoVariante.current?.focus(), 0);
  }

  function quitarFila(f: FilaVariante) {
    // Una que todavia no existe se borra sin mas; una que existe se marca y
    // se saca del catalogo al guardar, con opcion de deshacer.
    if (f.id === null) setFilas((fs) => fs.filter((x) => x.clave !== f.clave));
    else cambiarFila(f.clave, { quitar: true });
  }

  // La vista previa de la foto nueva. El URL de objeto se libera al cambiar
  // de foto o al salir: si no, el navegador se queda con la imagen en memoria
  // hasta recargar, y aqui se cargan piezas de cincuenta en cincuenta.
  useEffect(() => {
    if (!foto) { setPrevia(null); return; }
    const url = URL.createObjectURL(foto.grande);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  // El flete prorrateado, la conversion a dolares BCV y el precio sugerido
  // los calcula la base. El navegador no repite ninguna de esas formulas:
  // las pregunta.
  const pedirSugerencia = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_sugerir_precio', {
      p_lote_id: form.lote_id ? Number(form.lote_id) : null,
      p_costo_usd: Number(form.costo_unitario_usd || 0),
      p_margen_pct: margenObjetivo === '' ? null : Number(margenObjetivo),
    });
    if (!err) setSugerencia(data as unknown as PrecioSugerido);
  }, [form.lote_id, form.costo_unitario_usd, margenObjetivo]);

  useEffect(() => {
    const t = setTimeout(() => void pedirSugerencia(), 400);
    return () => clearTimeout(t);
  }, [pedirSugerencia]);

  // Asignacion automatica del grupo: solo la primera vez y solo si el
  // admin no ha elegido nada. Si el elige a mano, no se le vuelve a mover.
  useEffect(() => {
    if (autoAsignado || !sugerencia?.grupo_id) return;
    if (form.grupo_precio_id !== '' || form.precio_override_usd !== '') return;
    if (Number(form.costo_unitario_usd || 0) <= 0) return;
    setForm((f) => ({ ...f, grupo_precio_id: String(sugerencia.grupo_id) }));
    setAutoAsignado(true);
  }, [sugerencia, autoAsignado, form.grupo_precio_id, form.precio_override_usd, form.costo_unitario_usd]);

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    setProcesandoFoto(true);
    setError(null);
    try {
      setFoto(await procesarFoto(archivo));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la foto.');
      setFoto(null);
    } finally {
      setProcesandoFoto(false);
    }
  }

  /**
   * Lo que dice cada fila antes de guardar, con la misma regla que aplica
   * la base al guardar (`guardar_variantes_de`):
   *   - costo vacio o igual al del producto: su mismo precio;
   *   - costo propio que no cambio: el precio que ya tenia;
   *   - costo nuevo: el grupo que da `admin_sugerir_precio`.
   */
  function precioDeFila(f: FilaVariante): PrecioDeFila {
    const costoProducto = Number(form.costo_unitario_usd || 0);
    if (f.costo.trim() === '' || Number(f.costo) === costoProducto) {
      return {
        bcv: precioBcv,
        detalle: form.precio_override_usd ? 'igual: precio propio' : grupoElegido ? `igual: ${grupoElegido.nombre}` : 'igual',
        alcanza: true,
      };
    }
    if (f.id !== null && f.costoOriginal !== null && Number(f.costo) === f.costoOriginal) {
      return { bcv: f.precioActualBcv, detalle: f.grupoActual ?? 'precio propio', alcanza: true };
    }
    const s = sugeridas[claveSugerida(f.costo.trim())];
    if (!s) return { bcv: null, detalle: 'calculando', alcanza: true };
    return {
      bcv: s.grupo_precio_bcv,
      detalle: `${s.grupo_nombre ?? 'sin grupo'} · deja ${formatearPorcentaje(s.margen_resultante_pct, 0)}`,
      alcanza: s.grupo_alcanza,
    };
  }

  /** Lo que se le puede objetar a la tabla antes de mandarla. */
  function revisarVariantes(): string | null {
    const vivas = filas.filter((f) => !f.quitar);
    if (vivas.length === 0) return null;
    // Dos opciones sin nombre en la hoja de elegir son dos botones iguales.
    if (!form.variante.trim()) return 'Ponle nombre de variante a esta también, en la primera fila: por ejemplo 45 cm.';
    if (vivas.some((f) => !f.variante.trim())) return 'Cada variante necesita su nombre: 45 cm, talla 7, dorada.';
    const nombres = [form.variante, ...vivas.map((f) => f.variante)].map((v) => v.trim().toLowerCase());
    const repetido = nombres.find((n, i) => nombres.indexOf(n) !== i);
    if (repetido) return `Hay dos variantes que se llaman "${repetido}". Cámbiale el nombre a una.`;
    if (vivas.some((f) => f.costo.trim() !== '' && (!Number.isFinite(Number(f.costo)) || Number(f.costo) < 0))) {
      return 'Un costo de variante no es un número válido.';
    }
    return null;
  }

  async function guardar() {
    setError(null);
    const objecion = revisarVariantes();
    setErrorVariante(objecion);
    if (objecion) {
      if (!form.variante.trim()) campoVariante.current?.focus();
      return;
    }
    setGuardando(true);

    try {
      let rutas: { foto_path: string | null; foto_thumb_path: string | null } | null = null;
      if (foto) {
        const carpeta = form.sku.trim() || form.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        rutas = await subirFoto(carpeta, foto);
      }

      const existencias = ubicaciones
        .map((u) => ({ ubicacion_id: u.id, cantidad: Number(cantidades[u.id] ?? 0) }))
        .filter((x) => Number.isFinite(x.cantidad) && x.cantidad >= 0);

      const { data, error: err } = await supabase.rpc('admin_guardar_modelo', {
        p_id: esNuevo ? null : Number(id),
        p_nombre: form.nombre,
        p_categoria: form.categoria,
        p_grupo_precio_id: form.grupo_precio_id ? Number(form.grupo_precio_id) : null,
        p_lote_id: form.lote_id ? Number(form.lote_id) : null,
        p_costo_unitario_usd: Number(form.costo_unitario_usd || 0),
        p_descripcion: form.descripcion || null,
        p_variantes_nota: form.variantes_nota || null,
        p_precio_override_usd: form.precio_override_usd ? Number(form.precio_override_usd) : null,
        p_foto_path: rutas?.foto_path ?? null,
        p_foto_thumb_path: rutas?.foto_thumb_path ?? null,
        p_sku: form.sku || null,
        p_existencias: existencias,
        // Cadena vacia = sin variante. Null significaria "no la toques",
        // que es lo que manda el formulario viejo.
        p_variante: form.variante.trim(),
        // Las variantes van en la misma llamada: la base las guarda en la
        // misma transaccion que el producto. Null si no hay ninguna.
        p_variantes: filas.length === 0 ? null : filas.map((f) => ({
          id: f.id,
          variante: f.variante.trim(),
          costo_unitario_usd: f.costo.trim() === '' ? null : Number(f.costo),
          quitar: f.quitar,
          existencias: Object.entries(f.cantidades)
            .filter(([, c]) => c !== '' && Number.isFinite(Number(c)))
            .map(([u, c]) => ({ ubicacion_id: Number(u), cantidad: Math.max(0, Math.trunc(Number(c))) })),
        })),
      });

      if (err) throw err;
      if (!data) throw new Error('La base no devolvio el modelo guardado.');
      navegar('/admin/inventario');
    } catch (e) {
      setError(mensajeDeError(e));
      setGuardando(false);
    }
  }

  const grupoElegido = grupos.find((g) => String(g.id) === form.grupo_precio_id);
  const precioBcv = form.precio_override_usd ? Number(form.precio_override_usd) : grupoElegido?.precio_usd ?? null;

  // Todo se compara en DOLARES BCV, que es la moneda de la etiqueta. El
  // costo total ya viene asi de la base: mercancia convertida con la brecha
  // mas lo que la pieza carga de tienda. Calcularlo aqui a mano fue lo que
  // hizo que esta pantalla mostrara un margen distinto al del inventario.
  const costoTotalBcv = sugerencia?.costo_total_usd ?? null;
  const ganancia = precioBcv !== null && costoTotalBcv !== null
    ? deMonto(aMonto(precioBcv) - aMonto(costoTotalBcv))
    : null;
  const margenPct = precioBcv && precioBcv > 0 && ganancia !== null ? (ganancia / precioBcv) * 100 : null;
  // La misma ganancia en los dolares que se recompran en Binance.
  const gananciaReal = aDolaresReales(ganancia, tasa);

  if (cargando) return <Cargando texto="Cargando producto" />;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>{esNuevo ? 'Agregar producto' : `Editar ${form.sku}`}</h1>
          <p>Cada producto se inventaria con su cantidad, no pieza por pieza. Sus medidas o tallas van abajo, en Variantes.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}

      <form
        onSubmit={(e) => { e.preventDefault(); void guardar(); }}
        className="pila"
      >
        <div className="tarjeta">
          <h2>Foto</h2>
          <hr className="divisor" />

          {fotoActual || previa ? (
            <div className="fotos-comparadas">
              {fotoActual ? (
                <figure>
                  <img src={fotoActual} alt="Foto actual del modelo" className="foto-actual" />
                  <figcaption>{previa ? 'La que esta puesta' : 'Foto actual'}</figcaption>
                </figure>
              ) : null}
              {previa ? (
                <figure>
                  <img src={previa} alt="Foto nueva, sin guardar" className="foto-actual" />
                  <figcaption>La nueva · se guarda al confirmar</figcaption>
                </figure>
              ) : null}
            </div>
          ) : null}

          <Campo
            etiqueta="Archivo"
            htmlFor="m-foto"
            pista="Se comprime aquí mismo antes de subir: 1800 px en WebP, más una miniatura de 600 px."
          >
            <input id="m-foto" type="file" accept="image/*" onChange={(e) => void elegirFoto(e.target.files?.[0])} />
          </Campo>

          {procesandoFoto ? <p className="campo__pista">Comprimiendo</p> : null}

          {foto ? (
            <Aviso tono={foto.pesoGrande <= OBJETIVO_GRANDE ? 'exito' : 'alerta'} titulo="Foto lista">
              Original {formatearPeso(foto.pesoOriginal)} · catálogo {formatearPeso(foto.pesoGrande)} ·
              miniatura {formatearPeso(foto.pesoThumb)}
            </Aviso>
          ) : null}
        </div>

        <div className="tarjeta">
          <h2>Identidad</h2>
          <hr className="divisor" />

          <Campo etiqueta="Nombre" htmlFor="m-nombre" pista="Como lo reconoce la vendedora: cadena cubana dorada.">
            <input id="m-nombre" required value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
          </Campo>

          <div className="fila">
            <Campo etiqueta="Categoría" htmlFor="m-categoria">
              {/* Lista y no campo libre: escribiendola a mano terminan
                  conviviendo "Collar", "collar" y "collares", y despues no
                  hay forma de filtrar por categoria sin fallar. */}
              <select
                id="m-categoria"
                required
                value={categoriaNueva ? '__nueva' : form.categoria}
                onChange={(e) => {
                  if (e.target.value === '__nueva') { setCategoriaNueva(true); cambiar('categoria', ''); }
                  else { setCategoriaNueva(false); cambiar('categoria', e.target.value); }
                }}
              >
                <option value="">Elige una</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__nueva">Otra, la escribo yo</option>
              </select>
            </Campo>
            <Campo etiqueta="SKU" htmlFor="m-sku" pista={esNuevo ? 'Si lo dejas vacio se genera: CAD-G13-007.' : undefined}>
              <input id="m-sku" value={form.sku} onChange={(e) => cambiar('sku', e.target.value)} />
            </Campo>
          </div>

          {categoriaNueva ? (
            <Campo
              etiqueta="Nombre de la categoría nueva"
              htmlFor="m-categoria-nueva"
              pista="En singular y en minuscula, como las demas: pulsera, no Pulseras."
            >
              <input
                id="m-categoria-nueva"
                required
                autoFocus
                value={form.categoria}
                onChange={(e) => cambiar('categoria', e.target.value.trimStart().toLowerCase())}
              />
            </Campo>
          ) : null}

          <Campo
            etiqueta="Nota corta"
            htmlFor="m-variantes"
            pista="Algo que la clienta deba saber de la pieza: ajustable, se vende en par. Las medidas o tallas que se venden aparte van como variantes, abajo."
          >
            <textarea id="m-variantes" value={form.variantes_nota} onChange={(e) => cambiar('variantes_nota', e.target.value)} />
          </Campo>

          <Campo etiqueta="Descripcion" htmlFor="m-desc">
            <textarea id="m-desc" value={form.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} />
          </Campo>
        </div>

        <div className="tarjeta">
          <h2>Costo y precio</h2>
          <hr className="divisor" />

          <div className="fila">
            <Campo etiqueta="Lote" htmlFor="m-lote" pista="De el sale el flete que le toca a esta pieza.">
              <select id="m-lote" value={form.lote_id} onChange={(e) => cambiar('lote_id', e.target.value)}>
                <option value="">Sin lote</option>
                {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo}{l.flete_por_unidad_usd === null ? '' : ` · flete ${formatearBinance(l.flete_por_unidad_usd, 4)} por pieza`}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Costo unitario $" htmlFor="m-costo">
              <input id="m-costo" type="number" step="0.0001" min="0" value={form.costo_unitario_usd} onChange={(e) => cambiar('costo_unitario_usd', e.target.value)} />
            </Campo>
          </div>

          <div className="fila">
            <Campo etiqueta="Grupo de precio" htmlFor="m-grupo">
              <select id="m-grupo" value={form.grupo_precio_id} onChange={(e) => cambiar('grupo_precio_id', e.target.value)}>
                <option value="">Sin grupo</option>
                {grupos.filter((g) => g.activo).map((g) => (
                  <option key={g.id} value={g.id}>{g.nombre} · {formatearBcv(g.precio_usd)}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Precio propio $" htmlFor="m-override" pista="Solo si esta pieza no sigue el precio de su grupo.">
              <input id="m-override" type="number" step="0.01" min="0" value={form.precio_override_usd} onChange={(e) => cambiar('precio_override_usd', e.target.value)} />
            </Campo>
          </div>

          <div className="panel">
            <span className="panel__titulo">Como sale el precio</span>

            <Ayuda titulo="Los dos dolares, en una frase">
              <p>
                <strong>Dolar Binance</strong> es con el que COMPRAS afuera. Hoy esta
                más caro que el del BCV, y esa diferencia se llama la brecha.
              </p>
              <p>
                <strong>Dolar BCV</strong> es con el que VENDES aquí: es el de la
                etiqueta y el que la clienta convierte a bolivares.
              </p>
              <p>
                Por eso la mercancía se multiplica por la brecha antes de ponerle
                precio: hace falta más dolares BCV para juntar los Binance con los
                que vas a reponer esa misma pieza. El alquiler y el sueldo NO se
                multiplican, porque esos ya los pagas aquí.
              </p>
            </Ayuda>

            <div className="fila">
              <Campo
                etiqueta="Margen objetivo %"
                htmlFor="m-margen"
                pista={sugerencia ? `Por defecto ${sugerencia.margen_objetivo_pct} %, de la configuracion.` : undefined}
              >
                <input
                  id="m-margen" type="number" min="1" max="99" step="1"
                  placeholder={sugerencia ? String(sugerencia.margen_objetivo_pct) : ''}
                  value={margenObjetivo}
                  onChange={(e) => setMargenObjetivo(e.target.value)}
                />
              </Campo>
            </div>

            <ol className="cadena">
              <li>
                <span className="dato__etiqueta">1 · La pieza te costo</span>
                <div className="dato__valor">{formatearBinance(sugerencia?.costo_puesto_usd ?? null, 4)}</div>
                <div className="campo__pista">
                  {formatearBinance(sugerencia?.flete_unitario_usd ?? null, 4)} de eso es flete
                </div>
              </li>
              <li>
                <span className="dato__etiqueta">2 · Llevada a dolares BCV</span>
                <div className="dato__valor">{formatearBcv(sugerencia?.costo_mercancia_bcv ?? null, 4)}</div>
                <div className="campo__pista">
                  x {sugerencia?.factor_brecha ?? '—'} de brecha: lo que hace falta aqui para
                  volver a comprarla alla
                </div>
              </li>
              <li>
                <span className="dato__etiqueta">3 · Más lo que carga de tienda</span>
                <div className="dato__valor">{formatearBcv(sugerencia?.costo_operativo_usd ?? null, 4)}</div>
                <div className="campo__pista">alquiler, sueldo y empaque · se pagan aqui, no se convierten</div>
              </li>
              <li>
                <span className="dato__etiqueta">4 · Te sale en</span>
                <div className="dato__valor">{formatearBcv(sugerencia?.costo_total_usd ?? null, 4)}</div>
                <div className="campo__pista">este es el costo de verdad</div>
              </li>
              <li className="cadena__final">
                <span className="dato__etiqueta">5 · Precio sugerido</span>
                <div className="dato__valor dato__valor--grande">{formatearBcv(sugerencia?.precio_sugerido_bcv ?? null)}</div>
                <div className="campo__pista">
                  el costo entre (100 − {sugerencia?.margen_objetivo_pct ?? '—'} %)
                </div>
              </li>
            </ol>

            {sugerencia?.grupo_id ? (
              <Aviso tono={sugerencia.grupo_alcanza ? 'exito' : 'alerta'}>
                {sugerencia.grupo_alcanza ? (
                  <>
                    Le toca el grupo <strong style={{ display: 'inline' }}>{sugerencia.grupo_nombre}</strong>
                    {' '}({formatearBcv(sugerencia.grupo_precio_bcv)}), que deja
                    {' '}{formatearPorcentaje(sugerencia.margen_resultante_pct)} de margen
                    {' '}ya contando la tienda. Se elige el grupo más barato que llegue
                    {' '}al {formatearPorcentaje(sugerencia.margen_piso_pct)} de piso, para no
                    {' '}inflar el precio por unos centavos.
                    {String(sugerencia.grupo_id) !== form.grupo_precio_id ? (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="boton boton--secundario boton--pequeno"
                          onClick={() => cambiar('grupo_precio_id', String(sugerencia.grupo_id))}
                        >
                          Usar {sugerencia.grupo_nombre}
                        </button>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    Ningun grupo llega a {formatearBcv(sugerencia.precio_sugerido_bcv)}. El más caro es
                    {' '}{sugerencia.grupo_nombre} ({formatearBcv(sugerencia.grupo_precio_bcv)}), que dejaria
                    {' '}{formatearPorcentaje(sugerencia.margen_resultante_pct)}. Crea un grupo mas alto o pon precio propio.
                  </>
                )}
              </Aviso>
            ) : sugerencia ? (
              <Aviso tono="alerta">
                No hay grupos de precio cargados. Crea al menos uno para poder asignar precios.
              </Aviso>
            ) : null}
          </div>

          <div className="panel">
            <span className="panel__titulo">Lo que queda con el precio elegido</span>
            <div className="rejilla rejilla--3">
              <div>
                <span className="dato__etiqueta">Etiqueta</span>
                <div className="dato__valor">{formatearBcv(precioBcv)}</div>
              </div>
              <div>
                <span className="dato__etiqueta">Paga la clienta</span>
                <div className="dato__valor">{formatearBs(precioEnBs(precioBcv, tasa))}</div>
                <div className="campo__pista">
                  a la tasa BCV de hoy
                  {tasa ? `, o ${formatearBinance(binanceDesdeBs(precioEnBs(precioBcv, tasa), tasa.tasa_venta))} si paga en dólares` : ''}
                </div>
              </div>
              <div>
                <span className="dato__etiqueta">Menos el costo</span>
                <div className="dato__valor">{formatearBcv(costoTotalBcv)}</div>
                <div className="campo__pista">el del paso 4</div>
              </div>
              <div>
                {/* Antes esta casilla decia "Te queda" y mostraba el PRECIO en
                    dolares reales, no la ganancia. Se leia como si cada pieza
                    dejara siete dolares limpios. */}
                <span className="dato__etiqueta">Ganancia</span>
                <div className={ganancia !== null && ganancia < 0 ? 'dato__valor dato__valor--grande negativo' : 'dato__valor dato__valor--grande positivo'}>
                  {formatearBcv(ganancia)}
                </div>
                <div className="campo__pista">{formatearPorcentaje(margenPct)} del precio</div>
              </div>
              <div>
                <span className="dato__etiqueta">Eso, en Binance</span>
                <div className="dato__valor">{formatearBinance(gananciaReal)}</div>
                <div className="campo__pista">lo que puedes cambiar y reinvertir</div>
              </div>
            </div>

            {sugerencia?.precio_minimo_bcv ? (
              <p className="campo__pista" style={{ marginTop: 'var(--e-4)' }}>
                <strong style={{ display: 'inline' }}>Para negociar:</strong> la vendedora
                puede bajar hasta {formatearBcv(sugerencia.precio_minimo_bcv)}
                {' '}({formatearBs(precioEnBs(sugerencia.precio_minimo_bcv, tasa))}) sin pedirte
                permiso, y ahi la pieza todavia deja
                {' '}{formatearPorcentaje(sugerencia.margen_en_el_piso_pct)}. Por debajo de eso
                el mostrador no la deja cobrar.
              </p>
            ) : null}
          </div>
        </div>

        <div className="tarjeta">
          <h2>Existencia por ubicación</h2>
          <hr className="divisor" />
          <p className="campo__pista">No hay un total guardado: la existencia siempre es por ubicación y se suma.</p>

          <div className="fila">
            {ubicaciones.map((u) => (
              <Campo key={u.id} etiqueta={u.nombre} htmlFor={`u-${u.id}`}>
                <input
                  id={`u-${u.id}`} type="number" min="0" step="1"
                  value={cantidades[u.id] ?? ''}
                  placeholder="0"
                  onChange={(e) => setCantidades((c) => ({ ...c, [u.id]: e.target.value }))}
                />
              </Campo>
            ))}
          </div>
        </div>

        {/* LAS VARIANTES: una fila por medida, talla o color. La primera es
            esta misma pieza; su cantidad es la de la tarjeta de arriba. */}
        <div className="tarjeta">
          <h2>Variantes</h2>
          <hr className="divisor" />
          <p className="campo__pista">
            Si esta pieza viene en otras medidas, tallas o colores, van aquí: una fila por cada
            una, y se venden como un solo producto. Deja el costo vacío si cuesta lo mismo; si
            no, escríbelo y el precio sale solo, con la misma cuenta de arriba.
          </p>

          {filas.length > 0 ? (
            <>
              <div className="variantes__ubicacion">
                <Campo etiqueta="Las cantidades de la tabla son de" htmlFor="v-ubicacion">
                  <select
                    id="v-ubicacion"
                    value={ubicVar ?? ''}
                    onChange={(e) => setUbicVar(Number(e.target.value))}
                  >
                    {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </Campo>
              </div>

              <div className="variantes" role="table" aria-label="Variantes del producto">
                <div className="variantes__cabeza" role="row">
                  <span role="columnheader">Variante</span>
                  <span role="columnheader">Cantidad</span>
                  <span role="columnheader">Costo · $ Binance</span>
                  <span role="columnheader">Sale en</span>
                  <span role="columnheader"><span className="visualmente-oculto">Quitar</span></span>
                </div>

                {/* Esta misma pieza: su nombre de variante y su cantidad. El
                    costo y el precio son los de arriba. */}
                <div className="variante-fila variante-fila--esta" role="row">
                  <div role="cell">
                    <label className="variante-fila__etiqueta" htmlFor="m-variante">Variante</label>
                    <input
                      id="m-variante"
                      ref={campoVariante}
                      value={form.variante}
                      placeholder="45 cm"
                      maxLength={40}
                      aria-invalid={Boolean(errorVariante) && !form.variante.trim() ? true : undefined}
                      onChange={(e) => { cambiar('variante', e.target.value); setErrorVariante(null); }}
                    />
                    <span className="variante-fila__nota">esta pieza</span>
                  </div>
                  <div role="cell">
                    <label className="variante-fila__etiqueta" htmlFor="v-cantidad-esta">Cantidad</label>
                    <input
                      id="v-cantidad-esta"
                      type="number" min="0" step="1" placeholder="0"
                      value={ubicVar === null ? '' : cantidades[ubicVar] ?? ''}
                      onChange={(e) => { if (ubicVar !== null) setCantidades((c) => ({ ...c, [ubicVar]: e.target.value })); }}
                    />
                    {suma(cantidades, ubicVar) > 0 ? (
                      <span className="variante-fila__nota">y {suma(cantidades, ubicVar)} en otras ubicaciones</span>
                    ) : null}
                  </div>
                  <div role="cell">
                    <span className="variante-fila__etiqueta">Costo · $ Binance</span>
                    <span className="variante-fila__fijo">{formatearMonto(Number(form.costo_unitario_usd || 0), 4)}</span>
                    <span className="variante-fila__nota">el de arriba</span>
                  </div>
                  <div role="cell">
                    <span className="variante-fila__etiqueta">Sale en</span>
                    <span className="variante-fila__precio">{formatearBcv(precioBcv)}</span>
                    <span className="variante-fila__nota">{formatearBs(precioEnBs(precioBcv, tasa))}</span>
                  </div>
                  <div role="cell" />
                </div>

                {filas.map((f) => {
                  const p = precioDeFila(f);
                  const otras = suma(f.cantidades, ubicVar);
                  const nombre = f.variante.trim() || 'esta variante';
                  return (
                    <div key={f.clave} className={f.quitar ? 'variante-fila variante-fila--quitada' : 'variante-fila'} role="row">
                      <div role="cell">
                        <label className="variante-fila__etiqueta" htmlFor={`v-nombre-${f.clave}`}>Variante</label>
                        <input
                          id={`v-nombre-${f.clave}`}
                          value={f.variante}
                          placeholder="60 cm"
                          maxLength={40}
                          disabled={f.quitar}
                          autoFocus={f.id === null && f.variante === '' && Boolean(form.variante.trim())}
                          onChange={(e) => cambiarFila(f.clave, { variante: e.target.value })}
                        />
                        <span className="variante-fila__nota">
                          {f.id !== null
                            ? <>{f.sku} · <Link to={`/admin/modelos/${f.id}`}>abrir</Link></>
                            : 'nueva'}
                        </span>
                      </div>
                      <div role="cell">
                        <label className="variante-fila__etiqueta" htmlFor={`v-cantidad-${f.clave}`}>Cantidad</label>
                        <input
                          id={`v-cantidad-${f.clave}`}
                          type="number" min="0" step="1" placeholder="0"
                          disabled={f.quitar || ubicVar === null}
                          value={ubicVar === null ? '' : f.cantidades[ubicVar] ?? ''}
                          onChange={(e) => {
                            if (ubicVar === null) return;
                            cambiarFila(f.clave, { cantidades: { ...f.cantidades, [ubicVar]: e.target.value } });
                          }}
                        />
                        {otras > 0 ? <span className="variante-fila__nota">y {otras} en otras ubicaciones</span> : null}
                      </div>
                      <div role="cell">
                        <label className="variante-fila__etiqueta" htmlFor={`v-costo-${f.clave}`}>Costo · $ Binance</label>
                        <input
                          id={`v-costo-${f.clave}`}
                          type="number" min="0" step="0.0001"
                          placeholder={`igual: ${formatearMonto(Number(form.costo_unitario_usd || 0), 4)}`}
                          disabled={f.quitar}
                          value={f.costo}
                          onChange={(e) => cambiarFila(f.clave, { costo: e.target.value })}
                        />
                      </div>
                      <div role="cell" aria-live="polite">
                        <span className="variante-fila__etiqueta">Sale en</span>
                        <span className="variante-fila__precio">{p.bcv === null ? '—' : formatearBcv(p.bcv)}</span>
                        <span className="variante-fila__nota">
                          {p.bcv === null ? p.detalle : `${formatearBs(precioEnBs(p.bcv, tasa))} · ${p.detalle}`}
                        </span>
                        {!p.alcanza ? (
                          <span className="variante-fila__alerta">
                            Ningún grupo alcanza este costo: ábrela después de guardar y ponle precio propio.
                          </span>
                        ) : null}
                      </div>
                      <div role="cell" className="variante-fila__accion">
                        {f.quitar ? (
                          <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => cambiarFila(f.clave, { quitar: false })}>
                            Deshacer
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="boton boton--secundario boton--pequeno boton--icono"
                            aria-label={`Quitar ${nombre}`}
                            title={`Quitar ${nombre}`}
                            onClick={() => quitarFila(f)}
                          >
                            <Icono nombre="quitar" className="icono icono--sm" />
                          </button>
                        )}
                      </div>
                      {f.quitar ? (
                        <p className="variante-fila__aviso">Se saca del catálogo al guardar. Sus ventas se conservan.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {errorVariante ? <p className="campo__error" role="alert">{errorVariante}</p> : null}

          <div className="acciones acciones--sueltas">
            <button type="button" className="boton boton--secundario" onClick={agregarFila}>
              <Icono nombre="agregar" className="icono icono--sm" />
              Agregar variante
            </button>
          </div>
        </div>

        {errorVariante ? <p className="campo__error">Revisa las variantes: {errorVariante}</p> : null}

        <div className="acciones">
          <button type="submit" className="boton boton--confirmar" disabled={guardando || procesandoFoto}>
            {guardando ? 'Guardando' : esNuevo ? 'Agregar producto' : 'Guardar cambios'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => navegar('/admin/inventario')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
