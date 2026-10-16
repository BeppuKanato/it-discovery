import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createApplicationServices } from './create-services';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import { uiTheme } from './ui-theme';
import './style.css';

// 同じPiniaとサービス群をアプリ全体で共有する。画面ごとに同期キューを作らない。
const pinia = createPinia();
const services = createApplicationServices(pinia, import.meta.env.VITE_API_BASE_URL || '/api');
createApp(App, { services })
  .use(pinia)
  .use(PrimeVue, {
    theme: { preset: uiTheme, options: { darkModeSelector: false } },
  })
  .mount('#app');
