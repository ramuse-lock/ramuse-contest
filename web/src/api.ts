// GAS 公開API との通信。
// 本命は fetch（CORS が * で開いている）。fetch が使えない環境のために JSONP（script注入）を残す。
//
// なぜ fetch を本命にしたか：
//   script 注入は Google のログインCookieを一緒に送るため、端末が Google にログインしていると
//   アカウント選択画面（HTML）へ飛ばされ、JSONPのコールバックが永久に来ない＝タイムアウトになる。
//   fetch なら credentials:'omit' でCookieを送らないので、誰の端末でも匿名アクセスとして通る。
import type { Bundle, CalEvent } from './types';

export const EXEC_URL =
  'https://script.google.com/macros/s/AKfycbyvrQn4MX-Njz2HITaWAsddhHRdQA7zmw57F0PQe9WbvtlZFP1SA3FPYSqw5REfyuu-/exec';

declare const __APP_MODE__: 'adult' | 'kid';
export const APP_MODE: 'adult' | 'kid' = typeof __APP_MODE__ !== 'undefined' ? __APP_MODE__ : 'adult';
export const IS_KID = APP_MODE === 'kid';

// GASは初回起動（コールドスタート）に時間がかかる。モバイル回線だと25秒では足りないことがある
const TIMEOUT_MS = 45000;

type Params = Record<string, string | number>;

function qs(params: Params): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function viaFetch<T>(params: Params, timeoutMs: number): Promise<T> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${EXEC_URL}?${qs(params)}`, {
      method: 'GET', credentials: 'omit', redirect: 'follow', signal: ac.signal,
    });
    if (!res.ok) throw new Error(`サーバー応答 ${res.status}`);
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

let seq = 0;
function viaJsonp<T>(params: Params, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `_rmj${++seq}_${Date.now().toString(36)}`;
    const script = document.createElement('script');
    const w = window as unknown as Record<string, unknown>;
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('応答がありません')); }, timeoutMs);
    function cleanup() {
      window.clearTimeout(timer);
      delete w[cb];
      script.remove();
    }
    w[cb] = (data: T) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('接続できません')); };
    script.src = `${EXEC_URL}?${qs(params)}&callback=${cb}`;
    document.head.appendChild(script);
  });
}

// fetch を試し、ダメなら JSONP に落とす。どちらも生の応答をそのまま返す（error判定は呼び出し側）
export async function call<T>(params: Params): Promise<T> {
  try {
    return await viaFetch<T>(params, TIMEOUT_MS);
  } catch (e) {
    const reason = describe(e as Error);
    try {
      return await viaJsonp<T>(params, TIMEOUT_MS);
    } catch (e2) {
      throw new Error(`${reason} / ${(e2 as Error).message}`);
    }
  }
}

// 画面に出す用に、ブラウザ既定の英語メッセージを読める日本語へ寄せる
function describe(e: Error): string {
  if (e.name === 'AbortError') return '時間切れ';
  const m = e.message || '';
  if (/Failed to fetch|Load failed|NetworkError/i.test(m)) return 'サーバーに届きません';
  return m || '不明なエラー';
}

function unwrap<T>(data: T & { error?: string }): T {
  if (data && typeof data === 'object' && data.error) throw new Error(String(data.error));
  return data;
}

export const fetchBundle = () => call<Bundle>({ action: 'v2', mode: APP_MODE, t: Date.now() }).then(unwrap);
export const fetchCalendar = (year: number, month: number) =>
  call<CalEvent[]>({ action: 'calendar', year, month, t: Date.now() }).then(unwrap);

// ---- PIN ----
const PIN_KEY = 'ramuse.pin';
export function getPin(): string { try { return localStorage.getItem(PIN_KEY) || ''; } catch { return ''; } }
export function setPin(pin: string) { try { if (pin) localStorage.setItem(PIN_KEY, pin); else localStorage.removeItem(PIN_KEY); } catch { /* noop */ } }

// PIN入力を求めるUIは app 側で登録する（循環参照を避ける）
let pinPrompter: ((message: string) => Promise<string | null>) | null = null;
export function registerPinPrompter(fn: (message: string) => Promise<string | null>) { pinPrompter = fn; }

export class RpcError extends Error {}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 書き込みRPC。PINが無ければ入力を促し、違えば1回だけ聞き直す。
export async function rpc<T>(method: string, args: unknown[]): Promise<T> {
  if (IS_KID) throw new RpcError('子供用アプリからは変更できません');
  let pin = getPin();
  let message = '変更を保存するにはPINが必要です。設定シートの「大人用PIN」の4桁を入れてください。';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!pin) {
      if (!pinPrompter) throw new RpcError('PINが必要です');
      const entered = await pinPrompter(message);
      if (!entered) throw new RpcError('キャンセルしました');
      pin = entered;
    }
    const res = await call<{ ok: boolean; value?: T; error?: string }>({
      action: 'v2rpc', method, pin, args64: b64url(JSON.stringify(args)), t: Date.now(),
    });
    if (res.ok) { setPin(pin); return res.value as T; }
    if (/PIN/.test(res.error || '')) { setPin(''); pin = ''; message = 'PINが違います。もう一度入れてください。'; continue; }
    throw new RpcError(res.error || 'error');
  }
  throw new RpcError('PINが違います');
}
