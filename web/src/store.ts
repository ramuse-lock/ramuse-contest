// 状態とキャッシュ。起動時は localStorage の前回データを即描画し、裏で最新を取る。
import { signal, computed } from '@preact/signals';
import { fetchBundle, fetchCalendar, APP_MODE } from './api';
import type { Bundle, CalEvent } from './types';
import { todayStr, contestStatus, tasksOf } from './model';

const KEY = `ramuse.v2.${APP_MODE}`;

function load<T>(k: string): T | null {
  try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 容量超過など */ } }

export const bundle = signal<Bundle | null>(load<Bundle>(`${KEY}.bundle`));
export const calendar = signal<Record<string, CalEvent[]>>(load<Record<string, CalEvent[]>>(`${KEY}.calendar`) || {});
export const syncing = signal(false);
export const error = signal<string | null>(null);
export const lastSync = signal<string | null>(load<string>(`${KEY}.lastSync`));
export const today = signal(todayStr());

export const families = computed(() => bundle.value?.families || ['Airi', 'Miha', 'Rinka']);
export const contests = computed(() => (bundle.value?.contests || []).filter((c) => c.コンテスト名));
export const tasks = computed(() => bundle.value?.tasks || []);
export const ledger = computed(() => bundle.value?.ledger || []);

export const upcoming = computed(() =>
  contests.value
    .filter((c) => c.開催日 && c.開催日 >= today.value && !c.キャンセル)
    .sort((a, b) => (a.開催日 < b.開催日 ? -1 : 1)));
export const past = computed(() =>
  contests.value
    .filter((c) => c.開催日 && c.開催日 < today.value)
    .sort((a, b) => (a.開催日 > b.開催日 ? -1 : 1)));
export const statusOf = (id: string) => {
  const c = contests.value.find((x) => x.ID === id);
  return c ? contestStatus(c, tasksOf(tasks.value, id), today.value) : '完了';
};

export const monthKey = (y: number, m: number) => `${y}-${m < 10 ? '0' : ''}${m}`;

export async function refresh(): Promise<void> {
  if (syncing.value) return;
  syncing.value = true; error.value = null;
  try {
    const b = await fetchBundle();
    bundle.value = b;
    save(`${KEY}.bundle`, b);
    lastSync.value = new Date().toISOString();
    save(`${KEY}.lastSync`, lastSync.value);
  } catch (e) {
    error.value = (e as Error).message || 'error';
  } finally {
    syncing.value = false;
  }
}

const calInflight = new Set<string>();
export async function ensureMonth(y: number, m: number, force = false): Promise<void> {
  const k = monthKey(y, m);
  if (!force && calendar.value[k] && calendar.value[k].length >= 0 && !force) {
    // キャッシュあり → 裏で更新だけ
    if (calInflight.has(k)) return;
  }
  if (calInflight.has(k)) return;
  calInflight.add(k);
  try {
    const ev = await fetchCalendar(y, m);
    calendar.value = { ...calendar.value, [k]: Array.isArray(ev) ? ev : [] };
    save(`${KEY}.calendar`, calendar.value);
  } catch { /* オフライン等。キャッシュのまま */ } finally {
    calInflight.delete(k);
  }
}

// 起動時：今月と来月のカレンダーも温める
export function boot() {
  refresh();
  const d = new Date();
  ensureMonth(d.getFullYear(), d.getMonth() + 1);
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  ensureMonth(n.getFullYear(), n.getMonth() + 1);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      today.value = todayStr();
      const last = lastSync.value ? Date.parse(lastSync.value) : 0;
      if (Date.now() - last > 60_000) refresh();
    }
  });
}

// 日付 → その日のイベント（複数月にまたがる週表示のため）
export function eventsOn(date: string): CalEvent[] {
  const k = date.slice(0, 7);
  return (calendar.value[k] || []).filter((e) => e.start === date);
}
