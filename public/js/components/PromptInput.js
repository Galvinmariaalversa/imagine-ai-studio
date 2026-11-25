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

    // Advanced Prompt Builder fields trigger validity check without altering textarea
    const builderIds = [
      'builder-subject', 'builder-environment', 'builder-lighting',
      'builder-camera', 'builder-art-style', 'builder-mood', 'builder-composition'
    ];
    builderIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          if (this.onValidityChange) this.onValidityChange(this.isValid());
        });
      }
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

  getCombinedPrompt() {
    const manual = this.getValue();
    const builderIds = [
      'builder-subject', 'builder-environment', 'builder-lighting',
      'builder-camera', 'builder-art-style', 'builder-mood', 'builder-composition'
    ];
    const parts = builderIds
      .map(id => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      })
      .filter(Boolean);

    if (manual && parts.length > 0) {
      return `${manual}, ${parts.join(', ')}`.slice(0, CONFIG.PROMPT.MAX_LENGTH);
    }
    if (parts.length > 0) {
      return parts.join(', ').slice(0, CONFIG.PROMPT.MAX_LENGTH);
    }
    return manual;
  }

  isMeaningful(text = null) {
    const val = (text !== null ? text : this.getCombinedPrompt()).trim();
    if (val.length < CONFIG.PROMPT.MIN_LENGTH || val.length > CONFIG.PROMPT.MAX_LENGTH) return false;
    if (/^(.)\1+$/i.test(val.replace(/\s+/g, ''))) return false;

    const words = val.match(/[a-zA-Z\u00C0-\u024F]{2,}/g) || [];
    const mashSet = new Set(['asdf', 'asdfg', 'qwer', 'qwert', 'qwerty', 'zxcv', 'zxcvb', 'hjkl', 'fdsa', 'rewq', 'vcxz']);

    const validWords = words.filter((w) => {
      const lower = w.toLowerCase();
      if (mashSet.has(lower)) return false;
      if (/^(.)\1+$/i.test(lower)) return false; // e.g. "aaa", "bbbb"
      if (/^(.{2})\1+$/i.test(lower)) return false; // e.g. "ababab", "hjhj"
      const hasVowel = /[aeiouy\u00C0-\u024F]/i.test(lower);
      const hasConsonant = /[bcdfghjklmnpqrstvwxz]/i.test(lower);
      return hasVowel && hasConsonant && lower.length >= 2;
    });

    return validWords.length >= 1;
  }

  getSeed() {
    const randomToggle = document.getElementById('seed-random-toggle');
    if (randomToggle && randomToggle.checked) return null;
    const seedEl = document.getElementById('seed-input');
    if (!seedEl || seedEl.value.trim() === '') return null;
    const val = Number(seedEl.value);
    if (!Number.isInteger(val) || val < 0 || val > 2147483647) return NaN;
    return val;
  }

  getSteps() {
    const el = document.getElementById('steps-input');
    const val = el ? Number(el.value) : 4;
    if (!Number.isInteger(val) || val < 1 || val > 12) return NaN;
    return val;
  }

  getGuidanceScale() {
    const el = document.getElementById('guidance-input');
    const val = el ? Number(el.value) : 0;
    if (Number.isNaN(val) || val < 0 || val > 15) return NaN;
    return val;
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
    const len = this.getCombinedPrompt().length;
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
