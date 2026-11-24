import { useMemo, useState } from 'react';
import { Vacio } from '../../../../componentes/Piezas';
import { formatearBcv } from '../../../../lib/dinero';
import { nombreConVariante } from '../../../../lib/familias';
import { urlPublicaFoto } from '../../../../lib/fotos';
import type { PiezaRevendedor } from '../../../../lib/tipos';
import { ordenarPiezas } from './cuentas';
import type { Carrito } from './cuentas';

const DE_A = 60;

/**
 * ① Piezas: fotos grandes, un toque suma una. Lo suyo primero (#72): en
 * persona vende lo que lleva encima, así que si tiene algo empieza en
 * "Tuyas".
 */
export function PasoPiezas({ piezas, carrito, alCambiar }: {
  piezas: PiezaRevendedor[];
  carrito: Carrito;
  alCambiar: (id: number, cantidad: number) => void;
}) {
  const hayTuyas = piezas.some((p) => (p.mias ?? 0) > 0);
  const [ver, setVer] = useState<'tuyas' | 'todas'>(hayTuyas ? 'tuyas' : 'todas');
  const [texto, setTexto] = useState('');
  const [cuantas, setCuantas] = useState(DE_A);
  const lista = useMemo(() => ordenarPiezas(piezas, ver, texto), [piezas, ver, texto]);
  const visibles = lista.slice(0, cuantas);

  return (
    <section aria-labelledby="vrv-piezas">
      <h2 id="vrv-piezas" className="visualmente-oculto">Piezas</h2>
      <div className="vrv-buscar">
        <label className="visualmente-oculto" htmlFor="vrv-buscar">Buscar una pieza</label>
        <input
          id="vrv-buscar" type="search" autoComplete="off" value={texto} placeholder="Buscar: cadena, anillo..."
          onChange={(e) => { setTexto(e.target.value); setCuantas(DE_A); }}
        />
        {hayTuyas ? (
          <div className="vrv-ver" role="group" aria-label="Qué piezas ver">
            <button type="button" aria-pressed={ver === 'tuyas'} onClick={() => setVer('tuyas')}>Tuyas</button>
            <button type="button" aria-pressed={ver === 'todas'} onClick={() => setVer('todas')}>Todas</button>
          </div>
        ) : null}
      </div>

      {visibles.length === 0 ? (
        <Vacio titulo={piezas.length === 0 ? 'No hay piezas en tu catálogo ahora' : 'Nada con ese nombre'}>
          <p>{piezas.length === 0 ? 'Cuando la tienda tenga piezas libres, salen aquí.' : 'Prueba con otra palabra o toca «Todas».'}</p>
        </Vacio>
      ) : (
        <div className="vrv-piezas">
          {visibles.map((p) => {
            const n = carrito.get(p.id) ?? 0;
            const nombre = nombreConVariante(p.nombre, p.variante);
            const foto = urlPublicaFoto(p.foto_thumb_path ?? p.foto_path);
            const lleno = n >= p.disponible;
            return (
              <article className={`vrv-pieza${n > 0 ? ' vrv-pieza--elegida' : ''}`} key={p.id}>
                <button
                  type="button" className="vrv-pieza__toque" disabled={lleno}
                  aria-label={lleno ? `${nombre}: ya llevas todas las libres` : `Agregar una de ${nombre}`}
                  onClick={() => alCambiar(p.id, n + 1)}
                >
                  <span className="vrv-pieza__foto">
                    {foto ? <img src={foto} alt="" loading="lazy" /> : null}
                    {p.mias ? <span className="vrv-pieza__tuyas">Tuyas: {p.mias}</span> : null}
                    {n > 0 ? <span className="vrv-pieza__lleva" aria-hidden="true">{n}</span> : null}
                  </span>
                  <span className="vrv-pieza__nombre">{nombre}</span>
                  <span className="vrv-pieza__precio">{formatearBcv(Number(p.precio_usd))}</span>
                  <span className="vrv-pieza__dato">
                    {p.precio_lux_usd !== null ? <>Te sale {formatearBcv(Number(p.precio_lux_usd))} · </> : null}
                    {p.disponible} {p.disponible === 1 ? 'libre' : 'libres'}
                  </span>
                </button>
                {n > 0 ? (
                  <div className="contador contador--tarjeta">
                    <button type="button" aria-label={`Quitar una de ${nombre}`} onClick={() => alCambiar(p.id, n - 1)}>&minus;</button>
                    <span className="contador__valor" aria-live="polite">{n}</span>
                    <button type="button" aria-label={`Agregar una de ${nombre}`} disabled={lleno} onClick={() => alCambiar(p.id, n + 1)}>+</button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {lista.length > visibles.length ? (
        <div className="acciones">
          <button type="button" className="boton boton--secundario" onClick={() => setCuantas((c) => c + DE_A)}>
            Ver más (faltan {lista.length - visibles.length})
          </button>
        </div>
      ) : null}
    </section>
  );
}
