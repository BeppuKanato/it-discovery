import { describe, expect, it } from 'vitest';
import { article } from '../../../test/article-fixture';
import { SortingSession } from './sorting-session';

describe('一回の仕分け', () => {
  it('A登録→B見送り→戻す→戻すで位置と仮登録が復元される', () => {
    const start = SortingSession.start([article(3), article(2), article(1)]);
    const afterA = start.decide('interested'); const afterB = afterA.decide('skipped');
    expect(afterB.current?.articleId).toBe(1); expect(afterB.interestedIds).toEqual([3]);
    const undoB = afterB.undo(); expect(undoB.current?.articleId).toBe(2); expect(undoB.interestedIds).toEqual([3]);
    const undoA = undoB.undo(); expect(undoA.current?.articleId).toBe(3); expect(undoA.interestedIds).toEqual([]);
    expect(start.history).toEqual([]); expect(start.current?.state.interested).toBe(false);
  });
  it.each([1, 9, 10])('%i件で開始でき、完了後も最後の判断を戻せる', count => {
    let session = SortingSession.start(Array.from({ length: count }, (_, i) => article(count - i)));
    for (let i = 0; i < count; i++) session = session.decide('skipped');
    expect(session.complete).toBe(true); expect(session.current).toBeNull();
    expect(session.decide('interested')).toBe(session);
    expect(session.undo().complete).toBe(false); expect(session.undo().current?.articleId).toBe(1);
  });
  it.each([{ cards: [] }, { cards: Array.from({ length: 11 }, (_, i) => article(i + 1)) }, { cards: [article(1), article(1)] }])('0件・11件・重複を開始しない', ({ cards }) => {
    expect(() => SortingSession.start(cards)).toThrow('仕分け対象');
  });
  it('開始後に元の配列・記事・出典を書き換えてもその回の内容は固定される', () => {
    const source = [article(2), article(1)]; const session = SortingSession.start(source);
    source[0]!.title = '更新'; source[0]!.source.siteName = '別'; source[0]!.state.pinned = true; source.reverse(); source.push(article(3));
    expect(session.cards.length).toBe(2); expect(session.current?.articleId).toBe(2); expect(session.current?.title).toBe('記事2');
    expect(session.current?.source.siteName).toBe('Zenn'); expect(session.current?.state.pinned).toBe(false);
  });
  it('元記事を開いたカードは進めず、次へで数え、戻しても既読を消さない', () => {
    let session = SortingSession.start([article(2), article(1)]);
    expect(session.decide('read')).toBe(session); expect(session.undo()).toBe(session);
    session = session.markOpened(2, '2026-10-20T00:00:00.000Z');
    expect(session.current?.articleId).toBe(2); expect(session.history.length).toBe(0);
    expect(session.decide('interested')).toBe(session); expect(session.decide('skipped')).toBe(session);
    session = session.decide('read'); expect(session.current?.articleId).toBe(1); expect(session.interestedIds).toEqual([]);
    session = session.undo(); expect(session.current?.articleId).toBe(2); expect(session.current?.state.lastOpenedAt).toBeTruthy();
    expect(session.markOpened(2, '2026-10-19T00:00:00.000Z').current?.state.lastOpenedAt).toBe('2026-10-20T00:00:00.000Z');
  });
  it('判断を戻して別の判断をすると最終ID集合も変わる', () => {
    const selected = SortingSession.start([article(2), article(1)]).decide('interested').decide('interested');
    const changed = selected.undo().decide('skipped'); expect(changed.interestedIds).toEqual([2]);
    expect(changed.cards.every(a => !a.state.interested)).toBe(true);
  });
});
