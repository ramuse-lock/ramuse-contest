// 画面の上に出るシート（入力）の状態。views は modal.value をセットするだけ。
import { signal } from '@preact/signals';
import type { Contest, Ledger, Task } from './types';

export type ModalState =
  | { type: 'contest'; contest?: Contest }
  | { type: 'task'; contestId: string; task?: Task; markDone?: boolean }
  | { type: 'ledger-choose' }
  | { type: 'receipt'; ledger?: Ledger }
  | { type: 'car'; ledger?: Ledger }
  | { type: 'settle'; from?: string; to?: string; amount?: number }
  | { type: 'ledger-detail'; ledger: Ledger };

export const modal = signal<ModalState | null>(null);
// PIN入力は入力フォームの上に重ねる（フォームの状態を消さない）
export const pinReq = signal<{ message: string; resolve: (pin: string | null) => void } | null>(null);
export const closeModal = () => { modal.value = null; };

const LAST_PAYER = 'ramuse.lastPayer';
export function lastPayer(fallback: string): string { try { return localStorage.getItem(LAST_PAYER) || fallback; } catch { return fallback; } }
export function rememberPayer(f: string) { try { localStorage.setItem(LAST_PAYER, f); } catch { /* noop */ } }
