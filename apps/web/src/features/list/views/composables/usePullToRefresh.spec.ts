import { describe, expect, it, vi } from 'vitest';
import { usePullToRefresh } from './usePullToRefresh';

describe('下に引いて更新する操作', () => {
  it('先頭で十分に下へ引いて離したときだけ更新する', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const pull = usePullToRefresh(refresh, () => true);
    pull.begin(20, 20, true);
    expect(pull.move(20, 100, true)).toBe(true);
    await pull.finish();
    expect(refresh).not.toHaveBeenCalled();
    pull.begin(20, 20, true);
    pull.move(20, 200, true);
    expect(pull.ready.value).toBe(true);
    await pull.finish();
    await pull.finish();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(pull.distance.value).toBe(0);
  });

  it('先頭以外・横移動・上向き・取り消し・更新中は発火しない', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    let available = true;
    const pull = usePullToRefresh(refresh, () => available);
    pull.begin(0, 0, false);
    pull.move(0, 200, true);
    await pull.finish();
    pull.begin(0, 0, true);
    pull.move(200, 20, true);
    await pull.finish();
    pull.begin(0, 100, true);
    pull.move(0, 0, true);
    await pull.finish();
    pull.begin(0, 0, true);
    pull.move(0, 200, true);
    pull.cancel();
    await pull.finish();
    available = false;
    pull.begin(0, 0, true);
    pull.move(0, 200, true);
    await pull.finish();
    expect(refresh).not.toHaveBeenCalled();
  });
});
