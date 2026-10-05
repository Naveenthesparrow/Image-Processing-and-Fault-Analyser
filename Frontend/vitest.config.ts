import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Provide stubs for import.meta.env so settings.ts doesn't blow up in tests
    env: {
      VITE_GEMINI_API_KEY: 'test-key',
      VITE_GEMINI_MODEL: 'gemini-2.5-flash',
    },
  },
});
