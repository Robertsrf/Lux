// =====================================================================
// Lux by Emory — las cuentas de las vendedoras del local
//
// POR QUÉ ESTO VIVE EN UN SERVIDOR
// Crear una cuenta de Supabase, cambiarle la contraseña o pausarla pide la
// llave maestra (service_role). Esa llave jamás va en el navegador: el
// sitio es estático y cualquiera lee su código. Aquí vive en el servidor
// de Supabase, que la pone sola en SUPABASE_SERVICE_ROLE_KEY.
//
// Antes de hacer nada, comprueba que quien llama es un administrador
// activo. La vendedora, un revendedor o alguien sin sesión reciben un no.
//
// QUÉ HACE, según `accion`:
//   crear      { nombre, pin? }  cuenta nueva, con el número libre más bajo
//   pin        { id, pin? }      PIN nuevo; a la vendedora de antes (sin
//                                número) le da además su número y su cuenta
//   pausar     { id }            no entra más; su historia se queda
//   activar    { id }
//   renombrar  { id, nombre }
//   listar     {}                solo responde: sirve para comprobar el permiso
//
// Solo toca perfiles con rol 'vendedora': nunca un administrador.
//
// EL CÓDIGO DE ENTRADA
// Ocho dígitos: su número (dos) y su PIN (seis). La cuenta es
// vendedoraNN@lux.local y la contraseña `lux.<PIN>.emory`, la MISMA receta
// que contrasenaDesdePin() de src/lib/auth.ts: si cambia una, cambia la
// otra, o ninguna vendedora podrá entrar.
//
// Se publica con `npx supabase functions deploy vendedoras --use-api`, o
// pegándola en el panel de Supabase. Ver INSTALACION.md.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

const contrasenaDesdePin = (pin: string) => `lux.${pin}.emory`;
const correoDe = (numero: number) => `vendedora${String(numero).padStart(2, '0')}@lux.local`;
const codigoDe = (numero: number, pin: string) => `${String(numero).padStart(2, '0')}${pin}`;

/** Un PIN que no se adivina a la primera: ni seis iguales ni una escalera. */
function pinFacil(pin: string): boolean {
  return /^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin);
}

/** Seis dígitos del generador fuerte, sin sesgo de módulo. */
function pinAlAzar(): string {
  const n = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(n);
    if (n[0] >= 4_294_000_000) continue;            // múltiplo exacto de un millón
    const pin = String(n[0] % 1_000_000).padStart(6, '0');
    if (!pinFacil(pin)) return pin;
  }
}

