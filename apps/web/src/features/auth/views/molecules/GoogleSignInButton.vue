<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { loadGoogleSignIn } from '../../../../infrastructure/auth/google-sign-in';
const props = defineProps<{ clientId: string }>();
const emit = defineEmits<{ credential: [token: string]; failed: [] }>();
// template refはGoogle SDKがボタンを描画するDOMの受け渡し専用。
const container = ref<HTMLElement | null>(null);
let disposed = false;
onMounted(async () => {
  try {
    const sdk = await loadGoogleSignIn();
    if (disposed || !container.value) return;
    sdk.disableAutoSelect();
    sdk.initialize({ client_id: props.clientId, auto_select: false, ux_mode: 'popup', callback: response => { if (!disposed) emit('credential', response.credential); } });
    sdk.renderButton(container.value, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with' });
  } catch { if (!disposed) emit('failed'); }
});
onUnmounted(() => { disposed = true; });
</script>
<template><div ref="container" aria-label="Googleでログイン" /></template>
