# ImagineAI Studio — Phase 0: Complete Technical Audit Report

**Date:** 2026-11-25  
**Scope:** Full read-only technical audit of `c:\Users\kevin\imagine-ai-studio` prior to Phase 1+ improvements.  
**Stack:** Vanilla ES6+ / HTML5 / CSS3 (`public/`), Node.js HTTP Server (`server.js`), Vercel Serverless Functions (`api/*.js`), Shared Inference Engine (`lib/inference.js`), IndexedDB (`public/js/historyStore.js`).

---

## 1. Existing Architecture Analysis

### 1.1 Current Project Structure
```text
imagine-ai-studio/
├── api/
│   ├── generate.js                 # Vercel serverless handler (POST /api/generate)
│   ├── upscale.js                  # Vercel serverless handler (POST /api/upscale)
│   └── health.js                   # Vercel serverless handler (GET /api/health)
├── lib/
│   └── inference.js                # Shared 3-tier generation & 2x upscale engine
├── public/
│   ├── assets/                     # SVG/PNG/JPG brand assets
│   ├── js/
│   │   ├── components/
│   │   │   ├── AlertBanner.js      # Floating alert banner
│   │   │   ├── DownloadButton.js   # Blob URL download trigger
│   │   │   ├── GenerateButton.js   # Primary CTA button & loading spinner
│   │   │   ├── ImagePreview.js     # 4-state viewport (empty/loading/success/error) + lightbox
│   │   │   └── PromptInput.js      # Prompt textarea, enhancer, ratio & style pills
│   │   ├── app.js                  # Main UI orchestrator (App class)
│   │   ├── config.js               # Frontend constants & endpoints
│   │   ├── historyStore.js         # IndexedDB persistence (max 40 items)
│   │   └── mockService.js          # Offline procedural canvas fallback
│   ├── index.html                  # Split-pane studio UI
│   └── styles.css                  # Dark obsidian theme + responsive rules
├── dev-server.js                   # Legacy static-only server (no /api routes)
├── server.js                       # Local Node.js HTTP server + static + /api proxy
├── package.json                    # Dependencies: @gradio/client, @huggingface/inference
├── vercel.json                     # Vercel config (outputDirectory: public, maxDuration: 60)
├── .env.example                    # Optional HF_TOKEN / HF_MODEL / PORT template
├── README.md                       # Quick-start README
└── DOCUMENTATION.md                # Technical & API documentation
```

### 1.2 Data & Request Flow
1. **Frontend (`public/js/app.js`):** Collects `prompt`, `negativePrompt`, `aspectRatio`, `style`, and `batchCount` (`1`, `2`, or `4`), then dispatches `count` parallel `POST /api/generate` requests with an `AbortController` signal.
2. **Backend Entry (`server.js` locally / `api/generate.js` on Vercel):** Validates `prompt` (`3–500` chars), resolves `ASPECT_RATIOS` (`1:1`, `16:9`, `9:16`), appends `STYLE_PRESETS` / enhancement keywords, and calls `generateResilient(finalPrompt, dims, negativePrompt)`.
3. **Inference Engine (`lib/inference.js`):**
   - **Tier 1:** Optional `HF_TOKENS` / `HF_TOKEN` rotation via `@gradio/client` (`black-forest-labs/FLUX.1-schnell`) with 15-minute cooldown on quota errors.
   - **Tier 2:** Anonymous `@gradio/client` pool (`black-forest-labs/FLUX.1-schnell` → `stabilityai/stable-diffusion-3.5-large-turbo`).
   - **Tier 3:** `gen.pollinations.ai` / `image.pollinations.ai` (18s timeout per endpoint) → `stablehorde.net/api/v2/generate/async` (anonymous key `0000000000`, 45s poll).
4. **Storage (`public/js/historyStore.js`):** Saves generated `Blob` + metadata in browser IndexedDB (`imagineai_studio_db`), rendered in the bottom filmstrip.

---

## 2. Working, Unverified, and Broken Feature Report

