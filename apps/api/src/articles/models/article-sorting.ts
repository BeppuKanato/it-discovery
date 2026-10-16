// 最大件数はServiceと入力検証で共有する。HTTPパラメータで変更しない。
export const SORTING_LIMIT = 10;

export interface InterestBatchResult {
  batchId: string;
  revision: number;
  results: { articleId: number; status: 'saved' | 'missing' }[];
}

export interface StoredInterestBatch {
  batchId: string;
  revision: number;
  requestKey: string;
  result: InterestBatchResult;
}

// HTTPステータスの選択はController側のFilterへ任せる。
export class SortingError extends Error {
  constructor(readonly code: 'INVALID_SORTING_INPUT' | 'BATCH_CONFLICT', message: string) { super(message); }
}
