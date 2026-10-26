import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { companionPrompt } from '../models/companion-prompt';
@Injectable()
export class GeminiClient {
  // fetchは外部通信の境界。テストでは差し替え、本物のキーや有料通信を使わない。
  constructor(private readonly transport: typeof fetch = fetch) {}
  configured(): boolean { return !!process.env['GEMINI_API_KEY']?.trim(); }
  async reply(input: string): Promise<string> {
    const key = process.env['GEMINI_API_KEY']?.trim();
    if (!key) throw new ServiceUnavailableException('会話の準備中です。後でもう一度お試しください。');
    const model = process.env['GEMINI_MODEL'] || 'gemini-3.1-flash-lite';
    // 意図しない高額モデルや外部URLへ切り替えない。モデル変更はコードと料金を見直して行う。
    if (model !== 'gemini-3.1-flash-lite') throw new ServiceUnavailableException('会話モデルの設定を確認してください。');
    try {
      const response = await this.transport(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: companionPrompt }] },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: { maxOutputTokens: 384, thinkingConfig: { thinkingLevel: 'MINIMAL' } } }),
      });
      if (!response.ok) { await response.body?.cancel(); throw Error('upstream'); }
      const data = await response.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? '').join('').trim();
      if (!text || candidate?.finishReason !== 'STOP' || text.length > 1600) throw Error('invalid reply');
      return text;
    } catch {
      // 生のGoogle応答・キー・会話文をログやHTTPエラーへ流さない。自動再送もしない。
      throw new ServiceUnavailableException('今は返事を受け取れませんでした。少し待って、もう一度お試しください。');
    }
  }
}
