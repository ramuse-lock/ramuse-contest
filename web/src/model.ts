// 表示用の計算（純関数）。日付・自動ステータス・残高・カレンダー色
import type { Balance, CalEvent, Contest, Ledger, LedgerItem, Task } from './types';

export const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const pad = (n: number) => (n < 10 ? '0' : '') + n;
export function parseDate(s: string): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
export function addDays(s: string, n: number): string {
  const d = parseDate(s)!;
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function daysUntil(s: string, from = todayStr()): number {
  const a = parseDate(from), b = parseDate(s);
  if (!a || !b) return NaN;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
export function fmtMD(s: string): string { const d = parseDate(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ''; }
export function fmtDow(s: string): string { const d = parseDate(s); return d ? DOW[d.getDay()] : ''; }
export function fmtDay(s: string): number { const d = parseDate(s); return d ? d.getDate() : 0; }
export function fmtLong(s: string): string { const d = parseDate(s); return d ? `${d.getMonth() + 1}月${d.getDate()}日 ${DOW[d.getDay()]}` : ''; }
export function yen(n: number | string | undefined): string {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-¥' : '¥') + Math.abs(v).toLocaleString('ja-JP');
}
export function num(v: unknown): number { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n; }
export function bool(v: unknown): boolean { return v === true || v === 'true' || v === 'TRUE'; }
export function parseJson<T>(v: T | string, fallback: T): T {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v !== 'string') return v as T;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

// ---- 大会 ----
export type Status = 'エントリー予定' | '準備中' | '当日待ち' | '会計待ち' | '完了' | 'キャンセル';
export const MONEY_KINDS = ['entry_fee', 'view_fee'];

export function tasksOf(tasks: Task[], contestId: string): Task[] {
  return tasks.filter((t) => t.大会ID === contestId).sort((a, b) => num(a.表示順) - num(b.表示順));
}
export function contestStatus(c: Contest, tasks: Task[], today = todayStr()): Status {
  if (c.キャンセル) return 'キャンセル';
  const past = !!c.開催日 && c.開催日 < today;
  const open = tasks.filter((t) => !t.済);
  if (past) return open.some((t) => MONEY_KINDS.includes(t.種別)) ? '会計待ち' : '完了';
  const entry = tasks.find((t) => t.種別 === 'entry');
  if (entry && !entry.済) return 'エントリー予定';
  if (open.some((t) => !t.当日)) return '準備中';
  return open.length ? '当日待ち' : '当日待ち';
}
export function progress(tasks: Task[]): { done: number; total: number } {
  return { done: tasks.filter((t) => t.済).length, total: tasks.length };
}
export function nearestDeadline(tasks: Task[], today = todayStr()): Task | null {
  const open = tasks.filter((t) => !t.済 && !t.当日 && t.期限日 && t.期限日 >= today).sort((a, b) => (a.期限日 < b.期限日 ? -1 : 1));
  return open[0] || null;
}
export function roundClass(round: string): string {
  if (round === '決勝') return 'ty-final';
  if (round === '予選') return 'ty-qual';
  return 'ty-single';
}
export function roundLabel(round: string): string { return round || '単発'; }
export function taskIcon(t: Task): { icon: string; tile: string } {
  switch (t.種別) {
    case 'entry': return { icon: 'upload', tile: 't-blue' };
    case 'music': return { icon: 'music_note', tile: 't-blue' };
    case 'backup_cd': return { icon: 'album', tile: 't-violet' };
    case 'entry_fee': return { icon: t.当日 ? 'currency_yen' : 'payments', tile: t.当日 ? 't-violet' : 't-green' };
    case 'view_fee': return { icon: t.当日 ? 'currency_yen' : 'confirmation_number', tile: t.当日 ? 't-violet' : 't-green' };
    default: return { icon: 'task_alt', tile: 't-mu' };
  }
}
export function taskAmount(t: Task): number { return num(t.単価) * (num(t.数量) || 1); }
export function docsOf(c: Contest) { return parseJson(c.資料JSON, [] as { label: string; url: string }[]); }

// ---- 台帳 ----
export function itemsOf(l: Ledger): LedgerItem[] { return parseJson(l.明細JSON, [] as LedgerItem[]); }
export function owedOf(l: Ledger): Record<string, number> { return parseJson(l.負担JSON, {} as Record<string, number>); }
export function computeBalance(ledger: Ledger[], fams: string[]): Balance {
  const paid: Record<string, number> = {}, owed: Record<string, number> = {};
  fams.forEach((f) => { paid[f] = 0; owed[f] = 0; });
  ledger.forEach((l) => {
    if (paid[l.支払者] !== undefined) paid[l.支払者] += num(l.合計);
    const o = owedOf(l);
    fams.forEach((f) => { owed[f] += num(o[f]); });
  });
  const net: Record<string, number> = {};
  fams.forEach((f) => { net[f] = paid[f] - owed[f]; });
  return { paid, owed, net, transfers: transfersOf(net, fams) };
}
export function transfersOf(net: Record<string, number>, fams: string[]) {
  const cr = fams.filter((f) => net[f] > 0).map((f) => ({ name: f, amt: net[f] })).sort((a, b) => b.amt - a.amt);
  const db = fams.filter((f) => net[f] < 0).map((f) => ({ name: f, amt: -net[f] })).sort((a, b) => b.amt - a.amt);
  const out: { from: string; to: string; amount: number }[] = [];
  let ci = 0, di = 0;
  while (ci < cr.length && di < db.length) {
    const amt = Math.floor(Math.min(cr[ci].amt, db[di].amt));
    if (amt > 0) out.push({ from: db[di].name, to: cr[ci].name, amount: amt });
    cr[ci].amt -= amt; db[di].amt -= amt;
    if (cr[ci].amt < 1) ci++;
    if (db[di].amt < 1) di++;
  }
  return out;
}
export function ledgerIcon(l: Ledger): { icon: string; tile: string } {
  switch (l.種別) {
    case 'car': return { icon: 'directions_car', tile: 't-teal' };
    case 'fee': return { icon: 'emoji_events', tile: 't-acc' };
    case 'settle': return { icon: 'swap_horiz', tile: 't-green' };
    case 'receipt': {
      const s = l.内容;
      if (/衣装|ハット|インナー/.test(s)) return { icon: 'checkroom', tile: 't-orange' };
      if (/チケット|観覧/.test(s)) return { icon: 'local_activity', tile: 't-blue' };
      return { icon: 'restaurant', tile: 't-red' };
    }
    default: return { icon: 'receipt_long', tile: 't-mu' };
  }
}

// ---- 家族の表示 ----
export const FAM_JA: Record<string, string> = { Airi: 'アイリ', Miha: 'ミハ', Rinka: 'リンカ' };
export const famJa = (f: string) => FAM_JA[f] || f;
export const famClass = (f: string) => (f === 'Airi' ? 'a' : f === 'Miha' ? 'm' : 'r');

// ---- カレンダー ----
// Googleカレンダーの colorId → 系統色。大会=金／自主練=橙／レッスン・イベント=青緑／お知らせ・締切=緑／打ち上げ等=紫／無色=灰
export type EvColor = 'acc' | 'orange' | 'teal' | 'green' | 'violet' | 'mu' | 'blue';
export function evColor(e: CalEvent): EvColor {
  if (bool(e.isContest)) return 'acc';
  switch (String(e.color)) {
    case '5': return 'acc';
    case '6': return 'orange';
    case '7': return 'teal';
    case '10': case '2': return 'green';
    case '3': return 'violet';
    case '9': case '1': return 'blue';
    default: return 'mu';
  }
}
export const isNotice = (e: CalEvent) => ['10', '2'].indexOf(String(e.color)) >= 0 && !bool(e.isContest);
export function evTime(e: CalEvent): string { return bool(e.isAllDay) ? '終日' : (e.startTime || ''); }
// 「13-15:30 HOUSE：Maje.」のようにタイトル先頭の時間表記は、時刻列と重複するので落とす
export function evTitle(e: CalEvent): string {
  return String(e.title || '').replace(/^\s*\d{1,2}(:\d{2})?\s*[-−–〜~]\s*\d{1,2}(:\d{2})?\s*/, '').trim() || String(e.title || '');
}

// ---- 書き込み用の補助（V2.gs と同じ計算） ----
export const r10 = (n: number) => Math.round(n / 10) * 10;
let uidSeq = 0;
export function uid(prefix: string): string {
  uidSeq++;
  return `${prefix}_${Date.now().toString(36)}_${uidSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
export function sumItems(items: LedgerItem[]): number { return items.reduce((s, it) => s + num(it.amount), 0); }
// 明細ごとに等分・10円丸め。端数は支払者（対象に含まれなければ先頭）が持つ＝ゼロサム
export function shareItems(items: LedgerItem[], fams: string[], payer: string): Record<string, number> {
  const owed: Record<string, number> = {};
  fams.forEach((f) => { owed[f] = 0; });
  items.forEach((it) => {
    const tg = (it.targets || []).filter((t) => owed[t] !== undefined);
    if (!tg.length) return;
    const amt = Math.round(num(it.amount));
    const per = r10(amt / tg.length);
    let sum = 0;
    tg.forEach((t) => { owed[t] += per; sum += per; });
    const rest = amt - sum;
    if (rest !== 0) owed[tg.includes(payer) ? payer : tg[0]] += rest;
  });
  return owed;
}
export const KIND_LABEL: Record<string, string> = { entry: 'エントリー', music: '音源', backup_cd: '持ち物', entry_fee: 'エントリー費', view_fee: '観覧費', other: 'その他' };

// ---- 参加の確からしさ ----
// confirmed = 出ることが決まっている ／ unentered = まだエントリーしていない（予定として入れてあるだけ）
// tentative = 決勝だが進出が未定（枠を空けてあるだけ）
export type Participation = 'confirmed' | 'unentered' | 'tentative';
export function participation(c: Contest, ts: Task[]): Participation {
  if (c.ラウンド === '決勝' && String(c.決勝ステータス || '') !== '進出決定') return 'tentative';
  const entry = ts.find((t) => t.種別 === 'entry');
  if (entry && !entry.済) return 'unentered';
  return 'confirmed';
}
export const PARTICIPATION_LABEL: Record<Participation, string> = { confirmed: '', unentered: '未エントリー', tentative: '進出待ち' };

// 結果を残したか。入賞・優勝・予選通過はどれも同じ重さ（予選通過＝上位に入って決勝へ進んだということ）。
// 差がつくのは「出場のみ」との間だけ
export const hasResult = (c: Contest) => /入賞|優勝|通過|進出/.test(String(c.結果 || ''));
export const isChampion = (c: Contest) => /優勝/.test(String(c.結果 || ''));

// 日付タイルの見た目。
// これからの大会＝種別の色（単発=青／予選=紫／決勝=金）。何の大会かが知りたい時期だから。
// 終わった大会＝色を塗らず、結果の印だけ。入賞・予選通過はメダル、優勝は縁で囲んでトロフィー。
export function dtileClass(c: Contest, past: boolean): string {
  if (!past) return c.ラウンド === '決勝' ? 'dt-final' : c.ラウンド === '予選' ? 'dt-qual' : 'dt-single';
  if (isChampion(c)) return 'dt-plain dt-champ';
  return hasResult(c) ? 'dt-plain dt-medal' : 'dt-plain';
}

// 「5位／35組」。順位が主役なので先に出す
export function placement(c: Contest): { rank: string; of: string } {
  const n = Number(c.総組数) || 0;
  const detail = String(c.結果詳細 || '').trim();
  return { rank: detail || '—', of: n ? `／${n}組` : '' };
}
