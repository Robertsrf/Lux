import { formatearDescuento } from '../../../lib/dinero';
import { motivoDeCodigo, type CodigoOferta, type EstadoCodigo, type MotivoCodigo } from '../../../lib/ofertas';
import { fechaDeVencimiento } from './VentanaOferta';
import { nombreDePieza } from './PiezasOferta';

/**
 * Por qué un código no se aplica, dicho para la clienta. A quien no tiene
 * sesión la base solo le dice `no_vale`; el "por qué" lo calcula el
 * navegador con las piezas que conoce (`motivoDeCodigo`). Si no encuentra
 * por qué, "ya no sirve".
 */
export function textoDeMotivo(motivo: MotivoCodigo | null, codigo: CodigoOferta): string {
  const piezas = codigo.piezas.reduce((n, p) => n + p.cantidad, 0);
  switch (motivo) {
    case 'faltan_piezas': return `Necesita las ${piezas} piezas`;
    case 'comparte_pieza': return 'Comparte una pieza con otro código';
    case 'vencido': return 'Ya venció';
    case 'usado': return 'Ya se usó';
    case 'anulado': return 'La tienda lo anuló';
    case 'pieza_no_disponible': return 'Una pieza ya no está';
    default: return 'Este código ya no sirve';
  }
}

/**
 * "Tus códigos": cada código ganado con sus piezas, el porcentaje, hasta
 * cuándo vale y si aplica a este pedido (según la base, lo que ya se vio al
 * cotizar) o por qué no. "Quitar" lo suelta del pedido sin tocar las piezas.
 */
export function TusCodigos({ codigos, estados, carrito, alQuitar }: {
  codigos: CodigoOferta[];
  /** Lo que `cotizar_pedido` dijo de cada código; null mientras responde o si no pudo. */
  estados: EstadoCodigo[] | null;
  carrito: ReadonlyMap<number, number>;
  alQuitar: (codigo: string) => void;
}) {
  if (codigos.length === 0) return null;
  return (
    <div className="lp-tuscodigos">
      <h3 className="lp-tuscodigos__titulo">Tus códigos</h3>
      <ul className="lp-tuscodigos__lista">
        {codigos.map((c) => {
          const base = estados?.find((e) => e.codigo === c.codigo) ?? null;
          // La base manda; el navegador explica. Sin respuesta, solo lo que él ve.
          const propio = motivoDeCodigo(c, codigos, carrito);
          const aplica = base ? base.aplica : propio === null;
          const motivo: MotivoCodigo | null = aplica ? null
            : propio ?? (base && base.motivo !== 'no_vale' ? base.motivo : null);
          const vence = fechaDeVencimiento(c.vence_en);
          return (
            <li key={c.codigo} className={aplica ? 'lp-tuscodigos__uno' : 'lp-tuscodigos__uno lp-tuscodigos__uno--no'}>
              <div className="lp-tuscodigos__cabeza">
                <span className="lp-tuscodigos__codigo">{c.codigo}</span>
                <span className="lp-tuscodigos__pct">{formatearDescuento(c.pct)} menos</span>
              </div>
              <p className="lp-tuscodigos__piezas">{c.piezas.map((p) => nombreDePieza(p)).join(' · ')}</p>
              <p className="lp-tuscodigos__estado">
                {aplica ? 'Aplicado a tu pedido' : textoDeMotivo(motivo, c)}
                {vence ? ` · Vence el ${vence}` : ''}
              </p>
              <button type="button" className="enlace-texto" onClick={() => alQuitar(c.codigo)}>
                Quitar<span className="visualmente-oculto"> el código {c.codigo}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
