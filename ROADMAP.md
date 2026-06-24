# LumenMighty — Development Roadmap

> Sprint-level plan for LumenMighty Studio (Next.js 15 + React 19 + TypeScript strict + Tailwind v4).
> Built from the current state where Phase 1 (foundation) and Phase 2 (standard editor) of the canvas rewrite are complete.

---

## Current snapshot

| Area | Status |
|------|--------|
| Architecture | Next.js 15 App Router; new Canvas2D engine lives at `/editor-v2` |
| Phase 1 & 2 | Complete (MVP + standard editor tools) |
| Type check | `npm run typecheck` passes |
| Tests | `npm run test` passes (51 tests) |
| Lint | `npm run lint` fails: 15 errors + 87 warnings (`biome.json` schema is old, plus unused vars, `any`, and import-type issues) |
| Phase 3 | Partially started but not complete (grid snap, crop UI, font picker, PPTX export, arrow binding helper) |
| Legacy | `/editor` and the `excalidraw/` folder are still present and scheduled for removal |

---

## Sprints

### Sprint 1 — Quality Baseline & DX Cleanup

**Goal:** make `lint`, `typecheck`, `test`, and `build` all pass together before adding new features.

- Update `biome.json` to schema `2.5.0` and replace the deprecated `recommended` field with `preset`.
- Run `biome check --write` and review the diff file by file.
- Fix `noUnusedVariables`, `useImportType`, `noExplicitAny`, and `noUnusedFunctionParameters` across `app/editor-v2/page.tsx`, `components/Canvas/*`, and `lib/engine/*`.
- Address the small debt items from `docs/HANDOVER.md`:
  - Skip locked elements when adding to a marquee selection.
  - Make `lib/engine/rough.ts` honor `edgeStyle`, or remove `edgeStyle` from `lib/engine/types.ts`.
  - Let single-element resize on rotated bboxes use `snapResize` in `components/Canvas/Transformer.tsx`.
- Add unit tests for `lib/engine/bounds.ts`, `lib/engine/hitTest.ts`, `lib/engine/snap.ts`, and `lib/engine/binding.ts`.

