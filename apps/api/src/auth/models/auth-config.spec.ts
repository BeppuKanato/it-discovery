import { readAuthConfig } from './auth-config';
describe('認証設定', () => {
  it('本番は設定がなくてもgoogle認証で閉じる', () => {
    const config = readAuthConfig({ NODE_ENV: 'production' });
    expect(config.mode).toBe('google'); expect(config.allowedSubjects.size).toBe(0);
  });
  it('本番の認証無効化と不正な設定を拒否する', () => {
    expect(() => readAuthConfig({ NODE_ENV: 'production', AUTH_MODE: 'disabled' })).toThrow();
    expect(() => readAuthConfig({ AUTH_MODE: 'other' })).toThrow();
    expect(() => readAuthConfig({ GOOGLE_ALLOWED_SUBS: 'someone@example.com' })).toThrow();
    expect(() => readAuthConfig({ GOOGLE_CLIENT_ID: 'wrong' })).toThrow();
  });
  it('開発は既存のローカル起動を維持し、許可subを列挙できる', () => {
    expect(readAuthConfig({ NODE_ENV: 'development' }).mode).toBe('disabled');
    expect([...readAuthConfig({ GOOGLE_ALLOWED_SUBS: '123, 456' }).allowedSubjects]).toEqual(['123', '456']);
  });
});
