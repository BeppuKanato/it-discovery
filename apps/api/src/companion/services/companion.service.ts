import { Inject, Injectable, ServiceUnavailableException, HttpException } from '@nestjs/common';
import { CompanionRepository } from '../repositories/companion.repository';
import { GeminiClient } from './gemini-client';
import { parseChat, parseNote } from '../validators/companion-input';
import { parseNotebookDate, parseNotebookMonth, parseNotebookOffset } from '../validators/notebook-query';
@Injectable()
export class CompanionService {
  private chatting = false;
  constructor(@Inject(CompanionRepository) private readonly repository: CompanionRepository,
    @Inject(GeminiClient) private readonly gemini: GeminiClient) {}
  async chat(input: unknown): Promise<{ text: string }> {
    const request = parseChat(input);
    if (!this.gemini.configured()) throw new ServiceUnavailableException('会話の準備中です。後でもう一度お試しください。');
    if (this.chatting) throw new HttpException('返事を待ってから話しかけてください。', 429);
    const article = request.articleId ? this.repository.article(request.articleId) : undefined;
    this.repository.reserve();
    this.chatting = true;
    try {
      // 記事と履歴は非信頼の参考データとしてJSONにまとめる。固定の指示はGeminiClientに置く。
      return { text: await this.gemini.reply(JSON.stringify({
        referenceArticle: article ? { title: article.title.slice(0, 240), summary: article.description?.slice(0, 800) ?? null, fullTextAvailable: false } : null,
        recentConversation: request.history, userMessage: request.message,
      })) };
    } finally { this.chatting = false; }
  }
  listNotes() { return this.repository.listNotes(); }
  noteCalendar(month: unknown) { return this.repository.noteCalendar(parseNotebookMonth(month)); }
  noteDay(date: unknown, offset: unknown) { return this.repository.noteDay(parseNotebookDate(date), parseNotebookOffset(offset)); }
  saveNote(input: unknown) { const note = parseNote(input); return this.repository.saveNote(note.text, note.articleId); }
  deleteNote(id: number) { this.repository.deleteNote(id); }
}
