/**
 * ImagineAI — Production Application Orchestrator (v1.0 HD)
 * 
 * Manages full lifecycle, real-time elapsed timer, prompt enhancement,
 * aspect ratio dispatch, clipboard copying, and HD image rendering.
 */
import { CONFIG } from './config.js';
import { MockGenerationService } from './mockService.js';
import { HistoryStore } from './historyStore.js';
import { PromptInput } from './components/PromptInput.js';
import { GenerateButton } from './components/GenerateButton.js';
import { ImagePreview } from './components/ImagePreview.js';
import { DownloadButton } from './components/DownloadButton.js';
import { AlertBanner } from './components/AlertBanner.js';
import { StudioNav } from './components/StudioNav.js';
import { ImageInfoPanel } from './components/ImageInfoPanel.js';

const EXPLORE_TEMPLATES = [
  { tag: 'Cyberpunk', style: 'cinematic', ratio: '16:9', prompt: 'A futuristic cybernetic samurai standing in neon rain in neo-Tokyo, reflections on wet asphalt, volumetric mist, 8k' },
  { tag: 'Portrait', style: 'photorealistic', ratio: '9:16', prompt: 'Close-up editorial portrait of an elder artisan in warm window light, 35mm lens, shallow depth of field' },
  { tag: 'Fantasy', style: 'digital-art', ratio: '16:9', prompt: 'Floating crystal citadel above bioluminescent waterfalls at twilight, dramatic clouds, epic fantasy concept art' },
  { tag: 'Anime', style: 'anime', ratio: '16:9', prompt: 'Breathtaking sunset over a quiet seaside train station, glowing sky, detailed clouds, Makoto Shinkai aesthetic' },
  { tag: '3D Product', style: '3d-render', ratio: '1:1', prompt: 'Luxury matte black wireless headphones floating over dark obsidian stone, studio rim lighting, Octane render' },
  { tag: 'Architecture', style: 'photorealistic', ratio: '1:1', prompt: 'Minimalist brutalist concrete villa overlooking a misty pine forest at dawn, warm interior glow, architectural photography' }
];

