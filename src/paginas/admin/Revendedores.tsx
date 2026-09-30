import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearBcv, formatearEntero, formatearFecha, formatearMonto } from '../../lib/dinero';
import { subirLogoRevendedor, urlPublicaFoto } from '../../lib/fotos';
import {
  PALETAS, claseTema, enlaceCatalogoRv, enlacePanelRv, enlaceWhatsApp, usuarioDesdeNombre,
} from '../../lib/revendedor';
import type { PaletaRevendedor, RevendedorAdmin } from '../../lib/tipos';
import '../../estilos/revendedor.css';

/* Las reglas del programa: claves de `configuracion` que siembra
   esquema-revendedores.sql. Aquí solo cómo se llaman y qué quieren decir. */
const REGLAS: { clave: string; etiqueta: string; pista: string }[] = [
  { clave: 'revendedor_descuento_pct', etiqueta: 'Descuento al revendedor · %', pista: 'Cuánto por debajo de la etiqueta le sale cada pieza. Nunca baja del margen mínimo de Costos.' },
  { clave: 'revendedor_sobre_etiqueta_usd', etiqueta: 'Su precio sobre la etiqueta · $ BCV', pista: 'Lo mínimo que su precio pasa del de la tienda.' },
  { clave: 'revendedor_horas_pago', etiqueta: 'Horas para que su clienta le pague', pista: 'Lo que aparta un pedido de su catálogo mientras ella le paga. Al reportar el pago, espera a que él lo confirme.' },
  { clave: 'revendedor_horas_para_pagar', etiqueta: 'Horas para pagarle a Lux', pista: 'Desde que él confirma el pago de su clienta. Si no paga todo a tiempo, las piezas vuelven a la tienda.' },
  { clave: 'revendedor_tope_inicial_usd', etiqueta: 'Tope al empezar · $ BCV', pista: 'Lo que puede tener apartado un revendedor nuevo, a su precio.' },
  { clave: 'revendedor_tope_paso_usd', etiqueta: 'Sube por nivel · $ BCV', pista: 'Cuánto crece el tope en cada nivel.' },
  { clave: 'revendedor_tope_maximo_usd', etiqueta: 'Tope más alto · $ BCV', pista: 'El techo: de aquí no pasa por niveles.' },
  { clave: 'revendedor_vueltas_para_subir', etiqueta: 'Vueltas para subir', pista: 'Cuántas veces su tope tiene que haber retirado y pagado para subir.' },
  { clave: 'revendedor_vencidos_para_bajar', etiqueta: 'Vencidos que lo bajan', pista: 'Apartados que deja vencer y le bajan un nivel. 0: nunca baja.' },
  { clave: 'revendedor_dias_ventana', etiqueta: 'Esos vencidos, en cuántos días', pista: 'Pasado este plazo, un vencido deja de contar.' },
];

interface Escalon { nivel: number; tope_usd: number; desde_usd: number }

interface Formulario {
  id: number | null;
  nombre: string;
  usuario: string;
  usuarioTocado: boolean;
  telefono: string;
  cedula: string;
  catalogo: string;
  paleta: PaletaRevendedor;
  logo: string | null;
  descuento: string;
  tope: string;
  notas: string;
  activo: boolean;
}

const NUEVO: Formulario = {
  id: null, nombre: '', usuario: '', usuarioTocado: false, telefono: '', cedula: '', catalogo: '',
  paleta: 'lux', logo: null, descuento: '', tope: '', notas: '', activo: true,
};

/** Lo que se le manda a un revendedor con su código: su catálogo, su panel y cómo entrar. */
function mensajeDeBienvenida(nombre: string, usuario: string, codigo: string): string {
  const primer = nombre.trim().split(/\s+/)[0];
  return `Hola ${primer}, ya tienes tu catálogo de joyas Lux by Emory: ${enlaceCatalogoRv(usuario)}\n\n`
    + `Tu panel, para ver en cuánto te sale cada pieza, poner tus precios y llevar tus apartados: ${enlacePanelRv()}\n`
    + `Tu código para entrar: ${codigo}\n\nGuárdalo, es solo tuyo.`;
}

