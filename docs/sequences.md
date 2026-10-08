# シーケンス図：仕分けと結果の保存

更新日：2026-10-08

[READMEに戻る](../README.md) · [ルール](rules.md) · [状態遷移図](state-transitions.md) · [ユースケース](use-cases.md)

仕分けの操作はサーバー通信の完了を待たずに進める。「気になる」の途中結果を端末に保存し、終了時にまとめて送信する。途中でアプリを閉じても、次の起動時に残っている登録を送信する。仕分けの続き自体は再開しない。

図は上から下へ時間が進む。`alt` は条件分岐、`opt` は条件を満たす場合だけの処理、`par` は並行して進める処理を表す。通常の処理を中心に描いた設計図であり、実装済みの挙動ではない。

## 登場人物と保存する情報

| 登場人物 | 役割 |
|---|---|
| 利用者 | 開始、スワイプ、戻す、記事を開く、終了の操作をする |
| 画面 | カード・完了画面を表示し、履歴の有無で戻すボタンを有効・無効にする |
| その回の進行管理 | アプリのメモリで対象記事・現在位置・判断履歴・仮の気になる登録を管理する |
| 端末の保存処理 | サーバー未保存の気になる登録を非同期で端末へ保存する |
| 端末の保存領域 | 起動し直しても残る未送信の登録結果を保持する |
| バックグラウンド送信 | 画面操作を待たせずに既読の保存を依頼する |
| サーバー・DB | 記事と永続的な気になる・既読・ピン止めを管理する |
| 外部を開く処理 | 元記事を開く。成功判定とブラウザー連携方法は未確定 |

これらは責任を表す役割であり、クラス名・API名・技術を確定したものではない。端末保存の具体的な技術はクラス・実装設計で選ぶ。

端末に残すのは、途中で選んだ「気になる」のうち、まだサーバーに保存できていない結果。見送り・現在位置・取り消し履歴を次の起動のために保存する必要はない。

## 1. 仕分けを開始する

外部情報源の収集は呼ばず、DBに保持している記事から選ぶ。開始時の対象リストをその回で保持する案で描く。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant View as 仕分け画面
    participant Session as その回の進行管理
    participant Server as サーバー
    participant DB as DB

    User->>View: 仕分けを開始
    View->>Server: 仕分け対象を要求
    Server->>DB: 未読・気になる未登録・ピン止めなしを取得<br/>取得日時が新しい順、最大10件
    DB-->>Server: 対象記事
    Server-->>View: 対象記事

    alt 対象が1件以上
        View->>Session: 記事リストでその回を開始
        Session->>Session: 現在位置を先頭、判断履歴を空にする
        Session-->>View: 最初のカードと対象件数
        View-->>User: カードを表示（戻すボタンは無効）
    else 対象が0件
        View-->>User: 開始できないことを表示
        Note over View,Session: 空の仕分け回は開始しない
    end
```

ルール：SORT-01〜04。1〜9件でも開始できる。起動時に未送信の登録が残っている場合の処理は図4を参照。再送失敗時の仕分け開始・対象選択との整合性はOPEN-12で決める。

## 2. 登録・見送り・取り消しを手元で処理する

右スワイプによる登録は、終了確定まで仮の判断として扱う。取り消しも手元だけで行い、サーバーへの登録・解除要求は出さない。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant View as 仕分け画面・完了画面
    participant Session as その回の進行管理
    participant Save as 端末の保存処理
    participant Local as 端末の保存領域

    User->>View: 右または左にスワイプ
    View->>Session: 現在の記事への判断を渡す
    alt 右スワイプ
        Session->>Session: 仮の気になる登録に追加
    else 左スワイプ
        Session->>Session: その回の見送りとして記録
    end
    Session->>Session: 判断履歴を追加し、現在位置を進める

    par すぐに表示を進める
        Session-->>View: 次のカード、または完了画面
        View-->>User: 表示
        View->>View: 履歴の有無で戻すボタンを更新
    and 途中結果を端末に残す
        Session->>Save: 更新後の仮の登録結果を保存依頼
        Save->>Local: 未送信の登録結果を保存
        Local-->>Save: 保存完了
    end

    opt 戻すボタンが有効
        User->>View: 戻す
        View->>Session: 直前の判断を取り消す
        Session->>Session: 仮の登録または見送りを取り消す
        Session->>Session: 履歴を一件外し、前の位置へ戻る
        par 前のカードを表示する
            Session-->>View: 前のカード
            View-->>User: 判断をやり直せる状態で表示
            View->>View: 履歴の有無で戻すボタンを更新
        and 取り消しを端末の記録にも反映する
            Session->>Save: 更新後の仮の登録結果を保存依頼
            Save->>Local: 未送信の登録結果を置き換える
            Local-->>Save: 保存完了
        end
    end

    Note over View,Local: スワイプ・戻すではサーバー通信を行わない<br/>見送りと取り消し履歴は端末に永続保存しない
```

