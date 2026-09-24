import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '../lib/supabase';
import { Campo } from './Piezas';

type Estado =
  | 'pendiente'     // todavia no hay una cedula completa
  | 'buscando'
  | 'encontrada'    // es clienta: falta que diga "soy yo"
  | 'confirmada'    // dijo que es ella: no escribe nada mas (salvo lo que falte)
  | 'nueva'         // no esta registrada: escribe todo
  | 'actualizar'    // es clienta pero cambio algo: escribe todo
  | 'sin_conexion'; // la busqueda fallo: escribe todo y sigue

/** Lo que devuelve buscar_cliente_publico: enmascarado a proposito. */
interface Hallada {
  nombre: string;
  inicial: string;
  telefono_final: string | null;
  /** Lo que el maestro no tiene completo y el pedido necesita. */
  faltan: ('apellido' | 'telefono')[];
}

export interface EstadoTusDatos {
  cedula: string;
  estado: Estado;
  hallada: Hallada | null;
  /** Para que cedula se hizo la busqueda: si cambia, se busca otra vez. */
  buscadaPara: string;
  nombre: string;
  apellido: string;
  telefono: string;
}

export const TUS_DATOS_VACIOS: EstadoTusDatos = {
  cedula: '', estado: 'pendiente', hallada: null, buscadaPara: '',
  nombre: '', apellido: '', telefono: '',
};

/** Lo que se manda a crear_reserva. Null en un campo = lo pone la base desde el maestro. */
export interface DatosPedido {
  cedula: string;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
}

const soloDigitos = (s: string) => s.replace(/\D/g, '');
const lleno = (s: string) => s.trim() !== '';

/** Los datos listos para apartar, o null si todavia falta algo. */
export function datosParaReservar(v: EstadoTusDatos): DatosPedido | null {
  const digitos = soloDigitos(v.cedula);
  if (digitos.length < 6 || digitos !== v.buscadaPara) return null;

  if (v.estado === 'confirmada' && v.hallada) {
    const faltaApellido = v.hallada.faltan.includes('apellido');
    const faltaTelefono = v.hallada.faltan.includes('telefono');
    if ((faltaApellido && !lleno(v.apellido)) || (faltaTelefono && !lleno(v.telefono))) return null;
    return {
      cedula: v.cedula,
      nombre: null,
      apellido: faltaApellido ? v.apellido : null,
      telefono: faltaTelefono ? v.telefono : null,
    };
  }
  if (v.estado === 'nueva' || v.estado === 'actualizar' || v.estado === 'sin_conexion') {
    if (!lleno(v.nombre) || !lleno(v.apellido) || !lleno(v.telefono)) return null;
    return { cedula: v.cedula, nombre: v.nombre, apellido: v.apellido, telefono: v.telefono };
  }
  return null;
}

/** Lo que le falta para poder apartar, dicho en una linea. */
export function queFalta(v: EstadoTusDatos): string {
  if (soloDigitos(v.cedula).length < 6) return 'Escribe tu cédula para seguir.';
  if (v.estado === 'buscando') return 'Buscando tu cédula.';
  if (v.estado === 'encontrada') return 'Confirma si eres tú.';
  return 'Faltan tus datos.';
}

/**
 * Tus datos, empezando por la cedula.
 *
 * Si la clienta ya compro en la tienda, al escribir su cedula la reconoce
 * y le pregunta si es ella; no escribe nada mas. Si no, llena sus datos.
 *
 * LO QUE ENSENA ESTA ENMASCARADO A PROPOSITO: "Maria G., al numero que
 * termina en 67". El catalogo lo abre cualquiera y las cedulas son numeros
 * correlativos: si aqui salieran el nombre y el telefono completos,
 * cualquiera podria probar cedula tras cedula y llevarse la lista de
 * clientas. Lo que ella no escribe lo pone la base al apartar, por dentro.
 *
 * El estado vive en el catalogo y no aqui: si vuelve a "Seguir viendo" y
 * regresa, lo que ya confirmo sigue confirmado.
 */
