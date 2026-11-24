/**
 * ImagineAI — Reusable PromptInput & Control Component (HD Edition)
 * 
 * Manages the prompt textarea, character budget, keyboard shortcuts,
 * aspect ratio selection tabs, style preset pills, and prompt enhancer.
 */
import { CONFIG } from '../config.js';

export class PromptInput {
  constructor({ textareaId, counterId, enhanceBtnId, onValidityChange, onSubmitShortcut }) {
    this.textarea = document.getElementById(textareaId);
    this.counter = document.getElementById(counterId);
    this.enhanceBtn = document.getElementById(enhanceBtnId);
    this.onValidityChange = onValidityChange;
    this.onSubmitShortcut = onSubmitShortcut;

    this.selectedRatio = '1:1';
    this.selectedStyle = 'none';

    if (!this.textarea || !this.counter) {
      throw new Error('PromptInput: Required DOM elements missing.');
    }

    this._bindEvents();
    this._bindPillControls();
    this.updateCounter();
  }

  _bindEvents() {
    this.textarea.addEventListener('input', () => {
      this.updateCounter();
      if (this.onValidityChange) {
        this.onValidityChange(this.isValid());
      }
    });

    this.textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (this.isValid() && this.onSubmitShortcut) {
          this.onSubmitShortcut(this.getValue());
        }
      }
    });

    // Auto-Enhance Prompt Button
    if (this.enhanceBtn) {
      this.enhanceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.enhanceCurrentPrompt();
      });
    }

    // Inspiration Chips
    const chips = document.querySelectorAll('.inspiration-chips .chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-prompt');
        if (text) {
          this.setValue(text);
          this.focus();
        }
      });
    });
  }

  _bindPillControls() {
    // Aspect Ratio Tabs
    const ratioBtns = document.querySelectorAll('#aspect-ratio-group .pill-btn');
    ratioBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        ratioBtns.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
        this.selectedRatio = btn.getAttribute('data-ratio') || '1:1';

        // Update preview specification indicator
        const specTag = document.getElementById('preview-spec');
        if (specTag) {
          if (this.selectedRatio === '16:9') specTag.textContent = '1024 × 576 HD';
          else if (this.selectedRatio === '9:16') specTag.textContent = '576 × 1024 HD';
          else specTag.textContent = '1024 × 1024 HD';
        }
      });
    });

    // Style Preset Pills
    const styleBtns = document.querySelectorAll('#style-preset-group .pill-btn');
    styleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        styleBtns.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
        this.selectedStyle = btn.getAttribute('data-style') || 'none';
      });
    });
  }

  enhanceCurrentPrompt() {
    let current = this.getValue();
    if (!current) {
      current = 'A futuristic cybernetic warrior in neon rain';
    }

    const enhancements = [
      ', 8k resolution, cinematic lighting, sharp focus, volumetric mist, photorealistic masterpiece',
      ', octane render, hyper-detailed textures, raytracing reflections, dramatic depth of field, 8k',
      ', breathtaking visual composition, golden hour volumetric lighting, award-winning photography'
    ];

    const randomEnhancement = enhancements[Math.floor(Math.random() * enhancements.length)];

    if (!current.includes('8k') && !current.includes('cinematic')) {
      this.setValue((current + randomEnhancement).slice(0, CONFIG.PROMPT.MAX_LENGTH));
    }
  }

  getValue() {
    return this.textarea.value.trim();
  }

  setValue(val) {
    this.textarea.value = val;
    this.updateCounter();
    if (this.onValidityChange) {
      this.onValidityChange(this.isValid());
    }
  }

  getAspectRatio() {
    return this.selectedRatio;
  }

  getStyle() {
    return this.selectedStyle;
  }

  isValid() {
    const len = this.getValue().length;
    return len >= CONFIG.PROMPT.MIN_LENGTH && len <= CONFIG.PROMPT.MAX_LENGTH;
  }

  updateCounter() {
    const len = this.textarea.value.length;
    this.counter.textContent = len;

    this.counter.classList.toggle('near-limit', len >= 450 && len < 500);
    this.counter.classList.toggle('at-limit', len >= 500);
  }

  setDisabled(disabled) {
    this.textarea.disabled = disabled;
    if (this.enhanceBtn) this.enhanceBtn.disabled = disabled;
  }

  focus() {
    this.textarea.focus();
  }
}