class App {
  constructor() {
    this.timerInterval = null;
    this.stepTimeout = null;
    this.sessionCreations = [];
    this.batchCount = 1;
    this.isGenerating = false;
    this.abortController = null;
    this.currentBlob = null;
    this.currentEntryId = null;
    this.galleryTab = 'recent';
    this.settings = this.loadSettings();
    this.init();
    this.checkBackendHealth();
    this.loadSavedHistory();
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem('imagineai_settings');
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        defaultRatio: parsed.defaultRatio || '1:1',
        autoSave: parsed.autoSave !== false
      };
    } catch (e) {
      return { defaultRatio: '1:1', autoSave: true };
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('imagineai_settings', JSON.stringify(this.settings));
    } catch (e) {}
  }

  init() {
    // 1. Initialize Alert Banner
    this.alertBanner = new AlertBanner({
      bannerId: 'alert-banner',
      titleId: 'alert-title',
      messageId: 'alert-message',
      dismissButtonId: 'btn-alert-dismiss'
    });

    // 2. Initialize Image Preview Stage
    this.preview = new ImagePreview({
      stateEmptyId: 'state-empty',
      stateLoadingId: 'state-loading',
      stateSuccessId: 'state-success',
      stateErrorId: 'state-error',
      imageElementId: 'generated-image',
      imageRenderFrameId: 'image-render-frame',
      loadingStatusId: 'loading-status-text',
      coldStartIndicatorId: 'cold-start-indicator',
      canvasErrorTitleId: 'canvas-error-title',
      canvasErrorDescId: 'canvas-error-desc',
      lightboxModalId: 'lightbox-modal',
      lightboxImgId: 'lightbox-img',
      lightboxCaptionId: 'lightbox-caption',
      onRetryClick: () => this.handleRetry()
    });

    // 3. Initialize Generate Button
    this.generateBtn = new GenerateButton({
      buttonId: 'btn-generate',
      spinnerId: 'btn-spinner',
      iconId: 'btn-icon-sparkle',
      textId: 'btn-text',
      onClick: () => this.handleGenerate()
    });

    // 4. Initialize Prompt Input & Controls
    this.promptInput = new PromptInput({
      textareaId: 'prompt-input',
      counterId: 'char-count',
      enhanceBtnId: 'btn-enhance-prompt',
      onValidityChange: (isValid) => {
        this.generateBtn.setDisabled(!isValid);
      },
      onSubmitShortcut: () => {
        this.handleGenerate();
      }
    });

    // 5. Initialize Download Button
    this.downloadBtn = new DownloadButton({
      buttonId: 'btn-download',
      getImageDataFn: () => this.preview.getCurrentImageUrl(),
      getMimeTypeFn: () => (this.currentBlob && this.currentBlob.type) || ''
    });

    // 5b. Initialize Image Info Panel & Studio Navigation
    this.infoPanel = new ImageInfoPanel({
      panelId: 'image-info-panel',
      promptId: 'info-prompt',
      modelId: 'info-model',
      dimensionsId: 'info-dimensions',
      ratioId: 'info-ratio',
      seedId: 'info-seed',
      timestampId: 'info-timestamp',
      warningBarId: 'provider-warning-bar'
    });

    this.nav = new StudioNav({
      navSelector: '.studio-nav-rail .nav-rail-item',
      viewSelector: '[data-view-panel]',
      defaultView: 'create',
      onViewChange: (view) => {
        if (view === 'home') this.updateHomeStats();
        if (view === 'creations') this.renderFullGallery('creations-grid', false);
        if (view === 'favourites') this.renderFullGallery('favourites-grid', true);
      }
    });

    // 6. Bind Copy Prompt, Copy Image, Upscale, Cancel, Batch, Favourites, Gallery Tabs, Explore & Settings
    this.bindCopyPrompt();
    this.bindCopyImage();
    this.bindUpscale();
    this.bindCancel();
    this.bindBatchSelector();
    this.bindClearHistory();
    this.bindFavoriteCurrent();
    this.bindGalleryTabs();
    this.bindHomeAndExplore();
    this.bindSettingsControls();
    this.bindCreationsSearch();
    this.bindAdvancedControls();
    this.bindPromptWarningModal();

    // 7. Bind Re-roll Button
    const rerollBtn = document.getElementById('btn-reroll');
    if (rerollBtn) {
      rerollBtn.addEventListener('click', () => this.handleGenerate());
    }

    console.log(`${CONFIG.APP_NAME} v${CONFIG.VERSION} HD Production Engine Online.`);
  }

  bindBatchSelector() {
    const pills = document.querySelectorAll('#batch-count-group .batch-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => {
          p.classList.remove('active');
          p.setAttribute('aria-checked', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-checked', 'true');
        this.batchCount = parseInt(pill.getAttribute('data-count'), 10) || 1;
      });
    });
  }

  bindCancel() {
    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (this.abortController) {
          cancelBtn.disabled = true;
          const label = cancelBtn.querySelector('span');
          if (label) label.textContent = 'Cancelling...';
          this.abortController.abort();
        }
      });
    }
  }

  bindClearHistory() {
    const clearBtn = document.getElementById('btn-clear-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        this.sessionCreations.forEach(item => {
          if (item.objectUrl && item.objectUrl.startsWith('blob:')) {
            URL.revokeObjectURL(item.objectUrl);
          }
        });
        this.sessionCreations = [];
        await HistoryStore.clear();
        this.renderFilmstrip();
      });
    }
  }

  bindCopyImage() {
    const copyImgBtn = document.getElementById('btn-copy-image');
    const copyImgText = document.getElementById('btn-copy-image-text');
    if (!copyImgBtn) return;

    copyImgBtn.addEventListener('click', async () => {
      const url = this.preview.getCurrentImageUrl();
      if (!url || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
        this.alertBanner.show('Clipboard Unavailable', 'Your browser does not support copying images directly. Use Download HD instead.');
        return;
      }
      try {
        const pngBlob = await this.imageUrlToPngBlob(url);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        if (copyImgText) copyImgText.textContent = 'Copied!';
        setTimeout(() => {
          if (copyImgText) copyImgText.textContent = 'Copy Image';
        }, 2000);
      } catch (e) {
        console.warn('Copy image failed:', e);
        this.alertBanner.show('Copy Failed', 'Could not copy image to clipboard. Try Download HD.');
      }
    });
  }

  imageUrlToPngBlob(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  upscaleCanvas2x(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = (img.naturalWidth || img.width) * 2;
        const h = (img.naturalHeight || img.height) * 2;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (blob) resolve({ blob, width: w, height: h });
          else reject(new Error('Canvas upscale failed'));
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Failed to load image for upscaling'));
      img.src = url;
    });
  }

  bindUpscale() {
    const upscaleBtn = document.getElementById('btn-upscale');
    const upscaleText = document.getElementById('btn-upscale-text');
    if (!upscaleBtn) return;

    upscaleBtn.addEventListener('click', async () => {
      const url = this.preview.getCurrentImageUrl();
      if (!url) return;

      upscaleBtn.disabled = true;
      if (upscaleText) upscaleText.textContent = 'Upscaling...';
      this.alertBanner.hide();

      try {
        let blob = this.currentBlob;
        if (!blob) {
          const resp = await fetch(url);
          blob = await resp.blob();
        }

        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        let upBlob = null;
        let modelLabel = 'Real-ESRGAN 2x HD';
        let widthVal = '2x';
        let heightVal = 'HD';

        try {
          const upRes = await fetch(CONFIG.UPSCALE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mimeType: blob.type || 'image/png' })
          });

          if (!upRes.ok) {
            throw new Error(`Remote upscaler returned ${upRes.status}`);
          }
          upBlob = await upRes.blob();
        } catch (remoteErr) {
          console.warn('Remote AI upscaler unavailable, applying local 2x HD upscale:', remoteErr.message);
          const localUp = await this.upscaleCanvas2x(url);
          upBlob = localUp.blob;
          widthVal = String(localUp.width);
          heightVal = String(localUp.height);
          modelLabel = '2x HD Upscaler (Local)';
          this.alertBanner.show('Local 2x HD Applied', `Remote AI upscaler is busy; upscaled locally to ${localUp.width} × ${localUp.height} px.`, 'success');
        }

        const upUrl = URL.createObjectURL(upBlob);
        const prompt = this.preview.getCurrentPrompt();
        const meta = {
          aspectRatio: this.promptInput.getAspectRatio(),
          model: modelLabel,
          width: widthVal,
          height: heightVal
        };
        const saved = await this.addSessionCreation({ blob: upBlob, objectUrl: upUrl, prompt, meta });
        this.openEntryInCanvas(saved);
      } catch (err) {
        this.alertBanner.show('Upscale Failed', err.message || 'Could not upscale image right now.');
      } finally {
        upscaleBtn.disabled = false;
        if (upscaleText) upscaleText.textContent = 'Upscale 2x';
      }
    });
  }

  async loadSavedHistory() {
    const saved = await HistoryStore.getAll();
    if (!saved.length) {
      this.updateHomeStats();
      return;
    }
    this.sessionCreations = saved.map(item => ({
      ...item,
      isFavorite: Boolean(item.isFavorite),
      objectUrl: item.blob ? URL.createObjectURL(item.blob) : item.objectUrl
    })).filter(item => item.objectUrl);
    this.renderFilmstrip();
    this.updateHomeStats();
  }

  bindFavoriteCurrent() {
    const favBtn = document.getElementById('btn-favorite-current');
    if (!favBtn) return;
    favBtn.addEventListener('click', async () => {
      if (!this.currentEntryId) return;
      const entry = this.sessionCreations.find(c => c.id === this.currentEntryId);
      if (!entry) return;
      entry.isFavorite = !entry.isFavorite;
      await HistoryStore.setFavorite(entry.id, entry.isFavorite);
      this.updateFavoriteButtonState(entry.isFavorite);
      this.renderFilmstrip();
      this.updateHomeStats();
    });
  }

  updateFavoriteButtonState(isFav) {
    const favBtn = document.getElementById('btn-favorite-current');
    const favText = document.getElementById('btn-favorite-text');
    if (favBtn) favBtn.classList.toggle('favorited', Boolean(isFav));
    if (favText) favText.textContent = isFav ? 'Favourited' : 'Favourite';
  }

  bindGalleryTabs() {
    const tabs = document.querySelectorAll('[data-gallery-tab]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        this.galleryTab = tab.getAttribute('data-gallery-tab') || 'recent';
        this.renderFilmstrip();
      });
    });
  }

  bindHomeAndExplore() {
    const startBtn = document.getElementById('btn-home-start');
    const exploreBtn = document.getElementById('btn-home-explore');
    if (startBtn) startBtn.addEventListener('click', () => this.nav.setView('create'));
    if (exploreBtn) exploreBtn.addEventListener('click', () => this.nav.setView('explore'));

    const exploreGrid = document.getElementById('explore-grid');
    if (exploreGrid) {
      exploreGrid.innerHTML = '';
      EXPLORE_TEMPLATES.forEach(tpl => {
        const card = document.createElement('div');
        card.className = 'explore-card';

        const body = document.createElement('div');
        body.className = 'explore-card-body';

        const tag = document.createElement('span');
        tag.className = 'explore-tag';
        tag.textContent = `${tpl.tag} • ${tpl.ratio}`;

        const p = document.createElement('p');
        p.className = 'explore-prompt-text';
        p.textContent = tpl.prompt;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-secondary-cta';
        btn.textContent = 'Use in Studio';
        btn.addEventListener('click', () => {
          this.promptInput.setValue(tpl.prompt);
          const ratioBtn = document.querySelector(`#aspect-ratio-group .pill-btn[data-ratio="${tpl.ratio}"]`);
          if (ratioBtn) ratioBtn.click();
          const styleBtn = document.querySelector(`#style-preset-group .pill-btn[data-style="${tpl.style}"]`);
          if (styleBtn) styleBtn.click();
          this.nav.setView('create');
          this.promptInput.focus();
        });

        body.appendChild(tag);
        body.appendChild(p);
        body.appendChild(btn);
        card.appendChild(body);
        exploreGrid.appendChild(card);
      });
    }
  }

  bindSettingsControls() {
    const ratioSelect = document.getElementById('setting-default-ratio');
    const autoSaveCheck = document.getElementById('setting-autosave');
    const refreshBtn = document.getElementById('btn-refresh-health');
    const clearAllBtn = document.getElementById('btn-settings-clear');

    if (ratioSelect) {
      ratioSelect.value = this.settings.defaultRatio;
      const defaultBtn = document.querySelector(`#aspect-ratio-group .pill-btn[data-ratio="${this.settings.defaultRatio}"]`);
      if (defaultBtn) defaultBtn.click();

      ratioSelect.addEventListener('change', () => {
        this.settings.defaultRatio = ratioSelect.value;
        this.saveSettings();
        const btn = document.querySelector(`#aspect-ratio-group .pill-btn[data-ratio="${ratioSelect.value}"]`);
        if (btn) btn.click();
      });
    }

    if (autoSaveCheck) {
      autoSaveCheck.checked = this.settings.autoSave;
      autoSaveCheck.addEventListener('change', () => {
        this.settings.autoSave = autoSaveCheck.checked;
        this.saveSettings();
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.checkBackendHealth());
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', async () => {
        const clearBtn = document.getElementById('btn-clear-history');
        if (clearBtn) clearBtn.click();
      });
    }
  }

  bindAdvancedControls() {
    const randomSeedToggle = document.getElementById('seed-random-toggle');
    const seedInput = document.getElementById('seed-input');
    if (randomSeedToggle && seedInput) {
      seedInput.disabled = randomSeedToggle.checked;
      randomSeedToggle.addEventListener('change', () => {
        seedInput.disabled = randomSeedToggle.checked;
        if (randomSeedToggle.checked) seedInput.value = '';
      });
    }
  }

  bindPromptWarningModal() {
    const modal = document.getElementById('prompt-warning-modal');
    const okBtn = document.getElementById('btn-prompt-modal-ok');
    const backdrop = document.getElementById('prompt-modal-backdrop');
    const closeModal = () => {
      if (modal) modal.style.display = 'none';
      this.promptInput.focus();
    };
    if (okBtn) okBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
        closeModal();
      }
    });
  }

  showPromptWarningPopup(title, message) {
    const modal = document.getElementById('prompt-warning-modal');
    const titleEl = document.getElementById('prompt-modal-title');
    const msgEl = document.getElementById('prompt-modal-message');
    if (titleEl && title) titleEl.textContent = title;
    if (msgEl && message) msgEl.textContent = message;
    if (modal) {
      modal.style.display = 'flex';
    } else {
      this.alertBanner.show(title, message);
    }
  }

  bindCreationsSearch() {
    const searchInput = document.getElementById('creations-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.renderFullGallery('creations-grid', false, searchInput.value.trim().toLowerCase());
      });
    }
  }

  updateHomeStats() {
    const totalEl = document.getElementById('home-stat-total');
    const favsEl = document.getElementById('home-stat-favs');
    if (totalEl) totalEl.textContent = String(this.sessionCreations.length);
    if (favsEl) favsEl.textContent = String(this.sessionCreations.filter(c => c.isFavorite).length);
  }

  renderFullGallery(gridId, onlyFavorites = false, query = '') {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';

    const items = this.sessionCreations.filter(item => {
      if (onlyFavorites && !item.isFavorite) return false;
      if (query && !(item.prompt || '').toLowerCase().includes(query)) return false;
      return true;
    });

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'gallery-empty-state';
      empty.textContent = onlyFavorites
        ? 'No favourite images yet. Star any creation in the studio to save it here.'
        : 'No saved creations yet. Generate your first visual in the Create studio!';
      grid.appendChild(empty);
      return;
    }

    items.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'gallery-card';

      const img = document.createElement('img');
      img.className = 'gallery-card-thumb';
      img.src = entry.objectUrl;
      img.alt = (entry.prompt || 'AI creation').slice(0, 60);
      img.addEventListener('click', () => {
        this.openEntryInCanvas(entry);
        this.nav.setView('create');
      });

      const footer = document.createElement('div');
      footer.className = 'gallery-card-footer';

      const p = document.createElement('span');
      p.className = 'gallery-card-prompt';
      p.textContent = entry.prompt || 'Untitled';
      p.title = entry.prompt || '';

      const actions = document.createElement('div');
      actions.className = 'gallery-card-actions';

      const favBtn = document.createElement('button');
      favBtn.type = 'button';
      favBtn.className = `icon-mini-btn ${entry.isFavorite ? 'active' : ''}`;
      favBtn.title = 'Toggle favourite';
      favBtn.textContent = '★';
      favBtn.addEventListener('click', async () => {
        entry.isFavorite = !entry.isFavorite;
        await HistoryStore.setFavorite(entry.id, entry.isFavorite);
        this.renderFullGallery(gridId, onlyFavorites, query);
        this.renderFilmstrip();
        this.updateHomeStats();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-mini-btn';
      delBtn.title = 'Delete';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async () => {
        await this.deleteCreationEntry(entry.id);
        this.renderFullGallery(gridId, onlyFavorites, query);
      });

      actions.appendChild(favBtn);
      actions.appendChild(delBtn);
      footer.appendChild(p);
      footer.appendChild(actions);
      card.appendChild(img);
      card.appendChild(footer);
      grid.appendChild(card);
    });
  }

  openEntryInCanvas(entry) {
    const batchGrid = document.getElementById('batch-results-grid');
    if (batchGrid) {
      batchGrid.innerHTML = '';
      batchGrid.style.display = 'none';
    }
    this.currentBlob = entry.blob || null;
    this.currentEntryId = entry.id;
    this.updateFavoriteButtonState(entry.isFavorite);
    this.preview.showSuccessState(entry.objectUrl, entry.prompt, entry.meta || {});
    this.infoPanel.update({
      prompt: entry.prompt,
      model: entry.meta?.model,
      width: entry.meta?.width,
      height: entry.meta?.height,
      aspectRatio: entry.meta?.aspectRatio || '1:1',
      seed: entry.meta?.seed,
      reproducibility: entry.meta?.reproducibility,
      warnings: entry.meta?.warnings,
      createdAt: entry.createdAt
    });
    if (entry.prompt && this.promptInput.getValue() !== entry.prompt) {
      this.promptInput.setValue(entry.prompt);
    }
  }

  async deleteCreationEntry(id) {
    const target = this.sessionCreations.find(c => c.id === id);
    if (target && target.objectUrl && target.objectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(target.objectUrl);
    }
    this.sessionCreations = this.sessionCreations.filter(c => c.id !== id);
    if (this.currentEntryId === id) {
      this.currentEntryId = null;
      this.updateFavoriteButtonState(false);
    }
    await HistoryStore.remove(id);
    this.renderFilmstrip();
    this.updateHomeStats();
  }

  bindCopyPrompt() {
    const copyBtn = document.getElementById('btn-copy-prompt');
    const copyText = document.getElementById('btn-copy-text');

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const prompt = this.preview.getCurrentPrompt();
        if (prompt && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(prompt);
            if (copyText) copyText.textContent = 'Copied!';
            setTimeout(() => {
              if (copyText) copyText.textContent = 'Copy Prompt';
            }, 2000);
          } catch (e) {
            console.warn('Clipboard write failed:', e);
          }
        }
      });
    }
  }

  async checkBackendHealth() {
    try {
      const res = await fetch(CONFIG.HEALTH_ENDPOINT);
      if (res.ok) {
        const data = await res.json();
        const statusText = document.querySelector('.status-text');
        if (statusText) {
          statusText.textContent = data.tokenConfigured
            ? 'Unlimited Engine Active'
            : 'Unlimited Gateway Active';
        }
        const settingsInfo = document.getElementById('settings-engine-info');
        if (settingsInfo) {
          settingsInfo.textContent = `${data.engine} • ${data.tokenCount || 0} HF token(s) configured`;
        }
      }
    } catch (e) {
      // Offline mode
    }
  }

  startTimer() {
    const timerEl = document.getElementById('generation-timer');
    if (!timerEl) return;

    timerEl.style.display = 'inline-block';
    const startTime = Date.now();
    timerEl.textContent = '⏱️ 0.0s';

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      timerEl.textContent = `⏱️ ${elapsed}s`;
    }, 100);
  }

  stopTimer() {
    clearInterval(this.timerInterval);
  }

  async handleGenerate() {
    if (this.isGenerating) return;

    const prompt = this.promptInput.getCombinedPrompt();
    const negativeInput = document.getElementById('negative-prompt-input');
    const negativePrompt = negativeInput ? negativeInput.value.trim() : '';
    const aspectRatio = this.promptInput.getAspectRatio();
    const style = this.promptInput.getStyle();
    const enhance = false;
    const seed = this.promptInput.getSeed();
    const steps = this.promptInput.getSteps();
    const guidanceScale = this.promptInput.getGuidanceScale();
    const count = this.batchCount || 1;

    // Client-side validation
    if (!this.promptInput.isValid()) {
      this.alertBanner.show(
        'Invalid Prompt',
        `Please enter a prompt or builder fields between ${CONFIG.PROMPT.MIN_LENGTH} and ${CONFIG.PROMPT.MAX_LENGTH} characters.`
      );
      this.promptInput.focus();
      return;
    }

    if (!this.promptInput.isMeaningful(prompt)) {
      this.showPromptWarningPopup(
        'Please Enter a Meaningful Prompt',
        'Please enter a descriptive visual prompt using real words (for example: "A sunset over mountains"), not just numbers or symbols like "1,2,3,45".'
      );
      return;
    }

    if (Number.isNaN(seed)) {
      this.alertBanner.show('Invalid Seed', 'Manual seed must be an integer between 0 and 2147483647.');
      return;
    }
    if (Number.isNaN(steps)) {
      this.alertBanner.show('Invalid Steps', 'Inference steps must be an integer between 1 and 12.');
      return;
    }
    if (Number.isNaN(guidanceScale)) {
      this.alertBanner.show('Invalid Guidance', 'Guidance scale must be a number between 0 and 15.');
      return;
    }

    this.isGenerating = true;
    this.alertBanner.hide();
    this.abortController = new AbortController();
    const cancelBtn = document.getElementById('btn-cancel');
    const batchGrid = document.getElementById('batch-results-grid');
    if (batchGrid) {
      batchGrid.innerHTML = '';
      batchGrid.style.display = 'none';
    }

    // Stage 1: Preparing
    this.promptInput.setDisabled(true);
    this.generateBtn.setLoading(true);
    if (cancelBtn) {
      cancelBtn.disabled = false;
      const label = cancelBtn.querySelector('span');
      if (label) label.textContent = 'Cancel';
      cancelBtn.style.display = 'inline-flex';
    }
    this.startTimer();
    this.preview.showLoadingState(
      count > 1
        ? `Preparing ${count} variation requests...`
        : 'Preparing generation request...'
    );

    if (window.innerWidth <= 960) {
      const viewportEl = document.getElementById('preview-card');
      if (viewportEl) {
        viewportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    let stageTimer1 = null;
    let stageTimer2 = null;

    try {
      // Stage 2: Submitting
      this.preview.setStage('submitting');
      this.preview.showLoadingState(
        count > 1
          ? `Submitting ${count} variations to AI inference gateway...`
          : 'Submitting request to AI inference gateway...'
      );
      this.preview.setStage('submitting');

      stageTimer1 = setTimeout(() => {
        if (this.isGenerating) {
          this.preview.setStage('waiting');
          const statusEl = document.getElementById('loading-status-text');
          if (statusEl) statusEl.textContent = 'Waiting for GPU worker allocation...';
        }
      }, 900);

      stageTimer2 = setTimeout(() => {
        if (this.isGenerating) {
          this.preview.setStage('generating');
          const statusEl = document.getElementById('loading-status-text');
          if (statusEl) statusEl.textContent = 'Generating visual output...';
        }
      }, 2800);

      const tasks = Array.from({ length: count }, () =>
        fetch(CONFIG.API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: this.abortController.signal,
          body: JSON.stringify({
            prompt,
            negativePrompt,
            aspectRatio,
            style,
            batchCount: count,
            enhance,
            seed,
            steps,
            guidanceScale
          })
        })
      );

      const settled = await Promise.allSettled(tasks);
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);

      // If user aborted all requests
      const aborted = settled.some(s => s.status === 'rejected' && s.reason && s.reason.name === 'AbortError');
      if (aborted) {
        const abortErr = new Error('Cancelled');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      const results = [];
      let failedCount = 0;
      let lastErrorResponse = null;

      for (const outcome of settled) {
        if (outcome.status !== 'fulfilled') {
          failedCount++;
          continue;
        }
        const response = outcome.value;
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.startsWith('image/')) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const warningsRaw = response.headers.get('x-warnings');
          const warnings = warningsRaw ? decodeURIComponent(warningsRaw).split(' | ').filter(Boolean) : [];
          const enhancedHeader = response.headers.get('x-enhanced-prompt');
          const enhancedPrompt = enhancedHeader ? decodeURIComponent(enhancedHeader) : '';
          const meta = {
            aspectRatio,
            model: response.headers.get('x-model-used') || 'FLUX.1-schnell',
            width: response.headers.get('x-image-width'),
            height: response.headers.get('x-image-height'),
            seed: response.headers.get('x-seed-used'),
            reproducibility: response.headers.get('x-reproducibility') || 'approximate',
            warnings,
            enhancedPrompt
          };
          results.push({ blob, objectUrl, prompt, meta });
        } else {
          failedCount++;
          lastErrorResponse = response;
        }
      }

      if (results.length > 0) {
        this.stopTimer();
        const savedEntries = [];
        for (const item of results) {
          savedEntries.push(await this.addSessionCreation(item));
        }

        const firstEntry = savedEntries[0];
        this.openEntryInCanvas(firstEntry);

        if (failedCount > 0) {
          this.alertBanner.show(
            'Partial Batch Completed',
            `Generated ${results.length} of ${count} variations (${failedCount} failed due to provider load).`
          );
        }

        if (savedEntries.length > 1 && batchGrid) {
          batchGrid.style.display = 'flex';
          savedEntries.forEach((entry, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `batch-thumb-card ${idx === 0 ? 'active' : ''}`;
            const img = document.createElement('img');
            img.src = entry.objectUrl;
            img.alt = `Variation ${idx + 1}`;
            btn.appendChild(img);
            btn.addEventListener('click', () => {
              batchGrid.querySelectorAll('.batch-thumb-card').forEach(el => el.classList.remove('active'));
              btn.classList.add('active');
              this.currentBlob = entry.blob;
              this.currentEntryId = entry.id;
              this.updateFavoriteButtonState(entry.isFavorite);
              this.preview.showSuccessState(entry.objectUrl, prompt, entry.meta);
              this.infoPanel.update({
                prompt: entry.prompt,
                model: entry.meta?.model,
                width: entry.meta?.width,
                height: entry.meta?.height,
                aspectRatio: entry.meta?.aspectRatio || '1:1',
                seed: entry.meta?.seed,
                reproducibility: entry.meta?.reproducibility,
                warnings: entry.meta?.warnings,
                createdAt: entry.createdAt
              });
            });
            batchGrid.appendChild(btn);
          });
        }
        return;
      }

      const response = lastErrorResponse;
      let errorData = {};
      if (response) {
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { title: 'Server Error', message: `Server returned status ${response.status}` };
        }
      } else {
        errorData = { title: 'Generation Failed', message: 'Network or provider error occurred.' };
      }

      this.stopTimer();

      if (errorData.error === 'TOKEN_NOT_CONFIGURED' && CONFIG.ENABLE_MOCK_FALLBACK) {
        this.alertBanner.show(
          'Notice: Hugging Face Token Pending',
          'Add your free HF_TOKEN to .env to use live FLUX.1. Displaying procedural preview.'
        );
        const mockResult = await MockGenerationService.generateImage(prompt);
        this.preview.showSuccessState(mockResult.objectUrl, prompt, { aspectRatio: '1:1' });
        return;
      }

      if (response && response.status === 503) {
        const title = errorData.title || 'Model Warming Up';
        const message = errorData.message || 'The AI model is loading into GPU memory. Please wait a moment and try again.';
        this.alertBanner.show(title, message);
        this.preview.showErrorState(title, message);
        return;
      }

      const errorTitle = errorData.title || 'Generation Encountered an Issue';
      const errorMessage = errorData.message || 'Unable to generate image. Please try again.';

      this.alertBanner.show(errorTitle, errorMessage);
      this.preview.showErrorState(errorTitle, errorMessage);

    } catch (err) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      this.stopTimer();
      if (err.name === 'AbortError') {
        this.preview.showEmptyState();
        this.alertBanner.show('Generation Cancelled', 'Image generation was cancelled.', 'info');
        return;
      }
      console.error('Inference request failed:', err);

      const errorTitle = 'Network Connection Issue';
      const errorMessage = 'Could not communicate with the local server. Please ensure the backend is running via npm start.';
      this.alertBanner.show(errorTitle, errorMessage);
      this.preview.showErrorState(errorTitle, errorMessage);

    } finally {
      this.isGenerating = false;
      this.abortController = null;
      if (cancelBtn) {
        cancelBtn.style.display = 'none';
        cancelBtn.disabled = false;
        const label = cancelBtn.querySelector('span');
        if (label) label.textContent = 'Cancel';
      }
      this.promptInput.setDisabled(false);
      this.generateBtn.setLoading(false);
      this.generateBtn.setDisabled(!this.promptInput.isValid());
    }
  }

  async addSessionCreation(item) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      blob: item.blob,
      objectUrl: item.objectUrl,
      prompt: item.prompt,
      meta: item.meta,
      isFavorite: false,
      createdAt: Date.now()
    };
    this.sessionCreations.unshift(entry);
    if (item.blob && this.settings.autoSave) {
      await HistoryStore.save({
        id: entry.id,
        blob: entry.blob,
        prompt: entry.prompt,
        meta: entry.meta,
        isFavorite: entry.isFavorite,
        createdAt: entry.createdAt
      });
    }
    this.renderFilmstrip();
    this.updateHomeStats();
    return entry;
  }

  renderFilmstrip() {
    const container = document.getElementById('session-filmstrip-container');
    const countEl = document.getElementById('session-count');
    const listEl = document.getElementById('session-filmstrip-list');

    if (!this.sessionCreations.length) {
      if (container) container.style.display = 'none';
      if (listEl) listEl.innerHTML = '';
      return;
    }

    const visibleItems = this.galleryTab === 'favourites'
      ? this.sessionCreations.filter(c => c.isFavorite)
      : this.sessionCreations;

    if (container) container.style.display = 'flex';
    if (countEl) countEl.textContent = `${visibleItems.length} item${visibleItems.length === 1 ? '' : 's'}`;

    if (listEl) {
      listEl.innerHTML = '';
      visibleItems.forEach((entry) => {
        const thumb = document.createElement('div');
        thumb.className = `filmstrip-item ${entry.id === this.currentEntryId ? 'active' : ''}`;
        thumb.title = entry.prompt;

        const img = document.createElement('img');
        img.src = entry.objectUrl;
        img.alt = (entry.prompt || 'AI creation').slice(0, 30);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'filmstrip-delete-btn';
        delBtn.title = 'Delete';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.deleteCreationEntry(entry.id);
        });

        thumb.appendChild(img);
        if (entry.isFavorite) {
          const favBadge = document.createElement('span');
          favBadge.className = 'filmstrip-fav-badge';
          favBadge.textContent = '★';
          favBadge.title = 'Favourited';
          thumb.appendChild(favBadge);
        }
        thumb.appendChild(delBtn);
        thumb.addEventListener('click', () => {
          this.openEntryInCanvas(entry);
          this.renderFilmstrip();
        });
        listEl.appendChild(thumb);
      });
    }
  }

  handleRetry() {
    this.alertBanner.hide();
    this.preview.showEmptyState();
    this.promptInput.focus();
  }
}

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
