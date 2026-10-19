import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Espace de travail npm : React peut exister en deux copies (racine et
// dossier de l'app). On utilise celle que charge @testing-library/react, pour
// que composants et outils de test partagent la même instance.
const fromTestingLibrary = createRequire(createRequire(import.meta.url).resolve('@testing-library/react'));
const reactDir = (name: string) => dirname(fromTestingLibrary.resolve(`${name}/package.json`));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      react: reactDir('react'),
      'react-dom': reactDir('react-dom'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
