import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Aviso, Cargando } from '../../../componentes/Piezas';
import { leerCifra, precioEnBs } from '../../../lib/dinero';
import { rpcRv } from '../../../lib/revendedor';
import { useTasa } from '../../../hooks/useTasa';
import { PIDE_REFERENCIA } from '../../../lib/tipos';
import type { ClienteRevendedor, PiezaRevendedor } from '../../../lib/tipos';
import { textoDeError, usePanelRv } from '../contexto';
import { conciliarCarrito, cuentasDe, faltaParaSeguir } from './vender/cuentas';
import type { EstadoVender } from './vender/cuentas';
import { PasoPiezas } from './vender/PasoPiezas';
import { PasoClienta } from './vender/PasoClienta';
import { PasoCobro } from './vender/PasoCobro';
import { BarraVender } from './vender/BarraVender';
import { Listo } from './vender/Listo';
import type { VentaHecha } from './vender/Listo';
import './vender/vender.css';

const CLAVE = 'lux-rv-vender-v1';
const PASOS = ['Piezas', 'Clienta', 'Cobro'] as const;
const vacio = (): EstadoVender => ({
  carrito: new Map(), clientaId: null, nueva: { nombre: '', telefono: '', apellido: '', cedula: '' },
  cobro: null, metodo: 'pago_movil', monto: '', referencia: '',
});

/** Lo que dejó a medias en este teléfono (cambió de pantalla o recargó). */
function leerGuardado(): EstadoVender {
  try {
    const g = JSON.parse(window.sessionStorage.getItem(CLAVE) ?? 'null') as (Partial<EstadoVender> & { carrito?: unknown }) | null;
    if (!g || typeof g !== 'object') return vacio();
    const lineas = Array.isArray(g.carrito) ? g.carrito : [];
    const carrito = new Map<number, number>(
      lineas.filter((x): x is [number, number] => Array.isArray(x) && Number.isInteger(x[0]) && Number.isInteger(x[1]) && x[1] > 0),
    );
    return { ...vacio(), ...g, nueva: { ...vacio().nueva, ...(g.nueva ?? {}) }, carrito };
  } catch {
    return vacio();
  }
}
function guardar(e: EstadoVender | null) {
  try {
    if (e) window.sessionStorage.setItem(CLAVE, JSON.stringify({ ...e, carrito: [...e.carrito] }));
    else window.sessionStorage.removeItem(CLAVE);
  } catch { /* sin almacenamiento: el carrito vive mientras la pantalla esté abierta */ }
}

/**
 * Vender desde su panel, en tres pasos (fase 7): piezas → clienta → cobro,
 * con el total siempre a la vista. Es el mismo pedido que su clienta haría
 * desde su catálogo (`rv_vender`): toma primero de lo suyo y aparta lo
 * demás de la tienda. El paso va en la ruta, así "atrás" vuelve un paso.
 */
