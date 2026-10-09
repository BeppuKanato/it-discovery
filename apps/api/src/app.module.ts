import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import serverConfig from './config/server.config';
import { HealthController } from './health/health.controller';
import { ArticlesModule } from './articles/articles.module';
import { StorageConfigModule } from './config/storage-config.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [serverConfig] }), ArticlesModule, StorageConfigModule],
  controllers: [HealthController],
})
export class AppModule {}
