import { describe, expect, it, vi } from 'vitest';
import type { ArticleListItem } from '@it-discovery/contracts';
import { CompanionModel, type CompanionApi } from '../models/companion.model';
import { useCompanionViewModel } from './useCompanionViewModel';
function setup() {
  const api = { chat: vi.fn().mockResolvedValue({ text: '面白い使い方だね。' }), getDiscoveryNotes: vi.fn().mockResolvedValue([]),
    saveDiscoveryNote: vi.fn().mockResolvedValue({ id: 1, text: '発見した', articleId: null, articleTitle: null, createdAt: '2026-10-26T00:00:00Z' }), deleteDiscoveryNote: vi.fn().mockResolvedValue(undefined) };
  return { api, vm: useCompanionViewModel(new CompanionModel(api as CompanionApi)) };
}
describe('相棒の表示状態と会話・ノート', () => {
  it('開くだけでは通信せず、発見を送ったときだけ会話する', async () => {
    const { api, vm } = setup(); vm.open(); expect(api.chat).not.toHaveBeenCalled();
    vm.draft.value = '発見した'; await vm.send();
    expect(api.chat).toHaveBeenCalledTimes(1); expect(api.chat.mock.calls[0]![0]).toEqual({ message: '発見した', history: [] });
    expect(vm.messages.value.map(message => message.role)).toEqual(['user', 'model']);
    expect(vm.draft.value).toBe(''); expect(api.saveDiscoveryNote).not.toHaveBeenCalled();
  });
  it('履歴は直近4発言・各500文字に制限し、記事IDを添える', async () => {
    const { api, vm } = setup(); vm.selectArticle({ articleId: 2, title: 'SQLite' } as ArticleListItem);
    api.chat.mockResolvedValue({ text: 'a'.repeat(800) });
    for (let index = 0; index < 4; index++) { vm.draft.value = '発見した'; await vm.send(); }
    const request = api.chat.mock.calls[3]![0];
    expect(request.articleId).toBe(2); expect(request.history).toHaveLength(4);
    expect(request.history.every((message: { text: string }) => message.text.length <= 500)).toBe(true);
  });
  it('失敗時に入力を残し、自動再送・成功した会話の追加をしない', async () => {
    const { api, vm } = setup(); api.chat.mockRejectedValue(Error('offline')); vm.draft.value = '発見した';
    await vm.send(); expect(vm.draft.value).toBe('発見した'); expect(vm.messages.value).toHaveLength(0);
    expect(vm.error.value).toBeTruthy(); expect(api.chat).toHaveBeenCalledTimes(1);
  });
  it('送信中の重複送信と文脈変更を防ぎ、終了後の応答を反映しない', async () => {
    const { api, vm } = setup(); let finish!: (value: { text: string }) => void;
    api.chat.mockImplementation(() => new Promise(resolve => { finish = resolve; })); vm.draft.value = '発見した';
    const request = vm.send(); await vm.send(); vm.selectArticle({ articleId: 3 } as ArticleListItem);
    expect(api.chat).toHaveBeenCalledTimes(1); expect(vm.context.value).toBeNull();
    vm.dispose(); expect(api.chat.mock.calls[0]![1].aborted).toBe(true); finish({ text: '返答' }); await request;
    expect(vm.messages.value).toHaveLength(0);
  });
  it('AIの返答でなく本人の発見を明示的に保存し、失敗時に成功表示しない', async () => {
    const { api, vm } = setup(); vm.draft.value = '発見した'; await vm.send(); await vm.saveDiscovery();
    expect(api.saveDiscoveryNote.mock.calls[0]![0]).toEqual({ text: '発見した' });
    expect(vm.notes.value).toHaveLength(1); expect(vm.notice.value).toBeTruthy();
    api.saveDiscoveryNote.mockRejectedValue(Error('lost')); await vm.saveDiscovery();
    expect(vm.notice.value).toBeNull(); expect(vm.error.value).toBeTruthy(); expect(vm.notes.value).toHaveLength(1);
  });
  it('削除に成功してから一覧から消し、失敗時は残す', async () => {
    const { api, vm } = setup(); vm.draft.value = '発見した'; await vm.saveDiscovery();
    api.deleteDiscoveryNote.mockRejectedValueOnce(Error('offline')); await vm.deleteNote(1); expect(vm.notes.value).toHaveLength(1);
    await vm.deleteNote(1); expect(vm.notes.value).toHaveLength(0);
  });
});
