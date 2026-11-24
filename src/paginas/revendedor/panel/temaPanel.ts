import { useEffect } from 'react';
import {
  FAMILIA_TEXTO, FAMILIA_TITULOS, contraste, extremoSobre, legibleSobre, mezclar, normalizarTema, temaResuelto,
  variablesCss,
} from '../catalogo/tema.ts';
import type { Esquinas, TemaResuelto } from '../catalogo/tema.ts';
import { cargarLetras } from '../catalogo/letras.ts';
import type { PaletaRevendedor } from '../../../lib/tipos.ts';

/*
  EL PANEL DEL REVENDEDOR, VESTIDO CON SU TEMA (fase 7)

  El panel usa los componentes de la tienda (Armazón, Aviso, Campo, las
  tablas), que se pintan con los tokens de tokens.css. Aquí esos tokens se
  derivan de los colores de su catálogo (`tema.ts`) y se ponen en <html>:
  así cambian de ropa sin reescribirse.

  Lo que en Lux es el verde (la barra lateral, el botón principal, a veces
  letra sobre el fondo) aquí es el "ancla": su color principal llevado
  hasta que se lea como letra sobre el fondo Y aguante encima la crema al
  62 %, el texto más suave de la barra. La crema es el claro (o el oscuro,
  en un fondo oscuro) del lado contrario al texto. Cada texto se vuelve a
  medir contra TODOS los fondos claros donde puede caer: fondo, superficie,
  panel, panel hondo, crema y verde suave. Lo prueba
  scripts/pruebas/tema-panel.test.mjs, con temas feos incluidos.
*/

const NEGRO = '#000000';
const BLANCO = '#FFFFFF';
const MINIMO = 4.5;
/** El texto más suave que la tienda escribe sobre el ancla: crema al 62 %. */
const CREMA_MAS_SUAVE = 0.62;

const RADIOS: Record<Esquinas, [string, string, string, string]> = {
  rectas: ['0', '0', '0', '0'],
  suaves: ['6px', '12px', '16px', '22px'],
  redondas: ['10px', '18px', '24px', '30px'],
};

/** El ancla: `color` llevado hacia `destino` hasta que la crema (entera y al 62 %) se lea encima. */
function anclaPara(color: string, crema: string, destino: string, ...fondos: string[]): string {
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const a = mezclar(color, destino, Math.min(t, 1));
    const suave = mezclar(crema, a, 1 - CREMA_MAS_SUAVE);
    if (contraste(crema, a) >= MINIMO && contraste(suave, a) >= MINIMO && fondos.every((f) => contraste(a, f) >= MINIMO)) {
      return a;
    }
  }
  return destino;
}

/** Los tokens de Lux que usa el panel, derivados de su tema. */
export function tokensDelPanel(t: TemaResuelto): Record<string, string> {
  const c = t.colores;
  // Del lado del texto (oscuro en un fondo claro) y del lado contrario.
  const ladoTexto = extremoSobre(c.fondo);
  const ladoClaro = ladoTexto === NEGRO ? BLANCO : NEGRO;

  const papel = c.fondo;
  const blanco = c.superficie;
  const panel = mezclar(papel, blanco, 0.5);
  const panelHondo = mezclar(papel, c.texto, 0.05);
  const crema = mezclar(blanco, ladoClaro, 0.5);
  const verdeSuave = mezclar(blanco, c.acento, 0.07);
  const claros = [papel, blanco, panel, panelHondo, crema, verdeSuave] as const;
  const [f0, ...fs] = claros;

  const texto = legibleSobre(c.texto, f0, ...fs);
  const suave = legibleSobre(c.textoSuave, f0, ...fs);
  const acento = legibleSobre(c.acento, f0, ...fs);
  const ancla = anclaPara(acento, crema, ladoTexto, papel, blanco);
  const oro = legibleSobre(mezclar(c.boton, crema, 0.4), ancla, texto);
  const alerta = legibleSobre('#A8763E', f0, ...fs);

  return {
    ...variablesCss(t),
    '--papel': papel,
    '--blanco': blanco,
    '--superficie': blanco,
    '--panel': panel,
    '--panel-hondo': panelHondo,
    '--verde-suave': verdeSuave,
    '--linea': c.linea,
    '--linea-suave': mezclar(c.linea, blanco, 0.5),
    '--crema': crema,
    '--verde-profundo': ancla,
    '--oro-arena': oro,
    '--tinta': texto,
    '--salvia': mezclar(suave, blanco, 0.2),
    '--salvia-texto': suave,
    '--oro-texto': acento,
    '--alerta': alerta,
    '--alerta-texto': alerta,
    '--error': legibleSobre(c.error, f0, ...fs),
    '--exito': legibleSobre(c.exito, f0, ...fs),
    '--texto': texto,
    '--texto-fuerte': texto,
    '--texto-secundario': suave,
    '--texto-sobre-verde': crema,
    '--radio-xs': RADIOS[t.esquinas][0],
    '--radio': RADIOS[t.esquinas][1],
    '--radio-md': RADIOS[t.esquinas][2],
    '--radio-lg': RADIOS[t.esquinas][3],
    '--fuente-display': FAMILIA_TITULOS[t.letra],
    '--fuente-ui': FAMILIA_TEXTO[t.plantilla],
    '--fuente-prosa': FAMILIA_TEXTO[t.plantilla],
  };
}

/**
 * Viste <html> con su tema mientras el panel esté abierto, y lo quita al
 * salir (como `useTemaRv`, que vestía con su paleta). Carga sus letras.
 */
export function useTemaPanel(tema: unknown, paleta: PaletaRevendedor | null | undefined): void {
  // La clave: el mismo tema no vuelve a pintar en cada recarga del resumen.
  const clave = JSON.stringify(normalizarTema(tema));
  useEffect(() => {
    const resuelto = temaResuelto(normalizarTema(JSON.parse(clave)), paleta);
    const tokens = tokensDelPanel(resuelto);
    const raiz = document.documentElement;
    for (const [k, v] of Object.entries(tokens)) raiz.style.setProperty(k, v);
    raiz.classList.add('rv-panel');
    void cargarLetras(resuelto);
    return () => {
      for (const k of Object.keys(tokens)) raiz.style.removeProperty(k);
      raiz.classList.remove('rv-panel');
    };
  }, [clave, paleta]);
}
