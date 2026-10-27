// 会話の表示状態はフロントのVMが持ち、APIには必要な直近の発言だけ渡す。
export interface CompanionMessage { role: 'user' | 'model'; text: string }
export interface CompanionChatRequest { message: string; history: CompanionMessage[]; articleId?: number }
export interface CompanionChatResponse { text: string }
export interface DiscoveryNote { id: number; text: string; articleId: number | null; articleTitle: string | null; createdAt: string }
export interface DiscoveryNoteRequest { text: string; articleId?: number }

// 日付は端末のタイムゾーンではなく、日本時間の暦日（YYYY-MM-DD）でそろえる。
export interface DiscoveryNoteCalendar {
  month: string;
  days: { date: string; count: number }[];
  totalCount: number;
  firstMonth: string | null;
  lastMonth: string | null;
}
export interface DiscoveryNoteDay {
  date: string;
  offset: number;
  totalCount: number;
  // 元記事が保持期限で削除された場合も、保存時のタイトルと本人の文章は残す。
  note: (DiscoveryNote & { articleUrl: string | null }) | null;
}
