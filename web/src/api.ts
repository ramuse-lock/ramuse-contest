// GAS 公開API との通信。読みは JSONP（script注入）。
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
