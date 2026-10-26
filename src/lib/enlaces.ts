/**
 * Los enlaces que salen del catálogo hacia la tienda: su WhatsApp, su mapa,
 * su Instagram, y el aviso de un pedido.
 *
 * POR QUÉ ESTRICTOS
 * Los datos los escribe una persona en Textos ("0414-123 45 67", un enlace
 * de Maps copiado del teléfono), y un enlace mal armado no da error: con un
 * número corto WhatsApp abre el selector de contactos y la clienta le manda
 * su pedido a quien toque; con una URL cualquiera, "Cómo llegar" lleva a
 * otra página. Aquí, lo que no se entiende no sale: sin número válido no hay
 * botón (revisión de seguridad del 24/10/2026).
 *
 * `enlaceWhatsApp` de lib/revendedor.ts sigue como estaba (abre el selector
 * si no hay número): lo usan pantallas de la tienda donde eso es lo que se
 * quiere, como mandar un catálogo a quien sea.
 */

/** "0414 123 45 67" o "+58 414..." → "584141234567". Null si no es un número venezolano completo. */
export function numeroWhatsApp(texto: string | null | undefined): string | null {
  let digitos = (texto ?? '').replace(/\D/g, '');
  if (digitos.startsWith('0')) digitos = `58${digitos.slice(1)}`;
  else if (digitos.length === 10) digitos = `58${digitos}`;
  return /^58\d{10}$/.test(digitos) ? digitos : null;
}

/** Sin caracteres de control: el texto viaja en la URL. Los saltos de línea se quedan. */
function sinControl(texto: string): string {
  return [...texto].filter((c) => c === '\n' || c.charCodeAt(0) >= 32).join('').trim();
}

/** Un chat de WhatsApp con el texto ya escrito. Null sin un número válido. */
export function enlaceWhatsAppA(numero: string | null | undefined, texto: string): string | null {
  const para = numeroWhatsApp(numero);
  return para ? `https://wa.me/${para}?text=${encodeURIComponent(sinControl(texto))}` : null;
}

/** Solo un enlace de Google Maps, con https: nada que lleve a otra parte. */
function mapaDeGoogle(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim();
  if (!t) return null;
  try {
    const url = new URL(t);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const corto = host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'));
    const largo = (/^(www\.)?google\.[a-z.]{2,6}$/.test(host) && url.pathname.startsWith('/maps')) || host === 'maps.google.com';
    return corto || largo ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * "Cómo llegar": el enlace que el dueño copió de Maps, o si no hay, una
 * búsqueda de la dirección. Un enlace y no un mapa incrustado: el mapa pesa
 * cientos de KB en un teléfono de gama baja, le da a Google la visita de cada
 * clienta y la política de seguridad del sitio lo bloquea.
 */
export function enlaceMapa(mapa: string | null | undefined, direccion: string | null | undefined, ciudad?: string | null): string | null {
  const propio = mapaDeGoogle(mapa);
  if (propio) return propio;
  // Sin dirección no hay a dónde llegar: la ciudad sola llevaría a la plaza
  // del pueblo, no a la tienda.
  if (!direccion?.trim()) return null;
  const lugar = [direccion, ciudad].map((x) => x?.trim()).filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`;
}

/** "@luxbyemory", "luxbyemory" o su enlace → el perfil. Null si no es un usuario de Instagram. */
export function enlaceInstagram(texto: string | null | undefined): { usuario: string; url: string } | null {
  let usuario = (texto ?? '').trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(usuario)) {
    try {
      const url = new URL(usuario);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
      usuario = url.pathname.split('/').filter(Boolean)[0] ?? '';
    } catch {
      return null;
    }
  }
  return /^[A-Za-z0-9._]{1,30}$/.test(usuario) ? { usuario, url: `https://www.instagram.com/${usuario}/` } : null;
}

/**
 * "LX-3F9A2C": la referencia corta de un pedido, sacada de su enlace. La
 * clienta la ve en su pedido y en el mensaje; la tienda la ve en Pedidos.
 */
export function referenciaPedido(token: string): string {
  return `LX-${token.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export interface AvisoDePedido {
  referencia: string;
  /** Como lo da la base: si la clienta ya estaba en el maestro, enmascarado ("María G."). */
  nombre: string | null;
  lineas: { nombre: string; cantidad: number }[];
  /** Ya con su moneda: "Bs 1.234,56" y "$12,00 BCV". */
  totalBs: string;
  totalBcv: string;
  entrega: string;
  enlace: string;
}

/** Cuántas piezas se nombran; las demás van en "y N más". Un pedido admite 300 líneas. */
const LINEAS_EN_AVISO = 10;

/**
 * El mensaje que la clienta le manda a la tienda al apartar. Es un aviso: lo
 * puede cambiar antes de enviarlo, y por eso lleva el enlace del pedido. La
 * tienda se fía del sistema, nunca de la cifra del mensaje. Sin cédula,
 * teléfono ni dirección: ya están en el sistema y el texto pasa por la URL.
 */
export function mensajeDePedido(p: AvisoDePedido): string {
  const nombradas = p.lineas.slice(0, LINEAS_EN_AVISO).map((l) => `• ${l.cantidad} × ${l.nombre}`);
  const resto = p.lineas.slice(LINEAS_EN_AVISO).reduce((n, l) => n + l.cantidad, 0);
  return [
    // Sin "en el catálogo": el mismo enlace lo recibe una clienta que apartó
    // en el mostrador, y `ver_reserva` no dice de dónde vino el pedido.
    `Hola, este es mi pedido ${p.referencia}`,
    p.nombre ? `A nombre de ${p.nombre}` : null,
    ...nombradas,
    resto > 0 ? `• y ${resto} ${resto === 1 ? 'pieza' : 'piezas'} más` : null,
    `Total: ${p.totalBs} · ${p.totalBcv}`,
    `Entrega: ${p.entrega}`,
    `Mi pedido: ${p.enlace}`,
  ].filter((x): x is string => x !== null).join('\n');
}
