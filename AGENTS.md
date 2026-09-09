# RAMUSE（大人用アプリ・GAS）— 案件ノート

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