/**
 * Revendedores: quienes venden las joyas de Lux a su propia clientela.
 *
 * Aquí se crean (uno por uno: no es para todo el mundo), se les da su
 * código, se ve cómo va cada uno y se fijan las reglas del programa. Las
 * cifras de cada uno salen de `v_revendedores`, y su tope de `rv_tope`: la
 * pantalla no recalcula nada.
 */
export function Revendedores() {
  const [lista, setLista] = useState<RevendedorAdmin[]>([]);
  const [escalera, setEscalera] = useState<Escalon[]>([]);
  const [reglas, setReglas] = useState<Record<string, string>>({});
  const [reglasGuardadas, setReglasGuardadas] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [codigo, setCodigo] = useState<{ nombre: string; usuario: string; telefono: string | null; codigo: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    const [rv, esc, cfg] = await Promise.all([
      supabase.from('v_revendedores').select('*').order('activo', { ascending: false }).order('nombre'),
      supabase.rpc('rv_escalera'),
      supabase.from('configuracion').select('clave, valor').like('clave', 'revendedor_%'),
    ]);
    // Tres consultas, tres errores mirados.
    const fallo = rv.error ?? esc.error ?? cfg.error ?? null;
    setError(fallo ? mensajeDeError(fallo) : null);
    setLista((rv.data as unknown as RevendedorAdmin[] | null) ?? []);
    setEscalera((esc.data as Escalon[] | null) ?? []);
    const mapa: Record<string, string> = {};
    for (const f of (cfg.data as { clave: string; valor: number }[] | null) ?? []) mapa[f.clave] = String(Number(f.valor));
    setReglas(mapa);
    setReglasGuardadas(mapa);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const totales = useMemo(() => ({
    apartado: lista.reduce((s, r) => s + Number(r.usado_usd), 0),
    pagado: lista.reduce((s, r) => s + Number(r.pagado_mes_usd), 0),
    activos: lista.filter((r) => r.activo).length,
  }), [lista]);

  const reglasCambiadas = useMemo(
    () => REGLAS.filter((r) => (reglas[r.clave] ?? '') !== (reglasGuardadas[r.clave] ?? '')),
    [reglas, reglasGuardadas],
  );

  function editar(r: RevendedorAdmin) {
    setAviso(null);
    setErrorForm(null);
    setCodigo(null);
    setForm({
      id: r.id, nombre: r.nombre, usuario: r.usuario, usuarioTocado: true, telefono: r.telefono ?? '',
      cedula: r.cedula ?? '', catalogo: r.catalogo_nombre ?? '', paleta: r.paleta, logo: r.logo_path,
      descuento: r.descuento_pct === null ? '' : String(Number(r.descuento_pct)),
      tope: r.tope_manual_usd === null ? '' : String(Number(r.tope_manual_usd)),
      notas: r.notas ?? '', activo: r.activo,
    });
    window.scrollTo({ top: 0 });
  }

  async function guardar() {
    if (!form) return;
    setGuardando(true);
    setErrorForm(null);
    const numero = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')));
    const { data, error: err } = await supabase.rpc('admin_guardar_revendedor', {
      p_id: form.id,
      p_nombre: form.nombre,
      p_usuario: form.usuario,
      p_telefono: form.telefono,
      p_cedula: form.cedula,
      p_catalogo_nombre: form.catalogo,
      p_paleta: form.paleta,
      p_logo_path: form.logo,
      p_descuento_pct: numero(form.descuento),
      p_tope_manual_usd: numero(form.tope),
      p_activo: form.activo,
      p_notas: form.notas,
    });
    setGuardando(false);
    if (err) { setErrorForm(mensajeDeError(err)); return; }
    const r = data as { id: number; codigo: string | null };
    if (r.codigo) setCodigo({ nombre: form.nombre, usuario: form.usuario, telefono: form.telefono || null, codigo: r.codigo });
    setAviso(form.id ? `${form.nombre} guardado.` : null);
    setForm(null);
    void cargar();
  }

  async function codigoNuevo(r: RevendedorAdmin) {
    if (!window.confirm(`¿Darle un código nuevo a ${r.nombre}? El que tiene deja de servir y su sesión se cierra.`)) return;
    const { data, error: err } = await supabase.rpc('admin_codigo_revendedor', { p_id: r.id });
    if (err) { setError(mensajeDeError(err)); return; }
    setAviso(null);
    setForm(null);
    setCodigo({ nombre: r.nombre, usuario: r.usuario, telefono: r.telefono, codigo: data as string });
    window.scrollTo({ top: 0 });
  }

  async function pausar(r: RevendedorAdmin) {
    const pausa = r.activo;
    if (pausa && !window.confirm(`¿Pausar a ${r.nombre}? Su catálogo deja de verse y su sesión se cierra. Sus apartados abiertos siguen hasta que venzan.`)) return;
    const { error: err } = await supabase.rpc('admin_guardar_revendedor', {
      p_id: r.id, p_nombre: r.nombre, p_usuario: r.usuario, p_telefono: r.telefono, p_cedula: r.cedula,
      p_catalogo_nombre: r.catalogo_nombre, p_paleta: r.paleta, p_logo_path: r.logo_path,
      p_descuento_pct: r.descuento_pct, p_tope_manual_usd: r.tope_manual_usd, p_activo: !pausa, p_notas: r.notas,
    });
    if (err) { setError(mensajeDeError(err)); return; }
    setAviso(pausa ? `${r.nombre} quedó en pausa.` : `${r.nombre} está activo otra vez.`);
    void cargar();
  }

  async function subirLogo(archivo: File | undefined) {
    if (!archivo || !form) return;
    const usuario = form.usuario || usuarioDesdeNombre(form.nombre);
    if (!usuario) { setErrorForm('Escribe primero el nombre: el logo se guarda con su usuario.'); return; }
    setSubiendo(true);
    setErrorForm(null);
    try {
      const ruta = await subirLogoRevendedor(usuario, archivo);
      setForm((f) => (f ? { ...f, logo: ruta } : f));
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : mensajeDeError(e));
    }
    setSubiendo(false);
  }

  async function guardarReglas() {
    for (const r of reglasCambiadas) {
      const valor = Number((reglas[r.clave] ?? '').replace(',', '.'));
      if (!Number.isFinite(valor) || valor < 0) { setError(`"${r.etiqueta}" tiene que ser un número de cero para arriba.`); return; }
    }
    setGuardando(true);
    for (const r of reglasCambiadas) {
      const { error: err } = await supabase.from('configuracion')
        .update({ valor: Number((reglas[r.clave] ?? '').replace(',', '.')) }).eq('clave', r.clave);
      if (err) { setError(mensajeDeError(err)); setGuardando(false); return; }
    }
    setGuardando(false);
    setAviso('Reglas guardadas. Valen desde el próximo apartado.');
    void cargar();
  }

  if (cargando) return <Cargando texto="Buscando revendedores" />;

  const cambiar = (campo: keyof Formulario, valor: string | boolean) =>
    setForm((f) => {
      if (!f) return f;
      const nuevo = { ...f, [campo]: valor } as Formulario;
      // El usuario sale del nombre mientras no lo toquen a mano.
      if (campo === 'nombre' && !f.usuarioTocado) nuevo.usuario = usuarioDesdeNombre(String(valor));
      if (campo === 'usuario') nuevo.usuarioTocado = true;
      return nuevo;
    });

  const bienvenida = codigo ? mensajeDeBienvenida(codigo.nombre, codigo.usuario, codigo.codigo) : '';

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Revendedores</h1>
          <p>
            Quienes venden las joyas de Lux a su propia clientela: cada uno con su catálogo, su panel y su
            tope. Aparta de tu inventario; paga al retirar en la tienda.
          </p>
        </div>
        {!form ? (
          <button type="button" className="boton" onClick={() => { setAviso(null); setCodigo(null); setErrorForm(null); setForm(NUEVO); }}>
            Nuevo revendedor
          </button>
        ) : null}
      </div>

      {error ? <Aviso tono="error" titulo="Algo no salió">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      {codigo ? (
        <div className="tarjeta" style={{ marginBottom: 'var(--e-5)' }}>
          <h2>El código de {codigo.nombre}</h2>
          <span className="codigo-entrada">{codigo.codigo}</span>
          <p className="campo__pista">
            Mándaselo ahora: no se guarda, así que no se vuelve a ver. Si lo pierde, dale uno nuevo desde su ficha.
          </p>
          <div className="grupo-botones" style={{ marginTop: 'var(--e-4)' }}>
            <a className="boton boton--confirmar" href={enlaceWhatsApp(codigo.telefono, bienvenida)} target="_blank" rel="noopener noreferrer">
              Mandárselo por WhatsApp
            </a>
            <button
              type="button"
              className="boton boton--secundario"
              onClick={() => {
                void navigator.clipboard.writeText(bienvenida).then(() => {
                  setCopiado(true);
                  window.setTimeout(() => setCopiado(false), 2500);
                }, () => setCopiado(false));
              }}
            >
              {copiado ? 'Copiado' : 'Copiar el mensaje'}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => setCodigo(null)}>Ya se lo mandé</button>
          </div>
        </div>
      ) : null}

      {form ? (
        <div className="tarjeta" style={{ marginBottom: 'var(--e-5)' }}>
          <h2>{form.id ? `Editar a ${form.nombre}` : 'Nuevo revendedor'}</h2>
          <div className="fila">
            <Campo etiqueta="Nombre" htmlFor="rv-nombre">
              <input id="rv-nombre" value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} autoComplete="off" required />
            </Campo>
            <Campo etiqueta="Usuario" htmlFor="rv-usuario" pista={`Va en su enlace: …/#/r/${form.usuario || 'usuario'}`}>
              <input id="rv-usuario" value={form.usuario} onChange={(e) => cambiar('usuario', e.target.value.toLowerCase())} autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </Campo>
          </div>
          <div className="fila" style={{ marginTop: 'var(--hueco-campos)' }}>
            <Campo etiqueta="WhatsApp" htmlFor="rv-tel" pista="Con el código: 0412 1234567.">
              <input id="rv-tel" type="tel" value={form.telefono} onChange={(e) => cambiar('telefono', e.target.value)} autoComplete="off" />
            </Campo>
            <Campo etiqueta="Cédula" htmlFor="rv-cedula">
              <input id="rv-cedula" inputMode="numeric" value={form.cedula} onChange={(e) => cambiar('cedula', e.target.value)} autoComplete="off" />
            </Campo>
          </div>
          <div className="fila" style={{ marginTop: 'var(--hueco-campos)' }}>
            <Campo etiqueta="Nombre del catálogo" htmlFor="rv-catalogo" pista="Vacío, su nombre. Él lo puede cambiar desde su panel.">
              <input id="rv-catalogo" value={form.catalogo} onChange={(e) => cambiar('catalogo', e.target.value)} maxLength={60} autoComplete="off" />
            </Campo>
            <Campo etiqueta="Logo" htmlFor="rv-logo" pista={subiendo ? 'Subiendo el logo' : 'Cuadrado. Se comprime antes de subir.'}>
              <input id="rv-logo" type="file" accept="image/*" onChange={(e) => void subirLogo(e.target.files?.[0])} disabled={subiendo} />
            </Campo>
          </div>
          {form.logo ? (
            <div className="grupo-botones" style={{ marginTop: 'var(--e-3)' }}>
              <img className="rv-marca__logo" src={urlPublicaFoto(form.logo) ?? ''} alt="Logo" />
              <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => cambiar('logo', '')}>Quitar el logo</button>
            </div>
          ) : null}

          <fieldset className="paletas" style={{ marginTop: 'var(--e-5)' }}>
            <legend>Colores de su catálogo</legend>
            {PALETAS.map((p) => (
              <label key={p.id} className={`paleta ${claseTema(p.id)}`}>
                <input type="radio" name="rv-paleta" value={p.id} checked={form.paleta === p.id} onChange={() => cambiar('paleta', p.id)} />
                <span className="paleta__muestra" aria-hidden="true">
                  <span className="paleta__ancla"><span className="paleta__acento" /></span>
                  <span className="paleta__papel" />
                </span>
                <span className="paleta__nombre">{p.nombre}</span>
              </label>
            ))}
          </fieldset>

          <div className="fila" style={{ marginTop: 'var(--e-5)' }}>
            <Campo etiqueta="Descuento propio · %" htmlFor="rv-desc" pista={`Vacío: el general, ${reglasGuardadas.revendedor_descuento_pct ?? '—'} %.`}>
              <input id="rv-desc" inputMode="decimal" value={form.descuento} onChange={(e) => cambiar('descuento', e.target.value)} autoComplete="off" />
            </Campo>
            <Campo etiqueta="Tope a mano · $ BCV" htmlFor="rv-tope" pista="Vacío: el de su nivel. Para alguien de mucha confianza.">
              <input id="rv-tope" inputMode="decimal" value={form.tope} onChange={(e) => cambiar('tope', e.target.value)} autoComplete="off" />
            </Campo>
          </div>
          <div style={{ marginTop: 'var(--hueco-campos)' }}>
            <Campo etiqueta="Notas" htmlFor="rv-notas" pista="Solo las ves tú.">
              <input id="rv-notas" value={form.notas} onChange={(e) => cambiar('notas', e.target.value)} autoComplete="off" />
            </Campo>
          </div>

          {errorForm ? <p className="campo__error" role="alert">{errorForm}</p> : null}
          <div className="acciones">
            <button type="button" className="boton boton--confirmar" disabled={guardando || subiendo || !form.nombre.trim() || !form.usuario.trim()} onClick={() => void guardar()}>
              {guardando ? 'Guardando' : form.id ? 'Guardar' : 'Crear y darle su código'}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => { setForm(null); setErrorForm(null); }}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {lista.length > 0 ? (
        <div className="tablero" style={{ marginBottom: 'var(--e-6)' }}>
          <div className="tablero__celda">
            <span className="dato__etiqueta">Apartado por revendedores</span>
            <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(totales.apartado)}</div>
            <div className="tablero__meta">de tu inventario ahora, a su precio</div>
          </div>
          <div className="tablero__celda">
            <span className="dato__etiqueta">Te pagaron este mes</span>
            <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(totales.pagado)}</div>
            <div className="tablero__meta">al retirar en la tienda</div>
          </div>
          <div className="tablero__celda">
            <span className="dato__etiqueta">Activos</span>
            <div className="tablero__cifra">{formatearEntero(totales.activos)}</div>
            <div className="tablero__meta">de {formatearEntero(lista.length)}</div>
          </div>
        </div>
      ) : null}

      {lista.length === 0 && !form ? (
        <Vacio titulo="Todavía no hay revendedores">
          <p>Crea el primero: recibe su catálogo con tus joyas a su precio, su panel y un código para entrar.</p>
        </Vacio>
      ) : (
        <div className="pila">
          {lista.map((r) => (
            <div className="tarjeta ficha-persona" key={r.id}>
              <div className="ficha-persona__cabeza">
                <div>
                  <div className="ficha-persona__nombre">{r.nombre}</div>
                  <div className="ficha-persona__dato">
                    {[r.catalogo_nombre, `/r/${r.usuario}`, r.telefono, `desde el ${formatearFecha(r.creado_en)}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {!r.activo
                  ? <span className="etiqueta">En pausa</span>
                  : r.nivel === null
                    ? <span className="etiqueta etiqueta--exito">Tope a mano</span>
                    : <span className={r.bajado ? 'etiqueta etiqueta--alerta' : 'etiqueta etiqueta--exito'}>Nivel {r.nivel} de {r.niveles}{r.bajado ? ', bajó uno' : ''}</span>}
              </div>
              <div className="tablero">
                <div className="tablero__celda">
                  <span className="dato__etiqueta">Apartado ahora</span>
                  <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(Number(r.usado_usd))}</div>
                  <div className="tablero__meta">de {formatearBcv(Number(r.tope_usd))} · {r.abiertos} {r.abiertos === 1 ? 'abierto' : 'abiertos'}</div>
                </div>
                <div className="tablero__celda">
                  <span className="dato__etiqueta">Este mes</span>
                  <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(Number(r.pagado_mes_usd))}</div>
                  <div className="tablero__meta">{r.piezas_mes} {r.piezas_mes === 1 ? 'pieza retirada' : 'piezas retiradas'}</div>
                </div>
                <div className="tablero__celda">
                  <span className="dato__etiqueta">Clientas</span>
                  <div className="tablero__cifra">{formatearEntero(r.clientas)}</div>
                  <div className="tablero__meta">
                    {r.vencidos_recientes > 0 ? `${r.vencidos_recientes} ${r.vencidos_recientes === 1 ? 'apartado vencido' : 'apartados vencidos'} hace poco` : 'Ningún apartado vencido hace poco'}
                  </div>
                </div>
              </div>
              <p className="ficha-persona__dato" style={{ marginTop: 'var(--e-3)' }}>
                Le sale {formatearEntero(Number(r.descuento_efectivo_pct))} % por debajo de la etiqueta
                {r.descuento_pct !== null ? ' (descuento propio)' : ''}. Ha retirado {formatearBcv(Number(r.retirado_usd))} en total
                {r.falta_para_subir_usd !== null && r.siguiente_tope_usd !== null
                  ? `; con ${formatearBcv(Number(r.falta_para_subir_usd))} más sube a ${formatearBcv(Number(r.siguiente_tope_usd))}.`
                  : '.'}
                {r.notas ? ` ${r.notas}` : ''}
              </p>
              <div className="acciones">
                <button type="button" className="boton boton--secundario" onClick={() => editar(r)}>Editar</button>
                <button type="button" className="boton boton--secundario" onClick={() => void codigoNuevo(r)}>Código nuevo</button>
                <a className="boton boton--secundario" href={enlaceCatalogoRv(r.usuario)} target="_blank" rel="noopener noreferrer">Ver su catálogo</a>
                <button type="button" className={r.activo ? 'boton boton--peligro' : 'boton'} onClick={() => void pausar(r)}>
                  {r.activo ? 'Pausar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="seccion-titulo">Las reglas</h2>
      <div className="tarjeta">
        <div className="rejilla rejilla--3">
          {REGLAS.map((r) => (
            <Campo key={r.clave} etiqueta={r.etiqueta} htmlFor={`rg-${r.clave}`} pista={r.pista}>
              <input
                id={`rg-${r.clave}`}
                inputMode="decimal"
                value={reglas[r.clave] ?? ''}
                onChange={(e) => setReglas((x) => ({ ...x, [r.clave]: e.target.value }))}
                autoComplete="off"
              />
            </Campo>
          ))}
        </div>
        <div className="acciones">
          <button type="button" className="boton boton--confirmar" disabled={guardando || reglasCambiadas.length === 0} onClick={() => void guardarReglas()}>
            {guardando ? 'Guardando' : 'Guardar las reglas'}
          </button>
          {reglasCambiadas.length > 0 ? (
            <button type="button" className="boton boton--secundario" onClick={() => setReglas(reglasGuardadas)}>Descartar</button>
          ) : null}
        </div>

        <h3 style={{ marginTop: 'var(--e-6)', marginBottom: 'var(--e-3)' }}>Cómo sube el tope</h3>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr><th>Nivel</th><th className="num">Tope · $ BCV</th><th className="num">Desde · $ BCV</th></tr>
            </thead>
            <tbody>
              {escalera.map((e) => (
                <tr key={e.nivel}>
                  <td>{e.nivel}</td>
                  <td className="num precio">{formatearMonto(Number(e.tope_usd))}</td>
                  <td className="num precio">{e.nivel === 1 ? 'Al empezar' : formatearMonto(Number(e.desde_usd))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
          Tope: lo que puede tener apartado a la vez. Desde: lo que tiene que haber retirado y pagado para llegar. Todo a lo que el revendedor le paga a Lux; la escalera sale de las reglas guardadas.
        </p>
      </div>

      <Ayuda titulo="Cómo funciona">
        <ul className="prosa">
          <li>Cada pieza le sale al revendedor el descuento de arriba por debajo de la etiqueta, sin bajar nunca del margen mínimo de Costos: ese piso ya trae la mercancía, el flete, el empaque y la parte del alquiler y los sueldos.</li>
          <li>Las piezas que no dejan rebaja (las de margen muy fino) no salen en su catálogo.</li>
          <li>Su clienta aparta desde su enlace: la pieza sale de lo libre de la tienda, el mostrador ya no la ve, hasta que la retire o venza.</li>
          <li>Él retira en la tienda, pagando: se cobra en Pedidos, en "De revendedores", y la venta queda en caja con el motivo "revendedor" en Reportes.</li>
          <li>Él no ve ningún costo: ve la etiqueta, su precio y en cuánto le sale. Y entra con su código, no con una cuenta de la tienda.</li>
        </ul>
      </Ayuda>
    </div>
  );
}
