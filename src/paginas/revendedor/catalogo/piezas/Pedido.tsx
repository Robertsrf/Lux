import { formatearBcv, formatearBs, formatearDescuento, precioEnBs } from '../../../../lib/dinero';
import { urlPublicaFoto } from '../../../../lib/fotos';
import { nombreConVariante } from '../../../../lib/familias';
import { useTasa } from '../../../../hooks/useTasa';
import { TusDatos, datosParaReservar, queFalta } from '../../../../componentes/TusDatos';
import type { CatalogoRv } from '../tipos';
import { Dialogo } from './Dialogo';

const piezas = (n: number) => `${n} pieza${n === 1 ? '' : 's'}`;

/** La barra de abajo, siempre a la vista con algo elegido: cuántas y cuánto. */
export function BarraPedido({ c }: { c: CatalogoRv }) {
  const { tasa } = useTasa();
  if (c.resumen.piezas === 0) return null;
  return (
    <div className="rvc-barra">
      <div className="rvc-barra__resumen">
        <span className="rvc-barra__piezas">{piezas(c.resumen.piezas)}</span>
        <span className="rvc-barra__total">{formatearBs(precioEnBs(c.resumen.totalUsd, tasa))}</span>
      </div>
      <button type="button" className="rvc-boton" onClick={c.abrirPedido}>Ver mi pedido</button>
    </div>
  );
}

/**
 * El pedido en una hoja: las piezas, el total, la cédula y "Apartar". Antes
 * era otra pantalla; ahora se aparta sin salir del catálogo.
 */
export function HojaPedido({ c }: { c: CatalogoRv }) {
  const { tasa } = useTasa();
  const abierto = c.pedidoAbierto && c.elegidos.length > 0;
  const p = c.perfil;
  const horas = p?.horas_pago ? `${p.horas_pago} horas` : 'unas horas';
  const listo = datosParaReservar(c.datos);

  return (
    <Dialogo abierto={abierto} alCerrar={c.cerrarPedido} titulo="Tu pedido" clase="rvc-dialogo--pedido">
      <div className="rvc-pedido">
        <div className="rvc-pedido__cabeza">
          <h2 className="rvc-titulo">Tu pedido</h2>
          <button type="button" className="rvc-boton rvc-boton--claro rvc-boton--chico" onClick={c.cerrarPedido}>Seguir viendo</button>
        </div>

        <ul className="rvc-pedido__lineas">
          {c.elegidos.map(({ m, cantidad }) => {
            const mini = urlPublicaFoto(m.foto_thumb_path);
            const nombre = nombreConVariante(m.nombre, m.variante);
            return (
              <li key={m.id} className="rvc-linea">
                {mini ? <img className="rvc-linea__foto" src={mini} alt="" /> : <span className="rvc-linea__foto" aria-hidden="true" />}
                <span className="rvc-linea__datos">
                  <span className="rvc-linea__nombre">{nombre}</span>
                  <span className="rvc-nota">{formatearBs(m.precio_bs)} · {formatearBcv(m.precio_usd)}</span>
                </span>
                <span className="rvc-contador" role="group" aria-label={`${nombre}: ${cantidad}`}>
                  <button type="button" aria-label={`Quitar una de ${nombre}`} onClick={() => c.cambiar(m.id, cantidad - 1)}>−</button>
                  <span>{cantidad}</span>
                  <button type="button" aria-label={`Agregar otra de ${nombre}`} disabled={cantidad >= m.disponible} onClick={() => c.cambiar(m.id, cantidad + 1)}>+</button>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="rvc-total">
          <span>Total · {piezas(c.resumen.piezas)}</span>
          <span className="rvc-total__cifras">
            <span className="rvc-total__cifra">{formatearBs(precioEnBs(c.resumen.totalUsd, tasa))}</span>
            <span className="rvc-total__cifra">{formatearBcv(c.resumen.totalUsd)}</span>
          </span>
        </div>

        <section className="rvc-pedido__datos" aria-label="Tus datos">
          <h3 className="rvc-etiqueta">Tus datos</h3>
          <TusDatos valor={c.datos} alCambiar={c.setDatos} buscar={c.buscarSuClienta} vendedor={c.primerNombre} />
        </section>

        {c.error ? <p className="rvc-error" role="alert">{c.error}</p> : null}

        <div className="rvc-pedido__acciones">
          <button type="button" className="rvc-boton rvc-boton--ancho" disabled={c.apartando || !listo} onClick={() => void c.apartar()}>
            {c.apartando ? 'Apartando…' : 'Apartar mis piezas'}
          </button>
          {!listo ? <p className="rvc-nota">{queFalta(c.datos)}</p> : null}
          <p className="rvc-nota">
            Te las guardo {horas} mientras me pagas por pago móvil. Mis datos salen en la pantalla siguiente, y ahí me avisas que pagaste.
            {p?.dias_credito
              ? ` Puedes pagar el total, o al menos el ${p.inicial_pct ? formatearDescuento(p.inicial_pct) : 'mínimo'} y tienes ${p.dias_credito} días para pagar lo demás.`
              : ' Se paga el total.'}
          </p>
          <button type="button" className="rvc-enlace" onClick={() => { c.vaciar(); c.cerrarPedido(); }}>Vaciar mi pedido</button>
        </div>
      </div>
    </Dialogo>
  );
}
