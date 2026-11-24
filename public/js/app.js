/**
 * ImagineAI — Production Application Orchestrator (v1.0 HD)
 * 
 * Manages full lifecycle, real-time elapsed timer, prompt enhancement,
 * aspect ratio dispatch, clipboard copying, and HD image rendering.
 */
import { CONFIG } from './config.js';
import { MockGenerationService } from './mockService.js';
import { PromptInput } from './components/PromptInput.js';
import { GenerateButton } from './components/GenerateButton.js';
import { ImagePreview } from './components/ImagePreview.js';
import { DownloadButton } from './components/DownloadButton.js';
import { AlertBanner } from './components/AlertBanner.js';

class App {
  constructor() {
    this.timerInterval = null;
    this.stepTimeout = null;
    this.sessionCreations = [];
    this.init();
    this.checkBackendHealth();
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
      getImageDataFn: () => this.preview.getCurrentImageUrl()
    });

    // 6. Bind Copy Prompt Button
    this.bindCopyPrompt();

    // 7. Bind Re-roll Button
    const rerollBtn = document.getElementById('btn-reroll');
    if (rerollBtn) {
      rerollBtn.addEventListener('click', () => this.handleGenerate());
    }

    console.log(`${CONFIG.APP_NAME} v${CONFIG.VERSION} HD Production Engine Online.`);
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
            ? '1024px Engine Active' 
            : 'HF Token Pending (.env)';
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
    const prompt = this.promptInput.getValue();
    const aspectRatio = this.promptInput.getAspectRatio();
    const style = this.promptInput.getStyle();

    // Client-side validation
    if (!this.promptInput.isValid()) {
      this.alertBanner.show(
        'Invalid Prompt',
        `Please enter a descriptive prompt between ${CONFIG.PROMPT.MIN_LENGTH} and ${CONFIG.PROMPT.MAX_LENGTH} characters.`
      );
      this.promptInput.focus();
      return;
    }

    this.alertBanner.hide();

    // Transition UI to LOADING state
    this.promptInput.setDisabled(true);
    this.generateBtn.setLoading(true);
    this.startTimer();
    this.preview.showLoadingState('Generating 1024px high-definition visual on GPU...');

    // On mobile devices, smoothly scroll viewport canvas into view
    if (window.innerWidth <= 960) {
      const viewportEl = document.getElementById('preview-card');
      if (viewportEl) {
        viewportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    try {
      let objectUrl = null;

      // Send request to production backend gateway
      const response = await fetch(CONFIG.API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          style,
          enhance: true
        })
      });

      // Handle Success (Binary Image Stream)
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);

          const modelUsed = response.headers.get('x-model-used') || 'FLUX.1-schnell';
          const width = response.headers.get('x-image-width');
          const height = response.headers.get('x-image-height');

          this.stopTimer();
          const meta = {
            aspectRatio,
            model: modelUsed,
            width,
            height
          };
          this.preview.showSuccessState(objectUrl, prompt, meta);
          this.addSessionCreation({ objectUrl, prompt, meta });
          return;
        }
      }

      // Handle Errors from Backend or Hugging Face
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { title: 'Server Error', message: `Server returned status ${response.status}` };
      }

      this.stopTimer();

      // Token not yet added fallback
      if (errorData.error === 'TOKEN_NOT_CONFIGURED' && CONFIG.ENABLE_MOCK_FALLBACK) {
        this.alertBanner.show(
          'Notice: Hugging Face Token Pending',
          'Add your free HF_TOKEN to .env to use live FLUX.1. Displaying procedural preview.'
        );
        const mockResult = await MockGenerationService.generateImage(prompt);
        this.preview.showSuccessState(mockResult.objectUrl, prompt, { aspectRatio: '1:1' });
        return;
      }

      // Cold start handling
      if (response.status === 503) {
        this.preview.showLoadingState('Cloud GPU is warming up weights. Retrying in a moment...', true);
        this.alertBanner.show(
          errorData.title || 'Model Warming Up',
          errorData.message || 'The AI model is loading into GPU memory. Please wait a moment and try again.'
        );
        return;
      }

      const errorTitle = errorData.title || 'Generation Encountered an Issue';
      const errorMessage = errorData.message || 'Unable to generate image. Please try again.';

      this.alertBanner.show(errorTitle, errorMessage);
      this.preview.showErrorState(errorTitle, errorMessage);

    } catch (err) {
      console.error('Inference request failed:', err);
      this.stopTimer();

      const errorTitle = 'Network Connection Issue';
      const errorMessage = 'Could not communicate with the local server. Please ensure the backend is running via npm start.';
      this.alertBanner.show(errorTitle, errorMessage);
      this.preview.showErrorState(errorTitle, errorMessage);

    } finally {
      this.promptInput.setDisabled(false);
      this.generateBtn.setLoading(false);
      this.generateBtn.setDisabled(!this.promptInput.isValid());
    }
  }

  addSessionCreation(item) {
    this.sessionCreations.unshift(item);
    const container = document.getElementById('session-filmstrip-container');
    const countEl = document.getElementById('session-count');
    const listEl = document.getElementById('session-filmstrip-list');

    if (container) container.style.display = 'flex';
    if (countEl) countEl.textContent = `${this.sessionCreations.length} item${this.sessionCreations.length > 1 ? 's' : ''}`;

    if (listEl) {
      listEl.innerHTML = '';
      this.sessionCreations.forEach((entry, idx) => {
        const thumb = document.createElement('div');
        thumb.className = `filmstrip-item ${idx === 0 ? 'active' : ''}`;
        thumb.title = entry.prompt;
        thumb.innerHTML = `<img src="${entry.objectUrl}" alt="${entry.prompt.slice(0, 30)}">`;
        thumb.addEventListener('click', () => {
          document.querySelectorAll('.filmstrip-item').forEach(el => el.classList.remove('active'));
          thumb.classList.add('active');
          this.preview.showSuccessState(entry.objectUrl, entry.prompt, entry.meta);
          this.promptInput.setValue(entry.prompt);
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