| Feature / Component | Status | Evidence & Notes |
| :--- | :--- | :--- |
| **Syntax & Module Integrity** | **Verified Working** | `node --check` passed on all 9 `.js` files (`lib/inference.js`, `server.js`, `api/*.js`, `public/js/**/*.js`). |
| **Local Server & Health Check** | **Verified Working** | `server.js` starts cleanly; `GET /api/health` returns `200 OK` with token status JSON. |
| **Tier 2 Anonymous `FLUX.1-schnell`** | **Verified Working** | Live `generateResilient` call returned `FLUX.1-schnell (HF Cloud)`, `image/webp`, `91,166` bytes with 0 tokens configured. |
| **`/api/upscale` Input Validation** | **Verified Working** | `POST /api/upscale` with empty body returns `400 MISSING_IMAGE`. |
| **Legacy `image.pollinations.ai`** | **Broken (HTTP 402)** | Observed `HTTP 402 Payment Required` in server logs; Pollinations now gates this route behind credits/keys. |
| **Tier 2 Secondary (`SD 3.5 Large Turbo`)** | **Likely Broken / Unverified** | `generateWithGradio` hardcodes `/infer` with `FLUX.1-schnell` parameters (`num_inference_steps: 4`, `randomize_seed: true`), which may fail on `stabilityai/stable-diffusion-3.5-large-turbo`. |
| **Tier 3 `gen.pollinations.ai` & AI Horde** | **Unverified Live** | Implemented with timeout and `image/*` validation, but not yet tested in a live run where Tier 2 is bypassed. |
| **2x AI Upscaler (`upscaleResilient`)** | **Unverified Live** | `Nick088/Real-ESRGAN_Pytorch` and `doevent/Face-Real-ESRGAN` endpoints were not live-tested with a real image buffer. |
| **Frontend UI Flows (Browser)** | **Unverified Live** | IndexedDB persistence, Cancel (`AbortController`), Batch 2/4 grid, Copy Image (`ClipboardItem`), Lightbox, and DownloadButton have not been E2E tested in a live browser. |

---

## 3. Technical Problems Identified

1. **Gradio Endpoint Mismatch on Secondary HF Space (`lib/inference.js`):**
   - `generateWithGradio()` uses one hardcoded `.predict('/infer', ...)` schema for both `FLUX.1-schnell` and `stabilityai/stable-diffusion-3.5-large-turbo`. Each Space has its own route/arguments; if `FLUX.1-schnell` is down, `SD 3.5` may fail on parameter mismatch.
2. **Vercel 60-Second Timeout Budget Overrun (`vercel.json` vs `lib/inference.js`):**
   - `vercel.json` sets `maxDuration: 60`. Sequential worst-case timeouts (Tier 1 + Tier 2 + 3×18s Pollinations + 45s AI Horde) exceed 60s, causing Vercel to terminate with `504 FUNCTION_INVOCATION_TIMEOUT` before AI Horde completes.
3. **Engine Badge Mislabeling (`public/js/components/ImagePreview.js`):**
   - Line 152 sets `metaEngineTag.textContent = meta.model.includes('FLUX') ? 'FLUX.1 HD' : 'SD 3.5 Turbo';`. As a result, `AI Horde (Unlimited)` and `Real-ESRGAN 2x HD` are mislabeled as `SD 3.5 Turbo`.
4. **Download File Extension Mismatch (`public/js/components/DownloadButton.js`):**
   - Line 37 hardcodes `.png` even when the backend streams `image/webp` (from Hugging Face / AI Horde) or `image/jpeg` (from Pollinations).
5. **Batch Grid Stale State (`public/js/app.js`):**
   - Clicking an item in the Session Creations filmstrip updates the main preview, but does not hide `#batch-results-grid` from a previous 2x/4x generation.
6. **Parallel Batch Rate-Limit Amplification (`public/js/app.js`):**
   - Firing 4 simultaneous `POST /api/generate` requests from one IP can trigger upstream anonymous ZeroGPU concurrency limits on Hugging Face.
7. **Hardcoded `enhance: true` (`public/js/app.js`):**
   - `handleGenerate()` always sends `enhance: true`, even when the user did not toggle or click enhancement (currently masked only when a style preset is selected).
8. **Code Duplication & Dead Code:**
   - Prompt validation and decorator logic are duplicated between `server.js` and `api/generate.js`.
   - Body parsing and upscale validation are duplicated between `server.js` and `api/upscale.js`.
   - `@huggingface/inference` in `package.json` is never imported; `dev-server.js` is superseded by `server.js`.

---

## 4. Security Recommendations

1. **Restrict CORS (`api/generate.js`, `api/upscale.js`, `api/health.js`):**
   - Currently `Access-Control-Allow-Origin: *` allows any external website to call your Vercel endpoints and consume your serverless quota/upstream IP reputation. Restrict to your production domain (and `localhost` in dev) via an `ALLOWED_ORIGIN` env check.
