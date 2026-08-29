import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando } from '../../componentes/Piezas';
import { aMonto, deMonto, formatearBs, formatearUsd, precioEnBs } from '../../lib/dinero';
import { formatearPeso, procesarFoto, subirFoto, urlPublicaFoto } from '../../lib/fotos';
import type { FotoProcesada } from '../../lib/fotos';
import { useGrupos, useUbicaciones } from '../../hooks/useCatalogos';
import { useTasa } from '../../hooks/useTasa';
import type { LoteAdmin, ModeloAdmin } from '../../lib/tipos';

const CATEGORIAS = ['anillo', 'pulsera', 'cadena', 'choker', 'arete', 'tobillera', 'set'];

const VACIO = {
  nombre: '',
  categoria: 'anillo',
  sku: '',
  descripcion: '',
  variantes_nota: '',
  lote_id: '',
  costo_unitario_usd: '',
  peso_unitario_g: '',
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
  const { ubicaciones } = useUbicaciones();
  const { tasa } = useTasa();

  const [form, setForm] = useState(VACIO);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [lotes, setLotes] = useState<Pick<LoteAdmin, 'id' | 'codigo' | 'metodo'>[]>([]);
  const [foto, setFoto] = useState<FotoProcesada | null>(null);
  const [fotoActual, setFotoActual] = useState<string | null>(null);
  const [fleteUnitario, setFleteUnitario] = useState<number | null>(null);
  const [cargando, setCargando] = useState(!esNuevo);
  const [guardando, setGuardando] = useState(false);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cambiar<K extends keyof typeof VACIO>(campo: K, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('v_lotes_admin').select('id, codigo, metodo').order('fecha_llegada', { ascending: false });
      setLotes((data as Pick<LoteAdmin, 'id' | 'codigo' | 'metodo'>[] | null) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (esNuevo) return;
    void (async () => {
      setCargando(true);
      const { data, error: err } = await supabase
        .from('v_catalogo_admin')
        .select('id, sku, nombre, categoria, descripcion, variantes_nota, foto_path, foto_thumb_path, grupo_precio_id, precio_override_usd, lote_id, costo_unitario_usd, peso_unitario_g, flete_unitario_usd')
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
        peso_unitario_g: String(m.peso_unitario_g ?? ''),
        grupo_precio_id: m.grupo_precio_id ? String(m.grupo_precio_id) : '',
        precio_override_usd: m.precio_override_usd === null ? '' : String(m.precio_override_usd),
      });
      setFotoActual(urlPublicaFoto(m.foto_thumb_path ?? m.foto_path));
      setFleteUnitario(Number(m.flete_unitario_usd ?? 0));

      const { data: ex } = await supabase.from('existencias').select('ubicacion_id, cantidad').eq('modelo_id', Number(id));
      const mapa: Record<number, string> = {};
      for (const fila of (ex as { ubicacion_id: number; cantidad: number }[] | null) ?? []) {
        mapa[fila.ubicacion_id] = String(fila.cantidad);
      }
      setCantidades(mapa);
      setCargando(false);
    })();
  }, [id, esNuevo]);

  // El flete unitario lo calcula la base con el metodo de prorrateo del lote.
  // El navegador no repite esa formula: la pregunta.
  const previsualizarFlete = useCallback(async () => {
    if (!form.lote_id) { setFleteUnitario(0); return; }
    const { data, error: err } = await supabase.rpc('admin_previsualizar_flete', {
      p_lote_id: Number(form.lote_id),
      p_peso_g: Number(form.peso_unitario_g || 0),
      p_costo_usd: Number(form.costo_unitario_usd || 0),
    });
    if (!err) setFleteUnitario(Number(data ?? 0));
  }, [form.lote_id, form.peso_unitario_g, form.costo_unitario_usd]);

  useEffect(() => {
    const t = setTimeout(() => void previsualizarFlete(), 400);
    return () => clearTimeout(t);
  }, [previsualizarFlete]);

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
        p_peso_unitario_g: Number(form.peso_unitario_g || 0),
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
  const precioUsd = form.precio_override_usd ? Number(form.precio_override_usd) : grupoElegido?.precio_usd ?? null;
  const costoPuesto = deMonto(aMonto(form.costo_unitario_usd) + aMonto(fleteUnitario));
  const margen = precioUsd === null ? null : deMonto(aMonto(precioUsd) - aMonto(costoPuesto));

  if (cargando) return <Cargando texto="Cargando modelo" />;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>{esNuevo ? 'Cargar modelo' : `Editar ${form.sku}`}</h1>
          <p>Se inventarian modelos con cantidad, no piezas sueltas.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}

      <form onSubmit={(e) => void guardar(e)}>
        <div className="tarjeta">
          <h2>Foto</h2>
          <hr className="divisor" />

          {fotoActual && !foto ? (
            <img src={fotoActual} alt="" className="miniatura" style={{ width: 96, height: 96, marginBottom: 'var(--e-3)' }} />
          ) : null}

          <Campo
            etiqueta="Archivo"
            htmlFor="m-foto"
            pista="Se comprime aqui mismo antes de subir: 1200 px en WebP, mas un thumb de 300 px."
          >
            <input id="m-foto" type="file" accept="image/*" onChange={(e) => void elegirFoto(e.target.files?.[0])} />
          </Campo>

          {procesandoFoto ? <p className="campo__pista">Comprimiendo</p> : null}

          {foto ? (
            <Aviso tono={foto.pesoGrande <= 200 * 1024 ? 'exito' : 'alerta'} titulo="Foto lista">
              Original {formatearPeso(foto.pesoOriginal)} · catalogo {formatearPeso(foto.pesoGrande)} ·
              miniatura {formatearPeso(foto.pesoThumb)}
            </Aviso>
          ) : null}
        </div>

        <div className="tarjeta" style={{ marginTop: 'var(--e-4)' }}>
          <h2>Identidad</h2>
          <hr className="divisor" />

          <Campo etiqueta="Nombre" htmlFor="m-nombre" pista="Como lo reconoce la vendedora: cadena cubana dorada.">
            <input id="m-nombre" required value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
          </Campo>

          <div className="fila">
            <Campo etiqueta="Categoria" htmlFor="m-categoria">
              <input id="m-categoria" list="categorias" required value={form.categoria} onChange={(e) => cambiar('categoria', e.target.value)} />
              <datalist id="categorias">
                {CATEGORIAS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Campo>
            <Campo etiqueta="SKU" htmlFor="m-sku" pista={esNuevo ? 'Si lo dejas vacio se genera: CAD-G13-007.' : undefined}>
              <input id="m-sku" value={form.sku} onChange={(e) => cambiar('sku', e.target.value)} />
            </Campo>
          </div>

          <Campo etiqueta="Nota de variantes" htmlFor="m-variantes" pista="Grosores y largos que hay del mismo modelo, para no ir a mirar la vitrina.">
            <textarea id="m-variantes" value={form.variantes_nota} onChange={(e) => cambiar('variantes_nota', e.target.value)} />
          </Campo>

          <Campo etiqueta="Descripcion" htmlFor="m-desc">
            <textarea id="m-desc" value={form.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} />
          </Campo>
        </div>

        <div className="tarjeta" style={{ marginTop: 'var(--e-4)' }}>
          <h2>Costo y precio</h2>
          <hr className="divisor" />

          <div className="fila">
            <Campo etiqueta="Lote" htmlFor="m-lote" pista="De el sale el flete que le toca a esta pieza.">
              <select id="m-lote" value={form.lote_id} onChange={(e) => cambiar('lote_id', e.target.value)}>
                <option value="">Sin lote</option>
                {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo} ({l.metodo})</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Costo unitario $" htmlFor="m-costo">
              <input id="m-costo" type="number" step="0.0001" min="0" value={form.costo_unitario_usd} onChange={(e) => cambiar('costo_unitario_usd', e.target.value)} />
            </Campo>
            <Campo etiqueta="Peso unitario (g)" htmlFor="m-peso">
              <input id="m-peso" type="number" step="0.01" min="0" value={form.peso_unitario_g} onChange={(e) => cambiar('peso_unitario_g', e.target.value)} />
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

          <div className="tarjeta" style={{ background: 'var(--crema)' }}>
            <div className="rejilla rejilla--3">
              <div>
                <span className="util secundario">Flete unitario</span>
                <div className="cifra">{formatearUsd(fleteUnitario, 4)}</div>
              </div>
              <div>
                <span className="util secundario">Costo puesto</span>
                <div className="precio" style={{ fontSize: 'var(--t-20)' }}>{formatearUsd(costoPuesto, 4)}</div>
              </div>
              <div>
                <span className="util secundario">Precio</span>
                <div className="precio" style={{ fontSize: 'var(--t-20)' }}>{formatearUsd(precioUsd)}</div>
                <div className="cifra secundario">{formatearBs(precioEnBs(precioUsd, tasa?.tasa_venta ?? null))}</div>
              </div>
              <div>
                <span className="util secundario">Margen</span>
                <div className={margen !== null && margen < 0 ? 'precio negativo' : 'precio'} style={{ fontSize: 'var(--t-20)' }}>
                  {formatearUsd(margen)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="tarjeta" style={{ marginTop: 'var(--e-4)' }}>
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
            {guardando ? 'Guardando' : esNuevo ? 'Cargar modelo' : 'Guardar cambios'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => navegar('/admin/inventario')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
