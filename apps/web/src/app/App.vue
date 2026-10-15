<script setup lang="ts">
import { ApiClient } from '../infrastructure/api/api-client';
import ArticleListPage from '../features/list/components/ArticleListPage.vue';

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL || '/api');
</script>

<template>
  <ArticleListPage :api="api" />
</template>