function pinPedido(pin: unknown): string {
  const limpio = String(pin ?? '').replace(/\D/g, '');
  if (limpio === '') return pinAlAzar();
  if (!/^\d{6}$/.test(limpio)) throw new Error('El PIN tiene seis dígitos. Déjalo vacío y se inventa uno.');
  if (pinFacil(limpio)) throw new Error('Ese PIN se adivina fácil. Elige otro, o déjalo vacío y se inventa uno.');
  return limpio;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Solo POST.' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ¿Quién llama? Su sesión va en la cabecera; getUser la valida.
  const testigo = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quien } = await admin.auth.getUser(testigo);
  if (!quien?.user) return responder({ error: 'Hay que iniciar sesión.' }, 401);

  const { data: suPerfil } = await admin.from('perfiles').select('rol, activo').eq('id', quien.user.id).maybeSingle();
  if (!suPerfil || suPerfil.rol !== 'admin' || !suPerfil.activo) {
    return responder({ error: 'Solo un administrador puede manejar las cuentas de las vendedoras.' }, 403);
  }

  let cuerpo: Record<string, unknown>;
  try { cuerpo = await req.json(); } catch { return responder({ error: 'No llegó nada.' }, 400); }

  /** La vendedora sobre la que se actúa. Nunca un administrador. */
  async function vendedora(id: unknown) {
    const { data } = await admin.from('perfiles').select('id, nombre, rol, numero_vendedora').eq('id', String(id ?? '')).maybeSingle();
    if (!data || data.rol !== 'vendedora') throw new Error('Esa vendedora no existe.');
    return data as { id: string; nombre: string; rol: string; numero_vendedora: number | null };
  }

  /** El número libre más bajo, del 1 al 99. */
  async function numeroLibre(): Promise<number> {
    const { data } = await admin.from('perfiles').select('numero_vendedora').not('numero_vendedora', 'is', null);
    const usados = new Set((data ?? []).map((f: { numero_vendedora: number }) => f.numero_vendedora));
    for (let n = 1; n <= 99; n++) if (!usados.has(n)) return n;
    throw new Error('Ya hay 99 vendedoras con número. Pausa o reutiliza alguno.');
  }

  try {
    switch (cuerpo.accion) {
      case 'listar':
        return responder({ ok: true });

      case 'crear': {
        const nombre = String(cuerpo.nombre ?? '').trim();
        if (nombre.length < 2) throw new Error('Falta el nombre.');
        const pin = pinPedido(cuerpo.pin);
        const numero = await numeroLibre();

        const { data: creada, error } = await admin.auth.admin.createUser({
          email: correoDe(numero), password: contrasenaDesdePin(pin), email_confirm: true,
          user_metadata: { nombre },
        });
        if (error || !creada.user) {
          throw new Error(`No se pudo crear la cuenta ${correoDe(numero)}: ${error?.message ?? 'sin detalle'}.`);
        }

        const { error: errPerfil } = await admin.from('perfiles').insert({
          id: creada.user.id, nombre, rol: 'vendedora', activo: true, numero_vendedora: numero,
        });
        if (errPerfil) {
          // Sin perfil la cuenta no sirve: se deshace para no dejar huérfanas.
          await admin.auth.admin.deleteUser(creada.user.id);
          throw new Error(`No se pudo guardar su perfil: ${errPerfil.message}`);
        }
        return responder({ id: creada.user.id, numero, codigo: codigoDe(numero, pin) });
      }

      case 'pin': {
        const v = await vendedora(cuerpo.id);
        const pin = pinPedido(cuerpo.pin);
        // La vendedora de antes entraba con vendedora@lux.local y cuatro
        // dígitos. Se le da su número y su cuenta de ahora.
        const numero = v.numero_vendedora ?? await numeroLibre();
        const { error } = await admin.auth.admin.updateUserById(v.id, {
          email: correoDe(numero), email_confirm: true, password: contrasenaDesdePin(pin),
        });
        if (error) throw new Error(`No se pudo cambiar su PIN: ${error.message}`);
        if (v.numero_vendedora === null) {
          const { error: errNum } = await admin.from('perfiles').update({ numero_vendedora: numero }).eq('id', v.id);
          if (errNum) throw new Error(`Se cambió su PIN pero no su número: ${errNum.message}`);
        }
        return responder({ id: v.id, numero, codigo: codigoDe(numero, pin) });
      }

      case 'pausar':
      case 'activar': {
        const v = await vendedora(cuerpo.id);
        const pausa = cuerpo.accion === 'pausar';
        // El bloqueo va en la cuenta: no vuelve a entrar ni a renovar su
        // sesión. El perfil inactivo frena además cualquier venta que
        // intente con una sesión que todavía no venció.
        const { error } = await admin.auth.admin.updateUserById(v.id, { ban_duration: pausa ? '876000h' : 'none' });
        if (error) throw new Error(error.message);
        const { error: errPerfil } = await admin.from('perfiles').update({ activo: !pausa }).eq('id', v.id);
        if (errPerfil) throw new Error(errPerfil.message);
        return responder({ ok: true });
      }

      case 'renombrar': {
        const v = await vendedora(cuerpo.id);
        const nombre = String(cuerpo.nombre ?? '').trim();
        if (nombre.length < 2) throw new Error('Falta el nombre.');
        const { error } = await admin.from('perfiles').update({ nombre }).eq('id', v.id);
        if (error) throw new Error(error.message);
        return responder({ ok: true });
      }

      default:
        return responder({ error: 'No sé hacer eso.' }, 400);
    }
  } catch (e) {
    return responder({ error: e instanceof Error ? e.message : 'Algo falló.' }, 400);
  }
});
