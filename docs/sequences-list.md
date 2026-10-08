# シーケンス図：一覧の取得と状態変更

更新日：2026-10-08

[READMEに戻る](../README.md) · [ルール](rules.md) · [仕分けのシーケンス](sequences.md) · [状態遷移図](state-transitions.md)

全記事一覧・気になる一覧は全件を一括取得せず、スクロールに応じて続きを取得する。登録・解除・ピン操作は画面へすぐ反映し、サーバーへ非同期で保存する。保存成功まで表示変更を待つ以前の案を、この方式に置き換える。

図は責任と処理順を検討する設計資料であり、実装済みの挙動ではない。画面の状態管理・変更の送信管理は役割を表し、クラス名やAPI名は未確定。

## 1. 一覧の初回表示・切り替え・更新

起動・一覧切り替え・下に引く更新では、対象の一覧の先頭を一定件数取得する。外部情報源への収集は呼ばない。更新が成功してから表示済みの記事を置き換える案で描く。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant View as 一覧画面
    participant State as 一覧の状態管理
    participant Server as サーバー
    participant DB as DB

    User->>View: 起動・一覧切り替え・下に引いて更新
    View->>State: 対象の一覧を先頭から読み直す
    State->>State: 要求を識別し、古い追加取得の反映を無効にする
    State->>Server: 一覧の先頭を要求（種類・取得件数）
    alt 全記事一覧
        Server->>DB: 保持中の記事を一定件数取得<br/>取得日時が新しい順
    else 気になる一覧
        Server->>DB: 気になる登録済みの記事を一定件数取得<br/>取得日時が新しい順
    end

    alt 取得成功
        DB-->>Server: 記事と登録・既読・ピン状態
        Server-->>State: 記事・続きを指定するカーソル・続きの有無
        alt 現在の一覧・更新要求への応答
            State->>State: 記事とカーソルを置き換える
            State->>State: 保存中の最新操作を表示状態に重ねる
            State-->>View: 表示する一覧
            View-->>User: 一覧を表示（0件なら空の表示）
        else 古い要求への応答
            State->>State: 表示へ反映しない
        end
    else 取得失敗
        Server-->>State: 失敗または応答なし
        State-->>View: 取得失敗（元の表示データは保持）
        View-->>User: 取得できなかったことを表示
    end
```

ルール：UI-04、LIST-04〜08、COLLECT-02〜03。

カーソルは「どこから続きを取得するか」を表す情報。取得件数の具体値は未確定。起動時の仕分け結果の再送と一覧取得の順序はOPEN-12のまま。

取得日時と記事の識別子を組み合わせて順序を安定させる実装案とする。同じ取得日時の記事の具体的な順序、取得日時の再取得時の扱いはOPEN-01・10で決める。

## 2. スクロールで続きを取得する

続きがあり、追加取得中でなければ取得する。同じ続きを重複して要求せず、成功したときだけカーソルを進める。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant View as 一覧画面
    participant State as 一覧の状態管理
    participant Server as サーバー
    participant DB as DB

    User->>View: 一覧の下までスクロール
    View->>State: 続きを読み込む
    opt 続きあり、かつ追加取得中ではない
        State->>State: 現在の一覧・カーソルを保持し取得中にする
        State->>Server: 続きを要求（一覧の種類・カーソル・取得件数）
        Server->>DB: 指定位置より後の記事を一定件数取得<br/>一覧の条件・取得日時の順を適用

        alt 取得成功
            DB-->>Server: 次の記事
            Server-->>State: 記事・次のカーソル・続きの有無
            alt 現在の一覧・更新要求への応答
                State->>State: 記事IDで重複を除き末尾へ追加
                State->>State: 保存中の最新操作を表示状態に重ねる
                State->>State: カーソルと続きの有無を更新
                State-->>View: 更新後の一覧
                View-->>User: 続きの記事を表示
            else 一覧切り替え・更新前の古い応答
                State->>State: 表示へ反映しない
            end
        else 取得失敗
            Server-->>State: 失敗または応答なし
            State->>State: 表示済みの記事とカーソルを維持
            State-->>View: 追加取得に失敗
            View-->>User: 続きを取得できなかったことを表示
        end
        State->>State: 対応する要求の取得中状態を解除
    end
    Note over View,State: 続きがなければ追加要求を出さない
```

ルール：LIST-06〜08。下に引いて更新すると図1の先頭取得へ戻る。新規記事をスクロール中の先頭へ自動挿入する処理はこの図に含めない。

カーソル方式は、件数による位置指定よりも途中の新規追加によるずれを避けやすい設計案。既存記事の取得日時や気になる状態が変わる場合まで、全件を漏れなく固定表示する保証ではない。取得中の変更・削除との整合性、サーバーのカーソル定義はOPEN-13で詰める。

## 3. 気になる登録・解除をすぐ画面に反映する

