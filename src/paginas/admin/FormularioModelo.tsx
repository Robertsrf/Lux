import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando } from '../../componentes/Piezas';
import { aDolaresReales, aMonto, deMonto, formatearBs, formatearPorcentaje, formatearUsd, precioEnBs } from '../../lib/dinero';
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
  lote_id: '',
  costo_unitario_usd: '',
  grupo_precio_id: '',
  precio_override_usd: '',
};

/**
 * Carga de modelos. Se inventarian MODELOS con cantidad, no piezas
 * individuales: no existe "la pieza numero 247", existe "cadena cubana
 * dorada" de la que quedan 18.
 *
 * Las variantes menores (grosor, largo) no crean modelos nuevos si cuestan y
 * se venden igual: van en la nota de variantes.
 */
export function FormularioModelo() {
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
        .select('id, sku, nombre, categoria, descripcion, variantes_nota, foto_path, foto_thumb_path, grupo_precio_id, precio_override_usd, lote_id, costo_unitario_usd, flete_unitario_usd')
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
        lote_id: m.lote_id ? String(m.lote_id) : '',
        costo_unitario_usd: String(m.costo_unitario_usd ?? ''),
        grupo_precio_id: m.grupo_precio_id ? String(m.grupo_precio_id) : '',
        precio_override_usd: m.precio_override_usd === null ? '' : String(m.precio_override_usd),
      });
      setFotoActual(urlPublicaFoto(m.foto_thumb_path ?? m.foto_path));
      setAutoAsignado(true);

      const { data: ex } = await supabase.from('existencias').select('ubicacion_id, cantidad').eq('modelo_id', Number(id));
      const mapa: Record<number, string> = {};
      for (const fila of (ex as { ubicacion_id: number; cantidad: number }[] | null) ?? []) {
        mapa[fila.ubicacion_id] = String(fila.cantidad);
      }
      setCantidades(mapa);
      setCargando(false);
    })();
  }, [id, esNuevo]);

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

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    try {
      let rutas: { foto_path: string; foto_thumb_path: string } | null = null;
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
          <p>Cada producto se inventaria con su cantidad, no pieza por pieza.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}

      <form onSubmit={(e) => void guardar(e)} className="pila">
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
            pista="Se comprime aqui mismo antes de subir: 1800 px en WebP, mas una miniatura de 600 px."
          >
            <input id="m-foto" type="file" accept="image/*" onChange={(e) => void elegirFoto(e.target.files?.[0])} />
          </Campo>

          {procesandoFoto ? <p className="campo__pista">Comprimiendo</p> : null}

          {foto ? (
            <Aviso tono={foto.pesoGrande <= OBJETIVO_GRANDE ? 'exito' : 'alerta'} titulo="Foto lista">
              Original {formatearPeso(foto.pesoOriginal)} · catalogo {formatearPeso(foto.pesoGrande)} ·
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
            <Campo etiqueta="Categoria" htmlFor="m-categoria">
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
              etiqueta="Nombre de la categoria nueva"
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

          <Campo etiqueta="Nota de variantes" htmlFor="m-variantes" pista="Grosores y largos que hay del mismo modelo, para no ir a mirar la vitrina.">
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
                {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo}{l.flete_por_unidad_usd === null ? '' : ` · flete ${formatearUsd(l.flete_por_unidad_usd, 4)} por pieza`}</option>)}
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
                  <option key={g.id} value={g.id}>{g.nombre} · {formatearUsd(g.precio_usd)}</option>
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
                mas caro que el del BCV, y esa diferencia se llama la brecha.
              </p>
              <p>
                <strong>Dolar BCV</strong> es con el que VENDES aqui: es el de la
                etiqueta y el que la clienta convierte a bolivares.
              </p>
              <p>
                Por eso la mercancia se multiplica por la brecha antes de ponerle
                precio: hace falta mas dolares BCV para juntar los Binance con los
                que vas a reponer esa misma pieza. El alquiler y el sueldo NO se
                multiplican, porque esos ya los pagas aqui.
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
                <div className="dato__valor">{formatearUsd(sugerencia?.costo_puesto_usd ?? null, 4)}</div>
                <div className="campo__pista">
                  dolares Binance · {formatearUsd(sugerencia?.flete_unitario_usd ?? null, 4)} de eso es flete
                </div>
              </li>
              <li>
                <span className="dato__etiqueta">2 · En dolares BCV</span>
                <div className="dato__valor">{formatearUsd(sugerencia?.costo_mercancia_bcv ?? null, 4)}</div>
                <div className="campo__pista">
                  x {sugerencia?.factor_brecha ?? '—'} de brecha: lo que hace falta aqui para
                  volver a comprarla alla
                </div>
              </li>
              <li>
                <span className="dato__etiqueta">3 · Mas lo que carga de tienda</span>
                <div className="dato__valor">{formatearUsd(sugerencia?.costo_operativo_usd ?? null, 4)}</div>
                <div className="campo__pista">alquiler, sueldo y empaque · ya en BCV, no se convierte</div>
              </li>
              <li>
                <span className="dato__etiqueta">4 · Te sale en</span>
                <div className="dato__valor">{formatearUsd(sugerencia?.costo_total_usd ?? null, 4)}</div>
                <div className="campo__pista">dolares BCV · este es el costo de verdad</div>
              </li>
              <li className="cadena__final">
                <span className="dato__etiqueta">5 · Precio sugerido</span>
                <div className="dato__valor dato__valor--grande">{formatearUsd(sugerencia?.precio_sugerido_bcv ?? null)}</div>
                <div className="campo__pista">
                  dolares BCV · el costo entre (100 − {sugerencia?.margen_objetivo_pct ?? '—'} %)
                </div>
              </li>
            </ol>

            {sugerencia?.grupo_id ? (
              <Aviso tono={sugerencia.grupo_alcanza ? 'exito' : 'alerta'}>
                {sugerencia.grupo_alcanza ? (
                  <>
                    Le toca el grupo <strong style={{ display: 'inline' }}>{sugerencia.grupo_nombre}</strong>
                    {' '}({formatearUsd(sugerencia.grupo_precio_bcv)} BCV), que deja
                    {' '}{formatearPorcentaje(sugerencia.margen_resultante_pct)} de margen
                    {' '}ya contando la tienda. Se elige el grupo mas barato que llegue
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
                    Ningun grupo llega a {formatearUsd(sugerencia.precio_sugerido_bcv)}. El mas caro es
                    {' '}{sugerencia.grupo_nombre} ({formatearUsd(sugerencia.grupo_precio_bcv)}), que dejaria
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
                <div className="dato__valor">{formatearUsd(precioBcv)}</div>
                <div className="campo__pista">dolares BCV</div>
              </div>
              <div>
                <span className="dato__etiqueta">Paga la clienta</span>
                <div className="dato__valor">{formatearBs(precioEnBs(precioBcv, tasa))}</div>
                <div className="campo__pista">a la tasa BCV de hoy</div>
              </div>
              <div>
                <span className="dato__etiqueta">Menos el costo</span>
                <div className="dato__valor">{formatearUsd(costoTotalBcv)}</div>
                <div className="campo__pista">el del paso 4</div>
              </div>
              <div>
                {/* Antes esta casilla decia "Te queda" y mostraba el PRECIO en
                    dolares reales, no la ganancia. Se leia como si cada pieza
                    dejara siete dolares limpios. */}
                <span className="dato__etiqueta">Ganancia</span>
                <div className={ganancia !== null && ganancia < 0 ? 'dato__valor dato__valor--grande negativo' : 'dato__valor dato__valor--grande positivo'}>
                  {formatearUsd(ganancia)}
                </div>
                <div className="campo__pista">dolares BCV · {formatearPorcentaje(margenPct)} del precio</div>
              </div>
              <div>
                <span className="dato__etiqueta">Eso, en Binance</span>
                <div className="dato__valor">{formatearUsd(gananciaReal)}</div>
                <div className="campo__pista">lo que puedes cambiar y reinvertir</div>
              </div>
            </div>

            {sugerencia?.precio_minimo_bcv ? (
              <p className="campo__pista" style={{ marginTop: 'var(--e-4)' }}>
                <strong style={{ display: 'inline' }}>Para negociar:</strong> la vendedora
                puede bajar hasta {formatearUsd(sugerencia.precio_minimo_bcv)} BCV
                {' '}({formatearBs(precioEnBs(sugerencia.precio_minimo_bcv, tasa))}) sin pedirte
                permiso, y ahi la pieza todavia deja
                {' '}{formatearPorcentaje(sugerencia.margen_en_el_piso_pct)}. Por debajo de eso
                el mostrador no la deja cobrar.
              </p>
            ) : null}
          </div>
        </div>

        <div className="tarjeta">
          <h2>Existencia por ubicacion</h2>
          <hr className="divisor" />
          <p className="campo__pista">No hay un total guardado: la existencia siempre es por ubicacion y se suma.</p>

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
