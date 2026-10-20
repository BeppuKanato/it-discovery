import { createApp } from 'vue';
import { createApplicationModels } from './create-application-models';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import { uiTheme } from './ui-theme';
import './style.css';

// 依存の組み立てだけを行い、一覧取得はPageの表示開始に任せる。
const models = createApplicationModels(import.meta.env.VITE_API_BASE_URL || '/api');
createApp(App, { models })
  .use(PrimeVue, {
    theme: { preset: uiTheme, options: { darkModeSelector: false } },
  })
  .mount('#app');
