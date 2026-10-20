# シーケンス図：一覧の取得と状態変更

更新日：2026-10-20

[README](../README.md) · [フロントの構成](frontend-architecture.md) · [一覧操作](article-list-state.md) · [状態変更API](article-state-api.md)

一覧はページ表示開始で取得する。ピン・気になるは保存中の部分着色と操作制限を使い、成功後に登録状態を確定する。操作ID・永続保存・自動再送・起動同期の旧方式は撤去した。仕分けの端末保存・起動統合は後続Issue。

## 一覧取得

```mermaid
sequenceDiagram
  participant V as ArticleListPage
  participant VM as 一覧VM
  participant M as 一覧Model
  participant API as ApiClientとサーバー
  V->>VM: onMounted → initialize
  VM->>VM: 初回取得中にする
  VM->>M: getPage(all)
  M->>API: GET articles / kind・limit20
  API-->>M: articles・hasMore・nextCursor
  M-->>VM: ページの取得結果
  VM->>VM: 記事・カーソル・取得状態を更新
  Note over V,VM: スケルトンから記事へ表示を切り替える
```

フィルター変更時は旧通信の中止と要求番号の更新を行い、新しい条件で先頭から取得する。末尾の240px手前でmoreイベントを受け、VMが現在のフィルターとカーソルで追加取得する。取得中の重複要求は出さない。成功時だけカーソルを進め、記事IDの重複を除く。

初回・更新・追加が失敗したら再試行ボタン。更新・追加の失敗は既存記事を保持する。取得日時・記事IDの降順で並べる。一覧更新はDBを読み直す処理で、外部情報源の収集を開始しない。

## ピン・気になるの保存と失敗

```mermaid
sequenceDiagram
  participant V as カードとPage
  participant VM as 一覧VM
  participant M as 記事状態Model
  participant API as ApiClientとサーバー
  V->>VM: togglePin / toggleInterest
  VM->>VM: 元の状態を保持し保存中にする
  VM->>M: setField(id, field, 指定値)
  M->>API: PUT articles/id/state
  alt 保存成功
    API-->>M: 確定状態
    M-->>VM: 確定状態
    VM->>VM: articlesへ反映
  else 明確な拒否
    API-->>M: 400・401・403・409・422
    M-->>VM: rejected
    VM->>VM: 状態を変えず失敗を表示
  else 保存できたか不明
    M-->>VM: uncertain
    VM->>M: getStateを一度だけ依頼
    M->>API: GET articles/id/state
    alt 現在状態を取得できた
      API-->>VM: Model経由で現在状態
      VM->>VM: 現在状態へ合わせ確認した旨を表示
    else 現在状態も取得不能
      VM->>VM: 更新を止めて手動の状態確認を表示
    end
  end
  VM->>VM: 保存中を解除
```

同じ記事の二つのボタンは保存中に無効化する。別の記事は独立して操作できる。気になる一覧での解除は成功してから記事を外す。404は削除済み通知を出して一覧から除く。

更新要求を自動再送しない。GETで取得する現在状態は元のPUTの成功・失敗の証明ではない。ページを閉じる際に通信の中止を依頼するが、サーバー保存の取り消しは保証しない。次回起動では通常の一覧取得でサーバーを読む。

## 元記事を開く・既読

画面から元記事を開く処理は未接続。受付判定の仕様は[操作方針](operation-policy.md#合意済み外部記事と既読)を参照する。ArticleStateModel.recordOpenedは日時指定の直接保存を用意しているが、端末保存・起動時再送は行わない。外部への移動を既読保存の完了まで待たせない。サーバーは古い日時で最後に開いた日時を巻き戻さない。
