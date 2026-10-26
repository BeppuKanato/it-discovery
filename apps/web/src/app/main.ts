import { AuthenticationModel } from '../features/auth/models/authentication.model';
import { AuthApiClient } from '../infrastructure/auth/auth-api-client';
import { AuthSession } from '../infrastructure/auth/auth-session';
import { createApp } from 'vue';
import { createApplicationModels } from './create-application-models';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import { uiTheme } from './ui-theme';
import './style.css';

// 依存の組み立てだけを行い、一覧取得はPageの表示開始に任せる。
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
const session = new AuthSession();
// 本番ビルドでは設定漏れを開発用の認証省略へ切り替えない。
const development = import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE !== 'google';
const authentication = new AuthenticationModel(import.meta.env.VITE_GOOGLE_CLIENT_ID || '', development, new AuthApiClient(baseURL), session);
const createModels = (subject: string) => createApplicationModels(baseURL, development ? undefined : session, subject);
createApp(App, { authentication, createModels })
  .use(PrimeVue, {
    theme: { preset: uiTheme, options: { darkModeSelector: false } },
  })
  .mount('#app');
