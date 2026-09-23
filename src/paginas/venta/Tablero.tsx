import { useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Cargando } from '../../componentes/Piezas';
import { Progreso } from '../../componentes/Progreso';
import { formatearBcv, formatearBs, formatearEntero } from '../../lib/dinero';
import { useSesion } from '../../hooks/useSesion';
import type { MetaVendedora, TableroDia } from '../../lib/tipos';

const piezas = (n: number) => `${formatearEntero(n)} ${n === 1 ? 'pieza' : 'piezas'}`;

/**
 * El tablero del día de la vendedora.
 *
 * LA META SALE DE LAS CUENTAS. Es la misma que ve el dueño en Costos: las
 * piezas que la tienda tiene que vender en el mes para cubrir sus gastos y
 * dejar la ganancia que busca, repartidas entre los días que abre. Si él
 * sube un gasto o cambia su meta, la de ella cambia sola. Antes era un 4
 * escrito al instalar, sin relación con nada.
 *
 * EL DÍA Y EL MES. La meta de verdad es la del mes: de ahí sale la del
 * día. Por eso se ven las dos, y cómo va el mes a este paso. Un día flojo
 * no es un problema si el mes va bien, y al revés.
 *
 * LAS PIEZAS DE LA TIENDA, EL DINERO DE ELLA. La meta es de la tienda, así
 * que su avance cuenta todo lo que se vendió hoy, lo haya cobrado quien lo
 * haya cobrado. Lo vendido y el ticket promedio son de ella.
 *
 * Existe también para empujar el TICKET, no solo el conteo: cuatro anillos
 * baratos cumplen el número y fallan en plata. Por eso sigue la meta de
 * piezas premium, que ahora el dueño fija en Costos.
 *
 * Ni una cifra de costo ni de ganancia. `meta_vendedora()` devuelve piezas
 * y fechas, nada más.
 */
