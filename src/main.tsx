import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Solo los pesos que se usan: el telefono de la tienda es de gama baja.
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/latin-500.css';

import './estilos/tokens.css';
import './estilos/base.css';
import { App } from './App';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta el contenedor #raiz en index.html');

/*
  NADIE NOS METE EN UN MARCO.

  Otra pagina podria cargar el sistema dentro de un <iframe> invisible y
  hacer que el administrador, con su sesion abierta, toque sin saberlo
  "Fijar tasa" o "Retirar" (clickjacking). Lo normal es impedirlo con una
  cabecera, pero GitHub Pages no deja ponerlas y `frame-ancestors` no vale
  dentro de un <meta>. Asi que se mira aqui: dentro de un marco, el sistema
  no se dibuja y se abre en la ventana entera.
*/
const enUnMarco = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

if (enUnMarco) {
  try { window.top!.location.href = window.location.href; } catch { /* un marco con sandbox: se queda en blanco */ }
} else {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
