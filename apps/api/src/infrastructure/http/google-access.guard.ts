import { ForbiddenException, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { GoogleIdentityService, VerifiedIdentity } from '../../auth/services/google-identity.service';
export interface IdentityRequest { method: string; url: string; headers: { authorization?: string }; identity?: VerifiedIdentity }
export interface AccessRoutes { health: string; identity: string }
// 全APIに適用する境界。例外の経路はmain.tsで明示し、Controllerの隠れた除外デコレーターは使わない。
export class GoogleAccessGuard implements CanActivate {
  constructor(private readonly identities: GoogleIdentityService, private readonly routes: AccessRoutes) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IdentityRequest>();
    const response = context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>();
    response.setHeader('Cache-Control', 'no-store');
    const path = request.url.split('?')[0];
    if (request.method === 'GET' && path === this.routes.health) return true;
    if (this.identities.config.mode === 'disabled') return true;
    const match = /^Bearer ([^\s]{1,16384})$/.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Googleログインが必要です。');
    const identity = await this.identities.verify(match[1]!);
    // この入口は本人の検証済みsubの確認専用。許可リストや記事データは返さず、自動登録もしない。
    if (!(request.method === 'GET' && path === this.routes.identity) && !identity.allowed) {
      throw new ForbiddenException('このGoogleアカウントは登録されていません。');
    }
    request.identity = identity;
    return true;
  }
}
