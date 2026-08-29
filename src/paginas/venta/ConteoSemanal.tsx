import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, Vacio } from '../../componentes/Piezas';
import { urlPublicaFoto } from '../../lib/fotos';
import { useUbicaciones } from '../../hooks/useCatalogos';
import type { ModeloEnUbicacion } from '../../lib/tipos';

/**
 * Conteo semanal detallado: pieza por pieza, modelo por modelo.
 * Lo que se cuenta pasa a ser la verdad — la funcion ajusta la existencia y
 * deja registrada la diferencia.
 */
export function ConteoSemanal() {
  const { ubicaciones } = useUbicaciones();
  const [ubicacionId, setUbicacionId] = useState<number | null>(null);
  const [modelos, setModelos] = useState<ModeloEnUbicacion[]>([]);
  const [contado, setContado] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    if (ubicacionId === null && ubicaciones.length > 0) setUbicacionId(ubicaciones[0]!.id);
  }, [ubicaciones, ubicacionId]);

  const cargar = useCallback(async () => {
    if (ubicacionId === null) return;
    setCargando(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('v_venta_ubicacion')
      .select('ubicacion_id, modelo_id, sku, nombre, foto_thumb_path, cantidad, precio_usd, precio_bs, categoria, variantes_nota, grupo, foto_path')
      .eq('ubicacion_id', ubicacionId)
      .order('nombre', { ascending: true })
      .limit(500);
    if (err) setError(mensajeDeError(err));
    const filas = (data as unknown as ModeloEnUbicacion[] | null) ?? [];
    setModelos(filas);
    setContado(Object.fromEntries(filas.map((m) => [m.modelo_id, String(m.cantidad)])));
    setCargando(false);
  }, [ubicacionId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar() {
    if (ubicacionId === null) return;
    setGuardando(true);
    setError(null);
    setExito(null);

    const detalle = modelos.map((m) => ({
      modelo_id: m.modelo_id,
      cantidad_contada: Number(contado[m.modelo_id] ?? m.cantidad),
    }));

    const { error: err } = await supabase.rpc('registrar_conteo_semanal', {
      p_ubicacion_id: ubicacionId,
      p_detalle: detalle,
      p_notas: null,
    });

    if (err) setError(mensajeDeError(err));
    else {
      setExito('Conteo guardado. Las existencias quedaron ajustadas a lo que contaste.');
      await cargar();
    }
    setGuardando(false);
  }

  const diferencias = modelos.filter((m) => Number(contado[m.modelo_id] ?? m.cantidad) !== m.cantidad);

  return (
    <div className="pagina mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Conteo semanal</h1>
          <p>Cuenta modelo por modelo. Lo que anotes queda como la existencia real.</p>
        </div>
      </div>

      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}
      {error ? <Aviso tono="error" titulo="No se pudo guardar el conteo">{error}</Aviso> : null}

      <div className="selector-ubicacion" role="group" aria-label="Ubicacion">
        {ubicaciones.map((u) => (
          <button key={u.id} type="button" aria-pressed={u.id === ubicacionId} onClick={() => setUbicacionId(u.id)}>
            {u.nombre}
          </button>
        ))}
      </div>

      {cargando ? <Cargando texto="Cargando modelos" /> : modelos.length === 0 ? (
        <Vacio titulo="No hay modelos registrados en esta ubicacion">
          <p>Elige otra ubicacion o pide que carguen el inventario primero.</p>
        </Vacio>
      ) : (
        <>
          {diferencias.length > 0 ? (
            <Aviso tono="alerta" titulo={`${diferencias.length} modelo(s) con diferencia`}>
              Al guardar, la existencia de esos modelos cambiara a lo que contaste.
            </Aviso>
          ) : null}

          <div className="lineas-cobro">
            {modelos.map((m) => {
              const foto = urlPublicaFoto(m.foto_thumb_path);
              const valor = contado[m.modelo_id] ?? String(m.cantidad);
              const distinto = Number(valor) !== m.cantidad;
              return (
                <div className="linea-cobro" key={m.modelo_id}>
                  {foto ? <img className="linea-cobro__foto" src={foto} alt="" loading="lazy" /> : <span className="linea-cobro__foto" />}
                  <div>
                    <div className="linea-cobro__nombre">{m.nombre}</div>
                    <div className="linea-cobro__precio">
                      {m.sku} · el sistema espera {m.cantidad}
                    </div>
                  </div>
                  <input
                    type="number" min="0" step="1" inputMode="numeric"
                    aria-label={`Piezas contadas de ${m.nombre}`}
                    className="entrada-compacta"
                    style={distinto ? { borderColor: 'var(--alerta)' } : undefined}
                    value={valor}
                    onChange={(e) => setContado((c) => ({ ...c, [m.modelo_id]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>

          <div className="acciones">
            <button type="button" className="boton boton--confirmar" disabled={guardando} onClick={() => void guardar()}>
              {guardando ? 'Guardando' : 'Guardar conteo'}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => void cargar()} disabled={guardando}>
              Descartar cambios
            </button>
          </div>
        </>
      )}
    </div>
  );
}
