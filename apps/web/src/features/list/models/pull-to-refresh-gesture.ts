// Viewがブラウザイベントから取り出す値。TouchEvent・DOM・VueをModelへ渡さない。
export interface PullGestureInput {
  x: number;
  y: number;
  atTop: boolean;
  touchCount: number;
  onControl: boolean;
}

// Model：下に引く操作の状態と成立条件を管理する。記事取得や画面の描画は行わない。
// インスタンスは一覧画面ごとに作り、共有StoreやDBには保存しない。
export class PullToRefreshGesture {
  private start: { x: number; y: number } | null = null;
  private pullDistance = 0;

  get distance(): number { return this.pullDistance; }
  get ready(): boolean { return this.pullDistance >= 64; }

  // 操作可能なとき、先頭で操作部品以外を一本指で触れた場合だけ開始する。
  begin(input: PullGestureInput, enabled: boolean): void {
    this.cancel();
    if (enabled && input.atTop && input.touchCount === 1 && !input.onControl) {
      this.start = { x: input.x, y: input.y };
    }
  }

  // 方向と距離を判定する。戻り値はViewが通常スクロールを止める必要があるかを表す。
  move(input: PullGestureInput, enabled: boolean): boolean {
    if (!this.start) return false;
    const dy = input.y - this.start.y;
    if (!enabled || !input.atTop || input.touchCount !== 1 || dy < 0
      || Math.abs(input.x - this.start.x) > Math.max(12, dy)) {
      this.cancel();
      return false;
    }
    // 指の移動量に抵抗を付ける。表示量64pxで成立し、最大84pxまで表示する。
    this.pullDistance = Math.min(84, dy * 0.45);
    return dy > 8;
  }

  // 離した時点で操作成立を返す。Modelから更新関数を呼ばず、VMが結果に応じて進める。
  finish(enabled: boolean): boolean {
    const completed = enabled && this.ready;
    this.cancel();
    return completed;
  }

  // キャンセルや画面終了で途中の操作を捨てる。
  cancel(): void { this.start = null; this.pullDistance = 0; }
}
