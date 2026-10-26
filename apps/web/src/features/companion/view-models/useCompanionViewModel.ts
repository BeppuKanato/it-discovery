import { computed, readonly, ref, shallowRef } from 'vue';
import type { ArticleListItem, CompanionMessage, DiscoveryNote } from '@it-discovery/contracts';
import type { CompanionModel } from '../models/companion.model';
// 共通Pageが一度だけ作るVM。会話はその場限り、任意に保存した発見だけがDBに残る。
export function useCompanionViewModel(model: CompanionModel) {
  const visible = ref(true); const dialog = ref(false); const draft = ref('');
  const messages = ref<CompanionMessage[]>([]); const context = shallowRef<ArticleListItem | null>(null);
  const sending = ref(false); const saving = ref(false); const loadingNotes = ref(false);
  const error = ref<string | null>(null); const noteError = ref<string | null>(null); const notice = ref<string | null>(null);
  const notes = ref<DiscoveryNote[]>([]); const deleting = ref<number | null>(null);
  const pending = new Set<AbortController>(); let disposed = false; let noteGeneration = 0;
  const canSend = computed(() => !sending.value && !!draft.value.trim() && draft.value.length <= 800);
  const controller = () => { const value = new AbortController(); pending.add(value); return value; };
  function open() { if (!disposed) { visible.value = true; dialog.value = true; } }
  function selectArticle(article: ArticleListItem) {
    // 記事を選んだだけで読了扱いしない。送信中の文脈は変えず、次の操作で切り替え可能にする。
    if (!sending.value && !saving.value && !draft.value.trim()) { context.value = article; messages.value = []; notice.value = null; }
  }
  function clearConversation() {
    if (sending.value || saving.value) return;
    messages.value = []; context.value = null; error.value = null; notice.value = null;
  }
  async function send() {
    if (disposed || !canSend.value) return;
    const text = draft.value.trim(); const articleId = context.value?.articleId;
    // APIの入力上限に合わせ、直近4発言を最大500文字ずつ渡す。履歴全文を毎回送り続けない。
    const history = messages.value.slice(-4).map(message => ({ ...message, text: message.text.slice(0, 500) }));
    const request = controller(); sending.value = true; error.value = null; notice.value = null;
    try {
      const response = await model.chat({ message: text, history, ...(articleId ? { articleId } : {}) }, request.signal);
      if (disposed) return;
      messages.value = [...messages.value, { role: 'user' as const, text }, { role: 'model' as const, text: response.text }].slice(-20);
      // 待っている間に利用者が編集した次の文章は消さない。
      if (draft.value.trim() === text) draft.value = '';
    } catch (cause) { if (!disposed) error.value = model.error(cause); }
    finally { pending.delete(request); if (!disposed) sending.value = false; }
  }
  async function saveDiscovery() {
    if (disposed || saving.value || sending.value) return;
    // 入力中ならその文章、空なら最後に利用者が話した発見を保存する。AIの文章を本人の発見として保存しない。
    const text = draft.value.trim() || [...messages.value].reverse().find(message => message.role === 'user')?.text;
    if (!text || text.length > 800) return;
    const request = controller(); saving.value = true; error.value = null; notice.value = null;
    try {
      const note = await model.save({ text, ...(context.value ? { articleId: context.value.articleId } : {}) }, request.signal);
      if (disposed) return;
      noteGeneration++; notes.value = [note, ...notes.value].slice(0, 100); notice.value = '発見ノートに残しました。';
    } catch { if (!disposed) error.value = '保存結果を確認できませんでした。ノートを確認してから再度お試しください。'; }
    finally { pending.delete(request); if (!disposed) saving.value = false; }
  }
  async function loadNotes() {
    if (disposed || loadingNotes.value) return;
    const generation = ++noteGeneration; const request = controller(); loadingNotes.value = true; noteError.value = null;
    try { const result = await model.notes(request.signal); if (!disposed && generation === noteGeneration) notes.value = result; }
    catch { if (!disposed) noteError.value = 'ノートを読み込めませんでした。'; }
    finally { pending.delete(request); if (!disposed) loadingNotes.value = false; }
  }
  async function deleteNote(id: number) {
    if (disposed || deleting.value !== null) return;
    const request = controller(); deleting.value = id; noteError.value = null;
    try { await model.remove(id, request.signal); if (!disposed) { noteGeneration++; notes.value = notes.value.filter(note => note.id !== id); } }
    catch { if (!disposed) noteError.value = '削除結果を確認できませんでした。一覧を再読み込みしてください。'; }
    finally { pending.delete(request); if (!disposed) deleting.value = null; }
  }
  function dispose() { disposed = true; pending.forEach(request => request.abort()); pending.clear(); }
  return { visible, dialog, draft, messages: readonly(messages), context: readonly(context), sending: readonly(sending), saving: readonly(saving),
    error: readonly(error), notice: readonly(notice), notes: readonly(notes), loadingNotes: readonly(loadingNotes), noteError: readonly(noteError), deleting: readonly(deleting),
    canSend, open, selectArticle, clearConversation, send, saveDiscovery, loadNotes, deleteNote, dispose };
}
export type CompanionViewModel = ReturnType<typeof useCompanionViewModel>;
