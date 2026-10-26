import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { AuthConfig } from '../models/auth-config';

export interface VerifiedIdentity { subject: string; expiresAt: number; allowed: boolean }
@Injectable()
export class GoogleIdentityService {
  private readonly client = new OAuth2Client();
  readonly config: AuthConfig;
  constructor(config: ConfigService) { this.config = config.getOrThrow<AuthConfig>('auth'); }
  // Google公式ライブラリが署名・aud・issを検証する。識別には変更され得るメールでなくsubを使う。
  async verify(token: string): Promise<VerifiedIdentity> {
    if (!this.config.clientId) throw new ServiceUnavailableException('Googleログインが未設定です。');
    try {
      const ticket = await this.client.verifyIdToken({ idToken: token, audience: this.config.clientId });
      const payload = ticket.getPayload();
      // ライブラリの時計ずれ許容とは別に、アプリでは有効期限を過ぎたトークンを使わない。
      if (!payload?.sub || !/^\d{1,255}$/.test(payload.sub) || !Number.isFinite(payload.exp)
        || payload.exp * 1000 <= Date.now()) throw new Error('expired or missing identity');
      return { subject: payload.sub, expiresAt: payload.exp * 1000, allowed: this.config.allowedSubjects.has(payload.sub) };
    } catch { throw new UnauthorizedException('Googleログインをやり直してください。'); }
  }
}
