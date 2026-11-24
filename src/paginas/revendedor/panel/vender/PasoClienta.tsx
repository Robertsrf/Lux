import { useMemo, useState } from 'react';
import { Campo } from '../../../../componentes/Piezas';
import type { ClienteRevendedor } from '../../../../lib/tipos';
import { buscarClientas, clientaConDato, digitosTelefono } from './cuentas';
import type { EstadoVender } from './cuentas';

const nombreDe = (c: ClienteRevendedor) => [c.nombre, c.apellido].filter(Boolean).join(' ');
const corto = (c: ClienteRevendedor) => `${c.nombre}${c.apellido ? ` ${c.apellido.charAt(0)}.` : ''}`;

/**
 * ② Clienta: una de las suyas con un toque, o una nueva con nombre y
 * teléfono. Desde su panel la cédula nunca es obligatoria (#74).
 */
export function PasoClienta({ clientas, estado, elegida, alCambiar }: {
  clientas: ClienteRevendedor[];
  estado: EstadoVender;
  elegida: ClienteRevendedor | null;
  alCambiar: (cambio: Partial<EstadoVender>) => void;
}) {
  const [texto, setTexto] = useState('');
  const [masDatos, setMasDatos] = useState(Boolean(estado.nueva.apellido || estado.nueva.cedula));
  const nueva = estado.nueva;
  const escribir = (campo: keyof EstadoVender['nueva'], valor: string) => alCambiar({ nueva: { ...nueva, [campo]: valor } });

  // Sin buscar: las que compraron más reciente, para el toque rápido.
  const resultados = useMemo(() => {
    if (texto.trim()) return buscarClientas(clientas, texto);
    return [...clientas].sort((a, b) => (b.ultima ?? b.creado_en).localeCompare(a.ultima ?? a.creado_en)).slice(0, 5);
  }, [clientas, texto]);
  const pareceSer = useMemo(
    () => (elegida ? null : clientaConDato(clientas, nueva.cedula, nueva.telefono)),
    [clientas, elegida, nueva.cedula, nueva.telefono],
  );

  const elegir = (c: ClienteRevendedor) => {
    alCambiar({ clientaId: c.id, nueva: { nombre: '', telefono: '', apellido: '', cedula: '' } });
    setTexto('');
  };

  if (elegida) {
    const sinTelefono = digitosTelefono(elegida.telefono).length < 10;
    return (
      <section aria-labelledby="vrv-clienta">
        <h2 id="vrv-clienta" className="vrv-titulo">Para quién</h2>
        <div className="vrv-elegida">
          <div>
            <div className="vrv-elegida__nombre">{nombreDe(elegida)}</div>
            <div className="vrv-elegida__dato">{elegida.telefono || 'Sin teléfono'}{elegida.cedula ? ` · C.I. ${elegida.cedula}` : ''}</div>
          </div>
          <button type="button" className="boton boton--secundario" onClick={() => alCambiar({ clientaId: null })}>Cambiar</button>
        </div>
        {sinTelefono ? (
          <Campo etiqueta="Su teléfono" htmlFor="vrv-tel-elegida" pista="Con el código, por ejemplo 0412 1234567. Es para mandarle su pedido.">
            <input id="vrv-tel-elegida" type="tel" inputMode="tel" autoComplete="off" value={nueva.telefono} onChange={(e) => escribir('telefono', e.target.value)} />
          </Campo>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="vrv-clienta">
      <h2 id="vrv-clienta" className="vrv-titulo">Para quién</h2>
      {clientas.length > 0 ? (
        <>
          <label className="visualmente-oculto" htmlFor="vrv-buscar-clienta">Buscar entre tus clientas</label>
          <input
            id="vrv-buscar-clienta" className="vrv-buscar__campo" type="search" autoComplete="off" value={texto}
            placeholder="Buscar entre tus clientas" onChange={(e) => setTexto(e.target.value)}
          />
          {resultados.length > 0 ? (
            <ul className="vrv-clientas" aria-label={texto.trim() ? 'Clientas que coinciden' : 'Tus últimas clientas'}>
              {resultados.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => elegir(c)}>
                    <span className="vrv-clientas__nombre">{nombreDe(c)}</span>
                    <span className="vrv-clientas__dato">{c.telefono || 'Sin teléfono'}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="campo__pista">Ninguna con eso. Escríbela abajo como clienta nueva.</p>}
        </>
      ) : null}

      <h3 className="vrv-subtitulo">Clienta nueva</h3>
      <div className="panel">
        <Campo etiqueta="Nombre" htmlFor="vrv-nombre">
          <input id="vrv-nombre" autoComplete="off" autoCapitalize="words" value={nueva.nombre} onChange={(e) => escribir('nombre', e.target.value)} />
        </Campo>
        <Campo etiqueta="Teléfono" htmlFor="vrv-telefono" pista="Con el código, por ejemplo 0412 1234567.">
          <input id="vrv-telefono" type="tel" inputMode="tel" autoComplete="off" value={nueva.telefono} onChange={(e) => escribir('telefono', e.target.value)} />
        </Campo>
        {pareceSer ? (
          <div className="vrv-parece" role="status">
            <span>Es <strong>{corto(pareceSer)}</strong>, una de tus clientas. ¿Es ella?</span>
            <button type="button" className="boton boton--secundario" onClick={() => elegir(pareceSer)}>Sí, es ella</button>
          </div>
        ) : null}
        {masDatos ? (
          <div className="fila">
            <Campo etiqueta="Apellido (opcional)" htmlFor="vrv-apellido">
              <input id="vrv-apellido" autoComplete="off" autoCapitalize="words" value={nueva.apellido} onChange={(e) => escribir('apellido', e.target.value)} />
            </Campo>
            <Campo etiqueta="Cédula (opcional)" htmlFor="vrv-cedula">
              <input id="vrv-cedula" inputMode="numeric" autoComplete="off" value={nueva.cedula} onChange={(e) => escribir('cedula', e.target.value)} />
            </Campo>
          </div>
        ) : (
          <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setMasDatos(true)}>Más datos</button>
        )}
      </div>
    </section>
  );
}
