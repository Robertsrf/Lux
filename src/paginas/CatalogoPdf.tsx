import { useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { Aviso, Cargando, Vacio } from '../componentes/Piezas';
import { Monograma, Wordmark } from '../componentes/Marca';
import { formatearBs, formatearFecha, formatearUsd } from '../lib/dinero';
import { urlPublicaFoto } from '../lib/fotos';
import type { ModeloVenta } from '../lib/tipos';
import '../estilos/impresion.css';

const TAMANO_PAGINA = 500;
const TOPE = 4000;

/**
 * Catalogo en PDF: se genera con esta hoja de estilos y el "Guardar como PDF"
 * del navegador. Sin librerias, con control total de la marca.
 *
 * Nunca incluir el logo de SGS ni reproducir certificados del proveedor: son
 * documentos privados de respaldo, no material de marca.
 */
export function CatalogoPdf() {
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
            .select('id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, grupo, precio_usd, precio_bs, precio_usd_bcv_ref, existencia_total')
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

  if (cargando) return <Cargando texto="Armando el catalogo" />;

  return (
    <div className="pagina catalogo">
      <div className="encabezado-pagina sin-impresion">
        <div>
          <h1>Catalogo</h1>
          <p>Solo modelos con existencia. Imprime y elige "Guardar como PDF".</p>
        </div>
        <button type="button" className="boton" onClick={() => window.print()}>Imprimir o guardar PDF</button>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo cargar el catalogo">{error}</Aviso> : null}

      <section className="catalogo__portada">
        <Monograma tamano={72} />
        <Wordmark tamano={56} />
        <p className="catalogo__dato">Catalogo del {formatearFecha(new Date().toISOString())}</p>
        <p className="catalogo__dato">{modelos.length} modelos disponibles</p>
      </section>

      {modelos.length === 0 ? (
        <Vacio titulo="Todavia no hay modelos con existencia">
          <p>Carga modelos con cantidad en alguna ubicacion y vuelve aqui.</p>
        </Vacio>
      ) : (
        <>
          <div className="catalogo__rejilla">
            {modelos.map((m) => {
              const foto = urlPublicaFoto(m.foto_path ?? m.foto_thumb_path);
              return (
                <article className="ficha" key={m.id}>
                  {foto
                    ? <img className="ficha__foto" src={foto} alt={m.nombre} loading="lazy" />
                    : <div className="ficha__foto" />}
                  <div className="ficha__sku">{m.sku}</div>
                  <div className="ficha__nombre">{m.nombre}</div>
                  {m.variantes_nota ? <div className="ficha__variantes">{m.variantes_nota}</div> : null}
                  <div>
                    <div className="ficha__precio">{formatearBs(m.precio_bs)}</div>
                    <div className="ficha__precio-usd">{formatearUsd(m.precio_usd)}</div>
                  </div>
                </article>
              );
            })}
          </div>

          <p className="catalogo__pie">Lux by Emory · Desde Sabana de Mendoza para toda Venezuela</p>
        </>
      )}
    </div>
  );
}
