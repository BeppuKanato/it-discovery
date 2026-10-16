<script setup lang="ts">
import { ApiClient } from '../infrastructure/api/api-client';
import ArticleListPage from '../features/list/components/ArticleListPage.vue';
import { IndexedDbStateOperationStore } from '../features/article-state/repositories/indexeddb-state-operation.store';
import { acquireStateSyncOwner } from '../infrastructure/state-sync-owner';

// import.meta.envはViteが渡す設定。未指定なら同じ配信元の/apiへ接続する。
// 通信部品はここで作り、画面へ渡す。画面自身はAxiosの生成方法を知らなくてよい。
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL || '/api');
// 同じAPIへの未送信キューと所有権をまとめる。別タブは読み書きの前にこの所有権を要求する。
const syncScope = `it-discovery:article-state:${new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.href).href}`;
const stateStore = new IndexedDbStateOperationStore(syncScope);
const acquireSyncOwner = () => acquireStateSyncOwner(syncScope);
</script>

<template>
  <!-- :apiは文字列ではなく、scriptで作ったapiオブジェクトを子のpropsへ渡す。 -->
  <ArticleListPage :api="api" :state-store="stateStore" :acquire-sync-owner="acquireSyncOwner" />
</template>
