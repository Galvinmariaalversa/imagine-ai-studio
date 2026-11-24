/**
 * ImagineAI — Mock Generation Service (Phase 2 Testing Layer)
 * 
 * Provides realistic temporary mock generation responses, dynamic canvas rendering,
 * and error simulation triggers for testing the frontend interface prior to backend integration.
 */
import { CONFIG } from './config.js';

export class MockGenerationService {
  /**
   * Generates a dynamic 512x512 mock image based on the prompt text.
   * Returns a Promise that resolves with an object containing { blob, objectUrl, prompt }.
   */
  static async generateImage(prompt) {
    const trimmed = prompt.trim().toLowerCase();

    // Simulation: check for error trigger keywords for testing error state
    if (trimmed === 'error' || trimmed === 'simulate error' || trimmed === 'rate limit') {
      await this._delay(1000);
      const error = new Error('Hugging Face free tier is currently receiving high traffic (Error 429: Too Many Requests). Please wait 60 seconds.');
      error.status = 429;
      error.title = 'Inference Rate Limit Reached';
      throw error;
    }

    if (trimmed === 'timeout' || trimmed === 'cold start') {
      await this._delay(1500);
      const error = new Error('Model runwayml/stable-diffusion-v1-5 is currently warming up on cloud GPU cluster (HTTP 503). Please retry in 20 seconds.');
      error.status = 503;
      error.title = 'Model Warming Up';
      throw error;
    }

    // Normal simulated inference latency
    await this._delay(CONFIG.MOCK_DELAY_MS);

    // Render an artistic 512x512 procedural canvas graphic based on the prompt
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = CONFIG.IMAGE.WIDTH;
      canvas.height = CONFIG.IMAGE.HEIGHT;
      const ctx = canvas.getContext('2d');

      // Hash prompt string to determine dynamic color palette
      let hash = 0;
      for (let i = 0; i < prompt.length; i++) {
        hash = prompt.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue1 = Math.abs(hash % 360);
      const hue2 = (hue1 + 50) % 360;
      const hue3 = (hue1 + 140) % 360;

      // Deep rich gradient background
      const grad = ctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, `hsl(${hue1}, 65%, 15%)`);
      grad.addColorStop(0.5, `hsl(${hue2}, 70%, 25%)`);
      grad.addColorStop(1, `hsl(${hue3}, 80%, 35%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      // Radial glow effect
      const radial = ctx.createRadialGradient(256, 220, 10, 256, 220, 200);
      radial.addColorStop(0, `hsla(${hue2}, 90%, 75%, 0.9)`);
      radial.addColorStop(0.5, `hsla(${hue1}, 80%, 50%, 0.4)`);
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radial;
      ctx.beginPath();
      ctx.arc(256, 220, 200, 0, Math.PI * 2);
      ctx.fill();

      // Artistic shapes
      ctx.beginPath();
      ctx.arc(256, 220, 90, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue3}, 85%, 65%)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(256, 220, 55, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue1}, 95%, 75%)`;
      ctx.fill();

      // Stylized light horizon curves
      ctx.beginPath();
      ctx.moveTo(40, 420);
      ctx.quadraticCurveTo(256, 300, 472, 420);
      ctx.strokeStyle = `hsl(${hue2}, 90%, 70%)`;
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(80, 450);
      ctx.quadraticCurveTo(256, 350, 432, 450);
      ctx.strokeStyle = `hsla(${hue3}, 90%, 80%, 0.6)`;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Prompt overlay stamp at the bottom
      ctx.fillStyle = 'rgba(11, 15, 25, 0.75)';
      ctx.fillRect(0, 460, 512, 52);

      ctx.fillStyle = '#F9FAFB';
      ctx.font = '600 13px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      
      const truncatedPrompt = prompt.length > 48 ? prompt.substring(0, 45) + '...' : prompt;
      ctx.fillText(`“${truncatedPrompt}”`, 256, 488);

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '500 10px monospace';
      ctx.fillText(`ImagineAI Mock Canvas • 512x512`, 256, 504);

      // Convert canvas to binary blob
      canvas.toBlob((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        resolve({
          blob,
          objectUrl,
          prompt,
          dimensions: { width: 512, height: 512 }
        });
      }, 'image/png');
    });
  }

  static _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
