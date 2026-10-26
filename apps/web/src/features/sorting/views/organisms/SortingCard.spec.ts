import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Vue from 'vue';
import { createRenderer, h, nextTick, reactive, ref, type Component } from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { SwipeGesture } from '../../models/swipe-gesture';
import { article } from '../../../../test/article-fixture';

// NodeのVitestではSFCがSSR用になるため、同じVueコンパイラでクライアント用のrenderを作る。
// 実ブラウザの代わりとはせず、実際のイベント関数をテスト用描画先へ登録して検証する。
const descriptor = parse(readFileSync(new URL('./SortingCard.vue', import.meta.url), 'utf8')).descriptor;
const compiled = compileScript(descriptor, { id: 'sorting-card-event-test', inlineTemplate: true });
const clientCode = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const componentExports: { default?: Component } = {};
const stubCard = { props: ['article'], emits: ['open'], setup: (_props: unknown, { emit }: { emit: (name: string) => void }) => () => h('a', { onClick: () => emit('open') }, '記事') };
new Function('require', 'exports', clientCode)((id: string) => {
  if (id === 'vue') return Vue;
  if (id.endsWith('ArticleCard.vue')) return { default: stubCard };
  throw new Error(`予期しない依存: ${id}`);
}, componentExports);
const SortingCard = componentExports.default!;
class Target { constructor(private readonly control = false) {} closest(): object | null { return this.control ? {} : null; } }
interface Host { type: string; props: Record<string, unknown>; children: Host[]; parent: Host | null; text: string }
function node(type: string): Host { return { type, props: {}, children: [], parent: null, text: '' }; }
function setup() {
  vi.stubGlobal('Element', Target);
  // ブラウザではないVueのテスト用描画先。DOMや実サイトを操作せず、登録されたイベントを呼ぶ。
  const renderer = createRenderer<Host, Host>({
    createElement: type => node(type), createText: text => ({ ...node('#text'), text }), createComment: text => ({ ...node('#comment'), text }),
    setText: (n,text) => { n.text = text; }, setElementText: (n,text) => { n.text = text; }, patchProp: (n,key,_old,value) => { n.props[key] = value; },
    insert: (n,parent,anchor) => { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n),1); const i = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(i < 0 ? parent.children.length : i,0,n); n.parent = parent; },
    remove: n => { if(n.parent) n.parent.children.splice(n.parent.children.indexOf(n),1); }, parentNode: n => n.parent,
    nextSibling: n => n.parent?.children[n.parent.children.indexOf(n)+1] ?? null,
  });
  const root = node('root'); const current = ref(article(2)); const gesture = reactive(new SwipeGesture());
  const start = vi.fn((x: number,y: number) => gesture.begin(x,y)); const move = vi.fn((x: number,y: number) => gesture.move(x,y));
  const finish = vi.fn(() => { if (gesture.finish()) current.value = article(1); }); const cancel = vi.fn(() => gesture.cancel());
  const app = renderer.createApp({ render: () => h(SortingCard, { article: current.value, offset: gesture.offset, swipeEnabled: true, onStart: start, movePointer: move, onFinish: finish, onCancel: cancel }) }); app.mount(root);
  const surface = () => root.children.find(n => n.type === 'div')!;
  let captured = false;
  const capture = { setPointerCapture: vi.fn(() => { captured = true; }), hasPointerCapture: () => captured };
  const event = (x = 0, y = 0, control = false) => ({ pointerId: 7, isPrimary: true, button: 0, clientX: x, clientY: y, target: new Target(control), currentTarget: capture, cancelable: true, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  const fire = (name: string, e = event()) => { (surface().props[name] as (event: unknown) => void)(e); return e; };
  return { app, surface, event, fire, start, move, finish, cancel, capture };
}
afterEach(() => vi.unstubAllGlobals());
describe('仕分けカードのPointerイベント', () => {
  it('子リンクから外枠へcaptureが移ってもドラッグを続け、DOMの変位を更新する', async () => {
    const f = setup(); f.fire('onPointerdown');
    expect(f.capture.setPointerCapture).toHaveBeenCalledWith(7);
    f.fire('onLostpointercapture'); // targetは子リンク、currentTargetは外枠
    expect(f.cancel).not.toHaveBeenCalled();
    f.fire('onPointermove', f.event(100, 0)); await nextTick();
    expect(f.surface().children.find(n => n.type === 'div')!.props.style).toMatchObject({ transform: expect.stringContaining('translateX(100px)') });
    f.fire('onPointerup', f.event(100, 0)); expect(f.finish).toHaveBeenCalledOnce(); f.app.unmount();
  });
  it('外枠自身がcaptureを失った場合だけキャンセルする', () => {
    const f = setup(); f.fire('onPointerdown');
    f.fire('onLostpointercapture', { ...f.event(), target: f.capture } as unknown as ReturnType<typeof f.event>);
    expect(f.cancel).toHaveBeenCalledOnce();
    f.fire('onPointerup'); expect(f.finish).not.toHaveBeenCalled(); f.app.unmount();
  });
  it('スワイプで次の記事へ交代した後のclickを抑止し、その後の普通のタップは通す', async () => {
    const f = setup(); const original = f.surface(); f.fire('onPointerdown'); f.fire('onPointermove', f.event(100,0)); f.fire('onPointerup', f.event(100,0));
    await nextTick(); expect(f.surface()).toBe(original); expect(f.finish).toHaveBeenCalledOnce();
    f.fire('onLostpointercapture'); const trailing = f.fire('onClickCapture'); expect(trailing.preventDefault).toHaveBeenCalledOnce(); expect(trailing.stopPropagation).toHaveBeenCalledOnce();
    f.fire('onPointerdown'); f.fire('onPointerup'); const tap = f.fire('onClickCapture'); expect(tap.preventDefault).not.toHaveBeenCalled(); f.app.unmount();
  });
  it('縦方向の移動はスクロールを抑止せず、ボタンからの操作は開始しない', () => {
    const f = setup(); f.fire('onPointerdown'); const vertical = f.fire('onPointermove', f.event(1,30)); const diagonal = f.fire('onPointermove', f.event(100,40));
    expect(vertical.preventDefault).not.toHaveBeenCalled(); expect(diagonal.preventDefault).not.toHaveBeenCalled(); f.fire('onPointercancel');
    f.fire('onPointerdown', f.event(0,0,true)); expect(f.start).toHaveBeenCalledOnce(); f.app.unmount();
  });
  it('短い横ドラッグの後のclickも記事を開かず、キャンセル後は次のタップを妨げない', () => {
    const f = setup(); f.fire('onPointerdown'); f.fire('onPointermove', f.event(25,0)); f.fire('onPointerup', f.event(25,0));
    expect(f.fire('onClickCapture').preventDefault).toHaveBeenCalledOnce();
    f.fire('onPointerdown'); f.fire('onPointermove', f.event(25,0)); f.fire('onPointercancel'); expect(f.fire('onClickCapture').preventDefault).not.toHaveBeenCalled(); f.app.unmount();
  });
});
