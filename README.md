# IT Discovery

自分にとって有益なIT情報を継続的に発見するための個人向けアプリ（開発予定）。

現時点では、情報源ごとに取得できるメタデータの違いを確認する調査スクリプトだけを置いています。

## Google Colabでの実行

新しいColabノートブックで以下を実行します。

```python
!pip -q install requests feedparser
!git clone https://github.com/<YOUR_GITHUB_USERNAME>/it-discovery.git
%cd it-discovery
!python collect_samples.py --limit 3
```

**非公開リポジトリの場合:** Colabからの匿名 `git clone` はできません。GitHubからZIPを取得してColabにアップロードするか、認証を設定してください。最も簡単なのは `collect_samples.py` だけColabへアップロードして次を実行する方法です。

```python
!pip -q install requests feedparser
!python collect_samples.py --limit 3
```

`data/samples/` に、情報源ごとのJSONと `summary.json` が保存されます。RSS等の取得に失敗しても、他の情報源の取得は続行します。

必要ならColabのファイル欄から `data/samples/` のJSONをダウンロードできます。

## 調査対象

- Zenn（技術記事RSS）
- Cloudflare Changelog（公式更新情報RSS）
- YouTube: Google Developers（動画Atom）
- Syntax（技術系Podcast RSS）
- GitHub: cloudflare/workers-sdk Releases（API）

外部サービスの公開仕様・フィードURLは変更されることがあります。取得内容はユーザーによる分類・推薦方針の検討材料であり、その精度は保証しません。

## 将来

PWA、情報の選別・推薦、必要に応じて音声・学習支援などへ拡張する予定。技術スタックは未確定です。
