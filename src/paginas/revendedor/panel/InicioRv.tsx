import { Link } from 'react-router-dom';
import { Aviso, Ayuda, Cargando } from '../../../componentes/Piezas';
import { Progreso } from '../../../componentes/Progreso';
import { CompartirCatalogo } from '../../../componentes/CompartirCatalogo';
import { bsDeBcv, formatearBcv, formatearBs, formatearEntero, formatearMonto, formatearPorcentaje } from '../../../lib/dinero';
import { enlaceCatalogoRv } from '../../../lib/revendedor';
import { useTasa } from '../../../hooks/useTasa';
import type { ResumenRevendedor } from '../../../lib/tipos';
import { usePanelRv } from '../contexto';

const nombreMes = (aaaamm: string) => {
  const [a = 1970, m = 1] = aaaamm.split('-').map(Number);
  return new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(new Date(a, m - 1, 1));
};

/** Una frase sobre su nivel: en cuál está, por qué, y qué le falta para subir. */
function fraseNivel(r: ResumenRevendedor): string {
  const t = r.tope;
  if (t.manual) return 'Este tope te lo fijó Lux.';
  if (t.bajado) {
    return `Estás en el nivel ${t.nivel}: bajaste uno porque se te vencieron ${t.vencidos_recientes} apartados `
      + `en los últimos ${r.dias_ventana} días. Vuelves a subir solo cuando esos queden atrás.`;
  }
  if (t.falta_para_subir_usd !== null && t.siguiente_tope_usd !== null) {
    return `Nivel ${t.nivel} de ${t.niveles}. Cuando hayas retirado ${formatearBcv(t.falta_para_subir_usd)} más, `
      + `tu tope sube a ${formatearBcv(t.siguiente_tope_usd)}.`;
  }
  return `Estás en el nivel más alto: ${formatearBcv(t.tope_usd)}.`;
}

/**
 * Lo que ve al entrar. La cifra que manda es lo que ganó en el mes: lo que
 * cobró a sus clientas por lo que ya retiró, menos lo que le pagó a Lux.
 * Al lado, lo que le deben. Debajo, su tope, su enlace y sus meses.
 */
