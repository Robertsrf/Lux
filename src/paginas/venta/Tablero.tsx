import { useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando } from '../../componentes/Piezas';
import { formatearBs, formatearEntero } from '../../lib/dinero';
import { useSesion } from '../../hooks/useSesion';
import type { TableroDia } from '../../lib/tipos';

/**
 * Tablero del dia de la vendedora.
 *
 * Existe para empujar el TICKET PROMEDIO, no el conteo de piezas: vender
 * cuatro anillos baratos cumple el numero y falla en plata. Por eso la meta
 * son dos cifras, piezas y cuantas de esas fueron premium.
 *
 * Ni una cifra de costo ni de ganancia. Eso es del dueno.
 */
export function Tablero() {
  const { perfil } = useSesion();
  const [dato, setDato] = useState<TableroDia | null>(null);
  const [metas, setMetas] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      const [tab, cfg] = await Promise.all([
        supabase.from('v_tablero_dia').select('*').maybeSingle(),
        supabase.from('configuracion').select('clave, valor'),
      ]);
      if (tab.error) setError(mensajeDeError(tab.error));
      setDato((tab.data as TableroDia | null) ?? null);
      const m: Record<string, number> = {};
      for (const f of (cfg.data as { clave: string; valor: number }[] | null) ?? []) m[f.clave] = Number(f.valor);
      setMetas(m);
      setCargando(false);
    })();
  }, []);

  if (cargando) return <Cargando texto="Armando el tablero" />;

  const piezas = dato?.piezas ?? 0;
  const premium = dato?.piezas_premium ?? 0;
  const metaPiezas = metas['meta_piezas_dia'] ?? 0;
  const metaPremium = metas['meta_premium_dia'] ?? 0;
  const minPremium = metas['premium_min_usd'] ?? 20;

  return (
    <div className="pagina pagina--angosta mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Tu dia</h1>
          <p>{perfil?.nombre ?? ''} · lo que llevas vendido hoy.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo leer el tablero">{error}</Aviso> : null}

      <div className="tablero">
        <div className="tablero__celda">
          <span className="dato__etiqueta">Piezas</span>
          <div className="tablero__cifra">{formatearEntero(piezas)}</div>
          {metaPiezas > 0 ? (
            <div className="tablero__meta">
              {piezas >= metaPiezas ? 'Meta del dia cumplida' : `Faltan ${metaPiezas - piezas} para la meta`}
            </div>
          ) : null}
        </div>

        <div className="tablero__celda">
          <span className="dato__etiqueta">De ${formatearEntero(minPremium)} o mas</span>
          <div className="tablero__cifra">{formatearEntero(premium)}</div>
          {metaPremium > 0 ? (
            <div className="tablero__meta">
              {premium >= metaPremium ? 'Meta premium cumplida' : `Faltan ${metaPremium - premium} para la meta`}
            </div>
          ) : null}
        </div>

        <div className="tablero__celda">
          <span className="dato__etiqueta">Ticket promedio</span>
          <div className="tablero__cifra" style={{ fontSize: 'var(--t-28)' }}>
            {formatearBs(dato?.ticket_promedio_bs ?? 0)}
          </div>
          <div className="tablero__meta">{dato?.ventas ?? 0} venta{(dato?.ventas ?? 0) === 1 ? '' : 's'}</div>
        </div>

        <div className="tablero__celda">
          <span className="dato__etiqueta">Cobrado hoy</span>
          <div className="tablero__cifra" style={{ fontSize: 'var(--t-28)' }}>
            {formatearBs(dato?.total_bs ?? 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
