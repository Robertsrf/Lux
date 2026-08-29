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

export const OBJETIVO_GRANDE = 200 * 1024; // 200 KB
export const OBJETIVO_THUMB = 30 * 1024;   // 30 KB
export const LIMITE_DURO = 400 * 1024;     // por encima de esto, se rechaza

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
 * Redimensiona a 1200 px el lado mayor y genera ademas un thumb de 300 px.
 * La cuadricula de venta carga siempre el thumb: el telefono es de gama baja
 * y la tienda tiene internet lento.
 */
export async function procesarFoto(archivo: File): Promise<FotoProcesada> {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('Ese archivo no es una imagen. Sube una foto en JPG, PNG o WebP.');
  }

  const comunes = { fileType: 'image/webp', initialQuality: 0.8, useWebWorker: true } as const;

  const grande = await imageCompression(archivo, {
    ...comunes,
    maxWidthOrHeight: 1200,
    maxSizeMB: OBJETIVO_GRANDE / (1024 * 1024),
  });

  const thumb = await imageCompression(archivo, {
    ...comunes,
    maxWidthOrHeight: 300,
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
