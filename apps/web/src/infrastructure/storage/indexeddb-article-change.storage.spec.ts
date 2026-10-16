import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { article } from '../../test/article-fixture';
import { IndexedDbUnfinishedArticleChangeStorage } from './indexeddb-article-change.storage';
import type { UnfinishedArticleChange } from '../../features/article-changes/models/article-change-contracts';

describe('未送信変更の端末保存', () => {
  const operation = (order: number): UnfinishedArticleChange => ({ order, article: article(order), request: {
    operationId: crypto.randomUUID(), change: { kind: 'interested', value: true },
  } });

  it('再接続後も操作ID・内容・順番を保持し、指定した操作だけ削除する', async () => {
    const name = crypto.randomUUID();
    const first = operation(1); const second = operation(2);
    const store = new IndexedDbUnfinishedArticleChangeStorage(name);
    await store.put(second); await store.put(first);
    const reopened = new IndexedDbUnfinishedArticleChangeStorage(name);
    expect(await reopened.load()).toEqual([first, second]);
    await reopened.remove(first.request.operationId);
    expect(await store.load()).toEqual([second]);
  });

  it('接続先ごとに保存領域を分ける', async () => {
    const first = new IndexedDbUnfinishedArticleChangeStorage(crypto.randomUUID());
    const second = new IndexedDbUnfinishedArticleChangeStorage(crypto.randomUUID());
    await first.put(operation(1));
    expect(await second.load()).toEqual([]);
  });

  it('保存されたデータが壊れていたら消さずに読み込みを失敗させる', async () => {
    const name = crypto.randomUUID(); const store = new IndexedDbUnfinishedArticleChangeStorage(name);
    await store.load();
    const db = await openDB(name, 1);
    await db.put('operations', { request: { operationId: 'broken' } }); db.close();
    await expect(store.load()).rejects.toThrow('端末の未送信変更');
    const again = await openDB(name, 1);
    expect(await again.count('operations')).toBe(1); again.close();
  });
});
