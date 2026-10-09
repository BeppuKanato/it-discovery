import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import { uiTheme } from './ui-theme';
import './style.css';

createApp(App)
  .use(PrimeVue, {
    theme: { preset: uiTheme, options: { darkModeSelector: false } },
  })
  .mount('#app');
