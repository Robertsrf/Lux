import type { TipoSeccion } from '../../../hooks/useLanding';

/** Cómo se llama cada sección en el panel, y con qué título nace. */
export const TIPOS_LANDING: Record<TipoSeccion, { nombre: string; titulo: string | null; ayuda: string }> = {
  portada: { nombre: 'Portada', titulo: null, ayuda: 'Las diapositivas de arriba: foto, frase, texto corto y un botón.' },
  cintas: { nombre: 'Cinta de ofertas', titulo: null, ayuda: 'La franja que pasa con las ofertas del momento. Se arma sola.' },
  tipos: { nombre: 'Los tipos', titulo: 'Elige por tipo', ayuda: 'Los tipos de joya con foto y «Todas las joyas». Salen de la tienda.' },
  estuche: { nombre: 'Abre tu estuche', titulo: 'Abre tu estuche', ayuda: 'El estuche que se toca y descubre la oferta del día.' },
  combos: { nombre: 'Combos de la semana', titulo: 'Combos de la semana', ayuda: 'Piezas que combinan, con descuento. Se arman en la pestaña Ofertas.' },
  seleccion: { nombre: 'Selección de la casa', titulo: 'Selección de la casa', ayuda: 'Piezas elegidas por la tienda con su descuento.' },
  estantes: { nombre: 'Un estante por tipo', titulo: null, ayuda: 'Cuatro piezas de cada tipo. Salen de la tienda.' },
  escote: { nombre: '¿Qué escote usas?', titulo: '¿Qué escote usas?', ayuda: 'La clienta elige su escote y ve lo que le va.' },
  regalo: { nombre: 'Para regalar', titulo: 'Para regalar', ayuda: 'Conjuntos listos para dar, con código.' },
  casa: { nombre: 'Ofertas de la casa', titulo: 'Ofertas de la casa', ayuda: 'Las ofertas que creas en la pestaña Ofertas, con su banner.' },
  nosotros: { nombre: 'Quiénes somos', titulo: 'Quiénes somos', ayuda: 'Una foto y el texto de la tienda.' },
  buscamos: { nombre: 'Lo que buscamos', titulo: 'Lo que buscamos', ayuda: 'Lo que la marca quiere para la clienta.' },
  materiales: { nombre: 'Materiales', titulo: 'De qué están hechas', ayuda: 'Tres o cuatro tarjetas con foto, icono y lo que significa para la piel.' },
  galeria: { nombre: 'Galería', titulo: 'Así se llevan', ayuda: 'Fotos de ambiente en un carrusel.' },
  video: { nombre: 'Video', titulo: 'De cerca', ayuda: 'Un video corto en bucle, sin sonido, con su póster.' },
  como_pedir: { nombre: 'Cómo pedir', titulo: 'Cómo pedir', ayuda: 'Los pasos para pedir, con las cifras de la base.' },
  proximamente: { nombre: 'Próximamente', titulo: 'Próximamente', ayuda: 'Lo que viene en camino.' },
  redes: { nombre: 'Redes', titulo: 'Síguenos', ayuda: 'Instagram, TikTok, Facebook y WhatsApp, desde Textos.' },
  tienda: { nombre: 'La tienda', titulo: 'La tienda', ayuda: 'Dirección, horario y cómo pagar, desde Textos.' },
};

/** Los que dibujan lo de la base: uno solo de cada uno (landing_tipo_unico). */
export const TIPOS_UNICOS: TipoSeccion[] = [
  'tipos', 'estantes', 'como_pedir', 'proximamente', 'tienda', 'cintas',
  'estuche', 'combos', 'seleccion', 'escote', 'regalo', 'casa',
];

export const TODOS_LOS_TIPOS = Object.keys(TIPOS_LANDING) as TipoSeccion[];

/** Lo que cada tipo pide en su formulario, además del título y el texto. */
export type CamposDeTipo = 'diapositivas-portada' | 'diapositivas-galeria' | 'foto-boton' | 'tarjetas' | 'video' | null;

export function camposDe(tipo: TipoSeccion): CamposDeTipo {
  switch (tipo) {
    case 'portada': return 'diapositivas-portada';
    case 'galeria': return 'diapositivas-galeria';
    case 'nosotros':
    case 'buscamos': return 'foto-boton';
    case 'materiales': return 'tarjetas';
    case 'video': return 'video';
    default: return null;
  }
}
