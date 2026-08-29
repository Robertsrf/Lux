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

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
