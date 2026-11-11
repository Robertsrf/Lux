import { useCallback, useEffect, useState } from 'react';
import { Aviso, Campo, Cargando, Vacio } from '../../../componentes/Piezas';
import { supabase, mensajeDeError } from '../../../lib/supabase';
import type { TipoSeccion } from '../../../hooks/useLanding';
import { FormularioSeccion } from './FormularioSeccion';
import type { FilaSeccion } from './FormularioSeccion';
import { TIPOS_LANDING, TIPOS_UNICOS, TODOS_LOS_TIPOS } from './tiposLanding';

/**
 * Las secciones de la landing, en su orden: cuáles salen, cuál va primero y
 * lo que dice cada una. Lee `v_landing_admin` (también las escondidas).
 */
export function SeccionesLanding() {
  const [filas, setFilas] = useState<FilaSeccion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [borrando, setBorrando] = useState<number | null>(null);
  const [nuevoTipo, setNuevoTipo] = useState<TipoSeccion | ''>('');

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('v_landing_admin')
      .select('id, tipo, orden, visible, titulo, texto, datos, se_repite')
      .order('orden', { ascending: true })
      .order('id', { ascending: true });
    if (err) { setError(mensajeDeError(err)); setFilas([]); return; }
    setFilas(((data as FilaSeccion[] | null) ?? []).map((f) => ({
      ...f, datos: f.datos && typeof f.datos === 'object' ? f.datos : {},
    })));
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(hacer: () => PromiseLike<{ error: unknown }>, mensaje?: string) {
    setTrabajando(true);
    setError(null);
    setExito(null);
    const { error: err } = await hacer();
    if (err) setError(mensajeDeError(err));
    else { if (mensaje) setExito(mensaje); await cargar(); }
    setTrabajando(false);
  }

  const alternar = (f: FilaSeccion) => accion(() => supabase.rpc('admin_guardar_seccion', {
    p_id: f.id, p_tipo: f.tipo, p_titulo: f.titulo, p_texto: f.texto, p_datos: f.datos, p_visible: !f.visible,
  }));

  const mover = (i: number, delta: -1 | 1) => {
    if (!filas) return Promise.resolve();
    const ids = filas.map((f) => f.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return Promise.resolve();
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    return accion(() => supabase.rpc('admin_ordenar_secciones', { p_ids: ids }));
  };

  const borrar = (f: FilaSeccion) => {
    setBorrando(null);
    return accion(() => supabase.rpc('admin_borrar_seccion', { p_id: f.id }), 'Sección borrada.');
  };

  if (filas === null) return <Cargando texto="Cargando las secciones" />;

  // Las que se repiten se agregan siempre; las de la base, solo si faltan.
  const disponibles = TODOS_LOS_TIPOS.filter(
    (t) => !TIPOS_UNICOS.includes(t) || !filas.some((f) => f.tipo === t),
  );

  async function agregar() {
    if (!nuevoTipo) return;
    setTrabajando(true);
    setError(null);
    setExito(null);
    const { data, error: err } = await supabase.rpc('admin_guardar_seccion', {
      p_id: null, p_tipo: nuevoTipo, p_titulo: TIPOS_LANDING[nuevoTipo].titulo, p_texto: null, p_datos: {}, p_visible: true,
    });
    if (err) setError(mensajeDeError(err));
    else {
      setNuevoTipo('');
      await cargar();
      setEditando(typeof data === 'number' ? data : null);
    }
    setTrabajando(false);
  }

  const abierta = filas.find((f) => f.id === editando) ?? null;

  return (
    <div className="pila">
      {error ? <Aviso tono="error" titulo="No se pudo">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      {abierta ? (
        <FormularioSeccion
          key={abierta.id}
          fila={abierta}
          alCerrar={() => setEditando(null)}
          alGuardar={() => { setEditando(null); setExito('Sección guardada. Ya se ve en la landing.'); void cargar(); }}
        />
      ) : null}

      <div className="tarjeta">
        <h2>Las secciones, en su orden</h2>
        <p className="campo__pista">
          Lo que está encendido sale en la landing, de arriba abajo. Las secciones que dibuja la tienda
          (tipos, estantes, ofertas) toman sus piezas solas: aquí solo cambias su título, su texto y si salen.
        </p>
        {filas.length === 0 ? (
          <Vacio titulo="No hay secciones">Agrega una abajo.</Vacio>
        ) : (
          <ul className="pl-secciones">
            {filas.map((f, i) => (
              <li key={f.id} className={f.visible ? 'pl-seccion' : 'pl-seccion pl-seccion--oculta'}>
                <div className="pl-seccion__datos">
                  <strong>{TIPOS_LANDING[f.tipo]?.nombre ?? f.tipo}</strong>
                  {f.titulo ? <span className="pl-seccion__titulo">{f.titulo}</span> : null}
                  {!f.visible ? <span className="etiqueta">Escondida</span> : null}
                </div>
                <label className="casilla pl-seccion__sale">
                  <input type="checkbox" checked={f.visible} disabled={trabajando} onChange={() => void alternar(f)} />
                  <span>Sale</span>
                </label>
                <div className="grupo-botones pl-seccion__acciones">
                  <button type="button" className="boton boton--secundario boton--pequeno" disabled={trabajando || i === 0} onClick={() => void mover(i, -1)}>Subir</button>
                  <button type="button" className="boton boton--secundario boton--pequeno" disabled={trabajando || i === filas.length - 1} onClick={() => void mover(i, 1)}>Bajar</button>
                  <button type="button" className="boton boton--pequeno" disabled={trabajando} onClick={() => setEditando(f.id)}>Editar</button>
                  {f.se_repite ? (
                    borrando === f.id ? (
                      <>
                        <button type="button" className="boton boton--peligro boton--pequeno" disabled={trabajando} onClick={() => void borrar(f)}>Sí, borrar</button>
                        <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setBorrando(null)}>No</button>
                      </>
                    ) : (
                      <button type="button" className="boton boton--peligro boton--pequeno" disabled={trabajando} onClick={() => setBorrando(f.id)}>Borrar</button>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="campo__pista">
          Las secciones que salen de la base no se borran: si no las quieres, apaga «Sale».
        </p>
      </div>

      <div className="tarjeta">
        <h2>Agregar una sección</h2>
        <Campo etiqueta="Tipo" htmlFor="landing-nuevo" pista="Las de la base solo se pueden agregar si no están; las demás se repiten, como otra galería o otro «Quiénes somos».">
          <select id="landing-nuevo" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as TipoSeccion | '')}>
            <option value="">Elige un tipo…</option>
            {disponibles.map((t) => <option key={t} value={t}>{TIPOS_LANDING[t].nombre}</option>)}
          </select>
        </Campo>
        {nuevoTipo ? <p className="campo__pista">{TIPOS_LANDING[nuevoTipo].ayuda}</p> : null}
        <div className="acciones">
          <button type="button" className="boton" disabled={!nuevoTipo || trabajando} onClick={() => void agregar()}>Agregar al final</button>
        </div>
      </div>
    </div>
  );
}
