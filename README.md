# IT Discovery

> 2026-10-20：一覧の永続再送を廃止し、ページ開始時の取得と保存成功後の状態確定へ整理しました。[フロントの構成](docs/frontend-architecture.md)と[一覧操作](docs/article-list-state.md)を参照してください。

IT記事・更新情報・動画・Podcast・リリース情報を集め、短い仕分けで「気になる」を選び、一覧から元の記事を読む個人向けアプリです。

SQLiteの保存基盤と、全記事・気になる一覧のAPI・スマホ向け画面を用意しています。20件ずつの追加読み込み、一覧の更新と再試行ができます。気になる・ピン・既読の直接保存・現在状態取得APIも追加しました。仕分け対象取得と気になるの一括登録・結果照会APIも追加しました。一覧の気になる・ピンはボタンの部分着色で保存中を示し、成功後に登録状態を確定します。元記事は別タブで開き、既読を裏で保存します。手動の仕分け・スワイプ・戻すまで利用できます。仕分けの仮選択は端末へ順序を守って保存します。終了時に一括登録し、残った未送信は起動時に復旧します。既定の5取得先を毎日05:00（日本時間）に収集し、保持期限と上限を見直します。

## 技術構成

| 項目 | 方針 |
|---|---|
| フロント | Vue＋TypeScript、ViteのSPA |
| API通信 | Axiosを使うApiClient |
| UI部品 | PrimeVue 4＋Auraを元にした共通テーマ |
| バックエンド | NestJS＋TypeScript |
| DB | SQLite（Drizzle ORM＋better-sqlite3） |
| バックエンド配置 | GCP Compute Engine上のDocker、DBはVMの永続ディスク |
| フロント配信 | バックエンドと分離。Vercel／Cloudflareの選定は未完了 |
| 端末の未送信登録 | IndexedDB＋idb |
| コード管理 | npm workspacesでweb・api・API共有型を分ける |

[技術構成とコード配置](docs/architecture.md)に、選定理由・クラス図との対応・開発とビルドの方針をまとめています。記事機能などのフォルダは実装予定で、今回の基盤では使うファイルだけを追加しています。

## 開発基盤を動かす

Node.js 24.15以上の24 LTS、npm 10以上で、リポジトリのルートから実行します。

```sh
npm ci
npm run dev
```

http://127.0.0.1:5173/ を開き、記事一覧を確認します。DBが空の場合は空一覧が表示されます。VueとNestは別プロセスで起動し、開発時のAPI通信はViteのプロキシを経由します。停止はCtrl+Cです。

```sh
npm run typecheck
npm run test
npm run build
npm run test:integration
```

PRの作成・更新とmainの更新でも、依存の新規導入から同じ確認を自動実行します。[CIの構成と確認対象](docs/ci.md)を参照してください。

[開発・設定・ビルド手順](docs/development.md)に、環境変数、接続先変更、各コマンド、コードを読む順序を記載しています。現在は記事一覧と気になる・ピン操作を確認できます。一覧ページの表示開始で取得し、起動時の一覧変更の再送は行いません。

## 設計資料

- [結合確認と残る確認](docs/integration-status.md)：HTTP・端末保存・DB再起動の再現コマンドと公開前の未確認事項。
- [公開構成の提案（未決定）](docs/hosting-policy.md)：配信・本人制限・費用・バックアップの具体案。
- [Dockerの起動・更新・停止](docs/docker.md)：永続volumeと再作成確認。

- [定期収集の構成](docs/collection-job.md)：時刻設定・失敗継続・重複防止・停止。
- [記事の保持と追加](docs/article-retention.md)：期限・上限・保護・transaction。

- [情報源の取得と変換](docs/source-adapters.md)：RSS・Atom・GitHub Releases、欠損・件数・失敗の扱い。

