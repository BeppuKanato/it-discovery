import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { CompanionController } from './controllers/companion.controller';
import { CompanionService } from './services/companion.service';
import { CompanionRepository } from './repositories/companion.repository';
import { GeminiClient } from './services/gemini-client';
@Module({ imports: [DatabaseModule], controllers: [CompanionController],
  providers: [CompanionService, CompanionRepository, { provide: GeminiClient, useFactory: () => new GeminiClient() }] })
export class CompanionModule {}
