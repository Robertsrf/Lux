import { useCallback, useEffect, useMemo, useState } from 'react';
import { Aviso, Cargando, Vacio } from '../../../componentes/Piezas';
import { CargarAbono } from '../../../componentes/CargarAbono';
import { bsDeBcv, formatearBcv, formatearBinance, formatearBs, formatearFecha, precioEnBs } from '../../../lib/dinero';
import type { Tasas } from '../../../lib/dinero';
import { urlPublicaFoto } from '../../../lib/fotos';
import { nombreConVariante } from '../../../lib/familias';
import { diasParaVencer, enlaceApartado, enlaceWhatsApp, rpcRv } from '../../../lib/revendedor';
import { useTasa } from '../../../hooks/useTasa';
import { METODOS_PAGO } from '../../../lib/tipos';
import type { ApartadoRevendedor } from '../../../lib/tipos';
import { textoDeError, usePanelRv } from '../contexto';

type Filtro = 'vigentes' | 'deben' | 'todos';

const hora = (iso: string) => new Intl.DateTimeFormat('es-VE', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const textoMetodo = (m: string) => METODOS_PAGO.find((x) => x.valor === m)?.texto ?? m;

/**
 * Sus apartados, con las dos cuentas de cada uno, separadas:
 *   - lo que su clienta le paga a ÉL, abono por abono, y lo que le falta;
 *   - lo que él le paga a Lux al retirar.
 *
 * Los vigentes primero, el que vence antes arriba. Después los retirados
 * que su clienta todavía le debe: ahí vive su crédito.
 */
export function ApartadosRv() {
  const { siSeCerro, recargar: recargarResumen } = usePanelRv();
  const { tasa } = useTasa();
  const [lista, setLista] = useState<ApartadoRevendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('vigentes');

  const cargar = useCallback(async () => {
    try {
      setLista(await rpcRv<ApartadoRevendedor[]>('rv_apartados'));
      setError(null);
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setCargando(false);
  }, [siSeCerro]);

  useEffect(() => { void cargar(); }, [cargar]);

  const grupos = useMemo(() => ({
    vigentes: lista.filter((a) => a.estado === 'abierto'),
    deben: lista.filter((a) => a.estado === 'retirado' && Number(a.falta_usd) > 0),
    todos: lista,
  }), [lista]);

  function alTerminar(mensaje: string) {
    setAviso(mensaje);
    void cargar();
    void recargarResumen();
  }

  if (cargando) return <Cargando texto="Buscando tus apartados" />;

  const visibles = grupos[filtro];

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Apartados</h1>
          <p>Lo que tus clientas apartaron, lo que te han pagado y lo que llevas a la tienda para retirar.</p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={() => { setAviso(null); void cargar(); }}>Actualizar</button>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudieron leer tus apartados">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      <div className="rv-filtro" role="group" aria-label="Qué apartados ver">
        <button type="button" aria-pressed={filtro === 'vigentes'} onClick={() => setFiltro('vigentes')}>
          Vigentes · {grupos.vigentes.length}
        </button>
        <button type="button" aria-pressed={filtro === 'deben'} onClick={() => setFiltro('deben')}>
          Te deben · {grupos.deben.length}
        </button>
        <button type="button" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>
          Todos · {grupos.todos.length}
        </button>
      </div>

      {visibles.length === 0 ? (
        <Vacio titulo={filtro === 'vigentes' ? 'No tienes apartados abiertos' : filtro === 'deben' ? 'Nadie te debe' : 'Todavía no hay apartados'}>
          <p>
            {filtro === 'deben'
              ? 'Aquí aparecen las piezas que ya retiraste y tu clienta todavía no te termina de pagar.'
              : 'Manda tu catálogo por WhatsApp desde Inicio: lo que tus clientas aparten te llega aquí.'}
          </p>
        </Vacio>
      ) : (
        <div className="pila">
          {visibles.map((a) => <TarjetaApartado key={a.id} a={a} tasa={tasa} alTerminar={alTerminar} siSeCerro={siSeCerro} />)}
        </div>
      )}
    </div>
  );
}

function TarjetaApartado({ a, tasa, alTerminar, siSeCerro }: {
  a: ApartadoRevendedor;
  tasa: Tasas | null;
  alTerminar: (mensaje: string) => void;
  siSeCerro: (e: unknown) => boolean;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abonando, setAbonando] = useState(false);
  const clienta = [a.cliente.nombre, a.cliente.apellido].filter(Boolean).join(' ');
  const primer = a.cliente.nombre.trim().split(/\s+/)[0];
  const total = Number(a.total_usd);
  const lux = Number(a.lux_usd);
  const falta = Number(a.falta_usd);
  const abonado = Number(a.abonado_usd);
  const luxBs = tasa ? precioEnBs(lux, tasa) : null;
  const puedeAbonar = falta > 0 && (a.estado === 'abierto' || a.estado === 'retirado');

  async function cancelar() {
    const aviso = abonado > 0
      ? `${primer} ya te abonó ${formatearBcv(abonado)}. Si cancelas, las piezas vuelven a la tienda y ese dinero lo arreglas con ella. ¿Cancelar?`
      : '¿Cancelar este apartado? Las piezas vuelven a la tienda y ya no las puede pagar.';
    if (!window.confirm(aviso)) return;
    setTrabajando(true);
    setError(null);
    try {
      await rpcRv('rv_cancelar_apartado', { p_apartado_id: a.id, p_motivo: null });
      alTerminar(`Apartado de ${primer} cancelado: las piezas volvieron a la tienda.`);
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setTrabajando(false);
  }

  const etiqueta = a.estado === 'abierto'
    ? <span className="etiqueta etiqueta--alerta">{diasParaVencer(a.expira_en)} · hasta el {formatearFecha(a.expira_en)}</span>
    : a.estado === 'vencido'
      ? <span className="etiqueta etiqueta--error">Venció el {formatearFecha(a.expira_en)}</span>
      : a.estado === 'retirado'
        ? <span className="etiqueta etiqueta--exito">Retirado el {formatearFecha(a.retirado_en)}</span>
        : <span className="etiqueta">Cancelado</span>;

  const mensajeClienta = `Hola ${primer}, aquí puedes ver tu apartado: ${enlaceApartado(a.token)}`;

  return (
    <div className="tarjeta">
      <div className="encabezado-pagina" style={{ marginBottom: 'var(--e-4)' }}>
        <div>
          <h2>{clienta}</h2>
          <p>
            {[a.cliente.cedula ? `C.I. ${a.cliente.cedula}` : null, a.cliente.telefono, `apartado el ${formatearFecha(a.creado_en)}`]
              .filter(Boolean).join(' · ')}
          </p>
          <p className="pedido__total">
            Te paga {formatearBcv(total)}
            {tasa ? <> · {formatearBs(precioEnBs(total, tasa))}</> : null}
          </p>
        </div>
        {etiqueta}
      </div>

      {/* Una línea por pieza y no una tabla: en el teléfono cinco columnas
          se deslizaban a lo ancho y no se leía ninguna. Aquí dos cifras por
          pieza, lo que cobra y lo que le sale, y cuántas. */}
      <div className="lineas-cobro">
        {a.items.map((i) => {
          const foto = urlPublicaFoto(i.foto_thumb_path);
          return (
            <div className="linea-cobro" key={i.modelo_id}>
              {foto ? <img className="linea-cobro__foto" src={foto} alt="" loading="lazy" /> : <span className="linea-cobro__foto" />}
              <div>
                <div className="linea-cobro__nombre">{nombreConVariante(i.nombre, i.variante)}</div>
                <div className="linea-cobro__precio">
                  A tu clienta <span className="rv-precio__cifra">{formatearBcv(Number(i.precio_usd))}</span>
                  {' · '}te sale <span className="rv-precio__cifra">{formatearBcv(Number(i.precio_lux_usd))}</span>
                </div>
              </div>
              <span className="contador__valor" aria-label={`${i.cantidad} piezas`}>×{i.cantidad}</span>
            </div>
          );
        })}
      </div>

      {a.abonos.length > 0 || falta > 0 ? (
        <div className="panel">
          <span className="panel__titulo">Lo que te ha pagado</span>
          {a.abonos.length > 0 ? (
            <ul className="abonos">
              {a.abonos.map((b, n) => (
                <li className="abono" key={`${b.fecha}-${n}`}>
                  <div>
                    <div className="abono__monto">
                      {b.monto_usd !== null ? `${formatearBinance(Number(b.monto_usd))} · ` : ''}{formatearBs(Number(b.monto_bs))}
                    </div>
                    <div className="campo__pista">
                      {formatearFecha(b.fecha)}, {hora(b.fecha)} · {textoMetodo(b.metodo)}
                      {b.referencia ? ` · Ref. ${b.referencia}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="campo__pista">Todavía no te ha pagado nada.</p>}
          {falta > 0 ? (
            <p className="abonos__falta">
              Te faltan <strong>{formatearBcv(falta)}</strong>
              {tasa ? <>, hoy <strong>{formatearBs(bsDeBcv(falta, tasa.tasa_bcv))}</strong></> : null}.
            </p>
          ) : (
            <p className="abonos__falta abonos__falta--listo">Te pagó completo.</p>
          )}
        </div>
      ) : null}

      {a.estado === 'vencido' && abonado > 0 ? (
        <Aviso tono="alerta" titulo="Venció con abonos">
          {primer} te abonó {formatearBcv(abonado)} y las piezas volvieron a la tienda. Devuélveselo, o apártale las piezas otra vez desde tu catálogo.
        </Aviso>
      ) : null}

      {a.estado === 'abierto' ? (
        <div className="rv-apartado__pie">
          <p className="rv-apartado__lux">
            Para retirar lleva <strong>{formatearBcv(lux)}</strong>
            {luxBs !== null ? <>, hoy <strong>{formatearBs(luxBs)}</strong></> : null} a la tienda.
          </p>
          <p className="rv-apartado__lux">Ganas <strong>{formatearBcv(total - lux)}</strong></p>
        </div>
      ) : null}

      {puedeAbonar && tasa && abonando ? (
        <div className="rv-abonar">
        <CargarAbono
          id={a.id}
          falta={falta}
          tasa={tasa}
          titulo="Cargar lo que te pagó"
          registrar={async (metodo, monto, referencia) => {
            try {
              return Number(await rpcRv<number>('rv_abonar', {
                p_apartado_id: a.id, p_metodo: metodo, p_monto: monto, p_referencia: referencia,
              }));
            } catch (e) {
              if (siSeCerro(e)) return falta;
              throw e;
            }
          }}
          alGuardar={(resta) => alTerminar(resta > 0
            ? `Abono de ${primer} cargado. Le faltan ${formatearBcv(resta)}, hoy ${formatearBs(bsDeBcv(resta, tasa.tasa_bcv))}.`
            : `Abono cargado: ${primer} te pagó completo.`)}
        />
        </div>
      ) : null}

      {error ? <p className="campo__error" role="alert">{error}</p> : null}
      <div className="acciones">
        {puedeAbonar && tasa && !abonando ? (
          <button type="button" className="boton" onClick={() => setAbonando(true)}>Cargar lo que te pagó</button>
        ) : null}
        {a.cliente.telefono ? (
          <a className="boton boton--secundario" href={enlaceWhatsApp(a.cliente.telefono, mensajeClienta)} target="_blank" rel="noopener noreferrer">
            Mandarle su enlace
          </a>
        ) : null}
        {a.estado === 'abierto' ? (
          <button type="button" className="boton boton--peligro" disabled={trabajando} onClick={() => void cancelar()}>
            Cancelar apartado
          </button>
        ) : null}
      </div>
    </div>
  );
}
