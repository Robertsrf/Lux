import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando } from '../../componentes/Piezas';

interface Texto { clave: string; valor: string; descripcion: string | null }

const ETIQUETAS: Record<string, string> = {
  materiales_largo: 'De que estan hechas las piezas',
  materiales_corto: 'Version corta, para cada ficha',
  catalogo_intro: 'Sobre Lux, en la portada del catalogo',
  catalogo_pie: 'Pie de pagina del catalogo',
  datos_pago: 'A donde paga la clienta: pago movil, RIF, banco',
  mensaje_whatsapp: 'Mensaje que acompana el enlace del catalogo',
  ciudad: 'Ciudad de la tienda (rellena las frases del banco)',
  estado: 'Estado (rellena las frases del banco; vacio las oculta)',
};

/**
 * Los textos de marca. Lo que hace especial a Lux es lo mismo para toda la
 * linea, asi que vive aqui y no se teclea pieza por pieza.
 *
 * Se guardan en la base, no en el codigo: cambiarlos no necesita un
 * despliegue ni a nadie que sepa programar.
 */
export function Textos() {
  const [textos, setTextos] = useState<Texto[]>([]);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('textos')
      .select('clave, valor, descripcion')
      .order('clave');
    if (err) setError(mensajeDeError(err));
    const filas = (data as Texto[] | null) ?? [];
    setTextos(filas);
    setBorrador(Object.fromEntries(filas.map((t) => [t.clave, t.valor])));
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar(clave: string) {
    setGuardando(clave);
    setError(null);
    setExito(null);
    const { error: err } = await supabase
      .from('textos')
      .update({ valor: borrador[clave] ?? '', actualizado_en: new Date().toISOString() })
      .eq('clave', clave);
    if (err) setError(mensajeDeError(err));
    else { setExito('Texto guardado. Ya se ve en el catalogo.'); await cargar(); }
    setGuardando(null);
  }

  if (cargando) return <Cargando texto="Cargando textos" />;

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Textos del catalogo</h1>
          <p>Lo que hace especial a Lux. Se escribe una vez y sale en todas las piezas.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      <div className="pila">
        {textos.map((t) => {
          const cambiado = (borrador[t.clave] ?? '') !== t.valor;
          return (
            <div className="tarjeta" key={t.clave}>
              <Campo
                etiqueta={ETIQUETAS[t.clave] ?? t.clave}
                htmlFor={`txt-${t.clave}`}
                pista={t.descripcion ?? undefined}
              >
                <textarea
                  id={`txt-${t.clave}`}
                  rows={t.clave === 'catalogo_intro' ? 6 : 3}
                  value={borrador[t.clave] ?? ''}
                  onChange={(e) => setBorrador((b) => ({ ...b, [t.clave]: e.target.value }))}
                />
              </Campo>

              <div className="acciones">
                <button
                  type="button"
                  className="boton"
                  disabled={!cambiado || guardando === t.clave}
                  onClick={() => void guardar(t.clave)}
                >
                  {guardando === t.clave ? 'Guardando' : 'Guardar'}
                </button>
                {cambiado ? (
                  <button
                    type="button"
                    className="boton boton--secundario"
                    onClick={() => setBorrador((b) => ({ ...b, [t.clave]: t.valor }))}
                  >
                    Descartar
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
