// トークンはこのメモリだけに保持し、localStorage・IndexedDB・ログには書かない。
export class AuthSession {
  private credential: string | null = null;
  private expiresAt = 0;
  private listener: ((message: string) => void) | undefined;
  set(token: string, expiresAt: number): void { this.credential = token; this.expiresAt = expiresAt; }
  token(): string | null {
    if (this.credential && this.expiresAt <= Date.now()) this.clear('ログインの有効期限が切れました。もう一度ログインしてください。');
    return this.credential;
  }
  reject(token: string, status: number): void {
    // 古い要求の401が、新しいログインのトークンを消さないよう照合する。
    if (this.credential === token) this.clear(status === 403 ? 'このアカウントの利用は許可されていません。' : 'もう一度Googleでログインしてください。');
  }
  clear(message: string): void { this.credential = null; this.expiresAt = 0; this.listener?.(message); }
  subscribe(listener: (message: string) => void): () => void { this.listener = listener; return () => { this.listener = undefined; }; }
}
