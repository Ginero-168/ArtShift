# VTracer WASM — Research สำหรับ ArtShift

วันที่ตรวจสอบ: **4 กันยายน 2026 (UTC)**
ขอบเขต: ตรวจ VTracer จาก source/registry ของ upstream และเทียบกับ ArtShift ที่มีอยู่แล้ว โดยไม่ติดตั้ง package และไม่แก้ application source

> แหล่งข้อมูลภายนอกในรายงานนี้เป็น primary/first-party source เท่านั้น: repository และ source code ของ VTracer, crates.io/docs.rs, npm registry/package artifacts และ repository ของผู้ดูแล package แต่ละตัว

## สรุปผู้บริหาร

- **มี official WASM npm package แล้ว:** `@visioncortex/vtracer@1.0.0-alpha.4` เป็น package จาก repository `visioncortex/vtracer` และประกาศตัวเองว่าเป็น WebAssembly build ของ VTracer ที่ไม่มี native dependency; API หลักคือ `convertBuffer`, `convertPixels`, `convertFile` และ `convertFileSync` ([official README](https://github.com/visioncortex/vtracer/blob/master/README.md), [official Node README](https://github.com/visioncortex/vtracer/blob/master/nodejs/README.md), [npm registry metadata](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4)).
- **แต่ package official ปัจจุบันเป็น Node-targeted ไม่ใช่ browser drop-in:** manifest ใช้ `wasm-pack --target nodejs`, ระบุ `engines.node >=16`, และ JS glue ใช้ `fs`/`fs/promises`; จึงไม่ควรนำไป import ใน Client Component หรือ browser Worker ของ ArtShift โดยตรง ([Node `package.json`](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/package.json), [Node `index.js`](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.js), [published package artifact](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4)).
- **มี browser artifact แบบเก่า:** `vtracer-webapp@0.4.0` ยังอยู่บน npm และมี `.wasm` แต่เป็น binding ของ demo รุ่นเก่าที่ผูกกับ `document`, canvas และ SVG element IDs; upstream ระบุว่า webapp GUI รุ่น pre-1.0 ถูกถอดออกจากการพัฒนา 1.0 แล้ว ([npm package metadata](https://registry.npmjs.org/vtracer-webapp), [legacy webapp README](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/Readme.md), [1.0 changelog](https://raw.githubusercontent.com/visioncortex/vtracer/master/CHANGELOG.md)).
- **ข้อสรุปเชิงปฏิบัติ:** มี official package สำหรับ Node และมี legacy browser package แต่ยังไม่มี **maintained, official browser-targeted package สำหรับ current 1.0 engine** ที่ upstream นำเสนอเป็น package หลัก; หาก ArtShift ต้องการ WASM ใน browser จะต้อง build wrapper เองหรือรับความเสี่ยงจาก community package ([current package table](https://github.com/visioncortex/vtracer/blob/master/README.md), [workspace manifest](https://raw.githubusercontent.com/visioncortex/vtracer/master/Cargo.toml)).
- **คำแนะนำ:** อย่าแทนที่ custom vectorizer ทันที ให้ benchmark VTracer เป็น candidate ใน Worker/Node isolation ก่อน เพราะ VTracer คืน SVG string และมี pipeline/mode ที่กว้างกว่า แต่ ArtShift ต้องการ `VectorPathElement[]`, normalized Bézier nodes, bounds, palette และ cancellation/progress แบบของตนเอง ([ArtShift `vectorizer-core.ts`](../lib/vectorize/vectorizer-core.ts#L20-L57), [ArtShift conversion path](../lib/vectorize/vectorizer-core.ts#L568-L713), [VTracer Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts)).

## 1. Official VTracer: ตำแหน่งของโครงการและสถานะ release

### 1.1 สิ่งที่ VTracer ทำ

VTracer อธิบายตัวเองว่าเป็น open-source raster-to-vector converter ที่แปลงภาพ raster เป็น SVG, ใช้กับทั้ง graphics และ photographs, และออกแบบให้ output มีเส้น/shape กระชับ ([official README](https://github.com/visioncortex/vtracer/blob/master/README.md)).

README ของ upstream เปรียบเทียบ pipeline กับ Potrace โดยอ้างว่า VTracer รับภาพสีได้และใช้ pipeline แบบ linear แทน optimal-polygon search ที่มีต้นทุนสูงกว่า; นี่เป็น claim ของโครงการ ไม่ใช่ benchmark อิสระของ ArtShift ([official README](https://github.com/visioncortex/vtracer/blob/master/README.md)).

README ยังระบุ use case ตั้งแต่ high-resolution scans ของ historic blueprints ไปจนถึง low-resolution pixel art และชี้ไปยังคำอธิบาย tracing/clustering ของ Vision Cortex ([official README](https://github.com/visioncortex/vtracer/blob/master/README.md)).

### 1.2 โครงสร้าง package ปัจจุบัน

Current upstream workspace แยก `crates/vtracer` เป็น framework core, `crates/vtracer-cli` เป็น CLI และมี binding แยกนอก workspace สำหรับ Python/Node; root `Cargo.toml` ระบุชัดว่า `webapp` เป็น pre-1.0 tree ที่ถูก exclude และ superseded by workspace ([root `Cargo.toml`](https://raw.githubusercontent.com/visioncortex/vtracer/master/Cargo.toml)).

Current README แสดง programming surfaces หลักเป็น Rust (`vtracer`), CLI (`vtracer-cli`), Python และ `@visioncortex/vtracer` บน npm ซึ่งถูกระบุว่าเป็น Node.js WebAssembly build ([official programming-library table](https://github.com/visioncortex/vtracer/blob/master/README.md)).

Changelog ของ 1.0.0-alpha.1 ระบุการ restructure workspace, เพิ่ม `@visioncortex/vtracer` และลบ pre-1.0 `cmdapp`/demo webapp GUI; นี่เป็นเหตุผลที่ไม่ควรถือ `webapp/` ใน tree ว่าเป็น browser API รุ่นปัจจุบัน ([official changelog](https://raw.githubusercontent.com/visioncortex/vtracer/master/CHANGELOG.md)).

### 1.3 Version และ maintenance

- `vtracer` crate รุ่น `1.0.0-alpha.4` ถูก publish บน crates.io เมื่อ 29 สิงหาคม 2026 และระบุ license `MIT OR Apache-2.0`; release นี้ยังเป็น alpha ไม่ใช่ stable 1.0 ([crates.io version API](https://crates.io/api/v1/crates/vtracer/1.0.0-alpha.4), [crates.io versions API](https://crates.io/api/v1/crates/vtracer/versions)).
- GitHub latest release คือ tag `1.0.0-alpha.4`, publish วันที่ 29 สิงหาคม 2026 ([latest release API](https://api.github.com/repos/visioncortex/vtracer/releases/latest), [release page](https://github.com/visioncortex/vtracer/releases/tag/1.0.0-alpha.4)).
- GitHub repository metadata ระบุ `archived: false`, `disabled: false` และ `pushed_at` วันที่ 31 สิงหาคม 2026; จึงยังไม่ใช่ repository ที่ถูก archive แม้ API surface 1.0 จะยังเป็น alpha ([repository API](https://api.github.com/repos/visioncortex/vtracer)).
- npm official package `@visioncortex/vtracer` รุ่น `1.0.0-alpha.4` ถูก publish/updated ในปลายเดือนสิงหาคม 2026 และมี repository directory เป็น `nodejs`; package registry จึงสอดคล้องกับ release ใหม่มากกว่า legacy `vtracer-webapp` ([npm package API](https://registry.npmjs.org/@visioncortex%2fvtracer), [exact npm version metadata](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4)).
- Legacy `vtracer-webapp` บน npm มี latest `0.4.0`, ถูก modified ในเดือนพฤศจิกายน 2023 และมีเพียง package รุ่นเก่าใน registry ([legacy npm registry metadata](https://registry.npmjs.org/vtracer-webapp)).

**Assessment:** โครงการมี maintenance/release activity ล่าสุดและ current core มีความสามารถเพิ่มขึ้นมาก แต่ต้อง pin alpha version และยอมรับว่า API/behavior ยังอาจเปลี่ยนก่อน stable 1.0 ([official changelog](https://raw.githubusercontent.com/visioncortex/vtracer/master/CHANGELOG.md), [crates.io version API](https://crates.io/api/v1/crates/vtracer/1.0.0-alpha.4)).

## 2. Rust crate และ API model

### 2.1 Core input/output

Core crate ไม่มี file I/O หรือ image decoding; caller ต้องส่ง decoded `ColorImage` แล้วจึงเรียก `Config::build()?.to_svg(&img)` ([docs.rs crate overview](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/), [core `lib.rs`](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/lib.rs)).

`ColorImage` มี `pixels: Vec<u8>`, `width`, `height` และระบุว่าเป็น image ที่มี 4 bytes ต่อ pixel; ดังนั้น boundary กลางของ core คือ RGBA bytes ไม่ใช่ `File`, URL หรือ DOM element ([docs.rs `ColorImage`](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/struct.ColorImage.html)).

Pipeline ภายในเป็น `Frontend → ColorFitter → Compositing → Optimizer → SvgWriter`; มี intermediate `Segmentation` และ `VectorDoc`, และแต่ละ stage ถูกออกแบบเป็น trait ที่สลับ/ประกอบได้ ([docs.rs overview](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/), [core `lib.rs`](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/lib.rs)).

`VectorDoc` มี `width`, `height`, `shapes` และ shapes อยู่ใน paint order; `Paint` ใน current IR มีเพียง `Solid(Color)` ([docs.rs `VectorDoc`](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/ir/struct.VectorDoc.html), [IR source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/ir.rs)).

### 2.2 Configuration / trace modes

| กลุ่ม | Current VTracer API | ความหมายจาก source |
|---|---|---|
| Region forming | `clustering: 'color-cluster' \| 'bw' \| 'watershed'` | hierarchical color clustering, binary thresholding หรือ hierarchical watershed ([Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [config source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/config.rs)) |
| Layer composition | `hierarchical: 'stacked' \| 'cutout'` | stacked painter's algorithm หรือ seam-free/gapless mosaic ([config source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/config.rs), [mosaic source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/mosaic.rs)) |
| Curve fitting | `mode: 'pixel' \| 'polygon' \| 'spline'` | exact pixel-lattice polyline, Douglas–Peucker polygon หรือ cubic Bézier spline ([config source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/config.rs), [fitter source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/fitter.rs)) |
| Presets | `bw`, `poster`, `photo` | binary line art, poster-like color หรือ photo-oriented defaults ([Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [config source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/config.rs)) |
| Color fitting | `palette`, `maxColors`, `colorPrecision`, `layerDifference` | fixed palette, auto-quantization และ controls ของ cluster/color layers ([Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [colorfit source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/colorfit.rs)) |
| Binary controls | `binaryThreshold`, `adaptive`, `adaptiveWindow`, `adaptiveT` | fixed threshold หรือ Bradley–Roth adaptive threshold สำหรับ uneven lighting ([Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [binary frontend](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/frontend/binary.rs)) |
| Geometry/output | `filterSpeckle`, `cornerThreshold`, `lengthThreshold`, `maxIterations`, `spliceThreshold`, `simplify`, `pathPrecision`, `optimize` | speckle, spline fitting, curve re-fit และ SVG output optimization ([Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [config source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/config.rs), [optimizer source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/optimize.rs)) |
| Watershed | `watershedDetail` | cut level ของ watershed hierarchy; upstream ระบุว่าค่าสูงทำให้มี region มากขึ้นและ current alpha ไม่ cap แบบเดิมแล้ว ([Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [changelog](https://raw.githubusercontent.com/visioncortex/vtracer/master/CHANGELOG.md)) |

Changelog ระบุว่า 1.0 เปลี่ยนชื่อแนวคิดจาก `color_mode` เป็น `clustering`; อย่า map ArtShift's `mode: color/monochrome/posterize` แบบตรงตัวไปยัง VTracer เพราะสอง field นี้อยู่คนละ abstraction ([official changelog](https://raw.githubusercontent.com/visioncortex/vtracer/master/CHANGELOG.md), [ArtShift options](../lib/vectorize/vectorizer-core.ts#L20-L29)).

### 2.3 Output SVG

`SvgWriter` serializes document เป็น SVG ที่มี `width`/`height`, `<path>` elements และ solid `fill`; optimizer เลือก relative commands, `H/V/S` shorthand, grouping ของ consecutive same-fill shapes และ coordinate precision ([SVG writer source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/svg.rs), [docs.rs `SvgWriter`](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/svg/struct.SvgWriter.html)).

Official Node package คืน **string** จากทุก conversion API; ไม่ได้คืน `VectorDoc`, shape list, node handles, element IDs หรือ ArtShift-specific metadata ([Node `index.d.ts`](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [Node binding source](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/src/lib.rs), [Node wrapper](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.js)).

## 3. WASM bindings, npm packages และ browser compatibility

### 3.1 Official current package: `@visioncortex/vtracer`

Published manifest ของ `@visioncortex/vtracer@1.0.0-alpha.4` ระบุ `main: index.js`, `types: index.d.ts`, `engines.node: >=16`, license `MIT OR Apache-2.0`, และ repository directory `nodejs` ([npm exact-version metadata](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4)).

Upstream Node README ระบุว่าติดตั้งด้วย `npm install @visioncortex/vtracer`; image decoding และ vectorization อยู่ใน wasm และไม่มี native dependency ([official Node README](https://github.com/visioncortex/vtracer/blob/master/nodejs/README.md)).

Source wrapper เปิด API ดังนี้:

| Function | Input | Output / side effect |
|---|---|---|
| `convertBuffer(buffer, options?)` | encoded image `Uint8Array` | synchronous SVG string ([Node wrapper](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.js), [types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts)) |
| `convertPixels(rgba, width, height, options?)` | raw RGBA8; binding ตรวจ `data.length === width * height * 4` | synchronous SVG string ([Node binding](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/src/lib.rs), [types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts)) |
| `convertFile(input, output, options?)` | filesystem paths | async file read → synchronous wasm trace → filesystem write ([Node wrapper](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.js)) |
| `convertFileSync(input, output, options?)` | filesystem paths | synchronous file read/trace/write ([Node wrapper](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.js)) |

แม้ `convertBuffer`/`convertPixels` จะรับ `Uint8Array` และดูเหมาะกับ Worker แต่ official package ถูก build ด้วย `wasm-pack --target nodejs`; top-level wrapper import `fs` และ generated wasm glue อ่าน `.wasm` ด้วย `require('fs').readFileSync`, จึงไม่ใช่ browser/bundler target โดยตรง ([Node `package.json`](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/package.json), [Node `index.js`](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.js), [published tarball](https://registry.npmjs.org/@visioncortex/vtracer/-/vtracer-1.0.0-alpha.4.tgz), [package metadata](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4)).

Official Node binding มีเพียง two wasm exports (`vectorize_bytes`, `vectorize_rgba`) และไม่ได้ bind `Session`, `Pipeline::run_with_progress`, `CancelToken` หรือ `VectorDoc` ออกมาเป็น public JavaScript API ([Node Rust binding](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/src/lib.rs), [Node TypeScript declarations](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts)).

### 3.2 Legacy official browser package: `vtracer-webapp`

`vtracer-webapp@0.4.0` บน npm มี `vtracer_webapp.js`, `vtracer_webapp_bg.wasm`, TypeScript declarations และ package repository เป็น official `visioncortex/vtracer`; ดังนั้นในความหมายกว้างมี official browser-oriented npm artifact อยู่จริง ([legacy npm registry](https://registry.npmjs.org/vtracer-webapp), [legacy package artifact metadata](https://registry.npmjs.org/vtracer-webapp)).

แต่ package README ยังเป็นขั้นตอน build demo (`wasm-pack build`, webpack dev server) ไม่ใช่ stable browser library contract รุ่น 1.0 ([legacy webapp README](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/Readme.md)).

Legacy binding ผูกกับ DOM โดย `Canvas::new_from_id` เรียก `document().get_element_by_id`, อ่าน `HtmlCanvasElement`/`CanvasRenderingContext2d`, และ `Svg::new_from_id` สร้าง path ลง SVG element; จึงไม่เหมาะกับ Worker ที่ไม่มี DOM ([legacy canvas source](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/src/canvas.rs), [legacy SVG source](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/src/svg.rs), [legacy Cargo manifest](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/Cargo.toml)).

Legacy API เป็น stateful cooperative converter (`new_with_string`, `init`, `tick`, `progress`) และผลลัพธ์ถูกเขียนลง SVG DOM ภายใน Rust แทนที่จะคืน structured SVG/shape result แบบ ArtShift ([legacy binary binding](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/src/conversion/binary_image.rs), [legacy color binding](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/src/conversion/color_image.rs), [legacy generated declarations](https://registry.npmjs.org/vtracer-webapp)).

### 3.3 Community packages ที่ชื่อคล้ายกัน

| Package | หลักฐานจากผู้ดูแล package | ความหมายต่อการเลือก |
|---|---|---|
| `vectortracer@0.1.2` | Community binding ของ Alan North; README ระบุ direct `ImageData`, webworker compatibility และระบุ `Color Image Converter` เป็น unchecked/not published; npm version ถูก publish ในปี 2023 ([package README](https://github.com/AlansCodeLog/vectortracer/blob/master/README.md), [npm registry](https://registry.npmjs.org/vectortracer)) | Browser/Worker shape ดีกว่า legacy แต่เป็น binary-only surface ตาม README และไม่ใช่ upstream official/current 1.0 package ([package source](https://github.com/AlansCodeLog/vectortracer)) |
| `vtracer-wasm@0.1.0` | Community package ของ `jsscheller`; มี repository แยกและ README เพียงระบุว่า expose VTracer app เป็น JS library; มีหนึ่ง version ใน npm ตั้งแต่กรกฎาคม 2025 ([npm registry](https://registry.npmjs.org/vtracer-wasm), [repository README](https://github.com/jsscheller/vtracer-wasm/blob/master/README.md)) | อาจเป็น low-level wrapper ที่ใช้ได้ใน browser แต่ไม่มี upstream maintenance/feature parity รับรอง |
| `wasm_vtracer@0.2.0` | npm registry ระบุ maintainer `pixagram`, MIT และคำอธิบาย WASM bitmap-to-SVG; registry ไม่มี README/source repository ของ upstream ให้ตรวจ ([npm registry](https://registry.npmjs.org/wasm_vtracer)) | อย่าใช้เป็น official provenance; ต้อง audit artifact, source, license และ behavior เอง |
| bare `vtracer` | npm ชื่อนี้ชี้ไป repository `vessp/vtracer`, license ISC และ release หลักอยู่ในปี 2017 ไม่ใช่ `visioncortex/vtracer` ([npm registry](https://registry.npmjs.org/vtracer)) | ห้ามสับสนกับ official package; ใช้ scoped name `@visioncortex/vtracer` เท่านั้น |

**คำตอบที่ precise ต่อคำถาม “มี official ready-to-use VTracer WASM npm package หรือไม่?”**

1. **มีแน่นอนสำหรับ Node:** `@visioncortex/vtracer@1.0.0-alpha.4` เป็น official current package ([official README](https://github.com/visioncortex/vtracer/blob/master/README.md), [npm exact version](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4)).
2. **มี legacy browser artifact:** `vtracer-webapp@0.4.0` แต่ผูก DOM และไม่ใช่ current 1.0 browser API ([legacy npm metadata](https://registry.npmjs.org/vtracer-webapp), [1.0 changelog](https://raw.githubusercontent.com/visioncortex/vtracer/master/CHANGELOG.md)).
3. **ยังไม่พบ maintained official browser-targeted package สำหรับ current 1.0 engine:** current README/package table list Node package เป็น official npm surface, ขณะที่ workspace exclude legacy webapp และ Node package build target เป็น `nodejs` ([current README](https://github.com/visioncortex/vtracer/blob/master/README.md), [root Cargo](https://raw.githubusercontent.com/visioncortex/vtracer/master/Cargo.toml), [Node manifest](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/package.json)).

## 4. Raster formats, alpha และ trace modes

### 4.1 Input formats

| Input path | รูปแบบที่ source ระบุ | ข้อสังเกต |
|---|---|---|
| Core Rust | decoded `ColorImage` ที่มี 4 bytes/pixel | core ไม่ decode image file เอง ([docs.rs `ColorImage`](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/struct.ColorImage.html), [core overview](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/)) |
| Official Node `convertPixels` | raw RGBA8 `width * height * 4` | เหมาะกับ ArtShift หลัง `createImageBitmap`/canvas decode แล้ว ([Node binding](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/src/lib.rs), [Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts)) |
| Official Node `convertBuffer` public docs | PNG, JPEG, GIF, BMP | README/types/comments ระบุสี่ format นี้ ([Node README](https://github.com/visioncortex/vtracer/blob/master/nodejs/README.md), [Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [Node wrapper](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.js)) |
| Current Node wasm build | `image` crate เปิด features `png`, `jpeg`, `gif`, `bmp`, `webp` | root README รุ่นปัจจุบันระบุ PNG/JPEG/GIF/BMP/WebP; จึงควรถือ WebP ว่า supported candidate ของ alpha.4 แต่ต้อง fixture-test เพราะ public Node declaration ยัง list เพียงสี่ format ([Node Cargo manifest](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/Cargo.toml), [current root README](https://github.com/visioncortex/vtracer/blob/master/README.md)) |
| Other encoded formats | decode ใน host เองแล้วส่ง raw RGBA | upstream README ระบุว่า format อื่นให้ decode เองและใช้ `convertPixels`; ไม่ควรสมมติว่า TIFF/AVIF/SVG ถูก decode โดย wrapper นี้ ([current root README](https://github.com/visioncortex/vtracer/blob/master/README.md)) |

Current Node binding ใช้ `ImageReader::with_guessed_format().decode().to_rgba8()` ก่อนสร้าง `ColorImage`; ดังนั้น output ของ decoder ที่เข้า core จะเป็น RGBA แม้ source file จะเป็น RGB ([Node Rust binding](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/src/lib.rs)).

### 4.2 Transparency/alpha behavior

Color-cluster frontend มี transparency keying: เมื่อพบ fully-transparent pixels ในสัดส่วนที่กำหนด จะ recolor เป็น unused key color เพื่อให้ clusterer discard background ได้; behavior นี้ไม่ใช่การรักษา alpha gradient เป็น vector alpha โดยตรง ([keying source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/frontend/keying.rs), [color-cluster frontend](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/frontend/color_cluster.rs)).

Binary frontend แปลงภาพเป็น intensity แล้วให้ทุก region เป็น solid black; adaptive mode ใช้ Bradley–Roth threshold และไม่ใช่ multi-color alpha trace ([binary frontend](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/frontend/binary.rs)).

### 4.3 Output geometry behavior

- `pixel` เก็บ pixel-lattice polyline, `polygon` ใช้ Douglas–Peucker, `spline` fit cubic Béziers; ทั้ง stacked fitters รองรับ outer ring และ holes ใน `MultiPath` ตาม core fitter source ([fitter source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/fitter.rs), [IR source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/ir.rs)).
- `stacked` วาด layer ตาม paint order; `cutout`/mosaic ใช้ shared boundary geometry เพื่อหลีกเลี่ยง cracks/seams ตาม source documentation ([compose source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/compose.rs), [mosaic source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/mosaic.rs)).
- Output เป็น solid-color paths; current `Paint` enum ยังมีเพียง `Solid`, ไม่ใช่ gradients/patterns หรือ native editor element metadata ([IR source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/ir.rs)).

## 5. Performance, threading และ browser execution

### 5.1 Performance claims และ caching

Upstream README อ้าง VTracer pipeline เป็น `O(n)` เมื่อเทียบกับ Potrace's `O(n^2)` fitting และอ้างการรองรับ scans ขนาดใหญ่มาก; ควรอ่านเป็น algorithm/design claim ไม่ใช่ latency guarantee บน browser หรือ ArtShift ([official README](https://github.com/visioncortex/vtracer/blob/master/README.md)).

Current changelog รายงานตัวเลขของผู้พัฒนาเอง เช่น watershed `Session` re-cut ประมาณ 25 ms เทียบกับประมาณ 40 ms บน photo ขนาด 1400×775 และ curve simplification ลดตัวอย่าง SVG จาก 229 เป็น 138 KB ใน stacked หรือ 103 เป็น 36 KB ใน watershed cutout; ตัวเลขเหล่านี้เป็น project-reported measurements และไม่ใช่ benchmark ของ ArtShift ([official changelog](https://raw.githubusercontent.com/visioncortex/vtracer/master/CHANGELOG.md)).

Core มี `Session` สำหรับ cache segmentation ที่แพง แล้ว render downstream stages ใหม่เมื่อเปลี่ยน curve/color/optimization parameters; นี่เหมาะกับ slider UI แต่ current Node wrapper ไม่ expose `Session` เป็น JS API ([session source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/session.rs), [Node binding source](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/src/lib.rs), [Node declarations](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts)).

### 5.2 Threading/progress/cancellation

Core `Pipeline::run_with_progress` รับ `CancelToken` และ progress callback; docs บอกให้เรียกบน worker thread และระบุว่าไม่มี cooperative `tick()` ใน core ใหม่ เพราะ `tick()` เป็นกลไกของ old browser build ส่วน API เดียวกันใช้จาก Web Worker ได้ ([progress docs](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/progress/index.html), [progress source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/progress.rs), [pipeline source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/pipeline.rs)).

Official Node JavaScript surface เป็น synchronous conversion และไม่มี progress/cancel/session exports; ถ้าเรียกบน browser main thread หลัง port แบบตรง ๆ จะ block UI จน conversion จบ ดังนั้น browser integration ต้องวาง call ใน Worker หรือทำ cooperative wrapper เอง ([Node wrapper](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.js), [Node declarations](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts)).

ไม่ควรสมมติว่า official package ใช้ WebAssembly threads/`SharedArrayBuffer` หรือมี thread pool ให้เอง: source ที่ publish สำหรับ Node เป็น plain wasm-bindgen Node target และ exposed API ไม่มี thread control; ให้ถือเป็น one synchronous call per Worker จนกว่าจะ build/benchmark target ที่ต้องการเอง ([Node manifest](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/package.json), [Node Rust binding](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/src/lib.rs), [official CI](https://raw.githubusercontent.com/visioncortex/vtracer/master/.github/workflows/rust.yml)).

### 5.3 Browser compatibility evidence

Official CI มี job build core เป็น `wasm32-unknown-unknown` และ job Node ที่ build `wasm-pack --target nodejs` แล้วรัน Node tests; source ที่ตรวจไม่แสดง official current `wasm-pack --target web` package/test surface ([official Rust CI](https://raw.githubusercontent.com/visioncortex/vtracer/master/.github/workflows/rust.yml)).

Legacy webapp เคยใช้ wasm-pack + webpack `asyncWebAssembly: true` และใช้ `web-sys` Canvas/DOM APIs จึงพิสูจน์ว่าการทำ browser build เป็นไปได้ แต่เป็น old demo architecture ไม่ใช่ current Node package ([legacy README](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/Readme.md), [legacy webpack config](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/app/webpack.config.js), [legacy Cargo](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/Cargo.toml)).

## 6. เทียบกับ ArtShift custom vectorizer ปัจจุบัน

### 6.1 ArtShift contract ที่มีอยู่

| หัวข้อ | ArtShift ปัจจุบัน | Source |
|---|---|---|
| Public input | `vectorizeImage(imageDataUrl, targetBounds, options, callbacks)`; main path decode URL ผ่าน `Image`/canvas, Worker path ใช้ `fetch` + `createImageBitmap` + `OffscreenCanvas` แล้วส่ง `Uint8ClampedArray` เข้า core | [ArtShift entrypoint](../lib/vectorize/vectorizer.ts#L34-L63), [ArtShift Worker](../lib/vectorize/vectorizer.worker.ts#L26-L53) |
| Core input | `vectorizeImageData(pixels, width, height, targetBounds, options, callbacks)` | [ArtShift core](../lib/vectorize/vectorizer-core.ts#L568-L597) |
| Modes/presets | `color`, `monochrome`, `posterize`; presets `highFidelity`, `photoDetailed`, `illustration`, `clipart`, `lineArt`, `silhouette`, `posterize`, `custom` | [ArtShift types/presets](../lib/vectorize/vectorizer-core.ts#L8-L29), [preset config](../lib/vectorize/vectorizer-core.ts#L83-L150) |
| Limits | max dimension 1200 px, max 512 elements, max 50,000 total nodes, max 30,000 contour points | [ArtShift limits](../lib/vectorize/vectorizer-core.ts#L52-L57) |
| Responsiveness | Worker by default when available, progress messages, abort listener and Worker termination; main-thread fallback exists | [ArtShift entrypoint](../lib/vectorize/vectorizer.ts#L70-L143), [ArtShift Worker](../lib/vectorize/vectorizer.worker.ts#L20-L64) |
| Output | `elements: VectorPathElement[]`, `svgString`, `palette`, `totalNodes`, `width`, `height` | [ArtShift result type](../lib/vectorize/vectorizer-core.ts#L31-L38), [result builder](../lib/vectorize/vectorizer-core.ts#L644-L713) |
| Editor integration | caller adds returned elements and selects IDs; UI reports layer/node/color counts and supports cancellation | [ArtShift VisionObjectIsolator](../components/Canvas/PropertiesPanel/VisionObjectIsolator.tsx#L221-L301) |
| Runtime context | Next.js app, browser-oriented package with Node engine constraint for build tooling | [ArtShift `package.json`](../package.json#L1-L24) |

### 6.2 Algorithmic comparison

ArtShift does weighted color-distance K-Means++-style quantization, samples pixels, iterates centroids up to eight times, assigns a color map, then sorts palette by luminance ([ArtShift quantizer](../lib/vectorize/vectorizer-core.ts#L152-L310)).

For each palette color ArtShift builds a full binary mask, scans/trace-contours with an 8-neighbor walk, rejects small areas and hard-fails on contour/element limits ([ArtShift contour tracer](../lib/vectorize/vectorizer-core.ts#L313-L408), [ArtShift conversion loop](../lib/vectorize/vectorizer-core.ts#L602-L643)).

ArtShift simplifies contours with Ramer–Douglas–Peucker and creates corner-preserving normalized Bézier nodes; it then emits solid-filled closed SVG paths ([ArtShift fitting](../lib/vectorize/vectorizer-core.ts#L411-L545), [ArtShift SVG builder](../lib/vectorize/vectorizer-core.ts#L679-L713)).

VTracer instead exposes pluggable region frontends, fitters, color fitters, compositors and optimizer passes, with watershed/mosaic/fixed palette/adaptive threshold features not present as equivalent options in ArtShift ([VTracer core overview](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/), [VTracer config](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/config.rs)).

### 6.3 Main compatibility gaps

1. **Result shape mismatch:** VTracer Node returns SVG text; ArtShift expects editable `VectorPathElement[]` with IDs, normalized nodes, bounds, opacity/fill/stroke/editor flags. Parsing SVG into editor objects is new code and must handle relative commands, shorthand commands, `<g fill>`, multiple subpaths/holes and paint order ([VTracer SVG writer](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/svg.rs), [Node API](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [ArtShift result construction](../lib/vectorize/vectorizer-core.ts#L644-L713)).
2. **Coordinate mismatch:** VTracer writes absolute document-space coordinates with image `width`/`height`; ArtShift stores normalized node coordinates and applies `targetBounds`/`width`/`height`. Adapter ต้อง translate/scale exactly and preserve target bounds ([VTracer fitter/SVG source](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/fitter.rs), [VTracer SVG writer](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/svg.rs), [ArtShift node normalization](../lib/vectorize/vectorizer-core.ts#L480-L545)).
3. **Option mismatch:** ArtShift's `posterize`, `cornerSharpness`, `minArea` and detail levels do not correspond one-to-one with VTracer's `clustering`, `hierarchical`, `mode`, `filterSpeckle`, `simplify` and `watershedDetail`; mappings need visual fixtures, not just type casts ([ArtShift options](../lib/vectorize/vectorizer-core.ts#L20-L29), [VTracer Node options](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts)).
4. **Alpha mismatch:** ArtShift marks alpha `<=64` transparent in its color map and skips those pixels; VTracer keying primarily detects fully transparent pixels and recolors them to a discard key under sampled-row logic. Transparent PNG fixtures are required before claiming parity ([ArtShift alpha handling](../lib/vectorize/vectorizer-core.ts#L185-L200), [ArtShift map handling](../lib/vectorize/vectorizer-core.ts#L263-L310), [VTracer keying](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/frontend/keying.rs)).
5. **Holes/fill-rule risk:** VTracer's `MultiPath` can serialize multiple subpaths, while ArtShift currently creates one closed path per traced contour with `fillRule: "nonzero"`; hole behavior must be rendered and verified rather than inferred from outer contour count ([VTracer IR/fitter](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/fitter.rs), [VTracer SVG writer](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/svg.rs), [ArtShift path object](../lib/vectorize/vectorizer-core.ts#L644-L675)).
6. **Limit/memory risk:** ArtShift enforces 1200 px/512 elements/50k nodes/30k points, while VTracer's `watershedDetail` is explicitly uncapped and upstream advertises high-resolution scans. Any VTracer adapter needs ArtShift-equivalent pre/post limits to avoid huge SVG or browser memory spikes ([ArtShift limits](../lib/vectorize/vectorizer-core.ts#L52-L57), [VTracer config](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/config.rs), [official README](https://github.com/visioncortex/vtracer/blob/master/README.md)).
7. **Cancellation/progress risk:** ArtShift's UI depends on `AbortSignal`, progress stages and Worker termination; official Node package only exposes synchronous calls and no JS cancellation/progress contract. A custom browser binding must define how abort propagates into Rust or discard/terminate the Worker ([ArtShift Worker lifecycle](../lib/vectorize/vectorizer.ts#L76-L110), [ArtShift callbacks](../lib/vectorize/vectorizer-core.ts#L40-L50), [VTracer Node declarations](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [VTracer progress docs](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/progress/index.html)).
8. **Determinism/test risk:** ArtShift chooses the first color centroid using `Math.random()` and also generates random UUID/seed metadata; byte-for-byte output snapshots can vary even before introducing VTracer ([ArtShift quantizer](../lib/vectorize/vectorizer-core.ts#L203-L225), [ArtShift element construction](../lib/vectorize/vectorizer-core.ts#L644-L669)).
9. **Browser packaging/SSR risk:** ArtShift is a Next.js/browser app and its current Worker is an ES module; importing a Node-targeted `require('fs')`/wasm glue from a client bundle can fail at build or runtime. Keep any Node package import server-only or produce a real web-target build ([ArtShift package](../package.json#L9-L43), [ArtShift Worker](../lib/vectorize/vectorizer.ts#L70-L110), [VTracer Node artifact](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4)).

## 7. Integration options (research recommendation only; no code changed)

### Option A — Server/Node adapter around `@visioncortex/vtracer`

**Shape:** Browser sends encoded image/raw RGBA to a Next server route or separate Node worker; server calls `convertBuffer`/`convertPixels`; server returns SVG to a client adapter ([VTracer Node API](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [ArtShift Next package](../package.json#L9-L43)).

**Pros:** uses current official package and its packaged wasm/image readers without writing a Rust browser binding ([official Node README](https://github.com/visioncortex/vtracer/blob/master/nodejs/README.md), [Node Cargo manifest](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/Cargo.toml)).

**Risks:** moves local image data across a server boundary, changes ArtShift's local-first/privacy and offline behavior, adds network latency/resource controls, and still leaves SVG-to-`VectorPathElement` conversion unresolved ([ArtShift development guide](DEVELOPMENT_GUIDE.md#L27-L36), [ArtShift result type](../lib/vectorize/vectorizer-core.ts#L31-L38)).

**Use when:** server-side conversion is explicitly acceptable and SVG export is sufficient; do not present it as the same UX as current local Worker vectorization.

### Option B — Build a first-party ArtShift browser binding over VTracer core

**Shape:** keep ArtShift's existing image decode/resizing Worker path, pass raw RGBA + dimensions to a `wasm-bindgen` wrapper around the wasm-safe Rust core, return SVG plus (preferably) a structured shape IR, and keep the Worker boundary ([VTracer core docs](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/), [VTracer `ColorImage`](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/struct.ColorImage.html), [ArtShift Worker](../lib/vectorize/vectorizer.worker.ts#L26-L55)).

**Pros:** preserves local-first execution, offline use and Worker responsiveness; core itself is documented as wasm-safe and the official CI builds it for `wasm32-unknown-unknown` ([VTracer crate overview](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/), [official Rust CI](https://raw.githubusercontent.com/visioncortex/vtracer/master/.github/workflows/rust.yml)).

**Required work/risks:** create and maintain a web/bundler target not shipped by the current official Node package, pin Rust/VTracer alpha versions, manage `.wasm` assets and Next SSR boundaries, define abort/progress, and expose structured geometry or maintain a robust SVG parser ([VTracer Node build target](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/package.json), [VTracer Node binding](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/src/lib.rs), [ArtShift output contract](../lib/vectorize/vectorizer-core.ts#L31-L38)).

**Best fit if:** VTracer wins a quality/performance benchmark and ArtShift wants its watershed/mosaic/palette features in browser, not merely SVG export.

### Option C — Adopt a community browser package

`vectortracer` is the closest documented Worker-oriented option because it accepts direct `ImageData` and explicitly targets webworkers, but its own feature checklist says color image conversion is not published and its npm release is old ([community README](https://github.com/AlansCodeLog/vectortracer/blob/master/README.md), [npm registry](https://registry.npmjs.org/vectortracer)).

`vtracer-wasm` and `wasm_vtracer` exist as third-party low-level packages, but their registry/repository evidence does not establish official upstream maintenance or current 1.0 feature parity ([vtracer-wasm registry](https://registry.npmjs.org/vtracer-wasm), [wasm_vtracer registry](https://registry.npmjs.org/wasm_vtracer)).

**Recommendation:** use community packages only for a disposable benchmark/prototype after auditing source, package artifact, license and generated wasm; do not make one the production default based on the package name alone ([official current package table](https://github.com/visioncortex/vtracer/blob/master/README.md)).

### Option D — Keep current vectorizer and run VTracer as a benchmark/fallback

This is the lowest-risk path: preserve current editable output, Worker/progress/cancel behavior and explicit complexity limits, then compare VTracer output as an alternate backend on the same decoded RGBA fixtures ([ArtShift Worker](../lib/vectorize/vectorizer.ts#L70-L143), [ArtShift limits](../lib/vectorize/vectorizer-core.ts#L52-L57), [ArtShift result](../lib/vectorize/vectorizer-core.ts#L31-L38)).

If VTracer is better for a class of images, expose an explicit backend/preset rather than silently changing output semantics; VTracer's alpha API and new watershed/mosaic behavior are not guaranteed to match the existing custom engine ([VTracer changelog](https://raw.githubusercontent.com/visioncortex/vtracer/master/CHANGELOG.md), [ArtShift presets](../lib/vectorize/vectorizer-core.ts#L83-L150)).

## 8. Suggested benchmark and acceptance gates

1. **Fixture set:** include flat-color illustration, poster, photograph, pixel art, B/W line art, uneven-light scan, transparent PNG, semi-transparent edge, holes/rings, gradients and very thin components; these exercise both ArtShift's alpha/contour assumptions and VTracer's clustering/mosaic modes ([ArtShift alpha/contour source](../lib/vectorize/vectorizer-core.ts#L185-L200), [VTracer frontend list](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/frontend.rs)).
2. **Normalize input:** decode once to RGBA8, record original dimensions, resize both engines to an agreed max dimension, and use the same background/alpha policy; VTracer core accepts RGBA while ArtShift already decodes via canvas/OffscreenCanvas ([VTracer `ColorImage`](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/struct.ColorImage.html), [ArtShift Worker](../lib/vectorize/vectorizer.worker.ts#L31-L49)).
3. **Compare rendered appearance:** rasterize each SVG at the same viewport and compare pixel/SSIM-like measures plus human review; do not compare raw SVG strings because VTracer optimizer deliberately changes command syntax/precision ([VTracer optimizer/SVG](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/optimize.rs), [VTracer SVG writer](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/svg.rs)).
4. **Compare editability:** count paths, subpaths, commands, cubic/line nodes, holes and fill colors after parsing; verify conversion into ArtShift `VectorPathElement` preserves bounds and selection behavior ([ArtShift result contract](../lib/vectorize/vectorizer-core.ts#L31-L38), [VTracer `VectorDoc`](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/ir/struct.VectorDoc.html)).
5. **Measure runtime/memory:** measure decode, transfer, wasm load, segmentation, fitting, serialization and SVG-to-element adaptation separately in Worker and main-thread fallback; VTracer's own docs call segmentation the expensive stage and ArtShift has explicit Worker progress stages ([VTracer Session](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/session.rs), [ArtShift progress](../lib/vectorize/vectorizer-core.ts#L40-L50)).
6. **Enforce safety budgets:** reject/abort over-detailed results using ArtShift's 1200 px/512 element/50k node policy or a deliberately revised policy; do not expose VTracer's uncapped watershed detail directly to users ([ArtShift limits](../lib/vectorize/vectorizer-core.ts#L52-L57), [VTracer config](https://raw.githubusercontent.com/visioncortex/vtracer/master/crates/vtracer/src/config.rs)).
7. **Pin provenance:** pin `@visioncortex/vtracer`/core version, record npm integrity or source commit, preserve license notices and rerun benchmark when alpha versions change ([npm exact package metadata](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4), [VTracer release](https://github.com/visioncortex/vtracer/releases/tag/1.0.0-alpha.4), [license](https://raw.githubusercontent.com/visioncortex/vtracer/master/LICENSE)).

## 9. License

VTracer workspace, core crate, Node wasm crate and npm package declare `MIT OR Apache-2.0` ([workspace manifest](https://raw.githubusercontent.com/visioncortex/vtracer/master/Cargo.toml), [Node manifest](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/package.json), [npm exact package metadata](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4), [crates.io version](https://crates.io/api/v1/crates/vtracer/1.0.0-alpha.4)).

The repository's top-level `LICENSE` contains MIT terms and requires the copyright and permission notice to be included in copies or substantial portions; ArtShift should preserve the relevant notices in any redistributed source/bundle and review transitive decoder/dependency notices separately ([VTracer LICENSE](https://raw.githubusercontent.com/visioncortex/vtracer/master/LICENSE)).

`vtracer-webapp` also declares `MIT OR Apache-2.0`, while community `vectortracer` and `wasm_vtracer` declare MIT in their npm metadata; package identity and license are separate questions, so a third-party binding must be audited independently ([legacy npm registry](https://registry.npmjs.org/vtracer-webapp), [vectortracer npm registry](https://registry.npmjs.org/vectortracer), [wasm_vtracer npm registry](https://registry.npmjs.org/wasm_vtracer)).

## 10. Final recommendation for ArtShift

**สถานะที่แนะนำตอนนี้:** คง `vectorizer-core.ts` เป็น default production backend และทำ VTracer เป็น benchmark/optional backend ก่อน ([ArtShift public vectorizer](../lib/vectorize/vectorizer.ts#L1-L32), [ArtShift core](../lib/vectorize/vectorizer-core.ts#L568-L713)).

**เหตุผล:** current VTracer มี algorithm/mode/palette/mosaic capabilities ที่น่าสนใจและมี official Node WASM package แต่ package นั้นไม่ใช่ browser target, legacy browser package ผูก DOM และ output official เป็น SVG string ไม่ใช่ ArtShift's editable element model ([VTracer official README](https://github.com/visioncortex/vtracer/blob/master/README.md), [Node manifest](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/package.json), [legacy webapp source](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/src/canvas.rs), [Node types](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts), [ArtShift result](../lib/vectorize/vectorizer-core.ts#L31-L38)).

**ถ้าผล benchmark ชนะอย่างชัดเจน:** ทำ first-party browser binding ที่รับ raw RGBA ใน Worker และ bind structured geometry เพิ่มจาก SVG หรือเขียน parser ที่มี test ครบ; คง ArtShift's dimension/complexity/cancellation policies และเก็บ custom backend เป็น fallback ([VTracer wasm-safe core](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/), [VTracer progress](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/progress/index.html), [ArtShift Worker/cancel](../lib/vectorize/vectorizer.ts#L70-L143), [ArtShift limits](../lib/vectorize/vectorizer-core.ts#L52-L57)).

**สิ่งที่ไม่แนะนำ:** import `@visioncortex/vtracer` เข้า browser bundle โดยตรง, ใช้ `vtracer-webapp` เป็น current 1.0 API, หรือเลือก bare/community package เพียงเพราะชื่อมีคำว่า VTracer โดยยังไม่ตรวจ target, source, output, license และ maintenance ([official Node artifact](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4), [legacy package](https://registry.npmjs.org/vtracer-webapp), [bare npm package](https://registry.npmjs.org/vtracer), [community package](https://registry.npmjs.org/vectortracer)).

## Primary source index

- [VTracer official repository](https://github.com/visioncortex/vtracer)
- [Official README](https://github.com/visioncortex/vtracer/blob/master/README.md)
- [Official CHANGELOG](https://raw.githubusercontent.com/visioncortex/vtracer/master/CHANGELOG.md)
- [Official workspace Cargo.toml](https://raw.githubusercontent.com/visioncortex/vtracer/master/Cargo.toml)
- [Official license](https://raw.githubusercontent.com/visioncortex/vtracer/master/LICENSE)
- [Latest GitHub release](https://github.com/visioncortex/vtracer/releases/tag/1.0.0-alpha.4)
- [GitHub repository API metadata](https://api.github.com/repos/visioncortex/vtracer)
- [Rust crate on crates.io](https://crates.io/crates/vtracer)
- [Rust crate version API](https://crates.io/api/v1/crates/vtracer/1.0.0-alpha.4)
- [Rust API docs](https://docs.rs/vtracer/1.0.0-alpha.4/vtracer/)
- [Node README](https://github.com/visioncortex/vtracer/blob/master/nodejs/README.md)
- [Node `package.json`](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/package.json)
- [Node JS wrapper](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.js)
- [Node TypeScript declarations](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/index.d.ts)
- [Node Rust/WASM binding](https://raw.githubusercontent.com/visioncortex/vtracer/master/nodejs/src/lib.rs)
- [Official npm package metadata](https://registry.npmjs.org/@visioncortex%2fvtracer/1.0.0-alpha.4)
- [Legacy webapp package metadata](https://registry.npmjs.org/vtracer-webapp)
- [Legacy webapp source](https://raw.githubusercontent.com/visioncortex/vtracer/master/webapp/src/lib.rs)
- [Official Rust CI](https://raw.githubusercontent.com/visioncortex/vtracer/master/.github/workflows/rust.yml)
- [Community `vectortracer`](https://github.com/AlansCodeLog/vectortracer)
- [Community `vtracer-wasm`](https://github.com/jsscheller/vtracer-wasm)
- [Community npm registry records](https://registry.npmjs.org/vectortracer), [vtracer-wasm](https://registry.npmjs.org/vtracer-wasm), [wasm_vtracer](https://registry.npmjs.org/wasm_vtracer), [bare vtracer](https://registry.npmjs.org/vtracer)
