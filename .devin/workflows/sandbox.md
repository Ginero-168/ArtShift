---
description: Test the new engine canvas at /sandbox
---

1. Make sure the dev server is running. If port 3000 is free, start it:

// turbo
```bash
npm run dev
```

2. Open http://localhost:3000/sandbox in the browser.

3. Manual test checklist:
   - Toolbar: V (select), R (rect), O (ellipse), D (diamond), L (line), A (arrow), P (pen), T (text)
   - Drag on slide with each shape tool → element appears, tool resets to Select
   - Select tool: click to pick, drag empty area = marquee, Shift+click = toggle
   - Drag selected → snap guide lines (orange) at slide edges/center and other elements
   - Resize via 8 handles, rotate via top circle (Shift = AR / 15° snap)
   - Text tool: click → inline contenteditable; Esc/blur to commit; double-click text to re-edit
   - Paste image (⌘V) or drag-drop image file → image element appears
   - Properties panel (right): stroke color, fill, stroke/fill style, roughness, opacity, font, layer, delete
   - Cmd-Z / Cmd-Shift-Z = undo / redo
   - Delete / Backspace removes selection
   - Space + drag = pan, Cmd + wheel = zoom around cursor

4. If anything breaks, capture the console output and the slide JSON via:

```js
copy(JSON.stringify(window.__engine?.getState()?.doc, null, 2))
```
