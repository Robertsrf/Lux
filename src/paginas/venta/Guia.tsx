import { useState } from 'react';
import { Cargando, Vacio } from '../../componentes/Piezas';
import { useConsejos } from '../../hooks/useConsejos';
import type { Consejo } from '../../lib/tipos';

const MOMENTOS = [
  { clave: 'recibir',   texto: 'Recibir' },
  { clave: 'descubrir', texto: 'Descubrir' },
  { clave: 'educar',    texto: 'Educar' },
  { clave: 'demostrar', texto: 'Demostrar' },
  { clave: 'cerrar',    texto: 'Cerrar' },
  { clave: 'despedir',  texto: 'Despedir' },
  { clave: 'objecion',  texto: 'Objeciones' },
];

function Frase({ c, comillas = true }: { c: Consejo; comillas?: boolean }) {
  return (
    <div className="frase">
      {c.etiqueta ? <span className="frase__etiqueta">{c.etiqueta}</span> : null}
      <p className={comillas ? 'frase__texto frase__texto--cita' : 'frase__texto'}>{c.texto}</p>
      {c.nota ? <p className="frase__nota">{c.nota}</p> : null}
    </div>
  );
}

/**
 * La guia del colaborador, a dos toques del mostrador.
 *
 * Esta pensada para abrirse CON la clienta delante: las frases se ven de
 * una, sin desplegar nada, y el momento se cambia con una fila de botones
 * grandes. No es un manual para leer: es un apunte para mirar de reojo.
 */
export function Guia() {
  const { por, cargando } = useConsejos();
  const [momento, setMomento] = useState('recibir');

  if (cargando) return <Cargando texto="Abriendo la guia" />;

  const frases = por(momento);
  const esObjecion = momento === 'objecion';

  return (
    <div className="pagina pagina--angosta mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Como vender Lux</h1>
          <p>Frases listas para usar. Adaptalas a tu forma de hablar: son guia, no libreto.</p>
        </div>
      </div>

      <div className="selector-ubicacion" role="group" aria-label="Momento de la atencion">
        {MOMENTOS.map((m) => (
          <button key={m.clave} type="button" aria-pressed={momento === m.clave} onClick={() => setMomento(m.clave)}>
            {m.texto}
          </button>
        ))}
      </div>

      {esObjecion ? (
        <p className="campo__pista" style={{ marginBottom: 'var(--e-4)' }}>
          Nunca discutas ni presiones. Valida lo que siente, educa y —si puedes— demuestra.
          Una objecion es una pregunta disfrazada.
        </p>
      ) : null}

      {frases.length === 0 ? (
        <Vacio titulo="Todavia no hay frases para este momento" />
      ) : (
        <div className="pila">
          {frases.map((c) => (
            <div className="tarjeta" key={c.id}>
              {esObjecion ? (
                <>
                  <span className="frase__etiqueta">Si te dicen</span>
                  <p className="frase__objecion">{c.etiqueta}</p>
                  <p className="frase__texto frase__texto--cita">{c.texto}</p>
                  {c.nota ? <p className="frase__nota">{c.nota}</p> : null}
                </>
              ) : (
                <Frase c={c} />
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="seccion-titulo">El ritual, en seis pasos</h2>
      <div className="pila">
        {por('paso').map((c) => (
          <div className="tarjeta" key={c.id}><Frase c={c} comillas={false} /></div>
        ))}
      </div>

      <h2 className="seccion-titulo">Lo que vendes</h2>
      <div className="pila">
        {por('pilar').map((c) => (
          <div className="tarjeta" key={c.id}><Frase c={c} comillas={false} /></div>
        ))}
      </div>

      <h2 className="seccion-titulo">Si dudas, vuelve a esto</h2>
      <div className="pila">
        {por('principio').map((c) => (
          <div className="tarjeta" key={c.id}><Frase c={c} comillas={false} /></div>
        ))}
      </div>

      <h2 className="seccion-titulo">Lo que nunca se hace</h2>
      <div className="tarjeta">
        {por('nunca').map((c) => (
          <div className="nunca" key={c.id}>
            <span className="nunca__marca" aria-hidden="true">&times;</span>
            <div>
              <span className="frase__etiqueta">{c.etiqueta}</span>
              <p className="frase__texto">{c.texto}</p>
              {c.nota ? <p className="frase__nota">{c.nota}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
