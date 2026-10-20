import { describe,expect,it,vi } from 'vitest';
import { BrowserApplicationLease } from './application-lease';
describe('タブ間の所有権',()=>{
  it('所有権を解放するまで要求を保持し、終了後の遅い取得は保持しない',async()=>{
    let callback!: (lock:Lock|null)=>Promise<void>;const request=vi.fn((_name:string,_options:unknown,cb:(lock:Lock|null)=>Promise<void>)=>{callback=cb;return Promise.resolve();});
    const lease=new BrowserApplicationLease('test',{request} as unknown as Pick<LockManager,'request'>);
    const pending=lease.acquire();let held=false;const holding=callback({} as Lock).then(()=>{held=false;});held=true;
    expect(await pending).toBe(true);await Promise.resolve();expect(held).toBe(true);expect(await lease.acquire()).toBe(true);expect(request).toHaveBeenCalledOnce();lease.release();await holding;expect(held).toBe(false);
    const late=lease.acquire();lease.release();await callback({} as Lock);expect(await late).toBe(false);
  });
  it('未対応はエラー、所有中ならfalseを返して二重送信しない',async()=>{
    await expect(new BrowserApplicationLease('missing',null).acquire()).rejects.toThrow();
    const request=vi.fn(async(_n:string,_o:unknown,cb:(lock:null)=>unknown)=>cb(null));const lease=new BrowserApplicationLease('held',{request} as unknown as Pick<LockManager,'request'>);expect(await lease.acquire()).toBe(false);
  });
});
