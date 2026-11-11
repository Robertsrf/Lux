import { useState } from 'react';
import { fuenteFoto } from '../../../lib/fotos';
import { formatearBcv, formatearBs, formatearDescuento } from '../../../lib/dinero';
import { nombreConVariante } from '../../../lib/familias';
import type { ModeloPublico } from '../../../lib/tipos';
import { Dialogo } from './VentanaOferta';

interface PropsHoja {
  a: ModeloPublico;
  b: ModeloPublico;
  /** `oferta_pareja_pct` de la base. */
  pct: number;
  /** Pide el código y mete las dos al pedido; lanza con el mensaje de la base si no se puede. */
  alQuerer: () => Promise<void>;
  alCerrar: () => void;
}

/** Una de las dos piezas: foto, nombre y su precio de siempre (el de oferta lo dice la ventana del código, que es el de la base). */
function Una({ m }: { m: ModeloPublico }) {
  const foto = fuenteFoto(m.foto_path, m.foto_thumb_path, '(max-width: 640px) 40vw, 200px');
  return (
    <li className="lp-dos__una">
      {foto ? <img className="lp-dos__foto" {...foto} alt="" /> : <span className="lp-dos__foto" />}
      <span className="lp-dos__nombre">{nombreConVariante(m.nombre, m.variante)}</span>
      <span className="lp-dos__precio">{formatearBs(m.precio_bs)}</span>
      <span className="lp-dos__precio">{formatearBcv(m.precio_usd)}</span>
    </li>
  );
}

/** La hoja de dos piezas con su porcentaje: la misma para "Las dos que miraste" y "Complétalo". */
function HojaDos({ titulo, texto, boton, no, a, b, alQuerer, alCerrar }: PropsHoja & {
  titulo: string;
  texto: string;
  boton: string;
  no: string;
}) {
  const [pidiendo, setPidiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function quiero() {
    setPidiendo(true);
    setMensaje(null);
    try {
      await alQuerer();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No pudimos darte el código ahora. Inténtalo de nuevo en un momento.');
      setPidiendo(false);
    }
  }

  return (
    <Dialogo titulo={titulo} alCerrar={alCerrar}>
      <p className="lp-hoja__texto">{texto}</p>
      <ul className="lp-dos">
        <Una m={a} />
        <Una m={b} />
      </ul>
      {mensaje ? <p className="lp-oferta__aviso" role="alert">{mensaje}</p> : null}
      <div className="lp-hoja__acciones">
        <button type="button" className="boton lp-boton" disabled={pidiendo} onClick={() => void quiero()}>
          {pidiendo ? 'Un momento' : boton}
        </button>
        <button type="button" className="boton boton--secundario lp-boton" onClick={alCerrar}>{no}</button>
      </div>
    </Dialogo>
  );
}

/** Las dos que más miró: sale una vez por visita, al cerrar el detalle. */
export function HojaPareja(props: PropsHoja) {
  return (
    <HojaDos
      {...props}
      titulo={`¿Te gustaron las dos? Llévatelas con ${formatearDescuento(props.pct)}`}
      texto="Son las que más estuviste mirando."
      boton="Las quiero"
      no="Ahora no"
    />
  );
}

/** La pieza que combina con la que acaba de agregar. */
export function HojaCompletalo(props: PropsHoja) {
  return (
    <HojaDos
      {...props}
      titulo={`Complétalo: las dos con ${formatearDescuento(props.pct)}`}
      texto="Esta combina con lo que acabas de agregar."
      boton="Las dos con descuento"
      no="Así está bien"
    />
  );
}
