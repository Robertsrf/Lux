import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio } from '../componentes/Piezas';
import { MiniaturaTocable } from '../componentes/MiniaturaTocable';
import { VisorFoto, useVisorFoto } from '../componentes/VisorFoto';
import type { FotoAmpliada } from '../componentes/VisorFoto';
import {
  abonoEnBcv, binanceDesdeBs, bsDeBcv, centavoArriba, formatearBcv, formatearBinance, formatearBs, formatearFecha,
  leerCifra, totalDeLineas,
} from '../lib/dinero';
import type { Tasas } from '../lib/dinero';
import { nombreConVariante } from '../lib/familias';
import { guardarCliente, useBuscarClientes, useCliente, useMesesServicio } from '../hooks/useClientes';
import { useTasa } from '../hooks/useTasa';
import { useSesion } from '../hooks/useSesion';
import { useUbicaciones } from '../hooks/useCatalogos';
import { METODOS_EN_DOLARES, METODOS_PAGO } from '../lib/tipos';
import type { ClienteResumen, CompraCliente, MetodoPago, Ubicacion } from '../lib/tipos';

const metodoTexto = (m: MetodoPago) => METODOS_PAGO.find((x) => x.valor === m)?.texto ?? m;

/**
 * Cuanto hace de una fecha, en las unidades con que se habla de una compra.
 * No va en `dinero.ts`: alli vive el dinero, y esto es tiempo.
 */
function desdeHace(iso: string | null): string {
  if (!iso) return '';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(dias)) return '';
  // Un reloj adelantado no puede dejar la frase a medias.
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 31) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const anos = Math.floor(dias / 365);
  return `hace ${anos} ${anos === 1 ? 'año' : 'años'}`;
}

/**
 * Cuanto tardo en comprobarse el pago de una venta que quedo por verificar.
 * Es la mitad del historico de credito: no basta saber que pago, importa
 * si fue al dia siguiente o al mes.
 */
function tardoEnPagar(desde: string, hasta: string): string {
  const dias = Math.floor((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000);
  if (!Number.isFinite(dias) || dias <= 0) return 'el mismo día';
  return dias === 1 ? 'un día después' : `${dias} días después`;
}

/**
 * El maestro de clientas. Lo ven las dos caras: la vendedora lo necesita
 * con la clienta delante y el administrador para saber quien vuelve.
 *
 * Aqui no hay una sola cifra de costo. Lo que se suma en la vida de una
 * clienta va en DOLARES, no en bolivares: sumar bolivares de marzo con los
 * de septiembre no dice nada. Los bolivares se muestran compra por compra,
 * que es donde son un hecho y no un promedio.
 *
 * Son fichas y no tabla tambien en escritorio, a proposito: aqui no se
 * comparan clientas entre si, se busca una. Una tabla ordenable resolveria
 * una pregunta que nadie hace.
 */
export function Clientes() {
  const { id } = useParams();
  if (!id) return <Listado />;
  // `/clientes/nueva` es la ficha en blanco. Es una ruta y no un estado
  // para que el boton de atras del telefono haga lo que ella espera.
  return <Ficha id={id === 'nueva' ? null : Number(id)} />;
}

/* ------------------------------------------------------------ listado */

function Listado() {
  const { texto, setTexto, resultados, cargando, error } = useBuscarClientes();
  const meses = useMesesServicio();

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Clientes</h1>
          <p>
            Busca por cédula o por nombre.
            {meses ? ` Cada compra trae ${meses} ${meses === 1 ? 'mes' : 'meses'} de lavado y abrillantado.` : ''}
          </p>
        </div>
        <Link className="boton" to="/clientes/nueva">Registrar clienta</Link>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo leer el maestro">{error}</Aviso> : null}

      <Campo etiqueta="Cédula o nombre" htmlFor="buscar-cliente">
        <input
          id="buscar-cliente"
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="12345678 o María"
          autoComplete="off"
        />
      </Campo>

      {cargando ? (
        <Cargando texto="Buscando" />
      ) : resultados.length === 0 ? (
        <Vacio titulo={texto ? 'Ninguna clienta con eso' : 'Todavía no hay clientas'}>
          <p>
            {texto
              ? 'Prueba con la cédula, o con el nombre solo.'
              : 'Cada venta que se cobre a nombre de alguien la deja aquí, con lo que se llevó y cuándo.'}
          </p>
        </Vacio>
      ) : (
        <>
          {!texto ? <p className="campo__pista">Las últimas que compraron.</p> : null}
          <div className="clientes">
            {resultados.map((c) => <Tarjeta key={c.id} cliente={c} />)}
          </div>
        </>
      )}
    </div>
  );
}

