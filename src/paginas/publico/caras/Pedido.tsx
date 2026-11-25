import type { ReactNode } from 'react';
import { Campo, ResumenErrores } from '../../../componentes/Piezas';
import { formatearBcv, formatearBs, formatearDescuento, precioEnBs } from '../../../lib/dinero';
import { urlPublicaFoto } from '../../../lib/fotos';
import { nombreConVariante } from '../../../lib/familias';
import { decirMinutos } from '../../../hooks/useReglasPedido';
import { TusDatos, datosParaReservar, queFalta } from '../../../componentes/TusDatos';
import { TusCodigos } from '../landing/TusCodigos';
import type { CatalogoLux } from '../useCatalogoLux';
import { Cabecera } from './Cabecera';
import { IcoMas, IcoMenos, IcoVolver } from './iconos';

/**
 * "Tu pedido" (fase 10, estilo A): las tres partes numeradas (tus piezas,
 * tus datos, cómo lo recibes), "Qué pasa al apartar" con las cifras de la
 * base y "Apartar mis piezas". La lógica es la de siempre (useCatalogoLux);
 * aquí solo se dibuja.
 */
export function Pedido({ c, hojaArmar }: { c: CatalogoLux; hojaArmar: ReactNode }) {
  const { resumen, seleccion, conocidos, armados, tasa, entrega, agencia, direccion, datos, reglas, whatsappTienda, error, textos } = c;
  const elegidos = [...seleccion.entries()].map(([id, cantidad]) => ({ id, m: conocidos.get(id), cantidad }));
  const faltaEnvio = entrega === 'envio' && (!agencia.trim() || !direccion.trim());
  const listos = datosParaReservar(datos);

  return (
    <div className="pub">
      <Cabecera c={c} conBuscador={false} />
      <main className="pub-contenedor pub-pedido">
        <button type="button" className="pub-enlace pub-volver" onClick={() => c.setPaso('catalogo')}>
          <IcoVolver /> Seguir viendo joyas
        </button>
        <h1 className="pub-titulo pub-titulo--grande">Tu pedido</h1>
        <p className="pub-prosa pub-pedido__intro">
          {resumen.piezas} joya{resumen.piezas === 1 ? '' : 's'}
          {resumen.descuento ? `, con ${formatearDescuento(resumen.descuento)} de descuento por cantidad` : ''}.
          {' '}Tres pasos y quedan apartadas.
        </p>

        {error ? <ResumenErrores titulo="No se pudo apartar">{error}</ResumenErrores> : null}

        {/* Las partes numeradas: la clienta sabe dónde va y cuánto falta. */}
        <h2 className="pub-pedido__paso"><span aria-hidden="true">1</span> Tus piezas</h2>
        <ul className="pub-lineas">
          {elegidos.map(({ id, m, cantidad }) => {
            const precio = resumen.precioDe.get(id) ?? m?.precio_usd ?? null;
            const nombre = m ? nombreConVariante(m.nombre, m.variante) : 'Pieza';
            const foto = m ? urlPublicaFoto(m.foto_thumb_path) : null;
            return (
              <li className="pub-linea" key={id}>
                {foto ? <img className="pub-linea__foto" src={foto} alt="" /> : <span className="pub-linea__foto" />}
                <div className="pub-linea__cuerpo">
                  <p className="pub-linea__nombre">{nombre}</p>
                  <p className="pub-linea__precio">
                    {precio !== null ? `${formatearBs(precioEnBs(precio, tasa))} c/u` : ''}
                    {m ? <span className="pub-secundario"> · quedan {m.disponible}</span> : null}
                  </p>
                  {resumen.ofertaDe.has(id) ? (
                    <p className="pub-linea__nota">
                      {(resumen.ofertaDe.get(id) ?? 0) < cantidad ? `${resumen.ofertaDe.get(id)} con tu código` : 'Con tu código'}
                    </p>
                  ) : null}
                  {/* La cadena dice qué dijes lleva puestos, y deja ponerle uno. */}
                  {m?.armado === 'base' ? (
                    <>
                      {armados.some((p) => p.base === id) ? (
                        <p className="pub-linea__nota">
                          Con {armados.filter((p) => p.base === id)
                            .map((p) => nombreConVariante(conocidos.get(p.dije)?.nombre ?? 'un dije', conocidos.get(p.dije)?.variante))
                            .join(', ')}
                        </p>
                      ) : null}
                      <button type="button" className="pub-enlace pub-linea__dije" onClick={() => void c.abrirArmar(id)}>
                        Agrégale un dije
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="pub-contador pub-linea__contador">
                  <button type="button" className="pub-icono" aria-label={`Quitar una de ${nombre}`} onClick={() => c.cambiar(id, cantidad - 1)}><IcoMenos /></button>
                  <span className="pub-contador__n" aria-live="polite">{cantidad}</span>
                  <button type="button" className="pub-icono" aria-label={`Agregar una de ${nombre}`} disabled={!m || cantidad >= m.disponible} onClick={() => c.cambiar(id, cantidad + 1)}><IcoMas /></button>
                </div>
              </li>
            );
          })}
        </ul>

        <TusCodigos codigos={c.ofertas.codigos} estados={resumen.codigos} carrito={seleccion} alQuitar={c.ofertas.quitar} />

        <div className="pub-pedido__total" aria-busy={resumen.calculando}>
          <div>
            <p className="pub-pedido__rotulo">Tu total</p>
            <p className="pub-secundario pub-pedido__detalle">
              {resumen.piezas === 1 ? '1 joya vale' : `${resumen.piezas} joyas valen`} {formatearBs(precioEnBs(resumen.subtotal, tasa))}
              {resumen.descuento ? ', menos el descuento por cantidad' : ''}
              {resumen.conOferta ? `${resumen.descuento ? ' y' : ', menos'} tus códigos` : ''}
            </p>
          </div>
          <div className="pub-pedido__cifras">
            <span className="pub-precio">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</span>
            <span className="pub-precio pub-secundario">{formatearBcv(resumen.totalUsd)}</span>
          </div>
        </div>

        <h2 className="pub-pedido__paso"><span aria-hidden="true">2</span> Tus datos</h2>
        <TusDatos valor={datos} alCambiar={c.setDatos} />

        <h2 className="pub-pedido__paso"><span aria-hidden="true">3</span> Cómo lo recibes</h2>
        <div className="pub-pedido__entrega">
          <div className="pub-pedido__opciones" role="group" aria-label="Cómo lo recibes">
            <button type="button" className="pub-ficha" aria-pressed={entrega === 'tienda'} onClick={() => c.setEntrega('tienda')}>Retiro en tienda</button>
            <button type="button" className="pub-ficha" aria-pressed={entrega === 'envio'} onClick={() => c.setEntrega('envio')}>Envío a mi ciudad</button>
          </div>
          {entrega === 'envio' ? (
            <>
              <p className="pub-secundario">El envío se paga al retirarlo en la agencia, no ahora.</p>
              <div className="pub-pedido__opciones" role="group" aria-label="Empresa de envíos">
                <button type="button" className="pub-ficha" aria-pressed={c.empresa === 'domesa'} onClick={() => c.setEmpresa('domesa')}>Domesa</button>
                <button type="button" className="pub-ficha" aria-pressed={c.empresa === 'mrw'} onClick={() => c.setEmpresa('mrw')}>MRW</button>
              </div>
              <div className="fila">
                <Campo etiqueta="Agencia" htmlFor="r-agencia" pista="La sucursal donde lo vas a retirar.">
                  <input id="r-agencia" value={agencia} onChange={(e) => c.setAgencia(e.target.value)} required />
                </Campo>
                <Campo etiqueta="Dirección de la agencia" htmlFor="r-dir">
                  <input id="r-dir" value={direccion} onChange={(e) => c.setDireccion(e.target.value)} required />
                </Campo>
              </div>
            </>
          ) : (
            <p className="pub-secundario">
              Te esperamos en la tienda con tu cédula{textos.direccion_tienda ? `: ${textos.direccion_tienda}` : ''}.
            </p>
          )}
        </div>

        {/* Antes del botón, lo que pasa al tocarlo, con las cifras de verdad. */}
        <div className="pub-pedido__que-pasa">
          <p className="pub-pedido__rotulo">Qué pasa al apartar</p>
          <p className="pub-prosa">
            {reglas
              ? `Tus piezas quedan guardadas a tu nombre ${decirMinutos(reglas.reserva_minutos)}. En la página de tu pedido pagas el total, o al menos el ${formatearDescuento(reglas.apartado_inicial_pct)} para apartarlas ${reglas.apartado_dias} días y pagar lo demás por partes. Si no terminas de pagar a tiempo, lo abonado no se devuelve y las piezas vuelven a la venta.`
              : 'Tus piezas quedan guardadas a tu nombre mientras pagas. En la página de tu pedido pagas el total, o solo una parte para apartarlas unos días y pagar lo demás por partes; ahí te decimos cuánto y hasta cuándo.'}
            {whatsappTienda ? ' Ahí mismo nos avisas por WhatsApp con un toque.' : ''}
          </p>
        </div>

        <div className="pub-pedido__acciones">
          <button
            type="button" className="pub-boton pub-boton--ancho"
            disabled={c.reservando || resumen.piezas === 0 || !listos || faltaEnvio}
            onClick={() => void c.reservar()}
          >
            {c.reservando ? 'Apartando' : 'Apartar mis piezas'}
          </button>
          {/* Un botón apagado sin explicación es una trampa. */}
          {!listos
            ? <p className="pub-secundario">{queFalta(datos)}</p>
            : faltaEnvio ? <p className="pub-secundario">Falta la agencia y su dirección para el envío.</p> : null}
          <button type="button" className="pub-boton pub-boton--claro pub-boton--ancho" onClick={() => c.setPaso('catalogo')}>Seguir viendo</button>
        </div>
        {/* Vaciar pesaba lo mismo que seguir: es un enlace, lejos del botón. */}
        <button type="button" className="pub-enlace pub-pedido__vaciar" onClick={() => { c.vaciar(); c.setPaso('catalogo'); }}>
          Vaciar el pedido
        </button>
        {hojaArmar}
      </main>
    </div>
  );
}
