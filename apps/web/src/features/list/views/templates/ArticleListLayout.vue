<template>
  <!-- Template：領域の配置だけを担当する。slotの内容、取得状態、保存手順は知らない。
       Pageから渡された通常のDOMイベントは、一つのroot要素であるmainへ引き継がれる。 -->
  <main class="list-page">
    <header><slot name="header" /></header>
    <section class="intro"><slot name="intro" /></section>
    <div class="toolbar"><slot name="toolbar" /></div>
    <slot name="status" />
    <slot />
    <footer><slot name="footer" /></footer>
  </main>
</template>

<style scoped>
.list-page { max-width: 500px; min-height: 100svh; margin: auto; padding: 20px 20px 30px; }
.intro { margin: 20px 0 15px; }
/* スクロール中も固定ツールバーがノッチ領域へ入り込まないようにする。 */
.toolbar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; padding-top: 10px; background: var(--p-discovery-background); }
footer { margin-top: 26px; }
@media (min-width: 800px) { .list-page { max-width: 900px; padding: 32px 30px 50px; } .intro { margin-top: 42px; } }
@media (max-width: 350px) { .list-page { padding-inline: 15px; } }
</style>
