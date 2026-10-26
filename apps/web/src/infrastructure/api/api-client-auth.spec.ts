import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api-client';
import { AuthSession } from '../auth/auth-session';
import { page } from '../../test/article-fixture';
let server: Server; let baseURL: string; let requests: string[]; let status: number;
beforeEach(async () => {
  requests = []; status = 200;
  server = createServer((request, response) => {
    requests.push(request.headers.authorization ?? '');
    response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(page([1])));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('test server unavailable');
  baseURL = `http://127.0.0.1:${address.port}/api`;
});
afterEach(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
describe('認証付きAPI通信', () => {
  it('メモリのトークンをBearerで送り、トークンなしでは通信しない', async () => {
    const session = new AuthSession(); const api = new ApiClient(baseURL, session);
    await expect(api.getArticlePage({})).rejects.toMatchObject({ status: 401 }); expect(requests).toEqual([]);
    session.set('test-token', Date.now()+10000);
    await api.getArticlePage({}); expect(requests).toEqual(['Bearer test-token']);
  });
  it.each([401, 403])('HTTP %iで認証を解消し、更新を自動再送しない', async code => {
    status = code; const session = new AuthSession(); session.set('test-token', Date.now()+10000);
    const rejected = vi.fn(); session.subscribe(rejected);
    await expect(new ApiClient(baseURL, session).updateArticleState(1, { change: { kind: 'pinned', value: true } })).rejects.toMatchObject({ status: code });
    expect(requests).toHaveLength(1); expect(rejected).toHaveBeenCalledTimes(1); expect(session.token()).toBeNull();
  });
  it('期限切れトークンは送信前に止める', async () => {
    const session = new AuthSession(); session.set('expired', Date.now()-1);
    await expect(new ApiClient(baseURL, session).getArticlePage({})).rejects.toMatchObject({ status: 401 }); expect(requests).toEqual([]);
  });
});