export function VenderRv() {
  const { siSeCerro, recargar, resumen } = usePanelRv();
  const { tasa } = useTasa();
  const [params, setParams] = useSearchParams();
  const [piezas, setPiezas] = useState<PiezaRevendedor[]>([]);
  const [clientas, setClientas] = useState<ClienteRevendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoVender>(leerGuardado);
  const [guardando, setGuardando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [hecho, setHecho] = useState<VentaHecha | null>(null);
  const enviando = useRef(false);
  const concilio = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([rpcRv<PiezaRevendedor[]>('rv_piezas'), rpcRv<ClienteRevendedor[]>('rv_clientes')]);
      setPiezas(p ?? []);
      setClientas(c ?? []);
      setErrorCarga(null);
    } catch (e) {
      if (!siSeCerro(e)) setErrorCarga(textoDeError(e));
    }
    setCargando(false);
  }, [siSeCerro]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { if (!hecho) guardar(estado); }, [estado, hecho]);

  // El carrito guardado, contra lo que hay ahora: una vez, con las piezas ya traídas.
  useEffect(() => {
    if (cargando || errorCarga || concilio.current) return;
    concilio.current = true;
    const r = conciliarCarrito(piezas, estado.carrito);
    if (!r.quitadas.length && !r.bajadas.length) return;
    setEstado((e) => ({ ...e, carrito: r.carrito }));
    setAviso([
      r.quitadas.length ? `Ya no están libres: ${r.quitadas.join(', ')}.` : '',
      r.bajadas.length ? `Quedan menos de las que tenías: ${r.bajadas.join(', ')}.` : '',
    ].join(' ').trim());
  }, [cargando, errorCarga, piezas, estado.carrito]);

  const cuentas = useMemo(() => cuentasDe(piezas, estado.carrito), [piezas, estado.carrito]);
  const elegida = useMemo(() => clientas.find((c) => c.id === estado.clientaId) ?? null, [clientas, estado.clientaId]);
  const pedido = Number(params.get('paso'));
  const paso: 1 | 2 | 3 = cuentas.piezas === 0 ? 1 : pedido === 2 ? 2 : pedido === 3 ? 3 : 1;
  const reglas = { dias_credito: resumen?.dias_credito, inicial_pct: resumen?.inicial_pct };
  const falta = faltaParaSeguir(paso, estado, reglas, tasa, cuentas.cobras, elegida);
  // "?paso=2" sin piezas vuelve a la ruta del paso 1 (si no, sumar una pieza saltaría de paso).
  useEffect(() => {
    if (!cargando && cuentas.piezas === 0 && params.get('paso')) setParams({}, { replace: true });
  }, [cargando, cuentas.piezas, params, setParams]);

  if (cargando) return <Cargando texto="Buscando tus piezas" />;

  const cambiar = (cambio: Partial<EstadoVender>) => { setEstado((e) => ({ ...e, ...cambio })); setErrorEnvio(null); };
  const cambiarCarrito = (id: number, n: number) => setEstado((e) => {
    const carrito = new Map(e.carrito);
    if (n <= 0) carrito.delete(id); else carrito.set(id, n);
    // Con otro total, lo que pagó se vuelve a elegir.
    return { ...e, carrito, ...(e.cobro === 'todo' || e.cobro === 'parte' ? { cobro: null, monto: '' } : {}) };
  });
  const irA = (n: 1 | 2 | 3) => {
    setParams(n === 1 ? {} : { paso: String(n) });
    window.scrollTo(0, 0);
  };
  const venderOtra = () => {
    guardar(null);
    setEstado(vacio());
    setHecho(null);
    setParams({}, { replace: true });
  };

  async function vender() {
    if (enviando.current) return;
    enviando.current = true;
    setGuardando(true);
    setErrorEnvio(null);
    const pago = estado.cobro === 'todo' || estado.cobro === 'parte';
    const telefono = elegida ? (estado.nueva.telefono.trim() || elegida.telefono || '') : estado.nueva.telefono.trim();
    try {
      const r = await rpcRv<{ id: number; token: string; fase: string }>('rv_vender', {
        p_items: [...estado.carrito].map(([modelo_id, cantidad]) => ({ modelo_id, cantidad })),
        p_cedula: elegida ? null : estado.nueva.cedula.trim() || null,
        p_nombre: elegida ? null : estado.nueva.nombre.trim(),
        p_apellido: elegida ? null : estado.nueva.apellido.trim() || null,
        p_telefono: elegida ? estado.nueva.telefono.trim() || null : telefono,
        p_pago: pago ? {
          metodo: estado.metodo,
          monto: leerCifra(estado.monto),
          referencia: PIDE_REFERENCIA.includes(estado.metodo) ? estado.referencia.trim() || null : null,
        } : null,
        p_cliente_id: elegida?.id ?? null,
      });
      guardar(null);
      setHecho({
        token: r.token, fase: r.fase, telefono, lux: cuentas.lux, cobro: estado.cobro ?? 'no',
        clienta: elegida?.nombre ?? estado.nueva.nombre.trim(),
      });
      setEstado(vacio());
      void recargar();
      void cargar();
    } catch (e) {
      if (!siSeCerro(e)) setErrorEnvio(textoDeError(e));
    }
    enviando.current = false;
    setGuardando(false);
  }

  if (hecho) {
    return <div className="pagina vrv"><Listo hecho={hecho} resumen={resumen} alVenderOtra={venderOtra} /></div>;
  }

  const boton = paso < 3 ? 'Seguir' : estado.cobro === 'todo' || estado.cobro === 'parte' ? 'Hacer y confirmar' : 'Hacer el pedido';
  return (
    <div className="pagina vrv">
      <h1 className="visualmente-oculto">Vender</h1>
      <ol className="vrv-pasos">
        {PASOS.map((nombre, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          if (n < paso) return <li key={nombre}><button type="button" onClick={() => irA(n)}>{n}. {nombre}</button></li>;
          return <li key={nombre} aria-current={n === paso ? 'step' : undefined}><span>{n}. {nombre}</span></li>;
        })}
      </ol>
      {errorCarga ? <Aviso tono="error" titulo="No llegaron tus piezas">{errorCarga}</Aviso> : null}
      {aviso ? <Aviso tono="alerta" titulo="Tu pedido cambió">{aviso}</Aviso> : null}
      {errorEnvio ? (
        <Aviso tono="error" titulo="No se hizo el pedido">
          {errorEnvio} Lo que escribiste sigue aquí.
          <span className="acciones"><button type="button" className="boton boton--secundario boton--pequeno" disabled={guardando} onClick={() => void vender()}>Intentar otra vez</button></span>
        </Aviso>
      ) : null}

      {paso === 1 ? <PasoPiezas piezas={piezas} carrito={estado.carrito} alCambiar={cambiarCarrito} /> : null}
      {paso === 2 ? <PasoClienta clientas={clientas} estado={estado} elegida={elegida} alCambiar={cambiar} /> : null}
      {paso === 3 ? (
        <PasoCobro
          estado={estado} total={cuentas.cobras} lux={cuentas.lux} todasTuyas={cuentas.todasTuyas}
          tasa={tasa} resumen={resumen} alCambiar={cambiar}
        />
      ) : null}

      <BarraVender
        piezas={cuentas.piezas} total={cuentas.cobras} totalBs={precioEnBs(cuentas.cobras, tasa)}
        boton={boton} falta={falta} guardando={guardando}
        alSeguir={() => (paso < 3 ? irA((paso + 1) as 2 | 3) : void vender())}
      />
    </div>
  );
}
