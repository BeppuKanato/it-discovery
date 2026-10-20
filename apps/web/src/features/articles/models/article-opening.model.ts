// ブラウザのタブ操作そのものは外部接続へ任せる。ModelへWindowやDOMを渡さない。
export interface ExternalArticleOpener { open(url: string): void }
export class ArticleOpeningError extends Error {
  constructor() { super('記事を開けませんでした。URLやブラウザのポップアップ設定をご確認ください。'); }
}

// 一覧と仕分けで共用する受付判定。同期処理なのでクリックの直後にタブを作れる。
export class ArticleOpeningModel {
  constructor(private readonly opener: ExternalArticleOpener) {}

  open(url: string): string {
    try {
      const target = new URL(url);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new ArticleOpeningError();
      this.opener.open(target.href);
      // 外部本文の読了時刻ではなく、遷移依頼を受け付けた時刻を返す。
      return new Date().toISOString();
    } catch { throw new ArticleOpeningError(); }
  }
}
