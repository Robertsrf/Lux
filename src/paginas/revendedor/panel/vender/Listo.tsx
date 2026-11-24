import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatearBcv, formatearFechaHora } from '../../../../lib/dinero';
import { enlaceApartado, enlaceWhatsApp } from '../../../../lib/revendedor';
import type { ResumenRevendedor } from '../../../../lib/tipos';
import type { Cobro } from './cuentas';

export interface VentaHecha {
  token: string;
  fase: string;
  clienta: string;
  telefono: string;
  lux: number;
  cobro: Cobro;
}

/** Lo que pasó y lo siguiente que toca, en vez de un aviso arriba. */
export function Listo({ hecho, resumen, alVenderOtra }: {
  hecho: VentaHecha;
  resumen: ResumenRevendedor | null;
  alVenderOtra: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const enlace = enlaceApartado(hecho.token, resumen?.usuario);
  const cerrada = hecho.fase === 'entregado';
  const porPagarLux = hecho.fase === 'por_pagar_lux';
  const mandarEnlace = hecho.cobro !== 'todo';

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section className="vrv-listo" aria-live="polite">
      <h2 className="vrv-listo__titulo">
        {cerrada ? 'Venta anotada.' : porPagarLux ? 'Confirmado.' : 'Pedido hecho.'}
      </h2>
      <p className="vrv-listo__texto">
        {cerrada
          ? hecho.cobro === 'todo'
            ? 'Todas eran tuyas: no le debes nada a Lux.'
            : 'Todas eran tuyas. Lo que te queda debiendo lo cargas en Pedidos cuando te pague.'
          : porPagarLux
            ? <>Págale a Lux <strong>{formatearBcv(hecho.lux)}</strong>.
              {resumen?.vence_lux_en ? <> Tu plazo vence el {formatearFechaHora(resumen.vence_lux_en)}</> : null}</>
            : `Sus piezas quedan apartadas ${resumen?.horas_pago ?? ''} horas mientras te paga.`}
      </p>
      <div className="vrv-listo__acciones">
        {porPagarLux ? <Link className="boton" to="/rv/apartados">Pagarle a Lux</Link> : null}
        {mandarEnlace ? (
          <>
            <a
              className="boton"
              href={enlaceWhatsApp(hecho.telefono, `Hola ${hecho.clienta}, aquí está tu pedido: ${enlace}`)}
              target="_blank" rel="noopener noreferrer"
            >
              Mandarle su enlace por WhatsApp
            </a>
            <button type="button" className="boton boton--secundario" onClick={() => void copiar()}>
              {copiado ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
          </>
        ) : null}
        <button type="button" className="boton boton--secundario" onClick={alVenderOtra}>Vender otra</button>
      </div>
    </section>
  );
}
