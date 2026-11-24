// =====================================================================
// Lux by Emory — el logo que sube un revendedor desde su panel (#73)
//
// POR QUÉ ESTO VIVE EN UN SERVIDOR
// El revendedor no tiene sesión de Supabase (y no debe tenerla: ver
// "Los revendedores" en CLAUDE.md), así que no puede escribir en el
// almacén de fotos, que es solo del administrador. Esta función sí, con la
// llave maestra, que el servidor de Supabase pone sola en
// SUPABASE_SERVICE_ROLE_KEY y jamás va en el navegador.
//
// QUÉ HACE, con un POST multipart { sesion, archivo }:
//   1. su testigo → su usuario (`rv_usuario_para_logo`, que solo ejecuta
//      service_role); un testigo vencido o falso, 401;
//   2. el archivo: hasta 300 KB, y WebP, PNG o JPEG por sus primeros bytes
//      (reglas.ts), nunca por lo que diga el navegador;
//   3. lo sube a fotos/revendedores/<usuario>/<milisegundos>.<ext>, sin
//      pisar nada (`upsert: false`);
//   4. guarda la ruta con `rv_poner_logo`, que vuelve a mirar que sea suya.
// Los logos de antes no se borran: pesan poco y son historia.
//
// Se publica con `npx supabase functions deploy logo-revendedor --use-api`,
// o pegándola en el panel de Supabase. Ver INSTALACION.md, 3.2.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CONTENT_TYPE, LOGO_MAX_BYTES, rutaDeLogo, tipoDeImagen } from './reglas.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Solo POST.' }, 405);

  const largo = Number(req.headers.get('content-length') ?? '0');
  if (largo > LOGO_MAX_BYTES + 20_000) return responder({ error: 'Sube el logo en JPG, PNG o WebP, de menos de 300 KB.' }, 413);

  let datos: FormData;
  try { datos = await req.formData(); } catch { return responder({ error: 'No llegó el logo.' }, 400); }
  const sesion = datos.get('sesion');
  const archivo = datos.get('archivo');
  if (typeof sesion !== 'string' || !(archivo instanceof File)) return responder({ error: 'No llegó el logo.' }, 400);
  if (archivo.size === 0 || archivo.size > LOGO_MAX_BYTES) {
    return responder({ error: 'Sube el logo en JPG, PNG o WebP, de menos de 300 KB.' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ¿Quién es? Con un testigo que no sirve, la base lanza 28000.
  const { data: usuario, error: errSesion } = await admin.rpc('rv_usuario_para_logo', { p_sesion: sesion });
  if (errSesion || typeof usuario !== 'string') {
    return responder({ error: 'Tu sesión se cerró. Entra otra vez con tu código.' }, 401);
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoDeImagen(bytes);
  if (!tipo) return responder({ error: 'Sube el logo en JPG, PNG o WebP, de menos de 300 KB.' }, 400);

  let ruta: string;
  try { ruta = rutaDeLogo(usuario, Date.now(), tipo); } catch { return responder({ error: 'No se pudo guardar el logo.' }, 400); }

  const subida = await admin.storage.from('fotos').upload(ruta, bytes, {
    contentType: CONTENT_TYPE[tipo], upsert: false, cacheControl: '31536000',
  });
  if (subida.error) return responder({ error: 'No se pudo guardar el logo. Prueba otra vez.' }, 500);

  const { error: errRuta } = await admin.rpc('rv_poner_logo', { p_sesion: sesion, p_ruta: ruta });
  if (errRuta) {
    // Sin la ruta guardada, el archivo no sirve: se quita.
    await admin.storage.from('fotos').remove([ruta]);
    return responder({ error: 'No se pudo guardar el logo. Prueba otra vez.' }, 500);
  }

  return responder({ ruta });
});
