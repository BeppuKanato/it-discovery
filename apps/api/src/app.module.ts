import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import serverConfig from './config/server.config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [serverConfig] })],
  controllers: [HealthController],
})
export class AppModule {}
