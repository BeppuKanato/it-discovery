# 仕分けの端末保存

[仕分け画面](sorting-ui.md) · [フロント構成](frontend-architecture.md) · [一括登録API](sorting-api.md)

## #14：順序を保つ端末保存

保存は仕分けだけが対象。ピン・一覧の気になる・既読に永続キューを戻さない。

PendingInterestBatchはbatchId（回のUUID v4）・revision（変更ごとの版）・articleIds（取り消しを反映した最終ID集合）だけを持つ。記事本文・カード順・見送り・位置・判断履歴は復元しない。空集合も最新版として書き、古い登録が復活しないようにする。

| 層 | 実装 | 役割 |
|---|---|---|
| VM | useSortingViewModel | 表示を先に進め、保存中・失敗を表示する。失敗後は判断と戻すを止める |
| Model | PendingInterestModel | 一回専用のID・版・最新集合。Promiseを順に実行し、失敗後は手動再試行まで後続保存を止める |
| 保存の契約 | PendingInterestStore | 読み出し・版付き保存・同じ内容の条件付き削除 |
| 外部接続 | IndexedDBPendingInterestStore | idbを使う。版の比較と更新・条件付き削除を各一つのトランザクションで行う |

```mermaid
flowchart TB
  Page[SortingPage] --> VM[仕分けVM]
  VM --> Pending[一回専用の保存Model]
  Pending --> Contract[PendingInterestStore]
  IDB[IndexedDB実装 / idb] -. 実装 .-> Contract
```

```mermaid
sequenceDiagram
  participant VM as 仕分けVM
  participant M as PendingInterestModel
  participant S as IndexedDB
  VM->>VM: 判断結果へ即時に置き換える
  VM->>M: update(最終ID集合)
  M->>M: 版を進め、先行書き込みの後ろへ追加
  M->>S: 旧版より新しい場合だけ保存
  S-->>M: トランザクション完了
  M-->>VM: 保存成功または失敗
  Note over VM,S: 失敗したら最新の手元の集合を保持し、明示的な再試行で保存する
```

古い版の遅延書き込みはDB側でも無視する。同じ版の異なる内容はエラー。成功確認時の削除は回ID・版・集合が全て一致した時だけ行い、新しい結果を消さない。

DB名はAPIの絶対URLごとに分ける。旧一覧操作の保存先は読み取り・送信・削除しない。idb 8.0.4を使用し、保存の確認にはfake-indexeddbを使う。実行時は書き込み要求の成功だけでなくtransaction.doneまで待つ。

## 限界と確認

端末保存完了前の強制終了、ブラウザの保存領域削除・容量不足までは保証しない。失敗時は未保存の可能性を表示する。終了処理は最新保存を待つ。前回の回は再開せず、保存した最終集合だけが次回の送信対象となる。

テストで、直列化、保存失敗後の停止と最新版の再試行、取り消し後の復元、旧版の後着、同版矛盾、条件付き削除、壊れた記録の検出、VMの停止と再開を確認する。

参照：[idb](https://github.com/jakearchibald/idb)（transaction.done）、[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) 。

## #15：終了時の固定・送信・完了解消

終了ボタンを押したら判断と戻すを止め、PendingInterestModel.flushで最後の端末保存を待つ。その版とID集合を固定してInterestBatchSyncModelへ渡す。完了画面の表示だけでは送らない。空集合なら結果照会もPUTもせず、対応する端末記録だけを条件付きで解消する。

```mermaid
sequenceDiagram
  participant V as 仕分けVM
  participant P as 端末保存Model
  participant S as 一括登録Model
  participant API as API
  V->>P: flushで最終保存を待つ
  P-->>V: 固定した回ID・版・最終ID集合
  V->>S: send
  S->>API: 回IDの結果を照会
  alt 結果あり
    API-->>S: 保存済みの同じ版・集合の結果
  else 未記録
    S->>API: 同じ回ID・版・集合をPUT
    API-->>S: saved・missingの結果
  end
  S-->>V: 確認結果
  Note over V,S: missingがあれば案内し、利用者の確認まで端末記録を残す
  V->>S: acknowledge
  S->>P: 回ID・版・集合が一致する記録だけ削除
```

一時エラーは1・2・4・8・16・30秒、以降30秒間隔で再試行する。オフライン通知中はタイマーを止め、復帰時に再開する。400・401・403・404（PUT）・409・422や不一致応答は自動再送を止め、記録を残して手動の復旧を待つ。結果照会の404は未記録の意味で、元の要求の失敗確定ではない。

サーバー成功後の端末削除失敗でも記録を残す。次の再試行は結果照会から行い、保存済みならPUTせず削除を再試行する。別版が端末に存在する場合は古い成功で削除しない。アプリ終了時は通信を中止し、端末の未送信結果は消さない。

## #16：起動時の復旧と日次開始

ApplicationStartupGateのVMが、ApplicationStartupModelへ所有権の取得→未送信復旧→日次判定を依頼する。通常画面はGateのslotに置き、readyになるまで一覧Pageも仕分けPageも作らない。Appはready時の候補の有無で画面を選ぶだけで、一覧固有の初回取得を開始しない。

```mermaid
flowchart TB
  Gate[StartupGate / View] --> VM[起動VM / 状態と再試行]
  VM --> M[ApplicationStartupModel]
  M --> Lease[Web Locksの所有権]
  M --> Store[端末の最終集合と日次日付]
  M --> Sync[共通の一括登録Model]
  M --> Sort[仕分け対象の取得Model]
```

```mermaid
sequenceDiagram
  participant V as 起動VM
  participant M as 起動Model
  participant Local as Web LocksとIndexedDB
  participant API as 一括登録API
  V->>M: 起動
  M->>Local: 同じAPIを使うタブの所有権を取得
  M->>Local: 未送信の最終集合を読む
  loop 残った回ごと
    M->>API: 結果照会・必要なら同じ要求をPUT
    API-->>V: Model経由で確認結果
    Note over V,Local: missingは利用者の確認後に解消する
    V->>M: acknowledge
    M->>Local: 対応する版だけ削除
  end
  V->>M: 日本時間の日次判定
  M->>Local: 当日判定済みか読む
  M-->>V: 未判定なら取得・日付保存した候補
  V->>V: readyとして通常画面を開放
```

一時失敗は終了時と同じ間隔で再試行し、オフライン中は止める。終了ボタンは通常操作を開放せず終了案内へ切り替え、通信とタイマーを止め、未送信を残す。Web Locks未対応・別タブの使用中・壊れた記録の読み出し失敗でも通常画面を出さない。所有権はPageの移動中も保持し、アプリ終了時に解放する。

恒久エラーは自動再送・自動破棄をせず、再試行または明示的な破棄を案内する。破棄には失われる登録の説明と確認ボタンを置き、対象の回ID・版・集合が一致する記録だけを消す。読み取れない未知の記録を一括消去する操作は用意しない。

日次は日本時間の午前0時で区切り、起動時だけ判定する。同日判定済みなら対象を再取得しない。0件も判定済みとして保存する。取得・日次記録が失敗したら自動開始せず手動開始を案内し、その日を成功と扱わない。候補があれば取得済みの同じカードをSortingPageへ渡して二重取得しない。カード位置・前回の履歴は復元しない。

IndexedDBはv2で日次metadataを追加し、v1の仕分け記録を維持する。日次日付もAPIの接続先ごとに分ける。
