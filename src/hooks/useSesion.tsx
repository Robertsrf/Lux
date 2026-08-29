import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { cargarPerfil } from '../lib/auth';
import type { Perfil } from '../lib/tipos';

interface EstadoSesion {
  sesion: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  esAdmin: boolean;
  errorPerfil: string | null;
}

const Contexto = createContext<EstadoSesion>({
  sesion: null,
  perfil: null,
  cargando: true,
  esAdmin: false,
  errorPerfil: null,
});

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSesion(data.session);
      if (!data.session) setCargando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
      if (!nueva) {
        setPerfil(null);
        setCargando(false);
      }
    });

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const usuario = sesion?.user;
    if (!usuario) return;

    let vivo = true;
    setCargando(true);
    setErrorPerfil(null);

    cargarPerfil(usuario.id)
      .then((p) => {
        if (!vivo) return;
        setPerfil(p);
        if (!p) {
          setErrorPerfil(
            'Tu usuario entro, pero no tiene fila en la tabla perfiles. ' +
            'Un administrador debe crearla para asignarte un rol.',
          );
        }
      })
      .catch((e: unknown) => {
        if (vivo) setErrorPerfil(e instanceof Error ? e.message : 'No se pudo leer tu perfil.');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => { vivo = false; };
  }, [sesion?.user?.id]);

  const valor = useMemo<EstadoSesion>(
    () => ({ sesion, perfil, cargando, esAdmin: perfil?.rol === 'admin', errorPerfil }),
    [sesion, perfil, cargando, errorPerfil],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): EstadoSesion {
  return useContext(Contexto);
}
