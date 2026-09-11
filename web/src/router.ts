// hash ルーター（app.tsx と views の循環参照を避けるため独立ファイル）
import { signal } from '@preact/signals';

export const route = signal(location.hash.replace(/^#/, '') || '/');
window.addEventListener('hashchange', () => {
  route.value = location.hash.replace(/^#/, '') || '/';
  window.scrollTo(0, 0);
});
export const go = (path: string) => { location.hash = path; };
