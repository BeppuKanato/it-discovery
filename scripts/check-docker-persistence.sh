#!/usr/bin/env bash
# CI専用の一時ボリュームで実行する。既存のcomposeや本番ボリュームには触れない。
set -euo pipefail
image="${1:-it-discovery-api:check}"
volume="it-discovery-ci-$(date +%s)-${RANDOM}"
container="${volume}-api"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker volume create "$volume" >/dev/null
start() {
  docker run -d --name "$container" --mount "type=volume,source=$volume,target=/data" "$image" >/dev/null
  for attempt in $(seq 1 60); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
    if [ "$status" = healthy ]; then return; fi
    if [ "$status" = unhealthy ]; then break; fi
    sleep 1
  done
  docker logs "$container"
  return 1
}
start
# サンプルの登録はHTTPへ公開せず、検証対象コンテナのService経由で行う。
docker exec -i "$container" node <<'JS'
const {DatabaseService}=require('./apps/api/dist/infrastructure/database/database.service');
const {SqliteArticleRepository}=require('./apps/api/dist/articles/repositories/sqlite-article.repository');
const {ArticleService}=require('./apps/api/dist/articles/services/article.service');
const database=new DatabaseService();
try {
  const articles=new ArticleService(new SqliteArticleRepository(database));
  const row=articles.register({sourceId:'zenn',externalArticleId:'docker-check',url:'https://example.com/docker-check',title:'保存確認'});
  articles.updateState(row.article.articleId,{interested:true,pinned:true,lastOpenedAt:new Date('2026-10-20T00:00:00Z')});
} finally {database.onApplicationShutdown();}
JS
docker stop --time 60 "$container" >/dev/null
test "$(docker inspect --format '{{.State.ExitCode}}' "$container")" = 0
docker rm "$container" >/dev/null
start
docker exec -i "$container" node <<'JS'
(async()=>{
  const response=await fetch('http://127.0.0.1:3000/api/articles?kind=interested');
  if(response.status!==401)throw Error('production API must reject anonymous access');
  const {DatabaseService}=require('./apps/api/dist/infrastructure/database/database.service');
  const {SqliteArticleRepository}=require('./apps/api/dist/articles/repositories/sqlite-article.repository');
  const database=new DatabaseService();
  const repository=new SqliteArticleRepository(database);
  const {toArticleListItem}=require('./apps/api/dist/articles/controllers/formatters/article.formatter');
  const rows=repository.findPage({kind:'interested',limit:20});
  database.onApplicationShutdown();
  const result={articles:rows.map(toArticleListItem)};

  const row=result.articles.find(a=>a.title==='保存確認');
  if(!row||!row.state.interested||!row.state.pinned||row.state.lastOpenedAt!=='2026-10-20T00:00:00.000Z')throw Error('persistent state missing: '+JSON.stringify(result));
  console.log('container recreation preserves article/interested/pinned/read: PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
JS