ルール：SORT-05〜11、13〜15。履歴がなければ戻すボタンを無効にする。履歴のある範囲で繰り返し戻せる。既読・ピン止めは取り消さない。

端末保存は非同期で、画面表示の前提にしない。ただし保存時間がゼロという意味ではなく、保存完了前の強制終了では最後の変更が残らない可能性がある。

保存処理が前後して古い結果で上書きされないよう、依頼を順序どおり処理するなどの仕組みが必要。図の「更新後の結果」は右スワイプの追加だけでなく、取り消した記事を送信対象から外すことも含む。

## 3. 終了時に最終結果をまとめて保存する

完了画面を出しただけでは送信しない。「仕分けを終了する」で最終的な登録を送る。見送りや途中の判断履歴は送らない。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant View as 完了画面
    participant Session as その回の進行管理
    participant Save as 端末の保存処理
    participant Local as 端末の保存領域
    participant Server as サーバー
    participant DB as DB

    Note over View,Session: 完了画面でも戻せる。まだ送信しない
    User->>View: 仕分けを終了する
    View->>Session: 最終結果を取り出す
    Session-->>View: 最終的に気になる登録した記事ID
    View->>Save: 最終結果の端末保存完了を確認
    Save->>Local: 最新の登録結果を保存
    Local-->>Save: 保存完了
    Save-->>View: 最終結果を保持済み

    alt 登録対象がある
        View->>Server: 気になる登録をまとめて保存
        Server->>DB: 対象の記事を登録（再送でも二重登録しない）
        alt 保存成功
            DB-->>Server: 保存成功
            Server-->>View: 保存成功
            View->>Save: 保存確認できた送信結果を削除
            Save->>Local: 対応する未送信結果を削除
            Local-->>Save: 削除完了
            View->>Session: その回の進行状況・履歴を破棄
            View-->>User: 終了
        else 保存失敗または成功を確認できない
            Server-->>View: 失敗または応答なし
            Note over View,Local: 登録結果を消さない<br/>次の起動でも再送できるよう残す
            View-->>User: 未保存を表示（具体的な操作は未確定）
        end
    else 登録対象なし
        Note over View,Local: 取り消し後の空の結果も反映済み<br/>他の未送信結果は消さない
        View->>Session: その回の進行状況・履歴を破棄
        View-->>User: 終了
    end
