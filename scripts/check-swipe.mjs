import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
  // 月と日付の検証が実行日に左右されないように固定する。退出アニメーションの時計は動かす。
  await page.clock.setFixedTime(new Date('2026-10-27T01:00:00.000Z'));
  page.setDefaultTimeout(15000);
  const articles = [3, 2, 1].map(articleId => ({
    articleId, url: `https://example.com/${articleId}`, title: `スワイプ検証記事${articleId}`,
    description: 'カード上から左右へ指を動かして仕分けます。', author: null,
    fetchedAt: '2026-10-01T00:00:00.000Z', publishedAt: null, sourceUpdatedAt: null,
    source: { sourceId: articleId === 2 ? 'other' : 'zenn', siteName: articleId === 2 ? 'Other' : 'Zenn', iconUrl: null },
    state: { interested: false, pinned: false, lastOpenedAt: null },
  }));
  const notes = []; let chatCalls = 0;
  let unexpectedWrites = 0;
  await page.route(`${origin}/api/**`, async route => {
    if (route.request().method() !== 'GET') unexpectedWrites++;
    const url = new URL(route.request().url());
    const path = url.pathname;
    const sourceId = url.searchParams.get('sourceId');
    if (path === '/api/companion/chat') { chatCalls++; await route.fulfill({ json: { text: 'その使い方は気になるね。' } }); return; }
    const noteDate = note => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(note.createdAt));
    if (path === '/api/companion/notes/calendar') {
      const month = url.searchParams.get('month'); const grouped = new Map();
      for (const note of notes) { const date = noteDate(note); if (date.startsWith(month)) grouped.set(date, (grouped.get(date) ?? 0) + 1); }
      const months = notes.map(note => noteDate(note).slice(0, 7)).sort();
      await route.fulfill({ json: { month, days: [...grouped].sort().map(([date, count]) => ({ date, count })), totalCount: notes.length, firstMonth: months[0] ?? null, lastMonth: months.at(-1) ?? null } }); return;
    }
    if (path === '/api/companion/notes/day') {
      const date = url.searchParams.get('date'); const dayNotes = notes.filter(note => noteDate(note) === date).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id-a.id);
      const offset = Math.min(Number(url.searchParams.get('offset') ?? 0), Math.max(0, dayNotes.length - 1));
      const note = dayNotes[offset];
      await route.fulfill({ json: { date, offset, totalCount: dayNotes.length, note: note ? { ...note, articleUrl: articles.find(article => article.articleId === note.articleId)?.url ?? null } : null } }); return;
    }
    if (/^\/api\/companion\/notes\/\d+$/.test(path) && route.request().method() === 'DELETE') {
      const index = notes.findIndex(note => note.id === Number(path.split('/').at(-1))); if (index >= 0) notes.splice(index,1);
      await route.fulfill({ json: { deleted: true } }); return;
    }
    if (path === '/api/companion/notes') {
      if (route.request().method() === 'POST') notes.unshift({ id: 1, text: route.request().postDataJSON().text, articleId: null, articleTitle: null, createdAt: '2026-10-26T00:00:00Z' });
      await route.fulfill({ json: route.request().method() === 'POST' ? notes[0] : notes }); return;
    }
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
  await mkdir('artifacts/companion', { recursive: true });
  // 素材が透過画像として読み込め、足元がナビの上に収まることを実DOMで確認する。
  await page.locator('.character img').evaluate(image => image.decode());
  const feet = await page.locator('.character').boundingBox();
  const navigation = await page.getByRole('navigation', { name: 'メインメニュー' }).boundingBox();
  assert.ok(feet.y + feet.height <= navigation.y);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/companion/list.png' });
  assert.equal(chatCalls, 0);
  await page.getByRole('button', { name: '発見を話す', exact: true }).click();
  await page.getByRole('textbox', { name: '発見や疑問' }).fill('SQLiteはサーバーなしで使えるんだね');
  await page.getByRole('button', { name: '送る', exact: true }).click();
  await page.getByText('その使い方は気になるね。', { exact: false }).waitFor();
  assert.equal(chatCalls, 1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/companion/conversation.png' });
  await page.getByRole('button', { name: '発見ノートに残す', exact: true }).click();
  await page.getByText('発見ノートに残しました。', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '発見ノート', exact: true }).click();
  await page.getByText('SQLiteはサーバーなしで使えるんだね', { exact: true }).waitFor();
  await page.screenshot({ path: 'artifacts/companion/notebook.png' });
  // 30件ある月でも本文は常に1件。100件より古い月への切替・削除後の再集計も確認する。
  let noteId = 2;
  for (const [day, count] of [[2,1],[4,2],[7,3],[10,1],[12,2],[15,4],[18,2],[20,3],[21,2],[24,4],[26,3],[27,3]]) {
    for (let index = 0; index < count; index++) notes.push({ id: noteId++, text: `${day}日の発見 ${index+1}`, articleId: 3, articleTitle: '元記事のタイトル', createdAt: `2026-10-${String(day).padStart(2,'0')}T01:00:00.000Z` });
  }
  for (let index = 0; index < 110; index++) notes.push({ id: noteId++, text: `9月の発見 ${index+1}`, articleId: null, articleTitle: null, createdAt: '2026-09-15T01:00:00.000Z' });
  await page.getByRole('button', { name: 'ノートを更新', exact: true }).click();
  await page.getByText('この月に 31 の発見', { exact: true }).waitFor();
  await page.getByRole('button', { name: '10月15日、4件の発見', exact: true }).click();
  await page.getByText('15日の発見 4', { exact: true }).waitFor();
  assert.equal(await page.locator('.note-page').count(), 1);
  await page.getByRole('button', { name: '次の発見', exact: true }).click();
  await page.getByText('15日の発見 3', { exact: true }).waitFor();
  // めくる操作でキーボードのフォーカスが失われない。
  await page.getByRole('button', { name: '次の発見', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('15日の発見 2', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '次の発見', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: 'この発見を削除', exact: true }).click();
  await page.getByText('この月に 30 の発見', { exact: true }).waitFor();
  await page.getByRole('button', { name: '10月15日、3件の発見', exact: true }).waitFor();
  await page.getByRole('button', { name: '10月1日、0件の発見', exact: true }).click();
  await page.getByText('この日の記録はありません。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '前の月', exact: true }).click();
  await page.getByText('この月に 110 の発見', { exact: true }).waitFor();
  await page.getByRole('button', { name: '次の月', exact: true }).click();
  await page.getByRole('button', { name: '10月27日、3件の発見', exact: true }).click();
  await page.getByText('27日の発見 3', { exact: true }).waitFor();
  await page.getByText('きっかけになった記事', { exact: true }).click();
  assert.equal(await page.getByRole('link', { name: '元記事を読む（別タブ） ↗', exact: true }).getAttribute('href'), 'https://example.com/3');
  await page.getByText('きっかけになった記事', { exact: true }).click();
  await page.getByRole('button', { name: '10月27日、3件の発見', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/companion/notebook-calendar.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'キャラクターを隠す', exact: true }).click();
  assert.equal(await page.locator('.companion-dock').count(), 0);
  await page.getByRole('button', { name: 'キャラクターを表示', exact: true }).click();
  await page.getByRole('dialog', { name: '発見を話す', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('switch', { name: 'キャラクターを表示する', exact: true }).waitFor();
  await page.screenshot({ path: 'artifacts/companion/settings.png' });
  await context.close();
  console.log('実タッチ入力: 追従・右登録・左見送り・短距離・縦スクロール・戻す・取得先フィルター OK');
} catch (error) {
  if (diagnosticsPage) console.error('検証画面:', await diagnosticsPage.locator('body').innerText().catch(() => '取得不可'));
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
