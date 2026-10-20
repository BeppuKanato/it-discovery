import type { ApplicationLease } from '../../features/startup/models/application-startup.model';

// 一つのタブだけが仕分け記録を読み書き・送信する。未対応時に二重送信可能な代替へ落とさない。
export class BrowserApplicationLease implements ApplicationLease {
  private releaseLock: (()=>void) | null = null;
  private generation = 0;
  constructor(private readonly name: string, private readonly manager: Pick<LockManager,'request'> | undefined | null = typeof navigator === 'undefined' ? undefined : navigator.locks) {}
  async acquire(): Promise<boolean> {
    if (this.releaseLock) return true;
    if (!this.manager) throw new Error('このブラウザでは安全なタブ間制御を利用できません。HTTPSと対応ブラウザをご確認ください。');
    const generation = ++this.generation;
    return new Promise<boolean>((resolve,reject) => {
      void this.manager!.request(this.name,{ifAvailable:true},async lock => {
        if (!lock || generation !== this.generation) { resolve(false); return; }
        const held = new Promise<void>(release => { this.releaseLock = release; });
        resolve(true); await held;
      }).catch(reject);
    });
  }
  release(): void { this.generation++; this.releaseLock?.(); this.releaseLock = null; }
}