function Tarjeta({ cliente: c }: { cliente: ClienteResumen }) {
  return (
    <Link className="cliente-tarjeta" to={`/clientes/${c.id}`}>
      <span className="cliente-tarjeta__nombre">{c.nombre_completo}</span>
      <span className="cliente-tarjeta__dato">
        {c.cedula ? `C.I. ${c.cedula}` : 'Sin cédula'}
        {c.telefono ? ` · ${c.telefono}` : ''}
      </span>
      <span className="cliente-tarjeta__compras">
        {c.compras === 0
          ? 'Todavía sin compras'
          : `${c.compras} compra${c.compras === 1 ? '' : 's'} · ${c.piezas} pieza${c.piezas === 1 ? '' : 's'} · ${formatearBcv(c.total_bcv)}`}
      </span>
      {c.ultima_compra ? (
        <span className="cliente-tarjeta__pie">
          <span className="cliente-tarjeta__fecha">Última {desdeHace(c.ultima_compra)}</span>
          {c.servicio_vigente
            ? <span className="etiqueta etiqueta--exito">Servicio vigente</span>
            : <span className="etiqueta">Servicio vencido</span>}
        </span>
      ) : null}
    </Link>
  );
}

/* -------------------------------------------------------------- ficha */

/**
 * Una pieza de una compra, con sus líneas juntas: la misma pieza puede haber
 * salido de dos ubicaciones y la base la guarda en dos líneas. Para quien
 * mira la ficha es una sola: "2 unidades, 1 devuelta".
 */
interface PiezaComprada extends CompraCliente {
  /** Cuántas se llevó, sumando las líneas. */
  total: number;
  /** Cuántas volvieron, sumando las líneas. */
  vueltas: number;
}

function juntarPiezas(piezas: CompraCliente[]): PiezaComprada[] {
  const mapa = new Map<number, PiezaComprada>();
  for (const p of piezas) {
    const ya = mapa.get(p.modelo_id);
    if (ya) { ya.total += p.cantidad; ya.vueltas += p.devueltas ?? 0; }
    else mapa.set(p.modelo_id, { ...p, total: p.cantidad, vueltas: p.devueltas ?? 0 });
  }
  return [...mapa.values()];
}

