# ArtShift

**Local-first artwork editor for book campaigns** — turn a cover and copy into reusable ad artwork, then resize, refine and export without rebuilding every format by hand. ArtShift combines a precision free canvas with an adaptive block layout, non-destructive image editing and editable vector output.

> Built on **Next.js 15** + **React 19** + **TypeScript strict** + **Tailwind v4**

---

## What You Get

| Feature | Description |
|---|---|
| **Dual-mode layers** | A Layer owns many objects and can switch freely between precise Free placement and adaptive hexagonal Block layout |
| **Artwork variants** | Create any custom size while retaining content identity, then synchronize content and appearance without destroying each variant's layout |
| **Vector workflow** | Pen paths, draggable nodes, smoothing, gradients, clipping frames, shapes, arrows, grouping and layer stacking |
| **Image workflow** | Aspect-safe media bounds, crop, shape masks, linked local sources, blur, blend modes and 12 non-destructive color adjustments |
| **Thai typography** | Shared Thai-aware layout for the editor, templates and renderer with safe padding and automatic text-box growth |
| **Templates** | Explicit Replace Artwork or Add as Layer application; template assets are materialized before one atomic document update |
| **Export** | PNG/PDF/PPTX plus editable SVG for the current artwork or every size variant |
| **AI Chat** | Claude tool-use (Anthropic direct) **or** Replicate proxy — mutations apply directly to the canvas |
| **Vision AI** | Local Florence-2: caption, OCR, object detect (100% client-side) |
| **Background Removal** | WaveSpeed BRIA RMBG one-click via API proxy |
| **PDF Import** | Import PDF pages as slide images (pdfjs-dist) |
| **Durable local storage** | IndexedDB document/assets, serial autosave, backup recovery and safe migration from legacy localStorage documents |
| **PWA** | Offline-ready manifest + icons |
| **Deploy** | Hostinger Shared Hosting ready (.htaccess + guide) |

---

## Quick Start

```bash
npm install
cp .env.local.example .env.local   # fill in your API keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the slide editor.

---

## Environment Variables

| Variable | Required | For |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes (AI chat) | Claude direct SDK for chat and optional image prompt enhancement |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-5` |
| `REPLICATE_API_TOKEN` | no | Claude via Replicate proxy |
| `GEMINI_API_KEY` | no | `/api/generate` proxy |
| `WAVESPEED_API_KEY` | no | Background removal |
| `UNSPLASH_ACCESS_KEY` | no | Stock photos |
| `PEXELS_API_KEY` | no | Stock photos |

Image prompt enhancement is optional: when `ANTHROPIC_API_KEY` is unavailable, image generation continues with local Thai keyword enrichment instead of the LLM prompt engineer.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` strict |
| `npm run lint` | Biome check |
| `npm run lint:fix` | Biome auto-fix |
| `npm run test` | Vitest run |

---

## Architecture

```
app/
  api/
    chat/route.ts          Anthropic tool-use + Replicate proxy
    generate/route.ts      Gemini proxy
    removebg/route.ts      WaveSpeed background removal
    stock/route.ts         Unsplash + Pexels
    health/route.ts        Health check
  page.tsx                 Main slide editor
components/
  Builder/                 Block library, layer manager, inspector and artwork resize
  Canvas/                  Precision canvas, gestures, path nodes and overlays
  TemplateBrowser.tsx      Atomic replace/add template workflow
  AIImageTools.tsx         AI tools panel (vision + color + bg removal)
lib/
  engine/                  Document model, store, layout, persistence and exporters
    textLayout.ts          Shared Thai-aware text measurement and wrapping
    resizeArtwork.ts       Pure ratio-aware artwork resize policy
    templateApplication.ts Atomic template application boundary
    vectorPath.ts          Vector-node geometry
    linkedAssets.ts        File System Access API adapter for linked images
    exportSVG.ts           Editable SVG serializer
  renderer/canvas.ts       Shared editor, thumbnail and raster-export renderer
  vision/visionEngine.ts   Florence-2 local vision (client-side)
  color/adjustments.ts     12-slider pixel-level color pipeline
  ai/removeBg.ts           Background removal client
  import/pdfImport.ts      PDF → raster images
```

---

## Deploy

See [deploy/DEPLOY.md](deploy/DEPLOY.md) for Hostinger Shared Hosting step-by-step.

## Product boundary

The current milestone targets the high-frequency production work around book ads: composing covers and copy, creating channel sizes, applying repeatable image treatment and handing off editable SVG. It is not yet a general PSD/AI replacement for print prepress, advanced photo compositing or complex vector illustration. See [ROADMAP.md](ROADMAP.md) for the exact completed scope and remaining gaps.

## Dependency note

Production audit currently reports two high-severity advisories inherited through `pptxgenjs` → `image-size`; no fixed upstream release is available. ArtShift only accepts PNG, JPEG and WebP at the application boundary, so the affected ICNS/JXL/HEIF parsers are not reachable through the editor's supported import path. Keep this exception under review when upgrading PPTX export.

---

## License

Private — not open source.
