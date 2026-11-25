import { useState, type ReactNode } from 'react';
import { fuenteFoto } from '../../../lib/fotos';
import { aMonto, deMonto, formatearBcv, formatearBs, porCantidad, precioEnBs, sumar } from '../../../lib/dinero';
import { nombreConVariante } from '../../../lib/familias';
import type { CodigoOferta, OrigenOferta, PiezaOferta } from '../../../lib/ofertas';
import type { Tasa } from '../../../lib/tipos';

/**
 * Lo que las secciones de ofertas necesitan del catálogo: la tasa para los
 * bolívares y dos acciones. Las arma `Catalogo.tsx`, que es quien tiene el
 * pedido.
 */
export interface AccionesOferta {
  tasa: Pick<Tasa, 'tasa_bcv'> | null;
  /**
   * Pide el código, mete las piezas del código al pedido y enseña la ventana
   * del código. Lanza un `Error` con el mensaje que la base dejó para la
   * clienta si no se puede.
   */
  querer: (origen: OrigenOferta, modelos: number[], ref?: number) => Promise<void>;
  /** Enseña de nuevo la ventana de un código que ya se ganó. */
  verCodigo: (codigo: CodigoOferta) => void;
}

/** Lo que cuestan las piezas con el descuento (lo que dicen las etiquetas de oferta, sumado). */
export function totalDeOferta(piezas: PiezaOferta[]): number {
  return deMonto(sumar(piezas.map((p) => porCantidad(aMonto(p.precio_oferta_usd), p.cantidad))));
}

/** Lo que costarían sin el descuento. */
export function totalDeLista(piezas: PiezaOferta[]): number {
  return deMonto(sumar(piezas.map((p) => porCantidad(aMonto(p.precio_lista_usd), p.cantidad))));
}

/** El nombre de una pieza de oferta, con su medida. */
export const nombreDePieza = (p: PiezaOferta): string => nombreConVariante(p.nombre, p.variante);

/** Las fotos de las piezas, juntas, pequeñas. Sin foto, un cuadro liso. */
export function Miniaturas({ piezas, grande = false }: { piezas: PiezaOferta[]; grande?: boolean }) {
  return (
    <ul className={grande ? 'lp-minis lp-minis--grande' : 'lp-minis'}>
      {piezas.map((p) => {
        const foto = fuenteFoto(p.foto_url, p.foto_thumb, grande ? '(max-width: 640px) 40vw, 200px' : '(max-width: 640px) 22vw, 96px');
        return (
          <li key={p.modelo_id} className="lp-minis__pieza">
            {foto ? <img {...foto} alt="" loading="lazy" /> : <span className="lp-minis__vacia" />}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * El precio de una oferta: el de siempre tachado y el de oferta, en
 * bolívares y en dólares BCV del mismo tamaño. El tachado se dice también
 * para el lector de pantalla ("antes").
 */
export function PrecioDeOferta({ lista, oferta, tasa }: {
  lista: number;
  oferta: number;
  tasa: Pick<Tasa, 'tasa_bcv'> | null;
}) {
  return (
    <p className="lp-precio">
      <span className="lp-precio__antes">
        <span className="visualmente-oculto">Antes </span>
        <s>{formatearBcv(lista)}</s>
      </span>
      <span className="lp-precio__ahora">{formatearBs(precioEnBs(oferta, tasa))}</span>
      <span className="lp-precio__ahora">{formatearBcv(oferta)}</span>
    </p>
  );
}

/**
 * El botón de ganar una oferta, con lo que pasa mientras la base responde y
 * lo que dice si no se puede. Un botón y un mensaje, para no repetirlos en
 * cada tarjeta.
 */
export function BotonOferta({ texto, acciones, origen, modelos, id }: {
  texto: string;
  acciones: AccionesOferta;
  origen: OrigenOferta;
  modelos: number[];
  id?: number;
}): ReactNode {
  const [pidiendo, setPidiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function pedir() {
    setPidiendo(true);
    setMensaje(null);
    try {
      await acciones.querer(origen, modelos, id);
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No pudimos darte el código ahora. Inténtalo de nuevo en un momento.');
    } finally {
      setPidiendo(false);
    }
  }

  return (
    <>
      <button type="button" className="pub-boton lp-boton lp-oferta__boton" disabled={pidiendo} onClick={() => void pedir()}>
        {pidiendo ? 'Un momento' : texto}
      </button>
      {mensaje ? <p className="lp-oferta__aviso" role="alert">{mensaje}</p> : null}
    </>
  );
}
