import { ref } from 'vue';
import type { HealthResponse } from '@it-discovery/contracts';

interface ConnectionApi {
  getHealth(): Promise<HealthResponse>;
}

// 接続確認の進行と表示状態を管理する。
export function useConnectionCheck(api: ConnectionApi) {
  const status = ref<'idle' | 'checking' | 'ready' | 'error'>('idle');
  const message = ref('');

  // APIへ接続し、成功または失敗を画面に反映する。
  async function checkConnection(): Promise<void> {
    if (status.value === 'checking') return;
    status.value = 'checking';
    message.value = '';
    try {
      const response = await api.getHealth();
      message.value = response.message;
      status.value = 'ready';
    } catch {
      message.value = '接続できませんでした。少し待ってから、もう一度お試しください。';
      status.value = 'error';
    }
  }

  return { status, message, checkConnection };
}
