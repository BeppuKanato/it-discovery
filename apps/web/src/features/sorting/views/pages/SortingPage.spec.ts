import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import PrimeVue from 'primevue/config';
import type { ArticleStateResponse } from '@it-discovery/contracts';
import { article } from '../../../../test/article-fixture';
import { SortingModel } from '../../models/sorting.model';
import { ArticleOpeningModel } from '../../../articles/models/article-opening.model';
import { ArticleStateModel } from '../../../articles/models/article-state.model';
import SortingPage from './SortingPage.vue';
const { getVm } = vi.hoisted(() => ({ getVm: vi.fn() }));
vi.mock('../../view-models/useSortingViewModel', () => ({ useSortingViewModel: getVm }));
const { useSortingViewModel } = await vi.importActual<typeof import('../../view-models/useSortingViewModel')>('../../view-models/useSortingViewModel');

function fixture(ids = [2,1]) {
  const sortingModel = new SortingModel({ getSortingCandidates: vi.fn().mockResolvedValue({ articles: ids.map(article) }) });
  const openingModel = new ArticleOpeningModel({ open: vi.fn() });
  const updateArticleState = vi.fn();
  const stateModel = new ArticleStateModel({ updateArticleState, getArticleState: vi.fn() });
  const vm = useSortingViewModel(sortingModel, openingModel, stateModel);
  return { vm, props: { sortingModel, openingModel, stateModel }, updateArticleState };
}
async function render(f: ReturnType<typeof fixture>) {
  getVm.mockReturnValue(f.vm);
  const app = createSSRApp({ render: () => h(SortingPage, f.props) }); app.use(PrimeVue); return renderToString(app);
}
function button(html: string, label: string): string { return html.match(new RegExp(`<button[^>]*aria-label="${label}"[\\s\\S]*?</button>`, 'i'))?.[0] ?? ''; }
describe('仕分け画面の表示', () => {
  it('カード・見送り・気になる・履歴なしの戻す無効を表示する', async () => {
    const f = fixture(); await f.vm.initialize(); const html = await render(f);
    expect(html).toContain('記事2（別タブで開く）'); expect(html).toContain('0 / 2');
    expect(button(html,'見送り')).not.toMatch(/\sdisabled(?:=|\s|>)/); expect(button(html,'気になる')).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(button(html,'ひとつ戻す')).toMatch(/\sdisabled(?:=|\s|>)/);
  });
  it('0件ではカードも判断操作も出さず一覧へ戻れる', async () => {
    const f = fixture([]); await f.vm.initialize(); const html = await render(f);
    expect(html).toContain('今は仕分ける記事がありません'); expect(html).toContain('一覧へ戻る'); expect(button(html,'気になる')).toBe('');
  });
  it('完了後も戻すを残し、仮選択を登録済みと表示せず、保存未提供の終了を止める', async () => {
    const f = fixture(); await f.vm.initialize(); f.vm.decide('interested'); f.vm.decide('skipped'); const html = await render(f);
    expect(html).toContain('2件の仕分けが終わりました'); expect(html).toContain('1 件を仮選択');
    expect(button(html,'ひとつ戻す')).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(button(html,'仕分けを終了する')).toMatch(/\sdisabled(?:=|\s|>)/); expect(html).toContain('保存は現在利用できません');
  });
  it('見送りだけで完了した場合は通信なしで終了できる', async () => {
    const f = fixture([1]); await f.vm.initialize(); f.vm.decide('skipped'); const html = await render(f);
    expect(button(html,'仕分けを終了する')).not.toMatch(/\sdisabled(?:=|\s|>)/); expect(f.updateArticleState).not.toHaveBeenCalled();
  });
  it('既読カードは左右の判断ボタンを次へに替え、保存待ちを区別する', async () => {
    const f = fixture(); await f.vm.initialize(); let resolve!: (value: ArticleStateResponse) => void;
    f.updateArticleState.mockReturnValueOnce(new Promise<ArticleStateResponse>(yes => { resolve = yes; })); const saving = f.vm.openCurrentArticle();
    const html = await render(f); expect(html).toContain('既読・保存中'); expect(button(html,'次へ')).not.toBe(''); expect(button(html,'気になる')).toBe('');
    resolve({ articleId: 2, state: { ...article(2).state, lastOpenedAt: f.vm.currentReadStatus.value!.openedAt } }); await saving;
  });
});
