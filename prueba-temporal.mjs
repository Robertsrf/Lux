import { createClient } from '@supabase/supabase-js';
const URL = 'https://ajtzbffqkngnsuxgcmsp.supabase.co';
const v = createClient(URL, process.env.ANON, { auth: { persistSession: false } });
await v.auth.signInWithPassword({ email: 'vendedora@lux.local', password: 'lux.9173.emory' });

// 8 anillos de $4,50 = $36 y 8 piezas: cumple los dos minimos (6 piezas o $30).
const r = await v.rpc('registrar_venta', {
  p_tipo: 'mayor', p_metodo: 'efectivo_usd',
  p_items: [{ modelo_id: 3, ubicacion_id: 5, cantidad: 8 }],
});
console.log('Mayoreo VALIDO de 8 piezas por $36:');
console.log(r.error ? '  RECHAZADO -> ' + r.error.message : '  aceptado, venta ' + r.data);
