import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando } from '../../componentes/Piezas';
import { Monograma, Wordmark } from '../../componentes/Marca';
import { etiquetaConDescuentoRv, formatearBcv, formatearEntero, formatearPorcentaje, gananciaPorPieza } from '../../lib/dinero';
import { enlaceApartado, enlaceCatalogoRv, enlaceGuiaRv, enlacePanelRv } from '../../lib/revendedor';
import { useTextos } from '../../hooks/useTextos';
import type { ProgramaRv } from '../../lib/tipos';
import { Calculadora, Manual, Preguntas, Recorrido, Solicitud } from './GuiaRevendedorPiezas';
import type { Cifras, Paso, Pregunta } from './GuiaRevendedorPiezas';
import '../../estilos/revendedor.css';
import '../../estilos/guia-revendedor.css';

/**
 * La guía para quien quiere ser revendedor (pedida por el dueño el
 * 30/09/2026). Pública, sin sesión: el dueño manda el enlace desde
 * "Capacitación revendedores" a cualquiera que pregunte.
 *
 * Toda cifra sale de la base (`rv_programa`, esquema-guia-revendedores.sql)
 * y de Textos: si el dueño cambia el descuento o un plazo en Revendedores,
 * la guía dice lo nuevo sin tocar código. Ninguna cifra de costo.
 *
 * Está escrita para leerse sin saber nada: frases cortas, un ejemplo en
 * cada cosa, y las palabras del panel tal como salen en el panel.
 *
 * Los saltos del índice no son enlaces "#algo": con HashRouter eso cambia
 * de ruta. Se desplaza a la sección y se deja `?ir=` en la dirección, así
 * el dueño puede mandar una sección directa.
 */

const INDICE: { grupo: string; temas: [string, string][] }[] = [
  { grupo: 'Conócelo', temas: [['que-es', 'Qué es ser revendedor'], ['como-funciona', 'Cómo funciona, en cuatro pasos'], ['hace', 'Qué hace el sistema y qué no'], ['enlaces', 'Tus enlaces']] },
  { grupo: 'Tu dinero', temas: [['descuento', 'Cuánto te cuesta cada pieza'], ['calculadora', 'Calcula tu ganancia'], ['pagar-lux', 'Cómo le pagas a Lux'], ['tope', 'Tu tope y tus niveles']] },
  { grupo: 'Manual', temas: [['manual', 'Tu panel, paso a paso']] },
  { grupo: 'Un pedido', temas: [['pedido', 'De principio a fin'], ['y-si', '¿Y si algo sale mal?']] },
  { grupo: 'Condiciones', temas: [['reglas', 'Las reglas del programa']] },
  { grupo: 'Dudas', temas: [['preguntas', 'Preguntas frecuentes'], ['palabras', 'Palabras que vas a ver']] },
  { grupo: 'Empieza', temas: [['unete', 'Quiero ser revendedor']] },
];

const GRUPO_DE: Record<string, string> = Object.fromEntries(
  INDICE.flatMap((g, n) => g.temas.map(([id]) => [id, `${n + 1} · ${g.grupo}`])),
);

const ESCRITORIO = '(min-width: 1024px)';

function horas(n: number): string {
  return n === 1 ? '1 hora' : `${formatearEntero(n)} horas`;
}

function pct(n: number): string {
  return formatearPorcentaje(n, Number.isInteger(n) ? 0 : 1);
}

function cifrasDe(p: ProgramaRv | null): Cifras {
  const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));
  const d = num(p?.descuento_pct);
  const s = num(p?.sobre_etiqueta_usd);
  const hp = num(p?.horas_pago);
  const hl = num(p?.horas_para_pagar);
  const ini = num(p?.inicial_pct);
  const ven = num(p?.dias_ventana);
  const vc = num(p?.vencidos_para_bajar);
  return {
    descuentoPct: d,
    sobreUsd: s,
    descuento: d !== null ? pct(d) : 'un descuento',
    sobre: s !== null ? formatearBcv(s) : 'unos céntimos',
    horasPago: hp !== null ? horas(hp) : 'unas horas',
    horasLux: hl !== null ? horas(hl) : 'un día',
    inicial: ini !== null ? pct(ini) : 'una parte',
    ventana: ven !== null ? `${formatearEntero(ven)} días` : 'un mes',
    vencidos: vc !== null ? formatearEntero(vc) : 'varios',
  };
}

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={`guia-${id}`} className="guia-rv__seccion" aria-labelledby={`guia-${id}-t`}>
      <p className="guia-rv__grupo">{GRUPO_DE[id]}</p>
      <h2 id={`guia-${id}-t`} tabIndex={-1}>{titulo}</h2>
      {children}
    </section>
  );
}

