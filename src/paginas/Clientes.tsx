import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio } from '../componentes/Piezas';
import { bsDeBcv, formatearBcv, formatearBinance, formatearBs, formatearFecha } from '../lib/dinero';
import { urlPublicaFoto } from '../lib/fotos';
import { nombreConVariante } from '../lib/familias';
import { guardarCliente, useBuscarClientes, useCliente, useMesesServicio } from '../hooks/useClientes';
import { useTasa } from '../hooks/useTasa';
import { METODOS_PAGO } from '../lib/tipos';
import type { ClienteResumen, MetodoPago } from '../lib/tipos';

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

function Ficha({ id }: { id: number | null }) {
  const nueva = id === null || Number.isNaN(id);
  const { cliente, ventas, porVerificar, abonosPorVenta, cargando, error, recargar } = useCliente(nueva ? null : id);
  const { tasa } = useTasa();
  const meses = useMesesServicio();
  const [editando, setEditando] = useState(nueva);

  useEffect(() => { setEditando(nueva); }, [nueva, id]);

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

      {ventas.length === 0 ? (
        <Vacio titulo="Sin compras registradas">
          <p>Cuando se le cobre una venta a su nombre, aparecerá aquí con la fecha y la pieza.</p>
        </Vacio>
      ) : (
        <div className="pila">
          {ventas.map(({ cabecera, piezas }) => (
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
                  const foto = urlPublicaFoto(p.foto_thumb_path);
                  return (
                    <li className="compra__pieza" key={`${p.venta_id}-${p.modelo_id}`}>
                      {foto
                        ? <img className="miniatura" src={foto} alt="" loading="lazy" />
                        : <span className="miniatura" />}
                      <div>
                        <div className="celda-nombre">{nombreConVariante(p.nombre, p.variante)}</div>
                        <div className="celda-nota">
                          {p.sku}
                          {p.variantes_nota ? ` · ${p.variantes_nota}` : ''}
                        </div>
                      </div>
                      <div className="num">
                        <div className="precio">{formatearBs(p.precio_unitario_bs)}</div>
                        <div className="celda-nota">{p.cantidad > 1 ? `${p.cantidad} unidades` : '1 unidad'}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
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
