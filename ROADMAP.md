# ArtShift — Product and Engineering Roadmap

> Last verified against the code on **2026-08-23**.

## Product focus

ArtShift is a local-first creative operations and production editor for book advertising and publishing commerce. It receives book catalog metadata, auto-generates multi-format channel-ready advertising campaigns, enforces enterprise publisher brand guidelines, and keeps every output editable for precision fine-tuning.

---

## Production Studio Milestones — Complete

| Milestone | Status | Key Deliverables |
|---|---|---|
| **Phase 1: Campaign Production v1** | Complete | Delimiter-aware CSV parser, heuristic Thai/English column mapper, 4 smart multi-ratio book templates, automated preflight QA overflow & asset defect inspector, batch ZIP creative pack generator with manifest & CSV. |
| **Phase 2: Production Layout Capabilities** | Complete | 6-mode alignment engine (Left, Center, Right, Top, Middle, Bottom), 2-mode equal gap distribution (H/V), Social UI safe area overlays (TikTok/Reels, IG Story, Print 3mm Bleed), Eyedropper API, color history swatches, glow & shadow effects, focal-point image pinning. Photoshop-style Raster work is tracked separately below and is not complete. |
| **Phase 3: Illustrator Vector Tools & Badges** | Complete | Bézier node operations (insert, delete, smooth/corner toggle, symmetric tangent handles), interactive path node overlay with handle dragging, parametric promotional badge generators (Starburst, Folded Ribbon, Price Tag, Scalloped Award Seal, Bookmark Tag). |
| **Phase 4: Brand System & Enterprise Governance** | Complete | Publisher Brand Kit manager with custom publisher palettes, typography, and logo watermarks; automated Brand Rules compliance preflight checker; 1-click Apply Brand Kit engine; REST Catalog Ingestion Webhook API (`POST /api/catalog/webhook`). |
| **Production Image Exporters** | Complete | High-performance WebP and compressed JPEG exports with quality and scale controls for ultra-fast web and ad network delivery (<150KB), alongside native PNG, PDF, PPTX, and editable SVG. |

---

## Architectural Principles

- `lib/engine/store.ts` is the application transaction boundary. UI components request operations; they do not mutate document graphs directly.
- `lib/campaign/` owns catalog ingestion, smart multi-format templates, batch generation, and QA preflight inspections.
- `lib/brand/` owns publisher identities, brand kit styling tokens, and compliance validation.
- `lib/engine/align.ts` and `lib/engine/vectorPath.ts` provide pure mathematical algorithms for layout and geometry.
- `lib/engine/layers.ts` owns placement semantics and reflow. Block Layers do not collide with objects in other Block Layers.
- `lib/engine/textLayout.ts` is the single text-measurement path used by templates, Inspector edits, Canvas rendering, and QA overflow checks.
- `lib/renderer/canvas.ts` is the visual source of truth for the editor, thumbnails, and raster exports.
- `lib/engine/exportSVG.ts` and `lib/engine/exportPNG.ts` provide multi-format raster and vector exports.

---

## Quality Gates

Every release branch must pass:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Next engineering phases

The production-studio milestones above are complete. Raster work is now tracked
as a separate foundation so the Photoshop-style tools can grow without making
the existing vector, layout, campaign, and export workflows unstable.

| Phase | Focus | Exit condition |
|---|---|---|
| **Raster Core v1** | One active pixel Selection model, shared by Delete, Brush, Pencil and Eraser | Complete — one Selection seam and one raster edit transaction per committed stroke/job |
| **Raster Performance v1** | Worker/OffscreenCanvas jobs, cancellation, progress, pixel/memory budgets, benchmark | Complete foundation — Magic Wand and Quick Selection leave the pointer path; generic jobs cover selection masks, filters and thumbnails |
| **Raster Retouch v1** | Marching ants, feather, invert, transform selection, Auto Subject and Healing spike | Complete foundation — mask-boundary overlay and OpenCV adapter seam are in place; OpenCV WASM runtime remains optional |
| **Eco/Fast adapters** | Local Worker/WASM path and API path with the same job contract | Complete — `RasterProcessor` plus Local/API implementations and selectable UI mode |
| **Desktop seam** | File System, Persistence and AI Transport ports before Tauri | Complete — browser adapters are isolated; Tauri implementation can be added independently |
| **Modernization experiment** | Next 16, TypeScript 6, and no custom webpack in a separate branch | Complete experiment — see `codex/artshift-modernization-next16-ts6` |

### Current implementation status

- Raster Core v1: active pixel Selection is now a single image-scoped state;
  Delete, Brush, Pencil, Eraser, Magic Wand, Quick Selection and Auto Subject
  all resolve the same Selection seam.
- Interaction scheduling: pointer previews are coalesced through
  `lib/engine/interactionController.ts` while the store remains the document
  transaction boundary.
- Raster Performance v1: `RasterJob` now carries cancellation, progress and
  pixel/memory budgets; LocalRasterProcessor uses a transferable Worker when
  available and the 1024×1024 baseline is recorded by
  `npm run benchmark:raster`.
- Raster Retouch v1: bitmap Selection feedback traces the mask boundary for
  marching ants; Invert, Feather and Transform Selection are available from
  the canvas context menu; `opencvAdapter.ts` is an optional injected spike.
- Eco/Fast and Desktop: the editor can switch between local and API raster
  processing, while platform ports keep file access, persistence and AI
  transport independent of Next.js.
- Modernization: Next 16.3.2 + TypeScript 6.0.3 + no custom webpack passed
  lint, typecheck, test and build on the dedicated experiment branch.
