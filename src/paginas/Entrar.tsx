import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Monograma, Wordmark } from '../componentes/Marca';
import { Aviso, Campo } from '../componentes/Piezas';
import { iniciarSesion, LARGO_PIN } from '../lib/auth';
import { hayConfiguracion } from '../lib/supabase';
import { useSesion } from '../hooks/useSesion';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'entrar'];

export function Entrar() {
  const { sesion, perfil, cargando: cargandoSesion } = useSesion();
  const [usuario, setUsuario] = useState('vendedora');
  const [clave, setClave] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  const usaPin = usuario.trim().toLowerCase() === 'vendedora';

  async function entrar(secreto: string) {
    if (entrando) return;
    setEntrando(true);
    setError(null);

    const { error: err } = await iniciarSesion(usuario, secreto, usaPin ? 'pin' : 'contrasena');

    if (err) {
      setError(
        err.message.toLowerCase().includes('invalid')
          ? `El usuario o ${usaPin ? 'el PIN' : 'la clave'} no coinciden. Revisa e intenta de nuevo.`
          : err.message,
      );
      setPin('');
      setEntrando(false);
    }
    // Si entro, el proveedor de sesion redirige solo.
  }

  // El mostrador entra con 4 digitos y sin tocar "Entrar": es mas rapido.
  useEffect(() => {
    if (usaPin && pin.length === LARGO_PIN && !entrando) void entrar(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (sesion && perfil && !cargandoSesion) {
    return <Navigate to={perfil.rol === 'admin' ? '/admin/inventario' : '/venta'} replace />;
  }

  function tecla(t: string) {
    setError(null);
    if (t === 'borrar') setPin((p) => p.slice(0, -1));
    else if (t === 'entrar') { if (pin.length === LARGO_PIN) void entrar(pin); }
    else if (pin.length < LARGO_PIN) setPin((p) => p + t);
  }

  return (
    <div className="login">
      <div className="login__caja">
        <div className="login__marca">
          <Monograma tamano={56} />
          <Wordmark tamano={40} />
        </div>

        {!hayConfiguracion ? (
          <Aviso tono="error" titulo="Falta configurar Supabase">
            No hay VITE_SUPABASE_URL ni VITE_SUPABASE_ANON_KEY. Copia .env.example a .env,
            pon la URL y la anon key del proyecto, y vuelve a levantar el sitio.
          </Aviso>
        ) : null}

        {error ? <Aviso tono="error">{error}</Aviso> : null}

        <form
          onSubmit={(e) => { e.preventDefault(); void entrar(usaPin ? pin : clave); }}
        >
          <Campo etiqueta="Usuario" htmlFor="usuario">
            <input
              id="usuario"
              value={usuario}
              onChange={(e) => { setUsuario(e.target.value); setError(null); setPin(''); setClave(''); }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Campo>

          {usaPin ? (
            <>
              <p className="pin__titulo">PIN de 4 digitos</p>
              <div className="puntos-pin" aria-hidden="true">
                {Array.from({ length: LARGO_PIN }, (_, i) => (
                  <span key={i} className={i < pin.length ? 'lleno' : undefined} />
                ))}
              </div>
              <div className="teclado-pin">
                {TECLAS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => tecla(t)}
                    disabled={entrando}
                    aria-label={t === 'borrar' ? 'Borrar' : t === 'entrar' ? 'Entrar' : `Digito ${t}`}
                    style={t === 'borrar' || t === 'entrar' ? { fontFamily: 'var(--fuente-util)', fontSize: 'var(--t-12)', letterSpacing: 'var(--tracking)', textTransform: 'uppercase' } : undefined}
                  >
                    {t === 'borrar' ? 'Borrar' : t === 'entrar' ? 'Entrar' : t}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <Campo etiqueta="Clave" htmlFor="clave" pista="Los administradores usan clave larga, no PIN.">
                <input
                  id="clave"
                  type="password"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  autoComplete="current-password"
                />
              </Campo>
              <button type="submit" className="boton" disabled={entrando || clave.length === 0}>
                {entrando ? 'Entrando' : 'Entrar'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
