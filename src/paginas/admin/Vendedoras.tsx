import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearBcv, formatearEntero, formatearFecha } from '../../lib/dinero';
import { codigoLegible, cuentaVendedora } from '../../lib/vendedoras';
import type { CodigoNuevo } from '../../lib/vendedoras';
import type { VendedoraAdmin } from '../../lib/tipos';

/**
 * Las vendedoras del local: quienes venden en la tienda, cada una con su
 * código para saber quién vendió qué. Hacen lo mismo que la vendedora de
 * siempre, nada más.
 *
 * No son los revendedores. Lo que un revendedor retira y paga en la tienda
 * no cuenta como venta de ninguna de ellas: aquí se ve solo lo que
 * vendieron en el local (`v_vendedoras`).
 *
 * Crear la cuenta, cambiar el PIN y pausar los hace la función de servidor
 * `vendedoras`, que pide la llave maestra de Supabase. Esta pantalla solo
 * la llama con la sesión del administrador.
 */
export function Vendedoras() {
  const [lista, setLista] = useState<VendedoraAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nueva, setNueva] = useState<{ nombre: string; pin: string } | null>(null);
  const [renombrando, setRenombrando] = useState<{ id: string; nombre: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<{ nombre: string; codigo: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from('v_vendedoras').select('*').order('activo', { ascending: false }).order('numero_vendedora');
    setError(err ? mensajeDeError(err) : null);
    setLista((data as unknown as VendedoraAdmin[] | null) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const totales = useMemo(() => ({
    hoy: lista.reduce((n, v) => n + Number(v.piezas_hoy), 0),
    mes: lista.reduce((n, v) => n + Number(v.piezas_mes), 0),
    bcv: lista.reduce((n, v) => n + Number(v.total_mes_bcv), 0),
    activas: lista.filter((v) => v.activo).length,
  }), [lista]);

  /** Corre una acción de la función de servidor, con su aviso y su error. */
  async function hacer<T>(accion: () => Promise<T>, alTerminar: (r: T) => void) {
    setTrabajando(true);
    setError(null);
    setErrorForm(null);
    try {
      alTerminar(await accion());
      void cargar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'Algo falló.';
      if (nueva || renombrando) setErrorForm(mensaje); else setError(mensaje);
    }
    setTrabajando(false);
  }

  function crear() {
    if (!nueva) return;
    const { nombre, pin } = nueva;
    void hacer(
      () => cuentaVendedora<CodigoNuevo>({ accion: 'crear', nombre, pin: pin.trim() || null }),
      (r) => { setCodigo({ nombre, codigo: r.codigo }); setNueva(null); setAviso(null); },
    );
  }

  function pinNuevo(v: VendedoraAdmin) {
    const pregunta = v.numero_vendedora === null
      ? `¿Darle a ${v.nombre} su código propio? Deja de entrar con los cuatro dígitos de antes y entra con el código nuevo, de ocho.`
      : `¿Darle a ${v.nombre} un PIN nuevo? El que tiene deja de servir.`;
    if (!window.confirm(pregunta)) return;
    void hacer(
      () => cuentaVendedora<CodigoNuevo>({ accion: 'pin', id: v.id }),
      (r) => { setCodigo({ nombre: v.nombre, codigo: r.codigo }); setAviso(null); window.scrollTo({ top: 0 }); },
    );
  }

  function pausar(v: VendedoraAdmin) {
    if (v.activo && !window.confirm(`¿Pausar a ${v.nombre}? No vuelve a entrar hasta que la actives. Sus ventas se quedan.`)) return;
    void hacer(
      () => cuentaVendedora({ accion: v.activo ? 'pausar' : 'activar', id: v.id }),
      () => setAviso(v.activo ? `${v.nombre} quedó en pausa.` : `${v.nombre} puede entrar otra vez.`),
    );
  }

  function renombrar() {
    if (!renombrando) return;
    const { id, nombre } = renombrando;
    void hacer(
      () => cuentaVendedora({ accion: 'renombrar', id, nombre }),
      () => { setRenombrando(null); setAviso('Nombre guardado.'); },
    );
  }

  if (cargando) return <Cargando texto="Buscando vendedoras" />;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Vendedoras</h1>
          <p>
            Las del local, cada una con su código para saber quién vendió qué. Los revendedores van
            aparte, en <Link to="/admin/revendedores">Revendedores</Link>: lo que ellos retiran no cuenta aquí.
          </p>
        </div>
        {!nueva ? (
          <button type="button" className="boton" onClick={() => { setAviso(null); setCodigo(null); setErrorForm(null); setNueva({ nombre: '', pin: '' }); }}>
            Nueva vendedora
          </button>
        ) : null}
      </div>

      {error ? <Aviso tono="error" titulo="Algo no salió">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      {codigo ? (
        <div className="tarjeta" style={{ marginBottom: 'var(--e-5)' }}>
          <h2>El código de {codigo.nombre}</h2>
          <span className="codigo-entrada">{codigoLegible(codigo.codigo)}</span>
          <p className="campo__pista">
            Ocho dígitos: los dos primeros son su número y los seis últimos su PIN. Díselo o apúntaselo ahora:
            no se guarda, así que no se vuelve a ver. Si lo olvida, dale un PIN nuevo.
          </p>
          <div className="grupo-botones" style={{ marginTop: 'var(--e-4)' }}>
            <button
              type="button"
              className="boton boton--secundario"
              onClick={() => {
                void navigator.clipboard.writeText(codigo.codigo).then(() => {
                  setCopiado(true);
                  window.setTimeout(() => setCopiado(false), 2500);
                }, () => setCopiado(false));
              }}
            >
              {copiado ? 'Copiado' : 'Copiar el código'}
            </button>
            <button type="button" className="boton boton--confirmar" onClick={() => setCodigo(null)}>Ya se lo di</button>
          </div>
        </div>
      ) : null}

      {nueva ? (
        <div className="tarjeta" style={{ marginBottom: 'var(--e-5)' }}>
          <h2>Nueva vendedora</h2>
          <div className="fila">
            <Campo etiqueta="Nombre" htmlFor="vd-nombre" pista="Como sale en las ventas y en su día.">
              <input id="vd-nombre" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} autoComplete="off" required />
            </Campo>
            <Campo etiqueta="PIN" htmlFor="vd-pin" pista="Seis dígitos. Vacío: se inventa uno, que es lo más seguro.">
              <input
                id="vd-pin" inputMode="numeric" maxLength={6} autoComplete="off"
                value={nueva.pin} onChange={(e) => setNueva({ ...nueva, pin: e.target.value.replace(/\D/g, '') })}
              />
            </Campo>
          </div>
          {errorForm ? <p className="campo__error" role="alert">{errorForm}</p> : null}
          <div className="acciones">
            <button type="button" className="boton boton--confirmar" disabled={trabajando || nueva.nombre.trim().length < 2 || (nueva.pin !== '' && nueva.pin.length !== 6)} onClick={crear}>
              {trabajando ? 'Creando' : 'Crear y darle su código'}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => { setNueva(null); setErrorForm(null); }}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {lista.length > 0 ? (
        <div className="tablero" style={{ marginBottom: 'var(--e-6)' }}>
          <div className="tablero__celda">
            <span className="dato__etiqueta">Vendieron hoy</span>
            <div className="tablero__cifra">{formatearEntero(totales.hoy)}</div>
            <div className="tablero__meta">piezas en el local</div>
          </div>
          <div className="tablero__celda">
            <span className="dato__etiqueta">Este mes</span>
            <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(totales.bcv)}</div>
            <div className="tablero__meta">{formatearEntero(totales.mes)} piezas</div>
          </div>
          <div className="tablero__celda">
            <span className="dato__etiqueta">Activas</span>
            <div className="tablero__cifra">{formatearEntero(totales.activas)}</div>
            <div className="tablero__meta">de {formatearEntero(lista.length)}</div>
          </div>
        </div>
      ) : null}

      {lista.length === 0 && !nueva ? (
        <Vacio titulo="Todavía no hay vendedoras">
          <p>Crea la primera: recibe un código de ocho dígitos para entrar al mostrador.</p>
        </Vacio>
      ) : (
        <div className="pila">
          {lista.map((v) => (
            <div className="tarjeta ficha-persona" key={v.id}>
              <div className="ficha-persona__cabeza">
                <div>
                  {renombrando?.id === v.id ? (
                    <div className="grupo-botones">
                      <input
                        aria-label={`Nombre de ${v.nombre}`}
                        value={renombrando.nombre}
                        onChange={(e) => setRenombrando({ id: v.id, nombre: e.target.value })}
                        autoComplete="off"
                      />
                      <button type="button" className="boton boton--pequeno" disabled={trabajando || renombrando.nombre.trim().length < 2} onClick={renombrar}>Guardar</button>
                      <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => { setRenombrando(null); setErrorForm(null); }}>Cancelar</button>
                    </div>
                  ) : (
                    <div className="ficha-persona__nombre">{v.nombre}</div>
                  )}
                  <div className="ficha-persona__dato">
                    {v.numero_vendedora !== null
                      ? `Número ${String(v.numero_vendedora).padStart(2, '0')} · su código empieza por ${String(v.numero_vendedora).padStart(2, '0')}`
                      : 'Entra con el PIN de cuatro dígitos de antes'}
                    {` · desde el ${formatearFecha(v.creado_en)}`}
                  </div>
                  {renombrando?.id === v.id && errorForm ? <p className="campo__error" role="alert">{errorForm}</p> : null}
                </div>
                <span className={v.activo ? 'etiqueta etiqueta--exito' : 'etiqueta'}>{v.activo ? 'Activa' : 'En pausa'}</span>
              </div>

              <div className="tablero">
                <div className="tablero__celda">
                  <span className="dato__etiqueta">Hoy</span>
                  <div className="tablero__cifra">{formatearEntero(v.piezas_hoy)}</div>
                  <div className="tablero__meta">{v.piezas_hoy === 1 ? 'pieza' : 'piezas'}</div>
                </div>
                <div className="tablero__celda">
                  <span className="dato__etiqueta">Este mes</span>
                  <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(Number(v.total_mes_bcv))}</div>
                  <div className="tablero__meta">{formatearEntero(v.piezas_mes)} piezas en {formatearEntero(v.ventas_mes)} {v.ventas_mes === 1 ? 'venta' : 'ventas'}</div>
                </div>
                <div className="tablero__celda">
                  <span className="dato__etiqueta">Última venta</span>
                  <div className="dato__valor">{v.ultima_venta ? formatearFecha(v.ultima_venta) : 'Ninguna'}</div>
                </div>
              </div>

              {v.numero_vendedora === null ? (
                <p className="ficha-persona__dato" style={{ marginTop: 'var(--e-3)' }}>
                  Es la cuenta de antes. Dale su código propio: seis dígitos de PIN en vez de cuatro, y entra como las demás.
                </p>
              ) : null}

              <div className="acciones">
                <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={() => pinNuevo(v)}>
                  {v.numero_vendedora === null ? 'Darle su código' : 'PIN nuevo'}
                </button>
                <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={() => { setErrorForm(null); setRenombrando({ id: v.id, nombre: v.nombre }); }}>
                  Cambiar nombre
                </button>
                <button type="button" className={v.activo ? 'boton boton--peligro' : 'boton'} disabled={trabajando} onClick={() => pausar(v)}>
                  {v.activo ? 'Pausar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Ayuda titulo="Cómo entra una vendedora">
        <ul className="prosa">
          <li>En la pantalla de entrada escribe su código de ocho dígitos en el teclado de números y toca Entrar.</li>
          <li>Hace lo mismo que la vendedora de siempre: Mostrador, Pedidos, Mi día, Cierre, Conteo, Clientes y Tasas. No ve costos.</li>
          <li>"Mi día" y su meta cuentan solo lo que se vende en el local. Lo que un revendedor retira y paga no cuenta para ella.</li>
          <li>Pausarla le cierra la entrada; sus ventas se quedan. Si se va de la tienda, se pausa, no se borra.</li>
        </ul>
      </Ayuda>
    </div>
  );
}