```

ルール：SORT-11〜17。「登録対象なし」の場合は気になる保存の通信が不要。

図は最終結果を端末に確保してから送信する設計案。保存成功を確認して消すのは、その送信で確定した結果だけとする。別の未送信結果や、送信後に新しく発生した変更まで消さない。

失敗表示後の再試行・終了操作、送信中の操作制限、端末保存自体に失敗した場合の表示はOPEN-09・12で詰める。サーバーに保存できたのに応答を受け取れなかった場合でも、同じ登録を安全に再送できるようにする。

## 4. 次の起動時に残っている登録を送信する

終了直前の通知や送信の成功には依存しない。通常の終了、タブを閉じる操作、強制終了のいずれでも、端末への保存が完了していれば次の起動で登録を回収できる。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant App as アプリの起動処理
    participant Local as 端末の保存領域
    participant Server as サーバー
    participant DB as DB

    User->>App: アプリを起動
    App->>Local: サーバー未保存の登録結果を読む
    Local-->>App: 残っている登録結果
    opt 登録結果がある
        App->>Server: 気になる登録をまとめて送信
        Server->>DB: 気になる登録を保存（同じ記事は二重登録しない）
        alt 保存成功
            DB-->>Server: 保存成功
            Server-->>App: 保存成功
            App->>Local: 保存確認できた送信結果を削除
            Local-->>App: 削除完了
        else 保存失敗または成功を確認できない
            Server-->>App: 失敗または応答なし
            Note over App,Local: 結果を残し、再送可能にする
        end
    end
    Note over App,Local: 前の回のカード位置・見送り・取り消し履歴は復元しない
```

ルール：SORT-08、14〜17。途中終了していた場合は、端末に残っている最後の登録結果を送る。取り消しが保存済みなら、その記事は送信対象に含めない。

起動時の一覧更新との順序、通信失敗時の表示、再送前に一覧で登録を解除した場合などの整合性はOPEN-12。端末の保存領域がユーザー操作などで消去された場合は、未送信結果を復元できない。

## 5. 元記事を開き、既読を非同期で保存する

元記事を開く処理と既読を保存する処理を分ける。既読保存の完了を待たずに画面操作を続ける案とする。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant View as 仕分け画面
    participant Session as その回の進行管理
    participant Open as 外部を開く処理
    participant Background as バックグラウンド送信
    participant Server as サーバー
    participant DB as DB

    User->>View: カードをタップ
    View->>Session: 現在の記事を確認
    Session-->>View: 記事ID・URL・現在位置
    View->>Open: 元記事を開く
    Note over View,Open: 成功判定の実装方法は未確定（OPEN-05）<br/>外部サイトから通知が来ることを前提にしない

    alt 開けたと判定できた
        View->>Session: 表示用情報を既読にする
        View->>Background: 既読の保存を依頼
        Background-->>View: 依頼を受け付ける
        par 画面操作を続ける
            User->>View: アプリへ戻る
            View->>Session: 現在のカードを取得
            Session-->>View: 同じ記事のカード
            View-->>User: 同じカードを表示
        and 既読を保存する
            Background->>Server: 記事IDと開いた日時を送信
            Server->>DB: 既読と最後に開いた日時を保存
            DB-->>Server: 保存成功
            Server-->>Background: 保存成功
        end
    else 開けなかったと判定できた
        Note over View,DB: 既読に変更しない
        View-->>User: 同じカードを維持
    end
```

ルール：READ-01〜04、SORT-10。外部サイトを開いても気になるへ自動登録せず、現在位置や仕分け判断履歴は進めない。既読を戻す操作で取り消さない。

ブラウザーが開いたこと、ページ読み込み成功、読み終えたことは異なる。どこを成功とみなして観測するかはOPEN-05で決める。外部への移動後も必ずアプリの処理が動き続けるとは限らない。実装環境によっては既読も端末保存・後の送信に寄せる。既読送信の再試行はOPEN-09で設計する。

戻った既読カードの次への進み方、左右スワイプの扱い、処理数への数え方はOPEN-03のまま。

## 次に扱う処理

一覧の取得・更新、一覧からの気になる登録・解除、ピン止め、サーバーの定期収集・更新・削除は別のシーケンスとして整理する。今回の一括送信は仕分けの登録を対象とし、一覧の変更まで一括送信にする仕様ではない。

クラス図では、進行管理、端末への未送信結果の保存、送信・再送、サーバー側の登録をそれぞれの責任として検討する。
