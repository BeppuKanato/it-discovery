import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// アプリで使う色と共通部品の見た目を定義する。
export const uiTheme = definePreset(Aura, {
  extend: {
    discovery: {
      background: '#f4f7f3', ink: '#243e32', muted: '#657569', line: '#dfe7df',
      frameStart: '#79c9ed', frameEnd: '#b3a7ee', paper: '#ffffff',
    },
  },
  semantic: {
    primary: {
      50: '{green.50}', 100: '{green.100}', 200: '{green.200}',
      300: '{green.300}', 400: '{green.400}', 500: '#335d45',
      600: '#284e38', 700: '{green.700}', 800: '{green.800}',
      900: '{green.900}', 950: '{green.950}',
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
