import { useEffect, useRef, useState } from 'react';
import { rutaDeLanding } from '../../../lib/fotos';
import { useAparecer } from '../../../hooks/useAparecer';
import type { SeccionLanding } from '../../../hooks/useLanding';
import { Titulo } from './Titulo';

interface ConexionLenta { connection?: { saveData?: boolean } }

/**
 * "De cerca": un video corto en bucle y sin sonido. Se reproduce solo
 * mientras se ve y no se baja nada hasta entonces (`preload="none"`, con su
 * póster). Con el "ahorro de datos" del teléfono encendido no se carga solo:
 * queda el póster y un botón para verlo. Sin video, no sale la sección.
 */
export function VideoLanding({ seccion }: { seccion: SeccionLanding }) {
  const video = useRef<HTMLVideoElement>(null);
  const [caja, visible] = useAparecer<HTMLDivElement>(true);
  const ahorro = Boolean((navigator as Navigator & ConexionLenta).connection?.saveData);
  const [pedido, setPedido] = useState(false);
  const puede = !ahorro || pedido;
  const src = rutaDeLanding(seccion.datos.video);
  const poster = rutaDeLanding(seccion.datos.poster);

  useEffect(() => {
    const v = video.current;
    if (!v || !puede) return;
    if (visible) void v.play().catch(() => undefined);
    else v.pause();
  }, [visible, puede]);

  if (!src) return null;
  return (
    <section className="lp-video" aria-labelledby={`t-${seccion.id}`}>
      {seccion.titulo ? <Titulo id={`t-${seccion.id}`} texto={seccion.texto}>{seccion.titulo}</Titulo> : null}
      <div className="lp-video__caja" ref={caja}>
        <video
          ref={video}
          className="lp-video__video"
          muted
          loop
          playsInline
          preload="none"
          poster={poster ?? undefined}
          src={puede ? src : undefined}
          aria-label={seccion.titulo ?? 'Video'}
        />
        {!puede ? (
          <button type="button" className="boton lp-video__ver" onClick={() => setPedido(true)}>Ver el video</button>
        ) : null}
      </div>
    </section>
  );
}
