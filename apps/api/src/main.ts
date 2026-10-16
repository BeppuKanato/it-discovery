import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { ServerConfig } from './config/server.config';

// APIの経路と通信設定を適用してサーバーを起動する。
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService).getOrThrow<ServerConfig>('server');
  // 全Controller共通のHTTP設定はここにまとめる。独自のグローバルPipe・Filterは現在未登録。
  // 機能固有の入力変換やエラー変換は、各Controllerのデコレーターで明示する。
  app.setGlobalPrefix('api');
  if (config.corsOrigins.length > 0) {
    app.enableCors({ origin: config.corsOrigins });
  }
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
