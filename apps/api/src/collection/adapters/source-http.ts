import { SourceFetchError } from '../models/source-adapter';

// 外部通信だけを差し替えられるようにする。テストは固定レスポンスで実行する。
export type SourceTransport = typeof fetch;
const MAX_BYTES = 20 * 1024 * 1024;

export class SourceHttp {
  constructor(private readonly transport: SourceTransport = fetch) {}

  async get(url: string, headers: Record<string, string> = {}, redirects: RequestRedirect = 'follow'): Promise<string> {
    let response: Response;
    try {
      response = await this.transport(url, {
        headers: { 'User-Agent': 'it-discovery', ...headers },
        redirect: redirects, signal: AbortSignal.timeout(25_000),
      });
    } catch { throw new SourceFetchError('network'); }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new SourceFetchError('http', response.status);
    }
    // Content-Lengthがなくても上限を守り、異常に大きいフィードをメモリへ展開しない。
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new SourceFetchError('format'); }
        chunks.push(part.value);
      }
    } catch (error) {
      if (error instanceof SourceFetchError) throw error;
      throw new SourceFetchError('network');
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks).toString('utf8');
  }
}
