import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// アプリで使う色と共通部品の見た目を定義する。
export const uiTheme = definePreset(Aura, {
  extend: {
    discovery: {
      background: '#f5f9ff', ink: '#243d5a', muted: '#71859b', line: '#dfebf6',
      soft: '#eff7ff', partnerInk: '#254e76', partnerMuted: '#6085ac',
      frameStart: '#cfebff', frameEnd: '#e6efff', paper: '#ffffff',
    },
  },
  semantic: {
    primary: {
      50: '{blue.50}', 100: '{blue.100}', 200: '{blue.200}',
      300: '{blue.300}', 400: '{blue.400}', 500: '#3188df',
      600: '#2474c5', 700: '{blue.700}', 800: '{blue.800}',
      900: '{blue.900}', 950: '{blue.950}',
    },
  },
  components: {
    button: { root: { borderRadius: '12px', paddingX: '1rem', paddingY: '0.875rem' } },
    card: {
      root: { borderRadius: '22px', shadow: '0 12px 35px #243e3205' },
      body: { padding: '25px' },
      title: { fontSize: '1rem' },
    },
  },
});

// 記事カードの共通の余白と外観を定義する。
export const articleCardTokens = { body: { padding: '0', gap: '0' } };
