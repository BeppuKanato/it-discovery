import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { ArticleRepository } from './repositories/article.repository';
import { ArticleService } from './services/article.service';
import { SqliteArticleRepository } from './repositories/sqlite-article.repository';
import { ArticlesController } from './controllers/articles.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ArticlesController],
  providers: [ArticleService, { provide: ArticleRepository, useClass: SqliteArticleRepository }],
  exports: [ArticleService],
})
export class ArticlesModule {}
