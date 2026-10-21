import { useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearBs, formatearTasa, leerCifra, precioEnBs } from '../../lib/dinero';
import { useGrupos } from '../../hooks/useCatalogos';
import { useTasa } from '../../hooks/useTasa';
import type { Escalera, GrupoPrecio } from '../../lib/tipos';

/**
 * Grupos de precio, en dos escaleras: la de las piezas (G9, G11, G14...) y
 * la de los dijes, que van sin lo de tienda (esquema-dijes.sql). El precio
 * se fija en DOLARES: los bolivares salen de multiplicar por la tasa
 * vigente al mostrar.
 *
 * Las cifras reales las carga el administrador. Aqui no hay ningun precio
 * quemado en el codigo, a proposito: tampoco en la escalera de los dijes.
 */
export function Grupos() {
  const { grupos, cargando, recargar } = useGrupos();
  const { tasa } = useTasa();
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [escalera, setEscalera] = useState<Escalera>('pieza');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [edicion, setEdicion] = useState<Record<number, string>>({});

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    // Un campo de texto y `leerCifra`: "2,50" con coma es como se escribe
    // aquí, y un campo numérico lo dejaba vacío.
    const valor = leerCifra(precio);
    if (valor === null) {
      setError('El precio no es una cifra: escribe solo el número, por ejemplo 9 o 2,50.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.from('grupos_precio').insert({
      nombre: nombre.trim().toUpperCase(),
      precio_usd: valor,
      orden: grupos.filter((g) => (g.escalera ?? 'pieza') === escalera).length + 1,
      escalera,
    });
    if (err) setError(mensajeDeError(err));
    else { setNombre(''); setPrecio(''); await recargar(); }
    setGuardando(false);
  }

  async function guardarPrecio(id: number) {
    const texto = edicion[id];
    if (texto === undefined || texto === '') return;
    const valor = leerCifra(texto);
    if (valor === null) {
      setError('El precio no es una cifra: escribe solo el número, por ejemplo 9 o 2,50.');
      return;
    }
    setError(null);
    const { error: err } = await supabase.from('grupos_precio').update({ precio_usd: valor }).eq('id', id);
    if (err) setError(mensajeDeError(err));
    else { setEdicion((e) => { const c = { ...e }; delete c[id]; return c; }); await recargar(); }
  }

  async function alternarActivo(id: number, activo: boolean) {
    const { error: err } = await supabase.from('grupos_precio').update({ activo: !activo }).eq('id', id);
    if (err) setError(mensajeDeError(err));
    else await recargar();
  }

  const dePiezas = grupos.filter((g) => (g.escalera ?? 'pieza') === 'pieza');
  const deDijes = grupos.filter((g) => g.escalera === 'dije');

  function tabla(lista: GrupoPrecio[], pie: string) {
    return (
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Grupo</th>
              <th className="num">Precio · $ BCV</th>
              <th className="num">Precio · Bs</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((g) => {
              const enEdicion = edicion[g.id];
              const leido = enEdicion === undefined ? g.precio_usd : leerCifra(enEdicion);
              return (
                <tr key={g.id}>
                  <td className="util">{g.nombre}</td>
                  <td className="num">
                    <input
                      type="text" inputMode="decimal" autoComplete="off"
                      className="entrada-compacta"
                      aria-label={`Precio de ${g.nombre} en dólares BCV`}
                      value={enEdicion ?? String(g.precio_usd).replace('.', ',')}
                      onChange={(e) => setEdicion((prev) => ({ ...prev, [g.id]: e.target.value }))}
                    />
                  </td>
                  <td className="num precio">{leido === null ? '—' : formatearBs(precioEnBs(leido, tasa))}</td>
                  <td>{g.activo ? <span className="etiqueta etiqueta--exito">Activo</span> : <span className="etiqueta">Inactivo</span>}</td>
                  <td>
                    <div className="grupo-botones">
                      <button
                        type="button" className="boton boton--secundario boton--pequeno"
                        disabled={enEdicion === undefined || leido === g.precio_usd}
                        onClick={() => void guardarPrecio(g.id)}
                      >
                        Guardar
                      </button>
                      <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => void alternarActivo(g.id, g.activo)}>
                        {g.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={5}>{pie}</td></tr>
          </tfoot>
        </table>
      </div>
    );
  }

  const tasaTexto = tasa ? `$1 BCV = Bs ${formatearTasa(tasa.tasa_bcv)}` : 'sin tasa vigente';

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Grupos de precio</h1>
          <p>El precio se ancla en dolares. Los bolivares se calculan con la tasa vigente.</p>
        </div>
      </div>

      <Ayuda titulo="Por que hay grupos y no un precio por pieza">
        <p>
          Un grupo es un punto de precio: G14 son catorce dolares BCV. Cada
          pieza cae en el grupo más barato que cubra su costo más el margen,
          redondeando hacia arriba.
        </p>
        <p>
          Sirve para dos cosas. La clienta reconoce los precios en vez de ver
          cifras sueltas, y tu cambias un grupo y se mueven todas sus piezas de
          una vez.
        </p>
        <p>
          <strong>Los escalones suben como un 25 %</strong>, no de dos en dos.
          La diferencia entre 9 y 12 se nota igual que la que hay entre 25 y 30;
          en cambio 14, 15 y 16 se leen como el mismo precio y no aportan nada.
        </p>
        <p>
          Si una pieza no cabe en ninguno, el sistema avisa: hace falta un grupo
          más alto, o esa pieza lleva precio propio.
        </p>
      </Ayuda>

      <Ayuda titulo="Por qué los dijes tienen su propia escalera">
        <p>
          Una pieza lleva su parte de la tienda (el empaque y lo del mes de
          alquiler y sueldos) antes del margen. Un dije que se cuelga de una
          cadena no: esa parte ya la paga la cadena. Si la llevara, un dije de
          $0,88 saldría en G9.
        </p>
        <p>
          Por eso su precio es su mercancía con el margen, y cae en esta
          escalera, la de los dijes, con precios mucho más bajos. Cadena más
          dije cuesta lo que costaría una sola pieza con los dos costos sumados.
          Los precios de esta escalera los decides tú.
        </p>
      </Ayuda>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}
      {!tasa ? (
        <Aviso tono="alerta" titulo="Sin tasa vigente">
          Los precios en bolivares apareceran cuando fijes la tasa en la pantalla de Tasas.
        </Aviso>
      ) : null}

      <form className="tarjeta" onSubmit={(e) => void agregar(e)}>
        <h2>Agregar grupo</h2>
        <hr className="divisor" />
        <div className="fila">
          <Campo etiqueta="Escalera" htmlFor="g-escalera">
            <select id="g-escalera" value={escalera} onChange={(e) => setEscalera(e.target.value === 'dije' ? 'dije' : 'pieza')}>
              <option value="pieza">De las piezas</option>
              <option value="dije">De los dijes</option>
            </select>
          </Campo>
          <Campo etiqueta="Nombre" htmlFor="g-nombre" pista={escalera === 'dije' ? 'Por ejemplo D2, D3...' : 'Como lo llaman en la tienda: G9, G13...'}>
            <input id="g-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={12} />
          </Campo>
          <Campo etiqueta="Precio en $ BCV" htmlFor="g-precio">
            <input id="g-precio" type="text" inputMode="decimal" autoComplete="off" required value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </Campo>
        </div>
        <div className="acciones">
          <button type="submit" className="boton" disabled={guardando}>Agregar grupo</button>
        </div>
      </form>

      {cargando ? <Cargando /> : grupos.length === 0 ? (
        <Vacio titulo="Aún no hay grupos de precio">
          <p>Crea el primero arriba. Sin grupo, un modelo no tiene precio de venta.</p>
        </Vacio>
      ) : (
        <>
          <h2>Las piezas</h2>
          {dePiezas.length > 0
            ? tabla(dePiezas, `${dePiezas.length} grupos · el precio del grupo esta en dolares BCV; los bolivares salen de la tasa BCV vigente (${tasaTexto})`)
            : <p>No hay grupos de piezas.</p>}

          <h2>Los dijes</h2>
          {deDijes.length > 0
            ? tabla(deDijes, `${deDijes.length} grupos de dijes · sin lo de tienda, que lo paga la cadena o la pulsera (${tasaTexto})`)
            : (
              <Vacio titulo="Todavía no hay escalera de dijes">
                <p>
                  Agrégala arriba eligiendo "De los dijes". Mientras no exista, un dije no tiene
                  precio sugerido: el formulario lo avisa.
                </p>
              </Vacio>
            )}
        </>
      )}
    </div>
  );
}
