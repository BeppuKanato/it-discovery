<script setup lang="ts">
import { onUnmounted } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import type { AuthenticationModel } from '../../models/authentication.model';
import { useAuthenticationViewModel } from '../../view-models/useAuthenticationViewModel';
import GoogleSignInButton from '../molecules/GoogleSignInButton.vue';
const props = defineProps<{ model: AuthenticationModel }>();
const vm = useAuthenticationViewModel(props.model);
const { subject, busy, message, unregisteredSubject } = vm;
onUnmounted(vm.dispose);
</script>
<template>
  <template v-if="subject">
    <div class="account"><Button v-if="!model.development" type="button" label="ログアウト" text size="small" @click="vm.logout" /></div>
    <slot :subject="subject" />
  </template>
  <main v-else class="login">
    <h1>IT Discovery</h1><p>登録済みのGoogleアカウントでログインしてください。</p>
    <Message v-if="message" severity="warn" :closable="false">{{ message }}</Message>
    <p v-if="unregisteredSubject">アカウントID：<code class="subject">{{ unregisteredSubject }}</code></p>
    <p v-if="busy" role="status">ログインを確認しています。</p>
    <div v-show="!busy" class="google-button"><GoogleSignInButton v-if="model.clientId" :client-id="model.clientId" @credential="vm.login" @failed="vm.sdkError" /></div>
  </main>
</template>
<style scoped>
.login{max-width:520px;margin:0 auto;padding:80px 24px;text-align:center;min-height:100svh;}h1{font-size:28px;}p{line-height:1.8;color:var(--p-discovery-muted);}.google-button{display:flex;justify-content:center;margin-top:28px;}.subject{user-select:all;overflow-wrap:anywhere;}.account{display:flex;justify-content:flex-end;max-width:760px;margin:0 auto;padding:8px 20px;}
</style>
