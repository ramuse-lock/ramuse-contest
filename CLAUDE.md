# RAMUSE コンテスト管理アプリ — 開発・デプロイガイド

## アーキテクチャ

| リポジトリ | 役割 | 配信方法 |
|---|---|---|
| `ramuse-deploy`（このリポジトリ） | 親（管理者）用アプリ + GAS バックエンド | GAS Web アプリとして配信（iframe） |
| `ramuse-kid` | 子供用アプリ（閲覧専用） | GitHub Pages で配信 |

- GAS プロジェクトは1つ（Kids）: 親アプリの HTML 配信 + 子供用 JSONP API を兼務
- 子供用は金額関連 UI を CSS で非表示にしている（`/* ── 閲覧専用モード（kid版） ── */`）

---

## デプロイ手順

### 親アプリ（gas-app.html / Code.gs）を編集したとき

編集後は必ず以下の3ステップをすべて完了させること：

```bash
# 1. GAS に反映（HEAD）
clasp push

# 2. 本番デプロイを更新（バージョン付き）
clasp deploy --deploymentId AKfycbyvrQn4MX-Njz2HITaWAsddhHRdQA7zmw57F0PQe9WbvtlZFP1SA3FPYSqw5REfyuu-

# 3. GitHub にコミット・プッシュ
git add <ファイル名> && git commit -m "..." && git push
```

> **注意**: `clasp push` だけでは本番に反映されない。必ず `clasp deploy` まで実行すること。

### 子供用アプリ（ramuse-kid/index.html）も合わせて変更が必要なとき

ステータスロジック・結果バッジ・表示仕様など、両アプリに共通する変更は **ramuse-kid も必ず同時に対応** すること：

```bash
cd /Users/chisato/ramuse-kid
git add index.html && git commit -m "..." && git push
```

---

## 変更対象別まとめ

| 変更対象 | 作業リポジトリ | コマンド |
|---|---|---|
| 親アプリ HTML または GAS バックエンド | `ramuse-deploy` | `clasp push` → `clasp deploy` → `git push` |
| 子供用アプリ HTML のみ | `ramuse-kid` | `git push`（GAS には触らない） |
| ステータスロジック・バッジ・結果表示など共通仕様 | **両方** | ramuse-deploy: 上記3ステップ / ramuse-kid: `git push` |

---

## 主要ファイル

| ファイル | 説明 |
|---|---|
| `gas-app.html` | 親アプリのメイン HTML（GAS から配信） |
| `Code.gs` | GAS バックエンド（スプレッドシート読み書き・カレンダー連携） |
| `Setup.gs` | 初期設定用スクリプト |
| `/Users/chisato/ramuse-kid/index.html` | 子供用アプリのメイン HTML（GitHub Pages） |

---

## ステータスフロー（calcAutoStatus）

```
エントリー予定 → 準備中 → 当日待ち → 会計待ち → 完了
                                   ↑            ↑
                              大会前・当日対応あり  大会後・未払いあり
```

| ステータス | 条件 |
|---|---|
| エントリー予定 | エントリー未提出 |
| 準備中 | 事前提出物が残っている、または事前振込が未払い |
| 当日待ち | 提出物はOK・当日CD持参 or 当日払いあり（大会前） |
| 会計待ち | 大会後かつ未払いあり |
| 完了 | すべて完了 |
| キャンセル | 手動設定 |
