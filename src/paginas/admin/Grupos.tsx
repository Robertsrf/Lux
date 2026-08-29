import { useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearBs, formatearUsd, precioEnBs } from '../../lib/dinero';
import { useGrupos } from '../../hooks/useCatalogos';
import { useTasa } from '../../hooks/useTasa';

/**
 * Grupos de precio (G9, G11, G13, G20, G28). El precio se fija en DOLARES:
 * los bolivares salen de multiplicar por la tasa vigente al mostrar.
 *
 * Las cifras reales las carga el administrador. Aqui no hay ningun precio
 * quemado en el codigo, a proposito.
 */
export function Grupos() {
  const { grupos, cargando, recargar } = useGrupos();
  const { tasa } = useTasa();
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [edicion, setEdicion] = useState<Record<number, string>>({});

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.from('grupos_precio').insert({
      nombre: nombre.trim().toUpperCase(),
      precio_usd: Number(precio),
      orden: grupos.length + 1,
    });
    if (err) setError(mensajeDeError(err));
    else { setNombre(''); setPrecio(''); await recargar(); }
    setGuardando(false);
  }

  async function guardarPrecio(id: number) {
    const valor = edicion[id];
    if (valor === undefined || valor === '') return;
    setError(null);
    const { error: err } = await supabase.from('grupos_precio').update({ precio_usd: Number(valor) }).eq('id', id);
    if (err) setError(mensajeDeError(err));
    else { setEdicion((e) => { const c = { ...e }; delete c[id]; return c; }); await recargar(); }
  }

  async function alternarActivo(id: number, activo: boolean) {
    const { error: err } = await supabase.from('grupos_precio').update({ activo: !activo }).eq('id', id);
    if (err) setError(mensajeDeError(err));
    else await recargar();
  }

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Grupos de precio</h1>
          <p>El precio se ancla en dolares. Los bolivares se calculan con la tasa vigente.</p>
        </div>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}
      {!tasa ? (
        <Aviso tono="alerta" titulo="Sin tasa vigente">
          Los precios en bolivares apareceran cuando fijes la tasa en la pantalla de Tasas.
        </Aviso>
      ) : null}

      <form className="tarjeta" onSubmit={(e) => void agregar(e)} style={{ marginBottom: 'var(--e-5)' }}>
        <h2>Agregar grupo</h2>
        <hr className="divisor" />
        <div className="fila">
          <Campo etiqueta="Nombre" htmlFor="g-nombre" pista="Como lo llaman en la tienda: G9, G13...">
            <input id="g-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={12} />
          </Campo>
          <Campo etiqueta="Precio en $" htmlFor="g-precio">
            <input id="g-precio" type="number" step="0.01" min="0.01" required value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </Campo>
          <button type="submit" className="boton" style={{ flex: '0 0 auto' }} disabled={guardando}>Agregar</button>
        </div>
      </form>

      {cargando ? <Cargando /> : grupos.length === 0 ? (
        <Vacio titulo="Aun no hay grupos de precio">
          <p>Crea el primero arriba. Sin grupo, un modelo no tiene precio de venta.</p>
        </Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Grupo</th>
                <th className="num">Precio $</th>
                <th className="num">Precio Bs</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const enEdicion = edicion[g.id];
                return (
                  <tr key={g.id}>
                    <td className="util">{g.nombre}</td>
                    <td className="num">
                      <input
                        type="number" step="0.01" min="0.01"
                        style={{ maxWidth: 120, textAlign: 'right' }}
                        value={enEdicion ?? String(g.precio_usd)}
                        onChange={(e) => setEdicion((prev) => ({ ...prev, [g.id]: e.target.value }))}
                      />
                    </td>
                    <td className="num precio">{formatearBs(precioEnBs(Number(enEdicion ?? g.precio_usd), tasa?.tasa_venta ?? null))}</td>
                    <td>{g.activo ? <span className="etiqueta etiqueta--exito">Activo</span> : <span className="etiqueta">Inactivo</span>}</td>
                    <td>
                      <div className="fila" style={{ gap: 'var(--e-2)' }}>
                        <button
                          type="button" className="boton boton--secundario" style={{ flex: '0 0 auto' }}
                          disabled={enEdicion === undefined || enEdicion === String(g.precio_usd)}
                          onClick={() => void guardarPrecio(g.id)}
                        >
                          Guardar
                        </button>
                        <button type="button" className="boton boton--secundario" style={{ flex: '0 0 auto' }} onClick={() => void alternarActivo(g.id, g.activo)}>
                          {g.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}>{grupos.length} grupos · el precio unitario mostrado en Bs usa la tasa vigente {formatearUsd(1)} = {formatearBs(tasa?.tasa_venta ?? null)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
