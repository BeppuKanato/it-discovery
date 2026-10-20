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
