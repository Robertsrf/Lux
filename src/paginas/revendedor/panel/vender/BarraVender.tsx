import { formatearBcv, formatearBs } from '../../../../lib/dinero';

/**
 * La barra fija de Vender: cuántas piezas, el total en $ BCV y en Bs, y el
 * botón del paso. Encima de la barra de abajo del panel (la tienda ya la
 * pone ahí: `.barra-carrito`). Si falta algo, lo dice en su primera línea.
 */
export function BarraVender({ piezas, total, totalBs, boton, falta, guardando, alSeguir }: {
  piezas: number;
  total: number;
  totalBs: number | null;
  boton: string;
  falta: string | null;
  guardando: boolean;
  alSeguir: () => void;
}) {
  return (
    <div className="barra-carrito vrv-barra">
      {falta ? <p className="vrv-barra__falta" aria-live="polite">{falta}</p> : null}
      <div className="barra-carrito__resumen">
        <div className="barra-carrito__piezas">{piezas} {piezas === 1 ? 'pieza' : 'piezas'}</div>
        <div className="vrv-barra__total">
          <span>{formatearBcv(total)}</span>
          {totalBs !== null ? <span>{formatearBs(totalBs)}</span> : null}
        </div>
      </div>
      <button type="button" className="boton" disabled={falta !== null || guardando} onClick={alSeguir}>
        {guardando ? 'Guardando' : boton}
      </button>
    </div>
  );
}
