import { registerAs } from '@nestjs/config';

export interface AuthConfig { mode: 'google' | 'disabled'; clientId: string; allowedSubjects: ReadonlySet<string> }
// 配布用コンテナはproduction。設定漏れでもAPIを公開せず、healthだけ起動できる。
export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const mode = env.AUTH_MODE ?? (env.NODE_ENV === 'production' ? 'google' : 'disabled');
  if (mode !== 'google' && mode !== 'disabled') throw new Error('AUTH_MODEはgoogleまたはdisabledです。');
  if (mode === 'disabled' && env.NODE_ENV === 'production') throw new Error('本番では認証を無効にできません。');
  const clientId = (env.GOOGLE_CLIENT_ID ?? '').trim();
  if (clientId && !/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('GOOGLE_CLIENT_IDの形式が不正です。');
  const subjects = (env.GOOGLE_ALLOWED_SUBS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (subjects.some(value => !/^\d{1,255}$/.test(value))) throw new Error('GOOGLE_ALLOWED_SUBSにはGoogleのsubを指定してください。');
  return { mode, clientId, allowedSubjects: new Set(subjects) };
}
export default registerAs('auth', () => readAuthConfig(process.env));
