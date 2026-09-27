import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, Vacio } from '../../componentes/Piezas';
import { bsDeBcv, formatearBcv, formatearBs, formatearFecha, precioEnBs } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { nombreConVariante } from '../../lib/familias';
import { diasParaVencer, enlaceApartado, enlaceWhatsApp } from '../../lib/revendedor';
import { useTasa } from '../../hooks/useTasa';
import { useTemaRv } from '../../hooks/useTemaRv';
import type { ApartadoPublico as Apartado } from '../../lib/tipos';
import '../../estilos/revendedor.css';

/**
 * El apartado de la clienta de un revendedor, abierto por su enlace.
 *
 * Solo lo suyo: sus piezas a SU precio, hasta cuándo, cuánto le falta y a
 * quién pagarle. `rv_ver_apartado` no trae ni lo que el revendedor le paga
 * a Lux ni su apellido completo: solo el primer nombre de los dos.
 *
 * Aquí no se paga: se le paga a él, y él lleva las cuentas.
 */
export function ApartadoPublico() {
  const { token } = useParams();
  const { tasa } = useTasa();
  const [apartado, setApartado] = useState<Apartado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useTemaRv(apartado?.paleta);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const { data, error: err } = await supabase.rpc('rv_ver_apartado', { p_token: token });
      if (err) setError(mensajeDeError(err));
      setApartado((data as Apartado | null) ?? null);
      setCargando(false);
    })();
  }, [token]);

  if (cargando) return <Cargando texto="Buscando tu apartado" />;

  if (!apartado) {
    return (
      <div className="pagina pagina--angosta">
        {error ? <Aviso tono="error" titulo="No se pudo abrir el apartado">{error}</Aviso> : null}
        <Vacio titulo="No encontramos este apartado">
          <p>Revisa el enlace, o pídele a quien te atendió que te lo mande otra vez.</p>
        </Vacio>
      </div>
    );
  }

  const logo = urlPublicaFoto(apartado.logo_path);
  const falta = Number(apartado.falta_usd);
  const total = Number(apartado.total_usd);
  const pagado = Math.max(total - falta, 0);
  const mensaje = `Hola ${apartado.revendedor}, es sobre mi apartado: ${enlaceApartado(token ?? '')}`;

  return (
    <>
      <header className="barra barra--publica">
        <div className="barra__interior">
          <div className="rv-marca">
            {logo ? <img className="rv-marca__logo" src={logo} alt="" /> : null}
            <div className="rv-marca__texto">
              <span className="rv-marca__nombre">{apartado.catalogo_nombre}</span>
              <span className="rv-marca__de">Joyas Lux by Emory</span>
            </div>
          </div>
          <Link to={`/r/${apartado.usuario}`} className="sesion__quien">Ver el catálogo</Link>
        </div>
      </header>

      <div className="pagina pagina--angosta mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1>Tu apartado</h1>
            <p>A nombre de {apartado.clienta}. Guarda este enlace para volver.</p>
          </div>
        </div>

        {apartado.estado === 'abierto' ? (
          <Aviso tono="alerta" titulo={`${diasParaVencer(apartado.expira_en)} · hasta el ${formatearFecha(apartado.expira_en)}`}>
            {apartado.revendedor} te guarda estas piezas hasta esa fecha. Págale a {apartado.revendedor}, todo o
            por partes, y te las entrega cuando termines.
          </Aviso>
        ) : null}
        {apartado.estado === 'vencido' ? (
          <Aviso tono="error" titulo="El apartado venció">
            Las piezas volvieron a estar disponibles. Si todavía las quieres, escríbele a {apartado.revendedor}.
          </Aviso>
        ) : null}
        {apartado.estado === 'retirado' ? (
          <Aviso tono="exito" titulo="Tus piezas ya salieron de la tienda">
            {falta > 0 ? `${apartado.revendedor} las retiró para ti.` : 'Están pagadas. Que las disfrutes.'}
          </Aviso>
        ) : null}
        {apartado.estado === 'cancelado' ? (
          <Aviso tono="neutro" titulo="Apartado cancelado">Puedes apartar otras cuando quieras.</Aviso>
        ) : null}

        <div className="lineas-cobro">
          {apartado.items.map((i, n) => {
            const foto = urlPublicaFoto(i.foto_thumb_path);
            return (
              <div className="linea-cobro" key={`${i.nombre}-${i.variante ?? ''}-${n}`}>
                {foto ? <img className="linea-cobro__foto" src={foto} alt="" /> : <span className="linea-cobro__foto" />}
                <div>
                  <div className="linea-cobro__nombre">{nombreConVariante(i.nombre, i.variante)}</div>
                  <div className="linea-cobro__precio">{formatearBs(precioEnBs(Number(i.precio_usd), tasa))} · {formatearBcv(Number(i.precio_usd))}</div>
                </div>
                <span className="contador__valor">{i.cantidad}</span>
              </div>
            );
          })}
        </div>

        <div className="total-cobro">
          <div>
            <span className="util secundario">{falta > 0 && pagado > 0 ? 'Te falta' : 'Total'}</span>
            {falta > 0 && pagado > 0 ? (
              <div className="campo__pista">Ya pagaste {formatearBcv(pagado)} de {formatearBcv(total)}.</div>
            ) : null}
          </div>
          <div>
            {falta > 0 || apartado.estado === 'abierto' ? (
              <>
                <div className="total-cobro__cifra">{tasa ? formatearBs(bsDeBcv(falta, tasa.tasa_bcv)) : '—'}</div>
                <div className="total-cobro__cifra">{formatearBcv(falta)}</div>
              </>
            ) : (
              <div className="total-cobro__cifra">{formatearBcv(total)}</div>
            )}
          </div>
        </div>
        {falta > 0 ? (
          <p className="campo__pista">
            La deuda está en dólares BCV: en bolívares es lo de hoy, y cambia con la tasa.
          </p>
        ) : null}

        {apartado.telefono ? (
          <div className="acciones">
            <a className="boton boton--confirmar" href={enlaceWhatsApp(apartado.telefono, mensaje)} target="_blank" rel="noopener noreferrer">
              Escribirle a {apartado.revendedor}
            </a>
          </div>
        ) : null}
      </div>
    </>
  );
}
