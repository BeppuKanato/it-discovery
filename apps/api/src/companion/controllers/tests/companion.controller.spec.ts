import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CompanionModule } from '../../companion.module';
import { GeminiClient } from '../../services/gemini-client';
import { GoogleAccessGuard } from '../../../infrastructure/http/google-access.guard';
import type { GoogleIdentityService } from '../../../auth/services/google-identity.service';

describe('相棒APIの認証とHTTP入出力', () => {
  let app: INestApplication; let base: string;
  const previous = process.env['DATABASE_PATH'];
  beforeAll(async () => {
    process.env['DATABASE_PATH'] = ':memory:';
    app = await NestFactory.create(CompanionModule, { logger: false });
    const identities = { config: { mode: 'google' }, verify: async (token: string) => ({ subject: '1', allowed: token === 'allowed', expiresAt: Date.now() + 60000 }) };
    app.useGlobalGuards(new GoogleAccessGuard(identities as unknown as GoogleIdentityService, { health: '/api/health', identity: '/api/auth/identity' }));
    jest.spyOn(app.get(GeminiClient), 'configured').mockReturnValue(true);
    jest.spyOn(app.get(GeminiClient), 'reply').mockResolvedValue('その使い方は気になるね。');
    app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1'); base = `${await app.getUrl()}/api/companion`;
  });
  afterAll(async () => { await app.close(); if (previous === undefined) delete process.env['DATABASE_PATH']; else process.env['DATABASE_PATH'] = previous; });
  const headers = { Authorization: 'Bearer allowed', 'Content-Type': 'application/json' };
  it('会話とノートを未ログイン・未登録アカウントから守る', async () => {
    for (const path of ['/chat', '/notes']) {
      const method = path === '/chat' ? 'POST' : 'GET';
      expect((await fetch(base + path, { method })).status).toBe(401);
      expect((await fetch(base + path, { method, headers: { Authorization: 'Bearer denied' } })).status).toBe(403);
    }
  });
  it('短い会話を返し、ノートは明示的に保存・取得・削除する', async () => {
    const reply = await fetch(base + '/chat', { method: 'POST', headers, body: JSON.stringify({ message: '発見した', history: [] }) });
    expect(reply.status).toBe(201); expect(reply.headers.get('cache-control')).toBe('no-store');
    expect(await reply.json()).toEqual({ text: 'その使い方は気になるね。' });
    expect(await fetch(base + '/notes', { headers }).then(r => r.json())).toEqual([]);
    const saved = await fetch(base + '/notes', { method: 'POST', headers, body: JSON.stringify({ text: '試してみたい' }) }).then(r => r.json()) as { id: number };
    expect((await fetch(base + '/notes', { headers }).then(r => r.json()) as unknown[])).toHaveLength(1);
    expect((await fetch(base + `/notes/${saved.id}`, { method: 'DELETE', headers })).status).toBe(200);
    expect(await fetch(base + '/notes', { headers }).then(r => r.json())).toEqual([]);
  });
  it('不正な入力や不正なノートIDは拒否する', async () => {
    expect((await fetch(base + '/chat', { method: 'POST', headers, body: JSON.stringify({ message: 'x'.repeat(801), history: [] }) })).status).toBe(400);
    expect((await fetch(base + '/notes/-1', { method: 'DELETE', headers })).status).toBe(400);
  });
});
