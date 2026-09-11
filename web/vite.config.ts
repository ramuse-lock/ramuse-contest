import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// VITE_APP_MODE=adult | kid で2つの出力を作る（ソースは1本）。
// 出力先はリポジトリ直下（= ホーム画面のアイコンが開くURL）。
// 直下には Code.gs や docs/ もあるので emptyOutDir は使わず、assets/ だけ事前に消す。
export default defineConfig(() => {
  const mode = process.env.VITE_APP_MODE || 'adult';
  const outDir = process.env.VITE_OUT_DIR || (mode === 'kid' ? '../../ramuse-kid' : '..');
  return {
    base: './',
    plugins: [preact()],
    define: { __APP_MODE__: JSON.stringify(mode) },
    build: { target: 'es2019', sourcemap: false, outDir, emptyOutDir: false },
  };
});
