# アオイの表示素材

- `aoi-normal.webp`: 通常の全身立ち絵。
- `aoi-thinking.webp`: 考え中の全身立ち絵。
- 元素材: 利用者がこのプロジェクト用に提供したit_discovery_character_assets_v1.zipのfull/normal.png。
- 作成方法: built-in image_genで背景透過と表情差分を作成し、ImageMagickでピクセル寸法と透過を保ったWebP（品質90）へ形式変換。元ZIPは変更しない。
- 通常画像と考え中画像を個別に全身表示し、顔の切り貼りはしない。

## 使用した生成指示

### 通常

Use case: background-extraction. Edit target: provided full body anime companion. Create a clean transparent PNG cutout for a blue and white app UI. Remove ONLY the entire blue gray rectangular background. Preserve the same character identity, dark navy ponytail, blue eyes, friendly face, white blue jacket, black shirt and shorts, blue-white shoes, standing pose, all fingers and both complete shoes. Keep full body entirely inside canvas, no cropping. Transparent actual alpha around silhouette and between limbs, clean smooth edges. No shadow plate, no floor, no text, no additional objects. Character should fill portrait canvas from near top to near bottom. Maintain original anime rendering and clothing details.

### 考え中

Use case identity-preserve. Edit target: provided transparent full-body anime companion for an app. Create her thinking expression variant. Keep exactly the same character, anime style, navy ponytail, blue eyes, white blue jacket, black shirt and shorts, sneakers, full body size/proportions and vertical framing. Change only facial expression to gentle thoughtful curiosity with closed mouth, and bring her currently raised hand near her chin as she thinks. All fingers correct. Both shoes and all hair fit fully within canvas with a small transparent margin. Maintain true transparent background. No text, no ground, no props, no speech bubble, no added symbols.
