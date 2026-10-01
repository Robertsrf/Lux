import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso } from '../../componentes/Piezas';
import { CompartirCatalogo } from '../../componentes/CompartirCatalogo';
import { formatearBcv, formatearEntero, formatearPorcentaje } from '../../lib/dinero';
import { enlaceGuiaRv } from '../../lib/revendedor';
import { useTextos } from '../../hooks/useTextos';
import type { ProgramaRv } from '../../lib/tipos';

const MENSAJE =
  'Hola, aquí tienes todo sobre cómo ser revendedor de Lux by Emory: cómo funciona, cuánto ganas, '
  + 'cómo se paga y cómo usar tu panel. Al final puedes mandarnos tus datos para crear tu cuenta:';

/**
 * Capacitación revendedores: el enlace de la guía pública
 * (paginas/publico/GuiaRevendedor.tsx), para mandárselo a quien quiera
 * ser revendedor, y de dónde saca la guía cada dato. La guía no se edita
 * aquí: sus cifras salen de Revendedores y sus datos de la tienda, de
 * Textos. Así hay un solo sitio para cada cosa.
 */
export function CapacitacionRv() {
  const textos = useTextos();
  const [programa, setPrograma] = useState<ProgramaRv | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enlace = enlaceGuiaRv();

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase.rpc('rv_programa');
      if (err) setError(mensajeDeError(err));
      else setPrograma(data as ProgramaRv);
    })();
  }, []);

  const whatsapp = textos.whatsapp_tienda?.trim() || null;
  const direccion = textos.direccion_tienda?.trim() || null;
  const horario = textos.horario_tienda?.trim() || null;
  const escalera = programa?.escalera ?? [];
  const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));

  const cifras: [string, string][] = programa ? [
    ['Descuento', `${formatearPorcentaje(num(programa.descuento_pct), 0)} de la etiqueta`],
    ['Lo mínimo que cobra', `la etiqueta más ${formatearBcv(num(programa.sobre_etiqueta_usd))}`],
    ['Su clienta le paga en', `${formatearEntero(num(programa.horas_pago))} horas`],
    ['Él le paga a Lux en', `${formatearEntero(num(programa.horas_para_pagar))} horas desde que confirma`],
    ['Crédito a su clienta', `desde el ${formatearPorcentaje(num(programa.inicial_pct), 0)}`],
    ['Tope', escalera.map((n) => formatearBcv(Number(n.tope_usd), 0)).join(' · ') || '—'],
  ] : [];

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Capacitación revendedores</h1>
          <p>
            Una guía pública, paso a paso, para quien quiere vender joyas Lux: qué es, cuánto le sale cada
            pieza, cómo le paga a Lux, cómo usa su panel y cómo te pide su cuenta. Mándasela a quien te pregunte.
          </p>
        </div>
        <a className="boton boton--secundario" href={enlace} target="_blank" rel="noopener noreferrer">Abrir la guía</a>
      </div>

      <CompartirCatalogo
        titulo="Enlace de la guía"
        enlace={enlace}
        mensaje={MENSAJE}
        pista="Cualquiera la abre, sin código ni sesión. Al final, quien quiera empezar llena sus datos y te llegan por WhatsApp. Las cifras de la guía son siempre las de hoy."
      />

      <h2 className="seccion-titulo">De dónde saca la guía cada dato</h2>

      {!whatsapp ? (
        <Aviso tono="alerta" titulo="Falta el WhatsApp de la tienda">
          Sin él, quien llena la solicitud tiene que buscar tu chat a mano. Escríbelo en{' '}
          <Link to="/admin/textos">Textos</Link>, en "WhatsApp de la tienda".
        </Aviso>
      ) : null}

      <div className="tarjeta">
        <dl className="capacitacion__datos">
          <div>
            <dt>Las solicitudes llegan a</dt>
            <dd>{whatsapp ?? 'Falta: la persona elige el chat'}</dd>
          </div>
          <div>
            <dt>Dónde retiran las piezas</dt>
            <dd>{direccion ?? 'Falta: la guía dice "la tienda"'}{horario ? ` · ${horario}` : ''}</dd>
          </div>
        </dl>
        <p className="campo__pista">
          Estos dos se cambian en <Link to="/admin/textos">Textos</Link>.
        </p>
      </div>

      <div className="tarjeta" style={{ marginTop: 'var(--e-4)' }}>
        {error ? (
          <p className="campo__error" role="alert">No se pudieron leer las cifras del programa: {error}</p>
        ) : (
          <dl className="capacitacion__datos">
            {cifras.map(([que, cuanto]) => (
              <div key={que}><dt>{que}</dt><dd>{cuanto}</dd></div>
            ))}
          </dl>
        )}
        <p className="campo__pista">
          Son las reglas de <Link to="/admin/revendedores">Revendedores</Link>: si cambias una allí, la guía
          dice la nueva sola. La guía no enseña ninguna cifra de costo.
        </p>
      </div>

      <h2 className="seccion-titulo">Cuando te llegue una solicitud</h2>
      <div className="tarjeta">
        <ol className="capacitacion__pasos">
          <li>Lee sus datos por WhatsApp y decide si le das una cuenta: no es para todo el mundo.</li>
          <li>En <Link to="/admin/revendedores">Revendedores</Link>, "Nuevo revendedor": su nombre, el usuario que pidió para su enlace, su WhatsApp, su cédula, el nombre de su catálogo, sus colores y su logo si te lo mandó.</li>
          <li>Al guardar sale su código: "Mandárselo por WhatsApp". Ese mensaje lleva su catálogo, su panel y el código.</li>
          <li>Él sigue la guía desde el paso 2 del manual, "Entra a tu panel".</li>
        </ol>
      </div>
    </div>
  );
}
