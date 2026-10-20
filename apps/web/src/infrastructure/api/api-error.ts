// 通信基盤はHTTPの情報だけを伝える。保存失敗が確定したかは利用側のModelで判断する。
export class ApiError extends Error {
  constructor(readonly status?: number) {
    super(status ? `HTTP ${status}` : '通信結果を確認できませんでした。');
  }
}
