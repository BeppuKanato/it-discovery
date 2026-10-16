# SQLiteの作成・保存・サンプル投入

[READMEに戻る](../README.md) · [保存構成の図](storage-architecture.md) · [データ方針](data-policy.md) · [開発手順](development.md)

Issue #6で保存基盤を追加した。[一覧取得API](article-list-api.md)はIssue #7で追加した。一覧画面はIssue #10、[状態変更API](article-state-api.md)はIssue #8で追加した。本番収集・保持期限による削除ジョブは後続Issueで実装する。

## 初期DBを作る

Node.js 24.15以上の24 LTSで、リポジトリのルートから実行する。

```sh
npm ci
npm run db:migrate -w @it-discovery/api
```

初期DB・適用履歴・保持設定・デフォルト取得先5件を作る。既定の保存先は `apps/api/data/it-discovery.db`。Nestの通常起動時にも未適用のSQLを適用し、未登録の初期設定だけを追加する。再実行で既存記事や変更済み設定を消さない。適用できなければ起動を失敗させる。

`apps/api/.env.example` を `.env` にコピーして `DATABASE_PATH` を変更できる。npm workspaceコマンドの作業ディレクトリはapps/apiなので、相対パスもそこが基準になる。例：本番は永続ボリューム内の絶対パス `/var/lib/it-discovery/it-discovery.db`。DB本体とWALなどはGit管理しない。WAL・外部キー制約を有効化し、ロック待ちは5秒に設定する。

## 架空のサンプル記事を入れる

```sh
npm run db:seed -w @it-discovery/api
```

各デフォルト取得先に、共通形式の架空記事を一件ずつ追加する。URLはexample.comの確認用で、本番記事や調査スクリプトの取得結果ではない。再実行は同じ5件を更新し、取得日時・既読・気になる・ピンを維持する。既存記事を削除するコマンドではない。開発用DBでのみ実行する。

外部通信は行わない。投入したサンプルは全記事一覧から確認できる。

## 構造を変更する

1. `apps/api/src/infrastructure/database/schema.ts` を編集する。
2. 次のコマンドでSQLとスナップショットを生成する。
3. `apps/api/drizzle/` のSQLをレビューし、既存データを維持できるか確認する。
4. 開発用DBへ適用して検証し、スキーマ・SQL・メタデータを同じコミットに含める。

```sh
npm run db:generate -w @it-discovery/api
npm run db:migrate -w @it-discovery/api
```

生成済みマイグレーションを書き換えて履歴を改変せず、追加のSQLで変更する。本番の更新前にはバックアップを取る。稼働中に直接db:generateやスキーマのpushを実行する運用にはしない。

ビルド後の起動・コマンドでは `apps/api/drizzle/` も必要になる。コンテナ化するIssue #22ではdistと一緒に配布する。本番で開発依存を省いても `node dist/commands/database.js migrate` をapps/apiから実行できる。サンプル投入は本番では行わない。

## コードを読む順序

| ファイル | 役割 |
|---|---|
| `src/articles/services/article.service.ts` | 記事の検証・識別・登録更新の手順 |
| `src/articles/repositories/article.repository.ts` | 記事の検索・保存・トランザクションの約束 |
| `src/articles/repositories/sqlite-article.repository.ts` | Drizzleによる記事と状態の保存 |
| `src/articles/repositories/article.mapper.ts` | DBの行から照合用項目を除き記事形式へ変換 |
| `src/settings/services/settings.service.ts` | 設定の検証と未登録の初期値の追加判断 |
| `src/settings/repositories/settings.repository.ts` | 設定の取得・保存の約束 |
| `src/settings/repositories/sqlite-settings.repository.ts` | 取得先と保持・収集設定の保存 |
| `src/settings/settings.module.ts` | 設定ServiceとSQLite実装を接続し初期化 |
| `src/infrastructure/database/database.service.ts` | 接続・SQL適用・終了時の切断 |
| `src/infrastructure/database/schema.ts` | 取得先・記事・状態・設定のテーブルと制約 |
| `src/commands/database.ts` | 初期DB作成・架空サンプル投入の入口 |

記事の照合は取得元＋外部ID、IDなしは取得元＋URL完全一致。IDとURLはキーの種類を分ける。Serviceが識別条件を作り、検索から保存までを一つの短いトランザクションで進める。新規記事には初期状態も追加し、再取得はタイトル・概要・著者だけを更新する。最初の取得日時・URL・掲載元の日時・利用者状態は維持する。状態更新は指定項目だけを保存し、HTTP経由の変更と再送判定は[状態変更API](article-state-api.md)のArticleStateServiceが担当する。

DB内部の記事IDは単調増加する整数とし、クラス図の論理的な識別子を具体化した。日時はUTCのUnixミリ秒で保存し、RepositoryではDateとして扱う。記事削除時には対応する状態も削除される。取得先は同じendpointを重複登録できず、記事がある取得先の削除は外部キー制約で拒否する。無効化はenabledで行える。

## 操作結果の保存

Issue #8でarticle_state_operations表を追加した。状態変更と処理結果を一つのトランザクションで保存し、同じ操作IDの再送は再実行しない。記事への外部キーを付けず、記事削除後も結果を保持する。既存DBへは追加マイグレーションを適用する。初期仕様では操作結果の自動削除を行わない。

## 検証

```sh
npm run typecheck
npm run test
npm run build
```

APIのDBテストは一時フォルダに実際のSQLiteファイルを作り、再接続・再マイグレーション、取得日時と状態の維持、照合キー、外部キー、記事と状態の保存のロールバック、設定の維持を確認する。本番DBやネットワークには依存しない。

better-sqlite3はネイティブモジュールなので、別OSへnode_modulesをコピーせず、その環境でnpm ciを実行する。Docker/Linuxの確認はIssue #22で行う。
