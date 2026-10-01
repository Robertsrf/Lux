import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { Campo } from '../../componentes/Piezas';
import { Progreso } from '../../componentes/Progreso';
import { copiarTexto } from '../../componentes/PagoMovil';
import {
  aMonto, deMonto, etiquetaConDescuentoRv, formatearBcv, formatearEntero, gananciaPct, gananciaPorPieza,
  porCantidad, precioSobreEtiqueta,
} from '../../lib/dinero';
import {
  PALETAS, claseTema, enlaceCatalogoRv, enlaceWhatsApp, usuarioDesdeNombre, usuarioValido,
} from '../../lib/revendedor';
import type { PaletaRevendedor } from '../../lib/tipos';

/**
 * Las piezas que se tocan de la guía de revendedores. La página
 * (GuiaRevendedor.tsx) pone el texto; aquí vive lo que responde.
 */

/** Las cifras del programa ya escritas, con su palabra si la base no respondió. */
export interface Cifras {
  descuentoPct: number | null;
  sobreUsd: number | null;
  descuento: string;
  sobre: string;
  horasPago: string;
  horasLux: string;
  inicial: string;
  ventana: string;
  vencidos: string;
}

/** Un número escrito por una persona: "20", "20,5" o "20.5". */
function leerCifra(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ------------------------------------------------------------ calculadora */

/**
 * ¿Cuánto gano? Con el descuento completo, la cuenta de `rv_precio_lux`
 * sin su piso: por eso dice que es un ejemplo. Las cuentas son las de
 * lib/dinero.ts, las mismas del panel.
 */
export function Calculadora({ c }: { c: Cifras }) {
  const [etiqueta, setEtiqueta] = useState('20');
  const [cobras, setCobras] = useState('');
  const [piezas, setPiezas] = useState('10');

  const e = leerCifra(etiqueta);
  const listo = e !== null && e > 0 && c.descuentoPct !== null && c.sobreUsd !== null;
  const teSale = listo ? etiquetaConDescuentoRv(e, c.descuentoPct ?? 0) : null;
  const minimo = listo ? precioSobreEtiqueta(e, c.sobreUsd ?? 0, 0) : null;
  const tuPrecio = leerCifra(cobras) ?? minimo;
  const bajo = tuPrecio !== null && minimo !== null && tuPrecio < minimo;
  const ganas = teSale !== null && tuPrecio !== null && !bajo ? gananciaPorPieza(tuPrecio, teSale) : null;
  const n = Math.floor(leerCifra(piezas) ?? 0);
  const alMes = ganas !== null && n > 0 ? deMonto(porCantidad(aMonto(ganas), n)) : null;

  return (
    <div className="guia-rv__calculadora">
      <div className="guia-rv__campos">
        <Campo etiqueta="Precio de la tienda · $ BCV" htmlFor="calc-etiqueta" pista="Por ejemplo: escribe el de cualquier pieza.">
          <input id="calc-etiqueta" inputMode="decimal" value={etiqueta} onChange={(ev) => setEtiqueta(ev.target.value)} autoComplete="off" />
        </Campo>
        <Campo
          etiqueta="Tú la vendes en · $ BCV"
          htmlFor="calc-cobras"
          pista={minimo !== null ? `Vacío: a lo mínimo, ${formatearBcv(minimo)}.` : undefined}
          error={bajo && minimo !== null ? `Lo mínimo es ${formatearBcv(minimo)}: la etiqueta más ${c.sobre}.` : null}
        >
          <input id="calc-cobras" inputMode="decimal" value={cobras} onChange={(ev) => setCobras(ev.target.value)} autoComplete="off" />
        </Campo>
        <Campo etiqueta="Piezas que vendes al mes" htmlFor="calc-piezas">
          <input id="calc-piezas" inputMode="numeric" value={piezas} onChange={(ev) => setPiezas(ev.target.value)} autoComplete="off" />
        </Campo>
      </div>

      {listo && teSale !== null && minimo !== null ? (
        <dl className="guia-rv__cuenta" aria-live="polite">
          <div><dt>Te sale</dt><dd>{formatearBcv(teSale)}</dd><p>Lo que le pagas a Lux: la etiqueta menos {c.descuento}.</p></div>
          <div><dt>Lo mínimo que cobras</dt><dd>{formatearBcv(minimo)}</dd><p>La etiqueta más {c.sobre}.</p></div>
          <div className="guia-rv__cuenta-total">
            <dt>Ganas por pieza</dt>
            <dd>{ganas !== null && tuPrecio !== null ? formatearBcv(ganas) : '—'}</dd>
            <p>{ganas !== null && tuPrecio !== null ? `El ${formatearEntero(gananciaPct(tuPrecio, teSale))} % de lo que cobras.` : 'Sube tu precio hasta el mínimo.'}</p>
          </div>
          {alMes !== null ? (
            <div className="guia-rv__cuenta-total"><dt>Con {formatearEntero(n)} al mes</dt><dd>{formatearBcv(alMes)}</dd><p>Lo que te queda a ti.</p></div>
          ) : null}
        </dl>
      ) : (
        <p className="campo__pista">Escribe un precio para ver la cuenta.</p>
      )}
      <p className="campo__pista">
        Es un ejemplo con el descuento completo. En tu panel ves lo que de verdad te sale cada pieza:
        en algunas un poco más, porque ninguna baja de su precio mínimo.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- recorrido */

interface Fase { titulo: string; quien: string; pildora: ReactNode; texto: string; plazo?: string }

/** Un pedido de principio a fin, una fase a la vez, con la píldora que ve en su panel. */
export function Recorrido({ c }: { c: Cifras }) {
  const fases: Fase[] = [
    {
      titulo: 'Tu clienta pide', quien: 'Tu clienta',
      pildora: <span className="etiqueta etiqueta--alerta">Esperando su pago · {c.horasPago}</span>,
      texto: `Abre tu catálogo, elige sus piezas, escribe su cédula y aparta. Las piezas quedan guardadas para ella mientras te paga a ti. Si no te paga en ${c.horasPago}, vuelven solas a la tienda.`,
      plazo: `${c.horasPago} para pagarte`,
    },
    {
      titulo: 'Te paga a ti', quien: 'Tu clienta y tú',
      pildora: <span className="etiqueta etiqueta--alerta">Te reportó un pago</span>,
      texto: 'Te paga a TU pago móvil y te avisa desde el enlace de su pedido, con la referencia. Tú miras tu banco y tocas "Me llegó". Mientras no confirmes, sus piezas siguen guardadas: la clienta que ya pagó no las pierde.',
      plazo: 'Sin reloj mientras esperas',
    },
    {
      titulo: 'Confirmas', quien: 'Tú',
      pildora: <span className="etiqueta etiqueta--alerta">Págale a Lux · {c.horasLux}</span>,
      texto: `Cuando te pagó todo, o al menos el ${c.inicial} si le das crédito, tocas "Confirmar el pedido". Desde ese momento corre tu plazo para pagarle a Lux.`,
      plazo: `${c.horasLux} para pagarle a Lux`,
    },
    {
      titulo: 'Le pagas a Lux', quien: 'Tú',
      pildora: <span className="etiqueta etiqueta--alerta">Lux revisa tu pago</span>,
      texto: 'Le pagas a Lux lo que te sale el pedido, en uno o varios pagos, y avisas desde tu panel con la referencia de cada uno. Lux lo comprueba en su banco.',
    },
    {
      titulo: 'Lux aprueba', quien: 'La tienda',
      pildora: <span className="etiqueta etiqueta--exito">Aprobado · retíralo en la tienda</span>,
      texto: 'La tienda aprueba tu pago. Ahí la venta queda registrada a nombre de tu clienta y las piezas son tuyas: te esperan en la tienda.',
    },
    {
      titulo: 'Retiras y entregas', quien: 'Tú',
      pildora: <span className="etiqueta etiqueta--exito">Retirado</span>,
      texto: 'Pasas por la tienda, retiras las piezas y se las entregas a tu clienta. Si le diste crédito, sigues cargando lo que te pague hasta que no te deba nada.',
    },
  ];
  const [i, setI] = useState(0);
  const f = fases[i]!;

  return (
    <div className="guia-rv__recorrido">
      <ol className="guia-rv__fases">
        {fases.map((x, n) => (
          <li key={x.titulo}>
            <button
              type="button"
              className={n === i ? 'guia-rv__fase guia-rv__fase--actual' : n < i ? 'guia-rv__fase guia-rv__fase--hecha' : 'guia-rv__fase'}
              aria-current={n === i ? 'step' : undefined}
              onClick={() => setI(n)}
            >
              <span className="guia-rv__fase-num" aria-hidden="true">{n + 1}</span>
              <span>{x.titulo}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="panel guia-rv__fase-detalle" aria-live="polite">
        <p className="guia-rv__fase-paso">Paso {i + 1} de {fases.length} · {f.quien}</p>
        <h3>{f.titulo}</h3>
        <p className="prosa">{f.texto}</p>
        <p className="guia-rv__en-panel">En tu panel lo ves así: {f.pildora}</p>
        {f.plazo ? <p className="guia-rv__plazo">{f.plazo}</p> : null}
        <div className="grupo-botones">
          <button type="button" className="boton boton--secundario" disabled={i === 0} onClick={() => setI(i - 1)}>Anterior</button>
          <button type="button" className="boton" disabled={i === fases.length - 1} onClick={() => setI(i + 1)}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ manual */

export interface Paso { id: string; titulo: string; donde: string; contenido: ReactNode }

const CLAVE_ENTENDIDOS = 'lux-guia-rv-entendidos';

function leerEntendidos(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE_ENTENDIDOS);
    const lista: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * El manual: un paso por pantalla del panel, plegados, con "Ya lo entendí".
 * El avance se guarda en este teléfono y en ningún otro sitio: es una
 * comodidad para retomar, no un dato de nadie.
 */
export function Manual({ pasos }: { pasos: Paso[] }) {
  const [entendidos, setEntendidos] = useState<string[]>(leerEntendidos);
  const hechos = pasos.filter((p) => entendidos.includes(p.id)).length;

  function marcar(id: string, si: boolean) {
    setEntendidos((antes) => {
      const nuevos = si ? [...new Set([...antes, id])] : antes.filter((x) => x !== id);
      try { localStorage.setItem(CLAVE_ENTENDIDOS, JSON.stringify(nuevos)); } catch { /* sin almacenamiento: vale por esta visita */ }
      return nuevos;
    });
  }

  return (
    <>
      <div className="guia-rv__avance">
        <Progreso
          titulo="Tu avance"
          pct={pasos.length > 0 ? (hechos / pasos.length) * 100 : 0}
          pie={hechos === pasos.length
            ? 'Entendiste todos los pasos. Cuando quieras, pide tu cuenta al final de la guía.'
            : `Llevas ${hechos} de ${pasos.length} pasos. Se guarda en este teléfono: puedes volver cuando quieras.`}
        />
      </div>
      <ol className="guia-rv__pasos">
        {pasos.map((p, n) => {
          const listo = entendidos.includes(p.id);
          return (
            <li key={p.id}>
              <details className={listo ? 'guia-rv__paso guia-rv__paso--listo' : 'guia-rv__paso'}>
                <summary>
                  <span className="guia-rv__paso-num" aria-hidden="true">
                    {listo ? (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" focusable="false">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    ) : n + 1}
                  </span>
                  <span className="guia-rv__paso-titulo">
                    <span>{p.titulo}</span>
                    <span className="guia-rv__paso-donde">{p.donde}{listo ? ' · entendido' : ''}</span>
                  </span>
                </summary>
                <div className="guia-rv__paso-cuerpo">
                  {p.contenido}
                  <label className="casilla guia-rv__entendido">
                    <input type="checkbox" checked={listo} onChange={(e) => marcar(p.id, e.target.checked)} />
                    <span>Ya lo entendí</span>
                  </label>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ---------------------------------------------------------------- preguntas */

export interface Pregunta { p: string; r: string }

function normal(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Las preguntas de siempre, con un buscador: se consulta, no se lee de corrido. */
export function Preguntas({ lista }: { lista: Pregunta[] }) {
  const [busca, setBusca] = useState('');
  const visibles = useMemo(() => {
    const palabras = normal(busca).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return lista;
    return lista.filter((x) => {
      const t = normal(`${x.p} ${x.r}`);
      return palabras.every((w) => t.includes(w));
    });
  }, [busca, lista]);

  return (
    <>
      <Campo etiqueta="Busca tu duda" htmlFor="guia-busca" pista={busca ? `${visibles.length} de ${lista.length} preguntas.` : 'Por ejemplo: crédito, código, retirar.'}>
        <input id="guia-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
      </Campo>
      {visibles.length === 0 ? (
        <p className="prosa">Ninguna pregunta tiene esas palabras. Prueba con otra, o escríbenos: te respondemos por WhatsApp.</p>
      ) : (
        <div className="guia-rv__preguntas">
          {visibles.map((x) => (
            <details key={x.p} className="guia-rv__pregunta">
              <summary>{x.p}</summary>
              <p className="prosa">{x.r}</p>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- solicitud */

interface Datos {
  nombre: string; cedula: string; telefono: string; ciudad: string;
  catalogo: string; usuario: string; usuarioTocado: boolean;
  paleta: PaletaRevendedor; logo: '' | 'si' | 'no'; redes: string; como: string; acepto: boolean;
}

const VACIA: Datos = {
  nombre: '', cedula: '', telefono: '', ciudad: '', catalogo: '', usuario: '', usuarioTocado: false,
  paleta: 'lux', logo: '', redes: '', como: '', acepto: false,
};

type Errores = Partial<Record<'nombre' | 'cedula' | 'telefono' | 'ciudad' | 'usuario' | 'acepto', string>>;

function erroresDe(d: Datos, ocupado: boolean): Errores {
  const e: Errores = {};
  if (d.nombre.trim().split(/\s+/).filter(Boolean).length < 2) e.nombre = 'Escribe tu nombre y tu apellido.';
  const ced = d.cedula.replace(/\D/g, '');
  if (ced.length < 6 || ced.length > 9) e.cedula = 'Escribe tu cédula, solo los números.';
  if (d.telefono.replace(/\D/g, '').length < 11) e.telefono = 'Escribe tu WhatsApp con el código: 0412 1234567.';
  if (!d.ciudad.trim()) e.ciudad = 'Escribe en qué ciudad vendes.';
  if (!usuarioValido(d.usuario)) e.usuario = 'De 3 a 30 letras sin acentos, números o guiones, y que empiece con letra o número.';
  else if (ocupado) e.usuario = 'Ese ya lo usa otro revendedor: prueba con otro.';
  if (!d.acepto) e.acepto = 'Marca que leíste la guía y entiendes cómo funciona.';
  return e;
}

function mensajeDe(d: Datos): string {
  const paleta = PALETAS.find((p) => p.id === d.paleta)?.nombre ?? d.paleta;
  const filas = [
    'Hola, quiero ser revendedor de Lux by Emory. Ya leí la guía.',
    '',
    `Nombre: ${d.nombre.trim()}`,
    `Cédula: ${d.cedula.replace(/\D/g, '')}`,
    `WhatsApp: ${d.telefono.trim()}`,
    `Ciudad: ${d.ciudad.trim()}`,
    `Nombre de mi catálogo: ${d.catalogo.trim() || d.nombre.trim()}`,
    `Mi enlace: ${enlaceCatalogoRv(d.usuario)}`,
    `Colores: ${paleta}`,
    `Logo: ${d.logo === 'si' ? 'sí tengo, te lo mando por aquí' : 'no tengo'}`,
    d.redes.trim() ? `Mis redes: ${d.redes.trim()}` : null,
    d.como.trim() ? `Cómo pienso vender: ${d.como.trim()}` : null,
  ];
  return filas.filter((x) => x !== null).join('\n');
}

/**
 * "Quiero ser revendedor": arma un mensaje de WhatsApp con los datos que
 * hacen falta para crearle su cuenta (los mismos campos de Revendedores).
 * No se guarda nada en la base: el mensaje lo manda la persona.
 */
export function Solicitud({ whatsapp }: { whatsapp: string | null }) {
  const [d, setD] = useState<Datos>(VACIA);
  const [intentado, setIntentado] = useState(false);
  const [estadoUsuario, setEstadoUsuario] = useState<'libre' | 'ocupado' | 'mirando' | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // El usuario sale del nombre del catálogo (o del suyo) hasta que lo toque.
  const usuario = d.usuarioTocado ? d.usuario : usuarioDesdeNombre(d.catalogo || d.nombre);
  const datos = useMemo(() => ({ ...d, usuario }), [d, usuario]);

  // ¿Lo tiene otro? Se pregunta como lo haría cualquiera que abre /r/<usuario>.
  useEffect(() => {
    if (!usuarioValido(usuario)) { setEstadoUsuario(null); return; }
    setEstadoUsuario('mirando');
    let vigente = true;
    const t = setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase.rpc('rv_perfil_publico', { p_usuario: usuario });
        if (!vigente) return;
        setEstadoUsuario(error ? null : data ? 'ocupado' : 'libre');
      })();
    }, 500);
    return () => { vigente = false; clearTimeout(t); };
  }, [usuario]);

  function cambiar<K extends keyof Datos>(k: K, v: Datos[K]) {
    setD((x) => ({ ...x, [k]: v }));
    setEnviado(false);
  }

  // Los errores salen al primer intento de mandar, y desde ahí se corrigen solos.
  const mostrados: Errores = intentado ? erroresDe(datos, estadoUsuario === 'ocupado') : {};

  function enviar() {
    setIntentado(true);
    const e = erroresDe(datos, estadoUsuario === 'ocupado');
    const primero = (['nombre', 'cedula', 'telefono', 'ciudad', 'usuario', 'acepto'] as const).find((k) => e[k]);
    if (primero) {
      document.getElementById(`sol-${primero}`)?.focus();
      return;
    }
    // Sin "noopener" en las opciones: con él, window.open devuelve null
    // aunque abra, y el respaldo abriría WhatsApp dos veces.
    const url = enlaceWhatsApp(whatsapp, mensajeDe(datos));
    const ventana = window.open(url, '_blank');
    if (ventana) ventana.opener = null;
    else window.location.href = url;
    setEnviado(true);
  }

  return (
    <div className="guia-rv__solicitud">
      <div className="fila">
        <Campo etiqueta="Nombre y apellido" htmlFor="sol-nombre" error={mostrados.nombre}>
          <input id="sol-nombre" value={d.nombre} onChange={(e) => cambiar('nombre', e.target.value)} autoComplete="name" />
        </Campo>
        <Campo etiqueta="Cédula" htmlFor="sol-cedula" error={mostrados.cedula}>
          <input id="sol-cedula" inputMode="numeric" value={d.cedula} onChange={(e) => cambiar('cedula', e.target.value)} autoComplete="off" />
        </Campo>
      </div>
      <div className="fila">
        <Campo etiqueta="Tu WhatsApp" htmlFor="sol-telefono" error={mostrados.telefono} pista="Con el código: 0412 1234567. Aquí te escribimos, y aquí te escriben tus clientas.">
          <input id="sol-telefono" type="tel" value={d.telefono} onChange={(e) => cambiar('telefono', e.target.value)} autoComplete="tel" />
        </Campo>
        <Campo etiqueta="Ciudad donde vendes" htmlFor="sol-ciudad" error={mostrados.ciudad}>
          <input id="sol-ciudad" value={d.ciudad} onChange={(e) => cambiar('ciudad', e.target.value)} autoComplete="address-level2" />
        </Campo>
      </div>
      <div className="fila">
        <Campo etiqueta="Nombre de tu catálogo" htmlFor="sol-catalogo" pista="Como lo verán tus clientas: Joyas de María. Vacío, tu nombre.">
          <input id="sol-catalogo" value={d.catalogo} onChange={(e) => cambiar('catalogo', e.target.value)} maxLength={60} autoComplete="off" />
        </Campo>
        <Campo
          etiqueta="Tu enlace"
          htmlFor="sol-usuario"
          error={mostrados.usuario ?? (estadoUsuario === 'ocupado' ? 'Ese ya lo usa otro revendedor: prueba con otro.' : null)}
          pista={usuarioValido(usuario)
            ? `${enlaceCatalogoRv(usuario)}${estadoUsuario === 'libre' ? ' · está libre' : estadoUsuario === 'mirando' ? ' · mirando si está libre' : ''}`
            : 'Así te encuentran tus clientas: va al final de tu enlace.'}
        >
          <input
            id="sol-usuario" value={usuario} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={30}
            onChange={(e) => setD((x) => ({ ...x, usuario: e.target.value.toLowerCase(), usuarioTocado: true }))}
          />
        </Campo>
      </div>

      <fieldset className="paletas guia-rv__paletas">
        <legend>Los colores de tu catálogo</legend>
        {PALETAS.map((p) => (
          <label key={p.id} className={`paleta ${claseTema(p.id)}`}>
            <input type="radio" name="sol-paleta" value={p.id} checked={d.paleta === p.id} onChange={() => cambiar('paleta', p.id)} />
            <span className="paleta__muestra" aria-hidden="true">
              <span className="paleta__ancla"><span className="paleta__acento" /></span>
              <span className="paleta__papel" />
            </span>
            <span className="paleta__nombre">{p.nombre}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="guia-rv__logo">
        <legend>¿Tienes logo?</legend>
        <label className="casilla">
          <input type="radio" name="sol-logo" checked={d.logo === 'si'} onChange={() => cambiar('logo', 'si')} />
          <span>Sí: lo mando en el mismo chat, después del mensaje</span>
        </label>
        <label className="casilla">
          <input type="radio" name="sol-logo" checked={d.logo === 'no'} onChange={() => cambiar('logo', 'no')} />
          <span>No tengo: mi catálogo sale con mi nombre</span>
        </label>
      </fieldset>

      <Campo etiqueta="Tus redes (si tienes)" htmlFor="sol-redes" pista="Tu Instagram o TikTok, para conocerte.">
        <input id="sol-redes" value={d.redes} onChange={(e) => cambiar('redes', e.target.value)} autoComplete="off" />
      </Campo>
      <Campo etiqueta="¿Cómo piensas vender?" htmlFor="sol-como" pista="A quién y dónde: tus compañeras de trabajo, tus estados, tu barrio.">
        <textarea id="sol-como" rows={3} value={d.como} onChange={(e) => cambiar('como', e.target.value)} />
      </Campo>

      <label className={mostrados.acepto ? 'casilla guia-rv__acepto guia-rv__acepto--error' : 'casilla guia-rv__acepto'}>
        <input
          id="sol-acepto" type="checkbox" checked={d.acepto} onChange={(e) => cambiar('acepto', e.target.checked)}
          aria-invalid={mostrados.acepto ? true : undefined} aria-describedby={mostrados.acepto ? 'sol-acepto-error' : undefined}
        />
        <span>Leí la guía y entiendo cómo funciona: los precios, los plazos y cómo se le paga a Lux.</span>
      </label>
      {mostrados.acepto ? <p className="campo__error" id="sol-acepto-error">{mostrados.acepto}</p> : null}

      <div className="grupo-botones guia-rv__enviar">
        <button type="button" className="boton boton--confirmar" onClick={enviar}>Mandar mis datos por WhatsApp</button>
        <button
          type="button" className="boton boton--secundario"
          onClick={() => void copiarTexto(mensajeDe(datos)).then((ok) => { setCopiado(ok); if (ok) window.setTimeout(() => setCopiado(false), 2500); })}
        >
          {copiado ? 'Copiado' : 'Copiar mis datos'}
        </button>
      </div>
      {!whatsapp ? (
        <p className="campo__pista">Se abre WhatsApp: elige el chat de Lux by Emory y manda el mensaje.</p>
      ) : null}

      {enviado ? (
        <div className="panel guia-rv__despues" role="status">
          <span className="panel__titulo">Qué pasa ahora</span>
          <ol>
            <li>Manda el mensaje que se abrió en WhatsApp{d.logo === 'si' ? ', y después tu logo' : ''}. Si no se abrió, toca "Copiar mis datos" y pégalo tú.</li>
            <li>Lux revisa tus datos y te escribe.</li>
            <li>Si todo está bien, te manda tu catálogo, tu panel y tu código para entrar.</li>
            <li>Sigue el manual desde el paso 2, "Entra a tu panel".</li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
