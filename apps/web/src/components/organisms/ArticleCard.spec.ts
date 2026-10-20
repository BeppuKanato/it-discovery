import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import PrimeVue from 'primevue/config';
import ArticleCard from './ArticleCard.vue';
import { article } from '../../test/article-fixture';

async function render(pending?: 'pinned' | 'interested' | 'checking', readStatus?: 'saving' | 'failed' | 'uncertain') {
  const item = article(1); item.state.lastOpenedAt = readStatus ? '2026-10-20T00:00:00.000Z' : null; item.state.pinned = true; item.state.interested = true;
  const app = createSSRApp({ render: () => h(ArticleCard, { article: item, editable: true, pending, readStatus }) });
  app.use(PrimeVue);
  return renderToString(app);
}
function button(html: string, label: string): string {
  return html.match(new RegExp(`<button[^>]*aria-label="${label}"[\\s\\S]*?</button>`, 'i'))?.[0] ?? '';
}
describe('記事ボタンの保存待ち表示', () => {
  it('ピン保存中は部分着色して操作を止め、気になるの確定表示を保つ', async () => {
    const html = await render('pinned');
    const pin = button(html, 'ピンの変更を保存中'); const interest = button(html, '気になるを解除');
    expect(pin).toContain('aria-busy="true"'); expect(pin).toContain('disabled'); expect(pin).toContain('clip-path=');
    expect(interest).toContain('aria-pressed="true"'); expect(interest).toContain('disabled'); expect(interest).not.toContain('clip-path=');
    expect(interest).toContain('fill="currentColor"'); expect(html).not.toContain('p-button-loading-icon');
  });
  it('気になる保存中もピンの確定表示を保ち、両方のボタンを止める', async () => {
    const html = await render('interested');
    expect(button(html, 'ピン止めを解除')).toContain('selected');
    const interest = button(html, '気になるの変更を保存中');
    expect(interest).toContain('aria-busy="true"'); expect(interest).toContain('disabled'); expect(interest).toContain('clip-path=');
  });
  it('通常時は部分着色も操作制限もない', async () => {
    const html = await render();
    expect(html).not.toContain('clip-path='); expect(html).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(button(html, 'ピン止めを解除')).toContain('aria-pressed="true"');
  });
  it('記事を開くキーボード操作可能なリンクを公開し、別タブを案内する', async () => {
    const html = await render();
    expect(html).toMatch(/<a[^>]*href="https:\/\/example.com\/1"/);
    expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('記事1（別タブで開く）');
  });
  it.each([['saving', '既読・保存中'], ['failed', '既読・保存未確認'], ['uncertain', '既読・保存未確認']] as const)('既読の%sを確定済みと区別して表示する', async (phase, label) => {
    expect(await render(undefined, phase)).toContain(label);
  });

});
