import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Campo, Cargando, Vacio } from '../../../componentes/Piezas';
import {
  abonoEnBcv, bsDeBcv, faltaTrasAbono, formatearBcv, formatearBs, minimoParaApartar, precioEnBs, totalDeLineas,
} from '../../../lib/dinero';
import { urlPublicaFoto } from '../../../lib/fotos';
import { nombreConVariante } from '../../../lib/familias';
import { enlaceApartado, enlaceWhatsApp, rpcRv } from '../../../lib/revendedor';
import { useTasa } from '../../../hooks/useTasa';
import { METODOS_EN_DOLARES, METODOS_PAGO, PIDE_REFERENCIA } from '../../../lib/tipos';
import type { ClienteRevendedor, MetodoPago, PiezaRevendedor } from '../../../lib/tipos';
import { textoDeError, usePanelRv } from '../contexto';

const soloDigitos = (s: string) => s.replace(/\D/g, '');

/**
 * Vender desde su panel: él arma el pedido para una clienta suya, con sus
 * precios. Es el mismo pedido que ella haría desde el catálogo, y aparta
 * igual de lo libre de la tienda.
 *
 * Si ya le pagó (en la mano o en su banco), lo anota aquí y el pedido
 * queda confirmado de una vez: desde ahí corre su día para pagarle a Lux.
 * Si no, espera las horas de siempre y él le manda el enlace para pagar.
 */
