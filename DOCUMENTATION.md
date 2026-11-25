# ImagineAI Studio — Detailed Technical & User Documentation

**Version:** 1.0.0  
**Architecture:** Vanilla ES6+ Frontend + Node.js HTTP Server (`server.js`) / Vercel Serverless Functions (`api/*.js`)  
**Primary Diffusion Model:** `black-forest-labs/FLUX.1-schnell` (with multi-tier free failover)

---

## 1. Overview

ImagineAI Studio is a full-stack text-to-image web application designed for **free, unlimited image generation without requiring an API token or user login**. It pairs a dark-mode split-pane studio UI with a 3-tier resilient inference engine that automatically rotates across authenticated tokens (if configured), anonymous Hugging Face Spaces, and free distributed/decentralized GPU gateways.

---

## 2. Key Features

### Core Generation
- **Unlimited Tokenless Generation:** Works out-of-the-box with zero `.env` configuration. No daily caps, credit counters, or user quotas.
- **Aspect Ratios:**
  - `1:1` — `1024 × 1024` (Square)
  - `16:9` — `1024 × 576` (Landscape / Cinema)
  - `9:16` — `576 × 1024` (Portrait)
- **Visual Style Presets:** `none` (Natural), `photorealistic`, `cinematic`, `anime`, `digital-art`, and `3d-render`.
- **Prompt Enhancer (`✨ Enhance`):** Automatically enriches short prompts with photographic/rendering descriptors.
- **Negative Prompt (`Avoid`):** Optional input (up to 300 characters) specifying elements to exclude (e.g. `blurry, low quality, extra fingers, watermark`).

### Studio Pro Controls
- **Batch Variations (`1`, `2`, or `4` Images):** Dispatches parallel requests to `/api/generate` and renders a clickable variation grid (`#batch-results-grid`) on the Studio Canvas.
- **Responsive Cancel Generation:** Uses `AbortController` to abort in-flight requests immediately, with a responsive Cancel button (`#btn-cancel`) that adapts across desktop, tablet, and mobile viewports.
- **2x HD AI Upscaler (`Upscale 2x`):** Upscales generated images via `POST /api/upscale` using free, no-token Hugging Face Real-ESRGAN Spaces (`Nick088/Real-ESRGAN_Pytorch` with failover to `doevent/Face-Real-ESRGAN`).
- **Persistent History (`IndexedDB`):** Stores generated image blobs, prompts, and metadata locally in `imagineai_studio_db` (capped at 40 items) so creations survive page refreshes. Includes individual item deletion (`×`) and a **Clear** button.
- **Clipboard & Download:**
  - **Copy Prompt** (`#btn-copy-prompt`)
  - **Copy Image** (`#btn-copy-image` via `ClipboardItem` as `image/png`)
  - **Download HD** (`#btn-download`)
  - **Fullscreen Lightbox Modal** (`#lightbox-modal`)

---

## 3. Project Structure

```text
imagine-ai-studio/
├── api/
│   ├── generate.js                 # Vercel serverless handler for POST /api/generate
│   ├── upscale.js                  # Vercel serverless handler for POST /api/upscale
│   └── health.js                   # Vercel serverless handler for GET /api/health
├── lib/
│   └── inference.js                # Shared 3-tier resilient inference & 2x upscale engine
├── public/
│   ├── assets/                     # Brand logos and SVG icons
│   ├── js/
│   │   ├── components/
│   │   │   ├── AlertBanner.js      # Floating notification banner
│   │   │   ├── DownloadButton.js   # Image download trigger
│   │   │   ├── GenerateButton.js   # Primary generate button state manager
│   │   │   ├── ImagePreview.js     # Canvas viewport states (empty, loading, success, error) & lightbox
│   │   │   └── PromptInput.js      # Prompt textarea, validation, shortcuts, aspect ratio & style pills
│   │   ├── app.js                  # Main frontend orchestrator (App class)
│   │   ├── config.js               # Frontend constants & API endpoints
│   │   ├── historyStore.js         # IndexedDB persistence layer (HistoryStore)
│   │   └── mockService.js          # Procedural canvas fallback for offline/testing
│   ├── index.html                  # Split-pane studio HTML layout
│   └── styles.css                  # Dark studio design system & responsive breakpoints
├── dev-server.js                   # Static-only development server
├── server.js                       # Production Node.js HTTP server & API gateway
├── package.json                    # Dependencies (@gradio/client, @huggingface/inference) & scripts
├── vercel.json                     # Vercel deployment config (outputDirectory: public, maxDuration: 60)
├── .env.example                    # Optional environment variable template
├── README.md                       # Quick-start overview
└── DOCUMENTATION.md                # Detailed technical & user documentation
```

