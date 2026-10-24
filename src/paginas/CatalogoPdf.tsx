import { useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Aviso, Cargando, Vacio } from '../componentes/Piezas';
import { CompartirCatalogo } from '../componentes/CompartirCatalogo';
import { VisitasCatalogo } from '../componentes/VisitasCatalogo';
import { Monograma, Wordmark } from '../componentes/Marca';
import { formatearBcv, formatearBs, formatearFecha } from '../lib/dinero';
import { urlPublicaFoto } from '../lib/fotos';
import { agruparPorFamilia, conFoto, etiquetasCortas, listaCorta, porPrecio } from '../lib/familias';
import type { Familia } from '../lib/familias';
import { useTextos } from '../hooks/useTextos';
import { useFrases } from '../hooks/useFrases';
import type { ModeloProximo, ModeloVenta } from '../lib/tipos';
import '../estilos/impresion.css';

const TAMANO_PAGINA = 500;
const TOPE = 4000;
/** Fichas entre franja y franja: tres filas de tres, una pagina. */
const POR_TANDA = 9;

/**
 * Catalogo en PDF: se genera con esta hoja de estilos y el "Guardar como PDF"
 * del navegador. Sin librerias, con control total de la marca.
 *
 * Nunca incluir el logo de SGS ni reproducir certificados del proveedor: son
 * documentos privados de respaldo, no material de marca.
 */
