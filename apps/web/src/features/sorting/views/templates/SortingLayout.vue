<template>
  <!-- 配置だけを担当する。仕分けの判断や取得・保存は知らない。 -->
  <main class="sorting-page">
    <header><slot name="header" /></header>
    <section class="intro"><slot name="intro" /></section>
    <slot />
    <footer><slot name="footer" /></footer>
  </main>
</template>
<style scoped>
.sorting-page { max-width: 500px; min-height: 100svh; margin: auto; padding: 24px 20px 32px; overflow-x: clip; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.intro { margin: 26px 0 22px; }
footer { margin-top: 24px; }
@media (max-width: 350px) { .sorting-page { padding-inline: 15px; } }
</style>
