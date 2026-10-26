import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from '../../../infrastructure/auth/auth-session';
import { AuthenticationModel } from '../models/authentication.model';
import { useAuthenticationViewModel } from './useAuthenticationViewModel';
function setup() {
  const session = new AuthSession();
  const identify = vi.fn().mockResolvedValue({ subject: '123', allowed: true, expiresAt: Date.now() + 3600000 });
  const model = new AuthenticationModel('test', false, { identify }, session);
  const vm = useAuthenticationViewModel(model);
  return { vm, session, identify };
}
afterEach(() => vi.useRealTimers());
describe('認証ゲートの状態', () => {
  it('サーバー確認が完了するまで配下を起動せず、未登録をログイン扱いしない', async () => {
    const { vm, identify, session } = setup();
    expect(vm.subject.value).toBeNull();
    identify.mockResolvedValue({ subject: '456', allowed: false, expiresAt: Date.now()+10000 });
    await vm.login('token');
    expect(vm.subject.value).toBeNull(); expect(vm.unregisteredSubject.value).toBe('456'); expect(session.token()).toBeNull(); vm.dispose();
  });
  it('許可された本人のログインと期限切れ・再ログインを扱う', async () => {
    vi.useFakeTimers(); const { vm, session, identify } = setup();
    await vm.login('first'); expect(vm.subject.value).toBe('123'); expect(session.token()).toBe('first');
    await vi.advanceTimersByTimeAsync(3600000); expect(vm.subject.value).toBeNull(); expect(session.token()).toBeNull();
    expect(vm.message.value).toContain('有効期限');
    identify.mockResolvedValue({ subject: '123', allowed: true, expiresAt: Date.now()+10000 });
    await vm.login('second'); expect(session.token()).toBe('second'); vm.dispose();
  });
  it('ログアウト後に届く古いログイン応答を無視する', async () => {
    const { vm, identify, session } = setup(); let resolve!: (value: unknown) => void;
    identify.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = vm.login('old'); vm.logout();
    resolve({ subject: '123', allowed: true, expiresAt: Date.now()+10000 }); await pending;
    expect(vm.subject.value).toBeNull(); expect(session.token()).toBeNull(); vm.dispose();
  });
  it('古い通信の401は新しいログインを消さず、現在の401/403だけログインへ戻す', async () => {
    const { vm, session } = setup(); await vm.login('new');
    session.reject('old', 401); expect(vm.subject.value).toBe('123');
    session.reject('new', 403); expect(vm.subject.value).toBeNull(); expect(session.token()).toBeNull(); vm.dispose();
  });
  it('通信失敗は保存成功とせず再試行できる', async () => {
    const { vm, identify, session } = setup(); identify.mockRejectedValueOnce(new Error('offline'));
    await vm.login('failed'); expect(vm.busy.value).toBe(false); expect(vm.subject.value).toBeNull(); expect(session.token()).toBeNull();
    await vm.login('retry'); expect(vm.subject.value).toBe('123'); vm.dispose();
  });
});
