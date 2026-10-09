# 技術構成とコードの配置

更新日：2026-10-09

[READMEに戻る](../README.md) · [クラス図](classes.md) · [ルール](rules.md) · [画面構成の参照](ui-reference.md) · [開発一覧](https://github.com/BeppuKanato/it-discovery/issues/1)

## この資料の位置付け

Issue #2で、合意した技術選定とクラス図を実際のコード配置へ対応付けた。Issue #5でVue・Nest・共有型・Axiosの疎通確認基盤を追加した。[起動・設定・ビルド手順](development.md)を参照する。以下の配置には、後続Issueで実装するファイルも含む。

利用者はコードの読みやすさと役割の分かりやすさを優先する。画面、操作の進行、通信、保存を分け、クラス図の全クラスをそのまま実装することは求めない。操作ルールや具体値の未決事項は、この資料で確定しない。

## 合意した構成

| 対象 | 選択 | 理由・範囲 |
|---|---|---|
| フロント | Vue＋TypeScriptのSPA | 画面を部品化し、仕分けの表示をブラウザ内で即時に切り替える |
| バックエンド | NestJS＋TypeScript | Module・Controller・Serviceで役割を揃える |
| DB | SQLite | 個人利用の初期構成として、1台で記事と状態を保存する |
| バックエンド配置 | GCP Compute Engine上のDocker | VMとアプリの運用を学び、SQLiteと定期収集を同じVMで動かす |
| DB保存領域 | VMの永続ディスク | コンテナの削除・再作成と切り離してDBファイルを保存する |
| 定期収集 | 起動中のNestで実行 | 画面の起動・更新とは独立して情報源を確認する |
| フロント配信 | バックエンドと分離 | 配信先はVercel／Cloudflareを候補にIssue #23で選ぶ |

ブラウザはフロント配信先からHTML・CSS・JavaScriptを取得し、ブラウザ内のVueがNestのAPIへ直接通信する。本番は別の配信元になるため、許可するフロントの配信元を設定する。CORSは認証ではなく、本人用アクセス制限はIssue #23・#24で別途用意する。

VMの地域・サイズ・ディスク容量・IP・HTTPS・ドメイン・バックアップ先は未決。月1,000円は目安であり保証ではない。具体構成と合計費用はIssue #23で確認する。VMが停止するとAPIと定期収集は停止するが、永続ディスクのDBが停止だけで消えるわけではない。

## 今回選ぶ実装上の道具

| 対象 | 採用方針 | 使い方と判断理由 |
|---|---|---|
| フロントの記法 | Single File Component＋Composition API、script setup | template・script・styleを同じ部品で読める。TypeScriptを使う |
| フロントのビルド | Vite | Vueを開発し、配布用の静的ファイルを生成する |
| UI部品 | PrimeVue 4のStyled Mode＋Auraを元にしたテーマ | 共通部品を使用箇所でimportし、色と外観をテーマ設定に集める。画面固有の配置はscoped CSSで扱う |
| 画面の経路 | Vue Router | 全記事・気になる・仕分けの経路を管理する。途中遷移の可否はIssue #4で決める |
| 共有する表示状態 | Pinia | 起動状態と記事の表示状態を管理する。画面内だけの状態はref／computedに留める |
| HTTP通信 | Axiosを使うApiClient | axios.createでベースURL・タイムアウトを揃え、JSON変換とエラー整理をApiClientに集める。各画面で通信を直接書かない |
| 端末の未送信保存 | IndexedDB＋idb | 非同期の端末保存をPromiseで扱い、PendingInterestStoreの実装内に閉じ込める |
| サーバーのDB操作 | Drizzle ORM＋better-sqlite3 | テーブル定義・検索・更新をTypeScriptで読み、SQLiteファイルを直接使う |
| DB構造の変更 | Drizzle KitでSQLマイグレーションを生成・レビューして適用 | データを消さず変更履歴を管理する。DB本体はGitに入れない |
| HTTP入力検証 | NestのValidationPipe＋class-validator／class-transformer | HTTP境界で入力を検証し、Serviceへ不正値を渡さない |
| 定期実行 | @nestjs/schedule | CollectionJobを設定した間隔で呼ぶ |
| パッケージ管理 | npm workspaces | 1つのリポジトリにweb・api・共有型を置き、ルートで依存を管理する |
| 動作確認 | webはVitest、apiはJest | 仕分けの履歴・通信順・SQLiteの保護と保存を、それぞれ適した範囲で確認する |

これらは実装開始用の選択。Issue #5の基盤ではVue 3.5・Vite 8・Nest 12・Axios 1・TypeScript 5.9を選び、package-lock.jsonに固定した。Node.js 24.15以上の24 LTSを使う。最低要件はNest CLIの間接依存とJestからNest 12のES Modulesを読む互換性も含めている。Pinia・Vue Router・DB・idb・定期実行は、利用する機能のIssueで追加する。サーバーのHTTPアダプターはNest標準のExpressを初期構成とし、Fastifyへの変更は必要が出てから検討する。

better-sqlite3のDB処理は同期であり、Promiseに包むだけでは処理中の待ち時間は消えない。個人利用・短いDB処理を前提に選び、外部取得はトランザクションの外で行う。件数削除などの長い処理が問題になった場合に分離を検討する。ネイティブモジュールの互換性はDockerのLinux環境でも確認し、ホストのnode_modulesをイメージへ持ち込まない。

Axiosの共通インスタンスはApiClient内で生成し、画面側には記事取得・状態変更など目的別の関数を公開する。共通処理は通信設定とエラー整理に留め、登録順・再試行・未送信同期はMutationCoordinatorとInterestResultSyncが管理する。Interceptorへ業務処理を集めない。

Drizzle ORMはテーブル定義と検索・更新をTypeScriptで表す層、better-sqlite3はそのSQLをSQLiteで実行するドライバーである。アプリのDB処理はRepositoryからDrizzleを呼び、Drizzleがbetter-sqlite3を使ってDBファイルへ読み書きする。IndexedDBはブラウザ内の保存先、idbはそのAPIをPromiseで扱えるようにする小さなライブラリである。

## リポジトリの配置

機能のまとまりを優先し、必要なファイルを各Issueで追加する。空のクラスを先に大量作成しない。

```text
apps/
  web/
    src/
      app/                         # main、ルーター、サービスの組み立て
      components/
        ArticleCard.vue             # 共通カード
        SourceBadge.vue             # 出典の表示
      features/
        startup/useStartup.ts
        list/
          ArticleListPage.vue
          useArticleList.ts
        sorting/
          SortingPage.vue
          useSorting.ts
          sorting-session.ts
      stores/
        article-state.store.ts
        startup.store.ts
      services/
        mutation-coordinator.ts
        article-opening.service.ts
        interest-result-sync.ts
      infrastructure/
        api/api-client.ts
        storage/
          pending-interest.store.ts
          indexeddb-pending-interest.store.ts
  api/
    src/
      main.ts
      app.module.ts
      articles/
        articles.module.ts
        articles-http.controller.ts
        article.service.ts
        dto/                       # HTTP入力の検証・変換
        domain/
          article.ts
          article-state.ts
          article.repository.ts    # Repositoryの契約・DIトークン
        persistence/sqlite-article.repository.ts
      collection/
        collection.module.ts
        collection.job.ts
        article-normalizer.ts
        adapters/
          source-adapter.ts
          rss-atom.adapter.ts
          github-releases.adapter.ts
      retention/
        retention.module.ts
        retention.service.ts
      database/
        database.module.ts
        schema.ts
      config/                      # 環境変数・取得先・保持設定
    drizzle/                       # SQLマイグレーション
packages/
  contracts/src/                   # HTTPの要求・応答の共有型
infra/
  docker/                          # Dockerfile・起動設定
docs/
  architecture.md
  ui-reference.md
```

認証方式・バックアップ方法は未選定なので、ここで具体的な認証クラスや保存先SDKを固定しない。設定を扱う場所は示すが、テーブル分割、取得先設定のDB化、カラム、APIの経路とエラーコードはIssue #3・#4・#6で具体化する。

## クラス図からコードへの対応

フロントのControllerは「画面操作を進める役割」の呼称。Vueではuse〜というcomposableへ対応させる。NestのControllerは「HTTPの入口」であり、同名・同責任にしない。

| クラス図の責任 | 実装予定の場所 | 担当すること |
|---|---|---|
| SourceConfig・RetentionSettings | api/src/config/ | 取得先と保持設定を読み、必要な値を渡す |
| Article | api/src/articles/domain/article.ts | サーバー内部の記事データを表す |
| ArticleState | api/src/articles/domain/article-state.ts | 既読・仕分け対象・保護条件を判定する |
| ArticlePage | packages/contracts/src/ | 記事と対応状態・続き位置をJSONの型として表す |
| PendingInterestBatch | webの保存契約とinfrastructure/storage/ | 端末内のID集合と版を表す。通信形式とは別に扱う |
| StartupCoordinator | web/src/features/startup/useStartup.ts | 同期して通常操作を開放する |
| ListController | web/src/features/list/useArticleList.ts | 一覧取得・更新・追加と操作の進行を担当する |
| SortingController | web/src/features/sorting/useSorting.ts | 対象取得・手元の判断・保存依頼を進める |
| SortingSession・SortingDecision | web/src/features/sorting/sorting-session.ts | その回のカード・判断履歴・取り消しを扱う |
| MutationCoordinator | web/src/services/mutation-coordinator.ts | 一覧の保存順と確定・不明結果を管理する |
| ArticleOpeningService | web/src/services/article-opening.service.ts | 外部を開き、既読の保存を依頼する |
| InterestResultSync | web/src/services/interest-result-sync.ts | 途中保存・終了送信・起動時再送を担当する |
| PendingInterestStore | webの保存契約、IndexedDB実装 | 未送信結果を読み書きする |
| ApiClient | web/src/infrastructure/api/api-client.ts | AxiosでNestのAPIを呼ぶ |
| HTTPの入口（図では省略） | api/src/articles/articles-http.controller.ts | 入力検証・Service呼び出し・HTTP応答を担当する |
| ArticleService | api/src/articles/article.service.ts | 一覧・仕分け対象・登録・既読の処理を担当する |
| ArticleRepository | api/src/articles/domain/article.repository.ts | DB操作の契約を定義する |
| ArticleRepositoryのSQLite実装 | api/src/articles/persistence/sqlite-article.repository.ts | Drizzleで検索・保存・保持処理を実行する |
| CollectionJob | api/src/collection/collection.job.ts | 定期収集を一回進める |
| SourceAdapter | api/src/collection/adapters/source-adapter.ts | 情報源から取得する共通の契約を定義する |
| RssAtomAdapter | api/src/collection/adapters/rss-atom.adapter.ts | RSS・Atomを取得する |
| ApiSourceAdapter | api/src/collection/adapters/github-releases.adapter.ts | 初期対象のGitHub ReleasesをAPIで取得する |
| ArticleNormalizer | api/src/collection/article-normalizer.ts | 共通形式と照合キーへ変換する |
| RetentionService | api/src/retention/retention.service.ts | 保護・期限・件数から保持を判断する |

画面は描画と入力受付、composableは操作の進行、Serviceは通信・保存の調整を担当する。一覧と仕分けで共通に表示する記事状態はPiniaのID別状態を使い、サーバー確定値と未確定の表示変更を区別する。ページのID列・カーソル・取得世代は一覧側、その回の履歴はSortingSession側に置く。

SortingSessionはVue・Axios・IndexedDBに依存しない純粋な処理にする。useSortingが操作後の表示用状態をref等へ反映する。Piniaに同じ履歴を重複して保存したり、SortingSessionを次回起動で復元したりしない。

Vueのサービスはappで組み立ててcomposableに渡す。NestのServiceとRepositoryはModuleのproviderで接続する。TypeScriptのinterfaceは実行時に存在しないため、Repositoryを差し替えるDIには明示したトークンを使う。ORMとHTTPデコレーターをドメイン処理へ持ち込まない。

## APIの型と境界

packages/contractsには、画面とAPIで共有する要求・応答のTypeScript型だけを置く。Nest・Vue・Drizzleや、サーバー内部のクラス・DBスキーマは含めない。両アプリは依存パッケージとして参照し、他アプリのsrcを直接importしない。

HTTPでは日時をISO形式の文字列、集合を配列に変換する。ブラウザ側のSetやサーバー側のDateインスタンスを、そのままJSONで共有できると扱わない。表示用データには出典の表示名・アイコンなど必要な情報を含め、サーバーの取得URLや秘密情報を含めない。

共有型は実行時の検証を保証しない。HTTP入口のDTOとValidationPipeで検証し、契約型との食い違いを型チェックとAPIのテストで確認する。batchIdやrevisionをAPIにも送るか、部分成功・削除済みID・再送の応答形式はIssue #4・#9で決める。端末の版とサーバーの保存状態を同一視しない。

## 読む順序と処理の例

| 操作 | コードを辿る順序 |
|---|---|
| 一覧を見る | ArticleListPage → useArticleList → ApiClient → ArticlesHttpController → ArticleService → SQLiteArticleRepository |
| 一覧で気になるを変える | useArticleList → 表示状態の更新 → MutationCoordinator → ApiClient → HTTP入口 → ArticleService → Repository |
| スワイプ・戻す | SortingPage → useSorting → SortingSession → InterestResultSyncの端末保存。毎回のサーバー要求はない |
| 仕分けを終了する | useSorting → 最終端末保存の確認 → InterestResultSync → ApiClient → ArticleServiceの一括登録 |
| 起動する | useStartup → InterestResultSync → 未送信結果の確認・送信 → 成功後に通常操作 |
| 定期収集する | @nestjs/schedule → CollectionJob → SourceAdapter → ArticleNormalizer → 既存更新またはRetentionService → Repository |

非同期送信は画面の応答を待たせないための仕組みであり、ブラウザを閉じても必ず続く保証ではない。仕分けの端末保存・再送は既存ルールを維持し、一覧操作や既読にも適用するかはIssue #4で決める。

## 開発・ビルド・配置の方針

- ルートにworkspacesとpackage-lock.jsonを置き、共有型を先にビルドしてから各アプリをビルドする。共有型は宣言ファイルだけを生成し、両アプリからimport typeで参照する。
- 開発時はViteとNestを別プロセスで起動する。Viteの/apiプロキシでNestへ接続する。
- ApiClientは設定されたAPIベースURLを使う。開発時は/api、本番はGCPのAPI URLに/apiを付けた値を想定する。実際の経路はAPI実装Issueで確定する。
- 本番のwebはViteのdistを選定した配信先へ配置する。SPAの直接アクセスもindex.htmlへ戻せる設定を用意する。
- apiは共有型とNestをビルドし、Dockerで起動する。NestからVueの画面は配信しない。DBのパスは環境変数で指定し、本番は/data/app.dbなど永続領域の配下にする。
- マイグレーションは更新時に単一の実行主体から適用する。具体的なコマンド・起動順・切り戻しはIssue #6・#22で実装する。
- DB、node_modules、ビルド生成物、秘密情報をGitに入れない。SQLマイグレーションと秘密を除いた設定例はGitで管理する。
- Issue #5で起動・ビルド・型チェックのコマンドを追加した。詳細は[開発手順](development.md)を参照する。DB操作・収集・Docker・本番配置のコマンドはまだ含まない。

## ブランチとPR

基本は1 Issue・1ブランチ・1 PR。ブランチ名は種類／Issue番号-短い英語の作業名とする。

```text
docs/2-code-structure
chore/5-app-bootstrap
feat/7-article-list-api
```

mainからブランチを作り、依存PRが必要ならマージ後のmainを基点にする。PR本文はテンプレートに沿い、完了ならCloses #番号、一部対応ならRefs #番号を使う。PRは利用者のレビュー後にマージする。ブランチ名だけではIssueと関連付かない。

Issue #1は開発全体の管理用なので、Issueを発行しただけでは閉じない。関連作業の完了に合わせて進行を更新する。

コミットは1つの機能または変更目的ごとに分ける。例えば「ライブラリ導入」「通信処理」「画面への適用」「資料更新」を分け、各コミットで動く構成を保つ。依存とlockfileは同じコミットに含める。PR本文には各コミットの目的と主な確認ファイルを記載する。今後の作業指示は[AGENTS.md](../AGENTS.md)にも記録する。

## 後続Issueで決めること

| Issue | 残る判断 |
|---|---|
| #3 | 取得日時・識別・ページング・本番取得先・設定値・DBの競合と保存単位 |
| #4 | 外部サイトの成功判定、仕分け中の操作、端末保存失敗、削除済み記事、部分成功、一覧・既読の再送 |
| #6 | DBのテーブル・索引・実マイグレーションとDB依存の互換性 |
| #23・#24 | フロント配信先、VM詳細、本人用アクセス制限、HTTPS・CORS・費用 |
| #27 | バックアップ先・頻度・世代数・復元方法 |

## 選定時の参照

- [VueのSingle File Component](https://vuejs.org/guide/scaling-up/sfc.html)
- [PrimeVue 4のテーマ](https://v4.primevue.org/theming/styled/)
- [Piniaの概要](https://pinia.vuejs.org/introduction)
- [Viteの本番ビルド](https://vite.dev/guide/build)
- [DrizzleのSQLite対応](https://orm.drizzle.team/docs/get-started-sqlite)
- [Axios：共通インスタンス](https://axios-http.com/docs/instance)
- [idb：IndexedDBのPromiseラッパー](https://github.com/jakearchibald/idb)
- [NestのValidationPipe](https://docs.nestjs.com/techniques/validation)
- [Nestの定期実行](https://docs.nestjs.com/techniques/task-scheduling)
