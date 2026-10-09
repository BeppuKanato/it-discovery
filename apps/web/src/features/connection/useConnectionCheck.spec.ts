import { describe, expect, it, vi } from 'vitest';
import type { HealthResponse } from '@it-discovery/contracts';
import { useConnectionCheck } from './useConnectionCheck';

describe('接続確認の操作', () => {
  it('通信中の連打で要求を増やさない', async () => {
    let complete!: (value: HealthResponse) => void;
    const getHealth = vi.fn(() => new Promise<HealthResponse>((resolve) => { complete = resolve; }));
    const screen = useConnectionCheck({ getHealth });
    const first = screen.checkConnection();
    await screen.checkConnection();
    expect(getHealth).toHaveBeenCalledTimes(1);
    expect(screen.status.value).toBe('checking');
    complete({ status: 'ok', message: '接続できました' });
    await first;
    expect(screen.status.value).toBe('ready');
  });

  it('失敗後に再試行して正常表示に戻る', async () => {
    const getHealth = vi.fn<() => Promise<HealthResponse>>()
      .mockRejectedValueOnce(new Error('ネットワーク障害'))
      .mockResolvedValueOnce({ status: 'ok', message: '接続できました' });
    const screen = useConnectionCheck({ getHealth });
    await screen.checkConnection();
    expect(screen.status.value).toBe('error');
    await screen.checkConnection();
    expect(screen.status.value).toBe('ready');
    expect(screen.message.value).toBe('接続できました');
  });
});
