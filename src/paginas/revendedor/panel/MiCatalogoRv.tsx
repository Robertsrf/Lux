import { useEffect, useState } from 'react';
import { Aviso, Campo, Cargando } from '../../../componentes/Piezas';
import { urlPublicaFoto } from '../../../lib/fotos';
import { PALETAS, claseTema, enlaceCatalogoRv, rpcRv } from '../../../lib/revendedor';
import type { PaletaRevendedor } from '../../../lib/tipos';
import { textoDeError, usePanelRv } from '../contexto';

/**
 * Cómo se ve su catálogo: el nombre, su WhatsApp y la paleta.
 *
 * Seis paletas y no un selector de color: cada una está medida a 4,5:1 en
 * cada par de texto (estilos/revendedor.css). Un color libre haría un
 * catálogo que no se lee con el sol del mediodía, y el catálogo sigue
 * diciendo "Joyas Lux by Emory".
 *
 * El logo lo sube Lux: sin sesión de Supabase él no puede escribir en el
 * almacén de fotos, y así tampoco se cuela una imagen de 8 MB.
 */
export function MiCatalogoRv() {
  const { resumen, recargar, siSeCerro } = usePanelRv();
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [paleta, setPaleta] = useState<PaletaRevendedor>('lux');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Se llena una vez, cuando llega: si se rellenara en cada recarga, borraría
  // lo que está escribiendo.
  const [lleno, setLleno] = useState(false);
  useEffect(() => {
    if (!resumen || lleno) return;
    setNombre(resumen.catalogo_propio ?? '');
    setTelefono(resumen.telefono ?? '');
    setPaleta(resumen.paleta);
    setLleno(true);
  }, [resumen, lleno]);

  if (!resumen) return <Cargando texto="Abriendo tu catálogo" />;

  async function guardar() {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      await rpcRv('rv_ajustes', { p_catalogo_nombre: nombre, p_paleta: paleta, p_telefono: telefono });
      await recargar();
      setAviso('Guardado. Así se ve tu catálogo desde ahora.');
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setGuardando(false);
  }

  const logo = urlPublicaFoto(resumen.logo_path);
  const enlace = enlaceCatalogoRv(resumen.usuario);

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Mi catálogo</h1>
          <p>El nombre que ven tus clientas, a qué número te escriben y los colores.</p>
        </div>
        <a className="boton boton--secundario" href={enlace} target="_blank" rel="noopener noreferrer">Ver mi catálogo</a>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      <div className="tarjeta">
        <div className="fila">
          <Campo etiqueta="Nombre del catálogo" htmlFor="mc-nombre" pista={`Vacío, se llama ${resumen.nombre}.`}>
            <input id="mc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={resumen.nombre} maxLength={60} autoComplete="off" />
          </Campo>
          <Campo etiqueta="Tu WhatsApp" htmlFor="mc-tel" pista="Con el código: 0412 1234567. Tus clientas te escriben aquí.">
            <input id="mc-tel" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="tel" />
          </Campo>
        </div>

        <fieldset className="paletas" style={{ marginTop: 'var(--e-6)' }}>
          <legend>Colores</legend>
          {PALETAS.map((p) => (
            <label key={p.id} className={`paleta ${claseTema(p.id)}`}>
              <input type="radio" name="paleta" value={p.id} checked={paleta === p.id} onChange={() => setPaleta(p.id)} />
              <span className="paleta__muestra" aria-hidden="true">
                <span className="paleta__ancla"><span className="paleta__acento" /></span>
                <span className="paleta__papel" />
              </span>
              <span className="paleta__nombre">{p.nombre}</span>
            </label>
          ))}
        </fieldset>

        <div className="panel">
          <span className="panel__titulo">Tu logo</span>
          {logo ? <img className="rv-marca__logo" src={logo} alt="Tu logo" /> : null}
          <p className="campo__pista">
            {logo ? 'Para cambiarlo, mándale el nuevo a Lux por WhatsApp.' : 'Mándale tu logo a Lux por WhatsApp, cuadrado, y lo sube a tu catálogo.'}
          </p>
        </div>

        <div className="acciones">
          <button type="button" className="boton boton--confirmar" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? 'Guardando' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
