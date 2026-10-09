import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ArticleRepository } from './domain/article.repository';
import { SqliteArticleRepository } from './persistence/sqlite-article.repository';

@Module({
  imports: [DatabaseModule],
  providers: [{ provide: ArticleRepository, useClass: SqliteArticleRepository }],
  exports: [ArticleRepository],
})
export class ArticlesModule {}
