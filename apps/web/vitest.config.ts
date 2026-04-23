import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Config de Vitest para @pila/web.
 * Solo tests de funciones puras (lib/**). No testamos Server Actions ni
 * componentes React por ahora — cuando se necesite, se agrega @testing-library
 * y jsdom.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules/**', '.next/**'],
    reporters: 'default',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
