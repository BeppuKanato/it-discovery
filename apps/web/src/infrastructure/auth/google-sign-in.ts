interface GoogleIdentitySdk {
  initialize(options: { client_id: string; callback: (response: { credential: string }) => void; auto_select: boolean; ux_mode: 'popup' }): void;
  renderButton(element: HTMLElement, options: { type: 'standard'; theme: 'outline'; size: 'large'; text: 'signin_with' }): void;
  disableAutoSelect(): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleIdentitySdk } } } }
let loading: Promise<GoogleIdentitySdk> | undefined;
// Google公式SDKを一度だけ読み込む。トークンはcallbackからVMへ渡し、この部品では保存しない。
export function loadGoogleSignIn(): Promise<GoogleIdentitySdk> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); loading = undefined; reject(new Error('Google SDK timeout')); }, 15_000);
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => { clearTimeout(timer); if (window.google?.accounts.id) resolve(window.google.accounts.id); else { loading = undefined; reject(new Error('Google SDK missing')); } };
    script.onerror = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error('Google SDK failed')); };
    document.head.append(script);
  });
  return loading;
}
