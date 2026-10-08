# IT Discovery

IT記事・更新情報・動画・Podcast・リリース情報を集め、短い仕分けで「気になる」を選び、一覧から元の記事を読む個人向けアプリです。

現在は設計段階です。スマホ向けの操作モックとユースケースを確認し、記事の収集・保持・仕分けのルールを整理しています。このリポジトリには設計資料と情報源の調査スクリプトを置いています。アプリ本体・定期収集・DBへの保存は未実装です。

## 設計資料

- [アプリのルール](docs/rules.md)：用語、仕分け、気になる登録、既読、ピン止め、収集・更新、削除ルール、未決事項。
- [ユースケース](docs/use-cases.md)：利用者の目的と利用場面の区分。
- [状態遷移図](docs/state-transitions.md)：記事の状態・一回の仕分け・保持と削除。
- [ユースケース図（SVG）](docs/diagrams/use-cases.svg) / [PlantUMLコード](docs/diagrams/use-cases.puml)

ルールは [docs/rules.md](docs/rules.md) を基準とします。未決事項を合意済みの仕様として扱わず、状態遷移図 → シーケンス図 → クラス図の順に設計を具体化します。

## 想定する使い方

1. サーバーが外部の情報源を定期収集し、記事データをDBに追加・更新する。
2. アプリ起動時や一覧の更新操作で、DBの最新内容を表示する。
3. 仕分けを開始すると、未読・気になる未登録・ピン止めなしの記事を、取得日時が新しい順に最大10件表示する。
4. カードで「気になる」登録または見送りを判断する。カードから元記事を直接開くこともできる。
5. 気になる一覧・全記事一覧から、記事を開いたり登録やピン止めを変更したりする。

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
- 代表的な処理のシーケンス図を作る。
- データと処理の責任をクラス図にまとめる。

推薦方法・類似度・興味の推定は今回の設計範囲外です。後から推薦を追加できる構造を検討します。技術スタック・DB製品・デプロイ先は未確定です。