---

## 4. 3-Tier Resilient Inference Architecture

Implemented in `lib/inference.js` (`generateResilient(prompt, dims, negativePrompt)`):

1. **Tier 1 — Authenticated Hugging Face Token Pool (Optional)**
   - Reads `HF_TOKENS` (comma-separated) or `HF_TOKEN` from `.env` / environment.
   - Rotates through configured tokens on `black-forest-labs/FLUX.1-schnell` via `@gradio/client`.
   - Applies a 15-minute cooldown (`TOKEN_COOLDOWN_MS`) to quota-exhausted tokens and evicts stale `gradioClients` entries on error.
   - Skipped immediately if no tokens are configured.

2. **Tier 2 — Anonymous Hugging Face Space Pool (No Token)**
   - Connects anonymously via `@gradio/client` first to `black-forest-labs/FLUX.1-schnell`, and falls back to `stabilityai/stable-diffusion-3.5-large-turbo` if busy or rate-limited.

3. **Tier 3 — Unlimited Distributed & Decentralized Gateway (No Token)**
   - **Pollinations Endpoints:** Tries `gen.pollinations.ai` (`flux`) and `image.pollinations.ai` (`flux`, `turbo`) with an 18-second `AbortController` timeout per endpoint and strict `image/*` `content-type` + payload size (`>= 1000` bytes) validation.
   - **AI Horde Fallback (`generateWithAiHorde`):** Submits an async job to `https://stablehorde.net/api/v2/generate/async` using the public anonymous key `0000000000` (scaled to free-tier dimensions: `512×512`, `576×320`, or `320×576`) and polls until completion.

---

## 5. Backend API Reference

### `GET /api/health`
Returns server status and configured token count.
- **Response (`200 OK`):**
  ```json
  {
    "status": "ok",
    "engine": "FLUX.1-schnell 1024px Resilient Gateway",
    "tokenCount": 0,
    "tokenConfigured": false
  }
  ```

### `POST /api/generate`
Generates an image from a text prompt.
- **Request Body (`application/json`):**
  ```json
  {
    "prompt": "A futuristic cybernetic warrior in neon rain",
    "negativePrompt": "blurry, watermark",
    "aspectRatio": "1:1",
    "style": "photorealistic",
    "enhance": true
  }
  ```
- **Validation:**
  - `prompt`: Required, `3` to `500` characters (`400 PROMPT_TOO_SHORT` / `PROMPT_TOO_LONG`).
  - `negativePrompt`: Optional, truncated to `300` characters.
  - `aspectRatio`: `'1:1'` (default), `'16:9'`, or `'9:16'`.
- **Success (`200 OK`):** Raw binary image (`image/webp`, `image/jpeg`, or `image/png`) with headers `X-Model-Used`, `X-Image-Width`, and `X-Image-Height`.
- **Busy (`503 Service Unavailable`):** `{ "error": "GENERATION_FAILED", "title": "Inference Momentarily Busy", "message": "..." }`.

### `POST /api/upscale`
Upscales an image 2x using free Real-ESRGAN Hugging Face Spaces.
- **Request Body (`application/json`):**
  ```json
  {
    "imageBase64": "<base64-or-data-url>",
    "mimeType": "image/png"
  }
  ```
- **Validation:** Returns `400 MISSING_IMAGE` if `imageBase64` is empty.
- **Success (`200 OK`):** Raw binary upscaled image with `X-Upscaler-Used` header.
- **Busy (`503 Service Unavailable`):** `{ "error": "UPSCALE_FAILED", "title": "Upscaler Busy", "message": "..." }`.

---

## 6. Setup, Running & Deployment

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. (Optional) Create .env if you want Tier 1 HF token priority
# HF_TOKEN=hf_your_token_here
# PORT=3000

# 3. Start the server
npm start
```
Open `http://localhost:3000` in your browser.

### Vercel Deployment
The repository includes [vercel.json](file:///c:/Users/kevin/imagine-ai-studio/vercel.json) configured with:
- `outputDirectory`: `"public"`
- `functions["api/*.js"].maxDuration`: `60`

Deploy directly with the Vercel CLI or Git integration; no environment variables are required for unlimited Tier 2/Tier 3 operation.
