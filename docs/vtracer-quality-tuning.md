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

| ประเภทภาพ | Geometry | Region edges | Clustering | Filter side | Layer difference |
|---|---|---|---|---:|---:|
| High-Fidelity / Illustration | Spline | Cutout | Color cluster | 2–3 | 16 |
| Clipart / Posterize / Silhouette | Polygon | Cutout | Color/Binary | 4 | 16 |
| Photo Ultra | Spline | Stacked | Color cluster | 10 | 48 |
| Line Art | Spline | Stacked | Binary | 2 | 16 |

Extra curve simplification ปิดเป็นค่าเริ่มต้น เพราะ VTracer fit curve อยู่แล้ว
และการ simplify ซ้ำอาจลบรายละเอียดเล็ก ๆ; ผู้ใช้เปิด `Compact curves` ได้เมื่อ
ต้องการ SVG ที่เล็กลงและยอมแลกความละเอียด

## Controls ใน UI

เปิด `Advanced Detail & Curve Controls` หลังเลือก `VTracer WASM`:

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

## Official references

- [VTracer configuration](https://github.com/visioncortex/vtracer/blob/master/crates/vtracer/src/config.rs)
- [VTracer Node API](https://github.com/visioncortex/vtracer/blob/master/nodejs/README.md)
- [VTracer algorithm documentation](https://www.visioncortex.org/vtracer-docs)
