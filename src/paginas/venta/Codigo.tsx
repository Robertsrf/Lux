import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Aviso, Campo } from '../../componentes/Piezas';
import { formatearBcv, formatearBs, formatearFecha, formatearFechaHora, sumarCifras } from '../../lib/dinero';
import { nombreConVariante } from '../../lib/familias';
import { urlPublicaFoto } from '../../lib/fotos';
import { normalizarCodigo } from '../../lib/ofertas';
import { verOferta } from '../../lib/ofertasApi';
import type { PiezaVerOferta, VerOferta } from '../../lib/ofertasApi';
import { mensajeDeError } from '../../lib/supabase';
import '../../estilos/codigo.css';

/** Lo que se le dice a la vendedora de un código que no sirve, o null si sirve. */
function porQueNo(o: VerOferta): string | null {
  switch (o.estado) {
    case 'sirve':
      return null;
    case 'usado':
      if (o.venta_id !== null) {
        return `Ya se usó${o.usado_en ? ` el ${formatearFecha(o.usado_en)}` : ''} en la venta ${o.venta_id}.`;
      }
      if (o.reserva_id !== null) return `Ya lo tiene el pedido ${o.reserva_id}: lo usó una clienta desde el catálogo.`;
      return 'Ya se usó.';
    case 'vencido':
      return `Venció el ${formatearFecha(o.vence_en)}.`;
    case 'anulado':
      return `La tienda lo anuló${o.anulado_motivo ? `: ${o.anulado_motivo}` : '.'}`;
    case 'no_existe':
      return 'No existe: revisa las letras.';
    case 'pieza_no_disponible': {
      const faltan = o.piezas.filter((p) => !p.disponible).map((p) => nombreConVariante(p.nombre, p.variante));
      return `Una pieza ya no está: ${faltan.length > 0 ? faltan.join(', ') : 'se vendió o se retiró'}.`;
    }
    default:
      return 'No se pudo revisar este código.';
  }
}

function PiezaDelCodigo({ p }: { p: PiezaVerOferta }) {
  const foto = urlPublicaFoto(p.foto_thumb ?? p.foto_url);
  const nombre = nombreConVariante(p.nombre, p.variante);
  const donde = p.ubicaciones.filter((u) => u.libre > 0);
  return (
    <li className="cod-pieza">
      {foto ? <img className="cod-pieza__foto" src={foto} alt="" loading="lazy" /> : <span className="cod-pieza__foto" aria-hidden="true" />}
      <div className="cod-pieza__datos">
        <strong>{p.cantidad > 1 ? `${p.cantidad} × ` : ''}{nombre}</strong>
        <span className="cod-pieza__donde">
          {donde.length > 0
            ? `Hay en ${donde.map((u) => `${u.nombre} (${u.libre})`).join(', ')}`
            : 'No hay libres'}
        </span>
        <span className="cod-pieza__precio">
          <span className="cod-pieza__antes">{formatearBs(p.precio_lista_bs)} · {formatearBcv(p.precio_lista_usd)}</span>
          <span className="cod-pieza__ahora">{formatearBs(p.precio_oferta_bs)} · {formatearBcv(p.precio_oferta_usd)}</span>
        </span>
      </div>
    </li>
  );
}

/**
 * "Código": la clienta llega con un código de oferta (LUX-XXXXXX) y la
 * vendedora lo revisa aquí. Sirve para las dos caras. La base dice si sirve
 * (`ver_oferta`); con "Sirve", las piezas pasan al cobro con su precio.
 */
export function Codigo() {
  const navegar = useNavigate();
  const [texto, setTexto] = useState('');
  const [revisando, setRevisando] = useState(false);
  const [oferta, setOferta] = useState<VerOferta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultado = useRef<HTMLDivElement>(null);

  async function revisar(e: FormEvent) {
    e.preventDefault();
    setOferta(null);
    setError(null);
    const codigo = normalizarCodigo(texto);
    if (!codigo) {
      setError('Ese código no se entiende: son las letras LUX y seis letras o números, como LUX-7K4M2P.');
      return;
    }
    setRevisando(true);
    try {
      setOferta(await verOferta(codigo));
      // El resultado queda a la vista aunque el teclado ocupe media pantalla.
      requestAnimationFrame(() => resultado.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setRevisando(false);
    }
  }

  const motivo = oferta ? porQueNo(oferta) : null;
  const sirve = oferta?.estado === 'sirve' && oferta.piezas.every((p) => p.disponible);

  const totalLista = oferta ? sumarCifras(oferta.piezas.map((p) => p.precio_lista_bs * p.cantidad)) : 0;
  const totalOferta = oferta ? sumarCifras(oferta.piezas.map((p) => p.precio_oferta_bs * p.cantidad)) : 0;
  const totalOfertaBcv = oferta ? sumarCifras(oferta.piezas.map((p) => p.precio_oferta_usd * p.cantidad)) : 0;

  return (
    <div className="pagina pagina--angosta mostrador cod-pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Código</h1>
          <p>La clienta trae un código de oferta. Escríbelo como esté: con o sin guion, en mayúsculas o minúsculas.</p>
        </div>
        <Link className="boton boton--secundario" to="/venta">Volver al mostrador</Link>
      </div>

      <form className="cod-form" onSubmit={(e) => void revisar(e)}>
        <Campo etiqueta="Código" htmlFor="codigo-oferta">
          <input
            id="codigo-oferta"
            className="cod-entrada"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="LUX-"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </Campo>
        <button type="submit" className="boton cod-boton" disabled={revisando || texto.trim() === ''}>
          {revisando ? 'Revisando' : 'Revisar'}
        </button>
      </form>

      {error ? <Aviso tono="error">{error}</Aviso> : null}

      <div ref={resultado}>
        {oferta && motivo ? (
          <Aviso tono="alerta" titulo={`Código ${oferta.codigo}`}>{motivo}</Aviso>
        ) : null}

        {oferta && !motivo && !sirve ? (
          <Aviso tono="alerta" titulo={`Código ${oferta.codigo}`}>Una pieza ya no está disponible. Mira abajo cuál.</Aviso>
        ) : null}

        {oferta && oferta.piezas.length > 0 && (sirve || oferta.estado === 'pieza_no_disponible') ? (
          <div className="tarjeta cod-resultado">
            {sirve ? (
              <>
                <h2 className="cod-sirve">Sirve</h2>
                <p>
                  {oferta.codigo} · {oferta.pct} % menos en estas piezas
                  {oferta.vence_en ? ` · vale hasta el ${formatearFechaHora(oferta.vence_en)}` : ''}
                </p>
              </>
            ) : null}
            <ul className="cod-piezas">
              {oferta.piezas.map((p) => <PiezaDelCodigo key={p.modelo_id} p={p} />)}
            </ul>
            <div className="cod-total">
              <span>Total con el código</span>
              <strong>{formatearBs(totalOferta)} · {formatearBcv(totalOfertaBcv)}</strong>
              <span className="cod-pieza__antes">sin el código {formatearBs(totalLista)}</span>
            </div>
            {sirve ? (
              <div className="acciones">
                <button type="button" className="boton cod-boton" onClick={() => navegar('/venta', { state: { codigo: oferta } })}>
                  Pasar al cobro
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
