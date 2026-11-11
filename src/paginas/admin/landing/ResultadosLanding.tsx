import { useCallback, useEffect, useMemo, useState } from 'react';
import { Aviso, Campo, Cargando, Vacio } from '../../../componentes/Piezas';
import { supabase, mensajeDeError } from '../../../lib/supabase';
import { formatearBcv, formatearEntero, formatearFecha, formatearFechaHora } from '../../../lib/dinero';
import { urlPublicaFoto } from '../../../lib/fotos';

interface FilaMes {
  mes: string; origen: string; emitidos: number; usados: number; vendido_bcv: number | null; rebajado_bcv: number | null;
}

interface FilaCodigo {
  id: number; codigo: string; origen: string; pct: number; estado: string;
  emitido_en: string; vence_en: string; usado_en: string | null;
  venta_id: number | null; reserva_id: number | null; anulado_motivo: string | null; piezas: string | null;
}

interface FilaMirada {
  modelo_id: number; sku: string; nombre: string; variante: string | null;
  foto_thumb_path: string | null; veces: number; segundos: number; vendidas: number;
}

const ORIGENES: Record<string, string> = {
  dos_vistas: 'Dos piezas que miró', complemento: 'Complétalo', escote: 'Su escote', combo: 'Combo de la semana',
  estuche: 'Estuche', regalo: 'Para regalar', seleccion: 'Selección de la casa', casa: 'Oferta de la casa',
};
const ESTADOS: Record<string, string> = {
  emitido: 'Sin usar', tomado: 'En un pedido', usado: 'Usado', vencido: 'Venció', anulado: 'Anulado',
};
const origenDe = (o: string) => ORIGENES[o] ?? o;
const estadoDe = (e: string) => ESTADOS[e] ?? e;

/** "2026-11-01" -> "noviembre de 2026". */
function nombreDeMes(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return fecha;
  return new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(d);
}

function segundosATexto(s: number): string {
  if (s < 60) return `${formatearEntero(s)} s`;
  const m = Math.floor(s / 60);
  return `${formatearEntero(m)} min ${s % 60} s`;
}

