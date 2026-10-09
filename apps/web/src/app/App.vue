<script setup lang="ts">
import { onMounted } from 'vue';
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
    <section class="connection-card" :aria-busy="status === 'checking'">
      <div class="card-heading"><h2>接続の確認</h2><span class="status-dot" :class="status" aria-hidden="true"></span></div>
      <div role="status" aria-live="polite" class="result">
        <p v-if="status === 'idle' || status === 'checking'">接続を確認しています…</p>
        <p v-else>{{ message }}</p>
      </div>
      <button type="button" :disabled="status === 'checking'" @click="checkConnection">
        {{ status === 'checking' ? '確認中…' : status === 'error' ? 'もう一度試す' : 'もう一度確認する' }}
        <span aria-hidden="true">↗</span>
      </button>
    </section>
    <p class="footnote">開発準備の画面です。記事の表示・仕分けは、これから追加します。</p>
  </main>
</template>
