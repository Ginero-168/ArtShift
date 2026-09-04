# VTracer quality tuning

วันที่ตรวจสอบ: 2026-09-04 (UTC)

## Root cause ที่พบ

ก่อนหน้านี้ UI ส่งค่า `colors`, `detailLevel`, `smoothing`, `cornerSharpness`
และ `minArea` แต่ mapper บังคับ VTracer เป็น `spline + stacked`, เปิด curve
`simplify` ทุกครั้ง และไม่ได้ส่ง `layerDifference` เลย ค่า `Colors` จึงไม่ได้
ควบคุมการแบ่ง region โดยตรง: ใน VTracer `maxColors` เป็น area-weighted palette
quantization ที่ทำงานกับ layer colors ขณะที่การแยก region หลักมาจาก
`colorPrecision`, `layerDifference` และ `filterSpeckle`.

## ค่าเริ่มต้นใหม่

| VTracer Poster (Official) | Polygon | Cutout | Color cluster | 4 | 16 |
| VTracer Photo (Official) | Spline | Stacked | Color cluster | 10 | 48 |
| VTracer B&amp;W (Official) | Spline | Stacked | Binary | 4 | 16 |
| Custom backend profiles | ตาม preset เดิม | ตาม preset เดิม | ArtShift Custom | ตาม preset เดิม | ไม่ใช้ |

Extra curve simplification ปิดเป็นค่าเริ่มต้น เพราะ VTracer fit curve อยู่แล้ว
และการ simplify ซ้ำอาจลบรายละเอียดเล็ก ๆ; ผู้ใช้เปิด `Compact curves` ได้เมื่อ
ต้องการ SVG ที่เล็กลงและยอมแลกความละเอียด

## Controls ใน UI

เปิด `VTracer WASM` จากปุ่มแยกใน Vectorize panel แล้วเปิด
`Advanced Detail & Curve Controls` เพื่อปรับค่าของ VTracer โดยตรง:

- **Geometry**: `Smooth curves`, `Sharp polygon`, `Pixel exact`
- **Region edges**: `Seam-free (Cutout)` หรือ `Layered (Stacked)`
- **Color clustering**: `Color cluster` หรือ `Watershed`
- **Color sensitivity**: ค่าต่ำเก็บ color regions มากขึ้น; ค่าสูงรวมสีใกล้กัน
- **Noise filter (side)**: ขนาดด้านของ speckle filter ตาม native VTracer ไม่ใช่ area
- **Palette max**: จำนวนสีเป้าหมายของ palette ไม่ใช่จำนวน path/region
- **Compact curves**: เปิด extra simplify แบบเลือกได้
- **B&W threshold**: ใช้เฉพาะ binary trace และกำหนดว่าความสว่างระดับใดจะเป็น foreground

## Evidence

การ render SVG กลับเป็น raster บน deterministic flat-art fixtures พบว่า
`cutout + polygon` มี mean absolute pixel error ต่ำกว่า pipeline เดิม
`stacked + spline` ใน fixture ที่วัดได้:

- logo: `0.419` เทียบกับ `0.575`
- poster: `0.362` เทียบกับ `0.794`
- ring: `0.927` เทียบกับ `1.300`

ตัวเลขนี้เป็นหลักฐานสำหรับ flat-art behavior ไม่ใช่คุณภาพของรูปทุกประเภท
โดยเฉพาะภาพจริง/ภาพถ่ายควรเริ่มจาก `Photo Ultra` หรือปรับ `Color sensitivity`
และ `Noise filter` ตามรายละเอียดในรูป

## Official preset research

VTracer upstream มี preset เริ่มต้นจริงเพียงสามตัว: `bw`, `poster` และ `photo`.
ชื่อ `High-Fidelity`, `Illustration`, `Clipart`, `Photo Ultra` ใน UI เดิมของ
ArtShift เป็น wrapper profile ไม่ใช่ชื่อ preset ของ VTracer upstream.

Official recipes ที่ source แนะนำ:

- **Flat color / logo / poster**: เริ่มจาก `preset=poster`, ใช้
  `mode=polygon`, `hierarchical=cutout` และตัวอย่าง upstream จำกัด palette ด้วย
  `max_colors=8`.
- **Photo / gradient**: เริ่มจาก `preset=photo`; ค่าหลักของ preset คือ
  `filterSpeckle=10`, `colorPrecision=8`, `layerDifference=48`,
  `cornerThreshold=180`, `lengthThreshold=4`, `maxIterations=10` และ
  `spliceThreshold=45`. ใช้ `spline + stacked` และไม่เปิด `simplify` โดยไม่จำเป็น.
- **Clean line art**: ใช้ `preset=bw` หรือ `clustering=bw` กับ fixed threshold;
  งานสแกน/แสงไม่สม่ำเสมอใช้ Bradley–Roth `adaptive` threshold.
- **Edge-aware regions**: `clustering=watershed` เป็น alternative region-forming
  algorithm และ upstream ระบุว่าใช้คู่กับ `cutout` ได้ดี.

จุดที่ wrapper เดิมเคยผิดจาก upstream คือบังคับ `spline + stacked`, เปิด
`simplify` ทุกครั้ง, ไม่ส่ง `layerDifference`, และสำหรับ detail ระดับ 5 สร้าง
`lengthThreshold=3.25` ซึ่งต่ำกว่าช่วงที่ upstream ระบุไว้ `3.5–10`.

- [VTracer configuration](https://github.com/visioncortex/vtracer/blob/master/crates/vtracer/src/config.rs)
- [VTracer Node API](https://github.com/visioncortex/vtracer/blob/master/nodejs/README.md)
- [VTracer algorithm documentation](https://www.visioncortex.org/vtracer-docs)
