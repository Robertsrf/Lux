import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Monograma, Wordmark } from '../componentes/Marca';
import { Aviso, Campo } from '../componentes/Piezas';
import { entrarConCodigo } from '../lib/auth';
import { hayConfiguracion } from '../lib/supabase';
import { useSesion } from '../hooks/useSesion';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'entrar'];

/**
 * Acceso con un solo codigo. No se escribe usuario: cada persona tiene el
 * suyo y el sistema deduce quien es.
 *
 * No se envia solo al llegar a cuatro digitos porque los codigos ya no
 * tienen todos el mismo largo, y un envio prematuro gastaria un intento
 * contra el limite de Supabase. Se entra con el boton, que esta bajo el
 * pulgar.
 */
export function Entrar() {
  const { sesion, perfil, cargando: cargandoSesion } = useSesion();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar() {
    if (entrando || !codigo.trim()) return;
    setEntrando(true);
    setError(null);

    const { error: err } = await entrarConCodigo(codigo);
    if (err) {
      setError(
        err.message.toLowerCase().includes('invalid')
          ? 'Ese codigo no es de nadie. Revisalo e intenta otra vez.'
          : err.message,
      );
      setCodigo('');
      setEntrando(false);
    }
    // Si entro, el proveedor de sesion redirige solo.
  }

  if (sesion && perfil && !cargandoSesion) {
    return <Navigate to={perfil.rol === 'admin' ? '/admin/inventario' : '/venta'} replace />;
  }

  function tecla(t: string) {
    setError(null);
    if (t === 'borrar') setCodigo((c) => c.slice(0, -1));
    else if (t === 'entrar') void entrar();
    else setCodigo((c) => c + t);
  }

  return (
    <div className="login">
      <div className="login__caja">
        <div className="login__marca">
          <Monograma tamano={60} />
          <Wordmark alto={68} />
        </div>

        {!hayConfiguracion ? (
          <Aviso tono="error" titulo="Falta configurar Supabase">
            No hay VITE_SUPABASE_URL ni VITE_SUPABASE_ANON_KEY. Copia .env.example a .env,
            pon la URL y la anon key del proyecto, y vuelve a levantar el sitio.
          </Aviso>
        ) : null}

        {error ? <Aviso tono="error">{error}</Aviso> : null}

        <form onSubmit={(e) => { e.preventDefault(); void entrar(); }}>
          <Campo etiqueta="Tu codigo" htmlFor="codigo">
            <input
              id="codigo"
              type="password"
              inputMode="text"
              value={codigo}
              onChange={(e) => { setCodigo(e.target.value); setError(null); }}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
          </Campo>

          <div className="puntos-pin" aria-hidden="true">
            {Array.from({ length: Math.min(codigo.length, 12) }, (_, i) => (
              <span key={i} className="lleno" />
            ))}
          </div>

          <div className="teclado-pin">
            {TECLAS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => tecla(t)}
                disabled={entrando}
                className={t === 'borrar' || t === 'entrar' ? 'tecla-util' : undefined}
                aria-label={t === 'borrar' ? 'Borrar' : t === 'entrar' ? 'Entrar' : `Digito ${t}`}
              >
                {t === 'borrar' ? 'Borrar' : t === 'entrar' ? 'Entrar' : t}
              </button>
            ))}
          </div>

          <div className="acciones">
            <button type="submit" className="boton" disabled={entrando || codigo.length === 0}>
              {entrando ? 'Entrando' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
