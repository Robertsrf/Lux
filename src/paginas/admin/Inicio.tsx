import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando } from '../../componentes/Piezas';
import { Banda } from '../../componentes/Banda';
import { Icono } from '../../componentes/Iconos';
import { useTasa } from '../../hooks/useTasa';
import { pendientesDeInicio } from '../../lib/inicio';
import type { ResumenInicio } from '../../lib/inicio';
import {
  fechaVenezuelaMas, formatearBcv, formatearEntero, formatearPorcentaje, formatearTasa, sumarCifras,
} from '../../lib/dinero';

interface Cobertura {
  cubierto_pct: number | null;
  piezas_vendidas: number | null;
  piezas_faltantes: number | null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Inicio del administrador (fase 9): lo que le toca hacer hoy y cómo va el
 * mes. Nada se cuenta aquí: "Para hoy" sale de `admin_inicio()` (#76), lo
 * vendido de `v_ventas_por_dia`, lo cubierto de `v_cobertura_mes` (con el
 * plan de Costos) y "Si se vende todo" de `admin_flujo()` (#75).
 *
 * Sin el #76, la banda sale igual y "Para hoy" dice que falta instalarlo.
 */
export function Inicio() {
  const { tasa } = useTasa();
  const [resumen, setResumen] = useState<ResumenInicio | null>(null);
  const [falta76, setFalta76] = useState(false);
  const [vendidoMes, setVendidoMes] = useState<number | null>(null);
  const [cobertura, setCobertura] = useState<Cobertura | null>(null);
  const [siSeVende, setSiSeVende] = useState<number | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);

  const hoy = fechaVenezuelaMas(0);
  const desde = `${hoy.slice(0, 8)}01`;

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const [ini, ventas, cob, flujo] = await Promise.all([
        supabase.rpc('admin_inicio'),
        supabase.from('v_ventas_por_dia').select('total_usd').gte('dia', desde),
        supabase.from('v_cobertura_mes').select('cubierto_pct, piezas_vendidas, piezas_faltantes').maybeSingle(),
        supabase.rpc('admin_flujo', {}),
      ]);
      if (!vigente) return;
      const mal: string[] = [];
      // Cuatro consultas, cuatro errores que mirar (Trampas: "si lanzas N
      // consultas, miras N errores").
      if (ini.error) {
        if (ini.error.code === 'PGRST202' || ini.error.code === '42883') setFalta76(true);
        else mal.push(mensajeDeError(ini.error));
      } else setResumen(ini.data as ResumenInicio);
      if (ventas.error) mal.push(mensajeDeError(ventas.error));
      else setVendidoMes(sumarCifras(((ventas.data as { total_usd: number }[] | null) ?? []).map((v) => Number(v.total_usd))));
      if (cob.error) mal.push(mensajeDeError(cob.error));
      else setCobertura((cob.data as Cobertura | null) ?? null);
      if (flujo.error) mal.push(mensajeDeError(flujo.error));
      else {
        const fila = ((flujo.data as { concepto: string; bcv: number }[] | null) ?? []).find((f) => f.concepto === 'si_se_vende');
        setSiSeVende(fila ? Number(fila.bcv) : null);
      }
      setErrores(mal);
      setCargando(false);
    })();
    return () => { vigente = false; };
  }, [desde]);

  // Todos los useMemo antes del primer return (React 310).
  const pendientes = useMemo(() => pendientesDeInicio(resumen), [resumen]);
  const mes = MESES[Number(hoy.slice(5, 7)) - 1] ?? '';

  if (cargando) return <div className="pagina"><Cargando texto="Abriendo el Inicio" /></div>;

  const cubierto = cobertura?.cubierto_pct == null ? null : Number(cobertura.cubierto_pct);

  return (
    <div className="pagina inicio">
      <header className="encabezado-pagina">
        <div>
          <h1>Inicio</h1>
          <p>Lo que te toca hoy y cómo va el mes.</p>
        </div>
        {tasa ? (
          <p className="inicio__tasa cifra">BCV {formatearTasa(tasa.tasa_bcv)} · Binance {formatearTasa(tasa.tasa_venta)}</p>
        ) : null}
      </header>

      {errores.map((e) => <Aviso key={e} tono="error">{e}</Aviso>)}

      <Banda
        etiqueta={`${mes.charAt(0).toUpperCase()}${mes.slice(1)}, hasta hoy`}
        cifra={vendidoMes == null ? '—' : formatearBcv(vendidoMes).replace(/\s*BCV$/, '')}
        moneda="BCV vendido"
        progreso={cubierto == null ? null : {
          texto: 'Gastos del mes cubiertos · con el plan de Costos',
          valor: formatearPorcentaje(cubierto, 0),
          pct: cubierto,
        }}
        detalle={cobertura?.piezas_faltantes
          ? `Faltan ${formatearEntero(Number(cobertura.piezas_faltantes))} piezas para cubrir el mes.`
          : null}
        cuadritos={[
          ...(cobertura?.piezas_vendidas == null ? [] : [{ etiqueta: 'Piezas vendidas', valor: formatearEntero(Number(cobertura.piezas_vendidas)) }]),
          ...(siSeVende == null ? [] : [{
            etiqueta: 'Si se vende todo',
            valor: <Link to="/admin/flujo" className="inicio__enlace-banda">{formatearBcv(siSeVende)} ›</Link>,
          }]),
        ]}
      />

      <section className="para-hoy" aria-labelledby="para-hoy-titulo">
        <h2 id="para-hoy-titulo">Para hoy</h2>
        {falta76 ? (
          <Aviso tono="alerta">Falta instalar el SQL #76 (esquema-inicio-y-rastro.sql): sin él, aquí no sale lo pendiente.</Aviso>
        ) : pendientes.length === 0 ? (
          <p className="para-hoy__nada">Nada pendiente por ahora.</p>
        ) : (
          <ul className="para-hoy__lista">
            {pendientes.map((p) => (
              <li key={p.clave}>
                <Link to={p.a} className={p.urgente ? 'para-hoy__fila para-hoy__fila--urgente' : 'para-hoy__fila'}>
                  <span className="para-hoy__cuantos cifra" aria-hidden="true">{p.cuantos}</span>
                  <span className="para-hoy__texto">
                    <span className="para-hoy__que">{p.texto}</span>
                    {p.detalle ? <span className="para-hoy__detalle">{p.detalle}</span> : null}
                  </span>
                  <Icono nombre="adelante" className="icono icono--sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
