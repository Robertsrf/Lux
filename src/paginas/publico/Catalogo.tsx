import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio } from '../../componentes/Piezas';
import { Wordmark } from '../../componentes/Marca';
import { aMonto, aplicarDescuento, deMonto, descuentoPara, formatearBs, formatearPorcentaje, formatearUsd, porCantidad, precioEnBs, sumar } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { useTasa } from '../../hooks/useTasa';
import { VisorFoto, useDobleToque, useVisorFoto } from '../../componentes/VisorFoto';
import { useTextos } from '../../hooks/useTextos';
import type { ModeloPublico, Tramo } from '../../lib/tipos';

const COLUMNAS = 'id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, disponible';

/**
 * Catalogo publico. Se abre sin sesion, desde un enlace de WhatsApp.
 *
 * Lo que se ve aqui sale de v_disponible_publico, que no expone ninguna
 * columna de costo y descuenta lo que ya esta reservado por otra persona.
 *
 * El precio grande de cada pieza es el de DETAL. El armador cotiza al
 * mayor por tramo, y esa cifra la calcula la base al reservar.
 */
export function Catalogo() {
  const navegar = useNavigate();
  const { tasa } = useTasa();
  const textos = useTextos();

  const [modelos, setModelos] = useState<ModeloPublico[]>([]);
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [seleccion, setSeleccion] = useState<Map<number, number>>(new Map());
  const [texto, setTexto] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<'catalogo' | 'pedido'>('catalogo');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [entrega, setEntrega] = useState<'tienda' | 'envio'>('tienda');
  const [empresa, setEmpresa] = useState<'domesa' | 'mrw'>('domesa');
  const [agencia, setAgencia] = useState('');
  const [direccion, setDireccion] = useState('');
  const [reservando, setReservando] = useState(false);
  const visor = useVisorFoto();
  const esDobleToque = useDobleToque();

  const cargar = useCallback(async () => {
    setCargando(true);
    let consulta = supabase
      .from('v_disponible_publico')
      .select(COLUMNAS)
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true })
      .limit(400);

    if (categoria) consulta = consulta.eq('categoria', categoria);

    if (texto.trim()) {
      const t = texto.trim().replace(/[%,]/g, ' ');
      consulta = consulta.or(`nombre.ilike.%${t}%,categoria.ilike.%${t}%`);
    }

    const [cat, tr] = await Promise.all([
      consulta,
      supabase.from('tramos_mayoreo').select('id, min_piezas, precio_por_pieza_usd, activo').order('min_piezas'),
    ]);

    if (cat.error) setError(mensajeDeError(cat.error));
    setModelos((cat.data as unknown as ModeloPublico[] | null) ?? []);
    setTramos((tr.data as Tramo[] | null) ?? []);
    setCargando(false);
  }, [texto, categoria]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, texto]);

  // Las categorias se piden una sola vez y sin filtrar: si salieran de lo
  // que ya esta en pantalla, elegir una haria desaparecer a las demas.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('v_disponible_publico').select('categoria').limit(1000);
      const vistas = new Set<string>();
      for (const x of (data as { categoria: string | null }[] | null) ?? []) {
        if (x.categoria) vistas.add(x.categoria);
      }
      setCategorias([...vistas].sort());
    })();
  }, []);

  const porId = useMemo(() => new Map(modelos.map((m) => [m.id, m])), [modelos]);

  const resumen = useMemo(() => {
    let piezas = 0;
    const partes = [];
    for (const [id, n] of seleccion) {
      piezas += n;
      const m = porId.get(id);
      if (m?.precio_usd != null) partes.push(porCantidad(aMonto(m.precio_usd), n));
    }
    // El descuento sale del tramo que alcance esa cantidad. Sin tramos
    // cargados no hay rebaja: se paga el detal, que es lo honesto.
    const subtotal = deMonto(sumar(partes));
    const descuento = descuentoPara(tramos, piezas);
    return { piezas, subtotal, descuento, totalUsd: aplicarDescuento(subtotal, descuento) };
  }, [seleccion, tramos, porId]);

  function agregar(m: ModeloPublico) {
    setSeleccion((prev) => {
      const copia = new Map(prev);
      const ahora = copia.get(m.id) ?? 0;
      if (ahora >= m.disponible) return prev;
      copia.set(m.id, ahora + 1);
      return copia;
    });
  }

  function verFoto(m: ModeloPublico) {
    visor.abrir({
      nombre: m.nombre, sku: m.sku, nota: m.variantes_nota,
      path: m.foto_path, thumbPath: m.foto_thumb_path,
      materiales: textos.materiales_largo ?? null,
    });
  }

  /** Un toque suma la pieza; dos seguidos abren la foto y deshacen el primero. */
  function alTocar(m: ModeloPublico) {
    if (esDobleToque(m.id)) {
      const puestas = seleccion.get(m.id) ?? 0;
      if (puestas > 0) cambiar(m.id, puestas - 1);
      verFoto(m);
      return;
    }
    agregar(m);
  }

  function cambiar(modeloId: number, cantidad: number) {
    setSeleccion((prev) => {
      const copia = new Map(prev);
      const max = porId.get(modeloId)?.disponible ?? 0;
      const n = Math.max(0, Math.min(cantidad, max));
      if (n === 0) copia.delete(modeloId); else copia.set(modeloId, n);
      return copia;
    });
  }

  async function reservar() {
    setReservando(true);
    setError(null);
    const items = [...seleccion.entries()].map(([modelo_id, cantidad]) => ({ modelo_id, cantidad }));

    const { data, error: err } = await supabase.rpc('crear_reserva', {
      p_items: items,
      p_cliente_nombre: nombre,
      p_cliente_apellido: apellido,
      p_cliente_cedula: cedula,
      p_cliente_telefono: telefono,
      p_entrega: entrega,
      p_envio_empresa: entrega === 'envio' ? empresa : null,
      p_envio_agencia: entrega === 'envio' ? agencia : null,
      p_envio_direccion: entrega === 'envio' ? direccion : null,
    });

    if (err) { setError(mensajeDeError(err)); setReservando(false); return; }
    navegar(`/reserva/${data as string}`);
  }

  /* ------------------------------------------------------------ pedido */

  if (paso === 'pedido') {
    const elegidos = [...seleccion.entries()].map(([id, cantidad]) => ({ m: porId.get(id), cantidad }));

    return (
      <div className="pagina pagina--angosta mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1>Tu pedido</h1>
            <p>{resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'} al mayor.</p>
          </div>
        </div>

        {error ? <ResumenErrores titulo="No se pudo apartar">{error}</ResumenErrores> : null}

        <div className="lineas-cobro">
          {elegidos.map(({ m, cantidad }) => m ? (
            <div className="linea-cobro" key={m.id}>
              {urlPublicaFoto(m.foto_thumb_path)
                ? <img className="linea-cobro__foto" src={urlPublicaFoto(m.foto_thumb_path)!} alt="" />
                : <span className="linea-cobro__foto" />}
              <div>
                <div className="linea-cobro__nombre">{m.nombre}</div>
                <div className="linea-cobro__precio">Quedan {m.disponible}</div>
              </div>
              <div className="contador">
                <button type="button" aria-label={`Quitar una de ${m.nombre}`} onClick={() => cambiar(m.id, cantidad - 1)}>&minus;</button>
                <span className="contador__valor">{cantidad}</span>
                <button type="button" aria-label={`Agregar una de ${m.nombre}`} disabled={cantidad >= m.disponible} onClick={() => cambiar(m.id, cantidad + 1)}>+</button>
              </div>
            </div>
          ) : null)}
        </div>

        <div className="total-cobro">
          <div>
            <span className="util secundario">Tu total</span>
            <div className="campo__pista">
              {resumen.piezas} piezas valen {formatearBs(precioEnBs(resumen.subtotal, tasa))}
              {resumen.descuento ? `, menos ${formatearPorcentaje(resumen.descuento)} de descuento` : ''}
            </div>
          </div>
          <div>
            <div className="total-cobro__cifra">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</div>
            <div className="total-cobro__referencia">{formatearUsd(resumen.totalUsd)}</div>
          </div>
        </div>

        <h2 className="seccion-titulo">Tus datos</h2>
        <div className="fila">
          <Campo etiqueta="Nombre" htmlFor="r-nombre">
            <input id="r-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="given-name" required />
          </Campo>
          <Campo etiqueta="Apellido" htmlFor="r-apellido">
            <input id="r-apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} autoComplete="family-name" required />
          </Campo>
        </div>
        <div className="fila">
          <Campo etiqueta="Cedula" htmlFor="r-cedula" pista="Va en la guia de envio.">
            <input id="r-cedula" inputMode="numeric" value={cedula} onChange={(e) => setCedula(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Telefono" htmlFor="r-tel" pista="Con el codigo. Por ejemplo 0412 1234567.">
            <input id="r-tel" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="tel" required />
          </Campo>
        </div>

        <h2 className="seccion-titulo">Como lo recibes</h2>
        <div className="panel">
          <div className="metodos-pago">
            <button type="button" aria-pressed={entrega === 'tienda'} onClick={() => setEntrega('tienda')}>
              Retiro en tienda
            </button>
            <button type="button" aria-pressed={entrega === 'envio'} onClick={() => setEntrega('envio')}>
              Envio a mi ciudad
            </button>
          </div>

          {entrega === 'envio' ? (
            <>
              <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
                El envio se paga al retirarlo en la agencia, no ahora.
              </p>
              <div className="metodos-pago" style={{ marginTop: 'var(--e-4)' }}>
                <button type="button" aria-pressed={empresa === 'domesa'} onClick={() => setEmpresa('domesa')}>Domesa</button>
                <button type="button" aria-pressed={empresa === 'mrw'} onClick={() => setEmpresa('mrw')}>MRW</button>
              </div>
              <div className="fila" style={{ marginTop: 'var(--e-4)' }}>
                <Campo etiqueta="Agencia" htmlFor="r-agencia" pista="La sucursal donde lo vas a retirar.">
                  <input id="r-agencia" value={agencia} onChange={(e) => setAgencia(e.target.value)} required />
                </Campo>
                <Campo etiqueta="Direccion de la agencia" htmlFor="r-dir">
                  <input id="r-dir" value={direccion} onChange={(e) => setDireccion(e.target.value)} required />
                </Campo>
              </div>
            </>
          ) : (
            <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
              Te esperamos en la tienda con tu cedula.
            </p>
          )}
        </div>

        <p className="campo__pista">
          Al apartar, las piezas quedan tuyas mientras pagas. El pago lo cargas
          en la pantalla siguiente.
        </p>

        <div className="acciones">
          <button
            type="button"
            className="boton boton--confirmar"
            disabled={reservando || resumen.piezas === 0}
            onClick={() => void reservar()}
          >
            {reservando ? 'Apartando' : 'Apartar mis piezas'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => setPaso('catalogo')}>
            Seguir viendo
          </button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------- catalogo */

  return (
    <>
      <header className="barra barra--publica">
        <div className="barra__interior">
          <Wordmark alto={40} />
          <span className="sesion__quien">Desde Sabana de Mendoza para toda Venezuela</span>
        </div>
      </header>

      <div className="pagina mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1>Catalogo</h1>
            <p>Toca las piezas que te gusten y armamos tu pedido al mayor.</p>
          </div>
        </div>

        {textos.materiales_largo ? (
          <p className="sello-materiales">{textos.materiales_largo}</p>
        ) : null}

        {error ? <Aviso tono="error" titulo="No se pudo cargar el catalogo">{error}</Aviso> : null}

        <Campo etiqueta="Buscar" htmlFor="buscar-publico">
          <input
            id="buscar-publico" type="search" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Cadena, anillo, choker..." autoComplete="off"
          />
        </Campo>

        {categorias.length > 1 ? (
          <div className="filtros-categoria" role="group" aria-label="Filtrar por categoria">
            <button type="button" aria-pressed={categoria === null} onClick={() => setCategoria(null)}>
              Todo
            </button>
            {categorias.map((c) => (
              <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}>
                {c}
              </button>
            ))}
          </div>
        ) : null}

        {cargando ? (
          <Cargando texto="Trayendo el catalogo" />
        ) : modelos.length === 0 ? (
          <Vacio titulo={texto ? 'Ninguna pieza coincide' : 'Por ahora no hay piezas disponibles'}>
            <p>{texto ? 'Prueba con otra palabra.' : 'Vuelve pronto: estamos surtiendo la vitrina.'}</p>
          </Vacio>
        ) : (
          <div className="rejilla-venta">
            {modelos.map((m) => {
              const foto = urlPublicaFoto(m.foto_thumb_path ?? m.foto_path);
              const puestas = seleccion.get(m.id) ?? 0;
              return (
                <button
                  key={m.id}
                  type="button"
                  className="tarjeta-modelo"
                  disabled={puestas >= m.disponible}
                  onClick={() => alTocar(m)}
                  aria-label={`Agregar ${m.nombre} al pedido`}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    className="lupa"
                    aria-label={`Ver la foto de ${m.nombre}`}
                    onClick={(e) => { e.stopPropagation(); verFoto(m); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); verFoto(m); } }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
                    </svg>
                  </span>
                  {foto
                    ? <img className="tarjeta-modelo__foto" src={foto} alt={m.nombre} loading="lazy" />
                    : <span className="tarjeta-modelo__foto" />}
                  <span className="tarjeta-modelo__cuerpo">
                    <span className="tarjeta-modelo__nombre">{m.nombre}</span>
                    {textos.materiales_corto ? (
                      <span className="tarjeta-modelo__material">{textos.materiales_corto}</span>
                    ) : null}
                    {m.variantes_nota ? <span className="celda-nota">{m.variantes_nota}</span> : null}
                    <span className="tarjeta-modelo__precio">{formatearBs(m.precio_bs)}</span>
                    <span className="tarjeta-modelo__pie">
                      <span className={m.disponible <= 2 ? 'tarjeta-modelo__existencia tarjeta-modelo__existencia--baja' : 'tarjeta-modelo__existencia'}>
                        Quedan {m.disponible}
                      </span>
                      {puestas > 0 ? <span className="tarjeta-modelo__contador">{puestas}</span> : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <VisorFoto foto={visor.foto} alCerrar={visor.cerrar} />

        {resumen.piezas > 0 ? (
          <div className="barra-carrito">
            <div className="barra-carrito__resumen">
              <div className="barra-carrito__piezas">
                {resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}
              </div>
              <div className="barra-carrito__total">
                {formatearBs(precioEnBs(resumen.totalUsd, tasa))}
              </div>
            </div>
            <button type="button" className="boton boton--secundario" onClick={() => setSeleccion(new Map())}>
              Vaciar
            </button>
            <button type="button" className="boton" onClick={() => setPaso('pedido')}>
              Ver pedido
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
