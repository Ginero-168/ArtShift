# LumenMighty — Deploy Guide

## Hostinger Shared Hosting (Node.js)

### Prerequisites
- Hostinger Shared Hosting with Node.js support (Premium/Business plan)
- Node.js >= 20 on your local machine

### Step 1: Build locally

```bash
cd LumenMighty
npm install
npm run build
```

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

If you only need the slide editor without AI backend:

```bash
npm run build
```

Upload the `out/` folder contents to any static host (GitHub Pages, Netlify, Vercel, etc).

**Note:** AI features (chat, background removal, stock search) require the API backend.
