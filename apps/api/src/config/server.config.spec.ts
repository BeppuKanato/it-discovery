import { readServerConfig } from './server.config';

describe('サーバーの設定', () => {
  it('設定なしではローカルで起動し、CORSを開放しない', () => {
    expect(readServerConfig({})).toEqual({ host: '127.0.0.1', port: 3000, corsOrigins: [] });
  });

  it('別ポートと許可するオリジンを読み込む', () => {
    expect(readServerConfig({ PORT: '4100', CORS_ORIGINS: 'https://example.com, http://localhost:5173' }))
      .toMatchObject({ port: 4100, corsOrigins: ['https://example.com', 'http://localhost:5173'] });
  });

  it.each(['', '0', '65536', '3.5', '3000oops'])('不正なポート%sを拒否する', (port) => {
    expect(() => readServerConfig({ PORT: port })).toThrow('PORT');
  });

  it.each(['*', 'https://example.com/path', 'https://example.com/', 'file:///tmp', 'invalid'])
    ('不正なオリジン%sを拒否する', (origin) => {
      expect(() => readServerConfig({ CORS_ORIGINS: origin })).toThrow('CORS_ORIGINS');
    });
});
