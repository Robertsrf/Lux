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
  // Su pago móvil: a dónde le pagan sus clientas. Y cuántos días les da
  // para pagarle un apartado; vacío, no da crédito y le pagan todo.
  const [pmCedula, setPmCedula] = useState('');
  const [pmTelefono, setPmTelefono] = useState('');
  const [pmBanco, setPmBanco] = useState('');
  const [dias, setDias] = useState('');
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
    setPmCedula(resumen.pago_movil_cedula ?? '');
    setPmTelefono(resumen.pago_movil_telefono ?? '');
    setPmBanco(resumen.pago_movil_banco ?? '');
    setDias(resumen.dias_credito ? String(resumen.dias_credito) : '');
    setLleno(true);
  }, [resumen, lleno]);

  if (!resumen) return <Cargando texto="Abriendo tu catálogo" />;

  const diasNumero = dias.trim() ? Number(dias) : null;
  const diasMal = diasNumero !== null && (!Number.isInteger(diasNumero) || diasNumero <= 0);

  async function guardar() {
    if (diasMal) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      await rpcRv('rv_ajustes', { p_catalogo_nombre: nombre, p_paleta: paleta, p_telefono: telefono });
      await rpcRv('rv_datos_pago', {
        p_cedula: pmCedula, p_telefono: pmTelefono, p_banco: pmBanco, p_dias_credito: diasNumero,
      });
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
          <p>El nombre que ven tus clientas, a qué número te escriben, los colores y cómo te pagan.</p>
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
          {logo ? <img className="rv-marca__logo rv-marca__logo--muestra" src={logo} alt="Tu logo" /> : null}
          <p className="campo__pista">
            {logo ? 'Para cambiarlo, mándale el nuevo a Lux por WhatsApp.' : 'Mándale tu logo a Lux por WhatsApp y lo sube a tu catálogo tal como es, sin recortarlo. Mejor con fondo transparente.'}
          </p>
        </div>
      </div>

      <h2 className="seccion-titulo">Cómo te pagan</h2>
      <div className="tarjeta">
        <p className="prosa" style={{ marginTop: 0 }}>
          Tus clientas ven estos datos en su pedido, con un botón para copiar cada uno, y ahí te avisan que ya pagaron.
        </p>
        <div className="fila">
          <Campo etiqueta="Cédula del pago móvil" htmlFor="mc-pm-ced">
            <input id="mc-pm-ced" inputMode="numeric" autoComplete="off" value={pmCedula} onChange={(e) => setPmCedula(e.target.value)} />
          </Campo>
          <Campo etiqueta="Teléfono del pago móvil" htmlFor="mc-pm-tel" pista="Con el código: 0412 1234567.">
            <input id="mc-pm-tel" type="tel" autoComplete="off" value={pmTelefono} onChange={(e) => setPmTelefono(e.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Banco" htmlFor="mc-pm-banco" pista="Con su código, como sale en la aplicación: 0102 Banco de Venezuela.">
          <input id="mc-pm-banco" autoComplete="off" maxLength={60} value={pmBanco} onChange={(e) => setPmBanco(e.target.value)} />
        </Campo>
        <Campo
          etiqueta="Días de crédito para tus clientas"
          htmlFor="mc-dias"
          error={diasMal ? 'Escribe un número entero de días, o déjalo vacío.' : null}
          pista={`Con días, pueden apartar pagándote al menos el ${resumen.inicial_pct ?? ''} % y el resto en ese plazo. Vacío, te pagan todo. A Lux le pagas todo en el día igual.`}
        >
          <input id="mc-dias" inputMode="numeric" autoComplete="off" value={dias} onChange={(e) => setDias(e.target.value)} />
        </Campo>
      </div>

      <div className="acciones">
        <button type="button" className="boton boton--confirmar" disabled={guardando || diasMal} onClick={() => void guardar()}>
          {guardando ? 'Guardando' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
