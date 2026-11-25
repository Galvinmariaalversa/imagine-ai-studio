# ImagineAI Studio — Phase 2: Completion Report

**Date:** 2026-11-25  
**Phase:** Phase 2 — Core AI Generation Engine, API Architecture, Security & Verification  
**Status:** Complete — Awaiting User Approval for Phase 3

---

## 1. Files Inspected, Created, and Modified

### Inspected
- `lib/inference.js`, `server.js`, `api/generate.js`, `api/upscale.js`, `api/health.js`, `vercel.json`, `package.json`
- `public/js/app.js`, `public/js/components/DownloadButton.js`
- Live Gradio Space API schemas via `@gradio/client` (`view_api()`) for `black-forest-labs/FLUX.1-schnell`, `stabilityai/stable-diffusion-3.5-large-turbo`, and `Nick088/Real-ESRGAN_Pytorch`.

### Created
- `lib/rateLimiter.js` — Lightweight sliding-window per-IP rate limiter (`createRateLimiter`, `getClientIp`).
- `lib/httpHandlers.js` — Shared request parsing, strict payload/MIME/magic-byte validation, configurable CORS, security headers, rate limiting, and structured error responses used by both `server.js` and `api/*.js`.
- `tests/inference.test.js` — Unit tests for model schemas, prompt builder, quota error detection, and rate limiter.
- `tests/api.test.js` — API handler tests for validation (`400`/`415`), rate limiting (`429`), provider failure (`503`), health (`200`), and upscale image format validation (`400`).

### Modified
- `lib/inference.js` — Added `HF_MODEL_SCHEMAS` with per-model Gradio parameter schemas (`FLUX.1-schnell` vs `SD-3.5-Large-Turbo` with `negative_prompt` & `guidance_scale`), `DEFAULT_BUDGET_MS = 50000` shared execution deadline (`withTimeout`), verified `Nick088/Real-ESRGAN_Pytorch` `/predict` schema (`{ img, size_modifier: '2x' }`), shared `buildFinalPrompt()`, and structured `ALL_PROVIDERS_FAILED` / `UPSCALE_UNAVAILABLE` errors.
- `server.js` — Refactored `/api/generate`, `/api/upscale`, and `/api/health` to use `lib/httpHandlers.js`; added `Content-Security-Policy` header on served HTML.
- `api/generate.js`, `api/upscale.js`, `api/health.js` — Simplified to thin Vercel adapters delegating to `lib/httpHandlers.js`.
- `public/js/components/DownloadButton.js` — Added `_getExtension(mimeType)` so downloaded files use `.webp`, `.jpg`, `.gif`, or `.png` matching the actual generated blob MIME type.
- `public/js/app.js` — Passed `getMimeTypeFn` to `DownloadButton` and changed `enhance: true` to `enhance: false` in the `POST /api/generate` payload so prompt enhancement is not forced silently on every request.
- `package.json` — Added `"test": "node --test tests"`.

---

## 2. Bugs Identified & Fixes Implemented

1. **Wrong Gradio Schema on Secondary HF Model (`SD 3.5 Large Turbo`):**
   - *Fix:* Inspected `stabilityai/stable-diffusion-3.5-large-turbo` `/infer` via `view_api()` and added `HF_MODEL_SCHEMAS` passing `negative_prompt` and `guidance_scale: 0`.
2. **Wrong Gradio Schema on `Nick088/Real-ESRGAN_Pytorch` Upscaler:**
   - *Fix:* Inspected `/predict` via `view_api()` — parameters are `img` and `size_modifier` (not `image` and `scale`). Updated `upscaleResilient` accordingly.
3. **Unbounded Sequential Provider Timeouts vs Vercel 60s Limit:**
   - *Fix:* Added a shared `50000ms` execution budget (`DEFAULT_BUDGET_MS`) in `generateResilient` and `upscaleResilient` so each provider is capped to `Math.min(providerTimeout, remaining())`.
4. **Duplicated Request Parsing & Validation:**
   - *Fix:* Extracted `lib/httpHandlers.js` so `server.js` and `api/*.js` share identical validation (`prompt`, `aspectRatio`, `style`, `batchCount`, `Content-Type`, image magic bytes, and `8MB` upscale limit).