気になる一覧で解除した記事は、その場で一覧から外す。保存が失敗したと確定した場合は、最新の操作との関係を確認して表示を戻す。応答がないだけの場合は、保存されている可能性があるため直ちに戻さない。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant View as 一覧画面
    participant State as 一覧の状態管理
    participant Sync as 変更の送信管理
    participant Server as サーバー
    participant DB as DB

    User->>View: 気になる登録または解除
    View->>State: 記事の気になる状態を変更
    State->>State: 直前の状態と今回の操作を記録
    State->>State: 登録表示をすぐ変更<br/>気になる一覧で解除なら記事を外す
    State-->>View: 更新後の一覧
    View-->>User: 即座に反映
    State->>Sync: 記事ID・変更先の状態・操作の識別情報を渡す
    Sync->>Server: 気になる状態を指定して非同期で保存
    Note over Sync,Server: 同じ記事・同じ項目への変更は順序を保つ案<br/>同じ要求の再送で状態を反転させない

    alt 保存成功
        Server->>DB: 気になる状態だけを更新
        DB-->>Server: 保存成功と確定状態
        Server-->>Sync: 保存成功と確定状態
        Sync->>State: 対応する操作の保存成功を通知
        State->>State: 確定状態を更新<br/>新しい操作の表示は古い応答で上書きしない
    else 保存失敗が確定
        Server-->>Sync: 保存しなかったことを通知
        Sync->>State: 対応する操作の失敗を通知
        State->>State: 新しい操作がなければ表示を確定状態に戻す<br/>解除で外した記事も復元
        State-->>View: 修正後の表示と失敗
        View-->>User: 保存できなかったことを表示
    else 保存できたか不明
        Sync->>State: 応答未確認として扱う
        Sync->>Server: 対象記事の気になる状態を確認
        Server->>DB: 現在の登録状態を取得
        DB-->>Server: 現在の状態
        Server-->>Sync: 確認結果
        Sync->>State: 確認結果を渡す
        Note over State,Sync: 進行中の要求・新しい操作と照合する<br/>確認できなければ未確定を保ち、再確認・再送を検討
    end
```

ルール：LIST-01〜03、09〜12。既読・ピン止めは変更しない。

単に過去の一覧全体を保存して戻すと、他の記事への操作まで消してしまう。戻す対象は失敗した記事の気になる状態だけとし、解除した記事の復元位置も現在の並び順に合わせる。

同じ記事を連続操作した場合、画面は最新の判断を即時表示する。サーバーにも最終的な判断が残るよう送信順を管理する。応答の表示だけを無視しても、サーバーで保存順が逆転すれば不整合になるため、送信の順序も必要。

確認要求の応答時点で元の保存要求がまだ処理中の場合は、その確認結果だけで失敗と断定しない。具体的なタイムアウト・再確認・再送・連続操作の管理方法はOPEN-14で決める。

## 4. ピン止め・解除をすぐ画面に反映する

ピン状態も楽観的に表示を変え、裏で保存する。ピン操作によって気になる状態や既読を変更しない。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant View as 一覧画面
    participant State as 一覧の状態管理
    participant Sync as 変更の送信管理
    participant Server as サーバー
    participant DB as DB

    User->>View: ピンアイコンを押す
    View->>State: 記事のピン状態を変更
    State->>State: 直前の状態と今回の操作を記録
    State->>State: ピン表示をすぐ変更
    State-->>View: 更新後の表示
    View-->>User: 即座に反映
    State->>Sync: 記事ID・変更先の状態・操作の識別情報を渡す
    Sync->>Server: ピン状態を指定して非同期で保存

    alt 保存成功
        Server->>DB: ピン状態だけを更新
        DB-->>Server: 保存成功と確定状態
        Server-->>Sync: 保存成功と確定状態
        Sync->>State: 対応する操作の保存成功を通知
        State->>State: 確定状態を更新<br/>新しい操作を古い応答で上書きしない
    else 保存失敗が確定
        Server-->>Sync: 保存しなかったことを通知
        Sync->>State: 対応する操作の失敗を通知
        State->>State: 新しい操作がなければピン表示を確定状態に戻す
        State-->>View: 修正後の表示と失敗
        View-->>User: 保存できなかったことを表示
    else 保存できたか不明
        Sync->>State: 応答未確認として扱う
        Sync->>Server: 対象記事のピン状態を確認
        Server->>DB: 現在のピン状態を取得
        DB-->>Server: 現在の状態
        Server-->>Sync: 確認結果
        Sync->>State: 確認結果を渡す
        Note over State,Sync: 進行中の要求・新しい操作と照合する<br/>確認できなければ未確定を保つ
    end
```

ルール：PIN-01〜03、LIST-09〜12。送信順・再送・古い応答の扱いは気になる操作と共通にする。

画面上のピン表示が変わっても、サーバーの自動削除から保護されるのはDB保存後。解除しても気になる登録が残っていれば保護は続く。解除操作自体では削除せず、通常の削除判定に従う。

## 未決事項と残りのシーケンス

- 一回の取得件数、カーソルの詳細、更新中の一覧の扱いはOPEN-10・13。
- 起動時の仕分け結果の再送、一覧からの解除との競合はOPEN-12。
- 保存失敗後の具体的な操作、連続操作、アプリ終了時の一覧操作の未確定変更、削除済み記事への操作はOPEN-09・14。
- 一覧から元記事を開く処理、サーバーの定期収集・更新、保持期限・件数による削除は未作成。

一覧の変更を仕分けと同じ終了時の一括送信にする仕様ではない。端末への永続保存・次回起動時の再送を一覧の操作にも適用するかは、OPEN-14で別途決める。
