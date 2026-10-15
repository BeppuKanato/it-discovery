import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { ArticleRepository } from './application/article.repository';
import { ArticleService } from './application/article.service';
import { SqliteArticleRepository } from './persistence/sqlite-article.repository';
import { ArticlesHttpController } from './articles-http.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ArticlesHttpController],
  providers: [ArticleService, { provide: ArticleRepository, useClass: SqliteArticleRepository }],
  exports: [ArticleService],
})
export class ArticlesModule {}
