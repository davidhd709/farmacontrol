import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// findBy*/waitFor terminan apenas se cumple la condición; esto es solo el tope. El de 1 s por
// defecto es un tiempo fijo que la suite en paralelo y con carga llega a superar (testTimeout: 20 s).
configure({ asyncUtilTimeout: 10000 });

afterEach(() => {
  cleanup();
});
