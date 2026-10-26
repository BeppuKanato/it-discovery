// 会話の表示状態はフロントのVMが持ち、APIには必要な直近の発言だけ渡す。
export interface CompanionMessage { role: 'user' | 'model'; text: string }
export interface CompanionChatRequest { message: string; history: CompanionMessage[]; articleId?: number }
export interface CompanionChatResponse { text: string }
export interface DiscoveryNote { id: number; text: string; articleId: number | null; articleTitle: string | null; createdAt: string }
export interface DiscoveryNoteRequest { text: string; articleId?: number }
