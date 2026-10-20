import { ArticleRetentionService } from './services/article-retention.service';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { ArticleRepository } from './repositories/article.repository';
import { ArticleService } from './services/article.service';
import { SqliteArticleRepository } from './repositories/sqlite-article.repository';
import { ArticlesController } from './controllers/articles.controller';
import { ArticleStateService } from './services/article-state.service';
import { ArticleStateController } from './controllers/article-state.controller';

import { ArticleSortingService } from './services/article-sorting.service';
import { ArticleInterestBatchRepository } from './repositories/article-interest-batch.repository';
import { SqliteArticleInterestBatchRepository } from './repositories/sqlite-article-interest-batch.repository';
import { SortingController } from './controllers/sorting.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ArticlesController, ArticleStateController, SortingController],
  // 抽象の名前で要求された部品へ、どの実装を渡すかをここで組み合わせる。
  providers: [ArticleRetentionService, ArticleService, ArticleStateService, ArticleSortingService,
    { provide: ArticleRepository, useClass: SqliteArticleRepository },
    { provide: ArticleInterestBatchRepository, useClass: SqliteArticleInterestBatchRepository }],
  exports: [ArticleRetentionService, ArticleService, ArticleStateService, ArticleSortingService],
})
export class ArticlesModule {}
