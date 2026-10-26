import { useId } from 'react';
import type { ReactNode } from 'react';
import { fuenteFoto } from '../lib/fotos';
import { conFoto, etiquetasCortas, nombreConVariante, nombreDeTipo, rangoDe } from '../lib/familias';
import type { Familia } from '../lib/familias';
import { formatearBcv, formatearBs } from '../lib/dinero';

/**
 * Las piezas de la vitrina en línea: el catálogo de la tienda y el de cada
 * revendedor, que es el mismo vestido de sus colores (rediseño del
 * 24/10/2026).
 *
 * Antes cada catálogo dibujaba su tarjeta a mano, casi línea por línea igual,
 * y cada copia se iba por su lado. Aquí viven una vez: la tarjeta, los
 * cuadros por tipo, el estante y "Cómo pedir". Lo que cambia entre los dos
 * (de dónde salen las piezas, cómo se aparta, a quién se le paga) se queda
 * en cada página.
 */

/** Lo que la tarjeta necesita de una pieza: lo mismo en los dos catálogos, sin costo. */
export interface PiezaVitrina {
  id: number;
  familia: number;
  nombre: string;
  variante: string | null;
  variantes_nota: string | null;
  foto_path: string | null;
  foto_thumb_path: string | null;
  precio_bs: number | null;
  precio_usd: number | null;
}

/** Lo que la tarjeta hace con el pedido. Sin esto es de Próximamente: se mira, no se pide. */
export interface PedidoTarjeta {
  /** "pedido" o "apartado": lo oye quien usa lector de pantalla. */
  destino: string;
  llevas: (id: number) => number;
  disponible: (id: number) => number;
  alAgregar: (id: number) => void;
  alCambiar: (id: number, cantidad: number) => void;
  /** Una pieza con medidas: abre la hoja de elegir. */
  alElegir: () => void;
}

/**
 * La tarjeta de vitrina. Foto, nombre, las medidas en corto, los dos precios
 * del mismo tamaño y cuántas quedan; abajo, "Agregar".
 *
 * Es la del mostrador sin lo que era de la tienda: el material, repetido en
 * cada tarjeta, se dice una vez arriba y en el detalle, y la clave de bodega
 * pasó al detalle. Cuántas quedan ya no va en alerta: "Quedan 2" lo decían
 * 82 de cada 100 tarjetas, y con "Última pieza" en alerta seguían siendo 25
 * de 42 en el inicio. Una alerta que sale en todas no avisa de nada; el
 * texto ya dice lo que hay que saber.
 */
