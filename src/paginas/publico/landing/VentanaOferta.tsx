import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { CodigoOferta, PiezaOferta } from '../../../lib/ofertas';
import { formatearBcv, formatearBs, formatearDescuento, precioEnBs } from '../../../lib/dinero';
import type { Tasa } from '../../../lib/tipos';
import { Miniaturas, nombreDePieza, totalDeLista, totalDeOferta } from './PiezasOferta';

const FOCALES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * La hoja de las ofertas: un diálogo con el foco atrapado, que se cierra con
 * Escape o tocando el fondo y devuelve el foco a donde estaba. Sube desde
 * abajo en el teléfono (como la hoja de elegir variante) y se centra en
 * pantallas anchas.
 */
export function Dialogo({ titulo, alCerrar, children, ancho = false }: {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  ancho?: boolean;
}) {
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // El primer botón, no el título: quien teclea llega a lo que puede tocar.
    const primero = caja.current?.querySelector<HTMLElement>(FOCALES);
    (primero ?? caja.current)?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar.current(); return; }
      // Con el diálogo encima, las flechas no pasan de pieza en el visor de atrás.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.stopImmediatePropagation(); return; }
      if (e.key !== 'Tab' || !caja.current) return;
      const lista = [...caja.current.querySelectorAll<HTMLElement>(FOCALES)];
      if (lista.length === 0) { e.preventDefault(); return; }
      const a = lista[0]!;
      const z = lista[lista.length - 1]!;
      if (e.shiftKey && (document.activeElement === a || document.activeElement === caja.current)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', alTeclear, true);
    return () => {
      document.removeEventListener('keydown', alTeclear, true);
      document.body.style.overflow = overflow;
      previo?.focus?.();
    };
  }, []);

  return (
    <div className="lp-fondo" onClick={alCerrar}>
      <div
        className={ancho ? 'lp-hoja lp-hoja--ancha' : 'lp-hoja'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        ref={caja}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="lp-hoja__asa" aria-hidden="true" />
        <h2 className="lp-hoja__titulo" id={idTitulo}>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

/** "12 de noviembre de 2026, 2:35 p. m." en la hora de Venezuela. */
export function fechaDeVencimiento(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return new Intl.DateTimeFormat('es-VE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Caracas' }).format(t);
}

/**
 * El diálogo único de todo código ganado: sus piezas con el precio de
 * siempre tachado y el de oferta, el total, el código grande para guardarlo
 * con una captura (sirve también en la tienda) y hasta cuándo vale, que es
 * la única fecha que se enseña.
 */
export function VentanaOferta({ codigo, tasa, faltan = [], alVerPedido, alCerrar }: {
  codigo: CodigoOferta;
  /** Piezas del código que el pedido todavía no cubre (por falta de red o de existencia). */
  faltan?: readonly PiezaOferta[];
  tasa: Pick<Tasa, 'tasa_bcv'> | null;
  alVerPedido: () => void;
  alCerrar: () => void;
}) {
  const lista = totalDeLista(codigo.piezas);
  const oferta = totalDeOferta(codigo.piezas);
  const vence = fechaDeVencimiento(codigo.vence_en);

  return (
    <Dialogo titulo={`Tu código: ${formatearDescuento(codigo.pct)} menos`} alCerrar={alCerrar} ancho>
      <Miniaturas piezas={codigo.piezas} grande />

      <ul className="lp-lineas">
        {codigo.piezas.map((p) => (
          <li key={p.modelo_id} className="lp-lineas__fila">
            <span className="lp-lineas__nombre">
              {nombreDePieza(p)}{p.cantidad > 1 ? ` × ${p.cantidad}` : ''}
            </span>
            <span className="lp-lineas__precios">
              <s className="lp-lineas__antes"><span className="visualmente-oculto">Antes </span>{formatearBcv(p.precio_lista_usd)}</s>
              <strong>{formatearBcv(p.precio_oferta_usd)}</strong>
              <span>{formatearBs(precioEnBs(p.precio_oferta_usd, tasa))}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="lp-total">
        <span>Las piezas juntas</span>
        <span className="lp-total__cifras">
          <s><span className="visualmente-oculto">Antes </span>{formatearBcv(lista)}</s>
          <strong>{formatearBs(precioEnBs(oferta, tasa))}</strong>
          <strong>{formatearBcv(oferta)}</strong>
        </span>
      </div>

      <div className="lp-codigo">
        <span className="lp-codigo__rotulo">Tu código</span>
        <span className="lp-codigo__valor" aria-label={`Código ${codigo.codigo.split('').join(' ')}`}>{codigo.codigo}</span>
        <p className="lp-codigo__nota">Guárdalo con una captura: sirve también en la tienda.</p>
        {vence ? <p className="lp-codigo__vence">Vence el {vence}</p> : null}
      </div>

      {faltan.length === 0 ? (
        <p className="lp-hoja__pie">Ya están en tu pedido con el descuento. El total final lo confirma tu pedido.</p>
      ) : (
        <p className="lp-hoja__pie" role="status">
          Todavía falta en tu pedido: {faltan.map((p) => `${nombreDePieza(p)}${p.cantidad > 1 ? ` × ${p.cantidad}` : ''}`).join(', ')}.
          El descuento solo vale con todas las piezas: elígelas con «Seguir viendo» y agrégalas, o toca «Ver mi pedido» para revisarlo.
        </p>
      )}

      <div className="lp-hoja__acciones">
        <button type="button" className="pub-boton lp-boton" onClick={alVerPedido}>Ver mi pedido</button>
        <button type="button" className="pub-boton pub-boton--claro lp-boton" onClick={alCerrar}>Seguir viendo</button>
      </div>
    </Dialogo>
  );
}
