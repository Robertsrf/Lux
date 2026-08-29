import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Aviso, Cargando } from '../componentes/Piezas';
import { useSesion } from '../hooks/useSesion';

interface Prueba {
  nombre: string;
  esperado: string;
  obtenido: string;
  bien: boolean;
}

const PALABRAS_DE_COSTO = ['costo', 'flete', 'margen', 'peso', 'lote'];

/**
 * Comprueba en vivo el checklist de seguridad de la Fase 1, con la sesion que
 * este abierta. Sirve para verificar desde el telefono de la vendedora que
 * los costos de verdad no le llegan.
 */
export function Verificacion() {
  const { perfil, esAdmin } = useSesion();
  const [pruebas, setPruebas] = useState<Prueba[]>([]);
  const [corriendo, setCorriendo] = useState(true);

  const correr = useCallback(async () => {
    setCorriendo(true);
    const resultados: Prueba[] = [];

    const modelos = await supabase.from('modelos').select('id').limit(1);
    resultados.push({
      nombre: 'Consulta directa a la tabla modelos',
      esperado: 'Rechazada para todos (la tabla esta revocada)',
      obtenido: modelos.error ? `Rechazada: ${modelos.error.message}` : 'Devolvio datos',
      bien: Boolean(modelos.error),
    });

    const lotes = await supabase.from('lotes').select('id').limit(1);
    resultados.push({
      nombre: 'Consulta directa a la tabla lotes',
      esperado: 'Rechazada para todos',
      obtenido: lotes.error ? `Rechazada: ${lotes.error.message}` : 'Devolvio datos',
      bien: Boolean(lotes.error),
    });

    const venta = await supabase.from('v_catalogo_venta').select('*').limit(1);
    const columnas = venta.data && venta.data[0] ? Object.keys(venta.data[0]) : [];
    const filtradas = columnas.filter((c) => PALABRAS_DE_COSTO.some((p) => c.toLowerCase().includes(p)));
    resultados.push({
      nombre: 'Vista v_catalogo_venta',
      esperado: 'Funciona y no trae ninguna columna de costo',
      obtenido: venta.error
        ? `Fallo: ${venta.error.message}`
        : columnas.length === 0
          ? 'Funciona, pero no hay modelos cargados para inspeccionar las columnas'
          : filtradas.length > 0
            ? `Trae columnas sensibles: ${filtradas.join(', ')}`
            : `Funciona con ${columnas.length} columnas, ninguna de costo`,
      bien: !venta.error && filtradas.length === 0,
    });

    const admin = await supabase.from('v_catalogo_admin').select('id').limit(1);
    const filasAdmin = admin.data?.length ?? 0;
    resultados.push({
      nombre: 'Vista v_catalogo_admin',
      esperado: esAdmin ? 'Devuelve filas (sesion de admin)' : 'Devuelve 0 filas (sesion de vendedora)',
      obtenido: admin.error ? `Fallo: ${admin.error.message}` : `${filasAdmin} fila(s)`,
      bien: esAdmin ? !admin.error : filasAdmin === 0,
    });

    const flete = await supabase.rpc('admin_previsualizar_flete', { p_lote_id: null, p_peso_g: 0, p_costo_usd: 0 });
    resultados.push({
      nombre: 'Funcion admin_previsualizar_flete',
      esperado: esAdmin ? 'Responde' : 'Rechazada por no ser admin',
      obtenido: flete.error ? `Rechazada: ${flete.error.message}` : `Respondio ${String(flete.data)}`,
      bien: esAdmin ? !flete.error : Boolean(flete.error),
    });

    setPruebas(resultados);
    setCorriendo(false);
  }, [esAdmin]);

  useEffect(() => { void correr(); }, [correr]);

  const fallos = pruebas.filter((p) => !p.bien).length;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Verificacion</h1>
          <p>Checklist de seguridad de la Fase 1, con la sesion de {perfil?.nombre ?? '—'} ({perfil?.rol ?? '—'}).</p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={() => void correr()}>Repetir</button>
      </div>

      {corriendo ? <Cargando texto="Probando" /> : fallos === 0 ? (
        <Aviso tono="exito" titulo="Todo en orden">Las {pruebas.length} pruebas pasaron.</Aviso>
      ) : (
        <Aviso tono="error" titulo={`${fallos} prueba(s) sin pasar`}>
          Revisa que hayas ejecutado esquema.sql y esquema-complemento.sql completos en Supabase.
        </Aviso>
      )}

      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Prueba</th>
              <th>Se espera</th>
              <th>Resultado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pruebas.map((p) => (
              <tr key={p.nombre}>
                <td>{p.nombre}</td>
                <td className="secundario">{p.esperado}</td>
                <td>{p.obtenido}</td>
                <td>
                  {p.bien
                    ? <span className="etiqueta etiqueta--exito">Pasa</span>
                    : <span className="etiqueta etiqueta--error">Falla</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
