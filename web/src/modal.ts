// 画面の上に出るシート（入力）の状態。重ねて開けるようにスタックで持つ。
// 大会の編集から「やること」を開いても、下の編集フォームの入力が消えない。
import { signal } from '@preact/signals';
import type { Contest, Ledger, Task } from './types';

export type ModalState =
  | { type: 'contest'; contest?: Contest }
  | { type: 'task'; contestId: string; task?: Task; markDone?: boolean; preset?: Partial<Task> }
  | { type: 'ledger-choose'; contestId?: string }
  | { type: 'receipt'; contestId?: string }
  | { type: 'car'; contestId?: string }
  | { type: 'settle'; from?: string; to?: string; amount?: number }
  | { type: 'ledger-detail'; ledger: Ledger };

export const modals = signal<ModalState[]>([]);
export const openModal = (s: ModalState) => { modals.value = [...modals.value, s]; };
/** 今いちばん上のシートを閉じる */
export const closeModal = () => { modals.value = modals.value.slice(0, -1); };
/** 今のシートを別のシートに差し替える（選択メニュー → 本体 など） */
export const replaceModal = (s: ModalState) => { modals.value = [...modals.value.slice(0, -1), s]; };
export const closeAllModals = () => { modals.value = []; };

// PIN入力はいちばん上に重ねる（フォームの入力を消さない）
export const pinReq = signal<{ message: string; resolve: (pin: string | null) => void } | null>(null);

const LAST_PAYER = 'ramuse.lastPayer';
export function lastPayer(fallback: string): string { try { return localStorage.getItem(LAST_PAYER) || fallback; } catch { return fallback; } }
export function rememberPayer(f: string) { try { localStorage.setItem(LAST_PAYER, f); } catch { /* noop */ } }
