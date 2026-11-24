import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { usuarioDelSubdominio } from '../../../lib/direccion';
import { useCatalogoRv } from './useCatalogoRv';
import { fuenteSupabase } from './fuente';
import type { FuenteCatalogoRv } from './fuente';
import { variablesCss } from './tema';
import type { Plantilla } from './tema';
import type { CatalogoRv as Cerebro } from './tipos';
import { Editorial } from './plantillas/Editorial';
import { Tienda } from './plantillas/Tienda';
import { Lookbook } from './plantillas/Lookbook';
import './catalogo-rv.css';
import './plantillas/editorial.css';
import './plantillas/tienda.css';
import './plantillas/lookbook.css';

/** Una plantilla nueva es otro archivo aquí y un valor más en `rv_tema_valido`. */
const PLANTILLA: Record<Plantilla, (p: { c: Cerebro }) => ReactElement> = {
  editorial: Editorial,
  tienda: Tienda,
  lookbook: Lookbook,
};

/**
 * El catálogo de un revendedor: `<usuario>.luxbyemory.com` (en desarrollo,
 * `/r/<usuario>`). Lo abre su clienta desde el enlace que él le manda, sin
 * sesión. Se viste con SU tema y SU plantilla (fase 6): fuera del sistema
 * visual de Lux, para que se vea de su marca.
 */
export function CatalogoRv() {
  // En su subdominio el usuario sale de la dirección; en /r/<usuario>, de la ruta.
  const { usuario: deLaRuta } = useParams();
  const usuario = deLaRuta ?? usuarioDelSubdominio();
  const real = useMemo(() => fuenteSupabase(usuario), [usuario]);
  // Solo en desarrollo: `?demo=1` abre un revendedor de muestra (demo.ts).
  // Dentro de `import.meta.env.DEV` para que no llegue al sitio publicado.
  const [demo, setDemo] = useState<FuenteCatalogoRv | null>(null);
  const pideDemo = new URLSearchParams(window.location.search).has('demo');
  useEffect(() => {
    if (import.meta.env.DEV && pideDemo) {
      void import('./demo').then((m) => setDemo(m.fuenteDemo(new URLSearchParams(window.location.search))));
    }
  }, [pideDemo]);
  if (import.meta.env.DEV && pideDemo && !demo) return null;
  return <Catalogo usuario={usuario} fuente={demo ?? real} />;
}

function Catalogo({ usuario, fuente }: { usuario: string; fuente: FuenteCatalogoRv }) {
  const c = useCatalogoRv(usuario, fuente);
  const estilo = useMemo(() => variablesCss(c.tema) as CSSProperties, [c.tema]);

  // El fondo del body es el suyo mientras está abierto: sin esto, al
  // estirar la página en el teléfono asomaba el de Lux.
  useEffect(() => {
    if (!c.perfil) return;
    const antes = document.body.style.background;
    document.body.style.background = c.tema.colores.fondo;
    return () => { document.body.style.background = antes; };
  }, [c.perfil, c.tema]);

  if (!c.perfilListo) {
    return <div className="rvc" style={estilo}><p className="rvc-cargando" role="status">Abriendo el catálogo</p></div>;
  }

  // Pausado o inexistente: sin nombrar a Lux.
  if (!c.perfil) {
    return (
      <div className="rvc" style={estilo}>
        <div className="rvc-interior rvc-vacio">
          <h1 className="rvc-vacio__titulo">Este catálogo no está disponible</h1>
          <p>Revisa el enlace, o pídele a quien te lo mandó que te lo envíe otra vez.</p>
        </div>
      </div>
    );
  }

  const Vista = PLANTILLA[c.tema.plantilla];
  return (
    <div className={`rvc rvc--${c.tema.plantilla}${c.resumen.piezas > 0 ? ' rvc--con-barra' : ''}`} style={estilo}>
      <Vista c={c} />
    </div>
  );
}
