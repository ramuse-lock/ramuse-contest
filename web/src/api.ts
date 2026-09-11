// GAS 公開API との通信。読みも書きも JSONP（script注入）。
// script.google.com は別オリジンなので、既存の子供用アプリと同じ方式を踏襲する。
import type { Bundle, CalEvent } from './types';

export const EXEC_URL =
  'https://script.google.com/macros/s/AKfycbyvrQn4MX-Njz2HITaWAsddhHRdQA7zmw57F0PQe9WbvtlZFP1SA3FPYSqw5REfyuu-/exec';

declare const __APP_MODE__: 'adult' | 'kid';
export const APP_MODE: 'adult' | 'kid' = typeof __APP_MODE__ !== 'undefined' ? __APP_MODE__ : 'adult';
export const IS_KID = APP_MODE === 'kid';

let seq = 0;
export function jsonp<T>(params: Record<string, string | number>, timeoutMs = 25000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `_rmj${++seq}_${Date.now().toString(36)}`;
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const script = document.createElement('script');
    const w = window as unknown as Record<string, unknown>;
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
    function cleanup() {
      window.clearTimeout(timer);
      delete w[cb];
      script.remove();
    }
    w[cb] = (data: T & { error?: string }) => {
      cleanup();
      if (data && typeof data === 'object' && 'error' in data && data.error) reject(new Error(String(data.error)));
      else resolve(data);
    };
    script.onerror = () => { cleanup(); reject(new Error('network')); };
    script.src = `${EXEC_URL}?${qs}&callback=${cb}`;
    document.head.appendChild(script);
  });
}

export const fetchBundle = () => jsonp<Bundle>({ action: 'v2', mode: APP_MODE });
export const fetchCalendar = (year: number, month: number) =>
  jsonp<CalEvent[]>({ action: 'calendar', year, month });

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
    const res = await jsonp<{ ok: boolean; value?: T; error?: string }>({
      action: 'v2rpc', method, pin, args64: b64url(JSON.stringify(args)),
    });
    if (res.ok) { setPin(pin); return res.value as T; }
    if (/PIN/.test(res.error || '')) { setPin(''); pin = ''; message = 'PINが違います。もう一度入れてください。'; continue; }
    throw new RpcError(res.error || 'error');
  }
  throw new RpcError('PINが違います');
}
