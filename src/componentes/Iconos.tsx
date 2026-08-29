/**
 * Iconos de linea, trazo 1,5 y color heredado. Nunca emojis: un emoji se
 * dibuja distinto en cada telefono y aqui la interfaz tiene que verse
 * igual en el Android de la tienda que en la laptop del dueno.
 *
 * Son decorativos: siempre acompanan a un texto, asi que van con
 * aria-hidden y no se anuncian dos veces.
 */

export type NombreIcono =
  | 'inventario' | 'reportes' | 'lotes' | 'grupos' | 'kits' | 'tramos'
  | 'tasas' | 'catalogo' | 'mostrador' | 'mayor' | 'dia' | 'cierre'
  | 'conteo' | 'pedidos' | 'verificacion' | 'salir';

const TRAZOS: Record<NombreIcono, string> = {
  inventario: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z M3.5 7.5 12 12l8.5-4.5 M12 12v9',
  reportes:   'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  lotes:      'M2 8h11v9H2z M13 11h4.5L21 14.5V17h-8 M6.5 20a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z M17 20a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z',
  grupos:     'M3 11V4h7l10 10-7 7L3 11Z M7.5 7.5h.01',
  kits:       'M12 3 3 8l9 5 9-5-9-5Z M3 13l9 5 9-5 M3 17.5l9 5 9-5',
  tramos:     'M18 6 6 18 M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  tasas:      'M3 8h13l-3-3 M21 16H8l3 3',
  catalogo:   'M4 4h9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4V4Z M20 4h-4v13.5h1.5A2.5 2.5 0 0 1 20 20V4Z',
  mostrador:  'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  mayor:      'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6Z M3 6h18 M16 10a4 4 0 0 1-8 0',
  dia:        'M22 7l-8.5 8.5-5-5L2 17 M16 7h6v6',
  cierre:     'M9 3h6v3H9z M15 4.5h2.5A1.5 1.5 0 0 1 19 6v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V6a1.5 1.5 0 0 1 1.5-1.5H9 M9 13.5l2 2 4-4',
  conteo:     'M3 6.5 4.5 8 7.5 5 M3 12.5 4.5 14l3-3 M3 18.5 4.5 20l3-3 M11 6.5h10 M11 12.5h10 M11 18.5h10',
  pedidos:    'M21 12h-5l-2 3h-4l-2-3H3 M5.5 5h13l2.5 7v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-6l2.5-7Z',
  verificacion: 'M12 21s7-3.5 7-9V5.5L12 3 5 5.5V12c0 5.5 7 9 7 9Z M9 12l2 2 4-4',
  salir:      'M15 17l5-5-5-5 M20 12H9 M9 3H5.5A1.5 1.5 0 0 0 4 4.5v15A1.5 1.5 0 0 0 5.5 21H9',
};

export function Icono({ nombre, className = 'icono' }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRAZOS[nombre].split(' M').map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  );
}
