import type { ArticleListItem } from '@it-discovery/contracts';

export type SortingDecision = 'interested' | 'skipped' | 'read';
export interface DecisionRecord { readonly articleId: number; readonly kind: SortingDecision }

// 一回のカード・順序・判断履歴。変更時は新しいSessionを返し、VMがrefを置き換える。
// Vue・API・端末保存は知らない。位置は履歴の長さ、仮登録IDは履歴から計算する。
export class SortingSession {
  private constructor(readonly cards: readonly ArticleListItem[], readonly history: readonly DecisionRecord[]) {}

  static start(cards: readonly ArticleListItem[]): SortingSession {
    if (cards.length < 1 || cards.length > 10 || new Set(cards.map(a => a.articleId)).size !== cards.length) throw new Error('仕分け対象は重複しない1〜10件です。');
    // API応答を書き換えずに、その回の表示情報を固定する。
    return new SortingSession(cards.map(article => ({ ...article, source: { ...article.source }, state: { ...article.state } })), []);
  }
  get current(): ArticleListItem | null { return this.cards[this.history.length] ?? null; }
  get complete(): boolean { return this.history.length === this.cards.length; }
  get interestedIds(): number[] { return this.history.filter(record => record.kind === 'interested').map(record => record.articleId); }

  decide(kind: SortingDecision): SortingSession {
    const article = this.current;
    // 開いたカードは左右で判断せず「次へ」で進む。既読を取り消す履歴は作らない。
    if (!article || (article.state.lastOpenedAt !== null) !== (kind === 'read')) return this;
    return new SortingSession(this.cards, [...this.history, { articleId: article.articleId, kind }]);
  }
  undo(): SortingSession {
    return this.history.length ? new SortingSession(this.cards, this.history.slice(0, -1)) : this;
  }
  markOpened(articleId: number, openedAt: string): SortingSession {
    if (!Number.isFinite(Date.parse(openedAt))) throw new Error('開いた日時が不正です。');
    const cards = this.cards.map(article => article.articleId === articleId
      && (!article.state.lastOpenedAt || Date.parse(openedAt) > Date.parse(article.state.lastOpenedAt))
      ? { ...article, state: { ...article.state, lastOpenedAt: openedAt } } : article);
    return new SortingSession(cards, this.history);
  }
}
