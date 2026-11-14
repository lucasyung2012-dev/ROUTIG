import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PwaPrompt } from './app/PwaPrompt';
import './styles/index.css';
import { captureDropboxReturn } from './services/dropbox';

// Volta do login do Dropbox (?code=…): guarda o código e abre Configurações, Conta e sincronização.
captureDropboxReturn();

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

createRoot(root).render(
  <StrictMode>
    <App extra={<PwaPrompt />} />
  </StrictMode>,
);
