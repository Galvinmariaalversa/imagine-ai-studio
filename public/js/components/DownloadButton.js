/**
 * ImagineAI — Reusable DownloadButton Component
 * 
 * Manages downloading the active generated image locally to user device
 * with an intuitive timestamped file naming structure.
 */
import { CONFIG } from '../config.js';

export class DownloadButton {
  constructor({ buttonId, getImageDataFn }) {
    this.button = document.getElementById(buttonId);
    this.getImageDataFn = getImageDataFn;

    if (!this.button) {
      throw new Error('DownloadButton: Button DOM element missing.');
    }

    this._bindEvents();
  }

  _bindEvents() {
    this.button.addEventListener('click', (e) => {
      e.preventDefault();
      this.download();
    });
  }

  download() {
    const imageUrl = this.getImageDataFn ? this.getImageDataFn() : null;
    if (!imageUrl) {
      console.warn('DownloadButton: No active image data to download.');
      return;
    }

    // Generate clean timestamped filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${CONFIG.IMAGE.DEFAULT_FILENAME_PREFIX}-${timestamp}.png`;

    const anchor = document.createElement('a');
    anchor.href = imageUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
}