export function InicioRv() {
  const { resumen } = usePanelRv();
  const { tasa } = useTasa();

  if (!resumen) return <Cargando texto="Abriendo tu panel" />;

  const primer = resumen.nombre.trim().split(/\s+/)[0];
  const t = resumen.tope;
  const pct = t.tope_usd > 0 ? (Number(t.usado_usd) / Number(t.tope_usd)) * 100 : null;
  const mes = resumen.mes;
  const credito = Number(resumen.credito_usd);
  const fases = resumen.fases ?? {};

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Hola, {primer}</h1>
          <p>Así va tu negocio este mes.</p>
        </div>
      </div>

      {/* Lo que espera algo de él, en una frase y con el enlace. */}
      {(fases.por_confirmar ?? 0) + (fases.por_pagar_lux ?? 0) + (fases.vendido ?? 0) > 0 ? (
        <Aviso tono="alerta" titulo="Tienes pedidos que esperan por ti">
          {[
            fases.por_confirmar ? `${fases.por_confirmar} con un pago de tu clienta por confirmar` : null,
            fases.por_pagar_lux ? `${fases.por_pagar_lux} por pagarle a Lux antes de que se venza tu plazo` : null,
            fases.vendido ? `${fases.vendido} aprobado${fases.vendido === 1 ? '' : 's'}, por retirar en la tienda` : null,
          ].filter(Boolean).join('; ')}.
          {' '}<Link to="/rv/apartados">Ver pedidos</Link>
        </Aviso>
      ) : null}

      <section className="tarjeta plan" aria-label="Este mes">
        <div className="plan__cifras">
          <div>
            <div className="plan__numero">{formatearBcv(mes.ganancia_usd)}</div>
            <div className="plan__unidad">ganaste este mes</div>
            <p className="plan__para">
              {mes.piezas > 0
                ? `Vendiste ${formatearEntero(mes.piezas)} ${mes.piezas === 1 ? 'pieza' : 'piezas'} por ${formatearBcv(mes.vendido_usd)}.`
                : 'Todavía no has retirado piezas este mes.'}
            </p>
            {mes.piezas > 0 ? <p className="plan__dia">A Lux le pagaste {formatearBcv(mes.pagado_usd)}.</p> : null}
          </div>
          <div className="plan__secundaria">
            <span className="dato__etiqueta">Tus clientas te deben</span>
            <div className="dato__valor dato__valor--grande">{formatearBcv(credito)}</div>
            {tasa && credito > 0 ? <div className="campo__pista">Hoy son {formatearBs(bsDeBcv(credito, tasa.tasa_bcv))}.</div> : null}
            {credito > 0 ? (
              <Link className="boton boton--secundario boton--pequeno" style={{ marginTop: 'var(--e-3)' }} to="/rv/apartados?ver=deben">
                Cargar lo que te pagan
              </Link>
            ) : null}
            <div className="campo__pista">
              {resumen.abiertos === 1 ? '1 pedido abierto.' : `${formatearEntero(resumen.abiertos)} pedidos abiertos.`}
            </div>
          </div>
        </div>
      </section>

      <h2 className="seccion-titulo">Tu tope de apartados</h2>
      <div className="tarjeta">
        <Progreso
          titulo="Apartado ahora"
          pct={pct}
          pie={<>Tienes apartado {formatearBcv(t.usado_usd)} de {formatearBcv(t.tope_usd)}. Te quedan {formatearBcv(t.libre_usd)} para apartar.</>}
        />
        <p className="plan__ritmo" style={{ marginTop: 'var(--e-4)' }}>{fraseNivel(resumen)}</p>
        <p className="campo__pista">Se cuenta a lo que le pagas a Lux por cada pieza.</p>
      </div>

      <h2 className="seccion-titulo">Tu catálogo</h2>
      <CompartirCatalogo
        titulo="Mándalo por WhatsApp"
        enlace={enlaceCatalogoRv(resumen.usuario)}
        mensaje={`Hola, te comparto mi catálogo de joyas. Aparta las que te gusten desde ahí:`}
        pista="Tu clienta ve las piezas a tu precio y las pide. Te aparecen en Pedidos."
      />

      <h2 className="seccion-titulo">Tus últimos meses</h2>
      <div className="tabla-envoltura">
        <table className="tabla rv-meses">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="num">Piezas</th>
              <th className="num rv-meses__vendido">Vendiste · $ BCV</th>
              <th className="num">Ganaste · $ BCV</th>
            </tr>
          </thead>
          <tbody>
            {[...resumen.meses].reverse().map((m) => (
              <tr key={m.mes}>
                <td>{nombreMes(m.mes)}</td>
                <td className="num">{formatearEntero(m.piezas)}</td>
                <td className="num precio rv-meses__vendido">{formatearMonto(m.vendido_usd)}</td>
                <td className="num precio">{formatearMonto(m.ganancia_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Ayuda titulo="Cómo funciona">
        <ul className="prosa">
          <li>
            Cada pieza te sale {formatearPorcentaje(resumen.descuento_pct, 0)} por debajo de la etiqueta de la tienda. En
            algunas un poco menos: lo ves pieza por pieza en <Link to="/rv/precios">Mis precios</Link>.
          </li>
          <li>
            Tu precio lo pones tú, siempre al menos {formatearBcv(resumen.sobre_etiqueta_usd)} por encima de la
            etiqueta: tu clienta nunca lo encuentra más barato en la tienda.
          </li>
          <li>
            Tu clienta pide desde tu catálogo (o vendes tú desde <Link to="/rv/vender">Vender</Link>) y las piezas
            quedan apartadas {formatearEntero(resumen.horas_pago ?? 0)} horas mientras te paga a ti, a tu pago móvil.
            Cuando te avisa que pagó, siguen apartadas hasta que tú lo confirmes.
          </li>
          <li>
            {resumen.dias_credito
              ? `Puede pagarte al menos el ${formatearEntero(resumen.inicial_pct ?? 0)} % y el resto en ${formatearEntero(resumen.dias_credito)} días: es tu crédito, lo llevas en Pedidos pago por pago.`
              : 'Sin días de crédito en Mi catálogo, tu clienta te paga el total antes de que confirmes.'}
          </li>
          <li>
            Al confirmar tienes {formatearEntero(resumen.horas_para_pagar ?? 0)} horas para pagarle a Lux lo que te
            sale, desde <Link to="/rv/apartados">Pedidos</Link>. La tienda lo comprueba, lo aprueba y retiras tus
            piezas. Si se te pasa el plazo, vuelven a la tienda.
          </li>
          <li>
            Tu tope es cuánto puedes tener apartado a la vez. Sube cuando pagas lo que apartas; baja si
            dejas vencer {formatearEntero(resumen.vencidos_para_bajar)} pedidos confirmados en {formatearEntero(resumen.dias_ventana)} días.
          </li>
        </ul>
      </Ayuda>
    </div>
  );
}
