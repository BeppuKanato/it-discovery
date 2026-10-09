import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const portText = env.WEB_PORT ?? '5173';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || port < 1 || port > 65535) {
    throw new Error('WEB_PORTは1〜65535の整数で指定してください。');
  }
  const target = env.DEV_API_TARGET ?? 'http://127.0.0.1:3000';
  const targetUrl = new URL(target);
  if (!['http:', 'https:'].includes(targetUrl.protocol) || targetUrl.origin !== target) {
    throw new Error('DEV_API_TARGETにはパスを含まないhttp(s)オリジンを指定してください。');
  }
  return {
    plugins: [vue()],
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: { '/api': { target, changeOrigin: true } },
    },
  };
});
