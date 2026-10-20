import type { SortingCandidatesResponse } from '@it-discovery/contracts';

export interface SortingApi { getSortingCandidates(signal?: AbortSignal): Promise<SortingCandidatesResponse> }
// 取得と画面内の判断を分ける。Modelは取得した画面状態を共有Storeへ保持しない。
export class SortingModel {
  constructor(private readonly api: SortingApi) {}
  async getCandidates(signal?: AbortSignal): Promise<SortingCandidatesResponse> {
    return this.api.getSortingCandidates(signal);
  }
}
