import { enlaceFacebook, enlaceInstagram, enlaceTikTok, enlaceWhatsAppA } from '../../../lib/enlaces';
import type { useTextos } from '../../../hooks/useTextos';
import type { SeccionLanding } from '../../../hooks/useLanding';
import { Titulo } from './Titulo';

/**
 * "Síguenos": un botón por red, de `textos` (Instagram, TikTok, Facebook) y
 * el WhatsApp de la tienda. Un dato que no se entiende no da botón, nunca un
 * enlace a otra parte; sin ninguno, no sale la sección.
 */
export function Redes({ seccion, textos }: { seccion: SeccionLanding; textos: ReturnType<typeof useTextos> }) {
  const instagram = enlaceInstagram(textos.instagram_tienda);
  const tiktok = enlaceTikTok(textos.tiktok_tienda);
  const facebook = enlaceFacebook(textos.facebook_tienda);
  const whatsapp = enlaceWhatsAppA(textos.whatsapp_tienda, 'Hola, vengo del catálogo de Lux by Emory.');

  const redes = [
    instagram ? { nombre: 'Instagram', url: instagram.url, dato: `@${instagram.usuario}` } : null,
    tiktok ? { nombre: 'TikTok', url: tiktok.url, dato: `@${tiktok.usuario}` } : null,
    facebook ? { nombre: 'Facebook', url: facebook.url, dato: facebook.nombre } : null,
    whatsapp ? { nombre: 'WhatsApp', url: whatsapp, dato: 'Escríbenos' } : null,
  ].filter((r): r is { nombre: string; url: string; dato: string } => r !== null);

  if (redes.length === 0) return null;
  return (
    <section className="lp-redes" aria-labelledby={`t-${seccion.id}`}>
      {seccion.titulo ? <Titulo id={`t-${seccion.id}`} texto={seccion.texto}>{seccion.titulo}</Titulo> : null}
      <ul className="lp-redes__lista">
        {redes.map((r) => (
          <li key={r.nombre}>
            <a className="lp-red" href={r.url} target="_blank" rel="noopener noreferrer">
              <span className="lp-red__nombre">{r.nombre}</span>
              <span className="lp-red__dato">{r.dato}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
