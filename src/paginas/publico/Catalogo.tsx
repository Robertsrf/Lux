import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio } from '../../componentes/Piezas';
import { Wordmark } from '../../componentes/Marca';
import { aMonto, deMonto, formatearBs, formatearUsd, porCantidad, precioEnBs, precioPorPiezaPara } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { useTasa } from '../../hooks/useTasa';
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

  const [modelos, setModelos] = useState<ModeloPublico[]>([]);
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [seleccion, setSeleccion] = useState<Map<number, number>>(new Map());
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<'catalogo' | 'pedido'>('catalogo');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [reservando, setReservando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    let consulta = supabase
      .from('v_disponible_publico')
      .select(COLUMNAS)
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true })
      .limit(400);

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
  }, [texto]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, texto]);

  const porId = useMemo(() => new Map(modelos.map((m) => [m.id, m])), [modelos]);

  const resumen = useMemo(() => {
    let piezas = 0;
    for (const n of seleccion.values()) piezas += n;
    const precioPieza = precioPorPiezaPara(tramos, piezas);
    const totalUsd = precioPieza === null ? null : deMonto(porCantidad(aMonto(precioPieza), piezas));
    return { piezas, precioPieza, totalUsd };
  }, [seleccion, tramos]);

  function agregar(m: ModeloPublico) {
    setSeleccion((prev) => {
      const copia = new Map(prev);
      const ahora = copia.get(m.id) ?? 0;
      if (ahora >= m.disponible) return prev;
      copia.set(m.id, ahora + 1);
      return copia;
    });
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
      p_cliente_nombre: nombre.trim() || null,
      p_cliente_telefono: telefono.trim() || null,
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

        {resumen.precioPieza === null ? (
          <Aviso tono="alerta" titulo="Todavia no podemos cotizar">
            No hay precios de mayor cargados para {resumen.piezas} piezas. Escribenos y te cotizamos a mano.
          </Aviso>
        ) : (
          <div className="total-cobro">
            <div>
              <span className="util secundario">Total al mayor</span>
              <div className="campo__pista">{formatearUsd(resumen.precioPieza)} por pieza</div>
            </div>
            <div>
              <div className="total-cobro__cifra">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</div>
              <div className="total-cobro__referencia">{formatearUsd(resumen.totalUsd)}</div>
            </div>
          </div>
        )}

        <div className="fila">
          <Campo etiqueta="Tu nombre" htmlFor="r-nombre">
            <input id="r-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
          </Campo>
          <Campo etiqueta="Tu telefono" htmlFor="r-tel" pista="Para que la tienda te escriba y cerrar el pedido.">
            <input id="r-tel" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="tel" />
          </Campo>
        </div>

        <div className="acciones">
          <button
            type="button"
            className="boton boton--confirmar"
            disabled={reservando || resumen.piezas === 0 || resumen.precioPieza === null}
            onClick={() => void reservar()}
          >
            {reservando ? 'Apartando' : 'Apartar mi pedido'}
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
          <Wordmark tamano={24} />
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

        {error ? <Aviso tono="error" titulo="No se pudo cargar el catalogo">{error}</Aviso> : null}

        <Campo etiqueta="Buscar" htmlFor="buscar-publico">
          <input
            id="buscar-publico" type="search" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Cadena, anillo, choker..." autoComplete="off"
          />
        </Campo>

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
                  onClick={() => agregar(m)}
                  aria-label={`Agregar ${m.nombre} al pedido`}
                >
                  {foto
                    ? <img className="tarjeta-modelo__foto" src={foto} alt={m.nombre} loading="lazy" />
                    : <span className="tarjeta-modelo__foto" />}
                  <span className="tarjeta-modelo__cuerpo">
                    <span className="tarjeta-modelo__nombre">{m.nombre}</span>
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

        {resumen.piezas > 0 ? (
          <div className="barra-carrito">
            <div className="barra-carrito__resumen">
              <div className="barra-carrito__piezas">
                {resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}
              </div>
              <div className="barra-carrito__total">
                {resumen.totalUsd === null
                  ? 'Te cotizamos'
                  : formatearBs(precioEnBs(resumen.totalUsd, tasa))}
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
