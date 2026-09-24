import { useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Aviso, Cargando, Vacio } from '../componentes/Piezas';
import { CompartirCatalogo } from '../componentes/CompartirCatalogo';
import { Monograma, Wordmark } from '../componentes/Marca';
import { formatearBcv, formatearBs, formatearFecha } from '../lib/dinero';
import { urlPublicaFoto } from '../lib/fotos';
import { agruparPorFamilia, conFoto, etiquetasDe } from '../lib/familias';
import type { Familia } from '../lib/familias';
import { useTextos } from '../hooks/useTextos';
import { useFrases } from '../hooks/useFrases';
import type { ModeloVenta } from '../lib/tipos';
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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setCargando(true);
      const acumulado: ModeloVenta[] = [];

      try {
        for (let desde = 0; desde < TOPE; desde += TAMANO_PAGINA) {
          const { data, error: err } = await supabase
            .from('v_catalogo_venta')
            .select('id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, grupo, precio_usd, precio_bs, precio_usd_real, existencia_total, ubicaciones, familia, variante')
            .gt('existencia_total', 0)
            .order('categoria', { ascending: true })
            .order('nombre', { ascending: true })
            .range(desde, desde + TAMANO_PAGINA - 1);

          if (err) throw err;
          const lote = (data as unknown as ModeloVenta[] | null) ?? [];
          acumulado.push(...lote);
          if (lote.length < TAMANO_PAGINA) break;
        }
        setModelos(acumulado);
      } catch (e) {
        setError(mensajeDeError(e));
      } finally {
        setCargando(false);
      }
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

  if (cargando) return <Cargando texto="Armando el catálogo" />;

  return (
    <div className="pagina catalogo">
      <div className="encabezado-pagina sin-impresion">
        <div>
          <h1>Catálogo</h1>
          <p>Solo modelos con existencia. Imprime y elige "Guardar como PDF".</p>
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

      <div className="sin-impresion">
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
                  <div className="ficha__sku">{varias ? f.variantes.map((v) => v.sku).join(' · ') : m.sku}</div>
                  <div className="ficha__nombre">{m.nombre}</div>
                  {varias && mismoPrecio ? <div className="ficha__variantes">{etiquetasDe(f)}</div> : null}
                  {!varias && (m.variante || m.variantes_nota) ? (
                    <div className="ficha__variantes">{[m.variante, m.variantes_nota].filter(Boolean).join(' · ')}</div>
                  ) : null}
                  {textos.materiales_corto ? (
                    <div className="ficha__material">{textos.materiales_corto}</div>
                  ) : null}
                  <div>
                    {varias && !mismoPrecio ? (
                      // Cada medida con su precio, los dos del mismo tamano.
                      <ul className="ficha__opciones">
                        {f.variantes.map((v) => (
                          <li key={v.id}>
                            <span className="ficha__opcion">{v.variante ?? v.sku}</span>
                            <span className="ficha__opcion-precio">{formatearBs(v.precio_bs)}</span>
                            <span className="ficha__opcion-precio">{formatearBcv(v.precio_usd)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <>
                        <div className="ficha__precio">{formatearBs(m.precio_bs)}</div>
                        <div className="ficha__precio">{formatearBcv(m.precio_usd)}</div>
                      </>
                    )}
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

          <p className="catalogo__pie">
            {textos.catalogo_pie ?? 'Lux by Emory · Desde Sabana de Mendoza para toda Venezuela'}
          </p>
        </>
      )}
    </div>
  );
}
