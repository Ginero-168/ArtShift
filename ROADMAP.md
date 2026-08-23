# ArtShift — Product and Engineering Roadmap

> Last verified against the code on **2026-08-23**.

## Product focus

ArtShift is a local-first creative operations and production editor for book advertising and publishing commerce. It receives book catalog metadata, auto-generates multi-format channel-ready advertising campaigns, enforces enterprise publisher brand guidelines, and keeps every output editable for precision fine-tuning.

---

## Production Studio Milestones — Complete

| Milestone | Status | Key Deliverables |
|---|---|---|
| **Phase 1: Campaign Production v1** | Complete | Delimiter-aware CSV parser, heuristic Thai/English column mapper, 4 smart multi-ratio book templates, automated preflight QA overflow & asset defect inspector, batch ZIP creative pack generator with manifest & CSV. |
| **Phase 2: Photoshop Capabilities for Ads** | Complete | 6-mode alignment engine (Left, Center, Right, Top, Middle, Bottom), 2-mode equal gap distribution (H/V), Social UI safe area overlays (TikTok/Reels, IG Story, Print 3mm Bleed), Eyedropper API, color history swatches, glow & shadow effects, focal-point image pinning. |
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
| **Raster Core v1** | One active pixel Selection model, shared by Delete, Brush, Pencil and Eraser | Every pixel edit respects the same Selection and creates one undo step |
| **Raster Performance v1** | Worker/OffscreenCanvas jobs, cancellation, progress, dirty-region rendering | Large selections and thumbnails do not block pointer interaction |
| **Raster Retouch v1** | Feather, invert, transform selection, Auto Subject and Healing spike | Tools are isolated behind a tested raster job seam |
| **Eco/Fast adapters** | Local Worker/WASM path and API path with the same job contract | Users can switch execution mode without changing the document model |
| **Desktop spike** | Tauri platform adapters and static frontend split | Local files and persistence work without coupling the editor to Next API routes |

### Current implementation status

- Raster Core v1: active pixel Selection is now a single image-scoped state;
  Delete, Brush, Pencil, Eraser, Magic Wand, Quick Selection and Auto Subject
  all resolve the same Selection seam.
- Interaction scheduling: pointer previews are coalesced through
  `lib/engine/interactionController.ts` while the store remains the document
  transaction boundary.
- Raster Performance v1: large Magic Wand sampling uses ImageBitmap and a
  Worker with an automatic Canvas2D fallback. Quick Selection's repeated
  growth pass and dirty-region rendering remain the next performance slice.
- Quality: Playwright smoke coverage now verifies the Raster toolbar and tool
  options through a real browser.
