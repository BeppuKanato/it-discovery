import { describe, expect, it } from 'vitest';
import { SwipeGesture } from './swipe-gesture';

describe('横スワイプの成立判定', () => {
  it.each([[80, 'interested'], [-80, 'skipped']] as const)('横に%iで%sを一度だけ返す', (x, kind) => {
    const gesture = new SwipeGesture(); gesture.begin(0, 0); expect(gesture.move(x, 5)).toBe(true);
    expect(gesture.finish()).toBe(kind); expect(gesture.offset).toBe(0); expect(gesture.finish()).toBeNull();
  });
  it('短い横移動は元へ戻り、カードを進めない', () => {
    const gesture = new SwipeGesture(); gesture.begin(0, 0); gesture.move(79, 0); expect(gesture.finish()).toBeNull();
  });
  it('縦スクロールは途中で横成分が増えても判断にしない', () => {
    const gesture = new SwipeGesture(); gesture.begin(0, 0); expect(gesture.move(5, 20)).toBe(false);
    expect(gesture.move(140, 25)).toBe(false); expect(gesture.finish()).toBeNull();
  });
  it('キャンセル後のmove・finishを無視し、移動量は指に追従する', () => {
    const gesture = new SwipeGesture(); expect(gesture.move(200, 0)).toBe(false);
    gesture.begin(0, 0); gesture.move(1000, 0); expect(gesture.offset).toBe(1000);
    gesture.cancel(); expect(gesture.offset).toBe(0); expect(gesture.finish()).toBeNull();
  });
});
