import { useState } from 'react';
import { Campo } from './Piezas';
import { formatearFecha } from '../lib/dinero';
import { useBuscarClientes } from '../hooks/useClientes';
import type { ClienteDeVenta, ClienteResumen } from '../lib/tipos';

interface Props {
  /** Lo que se va a mandar al cobrar: una ficha del maestro o una nueva. */
  valor: ClienteDeVenta | null;
  /** El nombre que se enseña cuando ya hay alguien elegida. */
  etiqueta: string | null;
  alElegir: (cliente: ClienteDeVenta | null, etiqueta: string | null) => void;
  /** Se toco "sin registrar": la venta va sin clienta, a proposito. */
  sinCliente: boolean;
  alSaltar: (saltar: boolean) => void;
}

/**
 * Quien se lleva las piezas, dicho en el momento del cobro.
 *
 * NO ES OBLIGATORIO, PERO TAMPOCO ES EL CAMINO FACIL. Obligarlo trabaria la
 * venta cuando alguien no quiere dar su cedula, y una venta trabada es una
 * venta perdida. Pero si saltarlo fuera lo que pasa al no hacer nada, el
 * maestro se quedaria vacio y con el la garantia y el servicio. Asi que
 * saltarlo es un toque deliberado, y el boton de registrar espera a que
 * ella decida una de las dos cosas.
 *
 * Primero se busca y despues se crea, en ese orden y no al reves: es lo
 * unico que evita dos fichas de la misma persona.
 */
export function BuscadorCliente({ valor, etiqueta, alElegir, sinCliente, alSaltar }: Props) {
  const { texto, setTexto, resultados, cargando } = useBuscarClientes(6, true);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');

  function elegir(c: ClienteResumen) {
    alElegir({ id: c.id }, c.nombre_completo);
    setTexto('');
    setCreando(false);
  }

  function abrirNueva() {
    // Lo que ya escribio no se pierde: si son digitos es una cedula, y si
    // no, es un nombre. Volver a escribirlo con la clienta delante es el
    // tipo de friccion que hace que esto no se use.
    const t = texto.trim();
    // Una cedula lleva digitos; "Eve" es un nombre aunque sus tres letras
    // esten en V y E.
    const esCedula = /[0-9]/.test(t) && /^[0-9.\-\s vVeE]+$/.test(t);
    if (esCedula) { setCedula(t); setNombre(''); }
    else { setNombre(t); setCedula(''); }
    setCreando(true);
  }

  function confirmarNueva(nuevoNombre: string) {
    const limpio = nuevoNombre.trim();
    if (!limpio) return;
    alElegir(
      {
        nombre: limpio,
        apellido: apellido.trim() || null,
        cedula: cedula.trim() || null,
        telefono: telefono.trim() || null,
      },
      [limpio, apellido.trim()].filter(Boolean).join(' '),
    );
  }

  function soltar() {
    alElegir(null, null);
    setCreando(false);
    setNombre(''); setApellido(''); setCedula(''); setTelefono('');
  }

  /* ------------------------------------------------- ya hay alguien */

  if (valor) {
    return (
      <div className="cliente-elegida">
        <div>
          <span className="panel__titulo">Se lo lleva</span>
          <div className="cliente-elegida__nombre">{etiqueta}</div>
          {valor.id ? null : <div className="campo__pista">Ficha nueva: se crea al registrar la venta.</div>}
        </div>
        <button type="button" className="boton boton--secundario boton--pequeno" onClick={soltar}>
          Cambiar
        </button>
      </div>
    );
  }

  /* ------------------------------------------------------ ficha nueva */

  if (creando) {
    return (
      <div className="cliente-nueva">
        <Campo etiqueta="Nombre" htmlFor="cli-nombre">
          <input id="cli-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </Campo>
        <Campo etiqueta="Apellido" htmlFor="cli-apellido">
          <input id="cli-apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} autoComplete="off" />
        </Campo>
        <Campo etiqueta="Cédula" htmlFor="cli-cedula" pista="Si la da. Es lo que evita dos fichas de la misma persona.">
          <input id="cli-cedula" inputMode="numeric" value={cedula} onChange={(e) => setCedula(e.target.value)} autoComplete="off" />
        </Campo>
        <Campo etiqueta="Teléfono" htmlFor="cli-telefono">
          <input id="cli-telefono" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" />
        </Campo>
        <div className="grupo-botones">
          <button type="button" className="boton" disabled={!nombre.trim()} onClick={() => confirmarNueva(nombre)}>
            Usar esta ficha
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => setCreando(false)}>
            Volver a buscar
          </button>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------- buscar */

  return (
    <div className="cliente-buscador">
      <Campo etiqueta="Cédula o nombre" htmlFor="cli-buscar">
        <input
          id="cli-buscar"
          type="search"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); alSaltar(false); }}
          placeholder="12345678 o María"
          autoComplete="off"
        />
      </Campo>

      {texto.trim() ? (
        <div className="cliente-resultados">
          {resultados.map((c) => (
            <button type="button" className="cliente-resultado" key={c.id} onClick={() => elegir(c)}>
              <span className="cliente-resultado__nombre">{c.nombre_completo}</span>
              <span className="cliente-resultado__dato">
                {c.cedula ? `C.I. ${c.cedula}` : 'Sin cédula'}
                {c.compras > 0
                  ? ` · ${c.compras} compra${c.compras === 1 ? '' : 's'} · última el ${formatearFecha(c.ultima_compra)}`
                  : ' · todavía sin compras'}
              </span>
            </button>
          ))}

          {!cargando && resultados.length === 0 ? (
            <p className="campo__pista">Ninguna clienta con eso. Puedes registrarla ahora.</p>
          ) : null}

          <button type="button" className="boton boton--secundario" onClick={abrirNueva}>
            Registrar clienta nueva
          </button>
        </div>
      ) : (
        <div className="grupo-botones">
          <button type="button" className="boton boton--secundario" onClick={abrirNueva}>
            Registrar clienta nueva
          </button>
          <button
            type="button"
            className="boton boton--secundario"
            aria-pressed={sinCliente}
            onClick={() => alSaltar(!sinCliente)}
          >
            {sinCliente ? 'Va sin clienta' : 'Cobrar sin registrarla'}
          </button>
        </div>
      )}
    </div>
  );
}
