import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../../lib/supabase';
import { totalDeLineas } from '../../../lib/dinero';
import { fuenteFoto, urlPublicaFoto } from '../../../lib/fotos';
import { agruparPorFamilia, conFoto, porCategoria } from '../../../lib/familias';
import { armar, paresVigentes } from '../../../lib/armados';
import type { ParArmado } from '../../../lib/armados';
import { enlaceCatalogoRv } from '../../../lib/revendedor';
import { enlaceWhatsAppA } from '../../../lib/enlaces';
import { paraDeRuta, paraQueVe, type Para } from '../../../componentes/ElegirPara';
import { TUS_DATOS_VACIOS, datosParaReservar } from '../../../componentes/TusDatos';
import type { EstadoTusDatos } from '../../../componentes/TusDatos';
import { useLetraGrande } from '../../../hooks/useLetraGrande';
import type { ModeloRevendedor, PerfilRevendedor } from '../../../lib/tipos';
import { elegirPortada, normalizarTema, temaResuelto } from './tema';
import { cargarLetras } from './letras';
import type { CatalogoRv } from './tipos';

const COLUMNAS = 'id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, disponible, familia, variante';
/** Cuántas piezas trae de una vez. Si llega al tope, se dice. */
const LIMITE = 400;
/** En la lista, de cuántas en cuántas familias se enseñan. */
const DE_A = 24;

/**
 * El cerebro del catálogo de un revendedor (`<usuario>.luxbyemory.com`, en
 * desarrollo `/r/<usuario>`): todo lo que hacía CatalogoRevendedor.tsx,
 * sin dibujar nada. Cada plantilla lo recibe entero.
 *
 * Todo sale de `rv_catalogo_publico` (con su inventario propio sumado, #72),
 * que no tiene ni costo, ni piso, ni lo que él le paga a Lux, ni dónde está
 * la pieza en la tienda.
 */
