# ImagineAI — Text-to-Image AI Generator (v1.0)

A minimalist, high-performance, dark-mode web application that converts natural language text descriptions into photorealistic AI imagery using free Hugging Face serverless infrastructure.

---

## Features (Version 1.0 HD Production Suite)

- **1024 × 1024 Native Full HD Output:** 4x higher pixel density than standard 512px models, generating sharp textures, crisp anatomy, and lifelike lighting.
- **Multi-Engine Failover Architecture:** Automatic, seamless fallback (`black-forest-labs/FLUX.1-schnell` -> `stabilityai/stable-diffusion-3.5-large-turbo`) ensuring uninterrupted, zero-downtime, unlimited generations without hitting quota blocks.
- **Aspect Ratio Control:** Switch between `1:1 Square (1024×1024)`, `16:9 Landscape (1024×576)`, and `9:16 Portrait (576×1024)`.
- **Curated Visual Style Presets:** Quick one-click style enhancement pills (`Natural`, `Photorealistic`, `Cinematic`, `Anime`, `Digital Art`, `3D Render`).
- **Prompt Enhancer ✨:** One-click intelligent prompt polisher that automatically enriches prompts with professional photographic keywords.
- **Fullscreen Lightbox Modal:** Click any rendered visual to inspect and pan in full-screen 1024px sharpness.
- **Live Generation Timer:** Real-time generation stopwatch (`⏱️ 3.4s`) for responsive user feedback.
- **Copy Prompt Action:** Instant one-click clipboard copying.
- **One-Click HD Download:** Direct file download of the high-resolution output.
- **Zero Token Exposure:** Built with a decoupled architecture where the Hugging Face token is strictly isolated on the backend server.
- **Fully Responsive:** Adapts seamlessly to desktop, tablet, and mobile viewports.

---

## Tech Stack

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | HTML5, Modern CSS3 (Vanilla), ES6+ JavaScript | Zero build tool complexity, sub-second load times, modular component architecture. |
| **Backend Gateway** | Node.js (Built-in `http`, `fs`, `path`) | Lightweight, zero-dependency reverse proxy isolating credentials and streaming binary image bytes. |
| **AI Inference** | Hugging Face Spaces (`black-forest-labs/FLUX.1-schnell`) via `@gradio/client` | State-of-the-art 4-step diffusion model running on Hugging Face free serverless GPU compute. |
| **Configuration** | Native `.env` support via `process.loadEnvFile` | Zero-leak credential management. |

---

## Project Structure

```
AI-image generation/
├── .env                      # Local environment variables (HF_TOKEN) [DO NOT COMMIT]
├── .env.example              # Template for required environment variables
├── .gitignore                # Protects .env and node_modules from git commits
├── package.json              # Project scripts and dependencies
├── server.js                 # Production Node.js backend proxy & inference gateway
├── dev-server.js             # Lightweight standalone static development server
├── README.md                 # Project documentation
└── public/
    ├── index.html            # Semantic, accessible HTML5 layout
    ├── styles.css            # Dark studio design system & responsive styling
    └── js/
        ├── config.js         # Centralized application constants
        ├── mockService.js    # Procedural canvas mock service (for offline testing)
        ├── app.js            # Main application orchestrator & state manager
        └── components/
            ├── PromptInput.js      # Textarea, char counter, validation & shortcuts
            ├── GenerateButton.js   # Action trigger with spinner & disabled states
            ├── ImagePreview.js     # Viewport state manager (Empty, Loading, Success, Error)
            ├── DownloadButton.js   # Client-side timestamped PNG download trigger
            └── AlertBanner.js      # Contextual notification banner for errors
```

---

## Getting Started

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher recommended, tested on Node v24).
- A free **Hugging Face Account** ([huggingface.co/join](https://huggingface.co/join)).

### 2. Configure Your Hugging Face Token
1. Generate a free User Access Token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
2. Ensure the token has **Inference** permissions enabled ("Make calls to the serverless Inference API").
3. Create or update your `.env` file in the project root:
   ```env
   HF_TOKEN=hf_your_actual_token_here
   HF_MODEL=black-forest-labs/FLUX.1-schnell
   PORT=3000
   ```

### 3. Start the Server
Run the application from your terminal:
```bash
npm start
```

The server will automatically detect available ports and output:
```
======================================================
  ImagineAI Server & Hugging Face Proxy Online
  Local URL:   http://localhost:3000
  Model:       black-forest-labs/FLUX.1-schnell
  Token:       Configured (Active)
======================================================
```

### 4. Generate Images
Open your web browser and go to:
```
http://localhost:3000
```
Enter a prompt (e.g., *"A cybernetic neon samurai standing under violet rain, volumetric mist, 8k resolution"*), click **Generate Image**, and receive your AI-generated visual in seconds!

---

## Security Best Practices

- **Never place API tokens in client-side JavaScript.** All browser requests route to the internal `/api/generate` endpoint, keeping your token 100% confidential.
- `.env` is listed in [.gitignore](file:///.gitignore) to ensure credentials are never pushed to public repositories.

---

## License

MIT License. Open-source diffusion models are subject to their respective licenses (CreativeML Open RAIL-M / Apache 2.0).
