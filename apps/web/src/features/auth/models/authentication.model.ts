import type { AuthApiClient, LoginIdentity } from '../../../infrastructure/auth/auth-api-client';
import type { AuthSession } from '../../../infrastructure/auth/auth-session';
// 認証の窓口。許可の判断はサーバーの検証結果だけを使い、JWTの自己デコードではログインさせない。
export class AuthenticationModel {
  constructor(readonly clientId: string, readonly development: boolean,
    private readonly api: Pick<AuthApiClient, 'identify'>, private readonly session: AuthSession) {}
  async identify(token: string): Promise<LoginIdentity> { return this.api.identify(token); }
  accept(token: string, identity: LoginIdentity): void {
    if (!identity.allowed || identity.expiresAt <= Date.now()) throw new Error('ログインできません。');
    this.session.set(token, identity.expiresAt);
  }
  subscribe(listener: (message: string) => void): () => void { return this.session.subscribe(listener); }
  expire(): void { this.session.clear('ログインの有効期限が切れました。未送信の仕分けを残しています。もう一度ログインしてください。'); }
  logout(): void { this.session.clear('ログアウトしました。端末の未送信の仕分けは残しています。'); }
}
