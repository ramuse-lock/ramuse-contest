import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// VITE_APP_MODE=adult | kid で2つの出力を作る（ソースは1本）
export default defineConfig(() => ({
  base: './',
  plugins: [preact()],
  define: {
    __APP_MODE__: JSON.stringify(process.env.VITE_APP_MODE || 'adult'),
  },
  build: { target: 'es2019', sourcemap: false },
}));
