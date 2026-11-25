/**
 * ImagineAI — ImageInfoPanel Component
 * Displays structured metadata for the currently selected/generated image:
 * prompt, model name, dimensions, aspect ratio, and timestamp.
 */
export class ImageInfoPanel {
  constructor({
    panelId,
    promptId,
    modelId,
    dimensionsId,
    ratioId,
    seedId,
    timestampId,
    warningBarId
  }) {
    this.panel = document.getElementById(panelId);
    this.promptEl = document.getElementById(promptId);
    this.modelEl = document.getElementById(modelId);
    this.dimensionsEl = document.getElementById(dimensionsId);
    this.ratioEl = document.getElementById(ratioId);
    this.seedEl = document.getElementById(seedId);
    this.timestampEl = document.getElementById(timestampId);
    this.warningBar = document.getElementById(warningBarId);

    this.clear();
  }

  update({ prompt = '', model = '', width = '', height = '', aspectRatio = '1:1', seed = null, reproducibility = '', warnings = [], createdAt = null }) {
    if (!this.panel) return;
    this.panel.style.display = 'flex';

    if (this.promptEl) this.promptEl.textContent = prompt || '—';
    if (this.modelEl) this.modelEl.textContent = model || 'FLUX.1-schnell';
    if (this.dimensionsEl) {
      const w = width || (aspectRatio === '9:16' ? '576' : '1024');
      const h = height || (aspectRatio === '16:9' ? '576' : '1024');
      this.dimensionsEl.textContent = w === '2x' ? '2x HD Upscaled' : `${w} × ${h} px`;
    }
    if (this.ratioEl) this.ratioEl.textContent = aspectRatio || '1:1';
    if (this.seedEl) {
      if (seed !== null && seed !== undefined && seed !== '') {
        this.seedEl.textContent = reproducibility === 'approximate' ? `${seed} (approx)` : String(seed);
      } else {
        this.seedEl.textContent = 'Random';
      }
    }
    if (this.timestampEl) {
      const dt = createdAt ? new Date(createdAt) : new Date();
      this.timestampEl.textContent = dt.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    if (this.warningBar) {
      if (Array.isArray(warnings) && warnings.length > 0) {
        this.warningBar.textContent = warnings.join(' • ');
        this.warningBar.style.display = 'block';
      } else {
        this.warningBar.textContent = '';
        this.warningBar.style.display = 'none';
      }
    }
  }

  clear() {
    if (this.panel) this.panel.style.display = 'none';
    if (this.warningBar) this.warningBar.style.display = 'none';
  }
}