5. **Hardcoded `.png` Download Extension & Forced `enhance: true`:**
   - *Fix:* Updated `DownloadButton.js` to derive extension from `blob.type` and updated `app.js` to send `enhance: false` unless explicitly invoked.

---

## 3. Provider-by-Provider & Image Generation Verification Results

All providers were tested individually in Node.js (with 0 `HF_TOKEN` configured) on `2026-11-25`:

| Provider / Path | Result | Observed Output |
| :--- | :--- | :--- |
| **End-to-End `generateResilient()`** | **PASS (Failover)** | `AI Horde (Stable Diffusion)` • `image/webp` • `15,268` bytes |
| **Tier 2: `black-forest-labs/FLUX.1-schnell` (Anon)** | **FAIL (Quota on IP)** | Passed earlier (`image/webp`, `91,166` bytes); in this run anonymous IP ZeroGPU quota was exhausted (`0s left`). |
| **Tier 2: `stabilityai/stable-diffusion-3.5-large-turbo` (Anon)** | **FAIL (Quota on IP)** | `You have exceeded your ZeroGPU quota (60s requested vs. 0s left)` |
| **Tier 3a: Pollinations (`gen.pollinations.ai` / `image.pollinations.ai`)** | **FAIL (HTTP 402)** | `POLLINATIONS_FAIL: HTTP 402` |
| **Tier 3b: AI Horde (`stablehorde.net/api/v2/generate/async`)** | **PASS** | `AI_HORDE: image/webp 22676` |
| **Upscale: `upscaleResilient()`** | **FAIL (Upstream Unavailable)** | `Nick088/Real-ESRGAN_Pytorch`: ZeroGPU runs limit exceeded on anonymous IP. `doevent/Face-Real-ESRGAN`: `Could not resolve app config. (received status 206)`. |

---

## 4. Security Improvements

- **Configurable CORS (`getAllowedOrigin`):** Replaced `Access-Control-Allow-Origin: *` with origin allowlisting (`localhost`, `127.0.0.1`, `ALLOWED_ORIGIN`, `VERCEL_URL`, or same-host).
- **Per-IP Burst Rate Limiting (`lib/rateLimiter.js`):** 15 requests/minute on `/api/generate` and 6 requests/minute on `/api/upscale`, returning `429 RATE_LIMITED` with `Retry-After`.
- **Security Headers:** Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and `Content-Security-Policy` on HTML responses.
- **Strict Payload & Magic-Byte Validation:** Enforced `application/json` `Content-Type`, body size limits (`32KB` generate / `12MB` upscale JSON / `8MB` decoded image), `batchCount` (`1`, `2`, `4`), and PNG/JPEG/WEBP/GIF magic-byte verification.
- **Secret Isolation:** Token cache keys in `lib/inference.js` never log full tokens.

---

## 5. Automated Test & Syntax Results

- **`node --check`** passed (exit code `0`) on all 9 modified/created JS files: `lib/inference.js`, `lib/rateLimiter.js`, `lib/httpHandlers.js`, `server.js`, `api/generate.js`, `api/upscale.js`, `api/health.js`, `public/js/app.js`, and `public/js/components/DownloadButton.js`.
- **`npm test` (`node --test tests`)**: **9 / 9 tests passed** (`0` failed, `0` skipped, `81ms`).

---

## 6. Remaining Limitations & Known Issues

1. **Anonymous ZeroGPU IP Quotas:** Hugging Face ZeroGPU Spaces (`FLUX.1-schnell`, `SD-3.5-Large-Turbo`, `Nick088/Real-ESRGAN_Pytorch`) enforce strict anonymous IP quotas; when exhausted, generation automatically fails over to **AI Horde**, which succeeded in live testing.
2. **Pollinations `HTTP 402`:** Unauthenticated Pollinations requests currently return `HTTP 402` and fail over to AI Horde.
3. **2x AI Upscaler Availability:** Both remote Real-ESRGAN Spaces failed in anonymous live testing (ZeroGPU runs limit / Space config `206`). A client-side or local fallback upscaler is recommended for Phase 5.
4. **In-Memory Rate Limiter on Serverless:** `lib/rateLimiter.js` is per-instance in memory; on Vercel, each warm serverless instance tracks its own window rather than a global distributed store.

---

**Phase 2 Complete.** Stopping here — awaiting your approval before starting **Phase 3**.
