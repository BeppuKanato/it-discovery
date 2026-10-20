import { describe, expect, it } from 'vitest';
import { PullToRefreshGesture, type PullGestureInput } from './pull-to-refresh-gesture';

const input = (values: Partial<PullGestureInput> = {}): PullGestureInput => ({
  x: 20, y: 20, atTop: true, touchCount: 1, onControl: false, ...values,
});

describe('下に引く操作のModel', () => {
  it('一定距離を引いて離した場合だけ成立し、続けて離しても再成立しない', () => {
    const gesture = new PullToRefreshGesture();
    gesture.begin(input(), true);
    expect(gesture.move(input({ y: 100 }), true)).toBe(true);
    expect(gesture.ready).toBe(false);
    expect(gesture.finish(true)).toBe(false);
    gesture.begin(input(), true);
    gesture.move(input({ y: 200 }), true);
    expect(gesture.ready).toBe(true);
    expect(gesture.finish(true)).toBe(true);
    expect(gesture.finish(true)).toBe(false);
    expect(gesture.distance).toBe(0);
  });

  it('成立距離の境界と表示量の上限を扱う', () => {
    const gesture = new PullToRefreshGesture();
    gesture.begin(input({ y: 0 }), true);
    gesture.move(input({ y: 142 }), true);
    expect(gesture.ready).toBe(false);
    gesture.move(input({ y: 143 }), true);
    expect(gesture.ready).toBe(true);
    gesture.move(input({ y: 1000 }), true);
    expect(gesture.distance).toBe(84);
  });

  it('先頭以外・操作部品・複数指・無効中は開始しない', () => {
    for (const start of [input({ atTop: false }), input({ onControl: true }), input({ touchCount: 2 })]) {
      const gesture = new PullToRefreshGesture();
      gesture.begin(start, true);
      gesture.move(input({ y: 200 }), true);
      expect(gesture.finish(true)).toBe(false);
    }
    const gesture = new PullToRefreshGesture();
    gesture.begin(input(), false);
    gesture.move(input({ y: 200 }), true);
    expect(gesture.finish(true)).toBe(false);
  });

  it('横移動・上移動・先頭離脱・複数指への変更でキャンセルする', () => {
    for (const moved of [input({ x: 200, y: 40 }), input({ y: 0 }), input({ y: 200, atTop: false }), input({ y: 200, touchCount: 2 })]) {
      const gesture = new PullToRefreshGesture();
      gesture.begin(input(), true);
      expect(gesture.move(moved, true)).toBe(false);
      expect(gesture.finish(true)).toBe(false);
      expect(gesture.distance).toBe(0);
    }
  });

  it('途中の無効化・明示キャンセル・離す時の無効化では成立しない', () => {
    const gesture = new PullToRefreshGesture();
    gesture.begin(input(), true);
    gesture.move(input({ y: 200 }), false);
    expect(gesture.finish(true)).toBe(false);
    gesture.begin(input(), true);
    gesture.move(input({ y: 200 }), true);
    gesture.cancel();
    expect(gesture.finish(true)).toBe(false);
    gesture.begin(input(), true);
    gesture.move(input({ y: 200 }), true);
    expect(gesture.finish(false)).toBe(false);
    expect(gesture.distance).toBe(0);
  });
});
