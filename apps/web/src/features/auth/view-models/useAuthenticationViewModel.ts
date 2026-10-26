import { readonly, ref } from 'vue';
import type { AuthenticationModel } from '../models/authentication.model';
export function useAuthenticationViewModel(model: AuthenticationModel) {
  // subjectがある間だけ配下のアプリを描画する。認証前は端末仕分けの送信・記事取得を開始しない。
  const subject = ref<string | null>(model.development ? 'local-development' : null);
  const busy = ref(false);
  const message = ref<string | null>(!model.development && !model.clientId ? 'Googleログインの設定が必要です。管理者にお問い合わせください。' : null);
  const unregisteredSubject = ref<string | null>(null);
  let revision = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = model.subscribe(text => {
    revision++; clearTimeout(timer); subject.value = null; busy.value = false; message.value = text;
  });
  async function login(token: string): Promise<void> {
    if (busy.value || disposed) return;
    const current = ++revision; busy.value = true; message.value = null; unregisteredSubject.value = null;
    try {
      const identity = await model.identify(token);
      if (disposed || revision !== current) return;
      if (!identity.allowed) {
        unregisteredSubject.value = identity.subject;
        message.value = 'このGoogleアカウントは未登録です。下のアカウントIDを管理者に伝えてください。';
        return;
      }
      model.accept(token, identity); subject.value = identity.subject;
      timer = setTimeout(() => model.expire(), Math.max(0, identity.expiresAt - Date.now()));
    } catch {
      if (!disposed && revision === current) message.value = 'ログインを確認できませんでした。通信状況を確認して、もう一度お試しください。';
    } finally { if (!disposed && revision === current) busy.value = false; }
  }
  function sdkError(): void { message.value = 'Googleログインを読み込めませんでした。ページを再読み込みしてください。'; }
  function dispose(): void { disposed = true; revision++; clearTimeout(timer); unsubscribe(); model.logout(); }
  return { subject: readonly(subject), busy: readonly(busy), message: readonly(message), unregisteredSubject: readonly(unregisteredSubject), login, sdkError, logout: () => model.logout(), dispose };
}
