import { CompanionModule } from './companion/companion.module';
import authConfig from './auth/models/auth-config';
import { AuthModule } from './auth/auth.module';
import { CollectionModule } from './collection/collection.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import serverConfig from './config/server.config';
import { HealthController } from './health/controllers/health.controller';
import { ArticlesModule } from './articles/articles.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [CompanionModule, ConfigModule.forRoot({ isGlobal: true, load: [serverConfig, authConfig] }), AuthModule, ArticlesModule, SettingsModule, CollectionModule],
  controllers: [HealthController],
})
export class AppModule {}
