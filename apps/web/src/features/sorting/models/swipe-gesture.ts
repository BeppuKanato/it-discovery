// Viewから座標だけを受け取る。タッチ・マウス・ペンで同じ横方向の成立判定を使う。
export class SwipeGesture {
  private start: { x: number; y: number } | null = null;
  private direction: 'horizontal' | 'vertical' | null = null;
  offset = 0;
  begin(x: number, y: number): void { this.cancel(); this.start = { x, y }; }
  move(x: number, y: number): boolean {
    if (!this.start) return false;
    const dx = x - this.start.x; const dy = y - this.start.y;
    if (!this.direction && Math.max(Math.abs(dx), Math.abs(dy)) >= 12) this.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    if (this.direction !== 'horizontal') return false;
    this.offset = Math.max(-160, Math.min(160, dx));
    return true;
  }
  finish(): 'interested' | 'skipped' | null {
    const result = this.direction === 'horizontal' && Math.abs(this.offset) >= 80 ? this.offset > 0 ? 'interested' : 'skipped' : null;
    this.cancel(); return result;
  }
  cancel(): void { this.start = null; this.direction = null; this.offset = 0; }
}