export function Tablero() {
  const { perfil } = useSesion();
  const [dato, setDato] = useState<TableroDia | null>(null);
  const [meta, setMeta] = useState<MetaVendedora | null>(null);
  const [premiumDesde, setPremiumDesde] = useState<number | null>(null);
  const [metaPremium, setMetaPremium] = useState(0);
  const [rebajaMax, setRebajaMax] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!perfil) return;
    void (async () => {
      setCargando(true);
      const [tab, cfg, m] = await Promise.all([
        // Filtrado por ella: si el dueño abre esta pantalla, la vista le
        // devolvería una fila por persona que vendió hoy.
        supabase.from('v_tablero_dia').select('*').eq('usuario_id', perfil.id).maybeSingle(),
        supabase.from('configuracion').select('clave, valor')
          .in('clave', ['premium_min_usd', 'meta_premium_dia', 'descuento_max_mostrador_pct']),
        supabase.rpc('meta_vendedora'),
      ]);
      // Tres consultas, tres errores mirados.
      const fallo = tab.error ?? cfg.error ?? m.error;
      setError(fallo ? mensajeDeError(fallo) : null);
      setDato((tab.data as TableroDia | null) ?? null);
      const valores = new Map(((cfg.data as { clave: string; valor: number }[] | null) ?? []).map((f) => [f.clave, Number(f.valor)]));
      setPremiumDesde(valores.get('premium_min_usd') ?? null);
      setMetaPremium(valores.get('meta_premium_dia') ?? 0);
      setRebajaMax(valores.get('descuento_max_mostrador_pct') ?? null);
      setMeta(((m.data as MetaVendedora[] | null) ?? [])[0] ?? null);
      setCargando(false);
    })();
  }, [perfil]);

  if (cargando) return <Cargando texto="Armando tu día" />;

  const premium = dato?.piezas_premium ?? 0;
  const hoy = meta?.vendidas_hoy ?? dato?.piezas ?? 0;
  const metaHoy = meta?.meta_hoy ?? null;
  const metaMes = meta?.meta_mes ?? null;
  const para = meta?.para === 'meta'
    ? 'para cubrir los gastos del mes y dejar la ganancia que busca la tienda'
    : 'para cubrir los gastos del mes';

  return (
    <div className="pagina pagina--angosta mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Tu día</h1>
          <p>{perfil?.nombre ?? ''} · cómo va la tienda y lo que llevas vendido.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo leer el tablero">{error}</Aviso> : null}

      {/* --------------------------------------------- la meta de hoy */}

      {metaHoy !== null ? (
        <section className="tarjeta plan" aria-labelledby="meta-hoy">
          <span className="panel__titulo" id="meta-hoy">La meta de hoy</span>
          <div>
            <div className="plan__numero">{formatearEntero(hoy)} <span className="plan__de">de {formatearEntero(metaHoy)}</span></div>
            <div className="plan__unidad">piezas vendidas hoy</div>
          </div>
          <Progreso titulo="Hoy" pct={(hoy / metaHoy) * 100} />
          <p className={hoy >= metaHoy ? 'plan__ritmo plan__ritmo--bien' : 'plan__ritmo'}>
            {hoy >= metaHoy
              ? <><strong>Meta de hoy cumplida.</strong> Todo lo que venga ahora adelanta el mes.</>
              : <>Faltan <strong>{piezas(metaHoy - hoy)}</strong> para la meta de hoy.</>}
          </p>
        </section>
      ) : metaMes !== null ? (
        <Aviso tono="alerta" titulo="Todavía no hay meta por día">
          La tienda tiene que vender {piezas(metaMes)} este mes. La meta de cada día aparece cuando
          el dueño diga cuántos días abre la tienda.
        </Aviso>
      ) : null}

      {/* ---------------------------------------------------- el mes */}

      {metaMes !== null && meta ? (
        <section className="tarjeta plan" aria-labelledby="meta-mes" style={{ marginTop: 'var(--e-4)' }}>
          <span className="panel__titulo" id="meta-mes">El mes</span>
          <Progreso
            titulo={`Van ${formatearEntero(meta.vendidas_mes)} de ${formatearEntero(metaMes)} piezas`}
            pct={(meta.vendidas_mes / metaMes) * 100}
            pie={`Día ${meta.dia_del_mes} de ${meta.dias_del_mes} · ${para}`}
          />
          {meta.vendidas_mes === 0 ? (
            <p className="plan__ritmo">Todavía no hay ventas este mes.</p>
          ) : meta.ritmo_mes !== null ? (
            <p className={meta.ritmo_mes >= metaMes ? 'plan__ritmo plan__ritmo--bien' : 'plan__ritmo'}>
              A este paso el mes cierra en <strong>{piezas(meta.ritmo_mes)}</strong>
              {meta.ritmo_mes >= metaMes
                ? ': la tienda llega a la meta.'
                : `: faltarían ${piezas(metaMes - meta.ritmo_mes)}.`}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------ lo de ella */}

      <h2 className="seccion-titulo">Lo que llevas tú</h2>
      <div className="tablero">
        <div className="tablero__celda">
          <span className="dato__etiqueta">
            Premium{premiumDesde !== null ? ` · desde ${formatearBcv(premiumDesde, 0)}` : ''}
          </span>
          <div className="tablero__cifra">{formatearEntero(premium)}</div>
          {metaPremium > 0 ? (
            <div className="tablero__meta">
              {premium >= metaPremium ? 'Meta premium cumplida' : `Faltan ${metaPremium - premium} para la meta premium`}
            </div>
          ) : null}
        </div>

        {/* Bolivares y dolares BCV del mismo tamaño, como en las etiquetas. */}
        <div className="tablero__celda">
          <span className="dato__etiqueta">Vendiste hoy</span>
          <div className="tablero__cifra tablero__cifra--dinero">{formatearBs(dato?.total_bs ?? 0)}</div>
          <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(dato?.total_bcv ?? 0)}</div>
          <div className="tablero__meta">{dato?.ventas ?? 0} venta{(dato?.ventas ?? 0) === 1 ? '' : 's'}</div>
        </div>

        <div className="tablero__celda">
          <span className="dato__etiqueta">Ticket promedio</span>
          <div className="tablero__cifra tablero__cifra--dinero">{formatearBs(dato?.ticket_promedio_bs ?? 0)}</div>
          <div className="tablero__cifra tablero__cifra--dinero">{formatearBcv(dato?.ticket_promedio_bcv ?? 0)}</div>
          <div className="tablero__meta">lo que se lleva cada clienta, en promedio</div>
        </div>
      </div>

      {/* Lo que puede jugar para cerrar una venta. El numero exacto de cada
          pieza lo ve en el cobro, al tocar su precio. */}
      {rebajaMax !== null && rebajaMax > 0 ? (
        <div className="panel" style={{ marginTop: 'var(--e-5)' }}>
          <span className="panel__titulo">Para negociar</span>
          <p className="prosa" style={{ margin: 0 }}>
            Puedes rebajar hasta <strong style={{ display: 'inline' }}>{formatearEntero(rebajaMax)} %</strong> de
            la etiqueta para cerrar una venta. En algunas piezas un poco menos: el sistema no deja
            bajar de su mínimo. Al cobrar, cada pieza te dice cuánto admite.
          </p>
        </div>
      ) : null}

      <Ayuda titulo="De dónde sale la meta">
        <p>
          La tienda tiene gastos que se pagan venda o no venda: alquiler, sueldos, servicios.
          La meta del mes son las piezas que hay que vender para cubrirlos y dejar la ganancia
          que busca la tienda. La de hoy es esa misma, repartida entre los días que abre.
        </p>
        <p>
          No es un número puesto a ojo: si se venden piezas más caras, cada una deja más y hacen
          falta menos. Por eso cuenta tanto la meta premium como la de piezas.
        </p>
      </Ayuda>
    </div>
  );
}
