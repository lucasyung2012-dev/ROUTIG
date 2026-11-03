import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PwaPrompt } from './app/PwaPrompt';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

createRoot(root).render(
  <StrictMode>
    <App extra={<PwaPrompt />} />
  </StrictMode>,
);
