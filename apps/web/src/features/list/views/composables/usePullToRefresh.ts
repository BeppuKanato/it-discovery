import { computed, readonly, ref } from 'vue';

// 先頭での下向き操作だけを更新操作として扱う。
export function usePullToRefresh(refresh: () => Promise<void>, canRefresh: () => boolean) {
  // 指の座標そのものではなく、画面に表示する引っ張り量をVueの状態として持つ。
  const distance = ref(0);
  const ready = computed(() => distance.value >= 64);
  let start: { x: number; y: number } | null = null;

  function cancel(): void { start = null; distance.value = 0; }

  // 一覧の先頭で一本指の操作を開始する。
  function begin(x: number, y: number, atTop: boolean): void {
    cancel();
    if (atTop && canRefresh()) start = { x, y };
  }

  // 下向きの移動量を計算し、通常スクロールを止めるか返す。
  function move(x: number, y: number, atTop: boolean): boolean {
    if (!start) return false;
    const dy = y - start.y;
    if (!atTop || !canRefresh() || dy < 0 || Math.abs(x - start.x) > Math.max(12, dy)) {
      cancel();
      return false;
    }
    // 指の移動をそのまま使わず抵抗感を付ける。上限84px、更新の成立は64px以上。
    distance.value = Math.min(84, dy * 0.45);
    return dy > 8;
  }

  // 一定距離を越えて離した場合だけ先頭から更新する。
  async function finish(): Promise<void> {
    // リセット前に成立を記録する。先にcancelするとdistanceが0になって判定できない。
    const shouldRefresh = ready.value && canRefresh();
    cancel();
    if (shouldRefresh) await refresh();
  }

  return { distance: readonly(distance), ready, begin, move, finish, cancel };
}