**Verification:**

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`

---

### Sprint 2 — Arrow Binding & Bound Text

**Goal:** make diagram-style flows actually work.

- Create arrow bindings while drawing or dragging arrow endpoints:
  - `components/Canvas/CanvasEditor.tsx` hit-tests near an endpoint while dragging.
  - `components/Canvas/Transformer.tsx` adds `"start"` / `"end"` handles for arrows so endpoints can be dragged onto a shape.
  - Store `startBinding` / `endBinding` with `focus` and `gap`.
- Extend `lib/engine/binding.ts`:
  - Ensure `recomputeArrowBindings` is invoked after move, resize, and flip.
  - Render a small green dot on a bound endpoint when the arrow is selected.
- Bound text polish:
  - `components/Canvas/TextOverlay.tsx` keeps text centered in its container automatically.
  - `lib/engine/store.ts` updates bound text position/size when its container changes.
  - `lib/renderer/canvas.ts` clips bound text to the container bounds.

**Verification:**

- [ ] Manual test in `/editor-v2` and `/sandbox`
- [ ] New tests for `lib/engine/binding.ts`
- [ ] `npm run lint` and `npm run test`

---

### Sprint 3 — Layout Aids & Image Crop Polish

**Goal:** improve layout precision and image cropping.

- Smart equal-spacing guides:
  - Add `axis: "gap-x" | "gap-y"` to `lib/engine/snap.ts`.
  - Render the new guides in `components/Canvas/Guides.tsx`.
- Grid snap refinements:
  - Separate the visual dot grid toggle from the snap toggle.
  - Adapt dot grid color to the current light/dark theme.
- Image crop improvements:
  - `components/Canvas/CropOverlay.tsx` supports rotated images.
  - `lib/renderer/canvas.ts` uses the 9-argument `drawImage` overload with the `crop` rectangle.
  - Preserve original image aspect ratio during crop.
- If feasible, improve multi-select resize so rotated children keep their visual orientation.

**Verification:**

- [ ] Crop an image, rotate it, and export a PNG
- [ ] Test snap guides and grid toggle
- [ ] `npm run test`

---

### Sprint 4 — Library Panel & Frames

**Goal:** add reusable assets and section containers.

- Library panel:
  - Create `components/Canvas/LibraryPanel.tsx` (or `components/LibraryBrowser.tsx`).
  - Add `lib/engine/libraryStore.ts` to save/load element groups in `localStorage["mighty-slides:library:v1"]`.
  - Add a toolbar or properties-panel entry to open the library.
- Frame / section container:
  - Add `frameId` to `BaseElement` in `lib/engine/types.ts` (or extend `childIds` usage).
  - Add `addFrame`, `moveIntoFrame`, and `removeFromFrame` actions in `lib/engine/store.ts`.
  - `lib/renderer/canvas.ts` clips children when a frame is collapsed.
  - `components/Canvas/CanvasEditor.tsx` selects all children when a frame is dragged.

**Verification:**

- [ ] Save and paste a library item
- [ ] Drag a frame and verify child clipping
- [ ] `npm run test`

---

### Sprint 5 — Search, Stats, and Templates Port

**Goal:** help users discover and create slides faster.

- Stats panel:
  - Add a modal in `app/editor-v2/page.tsx` showing element count, slide count, and approximate storage size.
- Search (Cmd+F):
  - Search `TextElement.text` across the whole deck.
  - Temporarily highlight matches in `components/Canvas/CanvasEditor.tsx`.
- Templates port:
  - Convert legacy templates in `lib/templates.ts` / `lib/templates/` to engine docs.
  - Wire `components/TemplateBrowser.tsx` to the engine store.
  - Store default templates in `public/templates/` or localStorage.

**Verification:**

- [ ] Open stats, run search, create a slide from a template
- [ ] `npm run test` and `npm run build`

---

### Sprint 6 — Export Polish & AI Integration

**Goal:** complete PPTX export and make AI tool-use land on the new engine.

- PPTX export:
  - `lib/engine/exportPPTX.ts` supports arrowheads, line styles, gradients, and patterns.
  - Preserve Thai fonts in the `fontFace` field.
  - Fix rasterization for rough shapes, freedraw, and arrows that are not mapped to native PPTX shapes.
- AI tool-use mapping:
  - Add an adapter in `lib/chat.ts` or `app/api/chat/route.ts` that maps tool calls to `lib/engine/factory.ts` helpers.
  - Support `add_rect`, `add_ellipse`, `add_text`, `add_image`, and `set_background`.
  - Test end-to-end via `components/AIPrompt.tsx` in `/editor-v2`.

**Verification:**

- [ ] Export a complex slide to PPTX and open it
- [ ] Use the AI prompt to create a shape
- [ ] `npm run build`

---

### Sprint 7 — Legacy Cleanup & Migration

**Goal:** retire the old editor and make the new engine the default route.

- Remove `components/ExcalidrawWorkspace.tsx`.
- Remove the `excalidraw/` folder.
- Update `app/editor/page.tsx` to use the new canvas editor.
- Update `tsconfig.json` and `biome.json` to remove `excalidraw/` excludes.
- Update `README.md` and `docs/HANDOVER.md` to reflect the final architecture.
- Optionally redirect `/editor-v2` to `/editor`.

**Verification:**

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] Manual smoke test on `/editor`

---

## Files that will be modified frequently

| File | Why |
|------|-----|
| `app/editor-v2/page.tsx` | Toolbar, hotkeys, export menu, stats modal |
| `components/Canvas/CanvasEditor.tsx` | Selection, dragging, snapping, double-click |
| `components/Canvas/Transformer.tsx` | Resize, rotate, arrow endpoint binding |
| `components/Canvas/PropertiesPanel.tsx` | New UI for library, frame, and font controls |
| `components/Canvas/Guides.tsx` | Smart guides |
| `lib/engine/store.ts` | Most actions |
| `lib/engine/binding.ts` | Arrow binding logic |
| `lib/engine/snap.ts` | Smart guides |
| `lib/renderer/canvas.ts` | Crop rendering, frame clipping, bound text |
| `lib/engine/exportPPTX.ts` | Export fidelity |
| `biome.json` | Linter configuration |

---

## Risks / Considerations

- `biome check --write` may change behavior unintentionally; review every diff.
- Arrow binding with multi-segment arrows is complex; start with two-point arrows.
- PPTX Thai font rendering depends on the end-user's installed fonts; always provide a fallback such as `Noto Sans Thai`.
- Frame clipping may affect renderer performance; measure before optimizing.
- Removing the legacy editor may break old documents; run the existing migration path first.

---

## Verification checklist for every sprint

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Manual smoke test in `/editor-v2` and `/sandbox`