export function CatalogoPdf() {
  const textos = useTextos();
  const { secuencia: frases } = useFrases('TV');
  const [modelos, setModelos] = useState<ModeloVenta[]>([]);
  // Lo que viene en un lote que no ha llegado (pedido del dueño del
  // 20/10/2026): va al final, marcado "Próximamente", sin cantidad.
  const [proximos, setProximos] = useState<ModeloProximo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorProximos, setErrorProximos] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      const acumulado: ModeloVenta[] = [];
      // Lo LIBRE de cada pieza, el mismo número del catálogo en línea. El
      // PDF va a las clientas: antes decía "Quedan 5" con 2 apartadas por
      // un pedido, y listaba piezas apartadas enteras que nadie podía
      // pedir. `existencia_total` es lo que hay, no lo que se puede vender.
      const libres = new Map<number, number>();

      try {
        for (let desde = 0; desde < TOPE; desde += TAMANO_PAGINA) {
          const [cat, disp] = await Promise.all([
            supabase
              .from('v_catalogo_venta')
              .select('id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, grupo, precio_usd, precio_bs, precio_usd_real, existencia_total, ubicaciones, familia, variante')
              .gt('existencia_total', 0)
              .order('categoria', { ascending: true })
              .order('nombre', { ascending: true })
              .order('id', { ascending: true })
              .range(desde, desde + TAMANO_PAGINA - 1),
            supabase
              .from('v_disponible_publico')
              .select('id, disponible')
              .order('id', { ascending: true })
              .range(desde, desde + TAMANO_PAGINA - 1),
          ]);
          // Si lanzas dos consultas, miras dos errores.
          if (cat.error) throw cat.error;
          if (disp.error) throw disp.error;
          for (const d of (disp.data as { id: number; disponible: number }[] | null) ?? []) libres.set(d.id, d.disponible);
          const lote = (cat.data as unknown as ModeloVenta[] | null) ?? [];
          acumulado.push(...lote);
          const dispLote = disp.data?.length ?? 0;
          if (lote.length < TAMANO_PAGINA && dispLote < TAMANO_PAGINA) break;
        }
        setModelos(acumulado
          .filter((m) => (libres.get(m.id) ?? 0) > 0)
          .map((m) => ({ ...m, existencia_total: libres.get(m.id) ?? 0 })));
      } catch (e) {
        setError(mensajeDeError(e));
      }

      // Aparte: si falla, el catálogo de lo que se vende sale igual, y se
      // dice que faltó lo próximo para no mandar un PDF incompleto sin saberlo.
      const prox = await supabase
        .from('v_proximamente')
        .select('id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, familia, variante')
        .order('categoria', { ascending: true })
        .order('nombre', { ascending: true })
        .order('id', { ascending: true })
        .range(0, TAMANO_PAGINA - 1);
      setErrorProximos(prox.error ? mensajeDeError(prox.error) : null);
      setProximos((prox.data as unknown as ModeloProximo[] | null) ?? []);
      setCargando(false);
    })();
  }, []);

  // El catalogo se parte en tandas para intercalar una frase de marca
  // entre ellas. Son las mismas de la Guia del Colaborador: lo que la
  // vendedora diria de viva voz, dicho por el papel.
  //
  // Un producto con variantes es UNA ficha, con la medida y el precio de
  // cada una: dos fichas iguales en el mismo PDF parecen un error de
  // imprenta.
  const familias = useMemo(() => agruparPorFamilia(modelos), [modelos]);
  const tandas = useMemo(() => {
    const salida: Familia<ModeloVenta>[][] = [];
    for (let i = 0; i < familias.length; i += POR_TANDA) salida.push(familias.slice(i, i + POR_TANDA));
    return salida;
  }, [familias]);
  const familiasProximas = useMemo(() => agruparPorFamilia(proximos), [proximos]);

  if (cargando) return <Cargando texto="Armando el catálogo" />;

  return (
    <div className="pagina catalogo">
      <div className="encabezado-pagina sin-impresion">
        <div>
          <h1>Catálogo</h1>
          <p>
            Lo que se puede pedir, sin lo apartado por pedidos{familiasProximas.length > 0 ? ', y al final lo que viene en camino, como Próximamente' : ''}.
            {' '}Imprime y elige "Guardar como PDF".
          </p>
        </div>
        <div>
          <button type="button" className="boton" onClick={() => window.print()}>Imprimir o guardar PDF</button>
          <p className="campo__pista" style={{ marginTop: 'var(--e-2)', maxWidth: '34ch' }}>
            En el cuadro de impresion: <strong style={{ display: 'inline' }}>marca "Graficos de fondo"</strong>
            —sin eso la portada sale en blanco— y desmarca "Encabezados y pies de página",
            para que no salga la dirección web en el papel.
          </p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso> : null}
      {errorProximos ? (
        <div className="sin-impresion">
          <Aviso tono="alerta" titulo="No se pudo traer lo que viene en camino">
            El catálogo sale sin la sección Próximamente. {errorProximos}
          </Aviso>
        </div>
      ) : null}

      <div className="sin-impresion">
        <VisitasCatalogo />
        <CompartirCatalogo titulo="Enlace del catálogo en línea" />
      </div>

      <section className="catalogo__portada">
        <div className="portada__marco">
          <Wordmark alto={132} tono="verde" />
        </div>

        <div className="portada__regla" aria-hidden="true">
          <span /><Monograma tamano={44} /><span />
        </div>

        {textos.catalogo_intro ? (
          <p className="portada__intro">{textos.catalogo_intro}</p>
        ) : null}

        {textos.materiales_largo ? (
          <p className="portada__materiales">{textos.materiales_largo}</p>
        ) : null}

        <p className="portada__dato">
          Catalogo del {formatearFecha(new Date().toISOString())} · {familias.length} modelos disponibles
          {familiasProximas.length > 0 ? ` · ${familiasProximas.length} próximamente` : ''}
        </p>

        <p className="portada__lugar">
          {textos.catalogo_pie ?? 'Lux by Emory · Desde Sabana de Mendoza para toda Venezuela'}
        </p>
      </section>

      {modelos.length === 0 ? (
        <Vacio titulo="Todavia no hay modelos con existencia">
          <p>Carga modelos con cantidad en alguna ubicación y vuelve aquí.</p>
        </Vacio>
      ) : (
        <>
          {tandas.map((tanda, t) => (
          <div key={t}>
          <div className="catalogo__rejilla">
            {tanda.map((f) => {
              const m = f.cabeza;
              const portada = conFoto(f.variantes) ?? m;
              const foto = urlPublicaFoto(portada.foto_path ?? portada.foto_thumb_path);
              const varias = f.variantes.length > 1;
              const mismoPrecio = f.variantes.every((v) => v.precio_bs === m.precio_bs);
              const quedan = f.variantes.reduce((n, v) => n + v.existencia_total, 0);
              const donde = [...new Set(f.variantes.flatMap((v) => (v.ubicaciones ?? '').split(' · ')).filter(Boolean))].join(' · ');
              return (
                <article className="ficha" key={f.clave}>
                  {foto
                    ? <img className="ficha__foto" src={foto} alt={m.nombre} loading="lazy" />
                    : <div className="ficha__foto" />}
                  <div className="ficha__sku">{varias ? listaCorta(f.variantes.map((v) => v.sku), 40) : m.sku}</div>
                  <div className="ficha__nombre">{m.nombre}</div>
                  {varias && mismoPrecio ? <div className="ficha__variantes">{etiquetasCortas(f, 50)}</div> : null}
                  {!varias && (m.variante || m.variantes_nota) ? (
                    <div className="ficha__variantes">{[m.variante, m.variantes_nota].filter(Boolean).join(' · ')}</div>
                  ) : null}
                  {textos.materiales_corto ? (
                    <div className="ficha__material">{textos.materiales_corto}</div>
                  ) : null}
                  <div>
                    <PreciosDeFicha familia={f} />
                    <div className="ficha__existencia">
                      {quedan === 1 ? 'Queda 1 pieza' : `Quedan ${quedan} piezas`}
                    </div>
                    {/* Donde esta, para que la vendedora vaya derecho a buscarla.
                        En la vitrina del televisor va en clave; aqui, con nombre. */}
                    {donde ? <div className="ficha__ubicacion">{donde}</div> : null}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Ni al final del catalogo ni si no hay frases cargadas. */}
          {frases.length > 0 && t < tandas.length - 1 ? (
            <aside className="catalogo__franja">
              <p className="franja__texto">{frases[t % frases.length]!.texto}</p>
              <div className="franja__regla" aria-hidden="true">
                <span /><Monograma tamano={26} /><span />
              </div>
            </aside>
          ) : null}
          </div>
          ))}

        </>
      )}

      {/*
        PRÓXIMAMENTE. Lo nuevo de un lote que no ha llegado, en su propia
        página: una franja verde que lo anuncia y las mismas fichas, con
        "Próximamente" donde las demás dicen cuántas quedan. Sin cantidad
        ni ubicación: no está en la tienda y no se puede pedir todavía.
      */}
      {familiasProximas.length > 0 ? (
        <section className="catalogo__proximos">
          <aside className="catalogo__franja">
            <p className="franja__titulo">Próximamente</p>
            <p className="franja__texto">Vienen en camino. Todavía no se pueden pedir: en cuanto lleguen, se pueden apartar.</p>
            <div className="franja__regla" aria-hidden="true">
              <span /><Monograma tamano={26} /><span />
            </div>
          </aside>
          <div className="catalogo__rejilla">
            {familiasProximas.map((f) => {
              const m = f.cabeza;
              const portada = conFoto(f.variantes) ?? m;
              const foto = urlPublicaFoto(portada.foto_path ?? portada.foto_thumb_path);
              const varias = f.variantes.length > 1;
              const mismoPrecio = f.variantes.every((v) => v.precio_bs === m.precio_bs);
              return (
                <article className="ficha" key={f.clave}>
                  {foto
                    ? <img className="ficha__foto" src={foto} alt={m.nombre} loading="lazy" />
                    : <div className="ficha__foto" />}
                  <div className="ficha__sku">{varias ? listaCorta(f.variantes.map((v) => v.sku), 40) : m.sku}</div>
                  <div className="ficha__nombre">{m.nombre}</div>
                  {varias && mismoPrecio ? <div className="ficha__variantes">{etiquetasCortas(f, 50)}</div> : null}
                  {!varias && (m.variante || m.variantes_nota) ? (
                    <div className="ficha__variantes">{[m.variante, m.variantes_nota].filter(Boolean).join(' · ')}</div>
                  ) : null}
                  {textos.materiales_corto ? (
                    <div className="ficha__material">{textos.materiales_corto}</div>
                  ) : null}
                  <div>
                    <PreciosDeFicha familia={f} />
                    <div className="ficha__proxima">Próximamente</div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {modelos.length > 0 || familiasProximas.length > 0 ? (
        <p className="catalogo__pie">
          {textos.catalogo_pie ?? 'Lux by Emory · Desde Sabana de Mendoza para toda Venezuela'}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Los precios de una ficha: con medidas de distinto precio, cada una con
 * los suyos; si no, los dos del producto. Bolívares y $ BCV del mismo
 * tamaño, siempre. La usan las fichas de lo que se vende y las de lo
 * próximo.
 */
function PreciosDeFicha({ familia }: { familia: Familia<Pick<ModeloVenta, 'id' | 'sku' | 'variante' | 'precio_bs' | 'precio_usd'>> }) {
  const m = familia.cabeza;
  const varias = familia.variantes.length > 1;
  const mismoPrecio = familia.variantes.every((v) => v.precio_bs === m.precio_bs);
  if (varias && !mismoPrecio) {
    return (
      // Cada medida con su precio, los dos del mismo tamano.
      <ul className="ficha__opciones">
        {porPrecio(familia.variantes).map(({ etiqueta, pieza }) => (
          <li key={pieza.id}>
            <span className="ficha__opcion">{etiqueta}</span>
            <span className="ficha__opcion-precio">{formatearBs(pieza.precio_bs)}</span>
            <span className="ficha__opcion-precio">{formatearBcv(pieza.precio_usd)}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      <div className="ficha__precio">{formatearBs(m.precio_bs)}</div>
      <div className="ficha__precio">{formatearBcv(m.precio_usd)}</div>
    </>
  );
}
