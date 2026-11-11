/**
 * Prepara las fotos de ambiente de la landing para la web.
 *
 *   node scripts/preparar-landing.mjs <carpeta-origen>
 *
 * La carpeta trae cada foto ya con su nombre final (portada-1.jpg,
 * galeria-3.png...) y, si hace falta recortar, un recortes.json:
 *
 *   { "portada-1": { "relacion": "3:2", "x": 0.66, "y": 0.5 } }
 *
 * `relacion` es ancho:alto del recorte; `x` e `y` (0 a 1, por omision 0,5)
 * son el centro de lo que se quiere conservar. Sin entrada, la foto no se
 * recorta.
 *
 * Escribe en public/landing/ dos WebP por foto, calidad 78 y sin metadatos
 * (el EXIF, con su GPS, se queda fuera): <nombre>.webp a 1600 px de ancho
 * y <nombre>-800.webp a 800 px. Nunca agranda una foto mas chica. La
 * pagina usa la primera como `src` y la segunda en el `srcset`.
 *
 * Una foto que el dueno sube desde el panel va al bucket y no pasa por
 * aqui: solo las de la carpeta public/landing/ tienen version de 800.
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const origen = process.argv[2];
if (!origen || !fs.existsSync(origen)) {
  console.error('Uso: node scripts/preparar-landing.mjs <carpeta-origen>');
  process.exit(1);
}

const DESTINO = 'public/landing';
const CALIDAD = 78;
const MAX_800 = 120 * 1024;
const MAX_1600 = 300 * 1024;
fs.mkdirSync(DESTINO, { recursive: true });

const rutaRecortes = path.join(origen, 'recortes.json');
const recortes = fs.existsSync(rutaRecortes)
  ? JSON.parse(fs.readFileSync(rutaRecortes, 'utf8'))
  : {};

const limitar = (n, min, max) => Math.min(max, Math.max(min, n));
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
let fallos = 0;

const fotos = fs.readdirSync(origen).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
for (const archivo of fotos) {
  const nombre = path.parse(archivo).name;
  const entrada = path.join(origen, archivo);
  let img = sharp(entrada).rotate(); // respeta la orientacion antes de quitar el EXIF
  const meta = await sharp(entrada).rotate().toBuffer().then((b) => sharp(b).metadata());
  let ancho = meta.width;
  let alto = meta.height;

  const r = recortes[nombre];
  if (r) {
    const [rw, rh] = r.relacion.split(':').map(Number);
    const razon = rw / rh;
    let cw = Math.min(ancho, Math.round(alto * razon));
    let ch = Math.round(cw / razon);
    if (ch > alto) { ch = alto; cw = Math.round(ch * razon); }
    const left = limitar(Math.round((r.x ?? 0.5) * ancho - cw / 2), 0, ancho - cw);
    const top = limitar(Math.round((r.y ?? 0.5) * alto - ch / 2), 0, alto - ch);
    const buf = await img.extract({ left, top, width: cw, height: ch }).toBuffer();
    img = sharp(buf);
    ancho = cw;
    alto = ch;
  } else {
    img = sharp(await img.toBuffer());
  }

  for (const [sufijo, px, tope] of [['', 1600, MAX_1600], ['-800', 800, MAX_800]]) {
    const salida = path.join(DESTINO, `${nombre}${sufijo}.webp`);
    await img
      .clone()
      .resize({ width: px, withoutEnlargement: true })
      .webp({ quality: CALIDAD })
      .toFile(salida);
    const peso = fs.statSync(salida).size;
    const marca = peso > tope ? '  <-- PASA DEL TOPE' : '';
    if (peso > tope) fallos += 1;
    console.log(`${salida}  ${Math.min(px, ancho)}x${Math.round((alto * Math.min(px, ancho)) / ancho)}  ${kb(peso)}${marca}`);
  }
}

if (fallos) {
  console.error(`${fallos} archivo(s) pasan del tope: baja la calidad o recorta mas.`);
  process.exit(2);
}
