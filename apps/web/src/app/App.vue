<script setup lang="ts">
import type { AuthenticationModel } from '../features/auth/models/authentication.model';
import AuthenticationGate from '../features/auth/views/organisms/AuthenticationGate.vue';
import AuthenticatedApplication from './AuthenticatedApplication.vue';
import type { ApplicationModels } from './create-application-models';
defineProps<{ authentication: AuthenticationModel; createModels: (subject: string) => ApplicationModels }>();
</script>
<template>
  <AuthenticationGate :model="authentication" v-slot="{ subject }">
    <AuthenticatedApplication :key="subject" :subject="subject" :create-models="createModels" />
  </AuthenticationGate>
</template>
