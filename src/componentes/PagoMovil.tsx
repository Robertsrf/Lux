import { useEffect, useRef, useState } from 'react';

/**
 * Copiar al portapapeles. Si el navegador no deja (un telefono viejo, o el
 * navegador que abre WhatsApp o Instagram por dentro), se intenta por el
 * camino viejo, que todavia funciona en casi todos.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copiado = false;
    try { copiado = document.execCommand('copy'); } catch { copiado = false; }
    area.remove();
    return copiado;
  }
}

const soloDigitos = (texto: string) => texto.replace(/\D/g, '');

interface DatoPago {
  clave: string;
  etiqueta: string;
  valor: string;
  /** Lo que se copia: lo que acepta la aplicacion del banco. */
  copia: string;
  /** Lo que oye quien usa lector de pantalla al copiar. */
  anuncio: string;
}

/**
 * A donde se paga: cedula, telefono y banco, cada uno con su boton de
 * copiar. Se pegan en la aplicacion del banco sin equivocarse de un digito,
 * que es donde se pierde un pago movil.
 *
 * Vivia en la pagina del pedido (Reserva.tsx). Salio cuando el revendedor
 * empezo a cobrar por su propio pago movil: su clienta copia los datos de
 * EL con el mismo panel, y el copia los de Lux para pagarle.
 *
 * Se copian limpios: la cedula y el telefono solo con sus digitos (aunque
 * alguien los escriba con puntos o guiones), y del banco solo el codigo,
 * que es lo que se busca en la lista de bancos de cada aplicacion.
 */
export function PagoMovil({ titulo = 'Pago móvil Lux', cedula, telefono, banco, otros = '' }: {
  /** "Pago móvil Lux", o "Pago móvil de María" en el catálogo de un revendedor. */
  titulo?: string;
  cedula: string;
  telefono: string;
  banco: string;
  /** El texto libre de antes (una cuenta para transferir, una nota). */
  otros?: string;
}) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const reloj = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(reloj.current), []);

  const datos: DatoPago[] = [
    { clave: 'cedula', etiqueta: 'Cédula', valor: cedula.trim(), copia: soloDigitos(cedula) || cedula.trim(), anuncio: 'Cédula copiada' },
    { clave: 'telefono', etiqueta: 'Teléfono', valor: telefono.trim(), copia: soloDigitos(telefono) || telefono.trim(), anuncio: 'Teléfono copiado' },
    { clave: 'banco', etiqueta: 'Banco', valor: banco.trim(), copia: banco.match(/\d{4}/)?.[0] ?? banco.trim(), anuncio: 'Código del banco copiado' },
  ].filter((d) => d.valor);

  // Los tres juntos, para mandarselos a quien va a pagar por ella.
  const todos = [titulo, ...datos.map((d) => `${d.etiqueta}: ${d.valor}`)].join('\n');

  async function copiar(clave: string, texto: string) {
    const listo = await copiarTexto(texto);
    setFallo(!listo);
    if (!listo) { setCopiado(null); return; }
    setCopiado(clave);
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setCopiado(null), 2500);
  }

  const anuncio = copiado === 'todos'
    ? 'Los datos del pago móvil, copiados'
    : datos.find((d) => d.clave === copiado)?.anuncio ?? '';

  return (
    <section className="panel pago-movil">
      <span className="panel__titulo">{titulo}</span>
      <dl className="pago-movil__datos">
        {datos.map((d) => (
          <div className="pago-movil__fila" key={d.clave}>
            <div>
              <dt className="dato__etiqueta">{d.etiqueta}</dt>
              <dd className="dato__valor">{d.valor}</dd>
            </div>
            <button
              type="button"
              className="boton boton--secundario pago-movil__copiar"
              data-copiado={copiado === d.clave ? '' : undefined}
              onClick={() => void copiar(d.clave, d.copia)}
            >
              {copiado === d.clave ? 'Copiado' : 'Copiar'}
              <span className="visualmente-oculto"> {d.etiqueta}</span>
            </button>
          </div>
        ))}
      </dl>

      <button
        type="button"
        className="boton boton--secundario boton--pequeno pago-movil__todos"
        data-copiado={copiado === 'todos' ? '' : undefined}
        onClick={() => void copiar('todos', todos)}
      >
        {copiado === 'todos' ? 'Copiados los tres' : 'Copiar los tres juntos'}
      </button>

      {/* El aviso de "copiado" para quien no ve el boton cambiar. */}
      <p className="visualmente-oculto" aria-live="polite">{anuncio}</p>

      {fallo ? (
        <p className="campo__pista">
          Este navegador no dejó copiar. Mantén el dedo sobre el dato para
          seleccionarlo y cópialo a mano.
        </p>
      ) : (
        <p className="campo__pista">Toca Copiar y pégalo en la aplicación de tu banco.</p>
      )}

      {otros.trim() ? (
        <p className="campo__pista" style={{ whiteSpace: 'pre-line' }}>{otros.trim()}</p>
      ) : null}
    </section>
  );
}
