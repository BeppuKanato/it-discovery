import { Inject, Injectable } from '@nestjs/common';
import type { ArticleState } from '../models/article-state';
import {
  assertArticleId, normalizeOperationId, parseStateOperation, StateOperationError,
  type StateOperationResult,
} from '../models/article-state-operation';
import { ArticleRepository } from '../repositories/article.repository';
import { ArticleStateOperationRepository } from '../repositories/article-state-operation.repository';

// 記事の内容登録とは分けて、利用者の状態変更と再送の手順を担当する。
@Injectable()
export class ArticleStateService {
  // Moduleが用意した実装を受け取る。Service自身ではSQLiteの接続やnewを行わない。
  constructor(
    @Inject(ArticleRepository) private readonly articles: ArticleRepository,
    @Inject(ArticleStateOperationRepository) private readonly operations: ArticleStateOperationRepository,
  ) {}

  // 現在の確定状態を返す。操作時点の結果を返すgetOperationとは区別する。
  getState(articleId: number): ArticleState | undefined {
    assertArticleId(articleId);
    return this.articles.findById(articleId)?.state;
  }

  // 応答不明だった操作の結果を確認する。未記録でも元の通信の失敗とは断定しない。
  getOperation(operationId: string): StateOperationResult | undefined {
    return this.operations.findById(normalizeOperationId(operationId))?.result;
  }

  // 入力検証・再送確認・項目別の変更・結果保存を一つの同期処理で実行する。
  apply(articleId: number, input: unknown): StateOperationResult {
    assertArticleId(articleId);
    const { operationId, change } = parseStateOperation(input);
    // キーの順番やJSONの空白に依存せず、正規化した意味が同じかを比較する。
    const requestKey = JSON.stringify([articleId, change.kind,
      change.kind === 'opened' ? change.openedAt.getTime() : change.value]);
    return this.articles.transaction(() => {
      const previous = this.operations.findById(operationId);
      if (previous) {
        if (previous.requestKey !== requestKey) {
          throw new StateOperationError('OPERATION_CONFLICT', '同じ操作IDで異なる変更は送信できません。');
        }
        // 現在の記事を更新しない。後から行った解除などを古い再送で戻さない。
        return previous.result;
      }
      const current = this.articles.findById(articleId);
      let result: StateOperationResult;
      if (!current) {
        // 削除済みも確定結果として残す。記事を再作成せず、再送にも同じ結果を返す。
        result = { operationId, articleId, status: 'missing', state: null };
      } else {
        const patch: Partial<ArticleState> = {};
        if (change.kind === 'opened') {
          const last = current.state.lastOpenedAt;
          // 古い日時の遅延送信・再送が来ても、最後に開いた日時を巻き戻さない。
          if (!last || change.openedAt > last) patch.lastOpenedAt = change.openedAt;
        } else {
          patch[change.kind] = change.value;
        }
        const saved = this.articles.updateState(articleId, patch);
        if (!saved) throw new Error('Article state disappeared during transaction');
        result = { operationId, articleId, status: 'saved', state: saved.state };
      }
      // ここで失敗すれば、同じtransaction内の状態変更も取り消される。
      this.operations.insert({ operationId, requestKey, result });
      return result;
    });
  }
}
