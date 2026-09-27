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

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Hola, {primer}</h1>
          <p>Así va tu negocio este mes.</p>
        </div>
      </div>

      {resumen.por_vencer > 0 ? (
        <Aviso tono="alerta" titulo={resumen.por_vencer === 1 ? 'Un apartado vence en los próximos 3 días' : `${resumen.por_vencer} apartados vencen en los próximos 3 días`}>
          Si tu clienta ya pagó, retíralo en la tienda antes de que venza; si no, cancélalo y la pieza queda libre.
          {' '}<Link to="/rv/apartados">Ver apartados</Link>
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
            <div className="campo__pista">
              {resumen.abiertos === 1 ? '1 apartado abierto.' : `${formatearEntero(resumen.abiertos)} apartados abiertos.`}
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
        pista="Tu clienta ve las piezas a tu precio y las aparta. Te aparecen en Apartados."
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
            Tu clienta aparta desde tu catálogo y la pieza queda guardada {formatearEntero(resumen.dias_apartado)} días.
            Si no la retiras en ese plazo, vuelve sola a la tienda.
          </li>
          <li>
            Para retirar vas a la tienda y pagas lo que te sale. Lo que tu clienta te debe a ti lo llevas en
            {' '}<Link to="/rv/apartados">Apartados</Link>, abono por abono.
          </li>
          <li>
            Tu tope es cuánto puedes tener apartado a la vez. Sube cuando pagas lo que apartas; baja si se te
            vencen {formatearEntero(resumen.vencidos_para_bajar)} apartados en {formatearEntero(resumen.dias_ventana)} días.
          </li>
        </ul>
      </Ayuda>
    </div>
  );
}
