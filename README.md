# ArtShift

**AI-Powered Slide & Design Studio** — a Canvas2D slide editor with local vision AI, color adjustments, background removal, and PDF import. **Local-first**: your documents live in the browser's `localStorage` only; nothing is stored server-side (see `ROADMAP.md` for the full rationale).

> Built on **Next.js 15** + **React 19** + **TypeScript strict** + **Tailwind v4**

---

## What You Get

| Feature | Description |
|---|---|
| **Slide Editor** | Pure Canvas2D engine, multi-slide deck, arrow binding, frames, PPTX/PNG/PDF export |
| **AI Chat** | Claude tool-use (Anthropic direct) **or** Replicate proxy — mutations apply directly to the canvas |
| **Vision AI** | Local Florence-2: caption, OCR, object detect (100% client-side) |
| **Color Adjustments** | 12 real-time sliders: exposure, contrast, highlights, shadows, etc. |
| **Background Removal** | WaveSpeed BRIA RMBG one-click via API proxy |
| **PDF Import** | Import PDF pages as slide images (pdfjs-dist) |
| **Thai Fonts** | 15 Thai font families built-in |
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
| `ANTHROPIC_API_KEY` | yes (AI chat) | Claude direct SDK |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-5` |
| `REPLICATE_API_TOKEN` | no | Claude via Replicate proxy |
| `GEMINI_API_KEY` | no | `/api/generate` proxy |
| `WAVESPEED_API_KEY` | no | Background removal |
| `UNSPLASH_ACCESS_KEY` | no | Stock photos |
| `PEXELS_API_KEY` | no | Stock photos |

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
  Canvas/                  Canvas2D engine components
  AIImageTools.tsx         AI tools panel (vision + color + bg removal)
lib/
  engine/                  Pure Canvas2D engine (types, store, renderer)
  vision/visionEngine.ts   Florence-2 local vision (client-side)
  color/adjustments.ts     12-slider pixel-level color pipeline
  ai/removeBg.ts           Background removal client
  import/pdfImport.ts      PDF → raster images
```

---

## Deploy

See [deploy/DEPLOY.md](deploy/DEPLOY.md) for Hostinger Shared Hosting step-by-step.

---

## License

Private — not open source.
