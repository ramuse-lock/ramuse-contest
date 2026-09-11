// 状態とキャッシュ。起動時は localStorage の前回データを即描画し、裏で最新を取る。
// 書き込みは楽観更新（先に画面へ反映→裏で送信→失敗なら戻してトースト）。
import { signal, computed } from '@preact/signals';
import { fetchBundle, fetchCalendar, APP_MODE, rpc } from './api';
import type { Bundle, CalEvent, Car, Contest, Destination, Ledger, Task } from './types';
import { todayStr, contestStatus, tasksOf, shareItems, sumItems, uid } from './model';

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
export const toast = signal<string | null>(null);
export function showToast(msg: string) {
  toast.value = msg;
  window.setTimeout(() => { if (toast.value === msg) toast.value = null; }, 2800);
}

export const families = computed(() => bundle.value?.families || ['Airi', 'Miha', 'Rinka']);
export const contests = computed(() => (bundle.value?.contests || []).filter((c) => c.コンテスト名));
export const tasks = computed(() => bundle.value?.tasks || []);
export const ledger = computed(() => bundle.value?.ledger || []);
export const destinations = computed(() => bundle.value?.destinations || []);
export const cars = computed(() => bundle.value?.cars || []);
export const settings = computed(() => bundle.value?.settings || {});

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
export async function ensureMonth(y: number, m: number): Promise<void> {
  const k = monthKey(y, m);
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

// ---------- 書き込み（楽観更新） ----------
function patch(fn: (b: Bundle) => Bundle) {
  if (!bundle.value) return;
  bundle.value = fn(bundle.value);
  save(`${KEY}.bundle`, bundle.value);
}
function upsertBy<T extends { ID: string }>(list: T[], items: T[]): T[] {
  const out = list.slice();
  items.forEach((it) => {
    const i = out.findIndex((x) => x.ID === it.ID);
    if (i >= 0) out[i] = it; else out.push(it);
  });
  return out;
}
async function mutate<T>(apply: (b: Bundle) => Bundle, send: () => Promise<T>, okMsg?: string): Promise<T> {
  const before = bundle.value;
  patch(apply);
  try {
    const r = await send();
    if (okMsg) showToast(okMsg);
    // サーバー側の正規化（負担JSONの再計算など）を反映するため、静かに再取得
    refresh();
    return r;
  } catch (e) {
    if (before) { bundle.value = before; save(`${KEY}.bundle`, before); }
    const msg = (e as Error).message || '保存できませんでした';
    showToast(msg === 'キャンセルしました' ? msg : `保存できませんでした：${msg}`);
    throw e;
  }
}

export function saveTasks(list: Task[]) {
  const norm = list.map((t) => ({ ...t, ID: t.ID || uid('t'), 期限日: t.当日 ? '' : t.期限日, 済日: t.済 ? (t.済日 || today.value) : '' }));
  return mutate(
    (b) => ({ ...b, tasks: upsertBy(b.tasks, norm) }),
    () => rpc<Task[]>('saveTasksV2', [norm]),
  ).then(() => norm);
}
export function deleteTask(id: string) {
  return mutate((b) => ({ ...b, tasks: b.tasks.filter((t) => t.ID !== id) }), () => rpc<boolean>('deleteTaskV2', [id]), '削除しました');
}
export function saveContest(c: Contest) {
  const norm = { ...c, ID: c.ID || uid('c'), ラウンド: c.ラウンド || '単発', 更新日時: new Date().toISOString() };
  return mutate((b) => ({ ...b, contests: upsertBy(b.contests, [norm]) }), () => rpc<Contest>('saveContestV2', [norm]), '保存しました').then(() => norm);
}
export function deleteContest(id: string) {
  return mutate(
    (b) => ({ ...b, contests: b.contests.filter((c) => c.ID !== id), tasks: b.tasks.filter((t) => t.大会ID !== id) }),
    () => rpc<boolean>('deleteContestV2', [id]), '削除しました');
}
export function saveLedger(l: Ledger) {
  const items = typeof l.明細JSON === 'string' ? [] : l.明細JSON;
  const norm: Ledger = { ...l, ID: l.ID || uid('l'), 合計: sumItems(items), 負担JSON: shareItems(items, families.value, l.支払者), 作成日時: l.作成日時 || new Date().toISOString() };
  return mutate((b) => ({ ...b, ledger: upsertBy(b.ledger || [], [norm]) }), () => rpc<Ledger>('saveLedgerV2', [norm]), '記録しました').then(() => norm);
}
export function deleteLedger(id: string) {
  return mutate((b) => ({ ...b, ledger: (b.ledger || []).filter((l) => l.ID !== id) }), () => rpc<boolean>('deleteLedgerV2', [id]), '削除しました');
}
export function saveDestination(d: Destination) {
  const norm = { ...d, ID: d.ID || uid('d') };
  return mutate((b) => ({ ...b, destinations: upsertBy(b.destinations || [], [norm]) }), () => rpc<Destination>('saveDestinationV2', [norm])).then(() => norm);
}
export function deleteDestination(id: string) {
  return mutate((b) => ({ ...b, destinations: (b.destinations || []).filter((d) => d.ID !== id) }), () => rpc<boolean>('deleteDestinationV2', [id]), '削除しました');
}
export function saveCars(list: Car[]) {
  return mutate((b) => ({ ...b, cars: list }), () => rpc<Car[]>('saveCarsV2', [list]), '保存しました');
}
export function saveSetting(key: string, value: string | number) {
  return mutate((b) => ({ ...b, settings: { ...b.settings, [key]: value } }), () => rpc('saveSettingV2', [key, value]));
}
