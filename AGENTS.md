# このリポジトリでの作業

## コミットの粒度

- 1コミットは、1つの機能または1つの変更目的にする。利用者がコミット単位でレビューできる大きさに分ける。
- 例：UIライブラリの導入、接続確認APIの実装、Axiosの通信処理、接続確認画面の実装、開発資料の更新。
- 依存の追加と対応するpackage-lock.jsonは同じコミットに含める。
- 各コミットの時点で型チェックやビルドができる構成を保つ。必要な検証は変更範囲に合わせて行う。
- コミット名は「feat(web): 気になる登録ボタンを実装する」のように、対象と目的を具体的に書く。
- 公開済みコミットは保持し、追加の修正も目的ごとのコミットにする。
- PR本文に、各コミットの目的と主な確認ファイルを記載する。大きなIssueでも1つのコミットへまとめない。

## 説明コメントの方針

- 読み手がVue・TypeScript・Nestの構文を学びながらレビューすることを想定し、日本語の説明コメントを充実させる。コードの書き方を簡略化する代わりに、役割・理由・データの流れを説明する。
- 関数の目的に加え、Vueのref・computed・watch・ライフサイクル・template ref・props・slot・イベントなどは、その場所で何のために使うかを説明する。
- 非同期処理、古い応答の破棄、状態を保持する理由、ブラウザAPIの監視と解除など、構文だけでは意図が分からない箇所にコメントを置く。
- TypeScriptの型指定・型の絞り込みなども、読み取りに重要な場合は説明する。各行の言い換えを繰り返さず、まとまりごとの説明にする。
- フロントのComposableはVueの状態・操作をまとめる関数であり、バックエンドのHTTP Controllerとは異なる。既存フォルダ名だけを理由に同じ役割だと説明しない。
- コメントだけの変更でも型チェック等で構文を確認し、実際の動作と説明を一致させる。

## UIの実装

- 共通のUI部品はPrimeVue 4のテーマ付きコンポーネントを使う。必要な部品を使用箇所でimportする。
- アプリ共通のテーマはapps/web/src/app/ui-theme.tsで管理する。
- 色や共通部品の外観はテーマ設定で調整し、画面固有の配置はVueのstyle scopedに置く。共通CSSは基本設定に留める。
- 動作ルールはdocs/rules.mdを基準とし、UIライブラリの導入で変更しない。

## 責務と説明の方針

- 機能を最上位にまとめる。DB接続などの共通基盤はinfrastructureに置く。特定の機能のルールは、その機能が持つ。
- Nestの機能内はcontrollers・services・repositories・modelsで役割を表す。Nestのcontrollers直下はHTTP入口の*.controller.tsだけにする。補助処理はcontrollers/formatters・pipes・filters、テストはcontrollers/testsへ分ける。Repositoryの抽象と具体実装はrepositoriesにまとめる。必要なフォルダだけ作る。
- FormatterはHTTP入出力の形式変換を行う。カーソルのエンコード・デコードなど双方で使う変換もformattersに置く。Serviceからは参照しない。
- 機能固有のPipe・Filter・Interceptorは対象Controllerまたはメソッド・引数で適用を明示する。Moduleや隠れた登録経由で一部のControllerへ選択的に適用しない。
- 全Controller共通のHTTP部品が必要になった場合だけinfrastructure/http配下へ置き、main.tsの一か所でグローバル登録する。登録と適用範囲を資料へ記載し、Controllerごとの隠れた除外や条件分岐を作らない。部品の種類は役割で選び、共通だからという理由だけでMiddlewareへ変えない。
- このController配置の規約はNestのバックエンド向け。VueのComposableをHTTP Controllerと同じ規約へ合わせない。
- PipeとServiceなどが共有する入力検証関数は、機能内のvalidatorsに置く。modelsは型・エラー・データの意味や状態の判定を定義する場所とし、今回のassertArticleId・操作入力の検証はvalidatorsへ分ける。検証を呼ぶ場所は変更せず、HTTP固有の表記検査と変換はPipeに置く。
- Serviceが入力の共通条件・アプリの判断・処理手順を担当し、検索・保存はrepositories内のRepositoryの抽象へ頼む。
- Repositoryの具体実装はDB操作とDB向けの形式変換を担当する。記事や設定の共通検証をDB実装ごとに重複させない。
- 各Moduleは利用側へServiceを公開する。具体的なRepositoryの参照は、機能内の実装、組み立て部分、テストに留める。
- SQLiteの同期トランザクションに外部通信や非同期処理を入れない。検索から保存まで必要な整合性を守る。
- オニオンへの全面的な分割や、未実装の機能の抽象を先に大量作成しない。具体的な複雑さに応じて分割する。
- 実装した範囲のアーキテクチャを図と簡潔な日本語で説明する。コードの依存関係と実行順序は別図にする。
- PRには説明図へのリンクと、機能・変更目的ごとのコミットおよび確認ファイルを載せる。

実装例は[保存基盤の構成図](docs/storage-architecture.md)を参照する。

## フロントの設計

- MVVM＋Atomic Designを採用する。機能を先に分け、その中をviews・view-models・modelsで分ける。共通の通信・端末保存はinfrastructureへ置く。
- Viewは描画・DOM・ブラウザイベントの受け渡しを担当する。タッチ情報は座標などの値に変換してViewModelへ渡す。ジェスチャーの状態・方向・距離・成立判定はmodelsの名前を付けた部品が持ち、ViewModelが操作の結果を処理へつなぐ。TouchEventやDOMをModelへ渡さない。Pageが子のemitとViewModelの操作を結び、子に業務処理を持たせない。
- ViewModelはページ固有の状態・computedによる表示用データ・操作窓口を持つ。共通の記事状態はPinia Storeへ集め、同じ記事状態をページごとに重複保持しない。
- ModelはStoreと同期Serviceなどを含む。Storeは値と状態遷移、同期Serviceは端末保存・送信・再送の手順を担当する。Viewを参照しない。
- 共有同期Serviceはappで一度組み立てる。Pageの終了で共通の送信処理を止めず、アプリ終了時に解放する。
- PrimeVueの基本部品をAtomsとして使う。名前を合わせるだけのラッパーや空フォルダは作らない。Moleculeは小さなUI機能、Organismは画面内のまとまり、Templateは配置、PageはViewModelとの接続を担当する。
- 辞書は用途に応じてMap・Recordを使う。動的キーや一部だけ存在するキーはMap、固定キーで同じ値型の必須項目はRecordを基本にする。項目ごとに型が違うデータはinterfaceなどで表す。省略可能な辞書をPartial<Record<...>>で表す構造を増やさない。
- 構成変更時は[フロントの構成図](docs/frontend-architecture.md)を更新する。依存関係・部品構成・実行順序は別図にし、StoreとViewModelの状態の持ち主を明示する。
