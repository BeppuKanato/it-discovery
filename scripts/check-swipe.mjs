import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// 実サイト・本番DBを使わず、実際のVue画面へタッチ入力を送る。
// DEVの認証省略は既存仕様。本番認証の設定は変更しない。
const origin = 'http://127.0.0.1:5179';
const server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))], {
  cwd: fileURLToPath(new URL('../apps/web', import.meta.url)),
  env: { ...process.env, WEB_PORT: '5179', VITE_AUTH_MODE: 'disabled', VITE_API_BASE_URL: '/api' },
  stdio: 'inherit',
});
let browser;
let diagnosticsPage;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (attempt > 100 || server.exitCode !== null) throw new Error('Viteの起動失敗');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); diagnosticsPage = page;
  page.setDefaultTimeout(15000);
  const articles = [3, 2, 1].map(articleId => ({
    articleId, url: `https://example.com/${articleId}`, title: `スワイプ検証記事${articleId}`,
    description: 'カード上から左右へ指を動かして仕分けます。', author: null,
    fetchedAt: '2026-10-01T00:00:00.000Z', publishedAt: null, sourceUpdatedAt: null,
    source: { sourceId: articleId === 2 ? 'other' : 'zenn', siteName: articleId === 2 ? 'Other' : 'Zenn', iconUrl: null },
    state: { interested: false, pinned: false, lastOpenedAt: null },
  }));
  let unexpectedWrites = 0;
  await page.route(`${origin}/api/**`, async route => {
    if (route.request().method() !== 'GET') unexpectedWrites++;
    const url = new URL(route.request().url());
    const path = url.pathname;
    const sourceId = url.searchParams.get('sourceId');
    const body = path === '/api/sorting/candidates' ? { articles }
      : path === '/api/sources' ? [{ sourceId: 'zenn', siteName: 'Zenn', iconUrl: null }, { sourceId: 'other', siteName: 'Other', iconUrl: null }]
      : path === '/api/articles' ? { articles: articles.filter(item => !sourceId || item.source.sourceId === sourceId), hasMore: false, nextCursor: null }
      : { status: 'ok', message: 'test' };
    await route.fulfill({ json: body });
  });
  await page.goto(origin);
  await page.getByText('0 / 3 件を判断', { exact: true }).waitFor();
  const card = page.getByRole('group', { name: /仕分けカード/ });
  const client = await context.newCDPSession(page);
  async function swipe(dx, dy = 0, during) {
    await card.scrollIntoViewIfNeeded();
    // 最初の接触点を実際の子リンクの中央に置く。暗黙captureの移動も発生する。
    const box = await card.locator('.article-link').boundingBox();
    assert.ok(box);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const send = (type, px, py) => client.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }],
    });
    await send('touchStart', x, y);
    for (let step = 1; step <= 12; step++) {
      await send('touchMove', x + dx * step / 12, y + dy * step / 12);
      await page.waitForTimeout(16);
    }
    if (during) await during();
    await send('touchEnd', x + dx, y + dy);
  }
  await swipe(120, 4, async () => {
    const transform = await card.locator('.moving-card').evaluate(node => getComputedStyle(node).transform);
    assert.ok(transform.startsWith('matrix('), transform);
    assert.ok(Number(transform.slice(7, -1).split(',')[4]) > 80, transform);
    assert.ok(await card.getByText('気になる', { exact: true }).isVisible());
  });
  await page.getByText('1 / 3 件を判断', { exact: true }).waitFor();
  await page.getByText('気になる 1 件を仮選択', { exact: true }).waitFor();
  await swipe(-120, 4);
  await page.getByText('2 / 3 件を判断', { exact: true }).waitFor();
  await swipe(30, 0);
  await page.waitForTimeout(300);
  assert.ok(await page.getByText('2 / 3 件を判断', { exact: true }).isVisible());
  await swipe(4, 100);
  await page.waitForTimeout(300);
  assert.ok(await page.getByText('2 / 3 件を判断', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'ひとつ戻す' }).click();
  await page.getByText('1 / 3 件を判断', { exact: true }).waitFor();
  assert.equal(unexpectedWrites, 0, '判断中はサーバー更新を待たない');
  // 仮選択を戻して全件見送りで終了し、通常の一覧へ進む。
  await page.getByRole('button', { name: 'ひとつ戻す' }).click();
  for (let index = 1; index <= 3; index++) {
    await swipe(-120, 0);
    if (index < 3) await page.getByText(`${index} / 3 件を判断`, { exact: true }).waitFor();
  }
  await page.getByText('3件の仕分けが終わりました', { exact: true }).waitFor();
  await page.getByRole('button', { name: '仕分けを終了する' }).first().click();
  const filter = page.getByRole('combobox', { name: '取得先', exact: true });
  await filter.waitFor();
  await filter.click(); await page.getByRole('option', { name: 'Other', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.article-shell').length === 1);
  assert.ok(await page.getByRole('link', { name: 'スワイプ検証記事2（別タブで開く）' }).isVisible());
  await filter.click(); await page.getByRole('option', { name: 'Zenn', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.article-shell').length === 2);
  assert.equal(await page.getByRole('link', { name: 'スワイプ検証記事2（別タブで開く）' }).count(), 0);
  await context.close();
  console.log('実タッチ入力: 追従・右登録・左見送り・短距離・縦スクロール・戻す・取得先フィルター OK');
} catch (error) {
  if (diagnosticsPage) console.error('検証画面:', await diagnosticsPage.locator('body').innerText().catch(() => '取得不可'));
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
