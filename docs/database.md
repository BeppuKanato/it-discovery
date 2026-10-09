# SQLiteの作成・保存・サンプル投入

[READMEに戻る](../README.md) · [データ方針](data-policy.md) · [開発手順](development.md)

Issue #6で保存基盤を追加した。記事API・一覧画面・本番収集・保持期限による削除ジョブは後続Issueで実装する。

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

外部通信は行わない。現在の画面は接続確認のみなので、サンプルを入れても記事は画面には表示されない。

## 構造を変更する

1. `apps/api/src/database/schema.ts` を編集する。
2. 次のコマンドでSQLとスナップショットを生成する。
3. `apps/api/drizzle/` のSQLをレビューし、既存データを維持できるか確認する。
4. 開発用DBへ適用して検証し、スキーマ・SQL・メタデータを同じコミットに含める。

```sh
npm run db:generate -w @it-discovery/api
npm run db:migrate -w @it-discovery/api
```

生成済みマイグレーションを書き換えて履歴を改変せず、追加のSQLで変更する。本番の更新前にはバックアップを取る。稼働中に直接db:generateやスキーマのpushを実行する運用にはしない。

ビルド後の起動・コマンドでは `apps/api/drizzle/` も必要になる。コンテナ化するIssue #22ではdistと一緒に配布する。本番で開発依存を省いても `node dist/database/commands.js migrate` をapps/apiから実行できる。サンプル投入は本番では行わない。

## コードを読む順序

| ファイル | 役割 |
|---|---|
| `src/database/schema.ts` | 取得先・記事・状態・設定のテーブルと制約 |
| `src/database/database.service.ts` | ファイルの接続・SQL適用・保持設定の初期化・終了時の切断 |
| `src/articles/domain/article.repository.ts` | 記事の保存・取得・状態更新の契約 |
| `src/articles/persistence/sqlite-article.repository.ts` | Drizzleによる記事と状態の保存 |
| `src/config/sqlite-config.repository.ts` | 取得先と保持・収集設定の保存 |
| `src/config/storage-config.module.ts` | デフォルト取得先の初期化 |
| `src/database/commands.ts` | 初期DB作成・架空サンプル投入の入口 |

記事の照合は取得元＋外部ID、IDなしは取得元＋URL完全一致。IDとURLはキーの種類を分ける。記事と初期状態の追加を同じ短いトランザクションで行い、再取得は内容だけを更新する。状態更新は指定項目だけを更新する保存処理であり、HTTP APIや再送順序の仕様はここでは実装しない。

DB内部の記事IDは単調増加する整数とし、クラス図の論理的な識別子を具体化した。日時はUTCのUnixミリ秒で保存し、RepositoryではDateとして扱う。記事削除時には対応する状態も削除される。取得先は同じendpointを重複登録できず、記事がある取得先の削除は外部キー制約で拒否する。無効化はenabledで行える。

## 検証

```sh
npm run typecheck
npm run test
npm run build
```

APIのDBテストは一時フォルダに実際のSQLiteファイルを作り、再接続・再マイグレーション、取得日時と状態の維持、照合キー、外部キー、記事と状態の保存のロールバック、設定の維持を確認する。本番DBやネットワークには依存しない。

better-sqlite3はネイティブモジュールなので、別OSへnode_modulesをコピーせず、その環境でnpm ciを実行する。Docker/Linuxの確認はIssue #22で行う。
