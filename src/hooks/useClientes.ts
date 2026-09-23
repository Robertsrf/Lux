import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import type { ClienteResumen, CompraCliente } from '../lib/tipos';

const COLUMNAS =
  'id, cedula, cedula_digitos, nombre, apellido, nombre_completo, telefono, notas, creado_en,'
  + ' compras, piezas, total_usd, primera_compra, ultima_compra, servicio_hasta, servicio_vigente';

/** Lo que PostgREST interpreta dentro de un `or()`: fuera antes de preguntar. */
const limpiar = (s: string) => s.trim().replace(/[%,()]/g, ' ');
const soloDigitos = (s: string) => s.replace(/[^0-9]/g, '');

/**
 * Buscar una clienta por cedula o por nombre.
 *
 * Los dos criterios van en la MISMA consulta: ella escribe en un solo campo
 * y no tiene que decidir si lo que trae en la mano es un nombre o una
 * cedula. La cedula se compara por digitos, asi que "V-12.345.678",
 * "12345678" y "12.345.678" encuentran a la misma persona.
 *
 * Sin texto, la lista trae las ultimas que compraron. Es lo mas util que se
 * puede enseñar antes de que escriba nada: casi siempre la que vuelve
 * compro hace poco.
 */
export function useBuscarClientes(limite = 30, soloConTexto = false) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ClienteResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    const t = limpiar(texto);
    const digitos = soloDigitos(t);

    // En medio del cobro no se piden treinta fichas para no enseñar
    // ninguna: alli la lista solo aparece cuando ella escribe.
    if (soloConTexto && !t) {
      setResultados([]); setError(null); setCargando(false);
      return;
    }
    setCargando(true);

    let consulta = supabase
      .from('v_clientes')
      .select(COLUMNAS)
      .order('ultima_compra', { ascending: false, nullsFirst: false })
      .limit(limite);

    if (t) {
      const partes = [`nombre_completo.ilike.%${t}%`];
      if (digitos) partes.push(`cedula_digitos.ilike.%${digitos}%`);
      consulta = consulta.or(partes.join(','));
    }

    const { data, error: err } = await consulta;
    setError(err ? mensajeDeError(err) : null);
    setResultados((data as ClienteResumen[] | null) ?? []);
    setCargando(false);
  }, [texto, limite, soloConTexto]);

  useEffect(() => {
    const id = setTimeout(() => void buscar(), texto ? 300 : 0);
    return () => clearTimeout(id);
  }, [buscar, texto]);

  return { texto, setTexto, resultados, cargando, error, recargar: buscar };
}

/**
 * La ficha de una clienta y todo lo que se ha llevado.
 *
 * Son dos consultas y se miran LOS DOS errores. Mirar solo la primera es
 * como se perdieron los descuentos al mayor durante semanas: la segunda
 * fallaba, el `?? []` la dejaba vacia y la pantalla se veia perfecta.
 */
export function useCliente(id: number | null) {
  const [cliente, setCliente] = useState<ClienteResumen | null>(null);
  const [compras, setCompras] = useState<CompraCliente[]>([]);
  // Sin id no hay nada que abrir: la ficha en blanco no pasa por "Cargando".
  const [cargando, setCargando] = useState(id !== null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (id === null) { setCliente(null); setCompras([]); setCargando(false); return; }
    setCargando(true);

    const [ficha, historico] = await Promise.all([
      supabase.from('v_clientes').select(COLUMNAS).eq('id', id).maybeSingle(),
      supabase.from('v_cliente_compras').select('*').eq('cliente_id', id)
        .order('fecha', { ascending: false }),
    ]);

    if (ficha.error) setError(mensajeDeError(ficha.error));
    else if (historico.error) setError(mensajeDeError(historico.error));
    else setError(null);

    setCliente((ficha.data as ClienteResumen | null) ?? null);
    setCompras((historico.data as CompraCliente[] | null) ?? []);
    setCargando(false);
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  /**
   * Las compras agrupadas por venta: es como ocurrieron y como ella las
   * cuenta. Una fila por pieza sirve a la base; a la vendedora le sirve
   * "el 4 de agosto se llevo tres cosas".
   */
  const ventas = useMemo(() => {
    const mapa = new Map<number, { cabecera: CompraCliente; piezas: CompraCliente[] }>();
    for (const c of compras) {
      const g = mapa.get(c.venta_id);
      if (g) g.piezas.push(c);
      else mapa.set(c.venta_id, { cabecera: c, piezas: [c] });
    }
    return [...mapa.values()];
  }, [compras]);

  return { cliente, compras, ventas, cargando, error, recargar: cargar };
}

export interface DatosCliente {
  id?: number | null;
  cedula?: string | null;
  nombre: string;
  apellido?: string | null;
  telefono?: string | null;
  notas?: string | null;
}

/** Crear o corregir una ficha. La validacion que manda vive en la base. */
export async function guardarCliente(datos: DatosCliente) {
  const { data, error } = await supabase.rpc('guardar_cliente', {
    p_id: datos.id ?? null,
    p_cedula: datos.cedula ?? null,
    p_nombre: datos.nombre,
    p_apellido: datos.apellido ?? null,
    p_telefono: datos.telefono ?? null,
    p_notas: datos.notas ?? null,
  });
  if (error) return { ok: false as const, error: mensajeDeError(error) };
  return { ok: true as const, id: data as number };
}

/** Cuantos meses de lavado y abrillantado da cada compra. Lo fija el dueno. */
export function useMesesServicio() {
  const [meses, setMeses] = useState<number | null>(null);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('meses_servicio');
      if (typeof data === 'number') setMeses(data);
    })();
  }, []);
  return meses;
}
