import axios from 'axios';
import type { CompanionChatRequest, CompanionChatResponse, DiscoveryNote, DiscoveryNoteRequest } from '@it-discovery/contracts';
export interface CompanionApi {
  chat(request: CompanionChatRequest, signal?: AbortSignal): Promise<CompanionChatResponse>;
  getDiscoveryNotes(signal?: AbortSignal): Promise<DiscoveryNote[]>;
  saveDiscoveryNote(request: DiscoveryNoteRequest, signal?: AbortSignal): Promise<DiscoveryNote>;
  deleteDiscoveryNote(id: number, signal?: AbortSignal): Promise<void>;
}
// 通信の依頼・エラー分類を担当し、会話や表示中の記事は保持しない。
export class CompanionModel {
  constructor(private readonly api: CompanionApi) {}
  chat(request: CompanionChatRequest, signal?: AbortSignal) { return this.api.chat(request, signal); }
  notes(signal?: AbortSignal) { return this.api.getDiscoveryNotes(signal); }
  save(request: DiscoveryNoteRequest, signal?: AbortSignal) { return this.api.saveDiscoveryNote(request, signal); }
  remove(id: number, signal?: AbortSignal) { return this.api.deleteDiscoveryNote(id, signal); }
  error(error: unknown): string {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) return '利用上限に達したか、送信間隔が短すぎます。時間をおいてお試しください。';
      if (error.response?.status === 401 || error.response?.status === 403) return 'ログインを確認してください。';
    }
    return '通信を確認できませんでした。入力は残っています。時間をおいてお試しください。';
  }
}
