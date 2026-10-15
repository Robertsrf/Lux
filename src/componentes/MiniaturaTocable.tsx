import { urlPublicaFoto } from '../lib/fotos';

/**
 * Una miniatura que se toca para ver la pieza en grande (el visor).
 *
 * Para las listas donde hay que asegurarse de QUÉ pieza es: lo que se
 * apartó en un pedido, lo que se vendió, lo que se cuenta. Sin foto queda el
 * cuadro vacío de siempre, que no se toca.
 */
export function MiniaturaTocable({ thumb, nombre, alVer, className = 'miniatura' }: {
  thumb: string | null;
  nombre: string;
  alVer: () => void;
  className?: string;
}) {
  const foto = urlPublicaFoto(thumb);
  if (!foto) return <span className={className} />;
  return (
    <button
      type="button"
      className={`${className} miniatura--tocable`}
      style={{ padding: 0, backgroundImage: `url(${foto})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      aria-label={`Ver en grande ${nombre}`}
      onClick={alVer}
    />
  );
}