export function TarjetaPieza<T extends PiezaVitrina>({ familia, alVer, pedido, proxima = false }: {
  familia: Familia<T>;
  alVer: () => void;
  pedido?: PedidoTarjeta;
  proxima?: boolean;
}) {
  const m = familia.cabeza;
  const unica = familia.variantes.length === 1;
  const portada = conFoto(familia.variantes) ?? m;
  const foto = fuenteFoto(portada.foto_path, portada.foto_thumb_path, '(max-width: 640px) 46vw, 240px');
  const bs = rangoDe(familia.variantes, (v) => v.precio_bs);
  const bcv = rangoDe(familia.variantes, (v) => v.precio_usd);
  const etiquetas = etiquetasCortas(familia);
  const nombre = unica ? nombreConVariante(m.nombre, m.variante) : m.nombre;
  const quedan = pedido ? familia.variantes.reduce((n, v) => n + pedido.disponible(v.id), 0) : 0;
  const puestas = pedido ? familia.variantes.reduce((n, v) => n + pedido.llevas(v.id), 0) : 0;
  const agotado = pedido ? familia.variantes.every((v) => pedido.llevas(v.id) >= pedido.disponible(v.id)) : true;

  return (
    <article className={proxima ? 'tarjeta-modelo tarjeta-modelo--proxima' : 'tarjeta-modelo'}>
      <button
        type="button"
        className="tarjeta-modelo__principal"
        onClick={alVer}
        aria-label={`Ver de cerca ${nombre}${proxima ? ', próximamente' : ''}`}
      >
        {foto
          ? <img className="tarjeta-modelo__foto" {...foto} alt="" loading="lazy" />
          : <span className="tarjeta-modelo__foto" />}
        <span className="tarjeta-modelo__cuerpo">
          <span className="tarjeta-modelo__nombre">{m.nombre}</span>
          {etiquetas ? <span className="tarjeta-modelo__variantes">{etiquetas}</span> : null}
          {unica && m.variantes_nota ? <span className="celda-nota">{m.variantes_nota}</span> : null}
          {/* Los dos precios del mismo tamaño: la clienta piensa en
              bolívares o en dólares, y ninguno es la letra chica. Con
              medidas de distinto precio, el más bajo y "desde". */}
          {bs.min !== bs.max ? <span className="tarjeta-modelo__desde">desde</span> : null}
          <span className="tarjeta-modelo__precio">{formatearBs(bs.min)}</span>
          <span className="tarjeta-modelo__precio">{formatearBcv(bcv.min)}</span>
          <span className="tarjeta-modelo__pie">
            {proxima ? (
              <span className="etiqueta etiqueta--proxima">Próximamente</span>
            ) : (
              <span className="tarjeta-modelo__existencia">
                {quedan === 1 ? 'Última pieza' : `Quedan ${quedan}`}
              </span>
            )}
          </span>
        </span>
      </button>

      {/* La acción, fuera del botón de ver: dos botones hermanos, no uno
          dentro del otro. */}
      {pedido ? (
        <div className="tarjeta-modelo__accion">
          {!unica ? (
            <button
              type="button"
              className="boton boton--secundario tarjeta-modelo__agregar"
              onClick={pedido.alElegir}
              aria-haspopup="dialog"
              aria-label={`Elegir cuál de ${m.nombre}: ${etiquetas}`}
            >
              {puestas > 0 ? `Llevas ${puestas} · elegir` : 'Elegir'}
            </button>
          ) : puestas > 0 ? (
            <div className="contador contador--tarjeta">
              <button type="button" aria-label={`Quitar una de ${nombre}`} onClick={() => pedido.alCambiar(m.id, puestas - 1)}>&minus;</button>
              <span className="contador__valor" aria-live="polite">{puestas}</span>
              <button type="button" aria-label={`Agregar otra de ${nombre}`} disabled={agotado} onClick={() => pedido.alCambiar(m.id, puestas + 1)}>+</button>
            </div>
          ) : (
            <button
              type="button"
              className="boton boton--secundario tarjeta-modelo__agregar"
              onClick={() => pedido.alAgregar(m.id)}
              disabled={agotado}
              aria-label={`Agregar ${nombre} al ${pedido.destino}`}
            >
              Agregar
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

/** Un cuadro de "Elige por tipo": la foto de una de sus piezas, su nombre y cuántas hay. */
export interface TipoVitrina {
  nombre: string;
  cuantas: number;
  foto: ReturnType<typeof fuenteFoto>;
}

/**
 * Las categorías a la vista, con foto. Antes vivían plegadas dentro de
 * "Filtrar": la clienta no sabía que había tobilleras o sets hasta abrirlo
 * (o hasta tocar "Ver más"). En el teléfono, tres por fila.
 */
export function TiposConFoto({ tipos, alElegir }: { tipos: TipoVitrina[]; alElegir: (tipo: string) => void }) {
  const id = useId();
  if (tipos.length < 2) return null;
  return (
    <section className="tipos" aria-labelledby={id}>
      <h2 className="seccion-titulo" id={id}>Elige por tipo</h2>
      <ul className="tipos__lista">
        {tipos.map((t) => (
          <li key={t.nombre}>
            <button type="button" className="tipo" onClick={() => alElegir(t.nombre)}>
              {t.foto
                ? <img className="tipo__foto" {...t.foto} alt="" loading="lazy" />
                : <span className="tipo__foto" />}
              <span className="tipo__nombre">{nombreDeTipo(t.nombre)}</span>
              <span className="tipo__cuantas">{t.cuantas === 1 ? '1 pieza' : `${t.cuantas} piezas`}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cuántas piezas lleva cada estante del inicio: dos filas de dos en el teléfono. */
export const POR_ESTANTE = 4;

/**
 * Un estante del inicio: una categoría con sus primeras piezas y "Ver
 * todas". Así cada tipo sale en la primera vista, aunque haya cien anillos
 * antes que la primera tobillera.
 */
export function Estante({ titulo, cuantas, alVerTodas, children }: {
  titulo: string;
  cuantas: number;
  alVerTodas?: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="estante" aria-labelledby={id}>
      <div className="estante__cabeza">
        <h2 className="estante__titulo" id={id}>
          {titulo} <span className="estante__cuantas">{cuantas}</span>
        </h2>
        {alVerTodas ? (
          <button type="button" className="estante__ver" onClick={alVerTodas}>
            Ver todas<span className="visualmente-oculto"> las de {titulo}</span>
          </button>
        ) : null}
      </div>
      <div className="rejilla-venta">{children}</div>
    </section>
  );
}

export interface PasoPedido {
  titulo: string;
  texto: ReactNode;
}

/**
 * Cómo se pide, entero y con las cifras de verdad. Antes la clienta lo
 * descubría a mitad del camino: el 40 %, los días, el pago móvil y el envío
 * salían después de dar su cédula. Las cifras las pasa cada página (de la
 * base, nunca escritas aquí).
 */
export function ComoPedir({ id, pasos, pie }: { id?: string; pasos: PasoPedido[]; pie?: ReactNode }) {
  const idTitulo = useId();
  return (
    <section className="como-pedir" id={id} aria-labelledby={idTitulo}>
      <h2 className="seccion-titulo" id={idTitulo}>Cómo pedir</h2>
      <ol className="como-pedir__pasos">
        {pasos.map((p, n) => (
          <li key={p.titulo} className="como-pedir__paso">
            <span className="como-pedir__numero" aria-hidden="true">{n + 1}</span>
            <div>
              <h3 className="como-pedir__titulo">{p.titulo}</h3>
              <p className="como-pedir__texto">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
      {pie ? <p className="como-pedir__pie">{pie}</p> : null}
    </section>
  );
}

/**
 * Los pasos en una línea cada uno, en la portada: lo primero que se lee
 * dice cómo se pide. El detalle está abajo, en "Cómo pedir".
 */
export function AsiPides({ pasos, alVerMas }: { pasos: string[]; alVerMas: () => void }) {
  return (
    <div className="asi-pides">
      <ol className="asi-pides__pasos">
        {pasos.map((p, n) => (
          <li key={p}><span className="asi-pides__numero" aria-hidden="true">{n + 1}</span>{p}</li>
        ))}
      </ol>
      <button type="button" className="asi-pides__mas" onClick={alVerMas}>Cómo funciona, paso a paso</button>
    </div>
  );
}

/** Ir a una sección de la página sin tocar la ruta: el sitio usa `#/` para navegar. */
export function irA(id: string) {
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
}
