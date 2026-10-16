import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { ArticleRepository } from './repositories/article.repository';
import { ArticleService } from './services/article.service';
import { SqliteArticleRepository } from './repositories/sqlite-article.repository';
import { ArticlesController } from './controllers/articles.controller';
import { ArticleStateService } from './services/article-state.service';
import { ArticleStateOperationRepository } from './repositories/article-state-operation.repository';
import { SqliteArticleStateOperationRepository } from './repositories/sqlite-article-state-operation.repository';
import { ArticleStateController } from './controllers/article-state.controller';
import { ArticleStateOperationController } from './controllers/article-state-operation.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ArticlesController, ArticleStateController, ArticleStateOperationController],
  // 抽象の名前で要求された部品へ、どの実装を渡すかをここで組み合わせる。
  providers: [ArticleService, ArticleStateService,
    { provide: ArticleRepository, useClass: SqliteArticleRepository },
    { provide: ArticleStateOperationRepository, useClass: SqliteArticleStateOperationRepository }],
  exports: [ArticleService, ArticleStateService],
})
export class ArticlesModule {}