export function TusDatos({ valor, alCambiar }: {
  valor: EstadoTusDatos;
  alCambiar: Dispatch<SetStateAction<EstadoTusDatos>>;
}) {
  const digitos = soloDigitos(valor.cedula);

  // Busca cuando deja de escribir. Una cedula a medio escribir no se
  // busca: "123456" puede ser el principio de la de otra persona.
  useEffect(() => {
    if (digitos === valor.buscadaPara) return;
    if (digitos.length < 6) {
      alCambiar((v) => ({ ...v, estado: 'pendiente', hallada: null, buscadaPara: '' }));
      return;
    }
    // `buscadaPara` se vacia al empezar: si escribe un digito de mas y lo
    // borra antes de que llegue la respuesta, la cedula vuelve a ser la de
    // antes y hay que buscarla otra vez. Sin esto se quedaba "Buscando".
    alCambiar((v) => ({ ...v, estado: 'buscando', hallada: null, buscadaPara: '' }));
    let vigente = true;
    const espera = setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase.rpc('buscar_cliente_publico', { p_cedula: digitos });
        if (!vigente) return;
        const r = data as ({ encontrada: boolean } & Partial<Hallada>) | null;
        alCambiar((v) => {
          // Si mientras tanto cambio la cedula, esta respuesta ya no aplica.
          if (soloDigitos(v.cedula) !== digitos) return v;
          // Si la busqueda falla, que no le cueste el pedido: escribe sus
          // datos y sigue.
          if (error) return { ...v, estado: 'sin_conexion', hallada: null, buscadaPara: digitos };
          if (!r?.encontrada) return { ...v, estado: 'nueva', hallada: null, buscadaPara: digitos };
          return {
            ...v,
            estado: 'encontrada',
            buscadaPara: digitos,
            hallada: {
              nombre: r.nombre ?? '',
              inicial: r.inicial ?? '',
              telefono_final: r.telefono_final ?? null,
              faltan: r.faltan ?? [],
            },
          };
        });
      })();
    }, 600);
    return () => { vigente = false; clearTimeout(espera); };
  }, [digitos, valor.buscadaPara, alCambiar]);

  const cambiar = (campo: 'cedula' | 'nombre' | 'apellido' | 'telefono', texto: string) =>
    alCambiar((v) => ({ ...v, [campo]: texto }));

  const h = valor.hallada;
  const quien = h ? `${h.nombre}${h.inicial ? ` ${h.inicial}.` : ''}` : '';
  const escribeTodo = valor.estado === 'nueva' || valor.estado === 'actualizar' || valor.estado === 'sin_conexion';

  const campoApellido = (
    <Campo etiqueta="Apellido" htmlFor="r-apellido">
      <input id="r-apellido" value={valor.apellido} onChange={(e) => cambiar('apellido', e.target.value)} autoComplete="family-name" required />
    </Campo>
  );
  const campoTelefono = (
    <Campo etiqueta="Teléfono" htmlFor="r-tel" pista="Con el código. Por ejemplo 0412 1234567.">
      <input id="r-tel" type="tel" value={valor.telefono} onChange={(e) => cambiar('telefono', e.target.value)} autoComplete="tel" required />
    </Campo>
  );

  return (
    <div className="tus-datos">
      <Campo
        etiqueta="Cédula"
        htmlFor="r-cedula"
        pista="Empieza por aquí. Si ya compraste con nosotros, no tienes que escribir nada más."
      >
        <input
          id="r-cedula"
          inputMode="numeric"
          autoComplete="off"
          value={valor.cedula}
          onChange={(e) => cambiar('cedula', e.target.value)}
          required
        />
      </Campo>

      <p className="tus-datos__estado" aria-live="polite">
        {valor.estado === 'buscando' ? 'Buscando tu cédula' : ''}
      </p>

      {valor.estado === 'encontrada' && h ? (
        <div className="clienta-hallada">
          <span className="panel__titulo">Ya compraste con nosotros</span>
          <p className="clienta-hallada__nombre">{quien}</p>
          {h.telefono_final ? (
            <p className="clienta-hallada__dato">Te escribimos al número que termina en {h.telefono_final}.</p>
          ) : null}
          <div className="acciones acciones--sueltas">
            <button type="button" className="boton" onClick={() => alCambiar((v) => ({ ...v, estado: 'confirmada' }))}>
              Sí, soy yo
            </button>
            <button
              type="button"
              className="boton boton--secundario"
              onClick={() => alCambiar((v) => ({ ...v, estado: 'actualizar', nombre: v.nombre || h.nombre }))}
            >
              Cambiar mis datos
            </button>
          </div>
          <p className="campo__pista">¿No eres tú? Revisa la cédula.</p>
        </div>
      ) : null}

      {valor.estado === 'confirmada' && h ? (
        <div className="clienta-hallada">
          <p className="clienta-hallada__dato">
            El pedido va a nombre de <strong>{quien}</strong>
            {h.telefono_final ? `, al número que termina en ${h.telefono_final}` : ''}.
          </p>
          {h.faltan.length > 0 ? (
            <>
              <p className="campo__pista">
                {h.faltan.length === 2
                  ? 'No tenemos tu apellido ni tu teléfono completo: escríbelos para el envío.'
                  : h.faltan[0] === 'apellido'
                    ? 'No tenemos tu apellido: escríbelo para el envío.'
                    : 'No tenemos tu teléfono completo: escríbelo para avisarte.'}
              </p>
              <div className="fila">
                {h.faltan.includes('apellido') ? campoApellido : null}
                {h.faltan.includes('telefono') ? campoTelefono : null}
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="boton boton--secundario boton--pequeno"
            onClick={() => alCambiar((v) => ({ ...v, estado: 'actualizar', nombre: v.nombre || h.nombre }))}
          >
            Cambiar mis datos
          </button>
        </div>
      ) : null}

      {escribeTodo ? (
        <>
          <p className="campo__pista tus-datos__aviso">
            {valor.estado === 'nueva'
              ? 'Es tu primera compra con nosotros. Déjanos tus datos.'
              : valor.estado === 'actualizar'
                ? 'Tus datos nuevos van con este pedido. En la tienda actualizamos tu ficha.'
                : 'No pudimos revisar tu cédula. Escribe tus datos y seguimos.'}
          </p>
          <div className="fila">
            <Campo etiqueta="Nombre" htmlFor="r-nombre">
              <input id="r-nombre" value={valor.nombre} onChange={(e) => cambiar('nombre', e.target.value)} autoComplete="given-name" required />
            </Campo>
            {campoApellido}
          </div>
          <div className="fila" style={{ marginTop: 'var(--hueco-campos)' }}>
            {campoTelefono}
          </div>
        </>
      ) : null}
    </div>
  );
}