export function useCatalogoRv(usuario: string): CatalogoRv {
  const navegar = useNavigate();
  const [perfil, setPerfil] = useState<PerfilRevendedor | null>(null);
  const [perfilListo, setPerfilListo] = useState(false);
  const [modelos, setModelos] = useState<ModeloRevendedor[]>([]);
  // Todas las piezas que se han visto, no solo las de la búsqueda actual:
  // lo elegido sigue sumando aunque la clienta busque otra cosa.
  const [porId, setPorId] = useState<Map<number, ModeloRevendedor>>(new Map());
  const [categorias, setCategorias] = useState<string[]>([]);
  const [seleccion, setSeleccion] = useState<Map<number, number>>(new Map());
  const [texto, setTexto] = useState('');
  const [cargandoFilas, setCargandoFilas] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parametros, setParametros] = useSearchParams();
  const pedidoAbierto = parametros.get('paso') === 'apartar';
  // Dama o caballero (#68) y el tipo, en la ruta: atrás vuelve al inicio.
  const para = paraDeRuta(parametros.get('para'));
  const categoria = parametros.get('tipo');
  const enLista = Boolean(categoria || texto.trim());
  // De qué consulta son las filas que hay: mientras no sean de la de ahora
  // no se dibujan (la primera letra pintaba las del inicio en la lista).
  const consultaActual = `${categoria ?? ''}|${texto.trim()}|${para ?? ''}`;
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);
  const turno = useRef(0);
  const [visibles, setVisibles] = useState(DE_A);
  const [datos, setDatos] = useState<EstadoTusDatos>(TUS_DATOS_VACIOS);
  const [apartando, setApartando] = useState(false);
  const [fichaClave, setFichaClave] = useState<number | null>(null);
  // "Agrégale un dije": qué piezas son dijes o bases (de la vista pública,
  // sin ningún precio), sus dijes con SU precio cuando se piden, y las
  // parejas. Aquí no se guardan con el pedido: lo arma él con su clienta.
  const [tipos, setTipos] = useState<Map<number, 'dije' | 'base'>>(new Map());
  const [dijes, setDijes] = useState<ModeloRevendedor[] | null>(null);
  const [pares, setPares] = useState<ParArmado[]>([]);
  // La portada al azar es la misma durante la visita.
  const [semilla] = useState(() => Math.floor(Math.random() * 1e9));
  const [portada, setPortada] = useState<ModeloRevendedor | null>(null);
  const { grande: letraGrande, alternar: alternarLetra } = useLetraGrande();

  const tema = useMemo(() => temaResuelto(normalizarTema(perfil?.tema), perfil?.paleta), [perfil]);
  const primerNombre = perfil?.nombre.trim().split(/\s+/)[0] ?? '';

  const conPara = useCallback((p: Record<string, string>): Record<string, string> => (para ? { ...p, para } : p), [para]);
  const setCategoria = useCallback((c: string | null) => setParametros(conPara(c ? { tipo: c } : {})), [setParametros, conPara]);
  const elegirPara = useCallback((x: Para | null) => {
    const p: Record<string, string> = categoria ? { tipo: categoria } : {};
    setParametros(x ? { ...p, para: x } : p, { replace: true });
  }, [categoria, setParametros]);
  const abrirPedido = useCallback(() => {
    const p: Record<string, string> = categoria ? { tipo: categoria } : {};
    setParametros(conPara({ ...p, paso: 'apartar' }));
  }, [categoria, conPara, setParametros]);
  const cerrarPedido = useCallback(() => {
    const p: Record<string, string> = categoria ? { tipo: categoria } : {};
    setParametros(conPara(p), { replace: true });
  }, [categoria, conPara, setParametros]);

  // Quién es y sus categorías, una sola vez. Las categorías se piden sin
  // filtrar: si salieran de lo que está en pantalla, elegir una haría
  // desaparecer a las demás.
  useEffect(() => {
    void (async () => {
      const [p, c] = await Promise.all([
        supabase.rpc('rv_perfil_publico', { p_usuario: usuario }),
        supabase.rpc('rv_catalogo_publico', { p_usuario: usuario }).select('categoria'),
      ]);
      // Dos consultas, dos errores mirados.
      const fallo = p.error ?? c.error ?? null;
      if (fallo) setError(mensajeDeError(fallo));
      setPerfil((p.data as PerfilRevendedor | null) ?? null);
      const lista = ((c.data as { categoria: string | null }[] | null) ?? [])
        .map((x) => x.categoria?.trim())
        .filter((x): x is string => !!x);
      setCategorias([...new Set(lista)].sort((a, b) => a.localeCompare(b, 'es')));
      setPerfilListo(true);
    })();
  }, [usuario]);

  // Sus letras, cuando se sabe su tema. Si fallan, queda el respaldo.
  useEffect(() => { if (perfil) void cargarLetras(tema); }, [perfil, tema]);

  // Qué es dije y qué es base. Mirado, pero sin tumbar el catálogo: si no
  // llega, su clienta sigue pidiendo; solo no sale "Agrégale un dije".
  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('v_disponible_publico')
        .select('id, armado')
        .not('armado', 'is', null)
        .limit(2000);
      if (err) return;
      const mapa = new Map<number, 'dije' | 'base'>();
      for (const f of (data as { id: number; armado: 'dije' | 'base' | null }[] | null) ?? []) {
        if (f.armado) mapa.set(f.id, f.armado);
      }
      setTipos(mapa);
    })();
  }, []);

  useEffect(() => {
    // Al salir vuelve el de antes, no "Lux by Emory": en un subdominio sin
    // revendedor el Worker dejó "Catálogo de joyas" y Lux no se nombra.
    const antes = document.title;
    if (perfil) document.title = `${perfil.catalogo_nombre} · Joyas Lux by Emory`;
    return () => { document.title = antes; };
  }, [perfil]);

  // El ícono de la pestaña es su logo, nunca el de Lux. Sin logo, ninguno.
  useEffect(() => {
    const icono = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icono || !perfilListo) return;
    const antes = icono.href;
    icono.href = urlPublicaFoto(perfil?.logo_path) ?? 'data:,';
    return () => { icono.href = antes; };
  }, [perfil, perfilListo]);

  const cargar = useCallback(async () => {
    setCargandoFilas(true);
    // Una respuesta que llega después de otra consulta ya es vieja: se tira.
    const mio = ++turno.current;
    let consulta = supabase
      .rpc('rv_catalogo_publico', { p_usuario: usuario })
      .select(COLUMNAS)
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true })
      .limit(LIMITE);
    if (categoria) consulta = consulta.eq('categoria', categoria);
    if (para) consulta = consulta.in('para', paraQueVe(para));
    if (texto.trim()) {
      const t = texto.trim().replace(/[%,()"\\:]/g, ' ');
      consulta = consulta.or(`nombre.ilike.%${t}%,categoria.ilike.%${t}%,variante.ilike.%${t}%`);
    }
    const { data, error: err } = await consulta;
    if (mio !== turno.current) return;
    if (err) setError(mensajeDeError(err));
    const filas = (data as unknown as ModeloRevendedor[] | null) ?? [];
    setModelos(filas);
    setPorId((antes) => {
      const copia = new Map(antes);
      for (const f of filas) copia.set(f.id, f);
      return copia;
    });
    setCargadoPara(`${categoria ?? ''}|${texto.trim()}|${para ?? ''}`);
    setVisibles(DE_A);
    setCargandoFilas(false);
  }, [usuario, texto, categoria, para]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, texto]);

  // La portada, una vez, de lo que trajo el inicio.
  useEffect(() => {
    if (portada || !perfil || enLista || cargadoPara !== consultaActual) return;
    setPortada(elegirPortada(modelos, tema.portada, semilla));
  }, [portada, perfil, enLista, cargadoPara, consultaActual, modelos, tema.portada, semilla]);

  // Un enlace viejo (o recargar) con el pedido abierto y nada elegido:
  // vuelve al catálogo, no a una hoja vacía.
  useEffect(() => {
    if (pedidoAbierto && seleccion.size === 0) cerrarPedido();
  }, [pedidoAbierto, seleccion.size, cerrarPedido]);

  // Al cambiar de tipo, arriba.
  useEffect(() => { window.scrollTo(0, 0); }, [categoria]);

  const resumen = useMemo(() => {
    let piezas = 0;
    const lineas: { precio: number | null; cantidad: number }[] = [];
    for (const [id, n] of seleccion) {
      piezas += n;
      lineas.push({ precio: porId.get(id)?.precio_usd ?? null, cantidad: n });
    }
    return { piezas, totalUsd: totalDeLineas(lineas) };
  }, [seleccion, porId]);

  const elegidos = useMemo(() => [...seleccion.entries()]
    .map(([id, cantidad]) => ({ m: porId.get(id), cantidad }))
    .filter((x): x is { m: ModeloRevendedor; cantidad: number } => !!x.m), [seleccion, porId]);

  const familias = useMemo(() => agruparPorFamilia(modelos), [modelos]);
  const estantes = useMemo(() => porCategoria(familias), [familias]);
  const tiposConFoto = useMemo(() => estantes.map((e) => {
    const conImagen = e.familias.map((f) => conFoto(f.variantes)).find((p) => p && (p.foto_path || p.foto_thumb_path));
    return {
      nombre: e.categoria,
      cuantas: e.familias.length,
      foto: conImagen ? fuenteFoto(conImagen.foto_path, conImagen.foto_thumb_path, '(max-width: 640px) 31vw, 180px') : null,
    };
  }), [estantes]);
  const fichaAbierta = useMemo(() => (fichaClave === null ? null : familias.find((f) => f.clave === fichaClave) ?? null), [fichaClave, familias]);

  const disponible = useCallback((id: number) => porId.get(id)?.disponible ?? 0, [porId]);
  const llevas = useCallback((id: number) => seleccion.get(id) ?? 0, [seleccion]);

  const cambiar = useCallback((modeloId: number, cantidad: number) => {
    const copia = new Map(seleccion);
    const n = Math.max(0, Math.min(cantidad, porId.get(modeloId)?.disponible ?? 0));
    if (n === 0) copia.delete(modeloId); else copia.set(modeloId, n);
    setSeleccion(copia);
    // Las parejas que ya no caben se caen: si no, un dije quitado y
    // vuelto a poner suelto contaría como puesto en su cadena.
    setPares((p) => paresVigentes(p, copia));
  }, [porId, seleccion]);

  const agregar = useCallback((id: number) => cambiar(id, (seleccion.get(id) ?? 0) + 1), [cambiar, seleccion]);
  const vaciar = useCallback(() => { setSeleccion(new Map()); setPares([]); }, []);

  const cargarDijes = useCallback(async () => {
    if (dijes !== null) return;
    const ids = [...tipos].filter(([, t]) => t === 'dije').map(([id]) => id);
    const { data, error: err } = ids.length === 0
      ? { data: [], error: null }
      : await supabase
        .rpc('rv_catalogo_publico', { p_usuario: usuario })
        .select(COLUMNAS)
        .in('id', ids)
        .order('nombre', { ascending: true })
        .limit(LIMITE);
    if (err) { setError('No se pudieron traer los dijes: ' + mensajeDeError(err)); return; }
    const filas = (data as unknown as ModeloRevendedor[] | null) ?? [];
    setPorId((antes) => {
      const copia = new Map(antes);
      for (const f of filas) copia.set(f.id, f);
      return copia;
    });
    setDijes(filas);
  }, [dijes, tipos, usuario]);

  const armarCon = useCallback((baseId: number, dijeId: number): string | null => {
    const hecho = armar(seleccion, pares, baseId, dijeId, (id) => porId.get(id)?.disponible ?? 0);
    if (!hecho) return 'Ya no quedan piezas para armar esa: elige otra cadena o pulsera, u otro dije.';
    setSeleccion(hecho.seleccion);
    setPares(hecho.pares);
    return null;
  }, [seleccion, pares, porId]);

  const buscarSuClienta = useCallback(
    (cedula: string) => supabase.rpc('rv_buscar_cliente', { p_usuario: usuario, p_cedula: cedula }),
    [usuario],
  );

  const apartar = useCallback(async () => {
    const quien = datosParaReservar(datos);
    if (!quien) return;
    setApartando(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('rv_apartar', {
      p_usuario: usuario,
      p_items: [...seleccion.entries()].map(([modelo_id, cantidad]) => ({ modelo_id, cantidad })),
      p_cedula: quien.cedula,
      // Si confirmó que es su clienta, van vacíos y la base los pone de la ficha.
      p_nombre: quien.nombre,
      p_apellido: quien.apellido,
      p_telefono: quien.telefono,
    });
    setApartando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    navegar(`/apartado/${data as string}`);
  }, [datos, navegar, seleccion, usuario]);

  const alInicio = useCallback(() => { setTexto(''); setCategoria(null); }, [setCategoria]);

  return {
    usuario,
    perfil,
    perfilListo,
    tema,
    error,
    limpiarError: () => setError(null),
    cargando: cargandoFilas || cargadoPara !== consultaActual,
    primerNombre,
    escribirle: perfil
      ? enlaceWhatsAppA(perfil.telefono, `Hola ${primerNombre}, vi tu catálogo: ${enlaceCatalogoRv(perfil.usuario)}`)
      : null,
    familias,
    estantes,
    categorias,
    tiposConFoto,
    portada,
    enLista,
    visibles,
    verMas: () => setVisibles((v) => v + DE_A),
    alTope: modelos.length >= LIMITE,
    limite: LIMITE,
    categoria,
    setCategoria,
    para,
    elegirPara,
    texto,
    setTexto,
    alInicio,
    resumen,
    elegidos,
    llevas,
    disponible,
    agregar,
    cambiar,
    vaciar,
    fichaAbierta,
    abrirFicha: setFichaClave,
    cerrarFicha: () => setFichaClave(null),
    esBase: (id) => tipos.get(id) === 'base',
    dijes,
    cargarDijes,
    armarCon,
    pedidoAbierto,
    abrirPedido,
    cerrarPedido,
    datos,
    setDatos,
    buscarSuClienta,
    apartando,
    apartar,
    letraGrande,
    alternarLetra,
  };
}
