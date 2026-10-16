// 同じオリジンの複数タブから、同じ未送信キューを同時に処理しないための所有権。
// 戻り値は解放関数。nullなら他のタブが使用中。未対応環境では安全に操作を止める。
export function acquireArticleChangeOwnership(name: string): Promise<(() => void) | null> {
  if (!navigator.locks) return Promise.reject(new Error('このブラウザはタブ間の送信制御に対応していません。'));
  return new Promise((resolve, reject) => {
    void navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(null); return; }
      // コールバックのPromiseが終わるまでロックを保持する。解放関数の呼び出しで終了する。
      await new Promise<void>((release) => resolve(release));
    }).catch(reject);
  });
}
