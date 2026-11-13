import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// As telas 2D são carregadas sob demanda (React.lazy): a primeira abertura de cada uma no teste
// precisa compilar o módulo, então os findBy esperam um pouco mais que o padrão de 1 s.
configure({ asyncUtilTimeout: 5000 });

// jsdom não implementa matchMedia; o tema automático precisa dele.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => cleanup());
