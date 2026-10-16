import type { ArticleListItem } from './articles';

// カードの順番と表示情報を開始時に受け取る。0件なら仕分けを開始しない。
export interface SortingCandidatesResponse {
  articles: ArticleListItem[];
}

export interface InterestBatchRequest {
  revision: number;
  articleIds: number[];
}

// 保存済みには「今回追加した」と「すでに登録済み」の両方を含む。
export interface InterestBatchResponse {
  batchId: string;
  revision: number;
  results: { articleId: number; status: 'saved' | 'missing' }[];
}
