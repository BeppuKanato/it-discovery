# IT Discovery

IT記事・更新情報・動画・Podcast・リリース情報を集め、短い仕分けで「気になる」を選び、一覧から元の記事を読む個人向けアプリです。

現在は設計段階です。スマホ向けの操作モックとユースケースを確認し、記事の収集・保持・仕分けのルールを整理しています。このリポジトリには設計資料と情報源の調査スクリプトを置いています。アプリ本体・定期収集・DBへの保存は未実装です。

## 設計資料

- [アプリのルール](docs/rules.md)：用語、仕分け、気になる登録、既読、ピン止め、収集・更新、削除ルール、未決事項。
- [ユースケース](docs/use-cases.md)：利用者の目的と利用場面の区分。
- [状態遷移図](docs/state-transitions.md)：記事の状態・一回の仕分け・保持と削除。
- [仕分けのシーケンス図](docs/sequences.md)：仕分けの開始・手元での判断・端末保存・終了時の一括送信・次回起動時の再送・既読の非同期保存。
- [一覧のシーケンス図](docs/sequences-list.md)：分割取得・追加読み込み・更新、気になるとピンの即時表示変更・非同期保存、元記事を開く処理。
- [サーバーのシーケンス図](docs/sequences-server.md)：定期収集・共通形式への変換・追加と更新、期限と件数による削除、新規追加の停止と再開。
- [クラス図](docs/classes.md)：記事と未送信結果のデータ、アプリの操作・同期、サーバーの収集・保存・保持の分担とコードの流れ。
- [ユースケース図（SVG）](docs/diagrams/use-cases.svg) / [PlantUMLコード](docs/diagrams/use-cases.puml)

ルールは [docs/rules.md](docs/rules.md) を基準とします。未決事項を合意済みの仕様として扱わず、状態遷移図 → シーケンス図 → クラス図の順に設計を具体化します。

## 想定する使い方

1. サーバーが外部の情報源を定期収集し、記事データをDBに追加・更新する。
2. 起動時に端末の未送信登録があれば、保存成功を確認するまで通常操作を待機する。その後、起動時や一覧の更新操作でDBの最新内容を先頭から一定件数表示する。下までスクロールすると続きを追加取得する。
3. 仕分けを開始すると、未読・気になる未登録・ピン止めなしの記事を、取得日時が新しい順に最大10件表示する。
4. カードで「気になる」登録または見送りを判断する。操作中は手元で処理し、登録結果を端末に残す。終了時にまとめてサーバーへ保存し、途中で閉じた場合は次の起動時に残っている登録を送る。カードから元記事を直接開くこともできる。
5. 気になる一覧・全記事一覧から、記事を開いたり登録やピン止めを変更したりする。登録・ピン操作はすぐ画面に反映し、裏でサーバーへ保存する。

表示は日本語・スマホ向けを基本とし、カードのサムネイル領域内に中央揃えのタイトル、小さな説明、出典アイコン・サイト名を配置します。日付などは下に表示します。

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

この表は現在の調査スクリプトの対象です。本番の対応情報源・取得範囲・収集間隔は未確定です。UIモックのサンプルとは、チャンネル・番組・リポジトリが異なる場合があります。

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
- [クラス図](docs/classes.md)の責任分担を確認し、残る操作ルール・実装環境を決めてコードへ具体化する。

推薦方法・類似度・興味の推定は今回の設計範囲外です。後から推薦を追加できる構造を検討します。技術スタック・DB製品・デプロイ先は未確定です。