export function VenderRv() {
  const { siSeCerro, recargar, resumen } = usePanelRv();
  const { tasa } = useTasa();
  const [piezas, setPiezas] = useState<PiezaRevendedor[]>([]);
  const [clientas, setClientas] = useState<ClienteRevendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [seleccion, setSeleccion] = useState<Map<number, number>>(new Map());
  const [cedula, setCedula] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pago, setPago] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPago>('pago_movil');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<{ token: string; fase: string; clienta: string; telefono: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        rpcRv<PiezaRevendedor[]>('rv_piezas'),
        rpcRv<ClienteRevendedor[]>('rv_clientes'),
      ]);
      setPiezas(p ?? []);
      setClientas(c ?? []);
      setError(null);
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setCargando(false);
  }, [siSeCerro]);

  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const lista = t
      ? piezas.filter((p) => `${p.nombre} ${p.variante ?? ''} ${p.sku} ${p.categoria}`.toLowerCase().includes(t))
      : piezas;
    return lista.slice(0, 60);
  }, [piezas, texto]);

  const elegidas = useMemo(
    () => piezas.filter((p) => (seleccion.get(p.id) ?? 0) > 0).map((p) => ({ pieza: p, cantidad: seleccion.get(p.id) ?? 0 })),
    [piezas, seleccion],
  );

  const cuentas = useMemo(() => {
    const cobras = totalDeLineas(elegidas.map((e) => ({ precio: Number(e.pieza.precio_usd), cantidad: e.cantidad })));
    const lux = totalDeLineas(elegidas.map((e) => ({ precio: Number(e.pieza.precio_lux_usd), cantidad: e.cantidad })));
    return { piezas: elegidas.reduce((n, e) => n + e.cantidad, 0), cobras, lux };
  }, [elegidas]);

  // Su clienta, si la cédula ya está entre las suyas.
  const suya = useMemo(() => {
    const d = soloDigitos(cedula);
    return d.length >= 6 ? clientas.find((c) => soloDigitos(c.cedula ?? '') === d) ?? null : null;
  }, [cedula, clientas]);

  if (cargando) return <Cargando texto="Buscando tus piezas" />;

  const pct = Number(resumen?.inicial_pct ?? 0);
  const daCredito = Boolean(resumen?.dias_credito);
  const minimo = daCredito && pct > 0 ? minimoParaApartar(cuentas.cobras, pct) : cuentas.cobras;
  const enDolares = METODOS_EN_DOLARES.includes(metodo);
  const valor = Number(monto.replace(',', '.'));
  const pagado = pago && tasa && valor > 0 ? abonoEnBcv(valor, enDolares, tasa) : null;
  const tras = pagado ? faltaTrasAbono(cuentas.cobras, pagado.bcv) : null;
  const llegaAlMinimo = !pago || (pagado !== null && pagado.bcv >= minimo - 0.005 && !tras?.pasa);
  const datosClienta = suya
    ? Boolean(suya.nombre) && (Boolean(suya.apellido) || Boolean(apellido.trim())) && (soloDigitos(suya.telefono ?? '').length >= 10 || soloDigitos(telefono).length >= 10)
    : Boolean(nombre.trim() && apellido.trim() && soloDigitos(telefono).length >= 10);
  const listo = cuentas.piezas > 0 && soloDigitos(cedula).length >= 6 && datosClienta && llegaAlMinimo && !guardando;

  function cambiar(id: number, cantidad: number) {
    setSeleccion((s) => {
      const nueva = new Map(s);
      if (cantidad <= 0) nueva.delete(id); else nueva.set(id, cantidad);
      return nueva;
    });
  }

  async function vender() {
    setGuardando(true);
    setError(null);
    try {
      const r = await rpcRv<{ id: number; token: string; fase: string }>('rv_vender', {
        p_items: elegidas.map((e) => ({ modelo_id: e.pieza.id, cantidad: e.cantidad })),
        p_cedula: cedula.trim(),
        p_nombre: suya ? null : nombre.trim(),
        p_apellido: suya && suya.apellido ? null : apellido.trim() || null,
        p_telefono: suya && soloDigitos(suya.telefono ?? '').length >= 10 ? null : telefono.trim() || null,
        p_pago: pago ? { metodo, monto: valor, referencia: PIDE_REFERENCIA.includes(metodo) ? referencia.trim() || null : null } : null,
      });
      setHecho({
        token: r.token, fase: r.fase,
        clienta: suya?.nombre ?? nombre.trim(),
        telefono: suya?.telefono ?? telefono.trim(),
      });
      setSeleccion(new Map());
      setCedula(''); setNombre(''); setApellido(''); setTelefono('');
      setPago(false); setMonto(''); setReferencia('');
      void recargar();
      void cargar();
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setGuardando(false);
  }

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Vender</h1>
          <p>Arma un pedido para una clienta tuya, con tus precios. Las piezas se apartan en la tienda.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se hizo el pedido">{error}</Aviso> : null}
      {hecho ? (
        <Aviso tono="exito" titulo="Pedido hecho">
          {hecho.fase === 'por_pagar_lux'
            ? 'Quedó confirmado: págale a Lux desde Pedidos antes de que se venza tu plazo.'
            : `Sus piezas quedan apartadas ${resumen?.horas_pago ?? ''} horas mientras te paga. Mándale su enlace para que vea cómo pagarte.`}
          <span className="acciones" style={{ marginTop: 'var(--e-3)' }}>
            <a
              className="boton boton--secundario boton--pequeno"
              href={enlaceWhatsApp(hecho.telefono, `Hola ${hecho.clienta}, aquí está tu pedido: ${enlaceApartado(hecho.token)}`)}
              target="_blank" rel="noopener noreferrer"
            >
              Mandarle su enlace
            </a>
            <Link className="boton boton--secundario boton--pequeno" to="/rv/apartados">Ver mis pedidos</Link>
          </span>
        </Aviso>
      ) : null}

      <h2 className="seccion-titulo">Piezas</h2>
      <Campo etiqueta="Buscar" htmlFor="vender-buscar">
        <input id="vender-buscar" type="search" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cadena, anillo, choker..." />
      </Campo>
      {visibles.length === 0 ? (
        <Vacio titulo={piezas.length === 0 ? 'No hay piezas en tu catálogo ahora' : 'Nada con ese nombre'}>
          <p>{piezas.length === 0 ? 'Cuando la tienda tenga piezas libres, salen aquí.' : 'Prueba con otra palabra.'}</p>
        </Vacio>
      ) : (
        <div className="lineas-cobro">
          {visibles.map((p) => {
            const foto = urlPublicaFoto(p.foto_thumb_path);
            const cantidad = seleccion.get(p.id) ?? 0;
            const nombreP = nombreConVariante(p.nombre, p.variante);
            return (
              <div className="linea-cobro" key={p.id}>
                {foto ? <img className="linea-cobro__foto" src={foto} alt="" loading="lazy" /> : <span className="linea-cobro__foto" />}
                <div>
                  <div className="linea-cobro__nombre">{nombreP}</div>
                  <div className="linea-cobro__precio">
                    A tu clienta <span className="rv-precio__cifra">{formatearBcv(Number(p.precio_usd))}</span>
                    {' · '}te sale <span className="rv-precio__cifra">{formatearBcv(Number(p.precio_lux_usd))}</span>
                    {' · '}{p.disponible} {p.disponible === 1 ? 'libre' : 'libres'}
                  </div>
                </div>
                <div className="contador">
                  <button type="button" aria-label={`Quitar una de ${nombreP}`} disabled={cantidad === 0} onClick={() => cambiar(p.id, cantidad - 1)}>&minus;</button>
                  <span className="contador__valor">{cantidad}</span>
                  <button type="button" aria-label={`Agregar una de ${nombreP}`} disabled={cantidad >= p.disponible} onClick={() => cambiar(p.id, cantidad + 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cuentas.piezas > 0 ? (
        <div className="total-cobro">
          <div>
            <span className="util secundario">{cuentas.piezas} {cuentas.piezas === 1 ? 'pieza' : 'piezas'}</span>
            <div className="campo__pista">
              Le pagas a Lux {formatearBcv(cuentas.lux)} · ganas {formatearBcv(cuentas.cobras - cuentas.lux)}
            </div>
          </div>
          <div>
            <div className="total-cobro__cifra">{formatearBs(precioEnBs(cuentas.cobras, tasa))}</div>
            <div className="total-cobro__cifra">{formatearBcv(cuentas.cobras)}</div>
          </div>
        </div>
      ) : null}

      <h2 className="seccion-titulo">Para quién</h2>
      <div className="panel">
        <Campo etiqueta="Su cédula" htmlFor="vender-cedula" pista="Con ella la reconoces si ya te compró, y entra a la tienda cuando se apruebe.">
          <input id="vender-cedula" inputMode="numeric" autoComplete="off" value={cedula} onChange={(e) => setCedula(e.target.value)} />
        </Campo>
        {suya ? (
          <p className="prosa">
            Es <strong>{[suya.nombre, suya.apellido].filter(Boolean).join(' ')}</strong>{suya.telefono ? `, ${suya.telefono}` : ''}.
          </p>
        ) : null}
        {!suya || !suya.apellido ? (
          <div className="fila">
            {!suya ? (
              <Campo etiqueta="Nombre" htmlFor="vender-nombre">
                <input id="vender-nombre" autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </Campo>
            ) : null}
            <Campo etiqueta="Apellido" htmlFor="vender-apellido">
              <input id="vender-apellido" autoComplete="off" value={apellido} onChange={(e) => setApellido(e.target.value)} />
            </Campo>
          </div>
        ) : null}
        {!suya || soloDigitos(suya.telefono ?? '').length < 10 ? (
          <Campo etiqueta="Teléfono" htmlFor="vender-telefono">
            <input id="vender-telefono" type="tel" autoComplete="off" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Campo>
        ) : null}
      </div>

      <h2 className="seccion-titulo">¿Ya te pagó?</h2>
      <div className="metodos-pago" role="group" aria-label="Ya te pagó">
        <button type="button" aria-pressed={!pago} onClick={() => setPago(false)}>Todavía no</button>
        <button type="button" aria-pressed={pago} onClick={() => setPago(true)}>Ya me pagó</button>
      </div>
      {!pago ? (
        <p className="campo__pista">
          Sus piezas quedan apartadas {resumen?.horas_pago ?? ''} horas. Le mandas su enlace, ahí ve tus datos de pago y te avisa.
        </p>
      ) : (
        <div className="panel" style={{ marginTop: 'var(--e-4)' }}>
          <div className="fila">
            <div className="campo">
              <label htmlFor="vender-metodo">Cómo te pagó</label>
              <select id="vender-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
                {METODOS_PAGO.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
              </select>
            </div>
            <Campo etiqueta={enDolares ? 'Cuánto · $' : 'Cuánto · Bs'} htmlFor="vender-monto">
              <input id="vender-monto" inputMode="decimal" autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </Campo>
          </div>
          {PIDE_REFERENCIA.includes(metodo) ? (
            <Campo etiqueta="Referencia" htmlFor="vender-ref">
              <input id="vender-ref" inputMode="numeric" autoComplete="off" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </Campo>
          ) : null}
          <p className="campo__pista" aria-live="polite">
            {cuentas.piezas === 0
              ? 'Elige primero las piezas.'
              : tras?.pasa
                ? 'Es más que el total.'
                : !llegaAlMinimo && tasa
                  ? daCredito
                    ? `Para confirmar tiene que pagarte al menos ${formatearBcv(minimo)}, hoy ${formatearBs(bsDeBcv(minimo, tasa.tasa_bcv))}.`
                    : `No tienes días de crédito: tiene que pagarte el total, ${formatearBcv(cuentas.cobras)}.`
                  : tras && tras.falta > 0
                    ? `Te quedará debiendo ${formatearBcv(tras.falta)}, y tiene ${resumen?.dias_credito ?? ''} días para pagarte.`
                    : 'Queda pagado. El pedido se confirma de una vez.'}
          </p>
        </div>
      )}

      <div className="acciones">
        <button type="button" className="boton boton--confirmar" disabled={!listo} onClick={() => void vender()}>
          {guardando ? 'Guardando' : pago ? 'Hacer y confirmar el pedido' : 'Hacer el pedido'}
        </button>
      </div>
      {!listo && !guardando ? (
        <p className="campo__pista">
          {cuentas.piezas === 0 ? 'Falta elegir las piezas.'
            : soloDigitos(cedula).length < 6 ? 'Falta su cédula.'
              : !datosClienta ? 'Faltan sus datos: nombre, apellido y teléfono con el código.'
                : 'Revisa cuánto te pagó.'}
        </p>
      ) : null}
    </div>
  );
}
