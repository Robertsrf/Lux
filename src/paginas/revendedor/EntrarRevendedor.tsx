import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Monograma, Wordmark } from '../../componentes/Marca';
import { Aviso, Campo } from '../../componentes/Piezas';
import { entrarRevendedor, leerSesionRv } from '../../lib/revendedor';

/** "ab12cd34ef56" -> "AB12-CD34-EF56", mientras escribe. */
function conGuiones(texto: string): string {
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return limpio.match(/.{1,4}/g)?.join('-') ?? '';
}

/**
 * La puerta del panel de un revendedor: /#/rv/entrar.
 *
 * Un solo campo con el código que le dio Lux. No es la puerta de la tienda
 * a propósito: esa prueba el código contra las cuentas del personal, y un
 * código de revendedor ahí gastaría intentos contra la del administrador.
 *
 * Doce letras y números de un alfabeto sin 0, O, 1, I ni L: se dictan por
 * teléfono sin confundirse, y no se adivinan probando.
 */
export function EntrarRevendedor() {
  const navegar = useNavigate();
  const donde = useLocation();
  const motivo = (donde.state as { motivo?: string } | null)?.motivo ?? null;
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  if (leerSesionRv()) return <Navigate to="/rv" replace />;

  async function entrar() {
    if (entrando || codigo.replace(/-/g, '').length !== 12) return;
    setEntrando(true);
    setError(null);
    const fallo = await entrarRevendedor(codigo);
    setEntrando(false);
    if (fallo) { setError(fallo); return; }
    navegar('/rv', { replace: true });
  }

  const completo = codigo.replace(/-/g, '').length === 12;

  return (
    <div className="login">
      <div className="login__caja">
        <div className="login__marca">
          <Monograma tamano={60} />
          <Wordmark alto={68} />
        </div>

        {motivo && !error ? <Aviso tono="error">{motivo}</Aviso> : null}
        {error ? <Aviso tono="error">{error}</Aviso> : null}

        <form onSubmit={(e) => { e.preventDefault(); void entrar(); }}>
          <Campo etiqueta="Tu código de revendedor" htmlFor="codigo-rv" pista="Doce letras y números. Te lo dio Lux por WhatsApp.">
            <input
              id="codigo-rv"
              value={codigo}
              onChange={(e) => { setCodigo(conGuiones(e.target.value)); setError(null); }}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX"
              autoFocus
            />
          </Campo>

          <div className="acciones">
            <button type="submit" className="boton" disabled={entrando || !completo}>
              {entrando ? 'Entrando' : 'Entrar a mi panel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