export function GuiaRevendedor() {
  const textos = useTextos();
  const [programa, setPrograma] = useState<ProgramaRv | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parametros, setParametros] = useSearchParams();
  const [indiceAbierto, setIndiceAbierto] = useState(() => window.matchMedia(ESCRITORIO).matches);

  useEffect(() => {
    document.title = 'Guía para revendedores · Lux by Emory';
    void (async () => {
      const { data, error: err } = await supabase.rpc('rv_programa');
      if (err) setError(mensajeDeError(err));
      else setPrograma(data as ProgramaRv);
      setCargando(false);
    })();
  }, []);

  const ir = useCallback((id: string, enfocar = true) => {
    // En el teléfono el índice se pliega PRIMERO y se baja después: si se
    // pliega mientras baja, todo lo de abajo sube y la sección queda atrás.
    if (!window.matchMedia(ESCRITORIO).matches) setIndiceAbierto(false);
    setParametros({ ir: id }, { replace: true });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const seccion = document.getElementById(`guia-${id}`);
      if (!seccion) return;
      const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      seccion.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
      if (enfocar) document.getElementById(`guia-${id}-t`)?.focus({ preventScroll: true });
    }));
  }, [setParametros]);

  // Un enlace con ?ir=pagar-lux abre la guía en esa sección.
  const destino = parametros.get('ir');
  useEffect(() => {
    if (cargando || !destino) return;
    const t = setTimeout(() => ir(destino, false), 60);
    return () => clearTimeout(t);
    // Solo al terminar de cargar: después, cada salto lo pide el índice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando]);

  if (cargando) return <Cargando texto="Abriendo la guía" />;

  const c = cifrasDe(programa);
  // Solo para enseñar la cuenta: una pieza cualquiera, dicha como ejemplo.
  const ejemplo = c.descuentoPct !== null
    ? (() => {
        const etiqueta = 20;
        const cobras = 22;
        const teSale = etiquetaConDescuentoRv(etiqueta, c.descuentoPct);
        return { etiqueta, cobras, teSale, ganas: gananciaPorPieza(cobras, teSale) };
      })()
    : null;
  const escalera = programa?.escalera ?? [];
  const primerTope = escalera[0] ? formatearBcv(Number(escalera[0].tope_usd)) : null;
  const ultimoTope = escalera.length > 0 ? formatearBcv(Number(escalera[escalera.length - 1]!.tope_usd)) : null;
  const direccion = textos.direccion_tienda?.trim() || null;
  const horario = textos.horario_tienda?.trim() || null;
  const ciudad = [textos.ciudad, textos.estado].filter(Boolean).join(', ');
  const dondeRetirar = direccion
    ? `${direccion}${horario ? `, ${horario}` : ''}`
    : `la tienda${ciudad ? `, en ${ciudad}` : ''}${horario ? `, ${horario}` : ''}`;

  const pasos: Paso[] = [
    {
      id: 'cuenta', titulo: 'Pide tu cuenta', donde: 'Al final de esta guía',
      contenido: (
        <>
          <ol className="guia-rv__acciones">
            <li>Llena tus datos en <button type="button" className="guia-rv__salto" onClick={() => ir('unete')}>Quiero ser revendedor</button> y mándalos por WhatsApp.</li>
            <li>Lux los revisa y te escribe.</li>
            <li>Si todo está bien, te manda tres cosas: el enlace de tu catálogo, el de tu panel y tu código para entrar.</li>
          </ol>
          <p className="guia-rv__nota">
            Tu código tiene doce letras y números, así: XXXX-XXXX-XXXX. Es como la llave de tu casa: no se lo des
            a nadie. Si lo pierdes, pide uno nuevo y el viejo deja de servir.
          </p>
        </>
      ),
    },
    {
      id: 'entrar', titulo: 'Entra a tu panel', donde: 'El enlace de tu panel',
      contenido: (
        <>
          <ol className="guia-rv__acciones">
            <li>Abre el enlace de tu panel: <span className="guia-rv__url">{enlacePanelRv()}</span></li>
            <li>Escribe tu código y toca "Entrar a mi panel".</li>
            <li>Listo: estás en Inicio. Abajo (o a un lado, en la computadora) está el menú: Inicio, Pedidos, Vender, Clientas, Mis precios y Mi catálogo.</li>
          </ol>
          <p className="guia-rv__nota">
            Truco: en el menú del navegador toca "Agregar a pantalla de inicio". Así tu panel queda en tu teléfono
            como una aplicación más.
          </p>
        </>
      ),
    },
    {
      id: 'catalogo', titulo: 'Arregla tu catálogo', donde: 'En tu panel: Mi catálogo',
      contenido: (
        <>
          <ol className="guia-rv__acciones">
            <li><strong>Nombre del catálogo:</strong> como quieres que lo vean tus clientas, por ejemplo "Joyas de María".</li>
            <li><strong>Tu WhatsApp:</strong> a este número te escriben tus clientas desde tu catálogo.</li>
            <li><strong>Colores:</strong> eliges uno de los seis. Tu catálogo y tu panel se visten con ellos.</li>
            <li><strong>Tu logo:</strong> si tienes, mándaselo a Lux por WhatsApp y lo sube tal como es.</li>
            <li><strong>Cómo te pagan:</strong> los datos de tu pago móvil (cédula, teléfono y banco). Tus clientas los ven en tu catálogo y en su pedido, con un botón para copiarlos.</li>
            <li><strong>Días de crédito:</strong> si quieres darle tiempo a tus clientas para terminar de pagar. Vacío: te pagan todo antes de que confirmes.</li>
          </ol>
          <p className="guia-rv__nota">Toca "Guardar" en cada parte. Lo puedes cambiar cuando quieras.</p>
        </>
      ),
    },
    {
      id: 'precios', titulo: 'Pon tus precios', donde: 'En tu panel: Mis precios',
      contenido: (
        <>
          <ol className="guia-rv__acciones">
            <li>Cada pieza dice <strong>"Te sale"</strong>: lo que le pagas a Lux por ella.</li>
            <li>Al lado escribes tu precio: lo que le cobras a tu clienta. Nunca menos que el precio de la tienda más {c.sobre}. Debajo te dice cuánto ganas.</li>
            <li>¿Muchas piezas? Arriba está "Todas a la tienda más": escribes cuánto por encima de la tienda y tocas "Poner a todas".</li>
            <li>Toca "Guardar".</li>
          </ol>
          <p className="guia-rv__nota">Una pieza sin precio tuyo sale a lo mínimo. En tu catálogo tus clientas ven solo tu precio, nunca lo que te sale a ti.</p>
        </>
      ),
    },
    {
      id: 'mandar', titulo: 'Manda tu catálogo', donde: 'En tu panel: Inicio',
      contenido: (
        <>
          <ol className="guia-rv__acciones">
            <li>En Inicio está el enlace de tu catálogo con dos botones: "Enviar por WhatsApp" y "Copiar enlace".</li>
            <li>Mándalo a tus clientas, ponlo en tus estados o en tus redes.</li>
            <li>Tu catálogo enseña solo lo que la tienda tiene disponible en ese momento, con tus precios. Se actualiza solo: no tienes que tomar fotos ni escribir precios.</li>
          </ol>
        </>
      ),
    },
    {
      id: 'pedido', titulo: 'Te llega un pedido', donde: 'En tu panel: Pedidos, "Por hacer"',
      contenido: (
        <>
          <ol className="guia-rv__acciones">
            <li>Tu clienta elige sus piezas, escribe su cédula y sus datos, y aparta.</li>
            <li>Te aparece en Pedidos con <span className="etiqueta etiqueta--alerta">Esperando su pago</span> y el tiempo que le queda: tiene {c.horasPago} para pagarte.</li>
            <li>Ella ve tu pago móvil en su pedido. Si quieres recordárselo, toca "Mandarle su enlace".</li>
          </ol>
          <p className="guia-rv__nota">Si no te paga a tiempo, no pasa nada: las piezas vuelven solas a la tienda.</p>
        </>
      ),
    },
    {
      id: 'cobrar', titulo: 'Tu clienta te paga', donde: 'En tu panel: Pedidos',
      contenido: (
        <>
          <ol className="guia-rv__acciones">
            <li>Ella te paga a tu pago móvil y te avisa desde el enlace de su pedido, con la referencia.</li>
            <li>Mira tu banco. Si llegó, toca <strong>"Me llegó"</strong>. Si no, <strong>"No me llegó"</strong>.</li>
            <li>¿Te pagó en efectivo o de otra forma? Toca <strong>"Cargar un pago"</strong> y escribe cuánto.</li>
          </ol>
          <p className="guia-rv__nota">Mientras no confirmes, sus piezas siguen guardadas: la clienta que ya pagó no las pierde.</p>
        </>
      ),
    },
    {
      id: 'confirmar', titulo: 'Confirma el pedido', donde: 'En tu panel: Pedidos',
      contenido: (
        <ol className="guia-rv__acciones">
          <li>Cuando te pagó todo, o al menos el {c.inicial} si le das crédito, toca <strong>"Confirmar el pedido"</strong>.</li>
          <li>Desde ese momento tienes {c.horasLux} para pagarle a Lux. El reloj sale en el pedido: <span className="etiqueta etiqueta--alerta">Págale a Lux</span></li>
        </ol>
      ),
    },
    {
      id: 'pagar', titulo: 'Págale a Lux', donde: 'En tu panel: Pedidos',
      contenido: (
        <>
          <ol className="guia-rv__acciones">
            <li>En el pedido, "Lo que le pagas a Lux" te dice cuánto es, en dólares BCV y en bolívares de hoy, y cuánto ganas.</li>
            <li>Ahí mismo están los datos del pago móvil de Lux, con botones para copiarlos.</li>
            <li>Paga y toca <strong>"Avisar que le pagué a Lux"</strong> con la referencia.</li>
            <li>¿Tu banco no te deja pagar todo de una vez? Paga en partes, cada una con su referencia, dentro de tu plazo.</li>
          </ol>
          <p className="guia-rv__nota">Si prefieres pagar en efectivo o con punto, hazlo en la tienda: lo anotan ellos.</p>
        </>
      ),
    },
    {
      id: 'retirar', titulo: 'Lux aprueba y retiras', donde: 'En la tienda',
      contenido: (
        <ol className="guia-rv__acciones">
          <li>La tienda mira su banco y aprueba. Tu pedido pasa a <span className="etiqueta etiqueta--exito">Aprobado · retíralo en la tienda</span></li>
          <li>Retira tus piezas en {dondeRetirar}. La tienda lo marca como retirado.</li>
          <li>Entrégaselas a tu clienta.</li>
        </ol>
      ),
    },
    {
      id: 'credito', titulo: 'Cobra lo que te deben', donde: 'En tu panel: Pedidos, "Te deben"',
      contenido: (
        <>
          <ol className="guia-rv__acciones">
            <li>Si le diste crédito, el pedido sigue en "Te deben" hasta que te pague todo, aunque ya se lo hayas entregado.</li>
            <li>Cada vez que te pague, toca <strong>"Cargar un pago"</strong>: se lo vas restando y ves cuánto le falta.</li>
            <li>¿Cargaste uno mal? Toca <strong>"Quitar"</strong>: queda tachado y vuelve a lo que te debe.</li>
            <li>En Inicio ves cuánto te deben entre todas.</li>
          </ol>
          <p className="guia-rv__nota">El crédito es tuyo: a Lux le pagas todo en {c.horasLux}, te haya terminado de pagar tu clienta o no.</p>
        </>
      ),
    },
    {
      id: 'vender', titulo: 'Vende tú mismo', donde: 'En tu panel: Vender',
      contenido: (
        <ol className="guia-rv__acciones">
          <li>Si una clienta te pide en persona o por mensaje, arma el pedido tú: busca las piezas y súmalas.</li>
          <li>En "Para quién" escribe su cédula. Si ya es tu clienta, la reconoce.</li>
          <li>En "¿Ya te pagó?" dices si ya tienes el pago en la mano: entonces el pedido nace confirmado. Si no, le mandas su enlace para que te pague.</li>
        </ol>
      ),
    },
    {
      id: 'clientas', titulo: 'Tus clientas', donde: 'En tu panel: Clientas',
      contenido: (
        <ol className="guia-rv__acciones">
          <li>Se agregan solas cuando apartan desde tu catálogo. También puedes cargar una a mano.</li>
          <li>Búscalas por nombre o por cédula: ves lo que te han comprado y lo que te deben.</li>
        </ol>
      ),
    },
    {
      id: 'mes', titulo: 'Mira cómo vas', donde: 'En tu panel: Inicio',
      contenido: (
        <ol className="guia-rv__acciones">
          <li>Inicio te dice cuánto ganaste en el mes, cuántas piezas vendiste y cuánto le pagaste a Lux.</li>
          <li>Y tu tope: cuánto tienes apartado ahora, cuánto te queda y cuánto te falta para subir de nivel.</li>
        </ol>
      ),
    },
  ];

  const preguntas: Pregunta[] = [
    { p: '¿Tengo que comprar mercancía para empezar?', r: 'No. No compras nada por adelantado ni guardas inventario. Le pagas a Lux cada pedido cuando ya lo confirmaste, con el dinero de tu clienta.' },
    { p: '¿Necesito un local?', r: 'No. Vendes con tu enlace: por WhatsApp, en tus estados, en tus redes o en persona. Las piezas las retiras en la tienda cuando ya están pagadas.' },
    { p: '¿Cuánto gano?', r: `La diferencia entre lo que cobras y lo que te sale. Cada pieza te sale ${c.descuento} menos que el precio de la tienda, y tú cobras al menos el precio de la tienda más ${c.sobre}. Prueba la calculadora de "Tu dinero".` },
    { p: '¿Puedo vender más barato que la tienda?', r: `No. Tu precio es siempre al menos el de la tienda más ${c.sobre}. Así no le haces la competencia a la tienda, y tus clientas no pagan menos por ir directo.` },
    { p: '¿Qué pasa si mi clienta no me paga?', r: `Si no te paga en ${c.horasPago}, las piezas vuelven solas a la tienda y no pierdes nada. Si ya confirmaste y le diste crédito, lo que te falte cobrar es tu riesgo: a Lux le pagas todo igual.` },
    { p: '¿Qué pasa si no le pago a Lux a tiempo?', r: `Tienes ${c.horasLux} desde que confirmas. Si se te pasa, el pedido vence y las piezas pueden volver a la tienda. Si ya habías pagado una parte, escríbele a la tienda para ver qué se hace. Y los pedidos que dejas vencer pueden bajarte de nivel.` },
    { p: '¿Le puedo pagar a Lux en varias partes?', r: 'Sí, dentro de tu plazo. Cada pago con su referencia, desde tu panel. La tienda aprueba cuando llegó todo.' },
    { p: '¿Cómo sé cuánto le debo a Lux?', r: 'En cada pedido confirmado, "Lo que le pagas a Lux" te dice cuánto es, cuánto has pagado, cuánto falta y hasta cuándo, en dólares BCV y en bolívares de hoy.' },
    { p: '¿Mi clienta me puede pagar en efectivo?', r: 'Sí. Lo que te paga a ti es entre ustedes. Si te paga en efectivo, lo cargas en su pedido con "Cargar un pago".' },
    { p: '¿Mi clienta ve lo que me cuesta a mí?', r: 'No. Tu clienta ve solo tu precio y tu pago móvil. Lo que te sale a ti lo ves solo tú, en tu panel.' },
    { p: '¿Puedo dar crédito a mis clientas?', r: `Sí. En Mi catálogo pones cuántos días les das. Te pagan al menos el ${c.inicial} para confirmar, y lo demás en esos días. Tú vas cargando cada pago.` },
    { p: '¿Dónde retiro las piezas?', r: `En ${dondeRetirar}, cuando el pedido dice "Aprobado". Si tienes dudas del horario, escríbele a la tienda.` },
    { p: '¿Perdí mi código, qué hago?', r: 'Escríbele a Lux y te da uno nuevo. El viejo deja de servir, así nadie más puede entrar con él.' },
    { p: '¿Puedo cambiar el nombre y los colores de mi catálogo?', r: 'Sí, cuando quieras, en Mi catálogo. El logo lo sube Lux: mándaselo por WhatsApp.' },
    { p: '¿Otro revendedor puede ver mis pedidos o mis clientas?', r: 'No. Cada revendedor tiene su catálogo, su panel y su código. Nadie ve lo tuyo.' },
    { p: '¿Cómo subo de nivel?', r: 'Vendiendo y pagando a tiempo. Cada nivel te deja tener más apartado a la vez. En "Tu tope y tus niveles" está cuánto hace falta para cada uno.' },
    { p: '¿Por qué una pieza no sale en mi catálogo?', r: 'Porque la tienda ya no tiene libre, o porque en esa pieza no queda rebaja para ti: ningún precio baja de su mínimo.' },
    { p: '¿Qué es "$ BCV"?', r: 'Dólares al cambio del Banco Central. Todo se cuenta en dólares BCV y se enseña también en bolívares al cambio del día.' },
  ];

  return (
    <div className="guia-rv mostrador">
      <header className="barra barra--publica">
        <div className="barra__interior">
          <Wordmark alto={40} />
          <span className="sesion__quien">Guía para revendedores</span>
        </div>
      </header>

      <section className="guia-rv__portada">
        <div className="guia-rv__portada-interior">
          <p className="guia-rv__antetitulo">Para quien quiere vender joyas Lux</p>
          <h1>Vende joyas Lux con tu propio catálogo</h1>
          <p className="guia-rv__entrada">
            Todo lo que necesitas saber, explicado paso a paso: cómo funciona, cuánto ganas, cómo le pagas a Lux
            y cómo usar tu panel. Léela con calma y vuelve cuando quieras: siempre está en este enlace.
          </p>
          <dl className="guia-rv__claves">
            <div><dt>Cada pieza te sale</dt><dd>{c.descuentoPct !== null ? `${c.descuento} menos` : 'Con descuento'}</dd><p>que el precio de la tienda</p></div>
            <div><dt>Tu catálogo</dt><dd>Con tu nombre</dd><p>tus colores y tus precios</p></div>
            <div><dt>Mercancía</dt><dd>Sin comprar antes</dd><p>pagas lo que ya vendiste</p></div>
          </dl>
          <div className="grupo-botones">
            <button type="button" className="boton guia-rv__boton-oro" onClick={() => ir('que-es')}>Empezar la guía</button>
            <button type="button" className="boton guia-rv__boton-claro" onClick={() => ir('unete')}>Quiero ser revendedor</button>
          </div>
        </div>
      </section>

      <div className="guia-rv__cuerpo">
        <nav className="guia-rv__indice" id="indice" aria-label="Índice de la guía">
          <details open={indiceAbierto} onToggle={(e) => setIndiceAbierto(e.currentTarget.open)}>
            <summary>Índice de la guía</summary>
            <ol>
              {INDICE.map((g, n) => (
                <li key={g.grupo}>
                  <span className="guia-rv__indice-grupo">{n + 1} · {g.grupo}</span>
                  <ul>
                    {g.temas.map(([id, titulo]) => (
                      <li key={id}>
                        <button type="button" className={destino === id ? 'guia-rv__indice-tema activo' : 'guia-rv__indice-tema'} onClick={() => ir(id)}>
                          {titulo}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </details>
        </nav>

        <main className="guia-rv__contenido">
          {error ? (
            <Aviso tono="alerta" titulo="No se pudieron leer las cifras de hoy">
              La guía se lee igual, pero sin números: pregúntale a la tienda por WhatsApp. ({error})
            </Aviso>
          ) : null}

          {/* ------------------------------------------------ 1. Conócelo */}
          <Seccion id="que-es" titulo="Qué es ser revendedor">
            <p className="prosa">
              Lux by Emory es una joyería de piezas hipoalergénicas{ciudad ? ` en ${ciudad}` : ''}.
              {textos.materiales_corto ? ` ${textos.materiales_corto.trim().replace(/.$/, '')}.` : ''}
            </p>
            <p className="prosa">
              Un revendedor es alguien que vende nuestras joyas a su propia gente: familia, amigas, compañeras de
              trabajo, sus seguidores. Tiene su propio catálogo en línea, con su nombre y sus precios.
            </p>
            <p className="prosa">
              <strong>Tú vendes; nosotros tenemos la mercancía.</strong> Las piezas están en la tienda. Tú no compras
              nada antes: cuando tu clienta te paga, tú le pagas a Lux y retiras la pieza. Lo que queda en el medio
              es tu ganancia.
            </p>
          </Seccion>

          <Seccion id="como-funciona" titulo="Cómo funciona, en cuatro pasos">
            <ol className="guia-rv__cuatro">
              <li><span className="guia-rv__cuatro-num" aria-hidden="true">1</span><strong>Mandas tu catálogo</strong><p>Por WhatsApp o en tus redes. Tus clientas ven las piezas con tus precios.</p></li>
              <li><span className="guia-rv__cuatro-num" aria-hidden="true">2</span><strong>Tu clienta aparta y te paga a ti</strong><p>A tu pago móvil. Las piezas quedan guardadas para ella.</p></li>
              <li><span className="guia-rv__cuatro-num" aria-hidden="true">3</span><strong>Tú le pagas a Lux</strong><p>Lo que te sale cada pieza, {c.descuento} menos que la tienda.</p></li>
              <li><span className="guia-rv__cuatro-num" aria-hidden="true">4</span><strong>Retiras y entregas</strong><p>Pasas por la tienda y le llevas sus joyas a tu clienta.</p></li>
            </ol>
            {ejemplo ? (
              <p className="prosa">
                <strong>Un ejemplo.</strong> Una cadena cuesta {formatearBcv(ejemplo.etiqueta)} en la tienda. A ti te
                sale {formatearBcv(ejemplo.teSale)} y tú la vendes en {formatearBcv(ejemplo.cobras)}. Tu clienta te
                paga {formatearBcv(ejemplo.cobras)}, tú le pagas a Lux {formatearBcv(ejemplo.teSale)} y te quedas
                con {formatearBcv(ejemplo.ganas)}.
              </p>
            ) : null}
          </Seccion>

          <Seccion id="hace" titulo="Qué hace el sistema por ti, y qué no">
            <div className="guia-rv__dos">
              <div className="panel">
                <span className="panel__titulo">Lo que hace</span>
                <ul className="guia-rv__lista guia-rv__lista--si">
                  <li>Te da un catálogo con tu nombre, tus colores y tu logo.</li>
                  <li>Enseña solo lo que la tienda tiene disponible, y se actualiza solo.</li>
                  <li>Pone tus precios y te dice cuánto ganas en cada pieza.</li>
                  <li>Guarda las piezas mientras tu clienta te paga.</li>
                  <li>Le enseña tu pago móvil a tu clienta, y ella te avisa cuando te pagó.</li>
                  <li>Lleva la cuenta de lo que te pagan y lo que te deben.</li>
                  <li>Te dice cuánto le debes a Lux y hasta cuándo.</li>
                  <li>Guarda tus clientas y te dice cuánto ganaste en el mes.</li>
                </ul>
              </div>
              <div className="panel">
                <span className="panel__titulo">Lo que no hace</span>
                <ul className="guia-rv__lista guia-rv__lista--no">
                  <li>No mueve dinero: lo que te paga tu clienta llega a TU banco, y a Lux le pagas tú.</li>
                  <li>No mira tu banco: tú dices si un pago te llegó.</li>
                  <li>No envía las piezas: las retiras tú en la tienda y se las entregas tú.</li>
                  <li>No te deja vender por debajo del precio de la tienda.</li>
                  <li>No guarda piezas sin pagar para siempre: solo mientras corre el plazo.</li>
                  <li>No te fía: a Lux le pagas todo en {c.horasLux}.</li>
                  <li>No manda mensajes solo: los WhatsApp los mandas tú, con un botón.</li>
                  <li>No es una cuenta de la tienda: no ves costos ni datos de nadie más.</li>
                </ul>
              </div>
            </div>
          </Seccion>

          <Seccion id="enlaces" titulo="Tus enlaces">
            <p className="prosa">Vas a usar tres enlaces. Guárdalos:</p>
            <dl className="guia-rv__enlaces">
              <div><dt>Tu catálogo</dt><dd className="guia-rv__url">{enlaceCatalogoRv('tu-usuario')}</dd><p>El que mandas a tus clientas. En vez de "tu-usuario" va el tuyo.</p></div>
              <div><dt>Tu panel</dt><dd className="guia-rv__url">{enlacePanelRv()}</dd><p>Solo para ti: entras con tu código.</p></div>
              <div><dt>El pedido de tu clienta</dt><dd className="guia-rv__url">{enlaceApartado('…')}</dd><p>Cada pedido tiene el suyo. Ahí tu clienta ve qué pidió, tu pago móvil, y te avisa que pagó.</p></div>
              <div><dt>Esta guía</dt><dd className="guia-rv__url">{enlaceGuiaRv()}</dd><p>Para volver cuando tengas una duda.</p></div>
            </dl>
          </Seccion>

          {/* ------------------------------------------------ 2. Tu dinero */}
          <Seccion id="descuento" titulo="Cuánto te cuesta cada pieza">
            <p className="prosa">
              Cada pieza tiene su <strong>precio de tienda</strong> (la etiqueta): lo que paga cualquier clienta en la
              tienda. A ti te sale <strong>{c.descuento} menos</strong>. Eso es lo que le pagas a Lux por cada pieza
              que vendes, cuando ya la vendiste: no compras mercancía por adelantado.
            </p>
            <p className="prosa">
              En algunas piezas la rebaja es un poco menor, porque ningún precio baja de un mínimo. Si una pieza no
              te deja rebaja, no sale en tu catálogo. Lux también puede darte un descuento distinto: el tuyo lo ves
              en tu panel, pieza por pieza, en "Te sale".
            </p>
            <p className="prosa">
              Tu precio lo pones tú, <strong>nunca menos que el precio de la tienda más {c.sobre}</strong>. Si la
              tienda sube una etiqueta por encima de tu precio, esa pieza se vende a su mínimo hasta que lo cambies.
            </p>
          </Seccion>

          <Seccion id="calculadora" titulo="Calcula tu ganancia">
            <p className="prosa">Escribe un precio de la tienda y en cuánto la venderías. La cuenta se hace sola.</p>
            <Calculadora c={c} />
          </Seccion>

          <Seccion id="pagar-lux" titulo="Cómo le pagas a Lux">
            <ol className="guia-rv__acciones">
              <li><strong>Cuándo:</strong> desde que confirmas un pedido tienes {c.horasLux} para pagarle a Lux todo lo que te sale ese pedido.</li>
              <li><strong>Cómo:</strong> por pago móvil o transferencia. Los datos de Lux salen en tu panel, en cada pedido, para copiarlos.</li>
              <li><strong>Avisas:</strong> tocas "Avisar que le pagué a Lux" y escribes la referencia. Si pagas en partes, avisas cada una.</li>
              <li><strong>En efectivo o con punto:</strong> en la tienda, y lo anotan ellos.</li>
              <li><strong>Después:</strong> Lux comprueba el pago en su banco y aprueba. Ahí las piezas son tuyas y las retiras.</li>
            </ol>
            <p className="guia-rv__nota">
              Lo que tu clienta te paga a ti y lo que tú le pagas a Lux son dos cuentas aparte. Tu panel las lleva
              separadas, para que nunca se te mezclen.
            </p>
          </Seccion>

          <Seccion id="tope" titulo="Tu tope y tus niveles">
            <p className="prosa">
              El tope es cuánto puedes tener <strong>apartado a la vez</strong>, contado a lo que le pagas a Lux.
              {primerTope ? ` Empiezas con ${primerTope}` : ''}{ultimoTope && ultimoTope !== primerTope ? ` y puedes llegar a ${ultimoTope}` : ''}.
              Cuando se te llena, esperas a que un pedido se apruebe o se cierre para apartar más.
            </p>
            {escalera.length > 0 ? (
              <div className="guia-rv__niveles" role="list">
                {escalera.map((n) => (
                  <div className="guia-rv__nivel" role="listitem" key={n.nivel}>
                    <span className="guia-rv__nivel-num">Nivel {n.nivel}</span>
                    <span className="guia-rv__nivel-tope">{formatearBcv(Number(n.tope_usd))}</span>
                    <span className="guia-rv__nivel-desde">
                      {Number(n.desde_usd) <= 0 ? 'Desde el principio' : `Cuando hayas retirado y pagado ${formatearBcv(Number(n.desde_usd))}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="prosa">
              <strong>Subes</strong> vendiendo y pagando a tiempo. <strong>Bajas un nivel</strong> mientras tengas {c.vencidos} pedidos
              vencidos en {c.ventana}: cuentan solo los que tú confirmaste y no le pagaste a Lux a tiempo, no los que tu
              clienta no pagó. En Inicio ves tu nivel y cuánto te falta para el siguiente.
            </p>
          </Seccion>

          {/* ------------------------------------------------ 3. Manual */}
          <Seccion id="manual" titulo="Tu panel, paso a paso">
            <p className="prosa">
              Son {pasos.length} pasos, en el orden en que los vas a usar. Toca cada uno para abrirlo, y marca "Ya lo entendí"
              cuando lo tengas claro.
            </p>
            <Manual pasos={pasos} />
          </Seccion>

          {/* ------------------------------------------------ 4. Un pedido */}
          <Seccion id="pedido" titulo="Un pedido, de principio a fin">
            <p className="prosa">Toca cada paso, o usa "Siguiente", para ver quién hace qué y cuánto tiempo hay.</p>
            <Recorrido c={c} />
          </Seccion>

          <Seccion id="y-si" titulo="¿Y si algo sale mal?">
            <dl className="guia-rv__si">
              <div><dt>Tu clienta no te paga a tiempo</dt><dd>Las piezas vuelven solas a la tienda después de {c.horasPago}. No pierdes nada.</dd></div>
              <div><dt>Te reporta un pago que no te llegó</dt><dd>Tocas "No me llegó": ese pago deja de contar.</dd></div>
              <div><dt>Ya no quieres el pedido</dt><dd>Lo cancelas con "Cancelar pedido" mientras no le hayas pagado nada a Lux. Lo que te pagó tu clienta lo arreglas con ella.</dd></div>
              <div><dt>No le pagas a Lux a tiempo</dt><dd>El pedido vence. Si ya habías pagado una parte, escríbele a la tienda. Si te pasa {c.vencidos} veces en {c.ventana}, bajas un nivel.</dd></div>
              <div><dt>Cargaste un pago mal</dt><dd>Tocas "Quitar" debajo de ese pago: queda tachado y vuelve a lo que te deben.</dd></div>
            </dl>
          </Seccion>

          {/* ------------------------------------------------ 5. Condiciones */}
          <Seccion id="reglas" titulo="Las reglas del programa">
            <div className="guia-rv__reglas">
              <div>
                <h3>Precios</h3>
                <ul className="guia-rv__lista">
                  <li>Cada pieza te sale la etiqueta menos {c.descuento}, nunca por debajo de su mínimo.</li>
                  <li>Tú cobras al menos la etiqueta más {c.sobre}.</li>
                  <li>Tus precios los pones tú, y los cambias cuando quieras.</li>
                </ul>
              </div>
              <div>
                <h3>Plazos</h3>
                <ul className="guia-rv__lista">
                  <li>Tu clienta tiene {c.horasPago} para pagarte después de apartar.</li>
                  <li>Tú tienes {c.horasLux} para pagarle a Lux después de confirmar.</li>
                  <li>El crédito a tu clienta es tuyo: al menos el {c.inicial} para confirmar, y los días que tú le des.</li>
                </ul>
              </div>
              <div>
                <h3>Pagos</h3>
                <ul className="guia-rv__lista">
                  <li>A Lux le pagas todo lo que te sale el pedido, en uno o varios pagos, con referencia.</li>
                  <li>Lo que te paga tu clienta llega a tu pago móvil: es tu cuenta con ella.</li>
                  <li>Las piezas son tuyas cuando Lux aprueba tu pago, y las retiras en la tienda.</li>
                </ul>
              </div>
              <div>
                <h3>Tu cuenta</h3>
                <ul className="guia-rv__lista">
                  <li>Lux decide a quién le da una cuenta, y la puede pausar.</li>
                  <li>Tu código es personal: no lo compartas.</li>
                  <li>Tienes un tope de apartado, que sube con tu nivel.</li>
                  <li>La venta queda registrada a nombre de tu clienta, con su cédula.</li>
                </ul>
              </div>
            </div>
          </Seccion>

          {/* ------------------------------------------------ 6. Dudas */}
          <Seccion id="preguntas" titulo="Preguntas frecuentes">
            <Preguntas lista={preguntas} />
          </Seccion>

          <Seccion id="palabras" titulo="Palabras que vas a ver">
            <dl className="guia-rv__palabras">
              <div><dt>Etiqueta o precio de la tienda</dt><dd>Lo que paga cualquier clienta en la tienda.</dd></div>
              <div><dt>Te sale</dt><dd>Lo que le pagas a Lux por una pieza.</dd></div>
              <div><dt>Tu precio</dt><dd>Lo que le cobras a tu clienta.</dd></div>
              <div><dt>Ganas</dt><dd>Tu precio menos lo que te sale.</dd></div>
              <div><dt>$ BCV</dt><dd>Dólares al cambio del Banco Central. Todo se cuenta así, y se enseña también en bolívares de hoy.</dd></div>
              <div><dt>Apartar</dt><dd>Guardar unas piezas para una clienta mientras paga. No es venderlas todavía.</dd></div>
              <div><dt>Pago o abono</dt><dd>Cada vez que te pagan una parte. Cada uno con su referencia.</dd></div>
              <div><dt>Referencia</dt><dd>El número que da el banco al hacer un pago móvil o una transferencia.</dd></div>
              <div><dt>Confirmar</dt><dd>Decir que tu clienta ya te pagó. Desde ahí corre tu plazo con Lux.</dd></div>
              <div><dt>Aprobar</dt><dd>Lo que hace la tienda cuando comprueba tu pago. Ahí se registra la venta.</dd></div>
              <div><dt>Vencer</dt><dd>Se pasó el plazo sin pagar: las piezas pueden volver a la tienda.</dd></div>
              <div><dt>Tope</dt><dd>Cuánto puedes tener apartado a la vez.</dd></div>
              <div><dt>Nivel</dt><dd>Tu escalón: cada uno te da un tope más alto.</dd></div>
              <div><dt>Días de crédito</dt><dd>Los días que le das a tu clienta para terminar de pagarte.</dd></div>
              <div><dt>Código</dt><dd>Tu llave para entrar al panel. Doce letras y números, solo tuyo.</dd></div>
            </dl>
          </Seccion>

          {/* ------------------------------------------------ 7. Empieza */}
          <Seccion id="unete" titulo="Quiero ser revendedor">
            <p className="prosa">
              Llena tus datos y tócale a "Mandar mis datos por WhatsApp": se abre un mensaje para Lux con todo lo
              que hace falta para crear tu cuenta. No se guarda nada en esta página.
            </p>
            <Solicitud whatsapp={textos.whatsapp_tienda?.trim() || null} />
          </Seccion>

          <footer className="guia-rv__pie">
            <div className="guia-rv__regla" aria-hidden="true"><span /><Monograma tamano={32} /><span /></div>
            <p>Lux by Emory · Desde Sabana de Mendoza para toda Venezuela</p>
            <p>Las cifras de esta guía son las de hoy: si cambian, la guía cambia sola.</p>
          </footer>
        </main>
      </div>

      {/* En el teléfono, lo que más se busca queda al alcance del pulgar. */}
      <nav className="guia-rv__abajo" aria-label="Atajos de la guía">
        <button
          type="button" className="boton boton--secundario"
          onClick={() => {
            setIndiceAbierto(true);
            document.getElementById('indice')?.scrollIntoView({ block: 'start' });
          }}
        >
          Índice
        </button>
        <button type="button" className="boton boton--confirmar" onClick={() => ir('unete')}>Quiero ser revendedor</button>
      </nav>
    </div>
  );
}
