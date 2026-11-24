import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, Vacio } from '../../componentes/Piezas';
import { PagoMovil } from '../../componentes/PagoMovil';
import { PagosHechos, ReportarPago } from '../../componentes/ReportarPago';
import { bsDeBcv, formatearBcv, formatearBs, formatearFechaHora, precioEnBs, restarCifras, tiempoRestante } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { nombreConVariante } from '../../lib/familias';
import { enlaceApartado, enlaceWhatsApp } from '../../lib/revendedor';
import { destinoDeApartado } from '../../lib/dominio';
import { direcciones, lugarActual, rutaDelCatalogoRv } from '../../lib/direccion';
import { useTasa } from '../../hooks/useTasa';
import { useLetraGrande } from '../../hooks/useLetraGrande';
import { normalizarTema, temaResuelto, variablesCss } from './catalogo/tema';
import { cargarLetras } from './catalogo/letras';
import { PieLux } from './catalogo/piezas/Comunes';
import './catalogo/catalogo-rv.css';
import type { ApartadoPublico as Apartado, PerfilRevendedor } from '../../lib/tipos';
import '../../estilos/revendedor.css';

/**
 * El pedido de la clienta de un revendedor, abierto por su enlace.
 *
 * Solo lo suyo: sus piezas a SU precio, en qué va, cuánto le falta y a
 * quién pagarle. `rv_ver_apartado` no trae lo que el revendedor le paga a
 * Lux ni su apellido: solo el primer nombre de los dos.
 *
 * Aquí le paga a ÉL: sus datos de pago móvil para copiar y el formulario
 * para avisarle que ya pagó. Mientras él no lo confirme, sus piezas siguen
 * apartadas.
 *
 * Se viste con SU tema (fase 6): su logo grande, sus colores, su letra. No
 * con su plantilla: es una página de pagar, igual en las tres. Sus piezas
 * (avisos, pago móvil, reportar el pago) son las de la tienda, vestidas
 * con el tema por `.rvc-con-lux` (catalogo-rv.css).
 */
