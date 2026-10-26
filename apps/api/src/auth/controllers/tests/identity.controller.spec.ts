import 'reflect-metadata';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { CertificateFormat } from 'google-auth-library/build/src/auth/oauth2client';
import { AppModule } from '../../../app.module';
import { GoogleIdentityService } from '../../services/google-identity.service';
import { GoogleAccessGuard } from '../../../infrastructure/http/google-access.guard';
import { ArticleService } from '../../../articles/services/article.service';

// 検証ライブラリそのものを通す。外部通信の証明書取得だけ架空のRSA公開鍵へ差し替える。
describe('Google認証と全APIの利用制限', () => {
  const clientId = '123-test.apps.googleusercontent.com';
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const oldEnv = { ...process.env };
  let app: INestApplication; let base: string; let directory: string; let articleId: number;
  function token(overrides: Record<string, unknown> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: clientId, sub: '123456789', iat: now, exp: now + 3600, ...overrides })).toString('base64url');
    const body = `${header}.${payload}`;
    return `${body}.${sign('RSA-SHA256', Buffer.from(body), keys.privateKey).toString('base64url')}`;
  }
  async function request(path: string, credential?: string, method = 'GET', body?: unknown) {
    return fetch(`${base}${path}`, { method, headers: { ...(credential ? { Authorization: `Bearer ${credential}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'it-discovery-auth-'));
    process.env.DATABASE_PATH = join(directory, 'auth.db'); process.env.AUTH_MODE = 'google';
    process.env.GOOGLE_CLIENT_ID = clientId; process.env.GOOGLE_ALLOWED_SUBS = '123456789';
    jest.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({
      certs: { test: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, format: CertificateFormat.PEM,
    });
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalGuards(new GoogleAccessGuard(app.get(GoogleIdentityService), { health: '/api/health', identity: '/api/auth/identity' }));
    await app.listen(0, '127.0.0.1'); base = `${await app.getUrl()}/api`;
    articleId = app.get(ArticleService).register({ sourceId: 'zenn', externalArticleId: 'auth-test', url: 'https://example.com/auth', title: '認証確認' }).article.articleId;
  }, 30000);
  afterAll(async () => { await app?.close(); jest.restoreAllMocks(); process.env = oldEnv; if (directory) rmSync(directory, { recursive: true, force: true }); });
  it('healthだけ未認証で利用でき、GET・PUT・仕分けを閉じる', async () => {
    expect((await request('/health')).status).toBe(200);
    for (const path of ['/sources', '/articles', '/sorting/candidates', '/auth/identity', `/articles/${articleId}/state`]) {
      const response = await request(path); expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect((await request(`/articles/${articleId}/state`, undefined, 'PUT', { change: { kind: 'pinned', value: true } })).status).toBe(401);
    expect((await request('/sorting/interest-batches/00000000-0000-4000-8000-000000000001', undefined, 'PUT', { revision: 1, articleIds: [articleId] })).status).toBe(401);
    expect((await request('/health/anything')).status).toBe(404);
    expect((await request('/unknown')).status).toBe(404);
  });
  it('未登録の本人には検証済みIDだけ返し、記事の参照・変更を許さない', async () => {
    const credential = token({ sub: '987654321' });
    const identity = await request('/auth/identity', credential);
    expect(identity.status).toBe(200); expect(await identity.json()).toMatchObject({ subject: '987654321', allowed: false });
    expect((await request('/sources', credential)).status).toBe(403);
    expect((await request('/articles', credential)).status).toBe(403);
    expect((await request(`/articles/${articleId}/state`, credential, 'PUT', { change: { kind: 'pinned', value: true } })).status).toBe(403);
    expect(app.get(ArticleService).getPage({ kind: 'all', limit: 20 }).articles[0]?.state.pinned).toBe(false);
  });
  it('登録済み本人だけ記事の取得・変更ができる', async () => {
    const credential = token();
    expect((await request('/sources', credential)).status).toBe(200);
    expect((await request('/articles', credential)).status).toBe(200);
    expect((await request(`/articles/${articleId}/state`, credential, 'PUT', { change: { kind: 'pinned', value: true } })).status).toBe(200);
    expect(await (await request('/auth/identity', credential)).json()).toMatchObject({ subject: '123456789', allowed: true });
  });
  it.each([{ aud: 'other' }, { iss: 'https://evil.example' }, { exp: Math.floor(Date.now()/1000)-1 }, { sub: '' }])('不正なaud・iss・期限・subを拒否する: %j', async claims => {
    expect((await request('/articles', token(claims))).status).toBe(401);
  });
  it('署名改ざんとJWT以外を拒否する', async () => {
    const parts = token().split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: '123456789' })).toString('base64url');
    expect((await request('/articles', parts.join('.'))).status).toBe(401);
    expect((await request('/articles', 'not-a-token')).status).toBe(401);
  });
  it('許可リスト未設定でも自動登録しない', async () => {
    const service = app.get(GoogleIdentityService);
    const original = service.config.allowedSubjects;
    Object.assign(service.config, { allowedSubjects: new Set() });
    try { expect((await request('/articles', token())).status).toBe(403); }
    finally { Object.assign(service.config, { allowedSubjects: original }); }
  });
});
