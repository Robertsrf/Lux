import { useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Aviso, Cargando, Vacio } from '../componentes/Piezas';
import { Monograma, Wordmark } from '../componentes/Marca';
import { formatearBs, formatearFecha, formatearUsd } from '../lib/dinero';
import { urlPublicaFoto } from '../lib/fotos';
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
            .select('id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, grupo, precio_usd, precio_bs, precio_usd_real, existencia_total')
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
  const tandas = useMemo(() => {
    const salida: ModeloVenta[][] = [];
    for (let i = 0; i < modelos.length; i += POR_TANDA) salida.push(modelos.slice(i, i + POR_TANDA));
    return salida;
  }, [modelos]);

  if (cargando) return <Cargando texto="Armando el catalogo" />;

  return (
    <div className="pagina catalogo">
      <div className="encabezado-pagina sin-impresion">
        <div>
          <h1>Catalogo</h1>
          <p>Solo modelos con existencia. Imprime y elige "Guardar como PDF".</p>
        </div>
        <div>
          <button type="button" className="boton" onClick={() => window.print()}>Imprimir o guardar PDF</button>
          <p className="campo__pista" style={{ marginTop: 'var(--e-2)', maxWidth: '34ch' }}>
            En el cuadro de impresion: <strong style={{ display: 'inline' }}>marca "Graficos de fondo"</strong>
            —sin eso la portada sale en blanco— y desmarca "Encabezados y pies de pagina",
            para que no salga la direccion web en el papel.
          </p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo cargar el catalogo">{error}</Aviso> : null}

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
          Catalogo del {formatearFecha(new Date().toISOString())} · {modelos.length} modelos disponibles
        </p>

        <p className="portada__lugar">
          {textos.catalogo_pie ?? 'Lux by Emory · Desde Sabana de Mendoza para toda Venezuela'}
        </p>
      </section>

      {modelos.length === 0 ? (
        <Vacio titulo="Todavia no hay modelos con existencia">
          <p>Carga modelos con cantidad en alguna ubicacion y vuelve aqui.</p>
        </Vacio>
      ) : (
        <>
          {tandas.map((tanda, t) => (
          <div key={t}>
          <div className="catalogo__rejilla">
            {tanda.map((m) => {
              const foto = urlPublicaFoto(m.foto_path ?? m.foto_thumb_path);
              return (
                <article className="ficha" key={m.id}>
                  {foto
                    ? <img className="ficha__foto" src={foto} alt={m.nombre} loading="lazy" />
                    : <div className="ficha__foto" />}
                  <div className="ficha__sku">{m.sku}</div>
                  <div className="ficha__nombre">{m.nombre}</div>
                  {m.variantes_nota ? <div className="ficha__variantes">{m.variantes_nota}</div> : null}
                  {textos.materiales_corto ? (
                    <div className="ficha__material">{textos.materiales_corto}</div>
                  ) : null}
                  <div>
                    <div className="ficha__precio">{formatearBs(m.precio_bs)}</div>
                    <div className="ficha__precio-usd">{formatearUsd(m.precio_usd)}</div>
                    <div className="ficha__existencia">
                      {m.existencia_total === 1 ? 'Queda 1 pieza' : `Quedan ${m.existencia_total} piezas`}
                    </div>
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
