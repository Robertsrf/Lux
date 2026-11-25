import { useState } from 'react';
import { vigente, type CodigoOferta } from '../../../lib/ofertas';
import type { AccionesOferta } from './PiezasOferta';
import { Titulo } from './Titulo';

/** La fecha de hoy en el teléfono, "2026-11-11": un estuche por día. */
const hoy = (): string => {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};
const clave = () => `lux-estuche-${hoy()}`;

function yaAbiertoHoy(): boolean {
  try { return localStorage.getItem(clave()) !== null; } catch { return false; }
}
function recordarApertura(): void {
  try { localStorage.setItem(clave(), '1'); } catch { /* sin almacenamiento: una vez por visita */ }
}

/**
 * El estuche, en línea fina de oro: la tapa gira con `rotateX`, sale un
 * destello y los trazos de filigrana aparecen. Solo `transform` y
 * `opacity`; con movimiento reducido se queda abierto o cerrado, sin giro.
 */
function Dibujo({ abierto }: { abierto: boolean }) {
  return (
    <div className={abierto ? 'lp-estuche__escena lp-estuche__escena--abierto' : 'lp-estuche__escena'} aria-hidden="true">
      <svg className="lp-estuche__fondo" viewBox="0 0 240 150" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* El interior, con la joya que asoma al abrirse */}
        <rect x="20" y="70" width="200" height="70" rx="6" className="lp-estuche__cuerpo" />
        <path className="lp-estuche__joya" d="M96 78 C96 98 144 98 144 78" />
        <circle className="lp-estuche__joya lp-estuche__gema" cx="120" cy="98" r="5" />
      </svg>
      <div className="lp-estuche__tapa">
        <svg viewBox="0 0 240 150" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path className="lp-estuche__cuerpo" d="M20 70 V44 C20 36 26 30 34 30 H206 C214 30 220 36 220 44 V70 Z" />
          <path className="lp-estuche__filigrana" d="M60 50 C80 40 100 60 120 50 C140 40 160 60 180 50" />
          <path className="lp-estuche__filigrana" d="M84 60 C100 54 112 66 120 60 C128 54 140 66 156 60" />
          <circle className="lp-estuche__broche" cx="120" cy="70" r="4" />
        </svg>
      </div>
      <span className="lp-estuche__destello" />
    </div>
  );
}

/**
 * "Abre tu estuche": uno al día. Al abrirlo la base elige al azar un combo de
 * la semana o una pieza de la selección y da el código; la ventana del
 * código lo enseña. Abierto hoy, dice cuál es su código de hoy.
 */
export function Estuche({ id, titulo, texto, codigos, acciones }: {
  id: string;
  titulo: string;
  texto: string | null;
  codigos: CodigoOferta[];
  acciones: AccionesOferta;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const [abiertoAhora, setAbiertoAhora] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [abiertoHoy, setAbiertoHoy] = useState(yaAbiertoHoy);

  const deHoy = [...codigos].reverse().find((c) => c.origen === 'estuche' && vigente(c)) ?? null;
  const abierto = abiertoAhora || abiertoHoy || deHoy !== null;

  async function abrir() {
    setAbriendo(true);
    setMensaje(null);
    try {
      await acciones.querer('estuche', []);
      recordarApertura();
      setAbiertoAhora(true);
      setAbiertoHoy(true);
    } catch (e) {
      // El mensaje es de la base y está pensado para ella ("ya abriste el estuche de hoy").
      setMensaje(e instanceof Error ? e.message : 'No pudimos abrir el estuche ahora. Inténtalo de nuevo en un momento.');
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <section className="lp-estuche" aria-labelledby={id}>
      <Titulo id={id} texto={texto}>{titulo}</Titulo>
      <Dibujo abierto={abierto} />
      {deHoy ? (
        <div className="lp-estuche__hoy">
          <p>Tu código de hoy es <strong className="lp-estuche__codigo">{deHoy.codigo}</strong>.</p>
          <button type="button" className="pub-boton lp-boton" onClick={() => acciones.verCodigo(deHoy)}>Ver mi código</button>
        </div>
      ) : abiertoHoy ? (
        <p className="lp-estuche__hoy">Hoy ya abriste tu estuche. Mañana hay otro para ti.</p>
      ) : (
        <button type="button" className="pub-boton lp-boton" disabled={abriendo} onClick={() => void abrir()}>
          {abriendo ? 'Abriendo' : 'Abrir mi estuche'}
        </button>
      )}
      {mensaje ? <p className="lp-oferta__aviso" role="alert">{mensaje}</p> : null}
    </section>
  );
}
