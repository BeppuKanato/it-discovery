import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import serverConfig from './config/server.config';
import { HealthController } from './health/controllers/health.controller';
import { ArticlesModule } from './articles/articles.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [serverConfig] }), ArticlesModule, SettingsModule],
  controllers: [HealthController],
})
export class AppModule {}