2. **Add Sliding-Window Burst Rate Limiting (Per-IP):**
   - Without adding user accounts or daily caps, enforce a lightweight burst limit (e.g., max 12 requests/minute per IP on `/api/generate` and 6/minute on `/api/upscale`) to protect against automated scraping/DoS.
3. **Enforce Content-Type & Payload Bounds:**
   - Reject non-JSON `POST` requests (`Content-Type` check) and validate `imageBase64` size/magic bytes on `/api/upscale` before decoding into a `Buffer`.
4. **Security Headers (`server.js` & `vercel.json`):**
   - Add `Content-Security-Policy`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` headers alongside existing `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.
5. **XSS-Safe DOM Rendering:**
   - In `app.js` (`renderFilmstrip`) and `batchGrid`, `entry.prompt` is interpolated into `alt="..."` inside `innerHTML`. Replace `innerHTML` attribute interpolation with `document.createElement('img')` + `.alt = ...` and `.src = ...` to eliminate DOM XSS risk.

---

## 5. Performance Recommendations

1. **Tier Time-Budgeting for Serverless (`lib/inference.js`):**
   - Pass a total deadline (`Date.now() + 50000`) through `generateResilient` so each tier respects remaining Vercel execution time rather than stacking unbounded waits.
2. **IndexedDB Storage Hygiene (`public/js/historyStore.js`):**
   - Handle `QuotaExceededError` gracefully (evict oldest items and retry) since 40 upscaled images can exceed browser storage quotas on mobile devices.
   - Revoke `blob:` URLs cleanly on item deletion and page unload.
3. **Batch Concurrency Control:**
   - For `batchCount = 4`, stagger or cap concurrency (e.g., 2 concurrent requests at a time) or vary seeds explicitly so upstream anonymous spaces don't reject 4 simultaneous connections from one IP.
4. **Remove Unused Dependency:**
   - Remove `@huggingface/inference` from `package.json` if unused to reduce install/cold-start footprint.

---

## 6. Proposed Target Architecture & Folder Structure

Preserving the zero-build Vanilla ES6+ and Node.js stack:

```text
imagine-ai-studio/
├── api/
│   ├── generate.js                 # Thin Vercel adapter -> lib/httpHandlers.js
│   ├── upscale.js                  # Thin Vercel adapter -> lib/httpHandlers.js
│   └── health.js                   # Thin Vercel adapter -> lib/httpHandlers.js
├── lib/
│   ├── inference.js                # Per-model Gradio schemas, time-budgeted 3-tier failover, upscaler
│   ├── httpHandlers.js             # NEW: Shared request parsing, validation, rate-limit & response helpers
│   └── rateLimiter.js              # NEW: Lightweight in-memory sliding-window burst limiter
├── public/
│   ├── js/
│   │   ├── components/
│   │   │   ├── AlertBanner.js
│   │   │   ├── DownloadButton.js   # Updated: MIME-aware extension (.webp/.jpg/.png)
│   │   │   ├── GenerateButton.js
│   │   │   ├── ImagePreview.js     # Updated: accurate engine badge + comparison mode
│   │   │   └── PromptInput.js      # Updated: negative prompt, templates, seed, enhance toggle
│   │   ├── app.js                  # Updated: safe DOM creation, favourites, metadata modal
│   │   ├── config.js
│   │   ├── historyStore.js         # Updated: favourites flag, metadata, QuotaExceededError handling
│   │   └── mockService.js
│   ├── index.html
│   └── styles.css
├── tests/                          # NEW: Node built-in test runner (node --test) unit & API tests
│   ├── inference.test.js
│   └── api.test.js
├── server.js                       # Thin local HTTP + static server -> lib/httpHandlers.js
├── vercel.json                     # Updated: security headers + function config
└── package.json                    # Updated: "test": "node --test" script, clean deps
```

**Files Needing Modification:** `lib/inference.js`, `server.js`, `api/generate.js`, `api/upscale.js`, `api/health.js`, `public/index.html`, `public/styles.css`, `public/js/app.js`, `public/js/historyStore.js`, `public/js/components/ImagePreview.js`, `public/js/components/PromptInput.js`, `public/js/components/DownloadButton.js`, `vercel.json`, `package.json`.  
**New Files:** `lib/httpHandlers.js`, `lib/rateLimiter.js`, `tests/inference.test.js`, `tests/api.test.js`.

