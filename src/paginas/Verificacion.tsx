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

const PALABRAS_DE_COSTO = [
  'costo', 'flete', 'margen', 'lote',
  // Nombres que trajo el modelo de dos monedas: si alguno se cuela en la
  // vista del mostrador, la vendedora deduce el costo.
  'operativo', 'ganancia', 'merma', 'gasto',
];

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

    // El flete ya no depende del peso de la pieza: sale del lote y nada mas.
    const flete = await supabase.rpc('admin_previsualizar_flete', { p_lote_id: null });
    resultados.push({
      nombre: 'Funcion admin_previsualizar_flete',
      esperado: esAdmin ? 'Responde' : 'Rechazada por no ser admin',
      obtenido: flete.error ? `Rechazada: ${flete.error.message}` : `Respondio ${String(flete.data)}`,
      bien: esAdmin ? !flete.error : Boolean(flete.error),
    });

    // Esta fuga estuvo abierta una vez y casi vuelve al reescribir la vista.
    // Una vista corre con los privilegios de su dueno, asi que sin filtro se
    // salta el REVOKE de `lotes` y la vendedora lee el costo de la tienda.
    const capex = await supabase.from('v_capex_lote').select('id').limit(1);
    const filasCapex = capex.data?.length ?? 0;
    resultados.push({
      nombre: 'Vista v_capex_lote (exhibidores)',
      esperado: esAdmin ? 'Devuelve filas' : 'Devuelve 0 filas: no es de la vendedora',
      obtenido: capex.error ? `Rechazada: ${capex.error.message}` : `${filasCapex} fila(s)`,
      bien: esAdmin ? !capex.error : filasCapex === 0,
    });

    // Devuelve el alquiler y la nomina. No se otorga a NADIE: solo la llaman
    // funciones de definidor, donde el permiso se comprueba contra el dueno.
    // Para EJECUTAR una funcion Postgres mira a quien llama, no a la vista.
    const nomina = await supabase.rpc('gastos_fijos_mes_bcv');
    resultados.push({
      nombre: 'Funcion gastos_fijos_mes_bcv',
      esperado: 'Rechazada SIEMPRE, tambien para el admin',
      obtenido: nomina.error ? `Rechazada: ${nomina.error.message}` : `Respondio ${String(nomina.data)}`,
      bien: Boolean(nomina.error),
    });

    // El diagnostico lleva costo, margen y objetivo de ganancia.
    const dx = await supabase.from('v_diagnostico').select('gastos_mes_usd').limit(1);
    const filasDx = dx.data?.length ?? 0;
    resultados.push({
      nombre: 'Vista v_diagnostico',
      esperado: esAdmin ? 'Devuelve la fila' : 'Devuelve 0 filas',
      obtenido: dx.error ? `Rechazada: ${dx.error.message}` : `${filasDx} fila(s)`,
      bien: esAdmin ? !dx.error : filasDx === 0,
    });

    // El piso de regateo SI es de la vendedora: es un solo numero, el minimo
    // al que puede cerrar. No revela costo ni margen.
    const piso = await supabase.from('v_catalogo_venta').select('precio_minimo_usd').limit(1);
    resultados.push({
      nombre: 'Piso de regateo en el mostrador',
      esperado: 'Funciona para los dos: es lo que la vendedora necesita ver',
      obtenido: piso.error ? `Fallo: ${piso.error.message}` : 'Funciona',
      bien: !piso.error,
    });

    /* --- El maestro de clientas ------------------------------------- */

    // El maestro es de las dos caras, asi que aqui no se comprueba quien
    // entra sino que responda. Lo que si importa es lo de abajo.
    const maestro = await supabase.from('v_clientes').select('id, compras, servicio_vigente').limit(1);
    resultados.push({
      nombre: 'Vista v_clientes',
      esperado: 'Funciona: el maestro lo ven las dos caras',
      obtenido: maestro.error ? `Fallo: ${maestro.error.message}` : 'Funciona',
      bien: !maestro.error,
    });

    // `v_cliente_compras` sale de `venta_items`, que guarda el costo
    // congelado de cada linea. Se pide la columna a proposito: si la vista
    // la expusiera, esto devolveria datos en vez de fallar. Y funciona
    // aunque todavia no haya comprado nadie, porque no mira filas.
    const fugaCompras = await supabase.from('v_cliente_compras').select('costo_puesto_usd_snap').limit(1);
    resultados.push({
      nombre: 'Costo congelado en el historico de una clienta',
      esperado: 'Rechazada: esa columna no debe existir en la vista',
      obtenido: fugaCompras.error ? 'No existe la columna' : 'LA COLUMNA ESTA AHI',
      bien: Boolean(fugaCompras.error),
    });

    // El enlace publico enseña la ubicacion EN CLAVE, "V1 · BG". El nombre
    // completo no debe salir por ahi: es lo unico que hace que el codigo
    // sirva de algo.
    const nombrePublico = await supabase.from('v_disponible_publico').select('ubicaciones').limit(1);
    resultados.push({
      nombre: 'Nombre de la ubicacion en el catalogo publico',
      esperado: 'Rechazada: ahi solo va el codigo',
      obtenido: nombrePublico.error ? 'No existe la columna' : 'ESTA EL NOMBRE COMPLETO',
      bien: Boolean(nombrePublico.error),
    });

    // La meta de la vendedora tiene que ser la misma cuenta que ve el dueno
    // en Costos. Si algun dia alguien le arma una formula propia, esto lo ve.
    const [metaV, planV] = await Promise.all([
      supabase.rpc('meta_vendedora'),
      supabase.from('v_plan_ventas').select('piezas_meta_mes, piezas_equilibrio_mes').maybeSingle(),
    ]);
    const metaMes = ((metaV.data as { meta_mes: number | null }[] | null) ?? [])[0]?.meta_mes ?? null;
    const planFila = planV.data as { piezas_meta_mes: number | null; piezas_equilibrio_mes: number | null } | null;
    const planMes = planFila ? (planFila.piezas_meta_mes ?? planFila.piezas_equilibrio_mes) : null;
    const falloMeta = metaV.error ?? planV.error;
    resultados.push({
      nombre: 'La meta de la vendedora',
      esperado: esAdmin ? 'La misma que dice Costos' : 'Responde con sus piezas',
      obtenido: falloMeta
        ? `Fallo: ${falloMeta.message}`
        : esAdmin
          ? `Ella: ${metaMes ?? '—'} · Costos: ${planMes ?? '—'} piezas al mes`
          : `${metaMes ?? '—'} piezas al mes`,
      bien: !falloMeta && (!esAdmin || Number(metaMes) === Number(planMes)),
    });

    const meses = await supabase.rpc('meses_servicio');
    resultados.push({
      nombre: 'Meses de lavado y abrillantado',
      esperado: 'Responde el numero que fijaste en Costos',
      obtenido: meses.error ? `Fallo: ${meses.error.message}` : `${String(meses.data)} mes(es)`,
      bien: !meses.error && Number(meses.data) > 0,
    });

    /*
      LAS DOS MAS IMPORTANTES DE ESTA TANDA, y son dos por una razon.

      Las dos llaman a `registrar_venta` con el carrito VACIO. La funcion
      comprueba eso antes de tocar una sola tabla, asi que contesta "La
      venta no tiene piezas" y no escribe nada.

      La primera la llama como la llamaria un navegador VIEJO, con los
      siete parametros de antes. Si al añadir los tres nuevos quedaron dos
      funciones con el mismo nombre, PostgREST no sabe cual elegir y
      responde "could not choose the best candidate": el telefono que no se
      ha actualizado no podria cobrar, con una clienta delante.

      La segunda la llama con los parametros nuevos. Esa prueba que la
      firma de hoy esta publicada y que el maestro de clientas se puede
      usar al vender.

      Una sola de las dos no basta: la de arriba no ve si falta lo nuevo, y
      la de abajo no ve la ambiguedad, porque `p_cliente_id` ya descarta a
      la version vieja.
    */
    const vacio = { p_tipo: 'detal', p_metodo: 'efectivo_bs', p_items: [] };
    const valido = (e: { message?: string } | null) => Boolean(e?.message?.includes('no tiene piezas'));

    const vieja = await supabase.rpc('registrar_venta', { ...vacio, p_kit_id: null, p_notas: null });
    resultados.push({
      nombre: 'Cobrar desde un navegador sin actualizar',
      esperado: 'Sigue encajando: hay UNA sola registrar_venta',
      obtenido: valido(vieja.error)
        ? 'Encaja y valida (no escribio nada)'
        : vieja.error ? `Fallo: ${vieja.error.message}` : 'Respondio sin validar el carrito vacio',
      bien: valido(vieja.error),
    });

    const nueva = await supabase.rpc('registrar_venta', {
      ...vacio, p_cliente_id: null, p_cliente_cedula: null, p_cliente_apellido: null,
    });
    resultados.push({
      nombre: 'Cobrar a nombre de una clienta',
      esperado: 'La firma nueva esta publicada',
      obtenido: valido(nueva.error)
        ? 'Encaja y valida (no escribio nada)'
        : nueva.error ? `Fallo: ${nueva.error.message}` : 'Respondio sin validar el carrito vacio',
      bien: valido(nueva.error),
    });

    // Una sola cifra de gastos en todo el sistema. Antes Costos y Reportes
    // enseñaban dos distintas: Reportes metia el empaque como gasto del mes.
    // Si alguna vista vuelve a copiar la formula por su cuenta, esto lo ve.
    const [gPlan, gDx, gDesglose, gCobertura] = await Promise.all([
      supabase.from('v_plan_ventas').select('gastos_fijos_bcv').maybeSingle(),
      supabase.from('v_diagnostico').select('gastos_mes_usd').maybeSingle(),
      supabase.from('v_gastos_desglose').select('monto_usd'),
      supabase.from('v_cobertura_mes').select('gastos_mes_usd').maybeSingle(),
    ]);
    const cifras = [
      Number((gPlan.data as { gastos_fijos_bcv: number } | null)?.gastos_fijos_bcv ?? NaN),
      Number((gDx.data as { gastos_mes_usd: number } | null)?.gastos_mes_usd ?? NaN),
      ((gDesglose.data as { monto_usd: number }[] | null) ?? []).reduce((a, f) => a + Number(f.monto_usd), 0),
      Number((gCobertura.data as { gastos_mes_usd: number } | null)?.gastos_mes_usd ?? NaN),
    ];
    const falloGastos = gPlan.error ?? gDx.error ?? gDesglose.error ?? gCobertura.error;
    const iguales = cifras.every((c) => Number.isFinite(c) && Math.abs(c - cifras[0]!) < 0.05);
    resultados.push({
      nombre: 'Los gastos del mes, una sola cifra',
      esperado: esAdmin ? 'Costos, Reportes y el desglose dicen lo mismo' : 'Solo se puede comprobar como administrador',
      obtenido: falloGastos
        ? `Fallo: ${falloGastos.message}`
        : cifras.map((c) => (Number.isFinite(c) ? c.toFixed(2) : '—')).join(' · '),
      bien: !esAdmin || (!falloGastos && iguales),
    });

    // Se solto con esquema-limpieza-kits.sql. Estaba otorgada a la
    // vendedora y ya no la llamaba ninguna pantalla.
    const kit = await supabase.rpc('registrar_venta_kit', { p_kit_id: -1 });
    const noExiste = Boolean(kit.error?.message?.includes('Could not find')
      || kit.error?.code === 'PGRST202');
    resultados.push({
      nombre: 'Funcion registrar_venta_kit',
      esperado: 'Ya no existe: se fue con las pantallas de kits',
      obtenido: noExiste ? 'No existe' : kit.error ? `Sigue ahi: ${kit.error.message}` : 'SIGUE AHI Y RESPONDE',
      bien: noExiste,
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
          <h1>Verificación</h1>
          <p>
            Las puertas que tienen que seguir cerradas, probadas en vivo con la sesion
            de {perfil?.nombre ?? '—'} ({perfil?.rol ?? '—'}). No escribe nada: son
            todo lecturas y una llamada que se valida sola.
          </p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={() => void correr()}>Repetir</button>
      </div>

      {corriendo ? <Cargando texto="Probando" /> : fallos === 0 ? (
        <Aviso tono="exito" titulo="Todo en orden">Las {pruebas.length} pruebas pasaron.</Aviso>
      ) : (
        <Aviso tono="error" titulo={`${fallos} prueba(s) sin pasar`}>
          Revisa que hayas ejecutado todos los .sql en orden, hasta el ultimo de
          la tabla de INSTALACION.md. Si falla una de las de fuga, no sigas: la
          vendedora esta viendo algo que no deberia.
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
