# ArtShift — Deploy Guide

## Hostinger Shared Hosting (Node.js)

### Prerequisites
- Hostinger Shared Hosting with Node.js support (Premium/Business plan)
- Node.js 22.23.2 LTS on your local machine (`nvm use` reads `.nvmrc`)

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

For the Node.js deployment, upload the runtime output and package metadata via
File Manager or FTP, then install production dependencies on the host:

```
public_html/
├── .htaccess              ← from deploy/.htaccess
├── .next/                 ← from the normal `npm run build`
├── public/                ← static assets and icons
├── package.json
├── package-lock.json
└── server/                ← only if the host requires a custom launcher
```

Run `npm ci --omit=dev` on the host and start the application with
`npm run start`. Do not upload an `out/` folder for this deployment; the default
build is a Next.js server build and includes API routes.

### Step 3: Set environment variables in hPanel

Go to **Advanced → Node.js → Environment Variables** and add:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | For AI chat |
| `REPLICATE_API_TOKEN` | Optional cloud semantic Vision Assist |
| `GEMINI_API_KEY` | Optional direct Google provider adapter |
| `OPENAI_API_KEY` | Optional direct OpenAI provider adapter |
| `POLLINATIONS_API_KEY` | AI Image Studio generation |
| `AI_MONTHLY_BUDGET_USD` | Optional monthly AI budget guard |
| `UNSPLASH_ACCESS_KEY` | Stock photos |
| `PEXELS_API_KEY` | Stock photos |
| `RASTER_API_URL` | Optional paid Fast raster provider endpoint |
| `RASTER_API_KEY` | Optional bearer token for the raster provider |

### Step 4: Start the app

In hPanel Node.js → click **Run/Start**.

---

## Static Export (No Server)

Static export is not the default build for this project because the current
`next.config.ts` does not enable `output: "export"` and server routes cannot run
from static files. Use a separate static-export configuration only if you need
the editor without cloud AI, stock, catalog, or PPTX server APIs. Local Remove
BG and Extract remain browser features, but model files must be cached first.

The current repository does not ship a static-export build script. If a future
static-only branch enables `output: "export"` and removes the server routes from
the build, run that branch's documented static build command and upload its
generated `out/` contents. Do not treat the current default `.next/` output as
static `out/` content.

For reference, a static-only build would look like:

```bash
npm run build
```

Upload the generated `out/` folder contents to any static host (GitHub Pages,
Netlify, Vercel, etc) only after verifying that no API route is required.

**Note:** AI features (chat, background removal, stock search) require the API backend.
