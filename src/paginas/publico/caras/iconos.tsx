/** Los iconos de lo público (fase 10): trazo fino, del color del texto. Decorativos: el botón lleva su nombre. */
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const IcoLupa = () => <svg {...base}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
export const IcoBolsa = () => <svg {...base}><path d="M5 8h14l-1 12H6z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>;
export const IcoWhatsapp = () => <svg {...base}><path d="M4 20l1.4-4.2A8 8 0 1 1 8.3 18.7z" /><path d="M9.5 9.5c.3 1.6 1.4 3 3 3.8l1-1 1.8.8-.4 1.4c-2.9.2-5.9-2.8-5.7-5.7l1.4-.4.8 1.8z" /></svg>;
export const IcoVolver = () => <svg {...base}><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>;
export const IcoCompartir = () => <svg {...base}><path d="M12 15V4" /><path d="M8 8l4-4 4 4" /><path d="M6 12v7h12v-7" /></svg>;
export const IcoMas = () => <svg {...base}><path d="M12 6v12M6 12h12" /></svg>;
export const IcoMenos = () => <svg {...base}><path d="M6 12h12" /></svg>;
export const IcoCerrar = () => <svg {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>;
