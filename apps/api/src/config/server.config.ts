import { registerAs } from '@nestjs/config';

export interface ServerConfig {
  host: string;
  port: number;
  corsOrigins: string[];
}

// サーバー設定を読み、不正なポートとCORS設定を起動前に拒否する。
export function readServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const rawPort = env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
    throw new Error('PORTは1〜65535の整数で指定してください。');
  }
  const host = env.HOST?.trim() ?? '127.0.0.1';
  if (!host) throw new Error('HOSTは空にできません。');

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of corsOrigins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINSにはhttp(s)オリジンを指定してください。');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('CORS_ORIGINSにはパスや*を含まないhttp(s)オリジンを指定してください。');
    }
  }
  return { host, port, corsOrigins };
}

export default registerAs('server', () => readServerConfig(process.env));
