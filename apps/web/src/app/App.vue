<script setup lang="ts">
import { onMounted } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import { ApiClient } from '../infrastructure/api/api-client';
import { useConnectionCheck } from '../features/connection/useConnectionCheck';

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL || '/api');
const { status, message, checkConnection } = useConnectionCheck(api);
onMounted(checkConnection);
</script>

<template>
  <main class="page">
    <header class="brand"><span class="brand-mark" aria-hidden="true">i</span> IT Discovery</header>
    <section class="intro">
      <p class="eyebrow">小さな発見を、毎日に。</p>
      <h1>気になる情報に<br />出会う準備を。</h1>
      <p class="description">情報を集めて、選んで、読む。<br />まずはアプリの接続を確認します。</p>
    </section>
    <Card class="connection-card" :aria-busy="status === 'checking'">
      <template #title><h2>接続の確認</h2></template>
      <template #content>
        <div class="result">
          <Message
            :severity="status === 'error' ? 'error' : status === 'ready' ? 'success' : 'info'"
            :closable="false"
            :pt="{ root: { role: 'status', 'aria-live': 'polite' } }"
          >
            {{ status === 'idle' || status === 'checking' ? '接続を確認しています…' : message }}
          </Message>
        </div>
      </template>
      <template #footer>
        <Button
          type="button"
          fluid
          :label="status === 'checking' ? '確認中…' : status === 'error' ? 'もう一度試す' : 'もう一度確認する'"
          :loading="status === 'checking'"
          :disabled="status === 'checking'"
          @click="checkConnection"
        />
      </template>
    </Card>
    <p class="footnote">開発準備の画面です。記事の表示・仕分けは、これから追加します。</p>
  </main>
</template>

<style scoped>
.page { max-width: 470px; min-height: 100svh; margin: auto; padding: 32px 24px; }
.brand { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 700; }
.brand-mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: white; background: var(--p-primary-color); font-family: Georgia, serif; font-size: 23px; }
.intro { margin-top: 70px; }
.eyebrow { color: #5c7564; font-size: 12px; letter-spacing: .07em; }
h1 { margin: 18px 0; font-size: clamp(28px, 7vw, 36px); line-height: 1.55; letter-spacing: -.04em; }
.description { color: #657569; font-size: 14px; line-height: 1.9; }
.connection-card { margin-top: 38px; }
h2 { margin: 0; font-size: inherit; }
.result { min-height: 78px; padding-top: 12px; }
.footnote { margin-top: 24px; color: #6f7d71; font-size: 12px; line-height: 1.9; }
@media (max-width: 350px) { .page { padding: 24px 18px; } .intro { margin-top: 45px; } }
</style>