function Ficha({ id }: { id: number | null }) {
  const nueva = id === null || Number.isNaN(id);
  const { cliente, ventas, porVerificar, abonosPorVenta, cargando, error, recargar } = useCliente(nueva ? null : id);
  const { tasa } = useTasa();
  const { esAdmin } = useSesion();
  const { ubicaciones } = useUbicaciones();
  const meses = useMesesServicio();
  const [editando, setEditando] = useState(nueva);
  // La pieza que se está devolviendo: "venta-modelo".
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const visor = useVisorFoto();

  useEffect(() => { setEditando(nueva); }, [nueva, id]);

  // Cada compra con sus piezas juntas, y todas en una lista para el visor:
  // tocar una miniatura abre la pieza en grande y deja pasar a las demás.
  // Antes del primer return (React 310).
  const compras = useMemo(() => ventas.map((v) => ({ ...v, juntas: juntarPiezas(v.piezas) })), [ventas]);
  const fichas = useMemo<FotoAmpliada[]>(() => compras.flatMap((v) => v.juntas.map((p) => ({
    clave: `${v.cabecera.venta_id}-${p.modelo_id}`,
    nombre: p.nombre,
    categoria: p.categoria,
    variantes: [{
      id: p.modelo_id, etiqueta: p.variante, sku: p.sku,
      path: p.foto_path ?? null, thumbPath: p.foto_thumb_path,
      nota: `Se la llevó el ${formatearFecha(v.cabecera.fecha)}`,
    }],
  }))), [compras]);

  function verFoto(clave: string) {
    const f = fichas.find((x) => x.clave === clave);
    if (f) visor.abrir(f, fichas);
  }

  if (cargando) return <Cargando texto="Abriendo la ficha" />;

  if (!nueva && !cliente) {
    return (
      <div className="pagina pagina--angosta">
        <Vacio titulo="Esa clienta ya no existe">
          <p>Puede que la hayan juntado con otra ficha. Búscala de nuevo.</p>
          <Link className="boton boton--secundario" to="/clientes">Volver al maestro</Link>
        </Vacio>
      </div>
    );
  }

  if (editando) {
    return (
      <Formulario
        cliente={cliente}
        alGuardar={() => { setEditando(false); void recargar(); }}
        alCancelar={cliente ? () => setEditando(false) : null}
      />
    );
  }

  const c = cliente!;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <Link className="volver" to="/clientes">← Clientes</Link>
          <h1>{c.nombre_completo}</h1>
          <p>
            {c.cedula ? `C.I. ${c.cedula}` : 'Sin cédula'}
            {c.telefono ? ` · ${c.telefono}` : ''}
            {` · clienta desde el ${formatearFecha(c.creado_en)}`}
            {c.revendedor ? ` · llegó por ${c.revendedor}` : ''}
          </p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={() => setEditando(true)}>
          Corregir datos
        </button>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo leer el histórico">{error}</Aviso> : null}

      <div className="tarjeta">
        {/* El servicio primero: es lo que se le ofrece cuando vuelve, y lo
            que hay que saber antes de decirle nada. */}
        <span className="panel__titulo">Lavado y abrillantado</span>
        {c.servicio_vigente ? (
          <p className="servicio servicio--vigente">
            Le toca hasta el {formatearFecha(c.servicio_hasta)}.
          </p>
        ) : c.ultima_compra ? (
          <p className="servicio">
            Se le venció el {formatearFecha(c.servicio_hasta)}. Vuelve a tocarle con su próxima compra.
          </p>
        ) : (
          <p className="servicio">Todavía no ha comprado nada aquí.</p>
        )}
        {meses ? (
          <p className="campo__pista">Cada compra trae {meses} {meses === 1 ? 'mes' : 'meses'} desde el día que se la llevó.</p>
        ) : null}

        <div className="panel">
          <span className="panel__titulo">En total</span>
          <div className="lista-datos">
            <div className="fila">
              <div>
                <span className="dato__etiqueta">Compras</span>
                <span className="dato__valor">{c.compras}</span>
              </div>
              <div>
                <span className="dato__etiqueta">Piezas</span>
                <span className="dato__valor">{c.piezas}</span>
              </div>
              <div>
                <span className="dato__etiqueta">Ha comprado</span>
                <span className="dato__valor precio">{formatearBcv(c.total_bcv)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Lo que se llevo sin que se haya comprobado el pago: su credito
            abierto. Se comprueba (o se anula) en Pedidos; aqui se cuenta. */}
        {porVerificar.ventas > 0 ? (
          <div className="panel">
            <span className="panel__titulo">Pago por verificar</span>
            <p className="servicio servicio--vigente">
              {porVerificar.ventas === 1 ? 'Una venta' : `${porVerificar.ventas} ventas`} por {formatearBs(porVerificar.totalBs)}.
            </p>
            {/* Lo que de verdad debe: lo que falta de las cobradas por
                partes. En dolares BCV, y en bolivares a la tasa de hoy. */}
            {porVerificar.faltaBcv > 0 ? (
              <p className="servicio">
                Le falta pagar {formatearBcv(porVerificar.faltaBcv)}
                {tasa ? `, hoy ${formatearBs(bsDeBcv(porVerificar.faltaBcv, tasa.tasa_bcv))}` : ''}.
              </p>
            ) : null}
            <p className="campo__pista">Se comprueban en Pedidos, y ahí se cargan los abonos. Mientras tanto, siguen aquí con su fecha.</p>
          </div>
        ) : null}

        {c.notas ? <p className="prosa" style={{ marginTop: 'var(--e-4)' }}>{c.notas}</p> : null}
      </div>

      <h2 className="seccion-titulo">Qué se ha llevado</h2>

      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      {compras.length === 0 ? (
        <Vacio titulo="Sin compras registradas">
          <p>Cuando se le cobre una venta a su nombre, aparecerá aquí con la fecha y la pieza.</p>
        </Vacio>
      ) : (
        <div className="pila">
          {compras.map(({ cabecera, juntas: piezas }) => (
            <div className="tarjeta" key={cabecera.venta_id}>
              <div className="compra__cabecera">
                <div>
                  <span className="compra__fecha">{formatearFecha(cabecera.fecha)}</span>
                  <span className="compra__meta">
                    {desdeHace(cabecera.fecha)} · {metodoTexto(cabecera.metodo)} · {formatearBs(cabecera.total_bs)}
                    {cabecera.pago_referencia ? ` · ref. ${cabecera.pago_referencia}` : ''}
                    {/* Se la vendió un revendedor: el precio es lo que él le pagó a Lux. */}
                    {cabecera.revendedor ? ` · por medio de ${cabecera.revendedor}, a su precio con Lux` : ''}
                  </span>
                  {/* Una venta que quedo por verificar y ya se comprobo: el
                      credito que se pago, y cuanto tardo. */}
                  {cabecera.verificada_en && !cabecera.anulada_sin_pago ? (
                    <span className="compra__meta compra__credito">
                      Quedó por verificar. Pago comprobado el {formatearFecha(cabecera.verificada_en)}, {tardoEnPagar(cabecera.fecha, cabecera.verificada_en)}.
                    </span>
                  ) : null}
                </div>
                <div className="compra__etiquetas">
                  {cabecera.anulada_sin_pago ? (
                    <span className="etiqueta etiqueta--error">Anulada: el pago no llegó</span>
                  ) : (
                    <>
                      {cabecera.por_verificar
                        ? <span className="etiqueta etiqueta--alerta">{cabecera.pago_parcial ? 'Pago por partes' : 'Pago por verificar'}</span>
                        : null}
                      {cabecera.servicio_vigente
                        ? <span className="etiqueta etiqueta--exito">Servicio hasta {formatearFecha(cabecera.servicio_hasta)}</span>
                        : <span className="etiqueta">Servicio vencido</span>}
                    </>
                  )}
                </div>
              </div>

              {/* Los abonos de una venta por partes: cuando pago cada cosa
                  y con que referencia. Es el historico de su credito. */}
              {cabecera.pago_parcial ? (
                <div className="panel compra__abonos">
                  <span className="panel__titulo">Abonos</span>
                  <ul className="abonos">
                    {(abonosPorVenta.get(cabecera.venta_id) ?? []).map((a) => (
                      <li className="abono" key={a.id}>
                        <div className="abono__monto">
                          {a.monto_usd !== null ? `${formatearBinance(a.monto_usd)} · ` : ''}{formatearBs(a.monto_bs)}
                        </div>
                        <div className="campo__pista">
                          {formatearFecha(a.fecha)} · {metodoTexto(a.metodo)}
                          {a.referencia ? ` · ref. ${a.referencia}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!cabecera.anulada_sin_pago && Number(cabecera.falta_bcv) > 0 ? (
                    <p className="abonos__falta">
                      Faltan <strong>{formatearBcv(cabecera.falta_bcv)}</strong>
                      {tasa ? <>, hoy <strong>{formatearBs(bsDeBcv(cabecera.falta_bcv, tasa.tasa_bcv))}</strong></> : null}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <ul className="compra__piezas">
                {piezas.map((p) => {
                  const clave = `${p.venta_id}-${p.modelo_id}`;
                  const nombre = nombreConVariante(p.nombre, p.variante);
                  const quedan = p.total - p.vueltas;
                  // Se devuelve lo que se llevó con el pago comprobado: una
                  // venta por verificar se verifica o se anula en Pedidos.
                  const puedeDevolver = esAdmin && quedan > 0 && !cabecera.por_verificar && !cabecera.anulada_sin_pago;
                  return (
                    <li className="compra__pieza" key={clave}>
                      <MiniaturaTocable thumb={p.foto_thumb_path} nombre={nombre} alVer={() => verFoto(clave)} />
                      <div>
                        <div className="celda-nombre">{nombre}</div>
                        <div className="celda-nota">
                          {p.sku}
                          {p.variantes_nota ? ` · ${p.variantes_nota}` : ''}
                        </div>
                        {p.vueltas > 0 ? (
                          <span className="etiqueta etiqueta--alerta">
                            {quedan === 0 ? (p.total === 1 ? 'Devuelta' : 'Devueltas todas') : `${p.vueltas} devuelta${p.vueltas === 1 ? '' : 's'}`}
                          </span>
                        ) : null}
                      </div>
                      <div className="num">
                        <div className="precio">{formatearBs(p.precio_unitario_bs)}</div>
                        <div className="celda-nota">{p.total > 1 ? `${p.total} unidades` : '1 unidad'}</div>
                        {puedeDevolver && devolviendo !== clave ? (
                          <button
                            type="button"
                            className="boton boton--secundario boton--pequeno"
                            onClick={() => { setAviso(null); setDevolviendo(clave); }}
                            aria-label={`Devolver ${nombre}`}
                          >
                            Devolver
                          </button>
                        ) : null}
                      </div>
                      {devolviendo === clave ? (
                        <DevolverPieza
                          pieza={p}
                          quedan={quedan}
                          ubicaciones={ubicaciones}
                          tasa={tasa}
                          alCerrar={() => setDevolviendo(null)}
                          alTerminar={(m) => { setDevolviendo(null); setAviso(m); void recargar(); }}
                        />
                      ) : null}
                    </li>
                  );
                })}
                {/* Lo que se sumo fuera del catalogo (un dije): va en el
                    total de arriba, y aqui para que las piezas cuadren. */}
                {Number(cabecera.extra_bs ?? 0) > 0 ? (
                  <li className="compra__pieza">
                    <span className="miniatura" />
                    <div>
                      <div className="celda-nombre">{cabecera.extra_nota || 'Sin decir qué'}</div>
                      <div className="celda-nota">Fuera del catálogo</div>
                    </div>
                    <div className="num">
                      <div className="precio">{formatearBs(Number(cabecera.extra_bs))}</div>
                    </div>
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      )}

      <VisorFoto {...visor.props} />
    </div>
  );
}

/**
 * Devolver una pieza que ya se llevó (`admin_devolver_pieza`). Solo el
 * administrador.
 *
 * La pieza vuelve a la existencia, en la ubicación que se elija (por
 * defecto, de donde salió). Queda una nota de crédito que le resta a las
 * ventas de HOY exactamente lo que esa pieza sumó el día que se vendió. Si
 * se le devuelve el dinero, sale de la caja como "Devolución", nunca más de
 * lo que valía.
 */
function DevolverPieza({ pieza, quedan, ubicaciones, tasa, alCerrar, alTerminar }: {
  pieza: PiezaComprada;
  quedan: number;
  ubicaciones: Ubicacion[];
  tasa: Tasas | null;
  alCerrar: () => void;
  alTerminar: (mensaje: string) => void;
}) {
  const [cantidad, setCantidad] = useState(1);
  const [ubicacion, setUbicacion] = useState<number | null>(pieza.ubicacion_id ?? null);
  const [devolver, setDevolver] = useState<boolean | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago>(pieza.metodo);
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombre = nombreConVariante(pieza.nombre, pieza.variante);
  const id = `${pieza.venta_id}-${pieza.modelo_id}`;
  // Lo que valían las que vuelven, en dólares BCV: el tope de la devolución.
  const valorBcv = totalDeLineas([{ precio: Number(pieza.precio_unitario_usd ?? 0), cantidad }]);
  const enDolares = METODOS_EN_DOLARES.includes(metodo);
  const valor = leerCifra(monto) ?? NaN;
  const devuelve = tasa && valor > 0 ? abonoEnBcv(valor, enDolares, tasa) : null;
  const pasa = devuelve !== null && devuelve.bcv > valorBcv + 0.01;
  const valorEnSuMoneda = tasa
    ? (enDolares ? centavoArriba(binanceDesdeBs(bsDeBcv(valorBcv, tasa.tasa_bcv), tasa.tasa_venta) ?? 0) : bsDeBcv(valorBcv, tasa.tasa_bcv))
    : null;
  const listo = motivo.trim() !== '' && devolver !== null && (!devolver || (valor > 0 && !pasa));

  async function devolverAhora() {
    setTrabajando(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_devolver_pieza', {
      p_venta_id: pieza.venta_id,
      p_modelo_id: pieza.modelo_id,
      p_cantidad: cantidad,
      p_ubicacion_id: ubicacion,
      p_devolver: devolver,
      p_metodo: devolver ? metodo : null,
      p_monto: devolver ? valor : null,
      p_motivo: motivo.trim(),
    });
    setTrabajando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    const donde = ubicaciones.find((u) => u.id === ubicacion)?.nombre ?? 'su ubicación';
    alTerminar(`${cantidad === 1 ? 'Devuelta' : `Devueltas ${cantidad}`}: ${nombre} volvió a ${donde} y ya se puede vender. `
      + `Nota de crédito ${data as number}.`
      + (devolver ? ' La devolución del dinero quedó en la caja como salida de hoy.' : ''));
  }

  return (
    <div className="panel devolver-pieza">
      <span className="panel__titulo">Devolver: {nombre}</span>
      <div className="fila">
        {quedan > 1 ? (
          <div className="campo">
            <label htmlFor={`dv-cant-${id}`}>Cuántas</label>
            <select id={`dv-cant-${id}`} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))}>
              {Array.from({ length: quedan }, (_, k) => k + 1).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        ) : null}
        <div className="campo">
          <label htmlFor={`dv-ubi-${id}`}>A dónde vuelve</label>
          <select id={`dv-ubi-${id}`} value={ubicacion ?? ''} onChange={(e) => setUbicacion(e.target.value ? Number(e.target.value) : null)}>
            {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
      </div>
      <div className="campo">
        <label htmlFor={`dv-motivo-${id}`}>Por qué la devuelve</label>
        <input
          id={`dv-motivo-${id}`} autoComplete="off" value={motivo} maxLength={200}
          placeholder="No le quedó, cambió de idea…" onChange={(e) => setMotivo(e.target.value)}
        />
      </div>

      <span className="panel__titulo">
        ¿Se le devuelve el dinero? Valía {formatearBcv(valorBcv)}{tasa ? `, hoy ${formatearBs(bsDeBcv(valorBcv, tasa.tasa_bcv))}` : ''}
      </span>
      <div className="metodos-pago" role="group" aria-label="Se le devuelve el dinero" style={{ marginTop: 'var(--e-3)' }}>
        <button type="button" aria-pressed={devolver === true} onClick={() => setDevolver(true)}>Sí, se le devuelve</button>
        <button type="button" aria-pressed={devolver === false} onClick={() => setDevolver(false)}>No</button>
      </div>
      {devolver ? (
        <div className="fila" style={{ marginTop: 'var(--e-4)' }}>
          <div className="campo">
            <label htmlFor={`dv-metodo-${id}`}>Cómo se le devuelve</label>
            <select id={`dv-metodo-${id}`} value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
              {METODOS_PAGO.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor={`dv-monto-${id}`}>{enDolares ? 'Cuánto · $' : 'Cuánto · Bs'}</label>
            <input id={`dv-monto-${id}`} inputMode="decimal" autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} />
            {valorEnSuMoneda !== null ? (
              <button type="button" className="boton boton--secundario boton--pequeno cargar-abono__todo" onClick={() => setMonto(valorEnSuMoneda.toFixed(2))}>
                Todo lo que valía
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {pasa ? <p className="campo__error" role="alert">Es más de lo que valía la pieza.</p> : null}
      <p className="campo__pista">
        La pieza vuelve a la existencia y a la venta. En Reportes, las ventas de hoy bajan exactamente lo
        que esa pieza sumó el día que se vendió; el día de la venta no cambia.
      </p>

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        <button type="button" className="boton boton--peligro" disabled={trabajando || !listo || ubicacion === null} onClick={() => void devolverAhora()}>
          {trabajando ? 'Guardando' : 'Devolver la pieza'}
        </button>
        <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={alCerrar}>
          No devolver
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- formulario */

function Formulario({ cliente, alGuardar, alCancelar }: {
  cliente: ClienteResumen | null;
  alGuardar: () => void;
  alCancelar: (() => void) | null;
}) {
  const navegar = useNavigate();
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [apellido, setApellido] = useState(cliente?.apellido ?? '');
  const [cedula, setCedula] = useState(cliente?.cedula ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [notas, setNotas] = useState(cliente?.notas ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!nombre.trim()) { setError('Falta el nombre de la clienta.'); return; }
    setGuardando(true);
    const r = await guardarCliente({
      id: cliente?.id ?? null,
      nombre: nombre.trim(),
      apellido: apellido.trim() || null,
      cedula: cedula.trim() || null,
      telefono: telefono.trim() || null,
      notas: notas.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    if (cliente) alGuardar();
    else navegar(`/clientes/${r.id}`, { replace: true });
  }

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <Link className="volver" to="/clientes">← Clientes</Link>
          <h1>{cliente ? 'Corregir datos' : 'Registrar clienta'}</h1>
          <p>La cédula es lo que evita dos fichas de la misma persona. Si no la da, el nombre basta.</p>
        </div>
      </div>

      {error ? <ResumenErrores titulo="No se guardó">{error}</ResumenErrores> : null}

      <div className="tarjeta">
        <div className="fila">
          <Campo etiqueta="Nombre" htmlFor="f-nombre">
            <input id="f-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo etiqueta="Apellido" htmlFor="f-apellido">
            <input id="f-apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <div className="fila">
          <Campo etiqueta="Cédula" htmlFor="f-cedula">
            <input id="f-cedula" inputMode="numeric" value={cedula} onChange={(e) => setCedula(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo etiqueta="Teléfono" htmlFor="f-telefono">
            <input id="f-telefono" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <Campo etiqueta="Notas" htmlFor="f-notas" pista="Lo que convenga recordar de ella: tallas, gustos, lo que preguntó.">
          <textarea id="f-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Campo>

        <div className="acciones">
          <button type="button" className="boton" disabled={guardando} onClick={() => void enviar()}>
            {guardando ? 'Guardando' : 'Guardar'}
          </button>
          {alCancelar ? (
            <button type="button" className="boton boton--secundario" onClick={alCancelar}>Cancelar</button>
          ) : (
            <Link className="boton boton--secundario" to="/clientes">Cancelar</Link>
          )}
        </div>
      </div>
    </div>
  );
}
