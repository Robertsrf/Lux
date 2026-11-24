import { fuenteFoto } from '../../../../lib/fotos';
import { PLANTILLAS } from '../tema';
import type { CatalogoRv } from '../tipos';
import { ErrorRv } from '../piezas/Comunes';
import { Ficha } from '../piezas/Ficha';
import { BarraPedido, HojaPedido } from '../piezas/Pedido';

/** Lo que va en las tres, fuera del flujo: la barra, la ficha, la hoja del pedido. */
export function Capas({ c }: { c: CatalogoRv }) {
  return (
    <>
      <BarraPedido c={c} />
      <Ficha c={c} />
      <HojaPedido c={c} />
    </>
  );
}

/** El error, si lo hay, sin tapar nada (el de la hoja del pedido va dentro de ella). */
export function ErrorArriba({ c }: { c: CatalogoRv }) {
  if (c.pedidoAbierto) return null;
  return <ErrorRv c={c} />;
}

/** La frase de su portada: la suya o la de la plantilla. */
export function frase(c: CatalogoRv): string {
  return c.tema.frase ?? PLANTILLAS.find((p) => p.id === c.tema.plantilla)?.frase ?? '';
}

/** La foto de su portada, con sus dos tamaños. */
export function fotoPortada(c: CatalogoRv, sizes: string) {
  const p = c.portada;
  return p ? fuenteFoto(p.foto_path, p.foto_thumb_path, sizes) : null;
}
