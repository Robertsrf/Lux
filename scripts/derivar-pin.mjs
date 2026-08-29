/**
 * Imprime la contrasena que hay que ponerle al usuario vendedora@lux.local
 * en Supabase para un PIN dado.
 *
 *   npm run pin -- 1234
 *
 * Tiene que coincidir con contrasenaDesdePin() de src/lib/auth.ts.
 */
const pin = (process.argv[2] || '').trim();

if (!/^\d{4}$/.test(pin)) {
  console.error('Uso: npm run pin -- 1234   (exactamente 4 digitos)');
  process.exit(1);
}

console.log('');
console.log('  Usuario en la app :  vendedora');
console.log('  PIN               :  ' + pin);
console.log('  Correo en Supabase:  vendedora@lux.local');
console.log('  Contrasena en Supabase:  lux.' + pin + '.emory');
console.log('');
console.log('  Ponla en Authentication > Users > Add user, con "Auto confirm" activado.');
console.log('');
