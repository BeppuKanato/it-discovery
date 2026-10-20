import { describe, expect, it, vi } from 'vitest';
import { BrowserArticleOpener, type ArticleTab } from './external-article-opener';

describe('外部タブの作成と遷移', () => {
  it('外部へ遷移させる前にopenerを切断する。本文の成功通知を待たない', () => {
    const replace = vi.fn(() => { expect(tab.opener).toBeNull(); });
    const tab: ArticleTab = { opener: {}, location: { replace }, close: vi.fn() };
    const create = vi.fn(() => tab);
    new BrowserArticleOpener(create).open('https://example.com/article');
    expect(create).toHaveBeenCalledOnce(); expect(replace).toHaveBeenCalledExactlyOnceWith('https://example.com/article'); expect(tab.close).not.toHaveBeenCalled();
  });
  it('nullの戻り値を作成拒否として扱う', () => {
    expect(() => new BrowserArticleOpener(() => null).open('https://example.com')).toThrow('拒否');
  });
  it('作成時の例外を呼び出し元へ返す', () => {
    expect(() => new BrowserArticleOpener(() => { throw new Error('creation failed'); }).open('https://example.com')).toThrow('creation failed');
  });
  it('openerを切断できないと遷移せず空タブを閉じる', () => {
    const tab: ArticleTab = { get opener() { return {}; }, set opener(_value: unknown) {}, location: { replace: vi.fn() }, close: vi.fn() };
    expect(() => new BrowserArticleOpener(() => tab).open('https://example.com')).toThrow('参照');
    expect(tab.location.replace).not.toHaveBeenCalled(); expect(tab.close).toHaveBeenCalledOnce();
  });
  it('遷移依頼に失敗すると空タブを閉じ、closeが失敗しても元の理由を返す', () => {
    const tab: ArticleTab = { opener: {}, location: { replace: () => { throw new Error('navigation failed'); } }, close: vi.fn(() => { throw new Error('close failed'); }) };
    expect(() => new BrowserArticleOpener(() => tab).open('https://example.com')).toThrow('navigation failed');
    expect(tab.close).toHaveBeenCalledOnce();
  });
});
