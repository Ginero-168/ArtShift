# ArtShift — Deploy Guide

## Hostinger Shared Hosting (Node.js)

### Prerequisites
- Hostinger Shared Hosting with Node.js support (Premium/Business plan)
- Node.js >= 20 on your local machine

### Step 1: Build locally

```bash
cd ArtShift
npm install
npm run build
```

The current application uses Next.js server routes for AI, stock search,
background removal, catalog ingestion, and PPTX export. A normal build writes
the `.next/` runtime and must be started by a Node.js host with `npm run start`.

### Step 2: Upload to Hostinger

Upload these files/folders via File Manager or FTP:

```
public_html/
├── .htaccess              ← from deploy/.htaccess
├── index.html             ← from out/
├── 404.html               ← from out/ (if exists)
├── _next/                 ← from out/_next/
├── icons/                 ← from public/icons/
├── manifest.webmanifest   ← from out/ (if exists)
└── server/                ← Node.js backend (if using custom server)
```

### Step 3: Set environment variables in hPanel

Go to **Advanced → Node.js → Environment Variables** and add:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | For AI chat |
| `REPLICATE_API_TOKEN` | For Replicate AI backend |
| `GEMINI_API_KEY` | For Gemini proxy |
| `WAVESPEED_API_KEY` | For background removal |
| `UNSPLASH_ACCESS_KEY` | Stock photos |
| `PEXELS_API_KEY` | Stock photos |

### Step 4: Start the app

In hPanel Node.js → click **Run/Start**.

---

## Static Export (No Server)

Static export is not the default build for this project because the current
`next.config.ts` does not enable `output: "export"` and server routes cannot run
from static files. Use a separate static-export configuration only if you need
the editor without AI, stock, background-removal, catalog, or PPTX server APIs.

If that split has been enabled:

```bash
npm run build
```

Upload the generated `out/` folder contents to any static host (GitHub Pages,
Netlify, Vercel, etc). Do not treat the current default `.next/` output as
static `out/` content.

**Note:** AI features (chat, background removal, stock search) require the API backend.
