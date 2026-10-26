import { Controller, Get, Header, Inject } from '@nestjs/common';
import type { ArticleSource } from '@it-discovery/contracts';
import { SettingsService } from '../services/settings.service';

@Controller('sources')
export class SourcesController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(): ArticleSource[] {
    // 停止中の取得先にも過去記事が残る。フィルターには表示名だけを渡す。
    return this.settings.listSources().map(({ sourceId, siteName, iconUrl }) => ({ sourceId, siteName, iconUrl }));
  }
}
