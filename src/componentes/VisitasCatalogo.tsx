import { useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { formatearEntero } from '../lib/dinero';
import type { VisitaDia } from '../lib/tipos';

const DIAS = 30;

function suma(dias: VisitaDia[], campo: 'visitantes' | 'veces' | 'pedidos'): number {
  return dias.reduce((n, d) => n + Number(d[campo]), 0);
}

function pedidos(n: number): string {
  return n === 1 ? '1 pedido' : `${formatearEntero(n)} pedidos`;
}

/**
 * Cuántas personas abren el catálogo en línea, y cuántas terminan en
 * pedido. Lo ven las dos caras: es la respuesta a "¿mandar el enlace sirve?"
 * y no lleva una sola cifra de dinero.
 *
 * Una visita es un teléfono en un día (esquema-visitas-catalogo.sql): la
 * clienta que recarga diez veces cuenta una, y la que vuelve mañana cuenta
 * otra.
 */
export function VisitasCatalogo() {
  const [dias, setDias] = useState<VisitaDia[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase.rpc('visitas_catalogo', { p_dias: DIAS });
      if (err) setError(mensajeDeError(err));
      else setDias((data as VisitaDia[] | null) ?? []);
    })();
  }, []);

  if (error) {
    return <p className="campo__error" role="alert">No se pudieron leer las visitas del catálogo: {error}</p>;
  }
  if (!dias) return null;

  // Vienen de hoy hacia atrás, con los días sin visitas en cero.
  const hoy = dias[0];
  const ayer = dias[1];
  const semana = dias.slice(0, 7);

  return (
    <section aria-labelledby="visitas-titulo" style={{ marginBottom: 'var(--e-5)' }}>
      <h2 className="seccion-titulo" id="visitas-titulo">Visitas al catálogo en línea</h2>
      <div className="tablero">
        <div className="tablero__celda">
          <span className="dato__etiqueta">Hoy</span>
          <div className="tablero__cifra">{formatearEntero(hoy?.visitantes ?? 0)}</div>
          <div className="tablero__meta">
            {ayer ? `ayer ${formatearEntero(ayer.visitantes)}` : null}
            {hoy && hoy.pedidos > 0 ? ` · ${pedidos(hoy.pedidos)} hoy` : null}
          </div>
        </div>
        <div className="tablero__celda">
          <span className="dato__etiqueta">Últimos 7 días</span>
          <div className="tablero__cifra">{formatearEntero(suma(semana, 'visitantes'))}</div>
          <div className="tablero__meta">{pedidos(suma(semana, 'pedidos'))} por el catálogo</div>
        </div>
        <div className="tablero__celda">
          <span className="dato__etiqueta">Últimos {DIAS} días</span>
          <div className="tablero__cifra">{formatearEntero(suma(dias, 'visitantes'))}</div>
          <div className="tablero__meta">{pedidos(suma(dias, 'pedidos'))} por el catálogo</div>
        </div>
      </div>
      <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
        Cada teléfono cuenta una vez por día, aunque lo abra varias veces
        {hoy && hoy.veces > hoy.visitantes ? ` (hoy lo abrieron ${formatearEntero(hoy.veces)} veces)` : ''}.
        Cuando alguien de la tienda lo abre con su sesión, no cuenta.
      </p>
    </section>
  );
}