---

## 7. Feature Implementation Priorities & Technical Risks

| Priority | Feature / Fix | Dependencies | Technical Risk |
| :--- | :--- | :--- | :--- |
| **P0 (Critical)** | Time-budgeted failover, per-model Gradio schemas, XSS-safe DOM, CORS/rate-limit, `ImagePreview` badge & `DownloadButton` extension fix | `lib/httpHandlers.js`, `lib/rateLimiter.js` | Upstream free Space APIs can change routes without notice; mitigate via `client.view_api()` inspection and clean error fallback. |
| **P1 (High)** | Prompt templates, seed control, explicit enhance toggle, batch concurrency smoothing | `PromptInput.js`, `lib/inference.js` | Batch 4x on free ZeroGPU may still queue; stagger requests (2×2) to reduce 429s. |
| **P2 (Medium)** | Favourite gallery filter, image metadata inspector, side-by-side variation comparison | `historyStore.js`, `ImagePreview.js` | IndexedDB schema upgrade (`DB_VERSION = 2`) must migrate existing `creations` store without data loss. |
| **P3 (Enhancement)** | Verified 2x AI upscaler + client-side canvas sharpen fallback when remote Space is busy | `lib/inference.js`, `app.js` | Free Real-ESRGAN Spaces frequently sleep/queue; canvas fallback guarantees the button never dead-ends. |

---

## 8. Phase-Wise Development Roadmap

- **Phase 0: Technical Audit (Current — Complete)**
  - Full codebase inspection, live inference & health verification, and `PHASE_0_AUDIT_REPORT.md`.
- **Phase 1: Professional UI Design**
  - Refine studio layout polish, responsive toolbars, variation comparison view, metadata badge accuracy, and favourite/history tabs while preserving dark obsidian theme.
- **Phase 2: Core AI Generation Engine**
  - Extract shared `lib/httpHandlers.js`, enforce 50s total failover time-budget, fix per-model Gradio parameter schemas, and verify Tier 2 + Tier 3 (Pollinations & AI Horde) live.
- **Phase 3: Advanced Generation Controls**
  - Add Seed input/lock, Prompt Templates library, explicit Enhance toggle, and staggered 2/4 batch variation handling.
- **Phase 4: Image Library and Management**
  - Upgrade `HistoryStore` to `DB_VERSION = 2` with `isFavorite` index, Favourites filter tab, metadata inspector (seed, model, dimensions, timestamp), `QuotaExceededError` eviction, and MIME-accurate downloads.
- **Phase 5: AI Image Enhancement**
  - Live-verify Hugging Face Real-ESRGAN Spaces, add before/after comparison slider or toggle, and add a local 2x canvas sharpen fallback if remote Spaces are busy.
- **Phase 6: Security, Reliability and Performance**
  - Add `lib/rateLimiter.js` burst protection, restrict CORS origins, add CSP/security headers in `server.js` and `vercel.json`, and replace `innerHTML` prompt interpolation with safe DOM APIs.
- **Phase 7: Testing and Deployment**
  - Add `node --test` unit/API test suite (`tests/`), run full browser E2E checklist, and verify Vercel serverless deployment.

---

## 9. Testing Checklist

- [ ] **Unit Tests (`node --test`):** Prompt validation (`<3`, `>500`, valid), `negativePrompt` truncation, `rateLimiter` sliding window, `generateResilient` mocked tier failover & token cooldowns.
- [ ] **API Integration Tests:** `GET /api/health` (`200`), `POST /api/generate` (`400`, `200 image/*`, `503`), `POST /api/upscale` (`400`, `200 image/*`, `503`), burst `429` response.
- [ ] **Live Provider Verification:** Confirm Tier 2 `FLUX.1-schnell`, Tier 2 fallback, Tier 3 Pollinations/AI Horde, and `upscaleResilient` end-to-end.
- [ ] **Browser E2E & Responsive:** Test desktop (`1440px`), tablet (`768px`), and mobile (`375px`) for generation, Cancel (`AbortController`), 2x/4x batch grid, Upscale 2x, Copy Image, Download HD (`.webp`/`.png` match), Lightbox, and IndexedDB persistence across reload.

---

**Audit Complete.** Awaiting your approval before starting **Phase 1**.
