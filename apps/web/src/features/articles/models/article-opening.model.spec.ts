import { describe, expect, it, vi } from 'vitest';
import { ArticleOpeningError, ArticleOpeningModel } from './article-opening.model';

describe('元記事を開く受付判定', () => {
  it('同期的に開いてから受付時刻を返す', () => {
    const open = vi.fn(); const model = new ArticleOpeningModel({ open });
    const before = Date.now(); const openedAt = model.open('https://example.com/article');
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.com/article');
    expect(Date.parse(openedAt)).toBeGreaterThanOrEqual(before); expect(Date.parse(openedAt)).toBeLessThanOrEqual(Date.now());
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/page', 'about:blank', '/relative', 'invalid'])('危険・不正なURL %sではタブを作らない', url => {
    const open = vi.fn(); const model = new ArticleOpeningModel({ open });
    expect(() => model.open(url)).toThrow(ArticleOpeningError); expect(open).not.toHaveBeenCalled();
  });
  it('ブラウザで受付を拒否されたら時刻を返さない', () => {
    const model = new ArticleOpeningModel({ open: () => { throw new Error('blocked'); } });
    expect(() => model.open('https://example.com')).toThrow('記事を開けませんでした');
  });
});