export function ApartadoPublico() {
  const { token } = useParams();
  const { tasa } = useTasa();
  const [apartado, setApartado] = useState<Apartado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const [temaDemo, setTemaDemo] = useState<unknown>(null);

  // Su tema sale de su perfil (#73). Sin él (o si falla), su paleta.
  const [temaGuardado, setTemaGuardado] = useState<unknown>(null);
  const usuarioRv = apartado?.usuario ?? null;
  useEffect(() => {
    if (!usuarioRv) return;
    if (import.meta.env.DEV && temaDemo) { setTemaGuardado(temaDemo); return; }
    void (async () => {
      const { data } = await supabase.rpc('rv_perfil_publico', { p_usuario: usuarioRv });
      setTemaGuardado((data as PerfilRevendedor | null)?.tema ?? null);
    })();
  }, [usuarioRv, temaDemo]);
  const tema = useMemo(() => temaResuelto(normalizarTema(temaGuardado), apartado?.paleta), [temaGuardado, apartado?.paleta]);
  const estilo = useMemo(() => variablesCss(tema) as CSSProperties, [tema]);
  useEffect(() => { if (apartado) void cargarLetras(tema); }, [apartado, tema]);
  useEffect(() => {
    if (!apartado) return;
    const antes = document.body.style.background;
    document.body.style.background = tema.colores.fondo;
    return () => { document.body.style.background = antes; };
  }, [apartado, tema]);
  const { grande, alternar } = useLetraGrande();

  const cargar = useCallback(async () => {
    if (!token) return;
    // Solo en desarrollo: un pedido de muestra (catalogo/demo.ts), para verlo con cualquier tema.
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
      const m = await import('./catalogo/demo');
      const d = await m.apartadoDemo(new URLSearchParams(window.location.search));
      setApartado(d.apartado);
      setTemaDemo(d.tema);
      setCargando(false);
      return;
    }
    const { data, error: err } = await supabase.rpc('rv_ver_apartado', { p_token: token });
    if (err) setError(mensajeDeError(err));
    setApartado((data as Apartado | null) ?? null);
    setCargando(false);
  }, [token]);

  useEffect(() => { void cargar(); }, [cargar]);
  // Las 2 horas se cuentan en vivo, al minuto.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // El pedido vive en el subdominio de SU revendedor: abierto desde el de
  // Lux o desde el de otro, salta allá. Nunca bajo el nombre de otro.
  const salto = apartado && token && !(import.meta.env.DEV && apartado.usuario === 'muestra') ? destinoDeApartado(lugarActual(), apartado.usuario, token, direcciones()) : null;
  useEffect(() => { if (salto) window.location.replace(salto); }, [salto]);

  if (cargando || salto) return <Cargando texto="Buscando tu pedido" />;

  if (!apartado) {
    return (
      <div className="pagina pagina--angosta">
        {error ? <Aviso tono="error" titulo="No se pudo abrir el pedido">{error}</Aviso> : null}
        <Vacio titulo="No encontramos este pedido">
          <p>Revisa el enlace, o pídele a quien te atendió que te lo mande otra vez.</p>
        </Vacio>
      </div>
    );
  }

  const logo = urlPublicaFoto(apartado.logo_path);
  const falta = Number(apartado.falta_usd);
  const total = Number(apartado.total_usd);
  const pagado = Math.max(restarCifras(total, falta), 0);
  const minimo = apartado.minimo_usd !== null && apartado.minimo_usd !== undefined ? Number(apartado.minimo_usd) : null;
  const fase = apartado.fase ?? (apartado.estado === 'abierto' ? 'esperando_pago' : null);
  const quien = apartado.revendedor;
  const conPagoMovil = Boolean(apartado.pago_movil_cedula || apartado.pago_movil_telefono || apartado.pago_movil_banco);
  // Recibe pagos mientras está vigente, y después de vendido si le dio crédito.
  const recibePagos = falta > 0 && fase !== null && !['vencido', 'cancelado'].includes(fase);
  const daCredito = Boolean(apartado.dias_credito);
  const faltaMinimo = !apartado.confirmado_en && minimo !== null ? Math.max(0, restarCifras(minimo, pagado)) : null;
  const mensaje = `Hola ${quien}, es sobre mi pedido: ${enlaceApartado(token ?? '', apartado.usuario)}`;
  const mensajePago = `Hola ${quien}, ya te pagué mi pedido. Lo reporté aquí: ${enlaceApartado(token ?? '', apartado.usuario)}`;

  return (
    <div className={`rvc rvc--${tema.plantilla} rvc-apartado`} style={estilo}>
      <header className="rvc-interior rvc-apartado__cabecera">
        <div className="rvc-apartado__fila">
          <Link to={rutaDelCatalogoRv(apartado.usuario)} className="rvc-enlace">← Ver el catálogo</Link>
          <button type="button" className="rvc-boton rvc-boton--claro rvc-boton--chico" aria-pressed={grande} onClick={alternar}>
            <span aria-hidden="true">Aa</span> Letra grande
          </button>
        </div>
        <div className="rvc-marca rvc-marca--centro">
          {logo ? <img className="rvc-marca__logo" src={logo} alt={apartado.catalogo_nombre} /> : <span className="rvc-marca__nombre">{apartado.catalogo_nombre}</span>}
        </div>
      </header>

      <div className="pagina pagina--angosta mostrador rvc-con-lux">
        <div className="encabezado-pagina">
          <div>
            <h1>Tu pedido</h1>
            <p>A nombre de {apartado.clienta}. Guarda este enlace para volver.</p>
          </div>
        </div>

        {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

        {fase === 'esperando_pago' ? (
          <Aviso tono="alerta" titulo={`Apartado por ${tiempoRestante(apartado.expira_en, ahora) ?? 'unos minutos'}`}>
            Págale a {quien} y avísale aquí abajo con la referencia. Si no pagas a tiempo, las piezas vuelven a
            estar disponibles.
          </Aviso>
        ) : null}
        {fase === 'por_confirmar' ? (
          <Aviso tono="alerta" titulo={`${quien} está revisando tu pago`}>
            Tus piezas siguen apartadas mientras {quien} lo comprueba en su banco.
          </Aviso>
        ) : null}
        {fase === 'por_pagar_lux' || fase === 'en_revision' || fase === 'vendido' || fase === 'entregado' ? (
          <Aviso tono="exito" titulo={fase === 'entregado' ? 'Tus piezas ya salieron de la tienda' : 'Pedido confirmado'}>
            {falta > 0 && apartado.vence_clienta_en
              ? `${quien} te dio crédito: tienes hasta el ${formatearFechaHora(apartado.vence_clienta_en)} para pagarle lo que falta.`
              : falta > 0
                ? `Te falta pagarle a ${quien} lo de abajo.`
                : `Está pagado. ${quien} te avisa cuando te lo entregue.`}
          </Aviso>
        ) : null}
        {fase === 'vencido' ? (
          <Aviso tono="error" titulo="El pedido venció">
            Las piezas volvieron a estar disponibles. Si todavía las quieres, escríbele a {quien}.
          </Aviso>
        ) : null}
        {fase === 'cancelado' ? (
          <Aviso tono="neutro" titulo="Pedido cancelado">Puedes apartar otras cuando quieras.</Aviso>
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
            {falta > 0 ? (
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
          <p className="campo__pista">La deuda está en dólares BCV: en bolívares es lo de hoy, y cambia con la tasa.</p>
        ) : null}

        <PagosHechos pagos={apartado.abonos ?? []} quienRevisa={quien} />

        {recibePagos && tasa ? (
          <>
            <h2 className="seccion-titulo">{pagado > 0 ? 'Pagarle lo que falta' : `Pagarle a ${quien}`}</h2>
            {!apartado.confirmado_en && minimo !== null && pagado <= 0 ? (
              <p className="prosa">
                {daCredito
                  ? <>Paga el total, o al menos {formatearBs(bsDeBcv(minimo, tasa.tasa_bcv))} ({formatearBcv(minimo)}) y {quien} te da {apartado.dias_credito} días para pagarle lo demás.</>
                  : <>Págale el total: {formatearBs(bsDeBcv(falta, tasa.tasa_bcv))}.</>}
              </p>
            ) : null}
            {conPagoMovil ? (
              <PagoMovil
                titulo={`Pago móvil de ${quien}`}
                cedula={apartado.pago_movil_cedula ?? ''}
                telefono={apartado.pago_movil_telefono ?? ''}
                banco={apartado.pago_movil_banco ?? ''}
              />
            ) : (
              <p className="campo__pista">Escríbele a {quien} y te pasa sus datos para pagar.</p>
            )}
            <ReportarPago
              id="rv-pago"
              falta={falta}
              minimo={daCredito && faltaMinimo !== null && faltaMinimo > 0 ? faltaMinimo : null}
              tasa={tasa}
              boton={`Avisarle a ${quien} que pagué`}
              enviar={async (p) => {
                const { error: err } = await supabase.rpc('rv_reportar_pago', {
                  p_token: token, p_metodo: p.metodo, p_monto: p.monto, p_referencia: p.referencia,
                  p_fecha: p.fecha, p_cedula: p.cedula, p_telefono: p.telefono,
                });
                if (err) throw new Error(mensajeDeError(err));
                setAviso(`Listo. ${quien} comprueba tu pago en su banco; tus piezas siguen apartadas mientras tanto.`);
                await cargar();
              }}
            />
          </>
        ) : null}

        {apartado.telefono ? (
          <div className="acciones">
            <a
              className="boton boton--secundario"
              href={enlaceWhatsApp(apartado.telefono, fase === 'por_confirmar' ? mensajePago : mensaje)}
              target="_blank" rel="noopener noreferrer"
            >
              Escribirle a {quien}
            </a>
          </div>
        ) : null}
        <footer className="rvc-pie"><PieLux /></footer>
      </div>
    </div>
  );
}
