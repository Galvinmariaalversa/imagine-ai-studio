/**
 * ImagineAI — Frontend Application Configuration (Phase 3 Integration)
 */
export const CONFIG = {
  APP_NAME: 'ImagineAI',
  VERSION: '1.0.0',
  PROMPT: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 500,
    DEFAULT_PLACEHOLDER: 'Describe the image you want to see... (e.g., A cybernetic samurai in a glowing neon rain forest, volumetric lighting, photorealistic, 8k resolution)'
  },
  IMAGE: {
    WIDTH: 512,
    HEIGHT: 512,
    DEFAULT_FILENAME_PREFIX: 'ai-generated-image'
  },
  // API Endpoints connecting to the internal secure backend gateway
  API_ENDPOINT: '/api/generate',
  UPSCALE_ENDPOINT: '/api/upscale',
  HEALTH_ENDPOINT: '/api/health',
  MOCK_DELAY_MS: 1200,
  // Graceful fallback to mock service if user has not yet configured HF_TOKEN in .env
  ENABLE_MOCK_FALLBACK: true
};
