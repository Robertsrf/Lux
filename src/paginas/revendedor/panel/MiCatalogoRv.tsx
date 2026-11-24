import { useEffect, useState } from 'react';
import { Aviso, Campo, Cargando } from '../../../componentes/Piezas';
import { supabase } from '../../../lib/supabase';
import { urlPublicaFoto } from '../../../lib/fotos';
import { enlaceCatalogoRv, rpcRv, subirMiLogo } from '../../../lib/revendedor';
import type { PaletaRevendedor, PerfilRevendedor } from '../../../lib/tipos';
import { EditorTemaRv } from '../catalogo/EditorTemaRv';
import type { PiezaParaPortada } from '../catalogo/EditorTemaRv';
import { normalizarTema } from '../catalogo/tema';
import type { TemaGuardado } from '../catalogo/tema';
import { textoDeError, usePanelRv } from '../contexto';

/**
 * Cómo se ve su catálogo (fase 6, #73): el nombre, su WhatsApp, su logo y
 * su tema (plantilla, colores, letra, esquinas, portada y frase).
 *
 * Color libre, con el contraste medido: tema.ts ajusta las letras al
 * dibujar para que todo se lea a 4,5:1, y aquí se le dice antes de guardar.
 * Los seis colores de antes quedan como "listos para usar".
 *
 * El logo lo sube él (función de servidor `logo-revendedor`, que mira su
 * testigo y que sea una imagen de menos de 300 KB); sin la función
 * publicada, se lo sigue mandando a Lux.
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
  const [subiendo, setSubiendo] = useState(false);
  const [tema, setTema] = useState<TemaGuardado>({});
  const [piezas, setPiezas] = useState<PiezaParaPortada[] | null>(null);
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
    // Su tema y sus piezas (para la portada), de lo mismo que lee su catálogo.
    void (async () => {
      const [p, c] = await Promise.all([
        supabase.rpc('rv_perfil_publico', { p_usuario: resumen.usuario }),
        supabase.rpc('rv_catalogo_publico', { p_usuario: resumen.usuario }).select('id, nombre, variante, foto_thumb_path').limit(400),
      ]);
      setTema(normalizarTema((p.data as PerfilRevendedor | null)?.tema));
      setPiezas((c.data as PiezaParaPortada[] | null) ?? []);
    })();
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
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
      setGuardando(false);
      return;
    }
    // El tema va aparte: si falla, lo demás ya quedó guardado.
    try {
      const limpio = normalizarTema(tema);
      await rpcRv('rv_guardar_tema', { p_tema: Object.keys(limpio).length ? limpio : null });
      setAviso('Guardado. Así se ve tu catálogo desde ahora.');
    } catch (e) {
      if (!siSeCerro(e)) setError(`Lo demás quedó guardado, pero la plantilla y los colores no: ${textoDeError(e)}`);
    }
    await recargar();
    setGuardando(false);
  }

  async function subirLogo(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    setAviso(null);
    try {
      await subirMiLogo(archivo);
      await recargar();
      setAviso('Listo: tu logo ya sale en tu catálogo.');
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setSubiendo(false);
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

        <h2 className="seccion-titulo">Cómo se ve</h2>
        <EditorTemaRv valor={tema} alCambiar={setTema} piezas={piezas} paleta={paleta} alElegirPaleta={setPaleta} />

        <div className="panel">
          <span className="panel__titulo">Tu logo</span>
          {logo ? <img className="rv-marca__logo rv-marca__logo--muestra" src={logo} alt="Tu logo" /> : null}
          <Campo etiqueta={logo ? 'Cambiar tu logo' : 'Subir tu logo'} htmlFor="mc-logo" pista={subiendo ? 'Subiendo tu logo…' : 'JPG, PNG o WebP. Sale tal como es, sin recortarlo; mejor con fondo transparente.'}>
            <input id="mc-logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={subiendo} onChange={(e) => void subirLogo(e.target.files?.[0])} />
          </Campo>
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
        <button type="button" className="boton boton--confirmar" disabled={guardando || subiendo || diasMal} onClick={() => void guardar()}>
          {guardando ? 'Guardando' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
