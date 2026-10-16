import { openDB, type DBSchema } from 'idb';
import { isArticlePageResponse } from '../api/article-page-response';
import type { UnfinishedArticleChange, UnfinishedArticleChangeStorage } from '../../features/article-changes/models/article-change-contracts';

interface StateDatabase extends DBSchema {
  operations: { key: string; value: UnfinishedArticleChange };
}

// サーバーへ送る前の変更を、ブラウザ内のIndexedDBへ保存する。
// 接続先ごとに別DBとし、開発用APIの未送信変更を別のAPIへ誤送信しない。
export class IndexedDbUnfinishedArticleChangeStorage implements UnfinishedArticleChangeStorage {
  constructor(private readonly name: string) {}

  private open() {
    return openDB<StateDatabase>(this.name, 1, {
      upgrade(db) { db.createObjectStore('operations', { keyPath: 'request.operationId' }); },
      // 将来のDB更新を別タブが始めた場合、古い接続で更新を妨げない。
      blocking() { /* 各操作で接続を閉じるため、長時間保持する接続はない。 */ },
    });
  }

  async load(): Promise<UnfinishedArticleChange[]> {
    const db = await this.open();
    try {
      const operations = await db.getAll('operations');
      // 保存形式が壊れた場合は勝手に破棄・送信せず、起動を止めて再試行を案内する。
      for (const operation of operations) {
        const change = operation?.request?.change;
        if (!Number.isSafeInteger(operation?.order) || operation.order <= 0
          || typeof operation?.request?.operationId !== 'string'
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operation.request.operationId)
          || !change || !['interested', 'pinned'].includes(change.kind) || typeof change.value !== 'boolean'
          || !isArticlePageResponse({ articles: [operation.article], hasMore: false, nextCursor: null })) {
          throw new Error('端末の未送信変更を確認できませんでした。');
        }
      }
      return operations.sort((a, b) => a.order - b.order);
    } finally { db.close(); }
  }

  async put(operation: UnfinishedArticleChange): Promise<void> {
    const db = await this.open();
    try {
      // idbのputは書き込みトランザクションの完了まで待つ。完了後だけ送信を許可する。
      await db.put('operations', operation);
    } finally { db.close(); }
  }

  async remove(operationId: string): Promise<void> {
    const db = await this.open();
    try { await db.delete('operations', operationId); } finally { db.close(); }
  }
}