- [記事一覧APIの使い方と構成図](docs/article-list-api.md)：全記事・気になる一覧の取得条件、カーソル、応答JSON、実装した責務と処理順。
- [保存基盤の構成図](docs/storage-architecture.md)：PR #31で実装した責務・依存関係・記事登録の処理順。
- [SQLiteの作成とサンプル投入](docs/database.md)：DB保存先、マイグレーション、架空サンプル投入、保存処理の読み方。
- [開発基盤の起動と確認](docs/development.md)：設定例、起動・型チェック・テスト・ビルド手順。
- [技術構成とコード配置](docs/architecture.md)：採用技術、責任とファイルの対応、API共有型、開発・配置方針。
- [HTTP処理の配置と適用範囲](docs/http-structure.md)：Controller・補助処理の配置、共通設定とAPI別の適用一覧。
- [仕分けの端末保存](docs/sorting-persistence.md)：版付きの最終ID集合、保存失敗時の停止と再試行。
- [手動の仕分け画面](docs/sorting-ui.md)：最大10件、スワイプ、仮選択、複数回戻す、既読カードの次へ。端末保存・一括登録・起動時復旧に対応。
- [仕分け対象・一括登録API](docs/sorting-api.md)：最大10件の取得、最終ID集合の登録、途中削除と再送、構成図。
- [記事状態の変更・確認API](docs/article-state-api.md)：直接保存・現在状態の取得・既読日時・構成図。
- [フロントのMVVM＋Atomic Design](docs/frontend-architecture.md)：View・VM・Modelの責任、状態の持ち主、部品構成と操作別の読む順序。
- [元記事を開く・既読保存](docs/article-opening.md)：別タブへの遷移、既読の表示、保存失敗と手動再試行。
- [一覧の気になる・ピン操作](docs/article-list-state.md)：保存中の部分着色、操作制限、成功時の確定と失敗時の確認。
- [記事一覧画面の実装](docs/article-list-ui.md)：構成図、取得と再試行の流れ、画面例と確認結果。
- [画面構成の参照](docs/ui-reference.md)：採用した「サムネの中」の配置と、旧モックとの仕様の違い。
- [記事データと収集の方針](docs/data-policy.md)：識別・日時・20件のページング・デフォルト取得先・収集と保持の初期設定。
- [操作・同期・失敗時の方針](docs/operation-policy.md)：既読基準、仕分けの進行、端末保存・再送・失敗時の確定仕様。
- [アプリのルール](docs/rules.md)：用語、仕分け、気になる登録、既読、ピン止め、収集・更新、削除ルール、未決事項。
- [ユースケース](docs/use-cases.md)：利用者の目的と利用場面の区分。
- [状態遷移図](docs/state-transitions.md)：記事の状態・一回の仕分け・保持と削除。
- [仕分けのシーケンス図](docs/sequences.md)：仕分けの開始・手元での判断・端末保存・終了時の一括送信・次回起動時の再送・既読の非同期保存。
- [一覧のシーケンス図](docs/sequences-list.md)：分割取得・追加読み込み・更新、気になるとピンの保存中表示・成功後の確定、元記事を開く処理。
- [サーバーのシーケンス図](docs/sequences-server.md)：定期収集・共通形式への変換・追加と更新、期限と件数による削除、新規追加の停止と再開。
- [クラス図](docs/classes.md)：記事と未送信結果のデータ、アプリの操作・同期、サーバーの収集・保存・保持の分担とコードの流れ。
- [ユースケース図（SVG）](docs/diagrams/use-cases.svg) / [PlantUMLコード](docs/diagrams/use-cases.puml)

ルールは [docs/rules.md](docs/rules.md) を基準とします。未決事項を合意済みの仕様として扱わず、状態遷移図 → シーケンス図 → クラス図の順に設計を具体化します。

## 想定する使い方

1. サーバーが外部の情報源を定期収集し、記事データをDBに追加・更新する。
2. 起動時に端末の未送信登録があれば、保存成功を確認するまで通常操作を待機する。その後、起動時や一覧の更新操作でDBの最新内容を先頭から一定件数表示する。下までスクロールすると続きを追加取得する。
3. 毎日の初回起動時は対象があれば仕分けを自動開始する。その後も自由に開始できる。仕分けを開始すると、未読・気になる未登録・ピン止めなしの記事を、取得日時が新しい順に最大10件表示する。
4. カードで「気になる」登録または見送りを判断する。操作中は手元で処理し、登録結果を端末に残す。終了時にまとめてサーバーへ保存し、途中で閉じた場合は次の起動時に残っている登録を送る。カードから元記事を直接開くこともできる。
5. 気になる一覧・全記事一覧から、記事を開いたり登録やピン止めを変更したりする。登録・ピン操作はボタンの部分着色で保存中を示し、サーバーへの保存成功後に状態を確定する。

