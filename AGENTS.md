# RAMUSE（大人用アプリ・GAS）— 案件ノート

ステータス：先方作業待ち（GASエディタで migrateV2Dry→migrateV2Run を実行してもらう）。本番デプロイ@45済み（action=v2稼働・新シート待ち）。実行後→exec?action=v2 で残高検証→フェーズ2（フロント骨格）へ。待機中はフェーズ2を進めてよい

## この案件は何か

RAMUSEのコンテスト管理アプリ（大人用）。GAS Webアプリとして配信し、子供用アプリ`../ramuse-kid`と共有スプレッドシートで連携する。

## 正本とアカウント

- 大人用正本：このリポジトリの`main`
- 子供用正本：`/Users/chisato/personal/ramuse/ramuse-kid`
- GitHubはRAMUSE専用の`ramuse-lock`アカウントを使用
- GASもRAMUSE用Googleアカウントを使用。`clasp`の認証先に注意する
- 管理シート類：`../shared/`
- 詳細な構成、ステータス仕様、従来のデプロイガイド：`docs/DEPLOYMENT_AND_HISTORY.md`

## デプロイの原則

1. 変更と動作を確認する
2. Gitへコミットし、GitHubへpushする
3. `clasp push`でGASへ反映する
4. バージョン付きの`clasp deploy`を実行する
5. 本番表示を確認する

GitHubに存在しない状態を先に本番へ出さない。`clasp push`だけでは本番更新にならない。

## 共通仕様を変更するとき

- ステータスロジック、結果バッジ、表示仕様などは大人用と子供用を同時に確認する
- 子供用は閲覧専用で、金額関連UIを非表示にしている
- 子供用だけを変更した場合、GASには触らず子供用リポジトリをコミット・pushする

## 既知の課題

- GASのクロスオリジンiframe制約によるバナー／Safari UI問題
- 根本解決はAPI化だが未着手

## 次にやること

- 次回変更時に大人用・子供用の影響範囲を先に判定する
- デプロイ前後でGitHubと本番の状態が一致することを確認する


## UI刷新プロジェクト（2026-09-11開始）

- 目的：機能の解釈は維持しつつ、提出物の形式統一・軽量化・タブ/ソートの整理・証券アプリ級のUI品質へ
- 現状棚卸しとヒアリング質問：`docs/2026-09-11_UI刷新ヒアリング.md`（回答をここに転記したものが正式要件）
- 進め方：ヒアリング回答 → 情報設計の確定 → 画面モック案（複数）→ 合意後に実装。**合意前に実装しない**
- 子供用（../ramuse-kid）＝別アプリのまま、ソースは大人用1本からビルド（合意済み）
- デザイン確定＝A2「エア」（ガラス・Apple調・Material Symbols）。モック＝`docs/mockups/a-brushup.html`（A2）・`a2-home-kids.html`・`a2-forms.html`
- データ移行設計・実装計画＝`docs/2026-09-11_データ移行設計.md`
- 金の使い方の原則：面で塗らない。光・ラベル・アイコンの小面積だけ
- v2データ層＝`V2.gs`（新シート：大会v2／やること／台帳／行き先／車／設定）。`serveApi` の `action=v2&mode=adult|kid`。変換ロジックは純関数で `node docs/tools/v2-dryrun.mjs <contests.json> <trips.json> [today]` により実データで検証可（JSONは `exec?action=init` と `exec?action=rpc&method=getAllTripData` の返り）
- 台帳の丸め原則：明細ごとに等分10円丸め、端数は支払者が持つ（ゼロサム）。残高＝支払合計−負担合計
