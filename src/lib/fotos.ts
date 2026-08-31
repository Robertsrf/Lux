import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

/**
 * Fotos: la unica restriccion real del plan gratuito (PLAN 7).
 * 1 GB de Storage. Una foto directa del telefono pesa 3-4 MB, asi que 250
 * fotos llenarian el plan. Comprimidas bien, 250 fotos usan ~40 MB.
 *
 * Se comprime SIEMPRE en el navegador antes de subir. Sin excepcion.
 */

export const BUCKET = 'fotos';

/*
 * Los tamanos de antes -1200 px con tope de 200 KB, thumb de 300 px- se
 * fijaron cuidando el gigabyte del plan gratuito, y se pasaron de frugales:
 * en un telefono de hoy la cuadricula se ve borrosa, porque una tarjeta de
 * 160 px son casi 500 pixeles fisicos y el thumb solo tenia 300.
 *
 * Las cuentas dan de sobra. A 350 piezas, grande y thumb suman unos 200 MB
 * de un gigabyte. El limite nunca fue el problema.
 */
export const OBJETIVO_GRANDE = 500 * 1024; // 500 KB, lado mayor 1800 px
export const OBJETIVO_THUMB = 70 * 1024;   // 70 KB, lado mayor 600 px
export const LIMITE_DURO = 900 * 1024;     // por encima de esto, se rechaza

export interface FotoProcesada {
  grande: File;
  thumb: File;
  pesoOriginal: number;
  pesoGrande: number;
  pesoThumb: number;
}

export function formatearPeso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Redimensiona a 1800 px el lado mayor y genera ademas un thumb de 600 px.
 * La cuadricula no carga siempre el thumb: declara las dos y deja que el
 * navegador elija segun la pantalla. Ver fuenteFoto().
 */
export async function procesarFoto(archivo: File): Promise<FotoProcesada> {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('Ese archivo no es una imagen. Sube una foto en JPG, PNG o WebP.');
  }

  const comunes = { fileType: 'image/webp', initialQuality: 0.8, useWebWorker: true } as const;

  const grande = await imageCompression(archivo, {
    ...comunes,
    maxWidthOrHeight: 1800,
    maxSizeMB: OBJETIVO_GRANDE / (1024 * 1024),
  });

  const thumb = await imageCompression(archivo, {
    ...comunes,
    maxWidthOrHeight: 600,
    maxSizeMB: OBJETIVO_THUMB / (1024 * 1024),
  });

  if (grande.size > LIMITE_DURO) {
    throw new Error(
      `La foto quedo en ${formatearPeso(grande.size)} despues de comprimir y el limite son ` +
      `${formatearPeso(LIMITE_DURO)}. Toma la foto con menos fondo o con menos resolucion.`,
    );
  }

  return {
    grande,
    thumb,
    pesoOriginal: archivo.size,
    pesoGrande: grande.size,
    pesoThumb: thumb.size,
  };
}

export interface RutasFoto {
  foto_path: string;
  foto_thumb_path: string;
}

/** Sube las dos versiones. Solo el admin tiene permiso de escritura al bucket. */
export async function subirFoto(sku: string, foto: FotoProcesada): Promise<RutasFoto> {
  const carpeta = `modelos/${sku.replace(/[^A-Za-z0-9._-]/g, '_')}`;
  const marca = Date.now();
  const rutaGrande = `${carpeta}/${marca}.webp`;
  const rutaThumb = `${carpeta}/${marca}-thumb.webp`;

  const opciones = { contentType: 'image/webp', upsert: false, cacheControl: '31536000' };

  const subidaGrande = await supabase.storage.from(BUCKET).upload(rutaGrande, foto.grande, opciones);
  if (subidaGrande.error) throw subidaGrande.error;

  const subidaThumb = await supabase.storage.from(BUCKET).upload(rutaThumb, foto.thumb, opciones);
  if (subidaThumb.error) throw subidaThumb.error;

  return { foto_path: rutaGrande, foto_thumb_path: rutaThumb };
}

/** El bucket es publico de lectura: las fotos van al catalogo (Fase 3). */
export function urlPublicaFoto(ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}

/**
 * Las dos versiones de una foto, para que el navegador elija.
 *
 * Un telefono de gama media dibuja tres pixeles fisicos por cada pixel CSS:
 * una tarjeta de 160 px necesita casi 500 de verdad. Servirle el thumb de
 * 300 es lo que la hacia verse borrosa. Servirle siempre la grande arreglaba
 * el borron y rompia la conexion de la tienda.
 *
 * Con `srcset` cada quien recibe lo suyo: la pantalla buena pide la grande,
 * la modesta se queda con el thumb, y nadie decide por ellos.
 *
 * OJO CON LOS NUMEROS: se declaran 300w y 1200w, que son los tamanos VIEJOS,
 * no los nuevos. Las fotos ya subidas tienen esos, y no hay como saber por la
 * ruta cual generacion es cada una. Quedarse corto solo hace que el navegador
 * pida la grande antes de tiempo; pasarse la haria verse borrosa otra vez.
 * Cuando todas las fotos esten resubidas, aqui se suben a 600w y 1800w.
 */
export function fuenteFoto(
  path: string | null | undefined,
  thumbPath: string | null | undefined,
  sizes: string,
): { src: string; srcSet?: string; sizes: string } | null {
  const grande = urlPublicaFoto(path ?? null);
  const thumb = urlPublicaFoto(thumbPath ?? null);
  if (!grande && !thumb) return null;

  const partes: string[] = [];
  if (thumb) partes.push(`${thumb} 300w`);
  if (grande) partes.push(`${grande} 1200w`);

  return {
    src: thumb ?? grande!,
    srcSet: partes.length > 1 ? partes.join(', ') : undefined,
    sizes,
  };
}