/** Lo que dieron las ofertas: el mes, la lista de códigos y lo más mirado. */
export function ResultadosLanding() {
  const [meses, setMeses] = useState<FilaMes[] | null>(null);
  const [codigos, setCodigos] = useState<FilaCodigo[] | null>(null);
  const [miradas, setMiradas] = useState<FilaMirada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [m, c, v] = await Promise.all([
      supabase.from('v_ofertas_mes').select('mes, origen, emitidos, usados, vendido_bcv, rebajado_bcv').order('mes', { ascending: false }).limit(60),
      supabase.from('v_ofertas')
        .select('id, codigo, origen, pct, estado, emitido_en, vence_en, usado_en, venta_id, reserva_id, anulado_motivo, piezas')
        .order('emitido_en', { ascending: false }).limit(400),
      supabase.from('v_miradas')
        .select('modelo_id, sku, nombre, variante, foto_thumb_path, veces, segundos, vendidas')
        .order('segundos', { ascending: false }).limit(20),
    ]);
    // Si lanzas tres consultas, miras tres errores.
    const fallo = m.error ?? c.error ?? v.error;
    if (fallo) setError(mensajeDeError(fallo));
    setMeses((m.data as FilaMes[] | null) ?? []);
    setCodigos((c.data as FilaCodigo[] | null) ?? []);
    setMiradas((v.data as FilaMirada[] | null) ?? []);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const delMes = useMemo(() => {
    if (!meses || meses.length === 0) return { nombre: null as string | null, filas: [] as FilaMes[] };
    const primero = meses[0]!.mes;
    return { nombre: nombreDeMes(primero), filas: meses.filter((f) => f.mes === primero) };
  }, [meses]);

  const filtrados = useMemo(() => {
    if (!codigos) return [];
    const q = busca.trim().toUpperCase().replace(/\s+/g, '');
    if (q === '') return codigos.slice(0, 40);
    return codigos.filter((c) =>
      c.codigo.replace('-', '').includes(q.replace('-', '')) ||
      (c.piezas ?? '').toUpperCase().includes(busca.trim().toUpperCase()) ||
      origenDe(c.origen).toUpperCase().includes(busca.trim().toUpperCase()) ||
      estadoDe(c.estado).toUpperCase().includes(busca.trim().toUpperCase()),
    ).slice(0, 80);
  }, [codigos, busca]);

  const porEstado = useMemo(() => {
    const cuenta: Record<string, number> = {};
    for (const c of codigos ?? []) cuenta[c.estado] = (cuenta[c.estado] ?? 0) + 1;
    return cuenta;
  }, [codigos]);

  async function anular(codigo: string) {
    setTrabajando(true);
    setErrorAnular(null);
    setExito(null);
    const { error: err } = await supabase.rpc('admin_anular_codigo', { p_codigo: codigo, p_motivo: motivo.trim() });
    setTrabajando(false);
    // El mensaje de la base va tal cual: dice, por ejemplo, que un pedido vivo lo tiene tomado.
    if (err) { setErrorAnular(mensajeDeError(err)); return; }
    setAnulando(null);
    setMotivo('');
    setExito(`El código ${codigo} quedó anulado.`);
    await cargar();
  }

  if (meses === null || codigos === null || miradas === null) return <Cargando texto="Cargando los resultados" />;

  return (
    <div className="pila">
      {error ? <Aviso tono="error" titulo="Algo no cargó">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      <div className="tarjeta">
        <h2>{delMes.nombre ? `El mes: ${delMes.nombre}` : 'El mes'}</h2>
        {delMes.filas.length === 0 ? (
          <Vacio titulo="Todavía no hay códigos este mes">Cuando una clienta gane uno, aparece aquí.</Vacio>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">De dónde</th>
                  <th scope="col" className="num">Emitidos</th>
                  <th scope="col" className="num">Usados</th>
                  <th scope="col" className="num">Vendido · $ BCV</th>
                  <th scope="col" className="num">Rebajado · $ BCV</th>
                </tr>
              </thead>
              <tbody>
                {delMes.filas.map((f) => (
                  <tr key={f.origen}>
                    <th scope="row">{origenDe(f.origen)}</th>
                    <td className="num">{formatearEntero(f.emitidos)}</td>
                    <td className="num">{formatearEntero(f.usados)}</td>
                    <td className="num">{formatearBcv(f.vendido_bcv)}</td>
                    <td className="num">{formatearBcv(f.rebajado_bcv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="campo__pista">
          Vendido es lo que se cobró por las piezas con código; rebajado, lo que se dejó de cobrar por el descuento.
          Lo devuelto ya está descontado.
        </p>
      </div>

      <div className="tarjeta">
        <h2>Los códigos</h2>
        <p className="campo__pista">
          Los {formatearEntero(codigos.length)} más recientes:{' '}
          {Object.entries(porEstado).map(([e, n]) => `${formatearEntero(n)} ${estadoDe(e).toLowerCase()}`).join(' · ') || 'ninguno'}.
        </p>
        <Campo etiqueta="Buscar un código" htmlFor="buscar-codigo" pista="El código, una pieza, de dónde vino o su estado.">
          <input id="buscar-codigo" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </Campo>
        {filtrados.length === 0 ? <Vacio titulo="Ningún código coincide" /> : (
          <ul className="pl-codigos">
            {filtrados.map((c) => (
              <li key={c.id} className="pl-codigo">
                <div className="pl-codigo__datos">
                  <strong className="pl-codigo__texto">{c.codigo}</strong>
                  <span className="etiqueta">{estadoDe(c.estado)}</span>
                  <span>{origenDe(c.origen)} · {formatearEntero(c.pct)} %</span>
                  <span className="campo__pista">{c.piezas ?? ''}</span>
                  <span className="campo__pista">
                    Emitido {formatearFechaHora(c.emitido_en)}
                    {c.usado_en ? ` · usado ${formatearFechaHora(c.usado_en)}` : ` · vence ${formatearFecha(c.vence_en)}`}
                    {c.venta_id ? ` · venta ${c.venta_id}` : ''}{c.reserva_id ? ` · pedido ${c.reserva_id}` : ''}
                    {c.anulado_motivo ? ` · ${c.anulado_motivo}` : ''}
                  </span>
                </div>
                {c.estado === 'emitido' || c.estado === 'tomado' ? (
                  anulando === c.codigo ? (
                    <div className="pl-anular">
                      <Campo etiqueta="Por qué se anula" htmlFor={`anular-${c.id}`} error={errorAnular}>
                        <input id={`anular-${c.id}`} type="text" value={motivo} maxLength={160} onChange={(e) => setMotivo(e.target.value)} />
                      </Campo>
                      <div className="grupo-botones">
                        <button type="button" className="boton boton--peligro boton--pequeno" disabled={trabajando || motivo.trim() === ''} onClick={() => void anular(c.codigo)}>
                          {trabajando ? 'Anulando' : 'Anular el código'}
                        </button>
                        <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => { setAnulando(null); setErrorAnular(null); }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => { setAnulando(c.codigo); setMotivo(''); setErrorAnular(null); }}>Anular</button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tarjeta">
        <h2>Lo más mirado</h2>
        <p className="campo__pista">
          Las piezas que más tiempo se miraron en el catálogo en los últimos 30 días, y cuántas se vendieron en esos días.
          Es la suma de todas las visitas: no se sabe quién miró.
        </p>
        {miradas.length === 0 ? <Vacio titulo="Todavía no hay miradas">Se cuentan desde que el catálogo nuevo está publicado.</Vacio> : (
          <ul className="pl-seleccion">
            {miradas.map((m) => {
              const foto = urlPublicaFoto(m.foto_thumb_path);
              return (
                <li key={m.modelo_id}>
                  {foto ? <img className="miniatura" src={foto} alt="" loading="lazy" /> : <span className="miniatura" aria-hidden="true" />}
                  <div className="pl-seleccion__datos">
                    <strong>{m.nombre}{m.variante ? ` · ${m.variante}` : ''}</strong>
                    <span className="campo__pista">
                      {formatearEntero(m.veces)} {m.veces === 1 ? 'vez' : 'veces'} · {segundosATexto(m.segundos)} en total · {formatearEntero(m.vendidas)} {m.vendidas === 1 ? 'vendida' : 'vendidas'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