表示は日本語・スマホ向けを基本とし、カードのサムネイル領域内に中央揃えのタイトル、小さな説明、出典アイコン・サイト名を配置します。日付などは下に表示します。

## 開発の進め方

[開発Issue一覧・進行順序](https://github.com/BeppuKanato/it-discovery/issues/1)から各作業を辿れます。基本は1 Issue・1ブランチ・1 PRとし、ブランチ名は `docs/2-code-structure` のように種類・Issue番号・作業名を含めます。PRはレビュー後にマージします。[詳細](docs/architecture.md#ブランチとpr)

コミットは機能・変更目的ごとに分け、PR本文にコミットと確認ファイルを記載します。今後の実装時の方針は[AGENTS.md](AGENTS.md)を参照します。

## Issue・PRテンプレート

- [Issueを作成する](https://github.com/BeppuKanato/it-discovery/issues/new/choose)：目的・作業範囲・完了条件を入力する。[フォーム定義](.github/ISSUE_TEMPLATE/development.yml)
- [PRテンプレート](.github/pull_request_template.md)：変更内容・関連Issue・確認方法と結果・未解決点を記載する。新しいPRの作成時に本文へ表示される。

GitHubのWeb画面以外からIssueやPRを作成する場合も、テンプレートの項目に沿って本文を記載する。

## 情報源の調査スクリプト

[collect_samples.py](collect_samples.py) は、情報源から取得できるメタデータを確認するためのスクリプトです。本番アプリの収集処理や、仕分け・保存機能の実装ではありません。

### 現在の調査対象

| 情報源 | 対象 | 取得方法 |
|---|---|---|
| Zenn | 技術記事 | RSS |
| Cloudflare Changelog | 公式更新情報 | RSS |
| YouTube | Google Developersチャンネル | Atom |
| Podcast | Syntax | RSS |
| GitHub Releases | cloudflare/workers-sdk | API |

この表の5件を本番のデフォルト取得先として採用します。ユーザーが取得先を設定できる方針です。毎日午前5時（日本時間）、取得先ごとに最新最大50件を確認します。保持期間30日・全体上限10,000件を初期値とします。[詳細](docs/data-policy.md)。調査スクリプトの件数制限と本番の設定は別です。UIモックのサンプルとは、チャンネル・番組・リポジトリが異なる場合があります。

### ローカルで実行

Pythonが利用できる環境で実行します。

```sh
git clone https://github.com/BeppuKanato/it-discovery.git
cd it-discovery
python -m pip install requests feedparser
python collect_samples.py --limit 3
```

`--limit` は情報源ごとのサンプル件数で、1〜20件を指定できます。`--output` で保存先を変更できます。

```sh
python collect_samples.py --limit 5 --output data/samples
```

### Google Colabで実行

新しいノートブックで、次を実行します。

```python
!pip -q install requests feedparser
!git clone https://github.com/BeppuKanato/it-discovery.git
%cd it-discovery
!python collect_samples.py --limit 3
```

スクリプトだけアップロードして実行する場合は次のとおりです。

```python
!pip -q install requests feedparser
!python collect_samples.py --limit 3
```

### 実行結果

`data/samples/` に、情報源ごとのJSONと `summary.json` が出力されます。一つの情報源の取得に失敗しても、他の情報源の取得は続行します。Colabではファイル欄からJSONをダウンロードできます。

外部のフィードやAPIの仕様は変更されることがあります。調査結果を確認してから、本番の収集方式を決めます。

## 次の設計

- [ルールの未決事項](docs/rules.md#未決事項)を確認する。
- [状態遷移図](docs/state-transitions.md)と未決事項を確認する。
- [仕分け](docs/sequences.md)・[一覧](docs/sequences-list.md)・[サーバー](docs/sequences-server.md)の基本シーケンスと、設計案・未決事項を確認する。
- [技術構成](docs/architecture.md)に沿い、[開発Issue一覧](https://github.com/BeppuKanato/it-discovery/issues/1)の依存関係を確認して実装へ進む。

推薦方法・類似度・興味の推定は今回の設計範囲外です。後から推薦を追加できる構造を検討します。Vue・Nest・SQLite・バックエンドのCompute Engine配置は決定済みです。フロント配信先・VMの具体構成・本人用アクセス制限・バックアップ方法は未確定です。
