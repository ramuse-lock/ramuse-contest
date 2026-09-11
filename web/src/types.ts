// V2シートの行をそのまま表す型（キーは日本語ヘッダーと一致）
export type Fam = string;

export type TaskKind = 'entry' | 'music' | 'backup_cd' | 'entry_fee' | 'view_fee' | 'other';
export type LedgerKind = 'receipt' | 'car' | 'fee' | 'settle' | 'other';

export interface Doc { label: string; url: string }

export interface Contest {
  ID: string;
  コンテスト名: string;
  開催日: string; // YYYY-MM-DD
  会場: string;
  部門: string;
  ラウンド: string; // 単発 / 予選 / 決勝
  シリーズ名: string;
  決勝ステータス: string; // 進出未定 / 進出決定 / ''
  集合時間: string;
  開始時間: string;
  終了時間: string;
  出演順: number | string;
  総組数: number | string;
  URL: string;
  資料JSON: Doc[] | string;
  結果: string;
  結果詳細: string;
  キャンセル: boolean;
  メモ: string;
  更新日時: string;
}

export interface Task {
  ID: string;
  大会ID: string;
  種別: TaskKind;
  名前: string;
  期限日: string;
  当日: boolean;
  済: boolean;
  済日: string;
  単価?: number | string;
  数量?: number | string;
  台帳ID?: string;
  メモ: string;
  表示順: number | string;
}

export interface LedgerItem { label: string; amount: number; targets: string[] }

export interface Ledger {
  ID: string;
  日付: string;
  内容: string;
  種別: LedgerKind;
  合計: number;
  支払者: string;
  大会ID: string;
  明細JSON: LedgerItem[] | string;
  負担JSON: Record<string, number> | string;
  車JSON: Record<string, unknown> | string;
  メモ: string;
  作成日時: string;
}

export interface Destination { ID: string; 名前: string; 片道距離: number; 行き高速代: number; 帰り高速代: number; メモ: string }
export interface Car { 家族: string; 車名: string; 燃費: number }

export interface Balance {
  paid: Record<string, number>;
  owed: Record<string, number>;
  net: Record<string, number>;
  transfers: { from: string; to: string; amount: number }[];
}

export interface Bundle {
  mode: 'adult' | 'kid';
  families: string[];
  contests: Contest[];
  tasks: Task[];
  ledger?: Ledger[];
  destinations?: Destination[];
  cars?: Car[];
  settings: Record<string, string | number>;
  balance?: Balance;
  generatedAt: string;
}

export interface CalEvent {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD
  end?: string;
  isAllDay: boolean | string;
  startTime: string;
  location: string;
  color: string; // Google colorId
  isContest?: boolean | string;
  contestRowIndex?: number | string;
}
