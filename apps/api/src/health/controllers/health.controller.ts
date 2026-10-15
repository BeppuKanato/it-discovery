import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@it-discovery/contracts';

@Controller('health')
export class HealthController {
  // サーバーが応答できることを返す。
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', message: 'サーバーに接続できました。' };
  }
}
