import type { ExternalArticleOpener } from '../../features/articles/models/article-opening.model';

// Windowのうち必要な操作だけを表す。テストでは小さな代替を渡して拒否・例外も確認する。
export interface ArticleTab {
  opener: unknown;
  location: { replace(url: string): void };
  close(): void;
}
export class BrowserArticleOpener implements ExternalArticleOpener {
  constructor(private readonly createTab: () => ArticleTab | null = () => window.open('about:blank', '_blank')) {}

  open(url: string): void {
    // noopener付きopenのnullは作成拒否と区別できないため、空タブの参照を先に取得する。
    const tab = this.createTab();
    if (!tab) throw new Error('タブの作成が拒否されました。');
    try {
      tab.opener = null;
      if (tab.opener !== null) throw new Error('元画面との参照を切断できませんでした。');
      // 外部URLを渡す前に参照を切る。ページ表示の完了や外部サイトのHTTP結果は待たない。
      tab.location.replace(url);
    } catch (error) {
      // 作成途中で失敗した空タブを可能なら片付ける。closeの失敗で元の理由を失わない。
      try { tab.close(); } catch { /* 既に閉じられたタブ等は、そのまま受付失敗として扱う。 */ }
      throw error;
    }
  }
}
