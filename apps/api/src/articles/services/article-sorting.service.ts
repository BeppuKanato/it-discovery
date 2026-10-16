import { Inject, Injectable } from '@nestjs/common';
import type { ArticleListEntry } from '../models/article-page';
import { SORTING_LIMIT, SortingError, type InterestBatchResult } from '../models/article-sorting';
import { ArticleRepository } from '../repositories/article.repository';
import { ArticleInterestBatchRepository } from '../repositories/article-interest-batch.repository';
import { normalizeBatchId, parseInterestBatch } from '../validators/article-sorting.validator';

@Injectable()
export class ArticleSortingService {
  constructor(
    @Inject(ArticleRepository) private readonly articles: ArticleRepository,
    @Inject(ArticleInterestBatchRepository) private readonly batches: ArticleInterestBatchRepository,
  ) {}

  // DBの現在の対象を最大10件取得する。取得だけでは登録・既読・見送りを変更しない。
  getCandidates(): ArticleListEntry[] {
    return this.articles.findSortingCandidates(SORTING_LIMIT);
  }

  // 応答を受け取れなかった回の結果を照会する。未記録でも元の要求の失敗とは断定しない。
  getBatch(batchId: string): InterestBatchResult | undefined {
    return this.batches.findById(normalizeBatchId(batchId))?.result;
  }

  // 入力検証、再送判定、有効な記事の登録、結果記録を一つの保存単位で行う。
  submit(batchId: string, input: unknown): InterestBatchResult {
    const id = normalizeBatchId(batchId);
    const { revision, articleIds } = parseInterestBatch(input);
    // 昇順にそろえたID集合を文字列化し、前回の送信内容と比較する。版は別に比較する。
    const requestKey = JSON.stringify(articleIds);
    return this.articles.transaction(() => {
      const previous = this.batches.findById(id);
      if (previous) {
        // revisionは端末の仮結果の版。送信開始後は固定するため、受理済み回の別版は拒否する。
        if (previous.revision !== revision || previous.requestKey !== requestKey) {
          throw new SortingError('BATCH_CONFLICT', 'この仕分け回は別の版または内容ですでに確定しています。');
        }
        return previous.result;
      }
      // 対象を一度に取得する。空集合はDBに問い合わせず、空の結果だけを記録する。
      const existingArticles = articleIds.length > 0 ? this.articles.findByIds(articleIds) : [];
      // Setは存在確認に使うIDの集合。Repositoryの返却順に依存せず、入力の各IDを判定する。
      const existingIds = new Set(existingArticles.map((entry) => entry.article.articleId));
      // filterで未登録の記事だけに絞り、mapで更新対象のID配列へ変換する。
      // 開始後に既読やピンが変わっていても登録可能。その2項目は更新しない。
      const idsToRegister = existingArticles.filter((entry) => !entry.state.interested)
        .map((entry) => entry.article.articleId);
      if (idsToRegister.length > 0) this.articles.registerInterests(idsToRegister);
      // mapは記事別の結果を組み立てるだけで、ループ内でDBへアクセスしない。
      // 登録済みもsaved、取得できなかったIDはmissing。送られなかったIDは変更しない。
      const results: InterestBatchResult['results'] = articleIds.map((articleId) => ({
        articleId, status: existingIds.has(articleId) ? 'saved' : 'missing',
      }));
      const result = { batchId: id, revision, results };
      // 途中の更新や、この結果記録で例外になれば全て取り消す。missingは例外ではなく確定結果。
      this.batches.insert({ batchId: id, revision, requestKey, result });
      return result;
    });
  }
}
