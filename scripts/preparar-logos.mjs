/**
 * Optimiza los logotipos originales para la web.
 *
 * Los archivos que entrega la disenadora pesan cientos de KB y miden miles
 * de pixeles. Este sistema lo abre un Android de gama baja con internet de
 * tienda, asi que nada de eso puede llegar al navegador tal cual.
 *
 *   npm run logos
 *
 * Lee de marca-original/ y escribe en src/marca/ (los que importa la app,
 * con hash y base correctos) y en public/marca/ (favicon y vista previa,
 * que index.html referencia por URL fija).
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ORIGEN = 'marca-original';
const A_SRC = 'src/marca';
const A_PUB = 'public/marca';

const VERDE = { r: 0x1f, g: 0x40, b: 0x45, alpha: 1 };

for (const d of [A_SRC, A_PUB]) fs.mkdirSync(d, { recursive: true });

const org = (n) => path.join(ORIGEN, n);
const kb = (f) => `${(fs.statSync(f).size / 1024).toFixed(1)} KB`;

async function wordmark(entrada, salida, ancho) {
  await sharp(org(entrada)).resize({ width: ancho }).webp({ quality: 90 }).toFile(salida);
  console.log(`  ${path.basename(salida).padEnd(28)} ${ancho}px  ${kb(salida)}`);
}

/** La L es vertical; se centra en un cuadrado con aire para usarla de sello. */
async function sello(salida, lado, fondo) {
  const alto = Math.round(lado * 0.62);
  const letra = await sharp(org('L Arena.png')).resize({ height: alto, fit: 'inside' }).toBuffer();
  const base = sharp({ create: { width: lado, height: lado, channels: 4, background: fondo } });
  await base.composite([{ input: letra, gravity: 'center' }]).png().toFile(salida);
  console.log(`  ${path.basename(salida).padEnd(28)} ${lado}px  ${kb(salida)}`);
}

console.log('Wordmark para pantalla:');
await wordmark('Color crema lux.png', `${A_SRC}/wordmark-crema.webp`, 560);
await wordmark('Verde Lux.png',       `${A_SRC}/wordmark-verde.webp`, 560);
await wordmark('Logo Lux principal.png', `${A_SRC}/wordmark-arena.webp`, 560);

console.log('Sello L:');
await sharp(org('L Arena.png')).resize({ height: 192 }).webp({ quality: 92 }).toFile(`${A_SRC}/sello-arena.webp`);
console.log(`  sello-arena.webp             192px  ${kb(`${A_SRC}/sello-arena.webp`)}`);

console.log('Iconos de la pestana y del telefono:');
await sello(`${A_PUB}/icono-180.png`, 180, VERDE);
await sello(`${A_PUB}/icono-512.png`, 512, VERDE);
await sello(`${A_PUB}/favicon-32.png`, 32, VERDE);

console.log('Vista previa al compartir (Open Graph):');
const marca = await sharp(org('Color crema lux.png')).resize({ width: 620 }).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: VERDE } })
  .composite([{ input: marca, gravity: 'center' }])
  .png({ quality: 90 })
  .toFile(`${A_PUB}/og.png`);
console.log(`  og.png                       1200x630  ${kb(`${A_PUB}/og.png`)}`);
