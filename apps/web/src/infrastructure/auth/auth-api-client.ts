import axios from 'axios';
export interface LoginIdentity { subject: string; expiresAt: number; allowed: boolean }
export class AuthApiClient {
  constructor(private readonly baseURL: string) {}
  async identify(token: string): Promise<LoginIdentity> {
    const { data } = await axios.get<unknown>(`${this.baseURL.replace(/\/$/, '')}/auth/identity`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 10_000,
    });
    if (!data || typeof data !== 'object' || !('subject' in data) || typeof data.subject !== 'string'
      || !/^\d{1,255}$/.test(data.subject) || !('expiresAt' in data) || typeof data.expiresAt !== 'number'
      || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() || !('allowed' in data) || typeof data.allowed !== 'boolean') {
      throw new Error('ログインの応答を確認できませんでした。');
    }
    return { subject: data.subject, expiresAt: data.expiresAt, allowed: data.allowed };
  }
}
