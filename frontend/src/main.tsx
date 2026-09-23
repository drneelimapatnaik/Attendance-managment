/**
 * Entry point. Self-hosted fonts are imported here so the packaged mobile and
 * desktop apps render correctly with no network connection.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/plus-jakarta-sans';
import 'material-symbols/outlined.css';
import './styles/index.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
