/**
 * ImagineAI — Reusable DownloadButton Component
 * 
 * Manages downloading the active generated image locally to user device
 * with an intuitive timestamped file naming structure.
 */
import { CONFIG } from '../config.js';

export class DownloadButton {
  constructor({ buttonId, getImageDataFn, getMimeTypeFn }) {
    this.button = document.getElementById(buttonId);
    this.getImageDataFn = getImageDataFn;
    this.getMimeTypeFn = getMimeTypeFn;

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

  _getExtension(mimeType) {
    const type = (mimeType || '').toLowerCase();
    if (type.includes('webp')) return 'webp';
    if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
    if (type.includes('gif')) return 'gif';
    return 'png';
  }

  download() {
    const imageUrl = this.getImageDataFn ? this.getImageDataFn() : null;
    if (!imageUrl) {
      console.warn('DownloadButton: No active image data to download.');
      return;
    }

    const mimeType = this.getMimeTypeFn ? this.getMimeTypeFn() : '';
    const ext = this._getExtension(mimeType);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${CONFIG.IMAGE.DEFAULT_FILENAME_PREFIX}-${timestamp}.${ext}`;

    const anchor = document.createElement('a');
    anchor.href = imageUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
}
